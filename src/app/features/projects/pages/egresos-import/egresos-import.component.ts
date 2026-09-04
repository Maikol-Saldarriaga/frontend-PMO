import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import * as XLSX from 'xlsx';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ProjectService } from '../../services/project.service';
import { RubroPickerComponent, RubroPickerGroup } from '../../../../shared/components/rubro-picker/rubro-picker.component';
import { PUCAccountLite } from '../../../../../core/puc-accounts/models/puc-account.model';
import { CostCenterService } from '../../../../../core/cost-centers/services/cost-center.service';
import { CostCenter } from '../../../../../core/cost-centers/models/cost-center.model';
import { buildRubroPickerGroups, RubroPickerRubroInfo } from '../../utils/rubro-picker-groups';
import { BudgetEntry, BudgetItem, BulkExecutionRowRequest, BulkExecutionRowResult, BudgetExecution } from '../../models/project.model';

/** Orden EXACTO esperado del Excel de auxiliares contables — "Cuenta" aparece dos veces (la
 * primera es la cuenta detallada, la segunda es el código de mayor) y esa repetición es
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
  value: number;
  date: string | null;         // ISO yyyy-mm-dd
  tercero: string;
  nota: string;
  docNum: string;
  cheque: string;
  mvto: string;
  saldo: number | null;
  /** Cuenta tal cual viene del Excel — no se enlaza con el catálogo PUC, solo auditoría. */
  sourceAccountCode: string;
  sourceAccountName: string;
  sourceMayorCode: string;
  sourceCostCenterRaw: string;
  sourceMes: string;
  submitError?: string;        // motivo devuelto por el backend, si esta fila falló al importar
  /** true una vez que esta fila ya quedó registrada (recién importada, o el backend avisó que
   * ya existía) — se queda visible en la tabla marcada como lista, no desaparece, así el usuario
   * ve de un vistazo cuáles le faltan todavía dentro del mes. */
  imported?: boolean;
}

/** Mensajes rotativos del overlay de carga — puramente cosmético, no reflejan pasos reales del
 * parseo/envío, solo dan sensación de "algo inteligente está pasando" mientras se espera. */
const LOADING_MESSAGES = [
  'Carga inteligente…',
  'Detectando cuentas contables…',
  'Separando código y nombre de cuenta…',
  'Cruzando auxiliares contables…',
  'Verificando centros de costo…',
  'Organizando filas por rubro…',
];

@Component({
  selector: 'app-egresos-import',
  standalone: true,
  imports: [CommonModule, FormsModule, RubroPickerComponent],
  templateUrl: './egresos-import.component.html',
})
export class EgresosImportComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private costCenterSvc = inject(CostCenterService);

  constructor(private svc: ProjectService) {}

  projectId = '';

  loadingProject = signal(true);
  loadError = signal<string | null>(null);
  projectCostCenterCode = signal<string | null>(null);
  pucAccounts = signal<PUCAccountLite[]>([]);
  costCenters = signal<CostCenter[]>([]);
  rubroInfos = signal<RubroPickerRubroInfo[]>([]);
  executionsMonthlySummary = signal<Record<string, Record<string, number>>>({});
  /** { monthKey: cantidad de egresos YA registrados en el proyecto en ese rango de fechas } —
   * solo el CONTEO (summary.count), nunca las filas — una consulta liviana por mes (limit:1, el
   * dato real viaja en summary, no en data) para poder atenuar en el selector los meses que ya
   * parecen completos, sin pagar el costo de traer todas las filas de todos los meses de una. Es
   * una señal aproximada (compara cantidades, no fila por fila) — la verificación exacta pasa
   * recién al entrar al mes, ver checkExistingRowsForMonth. */
  monthExistingCounts = signal<Record<string, number>>({});

  private normalizeKeyPart(v: string | null | undefined): string {
    return (v ?? '').trim().toLowerCase();
  }

  /** Igual criterio que duplicateAccountKey en el backend (budget_execution.go): si el egreso
   * tiene cuenta PUC (cargado a mano), la clave es su CÓDIGO, no su id — así un egreso manual y
   * una fila del Excel para la misma transacción real (que solo trae source_account_code, nunca
   * un puc_account_id) comparan igual. */
  duplicateKeyForExecution(e: BudgetExecution): string {
    const accountKey = e.puc_account_id
      ? this.normalizeKeyPart(this.pucAccounts().find(a => a.id === e.puc_account_id)?.code)
      : this.normalizeKeyPart(e.source_account_code);
    return `${(e.date ?? '').slice(0, 10)}|${(e.value ?? 0).toFixed(2)}|${accountKey}|${this.normalizeKeyPart(e.provider)}|${this.normalizeKeyPart(e.description)}`;
  }

  duplicateKeyForRow(r: ParsedRow): string {
    const accountKey = this.normalizeKeyPart(r.sourceAccountCode);
    return `${r.date ?? ''}|${r.value.toFixed(2)}|${accountKey}|${this.normalizeKeyPart(r.tercero)}|${this.normalizeKeyPart(r.nota)}`;
  }

  /** true mientras se consulta si las filas del mes elegido ya estaban registradas — solo se
   * dispara AL ELEGIR un mes puntual, nunca para el archivo entero (que puede abarcar varios
   * meses y miles de filas acumuladas en el proyecto — pedir eso de una sola vez satura la red
   * y el backend de lejos sin necesidad, ver commit que acotaba a rango de fechas: acá se acota
   * más todavía, a un solo mes). */
  checkingExistingRows = signal(false);

  /** Trae solo los egresos ya registrados en el rango de fechas de ESTE MES puntual (no el
   * archivo completo) y marca en el momento las filas que hagan match como `imported` — así el
   * usuario ve de entrada, sin enviar nada, cuáles de este mes ya están en la plataforma. */
  private checkExistingRowsForMonth(monthKey: string): void {
    const rowsInMonth = this.parsedRows().filter(r => this.monthKeyForRow(r) === monthKey);
    const dates = rowsInMonth.map(r => r.date).filter((d): d is string => !!d).sort();
    if (dates.length === 0) return;

    this.checkingExistingRows.set(true);
    this.svc.listAllExecutions(this.projectId, { date_from: dates[0], date_to: dates[dates.length - 1] }).subscribe({
      next: items => {
        this.checkingExistingRows.set(false);
        const keys = new Set((items ?? []).map(e => this.duplicateKeyForExecution(e)));
        this.parsedRows.update(rows => rows.map(r =>
          this.monthKeyForRow(r) === monthKey && keys.has(this.duplicateKeyForRow(r)) ? { ...r, imported: true } : r
        ));
      },
      error: () => this.checkingExistingRows.set(false),
    });
  }

  /** Para cada mes del archivo, pide SOLO el conteo (limit:1 — el número real viaja en
   * summary.count, no en data) de egresos ya registrados en ese rango de fechas, y lo compara
   * contra cuántas filas trae el archivo para ese mes: si ya hay tantos o más, el mes se atenúa
   * en el selector como probablemente completo. Una consulta liviana por mes en paralelo — nunca
   * las filas completas de todos los meses de una, que es lo que saturaba antes. */
  private checkMonthCompletionCounts(rows: ParsedRow[]): void {
    const byMonth = new Map<string, ParsedRow[]>();
    for (const r of rows) {
      const key = this.monthKeyForRow(r);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(r);
    }

    const entries = [...byMonth.entries()];
    const calls = entries.map(([, monthRows]) => {
      const dates = monthRows.map(r => r.date).filter((d): d is string => !!d).sort();
      if (dates.length === 0) return of(0);
      return this.svc.listExecutions(this.projectId, { limit: 1, date_from: dates[0], date_to: dates[dates.length - 1] }).pipe(
        map(page => page.summary.count),
        catchError(() => of(0)),
      );
    });

    forkJoin(calls).subscribe(counts => {
      const next: Record<string, number> = {};
      entries.forEach(([key], i) => { next[key] = counts[i]; });
      this.monthExistingCounts.set(next);
    });
  }

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

    this.svc.getExecutionsMonthlySummary(this.projectId).subscribe({
      next: s => this.executionsMonthlySummary.set(s ?? {}), error: () => {},
    });
    this.svc.listPUCAccounts().subscribe({
      next: items => this.pucAccounts.set(items ?? []), error: () => {},
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
    this.costCenterSvc.listAll().subscribe({ next: items => this.costCenters.set(items ?? []), error: () => {} });

    this.svc.getProjectDetails(this.projectId).subscribe({
      next: details => {
        const cc = this.costCenters().find(c => c.id === details.cost_center_id)
          ?? null;
        // costCenters puede no haber llegado todavía — se resuelve otra vez cuando llegue
        this.projectCostCenterCode.set(cc?.code ?? null);
        if (!cc) {
          this.costCenterSvc.listAll().subscribe({
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

  // ── Overlay de carga bonita ──────────────────────────────────────────────
  // Reemplaza el "Leyendo archivo…" seco de antes por una pantalla completa con mensaje
  // rotativo, y le impone un mínimo de tiempo visible (LOADING_MIN_MS) aunque el parseo real
  // sea casi instantáneo — así el usuario siempre alcanza a verla, sin que se sienta un delay
  // artificial largo cuando el archivo sí es grande y ya toma su tiempo real.
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
    }, EgresosImportComponent.LOADING_MESSAGE_INTERVAL_MS);
    return Date.now();
  }

  /** Corta el overlay respetando el mínimo de tiempo visible, y ejecuta done() (que a su vez
   * baja parsing()/importing()) recién en ese momento. */
  private stopLoadingOverlay(startedAt: number, done: () => void): void {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, EgresosImportComponent.LOADING_MIN_MS - elapsed);
    setTimeout(() => {
      if (this.loadingMessageTimer) { clearInterval(this.loadingMessageTimer); this.loadingMessageTimer = null; }
      this.loadingOverlayVisible.set(false);
      done();
    }, remaining);
  }

  ngOnDestroy(): void {
    if (this.loadingMessageTimer) clearInterval(this.loadingMessageTimer);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.fileError.set(null);
    this.parsedRows.set([]);
    this.selectedMonthKey.set(null);
    this.skippedByCostCenter.set(0);
    this.sampleRawCostCenters.set([]);
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
        const { rows, skipped, sampleRawCostCenters } = this.parseDataRows(dataRows, headerRowIndex);
        this.parsedRows.set(rows);
        this.skippedByCostCenter.set(skipped);
        this.sampleRawCostCenters.set(sampleRawCostCenters);
        if (rows.length === 0) {
          this.fileError.set(
            skipped > 0
              ? 'Ninguna fila del archivo corresponde al centro de costos de este proyecto.'
              : 'No se encontraron filas de datos en el archivo.'
          );
        } else {
          this.checkMonthCompletionCounts(rows);
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

  matchesProjectCostCenter(cell: string): boolean {
    const code = this.projectCostCenterCode();
    if (!code) return false;
    const numbers: string[] = cell.match(/\d+/g) ?? [];
    return numbers.includes(code);
  }

  private parseDataRows(rows: unknown[][], headerRowIndex: number): { rows: ParsedRow[]; skipped: number; sampleRawCostCenters: string[] } {
    const out: ParsedRow[] = [];
    let skipped = 0;
    const sampleRawCostCenters: string[] = []; // primeros valores crudos de "Centro de Costos" vistos, para diagnóstico

    rows.forEach((row, idx) => {
      const cell = (i: number) => String(row[i] ?? '').trim();
      if (row.every(c => String(c ?? '').trim() === '')) return; // fila totalmente vacía

      const costCenterRaw = cell(9);
      if (costCenterRaw && sampleRawCostCenters.length < 8 && !sampleRawCostCenters.includes(costCenterRaw)) {
        sampleRawCostCenters.push(costCenterRaw);
      }
      if (!this.matchesProjectCostCenter(costCenterRaw)) { skipped++; return; }

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
        rowNumber: headerRowIndex + idx + 2, // +1 por el header, +1 porque Excel es 1-based
        selected: false,
        budgetItemId: null,
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

    return { rows: out, skipped, sampleRawCostCenters };
  }

  // ── Paso 2: vista previa editable ──────────────────────────────────────────

  parsedRows = signal<ParsedRow[]>([]);
  skippedByCostCenter = signal(0);
  /** Muestra cruda de valores de "Centro de Costos" vistos en el archivo — para que se pueda
   * verificar a simple vista, sin abrir la consola, por qué una fila calzó o no calzó. */
  sampleRawCostCenters = signal<string[]>([]);

  /** Clave de mes de una fila: prioriza la fecha (más confiable) y cae al "Mes" crudo del Excel
   * si la fecha no se pudo parsear — así ninguna fila queda fuera del selector de mes. */
  monthKeyForRow(row: ParsedRow): string {
    if (row.date) return row.date.slice(0, 7);
    return row.sourceMes ? `mes-${row.sourceMes}` : 'sin-fecha';
  }

  monthKeyLabel(key: string): string {
    const m = key.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return `${meses[Number(m[2]) - 1]} ${m[1]}`;
    }
    if (key === 'sin-fecha') return 'Sin fecha reconocible';
    return key.replace('mes-', 'Mes ');
  }

  /** Meses presentes en el archivo ya filtrado por centro de costos, con cuántas filas tiene
   * cada uno — el usuario elige uno para traer solo ese lote a la vista previa. No se sabe de
   * antemano cuáles ya están importados (eso saldría de consultar TODO el archivo de una, algo
   * pesado si abarca varios meses) — se chequea recién al elegir un mes puntual, ver
   * checkExistingRowsForMonth. */
  availableMonths = computed(() => {
    const counts = new Map<string, number>();
    for (const row of this.parsedRows()) {
      const key = this.monthKeyForRow(row);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const existingCounts = this.monthExistingCounts();
    return [...counts.entries()]
      .map(([key, count]) => ({
        key, count, label: this.monthKeyLabel(key),
        // Señal aproximada (conteos, no fila por fila) — "probablemente completo", confirmado o
        // corregido al entrar (checkExistingRowsForMonth marca fila por fila).
        alreadyImported: (existingCounts[key] ?? 0) >= count,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  });

  selectedMonthKey = signal<string | null>(null);

  selectMonth(key: string): void {
    this.selectedMonthKey.set(key);
    this.previewAccountFilter.set(null);
    this.previewProviderFilter.set(null);
    this.checkExistingRowsForMonth(key);
  }

  backToMonthSelection(): void {
    this.selectedMonthKey.set(null);
  }

  /** Solo las filas del mes elegido — sobre este subconjunto opera todo lo demás (revisión
   * pendiente, "puede importar", envío) para importar de a un mes a la vez. */
  visibleRows = computed(() => {
    const key = this.selectedMonthKey();
    if (!key) return [];
    return this.parsedRows().filter(r => this.monthKeyForRow(r) === key);
  });

  // ── Filtros de la vista previa (solo para ubicar filas y asignar rubro más fácil — no
  // restringen qué se importa, eso sigue siendo TODO el mes elegido) ─────────────────────

  previewAccountFilter = signal<string | null>(null);
  previewProviderFilter = signal<string | null>(null);

  previewAccountOptions = computed(() => {
    const map = new Map<string, string>();
    for (const r of this.visibleRows()) {
      if (r.sourceAccountCode && !map.has(r.sourceAccountCode)) {
        map.set(r.sourceAccountCode, `${r.sourceAccountCode} — ${r.sourceAccountName}`.trim().replace(/—\s*$/, '—'));
      }
    }
    return [...map.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  });

  previewProviderOptions = computed(() => {
    const set = new Set<string>();
    for (const r of this.visibleRows()) { if (r.tercero) set.add(r.tercero); }
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  /** Filas del mes elegido, acotadas además por los filtros de cuenta/proveedor de la vista
   * previa — es sobre este subconjunto que operan "seleccionar todas"/tabla, así se puede filtrar
   * a un grupo de auxiliares y asignarles el rubro de una sola vez. */
  filteredPreviewRows = computed(() => {
    const account = this.previewAccountFilter();
    const provider = this.previewProviderFilter();
    return this.visibleRows().filter(r =>
      (!account || r.sourceAccountCode === account) && (!provider || r.tercero === provider)
    );
  });

  allSelected = computed(() => this.filteredPreviewRows().length > 0 && this.filteredPreviewRows().every(r => r.selected));
  someSelected = computed(() => this.filteredPreviewRows().some(r => r.selected));

  toggleSelectAll(): void {
    const next = !this.allSelected();
    const visible = new Set(this.filteredPreviewRows());
    this.parsedRows.update(rows => rows.map(r => visible.has(r) ? { ...r, selected: next } : r));
  }

  toggleRowSelected(row: ParsedRow): void {
    this.parsedRows.update(rows => rows.map(r => r === row ? { ...r, selected: !r.selected } : r));
  }

  /** Filas del mes que ya se importaron (recién o en un envío anterior) — se ignoran para todo
   * lo que sigue: no cuentan como "por revisar" ni se vuelven a enviar. */
  importedRows = computed(() => this.visibleRows().filter(r => r.imported));

  rowsNeedingReview = computed(() => this.visibleRows().filter(r => !r.imported && !r.budgetItemId));

  /** Filas listas para enviar: tienen rubro asignado y todavía no se importaron. La carga es
   * deliberadamente parcial — no hace falta resolver el mes entero de una — así que esto NO
   * exige que rowsNeedingReview esté vacío, solo que haya algo nuevo para mandar. */
  rowsReadyToImport = computed(() => this.visibleRows().filter(r => !r.imported && !!r.budgetItemId));

  canImport = computed(() => this.rowsReadyToImport().length > 0 && !this.importing());

  // ── Selector de cuenta PUC por fila ─────────────────────────────────────────

  pucPickerOpen = signal(false);
  private pucPickerRowIndex: number | null = null;

  openPucPickerForRow(index: number): void {
    this.pucPickerRowIndex = index;
    this.pucPickerOpen.set(true);
  }

  onPucPicked(account: PUCAccountLite): void {
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
  private rubroPickerRow: ParsedRow | null = null;

  private rubroGroupsForDate(dateIso: string | null): RubroPickerGroup[] {
    const monthKey = dateIso ? dateIso.slice(0, 7) : null;
    return buildRubroPickerGroups(this.rubroInfos(), this.executionsMonthlySummary(), monthKey);
  }

  activeRubroPickerGroups = signal<RubroPickerGroup[]>([]);
  activeRubroPickerMonthLabel = signal<string | null>(null);

  openRubroPickerForRow(row: ParsedRow): void {
    this.rubroPickerRow = row;
    this.rubroPickerBulkMode.set(false);
    this.activeRubroPickerGroups.set(this.rubroGroupsForDate(row.date));
    this.activeRubroPickerMonthLabel.set(row.date ? row.date.slice(0, 7) : null);
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
      const visible = new Set(this.visibleRows());
      this.parsedRows.update(rows => rows.map(r => (visible.has(r) && r.selected) ? { ...r, budgetItemId } : r));
      return;
    }
    const target = this.rubroPickerRow;
    if (!target) return;
    this.parsedRows.update(rows => rows.map(r => r === target ? { ...r, budgetItemId } : r));
  }

  rubroLabel(budgetItemId: string | null): string {
    if (!budgetItemId) return 'Sin asignar';
    return this.rubroInfos().find(r => r.id === budgetItemId)?.concept ?? 'Rubro desconocido';
  }

  // ── Paso 3: envío ────────────────────────────────────────────────────────

  importing = signal(false);
  importResultCommitted = signal<boolean | null>(null);
  importedCount = signal(0);
  /** Filas que no se importaron porque YA EXISTÍAN (misma fecha, valor, cuenta y tercero) — no
   * cuentan como error, el backend simplemente las saltó. */
  importSkippedCount = signal(0);

  submit(): void {
    if (!this.canImport()) return;
    this.importing.set(true);
    this.importResultCommitted.set(null);
    const startedAt = this.startLoadingOverlay();

    // Carga parcial deliberada: solo se manda lo que ya tiene rubro asignado — lo que falta se
    // queda en la tabla para resolver después, sin bloquear lo que sí está listo.
    const rowsToSend = this.rowsReadyToImport();
    const payload: BulkExecutionRowRequest[] = rowsToSend.map(r => ({
      row_number: r.rowNumber,
      budget_item_id: r.budgetItemId!,
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
    }));

    this.svc.bulkImportExecutions(this.projectId, payload).subscribe({
      next: result => {
        this.stopLoadingOverlay(startedAt, () => {
          this.importing.set(false);
          this.importResultCommitted.set(result.committed);
          this.importedCount.set(result.inserted);
          this.importSkippedCount.set((result.rows ?? []).filter(r => r.skipped).length);
          if (result.committed) {
            // Insertadas Y salteadas-por-duplicado quedan "listas" — ambas ya están en la
            // plataforma, solo que una se acaba de crear y la otra ya existía. Se quedan
            // visibles en la tabla marcadas como tal, no desaparecen: así el usuario ve de un
            // vistazo cuáles le faltan todavía dentro del mes.
            const doneRowNumbers = new Set(rowsToSend.map(r => r.rowNumber));
            this.parsedRows.update(rows => rows.map(r => doneRowNumbers.has(r.rowNumber) ? { ...r, imported: true, submitError: undefined } : r));
            // Si ya no queda nada por hacer en este mes (nada por asignar y nada listo sin
            // enviar), no tiene sentido seguir mostrando la tabla — se vuelve al selector.
            if (this.rowsNeedingReview().length === 0 && this.rowsReadyToImport().length === 0) {
              this.selectedMonthKey.set(null);
            }
          } else {
            this.applyRowErrors(result.rows);
          }
        });
      },
      error: err => {
        this.stopLoadingOverlay(startedAt, () => {
          this.importing.set(false);
          this.importResultCommitted.set(false);
          this.submitGeneralError.set(err?.error?.message ?? err?.error?.error ?? 'Error al importar los auxiliares.');
        });
      },
    });
  }

  submitGeneralError = signal<string | null>(null);

  private applyRowErrors(results: BulkExecutionRowResult[]): void {
    const byRowNumber = new Map(results.filter(r => !r.success).map(r => [r.row_number, r.error]));
    this.parsedRows.update(rows => rows.map(r => ({ ...r, submitError: byRowNumber.get(r.rowNumber) })));
  }

  downloadErrorReport(): void {
    const failed = this.visibleRows().filter(r => r.submitError);
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
