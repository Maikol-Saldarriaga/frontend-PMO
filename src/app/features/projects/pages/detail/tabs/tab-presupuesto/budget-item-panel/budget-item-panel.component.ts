import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../../services/project.service';
import {
  BudgetItem, BudgetItemRequest, BUDGET_ITEM_UNIT_OPTIONS,
} from '../../../../../models/project.model';
import { MoneyMaskDirective } from '../../../../../../../shared/directives/money-mask.directive';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Igual que enums.DistributionPeriodicity.Months() en el backend — cuántos meses avanza cada
// periodo según la periodicidad, usado para calcular la vista previa en el mismo formato que
// GenerateMonthlyDistributions genera en el servidor.
const PERIOD_STEP_MONTHS: Record<string, number> = {
  mes: 1, bimestre: 2, trimestre: 3, semestre: 6, anio: 12,
};

// Tolerancia para comparaciones de "excede el total" — igual espíritu que floatEpsilon en el
// backend (contract_budget.go): un residuo de centavos por redondeo de punto flotante no debe
// disparar una alerta de exceso.
const AMOUNT_EPSILON = 0.01;

/** Reparte `total` en `n` partes iguales redondeadas a centavos, ajustando la última para que
 * la suma dé exactamente `total` (nunca un centavo de más ni de menos por redondeo). */
function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.round((total / n) * 100) / 100;
  const parts = new Array(n).fill(base);
  const sumWithoutLast = base * (n - 1);
  parts[n - 1] = Math.round((total - sumWithoutLast) * 100) / 100;
  return parts;
}

interface PeriodRow {
  year:                number;
  month:               number;
  counterpart_amount:  number;
  ally_amount:         number;
  executed_amount:     number;
}

/** Contexto que el padre arma al abrir el panel: el ítem a editar (null = nuevo), a qué
 * componente de presupuesto pertenece, y cuánto tope le queda al componente técnico
 * (excluyendo el propio ítem, para poder validar en vivo mientras se edita). */
export interface BudgetPanelContext {
  budgetComponentId: string;
  budgetComponentName: string;
  item: BudgetItem | null;
  sectionBudgetCap: number | null;
  otherItemsTotal: number; // suma del resto de ítems del componente técnico (sin este)
}

@Component({
  selector: 'app-budget-item-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './budget-item-panel.component.html',
})
export class BudgetItemPanelComponent implements OnChanges {
  @Input() projectId!: string;
  @Input() open = false;
  @Input() context: BudgetPanelContext | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved  = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();

  readonly periodicityOptions = BUDGET_ITEM_UNIT_OPTIONS;
  readonly monthNames = MONTH_NAMES;

  constructor(private svc: ProjectService) {}

  // ── Estado del formulario del ítem ──────────────────────────────────────
  existingId: string | null = null;
  concept = '';
  description = '';
  periodicity = '';
  startDate: string | null = null;
  quantity: number | null = null;
  unitValue: number | null = null;
  counterpartContribution: number | null = null;
  allyContribution: number | null = null;

  itemSaving = signal(false);
  itemError  = signal<string | null>(null);
  itemDirty  = signal(false);

  // ── Estado de la distribución por periodo ───────────────────────────────
  periods = signal<PeriodRow[]>([]);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.resetFromContext();
    }
  }

  private resetFromContext(): void {
    const item = this.context?.item ?? null;
    this.existingId = item?.id ?? null;
    this.concept     = item?.concept ?? '';
    this.description = item?.description ?? '';
    this.periodicity  = item?.unit_measurement ?? '';
    this.startDate    = item?.start_date ? item.start_date.slice(0, 10) : null;
    this.quantity     = item?.quantity ?? null;
    this.unitValue    = item?.unit_value ?? null;
    this.counterpartContribution = item?.counterpart_contribution ?? null;
    this.allyContribution        = item?.ally_contribution ?? null;
    this.itemDirty.set(false);
    this.itemError.set(null);
    this.itemSaving.set(false);

    this.periodsTouchedManually = false;
    const savedDists = item?.monthly_distributions ?? [];
    this.periods.set(savedDists.length > 0
      ? savedDists.map(d => ({
          year: d.year, month: d.month,
          counterpart_amount: d.counterpart_amount, ally_amount: d.ally_amount,
          executed_amount: d.executed_amount ?? 0,
        }))
      : this.previewPeriods); // ítem nuevo (o sin distribución aún) → arranca con la vista previa equitativa
  }

  get totalValue(): number {
    return (this.unitValue ?? 0) * (this.quantity ?? 0);
  }

  get aportesTotal(): number {
    return (this.counterpartContribution ?? 0) + (this.allyContribution ?? 0);
  }

  get aportesOverflow(): boolean {
    return this.aportesTotal > this.totalValue + AMOUNT_EPSILON;
  }

  get projectedComponentTotal(): number {
    return (this.context?.otherItemsTotal ?? 0) + this.totalValue;
  }

  get capOverflow(): boolean {
    const cap = this.context?.sectionBudgetCap;
    return cap !== null && cap !== undefined && this.projectedComponentTotal > cap + AMOUNT_EPSILON;
  }

  /** true cuando hay suficiente info (periodicidad + cantidad entera + fecha) para calcular
   * una distribución equitativa, sin importar si el ítem ya existe o no. */
  get canPreviewDistribution(): boolean {
    return !!this.startDate && !!this.periodicity &&
      !!this.quantity && this.quantity > 0 && Number.isInteger(this.quantity);
  }

  /** Vista previa en vivo de cómo quedaría la distribución equitativa (valor/cantidad por
   * periodo) con lo que el usuario lleva escrito ahora mismo — se recalcula en cada cambio de
   * cantidad, periodicidad, fecha de inicio, contrapartida o aliado, tanto al crear como al
   * editar un ítem existente. Usa el mismo paso en meses que el backend (PERIOD_STEP_MONTHS)
   * para que coincida exactamente con lo que generaría GenerateMonthlyDistributions en el
   * servidor. Solo es informativa mientras el usuario no haya editado un periodo a mano
   * (`periodsTouchedManually`), que a partir de ahí tiene precedencia. */
  get previewPeriods(): PeriodRow[] {
    if (!this.canPreviewDistribution || !this.startDate) return [];
    const step = PERIOD_STEP_MONTHS[this.periodicity] ?? 1;
    const n = Math.floor(this.quantity ?? 0);
    // Redondea cada periodo a centavos excepto el último, que absorbe lo que sobre del
    // redondeo — así la suma siempre da EXACTO el aporte total, sin importar que no divida
    // parejo (ej. 2.000.000 / 3 = 666.666,67 x2 + 666.666,66 el último, nunca 666.666,67 x3
    // que sumaría un centavo de más y dispararía una alerta de "excede" falsa).
    const cpRows = splitEvenly(this.counterpartContribution ?? 0, n);
    const allyRows = splitEvenly(this.allyContribution ?? 0, n);
    const start = new Date(this.startDate);
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth() + 1; // 1-based
    const rows: PeriodRow[] = [];
    for (let i = 0; i < n; i++) {
      rows.push({ year, month, counterpart_amount: cpRows[i], ally_amount: allyRows[i], executed_amount: 0 });
      month += step;
      while (month > 12) { month -= 12; year++; }
    }
    return rows;
  }

  /** true cuando ya hay una distribución "real" (guardada, o editada manualmente en esta
   * sesión) que debe primar sobre la vista previa automática. */
  get hasPersistedPeriods(): boolean {
    return this.periods().length > 0;
  }

  /** true en cuanto el usuario toca manualmente una celda de periodo — a partir de ahí dejamos
   * de pisar sus valores con la vista previa automática en cada cambio de cantidad/valor. */
  private periodsTouchedManually = false;

  /** Para campos que no afectan la distribución por periodo (concepto, descripción, valor
   * unitario) — solo marca el ítem como modificado, sin tocar la tabla de periodos. */
  markDirty(): void {
    this.itemDirty.set(true);
    this.itemError.set(null);
  }

  /** Para los campos que sí determinan la distribución (periodicidad, fecha de inicio,
   * cantidad, contrapartida, aliado) — recalcula la vista previa en vivo, tanto al crear un
   * ítem nuevo como al editar uno existente, mientras el usuario no haya editado un periodo a
   * mano. Así la tabla de "Distribución por periodo" siempre refleja lo que se está escribiendo
   * arriba, y se guarda junto con el ítem en la misma petición al hacer clic en "Guardar ítem". */
  markDistDirty(): void {
    this.markDirty();
    if (!this.periodsTouchedManually) {
      this.periods.set(this.previewPeriods);
    }
  }

  close(): void { this.closed.emit(); }

  // ── Guardar datos del ítem ───────────────────────────────────────────────

  saveItem(): void {
    if (this.itemSaving()) return;

    const missing: string[] = [];
    if (!this.concept.trim())    missing.push('Concepto');
    if (!this.periodicity.trim()) missing.push('Periodicidad');
    if (!this.quantity)          missing.push('Cantidad');
    if (!this.unitValue)         missing.push('Valor unitario');
    if (missing.length) { this.itemError.set(`Requeridos: ${missing.join(', ')}`); return; }

    if (this.aportesOverflow) {
      this.itemError.set(`Los aportes no pueden superar el total del ítem.`);
      return;
    }
    if (this.capOverflow) {
      this.itemError.set(`Esto haría que "${this.context?.budgetComponentName}" supere su presupuesto asignado.`);
      return;
    }
    if (this.distOverflowCP() || this.distOverflowAlly()) {
      this.itemError.set('La distribución por periodo excede el aporte total del ítem.');
      return;
    }

    this.itemError.set(null);
    this.itemSaving.set(true);

    const payload: BudgetItemRequest = {
      budget_component_id:      this.context!.budgetComponentId,
      concept:                  this.concept.trim(),
      description:              this.description,
      unit_measurement:         this.periodicity.trim(),
      unit_value:               this.unitValue   ?? 0,
      quantity:                 this.quantity    ?? 0,
      total_value:              this.totalValue,
      counterpart_contribution: this.counterpartContribution ?? 0,
      ally_contribution:        this.allyContribution        ?? 0,
      start_date:               this.startDate ? `${this.startDate}T00:00:00Z` : undefined,
    };

    // La distribución por periodo (la vista previa en vivo, o la que el usuario haya ajustado a
    // mano en esa misma tabla) se manda siempre en la misma petición que el ítem — tanto al
    // crear como al editar — para que quede persistida de una sola vez, sin un segundo viaje al
    // backend ni una API separada para la distribución.
    if (this.periods().length > 0) {
      payload.monthly_distributions = this.periods().map(p => ({
        year: p.year, month: p.month,
        counterpart_amount: p.counterpart_amount, ally_amount: p.ally_amount,
      }));
    }

    const request$ = this.existingId
      ? this.svc.updateBudgetItem(this.projectId, this.existingId, payload)
      : this.svc.createBudgetItem(this.projectId, payload);

    request$.subscribe({
      next: (res) => {
        this.existingId = res.id;
        this.itemSaving.set(false);
        this.itemDirty.set(false);
        if (res.monthly_distributions?.length) {
          this.periods.set(res.monthly_distributions.map(d => ({
            year: d.year, month: d.month,
            counterpart_amount: d.counterpart_amount, ally_amount: d.ally_amount,
            executed_amount: d.executed_amount ?? 0,
          })));
        }
        this.saved.emit();
      },
      error: () => {
        this.itemSaving.set(false);
        this.itemError.set('Error al guardar. Verifica los datos.');
      },
    });
  }

  // ── Distribución por periodo ─────────────────────────────────────────────

  distTotalCP(): number {
    return this.periods().reduce((s, p) => s + p.counterpart_amount, 0);
  }
  distTotalAlly(): number {
    return this.periods().reduce((s, p) => s + p.ally_amount, 0);
  }
  distOverflowCP(): boolean {
    return this.distTotalCP() > (this.counterpartContribution ?? 0) + AMOUNT_EPSILON;
  }
  distOverflowAlly(): boolean {
    return this.distTotalAlly() > (this.allyContribution ?? 0) + AMOUNT_EPSILON;
  }

  /** Reparte equitativamente: valor/cantidad por periodo, recalculado localmente a partir de
   * periodicidad + cantidad + fecha de inicio (igual criterio que el backend). Es puramente
   * local — no persiste nada por sí sola, tanto para un ítem nuevo como para uno existente: el
   * resultado se guarda recién al hacer clic en "Guardar ítem", junto con el resto de los datos. */
  regenerateDistribution(): void {
    if (!this.canPreviewDistribution) return;
    if (this.periodsTouchedManually &&
        !confirm('Esto reemplaza la distribución actual por una equitativa entre todos los periodos. ¿Continuar?')) {
      return;
    }
    this.periodsTouchedManually = false;
    this.periods.set(this.previewPeriods);
    this.itemDirty.set(true);
  }

  addPeriod(): void {
    this.periodsTouchedManually = true;
    const last = this.periods().at(-1);
    let year  = last?.year  ?? (this.startDate ? new Date(this.startDate).getUTCFullYear() : new Date().getFullYear());
    let month = (last?.month ?? 0) + 1;
    if (month > 12) { month = 1; year++; }
    this.periods.update(list => [...list, { year, month, counterpart_amount: 0, ally_amount: 0, executed_amount: 0 }]);
    this.itemDirty.set(true);
  }

  removePeriod(i: number): void {
    this.periodsTouchedManually = true;
    this.periods.update(list => list.filter((_, idx) => idx !== i));
    this.itemDirty.set(true);
  }

  updatePeriod(i: number, field: 'counterpart_amount' | 'ally_amount', value: number): void {
    this.periodsTouchedManually = true;
    this.periods.update(list => list.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
    this.itemDirty.set(true);
  }

  deleteItem(): void {
    if (!this.existingId) { this.closed.emit(); return; }
    if (!confirm(`¿Eliminar el ítem "${this.concept || 'sin concepto'}"? Esta acción no se puede revertir.`)) return;
    this.svc.deleteBudgetItem(this.projectId, this.existingId).subscribe({
      next: () => this.deleted.emit(),
      error: () => this.itemError.set('Error al eliminar el ítem.'),
    });
  }

  monthLabel(p: PeriodRow): string {
    return `${this.monthNames[p.month - 1] ?? p.month} ${p.year}`;
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }
}
