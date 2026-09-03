import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import * as XLSX from 'xlsx';

import { ProjectService } from '../../services/project.service';
import { PucAccountPickerComponent } from '../../../../shared/components/puc-account-picker/puc-account-picker.component';
import { RubroPickerComponent, RubroPickerGroup } from '../../../../shared/components/rubro-picker/rubro-picker.component';
import { PUCAccount } from '../../../../../core/puc-accounts/models/puc-account.model';
import { CostCenterService } from '../../../../../core/cost-centers/services/cost-center.service';
import { CostCenter } from '../../../../../core/cost-centers/models/cost-center.model';
import { buildRubroPickerGroups, RubroPickerRubroInfo } from '../../utils/rubro-picker-groups';
import { BudgetEntry, BudgetItem, BulkExecutionRowRequest, BulkExecutionRowResult } from '../../models/project.model';

/** Orden EXACTO esperado del Excel de auxiliares contables — "Cuenta" aparece dos veces (la
 * primera es la cuenta PUC detallada, la segunda es el código de mayor) y esa repetición es
 * justo por lo que la validación compara posición por posición, no como un conjunto de nombres. */
const EXPECTED_HEADERS = [
  'Cuenta', 'Tercero', 'Fecha', 'Nota', 'Cheque', 'Doc Num', 'Debitos', 'Creditos',
  'Saldo', 'Centro de Costos', 'Mvto', 'Cuenta', 'Mayor', 'Mes',
];
const HEADER_SCAN_ROWS = 10;

function normalizeHeaderCell(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // quita tildes para comparar sin ser frágil
}

const EXPECTED_HEADERS_NORMALIZED = EXPECTED_HEADERS.map(normalizeHeaderCell);

interface ParsedRow {
  rowNumber: number;           // fila real del Excel (1-based, contando el header)
  selected: boolean;
  budgetItemId: string | null;
  pucAccountId: string | null;
  pucNeedsReview: boolean;     // sin match o match ambiguo — el usuario debe corregirlo a mano
  value: number;
  date: string | null;         // ISO yyyy-mm-dd
  tercero: string;
  nota: string;
  docNum: string;
  cheque: string;
  mvto: string;
  saldo: number | null;
  sourceAccountCode: string;
  sourceAccountName: string;
  sourceMayorCode: string;
  sourceCostCenterRaw: string;
  sourceMes: string;
  submitError?: string;        // motivo devuelto por el backend, si esta fila falló al importar
}

@Component({
  selector: 'app-egresos-import',
  standalone: true,
  imports: [CommonModule, FormsModule, PucAccountPickerComponent, RubroPickerComponent],
  templateUrl: './egresos-import.component.html',
})
export class EgresosImportComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private costCenterSvc = inject(CostCenterService);

  constructor(private svc: ProjectService) {}

  projectId = '';

  loadingProject = signal(true);
  loadError = signal<string | null>(null);
  projectCostCenterCode = signal<string | null>(null);
  pucAccounts = signal<PUCAccount[]>([]);
  costCenters = signal<CostCenter[]>([]);
  rubroInfos = signal<RubroPickerRubroInfo[]>([]);
  executionsMonthlySummary = signal<Record<string, Record<string, number>>>({});

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/projects']); return; }
    this.load();
  }

  goBack(): void {
    this.router.navigate(['/projects', this.projectId, 'egresos']);
  }

  private load(): void {
    this.loadingProject.set(true);
    this.loadError.set(null);

    this.svc.listPUCAccounts().subscribe({ next: items => this.pucAccounts.set(items ?? []), error: () => {} });
    this.svc.getExecutionsMonthlySummary(this.projectId).subscribe({
      next: s => this.executionsMonthlySummary.set(s ?? {}), error: () => {},
    });
    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: w => {
        const infos: RubroPickerRubroInfo[] = (w.components ?? []).flatMap(comp =>
          (comp.budget_entries ?? []).flatMap((entry: BudgetEntry) =>
            (entry.items ?? []).map((item: BudgetItem) => ({
              id: item.id,
              concept: item.concept ?? '',
              technicalComponentName: comp.name ?? 'Sin componente técnico',
              monthlyDistributions: item.monthly_distributions ?? [],
            } as RubroPickerRubroInfo))
          )
        );
        this.rubroInfos.set(infos);
      },
      error: () => this.rubroInfos.set([]),
    });
    this.costCenterSvc.list().subscribe({ next: items => this.costCenters.set(items ?? []), error: () => {} });

    this.svc.getProjectDetails(this.projectId).subscribe({
      next: details => {
        const cc = this.costCenters().find(c => c.id === details.cost_center_id)
          ?? null;
        // costCenters puede no haber llegado todavía — se resuelve otra vez cuando llegue
        this.projectCostCenterCode.set(cc?.code ?? null);
        if (!cc) {
          this.costCenterSvc.list().subscribe({
            next: items => {
              this.costCenters.set(items ?? []);
              const match = (items ?? []).find(c => c.id === details.cost_center_id);
              this.projectCostCenterCode.set(match?.code ?? null);
            },
            error: () => {},
          });
        }
        this.loadingProject.set(false);
      },
      error: () => { this.loadError.set('No se pudo cargar la información del proyecto.'); this.loadingProject.set(false); },
    });
  }

  // ── Paso 1: selección de archivo + validación de orden de columnas ────────────

  fileError = signal<string | null>(null);
  fileName = signal<string | null>(null);
  parsing = signal(false);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.fileError.set(null);
    this.parsedRows.set([]);
    this.skippedByCostCenter.set(0);
    this.fileName.set(file.name);
    this.parsing.set(true);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result as ArrayBuffer, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const headerRowIndex = this.findHeaderRow(allRows);
        if (headerRowIndex === -1) {
          this.fileError.set(
            'El archivo no tiene las columnas esperadas en el orden correcto (Cuenta, Tercero, Fecha, Nota, ' +
            'Cheque, Doc Num, Debitos, Creditos, Saldo, Centro de Costos, Mvto, Cuenta, Mayor, Mes). ' +
            'Verifica que no se hayan movido ni renombrado columnas antes de continuar.'
          );
          this.parsing.set(false);
          return;
        }

        const dataRows = allRows.slice(headerRowIndex + 1);
        const { rows, skipped } = this.parseDataRows(dataRows, headerRowIndex);
        this.parsedRows.set(rows);
        this.skippedByCostCenter.set(skipped);
        if (rows.length === 0) {
          this.fileError.set(
            skipped > 0
              ? 'Ninguna fila del archivo corresponde al centro de costos de este proyecto.'
              : 'No se encontraron filas de datos en el archivo.'
          );
        }
      } catch {
        this.fileError.set('No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx).');
      } finally {
        this.parsing.set(false);
      }
    };
    reader.onerror = () => {
      this.fileError.set('No se pudo leer el archivo.');
      this.parsing.set(false);
    };
    reader.readAsArrayBuffer(file);
  }

  /** Busca, entre las primeras filas del archivo, la que calce EXACTAMENTE (posición por
   * posición, no como conjunto) con EXPECTED_HEADERS — devuelve su índice o -1 si ninguna calza. */
  private findHeaderRow(rows: unknown[][]): number {
    const limit = Math.min(HEADER_SCAN_ROWS, rows.length);
    for (let i = 0; i < limit; i++) {
      const row = rows[i] ?? [];
      if (row.length < EXPECTED_HEADERS_NORMALIZED.length) continue;
      const matches = EXPECTED_HEADERS_NORMALIZED.every((expected, col) => normalizeHeaderCell(row[col]) === expected);
      if (matches) return i;
    }
    return -1;
  }

  private parseColombianNumber(v: unknown): number {
    const s = String(v ?? '').trim();
    if (!s) return 0;
    // formato colombiano: punto = miles, coma = decimales
    const normalized = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }

  private parseDate(v: unknown): string | null {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }
    const s = String(v ?? '').trim();
    if (!s) return null;
    // "DD/MM/YYYY" o "DD-MM-YYYY"
    const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
  }

  private matchesProjectCostCenter(cell: string): boolean {
    const code = this.projectCostCenterCode();
    if (!code) return false;
    const numbers: string[] = cell.match(/\d+/g) ?? [];
    return numbers.includes(code);
  }

  private matchPucAccount(sourceCode: string): { id: string | null; needsReview: boolean } {
    if (!sourceCode) return { id: null, needsReview: true };
    const matches = this.pucAccounts().filter(a => a.code === sourceCode);
    if (matches.length === 1) return { id: matches[0].id, needsReview: false };
    return { id: null, needsReview: true };
  }

  private parseDataRows(rows: unknown[][], headerRowIndex: number): { rows: ParsedRow[]; skipped: number } {
    const out: ParsedRow[] = [];
    let skipped = 0;

    rows.forEach((row, idx) => {
      const cell = (i: number) => String(row[i] ?? '').trim();
      if (row.every(c => String(c ?? '').trim() === '')) return; // fila totalmente vacía

      const costCenterRaw = cell(9);
      if (!this.matchesProjectCostCenter(costCenterRaw)) { skipped++; return; }

      const cuentaCell = cell(0);
      const accountMatch = cuentaCell.match(/^(\d+)\s*(.*)$/);
      const sourceAccountCode = accountMatch ? accountMatch[1] : '';
      const sourceAccountName = accountMatch ? accountMatch[2].trim() : cuentaCell;
      const { id: pucAccountId, needsReview: pucNeedsReview } = this.matchPucAccount(sourceAccountCode);

      const debitos = this.parseColombianNumber(row[6]);
      const creditos = this.parseColombianNumber(row[7]);
      const value = debitos !== 0 ? debitos : (creditos !== 0 ? -creditos : 0);

      const saldoRaw = cell(8);
      const saldo = saldoRaw ? this.parseColombianNumber(row[8]) : null;

      out.push({
        rowNumber: headerRowIndex + idx + 2, // +1 por el header, +1 porque Excel es 1-based
        selected: false,
        budgetItemId: null,
        pucAccountId,
        pucNeedsReview,
        value,
        date: this.parseDate(row[2]),
        tercero: cell(1),
        nota: cell(3),
        docNum: cell(5),
        cheque: cell(4),
        mvto: cell(10),
        saldo,
        sourceAccountCode,
        sourceAccountName,
        sourceMayorCode: cell(11) || cell(12),
        sourceCostCenterRaw: costCenterRaw,
        sourceMes: cell(13),
      });
    });

    return { rows: out, skipped };
  }

  // ── Paso 2: vista previa editable ──────────────────────────────────────────

  parsedRows = signal<ParsedRow[]>([]);
  skippedByCostCenter = signal(0);

  allSelected = computed(() => this.parsedRows().length > 0 && this.parsedRows().every(r => r.selected));
  someSelected = computed(() => this.parsedRows().some(r => r.selected));

  toggleSelectAll(): void {
    const next = !this.allSelected();
    this.parsedRows.update(rows => rows.map(r => ({ ...r, selected: next })));
  }

  toggleRowSelected(row: ParsedRow): void {
    this.parsedRows.update(rows => rows.map(r => r === row ? { ...r, selected: !r.selected } : r));
  }

  rowsNeedingReview = computed(() => this.parsedRows().filter(r => r.pucNeedsReview || !r.budgetItemId));

  canImport = computed(() => this.parsedRows().length > 0 && this.rowsNeedingReview().length === 0 && !this.importing());

  // ── Selector de cuenta PUC por fila ─────────────────────────────────────────

  pucPickerOpen = signal(false);
  private pucPickerRowIndex: number | null = null;

  openPucPickerForRow(index: number): void {
    this.pucPickerRowIndex = index;
    this.pucPickerOpen.set(true);
  }

  onPucPicked(account: PUCAccount): void {
    const idx = this.pucPickerRowIndex;
    this.pucPickerOpen.set(false);
    if (idx === null) return;
    this.parsedRows.update(rows => rows.map((r, i) =>
      i === idx ? { ...r, pucAccountId: account.id, pucNeedsReview: false, sourceAccountCode: account.code } : r
    ));
  }

  // ── Selector de rubro, por fila individual o aplicado a la selección ───────

  rubroPickerOpen = signal(false);
  rubroPickerBulkMode = signal(false);
  private rubroPickerRowIndex: number | null = null;

  private rubroGroupsForDate(dateIso: string | null): RubroPickerGroup[] {
    const monthKey = dateIso ? dateIso.slice(0, 7) : null;
    return buildRubroPickerGroups(this.rubroInfos(), this.executionsMonthlySummary(), monthKey);
  }

  activeRubroPickerGroups = signal<RubroPickerGroup[]>([]);
  activeRubroPickerMonthLabel = signal<string | null>(null);

  openRubroPickerForRow(index: number): void {
    this.rubroPickerRowIndex = index;
    this.rubroPickerBulkMode.set(false);
    const row = this.parsedRows()[index];
    this.activeRubroPickerGroups.set(this.rubroGroupsForDate(row?.date ?? null));
    this.activeRubroPickerMonthLabel.set(row?.date ? row.date.slice(0, 7) : null);
    this.rubroPickerOpen.set(true);
  }

  openRubroPickerForSelection(): void {
    this.rubroPickerBulkMode.set(true);
    this.activeRubroPickerGroups.set(this.rubroGroupsForDate(null));
    this.activeRubroPickerMonthLabel.set(null);
    this.rubroPickerOpen.set(true);
  }

  onRubroPicked(budgetItemId: string): void {
    this.rubroPickerOpen.set(false);
    if (this.rubroPickerBulkMode()) {
      this.parsedRows.update(rows => rows.map(r => r.selected ? { ...r, budgetItemId } : r));
      return;
    }
    const idx = this.rubroPickerRowIndex;
    if (idx === null) return;
    this.parsedRows.update(rows => rows.map((r, i) => i === idx ? { ...r, budgetItemId } : r));
  }

  rubroLabel(budgetItemId: string | null): string {
    if (!budgetItemId) return 'Sin asignar';
    return this.rubroInfos().find(r => r.id === budgetItemId)?.concept ?? 'Rubro desconocido';
  }

  // ── Paso 3: envío ────────────────────────────────────────────────────────

  importing = signal(false);
  importResultCommitted = signal<boolean | null>(null);
  importedCount = signal(0);

  submit(): void {
    if (!this.canImport()) return;
    this.importing.set(true);
    this.importResultCommitted.set(null);

    const rowsToSend = this.parsedRows();
    const payload: BulkExecutionRowRequest[] = rowsToSend.map(r => ({
      row_number: r.rowNumber,
      budget_item_id: r.budgetItemId!,
      value: r.value,
      date: r.date ?? '',
      description: r.nota || null,
      puc_account_id: r.pucAccountId,
      provider: r.tercero || null,
      invoice_number: null,
      cheque: r.cheque || null,
      doc_num: r.docNum || null,
      mvto: r.mvto || null,
      saldo: r.saldo,
      source_account_code: r.sourceAccountCode || null,
      source_account_name: r.sourceAccountName || null,
      source_mayor_code: r.sourceMayorCode || null,
      source_cost_center_raw: r.sourceCostCenterRaw || null,
      source_mes: r.sourceMes || null,
      source_tercero_raw: r.tercero || null,
      source_nota: r.nota || null,
    }));

    this.svc.bulkImportExecutions(this.projectId, payload).subscribe({
      next: result => {
        this.importing.set(false);
        this.importResultCommitted.set(result.committed);
        this.importedCount.set(result.inserted);
        if (result.committed) {
          this.parsedRows.set([]);
        } else {
          this.applyRowErrors(result.rows);
        }
      },
      error: err => {
        this.importing.set(false);
        this.importResultCommitted.set(false);
        this.submitGeneralError.set(err?.error?.message ?? err?.error?.error ?? 'Error al importar los auxiliares.');
      },
    });
  }

  submitGeneralError = signal<string | null>(null);

  private applyRowErrors(results: BulkExecutionRowResult[]): void {
    const byRowNumber = new Map(results.filter(r => !r.success).map(r => [r.row_number, r.error]));
    this.parsedRows.update(rows => rows.map(r => ({ ...r, submitError: byRowNumber.get(r.rowNumber) })));
  }

  downloadErrorReport(): void {
    const failed = this.parsedRows().filter(r => r.submitError);
    if (failed.length === 0) return;
    const data = failed.map(r => ({
      Fila: r.rowNumber,
      Tercero: r.tercero,
      Fecha: r.date ?? '',
      Valor: r.value,
      Motivo: r.submitError,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errores');
    XLSX.writeFile(wb, `errores-importacion-egresos-${this.projectId}.xlsx`);
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }

  trackByRow(_: number, r: ParsedRow) { return r.rowNumber; }
}
