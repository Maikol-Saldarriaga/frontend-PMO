import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ProjectService } from '../../services/project.service';
import { CostCenterService } from '../../../../../core/cost-centers/services/cost-center.service';
import { BulkExecutionRowRequest, BulkExecutionImportResult } from '../../models/project.model';

/** Mismo orden de columnas que importar-auxiliares de un solo proyecto (ver
 * egresos-import.component.ts) — "Cuenta" aparece dos veces (detallada y de mayor). */
const EXPECTED_HEADERS = [
  'Cuenta', 'Tercero', 'Fecha', 'Nota', 'Cheque', 'Doc Num', 'Debitos', 'Creditos',
  'Saldo', 'Centro de Costos', 'Mvto', 'Cuenta', 'Mayor', 'Mes',
];
const HEADER_SCAN_ROWS = 10;

function normalizeHeaderCell(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const EXPECTED_HEADERS_NORMALIZED = EXPECTED_HEADERS.map(normalizeHeaderCell);

const LOADING_MESSAGES = [
  'Carga inteligente…',
  'Detectando cuentas contables…',
  'Cruzando centros de costo con proyectos…',
  'Separando código y nombre de cuenta…',
  'Agrupando filas por proyecto…',
];

interface ProjectOption {
  id: string;
  label: string;
  costCenterCode: string | null;
}

interface ParsedMultiRow {
  rowNumber: number;
  value: number;
  date: string | null;
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
  /** Proyecto resuelto automáticamente por centro de costos — null si ninguno matcheó. */
  matchedProjectId: string | null;
  /** Proyecto elegido a mano por el usuario para una fila que quedó en "Ignorados" — cuando
   * está seteado, gana sobre matchedProjectId. */
  manualProjectId: string | null;
  submitError?: string;
}

interface ProjectGroupResult {
  projectId: string;
  projectLabel: string;
  rowCount: number;
  totalValue: number;
  committed: boolean | null; // null = todavía no se envió
  inserted: number;
  submitting: boolean;
}

@Component({
  selector: 'app-egresos-import-multi',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './egresos-import-multi.component.html',
})
export class EgresosImportMultiComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private costCenterSvc = inject(CostCenterService);

  constructor(private svc: ProjectService) {}

  goBack(): void { this.router.navigate(['/projects']); }

  // ── Carga de proyectos + sus centros de costo ───────────────────────────────

  loadingProjects = signal(true);
  loadError = signal<string | null>(null);
  projects = signal<ProjectOption[]>([]);

  ngOnInit(): void {
    this.loadingProjects.set(true);
    this.costCenterSvc.listAll().subscribe({
      next: costCenters => {
        const codeById = new Map(costCenters.map(c => [c.id, c.code]));
        this.fetchAllProjectPages(codeById, 0, []);
      },
      error: () => { this.loadError.set('No se pudieron cargar los centros de costo.'); this.loadingProjects.set(false); },
    });
  }

  /** Recorre todas las páginas de /projects — no hay endpoint "listAll" de proyectos, así que
   * se pagina a mano con un tope de 50 páginas (5000 proyectos) para no colgarse ante un bug. */
  private fetchAllProjectPages(codeById: Map<string, string>, cursor: string | number, acc: ProjectOption[], pagesLeft = 50): void {
    if (pagesLeft <= 0) {
      this.projects.set(acc);
      this.loadingProjects.set(false);
      return;
    }
    this.svc.getProjects(100, cursor).subscribe({
      next: page => {
        const mapped = (page.data ?? [])
          .filter(p => p.status !== 'Cancelled')
          .map(p => ({
            id: p.id,
            label: `${p.project_number}${p.project_name ? ' — ' + p.project_name : ''}`,
            costCenterCode: p.cost_center_id ? (codeById.get(p.cost_center_id) ?? null) : null,
          }));
        const next = [...acc, ...mapped];
        if (page.next_cursor) {
          this.fetchAllProjectPages(codeById, page.next_cursor, next, pagesLeft - 1);
        } else {
          this.projects.set(next);
          this.loadingProjects.set(false);
        }
      },
      error: () => { this.loadError.set('No se pudo cargar la lista de proyectos.'); this.loadingProjects.set(false); },
    });
  }

  /** Proyectos con centro de costos configurado — solo estos participan del matcheo automático;
   * el resto nunca puede matchear y tampoco tiene sentido ofrecerlos en la corrección manual.
   * Ordenados por código más largo primero: como el matcheo es por substring (ver
   * matchProjectForCostCenter), un código corto no debe "ganarle" a uno más largo y específico
   * que también aparece en la celda. */
  matchableProjects = computed(() =>
    this.projects().filter(p => !!p.costCenterCode)
      .sort((a, b) => (b.costCenterCode?.length ?? 0) - (a.costCenterCode?.length ?? 0))
  );

  /** Busca el código del centro de costos DENTRO del texto crudo de la celda (substring), no por
   * igualdad exacta de un token numérico separado — la celda suele traer el código pegado a un
   * nombre/descripción ("045 OBRA X"), y exigir que el código aparezca como número aislado
   * fallaba apenas el formato no calzaba exacto (ceros a la izquierda, separadores, etc). */
  private matchProjectForCostCenter(cell: string): ProjectOption | null {
    const raw = cell.trim();
    if (!raw) return null;
    return this.matchableProjects().find(p => p.costCenterCode && raw.includes(p.costCenterCode)) ?? null;
  }

  projectLabel(id: string | null): string {
    if (!id) return '—';
    return this.projects().find(p => p.id === id)?.label ?? 'Proyecto desconocido';
  }

  // ── Overlay de carga — igual criterio que egresos-import.component.ts ──────────────────────

  private static readonly LOADING_MIN_MS = 1100;
  private static readonly LOADING_MESSAGE_INTERVAL_MS = 900;
  loadingOverlayVisible = signal(false);
  loadingMessage = signal(LOADING_MESSAGES[0]);
  private loadingMessageTimer: ReturnType<typeof setInterval> | null = null;

  private startLoadingOverlay(): number {
    this.loadingMessage.set(LOADING_MESSAGES[0]);
    this.loadingOverlayVisible.set(true);
    let i = 0;
    this.loadingMessageTimer = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      this.loadingMessage.set(LOADING_MESSAGES[i]);
    }, EgresosImportMultiComponent.LOADING_MESSAGE_INTERVAL_MS);
    return Date.now();
  }

  private stopLoadingOverlay(startedAt: number, done: () => void): void {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, EgresosImportMultiComponent.LOADING_MIN_MS - elapsed);
    setTimeout(() => {
      if (this.loadingMessageTimer) { clearInterval(this.loadingMessageTimer); this.loadingMessageTimer = null; }
      this.loadingOverlayVisible.set(false);
      done();
    }, remaining);
  }

  ngOnDestroy(): void {
    if (this.loadingMessageTimer) clearInterval(this.loadingMessageTimer);
  }

  // ── Selección de archivo + parseo ───────────────────────────────────────────

  fileError = signal<string | null>(null);
  fileName = signal<string | null>(null);
  parsing = signal(false);
  parsedRows = signal<ParsedMultiRow[]>([]);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.fileError.set(null);
    this.parsedRows.set([]);
    this.fileName.set(file.name);
    this.parsing.set(true);
    const startedAt = this.startLoadingOverlay();

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
          this.stopLoadingOverlay(startedAt, () => this.parsing.set(false));
          return;
        }

        const dataRows = allRows.slice(headerRowIndex + 1);
        const rows = this.parseDataRows(dataRows, headerRowIndex);
        this.parsedRows.set(rows);
        if (rows.length === 0) {
          this.fileError.set('No se encontraron filas de datos en el archivo.');
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error al parsear el Excel de auxiliares:', err);
        const detail = err instanceof Error ? err.message : String(err);
        this.fileError.set(`No se pudo leer el archivo: ${detail}`);
      } finally {
        this.stopLoadingOverlay(startedAt, () => this.parsing.set(false));
      }
    };
    reader.onerror = () => {
      this.fileError.set('No se pudo leer el archivo.');
      this.stopLoadingOverlay(startedAt, () => this.parsing.set(false));
    };
    reader.readAsArrayBuffer(file);
  }

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
    const normalized = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }

  private parseDate(v: unknown): string | null {
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    const s = String(v ?? '').trim();
    if (!s) return null;
    const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
  }

  private parseDataRows(rows: unknown[][], headerRowIndex: number): ParsedMultiRow[] {
    const out: ParsedMultiRow[] = [];

    rows.forEach((row, idx) => {
      const cell = (i: number) => String(row[i] ?? '').trim();
      if (row.every(c => String(c ?? '').trim() === '')) return;

      const costCenterRaw = cell(9);
      const matched = this.matchProjectForCostCenter(costCenterRaw);

      const cuentaCell = cell(0);
      const accountMatch = cuentaCell.match(/^(\d+)\s*(.*)$/);
      const sourceAccountCode = accountMatch ? accountMatch[1] : '';
      const sourceAccountName = accountMatch ? accountMatch[2].trim() : cuentaCell;

      const debitos = this.parseColombianNumber(row[6]);
      const creditos = this.parseColombianNumber(row[7]);
      const value = debitos !== 0 ? debitos : (creditos !== 0 ? -creditos : 0);

      const saldoRaw = cell(8);
      const saldo = saldoRaw ? this.parseColombianNumber(row[8]) : null;

      out.push({
        rowNumber: headerRowIndex + idx + 2,
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
        matchedProjectId: matched?.id ?? null,
        manualProjectId: null,
      });
    });

    return out;
  }

  // ── Agrupación por proyecto + "Ignorados" ───────────────────────────────────

  /** Proyecto efectivo de una fila: el elegido a mano (corrección de un "Ignorado") gana sobre
   * el resuelto automáticamente por centro de costos. */
  effectiveProjectId(row: ParsedMultiRow): string | null {
    return row.manualProjectId ?? row.matchedProjectId;
  }

  matchedRows = computed(() => this.parsedRows().filter(r => this.effectiveProjectId(r) !== null));
  ignoredRows = computed(() => this.parsedRows().filter(r => this.effectiveProjectId(r) === null));

  projectGroups = computed<ProjectGroupResult[]>(() => {
    const byProject = new Map<string, ParsedMultiRow[]>();
    for (const r of this.matchedRows()) {
      const id = this.effectiveProjectId(r)!;
      if (!byProject.has(id)) byProject.set(id, []);
      byProject.get(id)!.push(r);
    }
    const prevById = new Map(this.submittedGroups().map(g => [g.projectId, g]));
    return [...byProject.entries()]
      .map(([projectId, rows]) => {
        const prev = prevById.get(projectId);
        return {
          projectId,
          projectLabel: this.projectLabel(projectId),
          rowCount: rows.length,
          totalValue: rows.reduce((sum, r) => sum + r.value, 0),
          committed: prev?.committed ?? null,
          inserted: prev?.inserted ?? 0,
          submitting: false,
        };
      })
      .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel));
  });

  /** Asigna a mano un proyecto a una fila "Ignorada" — no hace falta resolver TODAS, las que
   * queden sin tocar simplemente se quedan afuera del envío. */
  assignManualProject(row: ParsedMultiRow, projectId: string | null): void {
    this.parsedRows.update(rows => rows.map(r => r === row ? { ...r, manualProjectId: projectId } : r));
  }

  trackByRow(_: number, r: ParsedMultiRow) { return r.rowNumber; }
  trackByGroup(_: number, g: ProjectGroupResult) { return g.projectId; }

  // ── Envío — un bulk-import por proyecto, siempre con rubro pendiente ────────────────────────

  submitting = signal(false);
  submittedGroups = signal<ProjectGroupResult[]>([]);
  submitGeneralError = signal<string | null>(null);

  canSubmit = computed(() => this.matchedRows().length > 0 && !this.submitting());

  private rowToPayload(r: ParsedMultiRow): BulkExecutionRowRequest {
    return {
      row_number: r.rowNumber,
      budget_item_id: null, // siempre "Pendiente" — se asigna después desde Egresos del proyecto
      value: r.value,
      date: r.date ?? '',
      description: r.nota || null,
      puc_account_id: null,
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
    };
  }

  submitAll(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.submitGeneralError.set(null);
    const startedAt = this.startLoadingOverlay();

    const groups = this.projectGroups();
    const byProject = new Map<string, ParsedMultiRow[]>();
    for (const r of this.matchedRows()) {
      const id = this.effectiveProjectId(r)!;
      if (!byProject.has(id)) byProject.set(id, []);
      byProject.get(id)!.push(r);
    }

    if (groups.length === 0) {
      this.stopLoadingOverlay(startedAt, () => this.submitting.set(false));
      return;
    }

    const calls = groups.map(g => {
      const rows = byProject.get(g.projectId) ?? [];
      return this.svc.bulkImportExecutions(g.projectId, rows.map(r => this.rowToPayload(r))).pipe(
        catchError(err => of<BulkExecutionImportResult>({
          committed: false, inserted: 0,
          rows: [{ row_number: 0, success: false, error: err?.error?.message ?? err?.error?.error ?? 'Error al importar.' }],
        }))
      );
    });

    forkJoin(calls).subscribe(results => {
      this.stopLoadingOverlay(startedAt, () => {
        this.submitting.set(false);
        const nextGroups: ProjectGroupResult[] = groups.map((g, i) => {
          const result = results[i];
          return { ...g, committed: result.committed, inserted: result.inserted };
        });
        this.submittedGroups.set(nextGroups);

        // Filas de proyectos que sí se importaron (committed) se sacan de la vista — quedan
        // los rechazados (para reintentar) y los "Ignorados" (para seguir corrigiendo a mano).
        const committedProjectIds = new Set(nextGroups.filter(g => g.committed).map(g => g.projectId));
        this.parsedRows.update(rows => rows.filter(r => {
          const pid = this.effectiveProjectId(r);
          return pid === null || !committedProjectIds.has(pid);
        }));
      });
    });
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }
}
