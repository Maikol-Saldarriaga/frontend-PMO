import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { BudgetMonthlyDistribution, BudgetEntry, BudgetItem, CashFlowMonth } from '../../models/project.model';
import { MoneyMaskDirective } from '../../../../shared/directives/money-mask.directive';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

export interface MonthlyRow {
  budget_component_id: string;
  entry_name:        string;
  budget_id:         string | null;
  concept:           string;
  unit_measurement:  string;
  quantity:          number | null;
  start_date:        string | null;
  counterpartCap:    number;
  allyCap:           number;
  distributions:     BudgetMonthlyDistribution[];
  expanded:          boolean;
  dirty:             boolean;
  saving:            boolean;
  rowError:          string | null;
  rowSuccess:        boolean;
  generating:        boolean;
  generateError:     string | null;
}

export interface MonthlySection {
  component_id: string;
  name:         string;
  rows:         MonthlyRow[];
}

/** Fila del resumen por rubro — planeado (contrapartida + aliado) y ejecutado real, ya sumados
 * por vigencia (ver TabMonthlyComponent.summaryRows), para no tener que expandir cada ítem y
 * sumar mes a mes a mano. */
export interface RubroSummary {
  budget_id:  string;
  entry_name: string;
  concept:    string;
  planeado:   number;
  ejecutado:  number;
  pct:        number;
}

@Component({
  selector: 'app-monthly',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './monthly.component.html',
})
export class MonthlyComponent implements OnInit {
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);
  private service = inject(ProjectService);
  private confirmDialog = inject(ConfirmDialogService);

  projectId = '';

  loading  = signal(true);
  error    = signal<string | null>(null);
  sections: MonthlySection[] = [];

  months = [1,2,3,4,5,6,7,8,9,10,11,12];

  /** Egresos reales registrados (módulo "Egresos"), por rubro y por "YYYY-MM" — reemplaza el
   * antiguo campo manual "presupuesto ejecutado" por el valor real, solo informativo aquí. */
  executedSummary: Record<string, Record<string, number>> = {};

  /** Ingresos reales del proyecto por mes (facturación ya cobrada vía desembolso/cobro) — del
   * mismo reporte de Flujo de Caja, ver ingresoRows(). Reemplaza a la vieja columna "Facturado"
   * (billed_amount por rubro/mes), que quedó obsoleta desde que la facturación se ancla a un
   * desembolso a nivel de proyecto y ya no a un rubro/periodo — ver doc de flujo v9. */
  cashFlowMonths = signal<CashFlowMonth[]>([]);

  // ── Filtro de vigencia (año) ─────────────────────────────────────────────
  // Solo afecta qué se MUESTRA en la tabla de cada ítem — nunca lo que se guarda: al guardar
  // siempre se manda row.distributions completo (todas las vigencias), sin importar el filtro.
  selectedYear = signal<number | 'all'>('all');

  availableYears = computed<number[]>(() => {
    const years = new Set<number>();
    for (const sec of this.sections) {
      for (const row of sec.rows) {
        for (const d of row.distributions) years.add(Number(d.year));
      }
    }
    for (const m of this.cashFlowMonths()) years.add(m.year);
    return [...years].sort((a, b) => a - b);
  });

  selectYear(y: number | 'all'): void { this.selectedYear.set(y); }

  /** Distribuciones de un ítem a mostrar, acotadas a la vigencia elegida — puramente para la
   * tabla; row.distributions (el array completo) es siempre la fuente de verdad al guardar. */
  visibleDistributions(row: MonthlyRow): BudgetMonthlyDistribution[] {
    const year = this.selectedYear();
    if (year === 'all') return row.distributions;
    return row.distributions.filter(d => Number(d.year) === year);
  }

  /** Índice real dentro de row.distributions de una fila visible — necesario porque removeMonth
   * opera sobre el array completo, no sobre el subconjunto filtrado que se está mostrando. */
  realIndex(row: MonthlyRow, dist: BudgetMonthlyDistribution): number {
    return row.distributions.indexOf(dist);
  }

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/projects']); return; }

    this.service.getExecutionsMonthlySummary(this.projectId).subscribe({
      next: (summary) => { this.executedSummary = summary ?? {}; },
      error: () => { this.executedSummary = {}; },
    });

    this.service.getCashFlowReport(this.projectId).subscribe({
      next: (r) => this.cashFlowMonths.set(r.months ?? []),
      error: () => this.cashFlowMonths.set([]),
    });

    this.service.getMonthlyWizard(this.projectId).subscribe({
      next: (w) => {
        this.sections = (w.components ?? []).map(comp => ({
          component_id: comp.component_id,
          name:         comp.name,
          rows: (comp.budget_entries ?? []).flatMap((entry: BudgetEntry) =>
            (entry.items ?? []).map((item: BudgetItem) => ({
              budget_component_id: entry.budget_component_id,
              entry_name:    entry.name,
              budget_id:     item.id,
              concept:       item.concept ?? '',
              unit_measurement: item.unit_measurement ?? '',
              quantity:      item.quantity ?? null,
              start_date:    item.start_date ? item.start_date.slice(0, 10) : null,
              counterpartCap: item.counterpart_contribution ?? 0,
              allyCap:        item.ally_contribution        ?? 0,
              distributions: this.sortDistributions([...(item.monthly_distributions ?? [])]),
              expanded:      false,
              dirty:         false,
              saving:        false,
              rowError:      null,
              rowSuccess:    false,
              generating:    false,
              generateError: null,
            } as MonthlyRow))
          ),
        }));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la distribución mensual.');
        this.loading.set(false);
      },
    });
  }

  /** Egreso real registrado para este ítem en ese año/mes — reemplaza el valor manual que
   * traía `dist.executed_amount`, ahora puramente informativo (ver módulo "Egresos"). */
  realExecuted(row: MonthlyRow, dist: BudgetMonthlyDistribution): number {
    if (!row.budget_id) return 0;
    const key = `${dist.year}-${String(dist.month).padStart(2, '0')}`;
    return this.executedSummary[row.budget_id]?.[key] ?? 0;
  }

  toggleExpand(row: MonthlyRow): void { row.expanded = !row.expanded; }

  markDirty(row: MonthlyRow): void {
    row.dirty = true; row.rowSuccess = false; row.rowError = null;
  }

  private sortDistributions(list: BudgetMonthlyDistribution[]): BudgetMonthlyDistribution[] {
    return [...list].sort((a, b) => (Number(a.year) * 12 + Number(a.month)) - (Number(b.year) * 12 + Number(b.month)));
  }

  onDateBlur(row: MonthlyRow): void {
    row.distributions = this.sortDistributions(row.distributions);
  }

  addMonth(row: MonthlyRow): void {
    const last = row.distributions.reduce<{ year: number; month: number } | null>((max, d) => {
      const dy = Number(d.year), dm = Number(d.month);
      return !max || dy * 12 + dm > max.year * 12 + max.month ? { year: dy, month: dm } : max;
    }, null);
    let year  = last?.year  ?? new Date().getFullYear();
    let month = (last?.month ?? 0) + 1;
    if (month > 12) { month = 1; year++; }
    // Escalona hasta encontrar el primer mes libre, por si ya existe (huecos rellenados a mano, etc).
    while (row.distributions.some(d => Number(d.year) === year && Number(d.month) === month)) {
      month++;
      if (month > 12) { month = 1; year++; }
    }
    row.distributions.push({ year, month, counterpart_amount: 0, ally_amount: 0, executed_amount: 0 });
    row.distributions = this.sortDistributions(row.distributions);
    row.dirty = true; row.rowSuccess = false;
    // Si el nuevo mes cae en una vigencia distinta a la filtrada, cambia el filtro a esa
    // vigencia — de lo contrario el mes recién agregado "desaparecería" de la tabla.
    if (this.selectedYear() !== 'all' && this.selectedYear() !== year) this.selectedYear.set(year);
  }

  removeMonth(row: MonthlyRow, mi: number): void {
    row.distributions.splice(mi, 1);
    row.dirty = true; row.rowSuccess = false;
  }

  saveRow(row: MonthlyRow): void {
    if (!row.budget_id || !row.dirty || row.saving) return;

    // La validación contra el tope SIEMPRE mira el total real completo (todas las vigencias),
    // sin importar qué año esté filtrado en pantalla en este momento.
    const totalCP   = this.fullDistTotalCP(row);
    const totalAlly = this.fullDistTotalAlly(row);
    if (totalCP > row.counterpartCap) {
      row.rowError = `La contrapartida mensual (${this.formatCurrency(totalCP)}) no puede superar el total asignado (${this.formatCurrency(row.counterpartCap)}).`;
      return;
    }
    if (totalAlly > row.allyCap) {
      row.rowError = `El aporte aliado mensual (${this.formatCurrency(totalAlly)}) no puede superar el total asignado (${this.formatCurrency(row.allyCap)}).`;
      return;
    }

    row.saving = true; row.rowError = null;

    this.service.saveMonthlyBulk(this.projectId, row.budget_id, {
      distributions: row.distributions.map(d => ({
        year:               d.year,
        month:              d.month,
        counterpart_amount: d.counterpart_amount,
        ally_amount:        d.ally_amount,
        executed_amount:    d.executed_amount ?? 0,
      })),
    }).subscribe({
      next: () => {
        row.dirty = false; row.saving = false; row.rowSuccess = true;
      },
      error: () => {
        row.saving = false;
        row.rowError = 'Error al guardar la distribución.';
      },
    });
  }

  canGenerateDistribution(row: MonthlyRow): boolean {
    return !!row.budget_id && !!row.start_date && !!row.unit_measurement && !!row.quantity && row.quantity > 0 && Number.isInteger(row.quantity);
  }

  async generateDistribution(row: MonthlyRow): Promise<void> {
    if (!row.budget_id || row.generating || !this.canGenerateDistribution(row)) return;

    if (!(await this.confirmDialog.confirm({ message: 'No se detectó una distribución mensual para este ítem. ¿Generarla automáticamente según su unidad, cantidad y fecha de inicio? Esto reemplaza cualquier distribución existente (se conserva lo ya facturado en los meses que coincidan).' }))) {
      return;
    }

    row.generating    = true;
    row.generateError = null;

    this.service.generateMonthly(this.projectId, row.budget_id).subscribe({
      next: (distributions) => {
        row.generating    = false;
        row.distributions = this.sortDistributions(distributions ?? []);
        row.dirty         = false;
        row.rowSuccess     = true;
      },
      error: (err) => {
        row.generating    = false;
        row.generateError = err?.error?.error ?? 'Error al generar la distribución automática.';
      },
    });
  }

  /** Totales de TODA la distribución (todas las vigencias) — los que se validan contra
   * row.counterpartCap/row.allyCap al guardar (ver saveRow), sin importar el filtro de año. */
  fullDistTotalCP(row: MonthlyRow): number {
    return row.distributions.reduce((s, d) => s + d.counterpart_amount, 0);
  }
  fullDistTotalAlly(row: MonthlyRow): number {
    return row.distributions.reduce((s, d) => s + d.ally_amount, 0);
  }

  /** Totales de SOLO lo que se está mostrando según el filtro de vigencia — para el pie de la
   * tabla; nunca se usan para validar el guardado. */
  distTotalCP(row: MonthlyRow): number {
    return this.visibleDistributions(row).reduce((s, d) => s + d.counterpart_amount, 0);
  }
  distTotalAlly(row: MonthlyRow): number {
    return this.visibleDistributions(row).reduce((s, d) => s + d.ally_amount, 0);
  }
  distTotalExecuted(row: MonthlyRow): number {
    return this.visibleDistributions(row).reduce((s, d) => s + this.realExecuted(row, d), 0);
  }

  // ── Resumen por rubro (planeado vs. ejecutado, ya sumado por vigencia) ──────
  // Objetivo: ver de una el total planeado/ejecutado de cada rubro para la vigencia elegida,
  // sin tener que expandir y sumar mes a mes cada ítem.

  /** Sumado planeado/ejecutado por rubro, acotado a la vigencia elegida (ver
   * distTotalCP/distTotalAlly/distTotalExecuted, ya vigencia-aware) — método normal, no
   * computed(): `sections` es un array plano reasignado en cada recarga, así que un computed()
   * quedaría con el valor cacheado del primer cálculo. */
  summaryRows(): RubroSummary[] {
    const out: RubroSummary[] = [];
    for (const sec of this.sections) {
      for (const row of sec.rows) {
        if (!row.budget_id) continue;
        const planeado = this.distTotalCP(row) + this.distTotalAlly(row);
        const ejecutado = this.distTotalExecuted(row);
        out.push({
          budget_id: row.budget_id,
          entry_name: row.entry_name,
          concept: row.concept,
          planeado, ejecutado,
          pct: planeado > 0 ? Math.min(100, Math.round((ejecutado / planeado) * 1000) / 10) : 0,
        });
      }
    }
    return out;
  }

  summaryTotalPlaneado(): number {
    return this.summaryRows().reduce((s, r) => s + r.planeado, 0);
  }
  summaryTotalEjecutado(): number {
    return this.summaryRows().reduce((s, r) => s + r.ejecutado, 0);
  }
  summaryTotalPct(): number {
    const p = this.summaryTotalPlaneado();
    return p > 0 ? Math.min(100, Math.round((this.summaryTotalEjecutado() / p) * 1000) / 10) : 0;
  }

  /** Salta directo al detalle de un rubro desde el resumen — lo expande si estaba colapsado. */
  jumpToRow(budgetId: string): void {
    for (const sec of this.sections) {
      const row = sec.rows.find(r => r.budget_id === budgetId);
      if (row) { row.expanded = true; return; }
    }
  }

  // ── Ingresos (facturación + desembolso/cobro) — a nivel de proyecto ────────
  // El dinero entra por Solicitud de Desembolso (no por rubro/periodo, ver doc de flujo v9), así
  // que este resumen es del proyecto completo, no por rubro — reemplaza la vieja columna
  // "Facturado" por ítem, que ya no reflejaba nada real.

  /** Meses del reporte de Flujo de Caja, acotados a la vigencia elegida y ordenados
   * cronológicamente — cada mes trae `ingreso_bruto`, lo realmente cobrado (facturado y luego
   * recaudado vía desembolso), que es el ingreso real de ese mes. */
  ingresoRows(): CashFlowMonth[] {
    const year = this.selectedYear();
    return this.cashFlowMonths()
      .filter(m => year === 'all' || m.year === year)
      .sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
  }

  ingresoMonthLabel(m: CashFlowMonth): string {
    return `${this.monthName(m.month)} ${m.year}`;
  }

  ingresoTotal(): number {
    return this.ingresoRows().reduce((s, m) => s + (m.ingreso_bruto || 0), 0);
  }

  /** Ingreso planeado del mes — cronograma de desembolsos (Disbursement.PlannedYear/Month), la
   * contraparte "lo que se esperaba cobrar" frente a lo realmente cobrado (ingreso_bruto). */
  ingresoPlaneadoTotal(): number {
    return this.ingresoRows().reduce((s, m) => s + (m.ingreso_planeado || 0), 0);
  }

  goBack(): void {
    this.router.navigate(['/projects', this.projectId], { queryParams: { tab: 'presupuesto' } });
  }

  goToInvoices(): void {
    this.router.navigate(['/projects', this.projectId], { queryParams: { tab: 'facturacion' } });
  }

  monthName(m: number): string {
    return ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m - 1] ?? '';
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(v);
  }

  trackByComp(_: number, s: MonthlySection) { return s.component_id; }
  trackByRow (_: number, r: MonthlyRow)     { return r.budget_id ?? r.budget_component_id; }
  trackByIdx (i: number)                    { return i; }
}
