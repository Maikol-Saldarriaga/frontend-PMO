import { Component, Input, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { ContractService } from '../../../../services/contract.service';
import { ProjectService } from '../../../../services/project.service';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  SupplyPlanItem, SupplyPlanRequest, SupplyPlanStatus, SupplyPlanFilters,
} from '../../../../models/contract.model';
import { BudgetEntry, BudgetItem } from '../../../../models/project.model';
import { ProcurementPaymentPanelComponent } from '../procurement-payment-panel/procurement-payment-panel.component';

const STATUS_OPTIONS: { value: SupplyPlanStatus; label: string }[] = [
  { value: 'pendiente',    label: 'Pendiente' },
  { value: 'en_ejecucion', label: 'En Ejecución' },
  { value: 'finalizado',   label: 'Finalizado' },
  { value: 'cancelado',    label: 'Cancelado' },
];

/** Categorías fijas del requerimiento — "Otro" revela un campo de texto libre. */
const CATEGORY_OPTIONS = [
  'Bonificaciones', 'Gastos de viaje', 'Dotación', 'Salarios', 'ARL', 'Compras', 'Prestación de servicios',
];
const CATEGORY_OTHER = 'Otro';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const AMOUNT_EPSILON = 0.01;

/** Un color estable por rubro (mismo criterio que tab-presupuesto) — el índice del rubro dentro
 * de budgetItemOptions() decide el color, así que cada rubro se ve siempre igual en toda la tabla. */
const PALETTE = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const NO_RUBRO_COLOR = '#CBD5E1';
const RUBRO_FILTER_NONE = '__none__';

/** Un ícono + color reconocible por categoría fija, para identificar de un vistazo el tipo de
 * requerimiento en la tabla. "Otro"/categorías personalizadas usan el ícono genérico por defecto. */
interface CategoryIcon { path: string; classes: string; }
const CATEGORY_ICONS: Record<string, CategoryIcon> = {
  'Bonificaciones': {
    classes: 'bg-pink-50 text-pink-600',
    path: 'M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1014.625 7.5H12v-2.625zM12 4.875A2.625 2.625 0 109.375 7.5H12V4.875zM12 7.5H2.25v4.5H12m0-4.5h9.75v4.5H12M12 7.5v14.25',
  },
  'Gastos de viaje': {
    classes: 'bg-sky-50 text-sky-600',
    path: 'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5',
  },
  'Dotación': {
    classes: 'bg-amber-50 text-amber-600',
    path: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0',
  },
  'Salarios': {
    classes: 'bg-emerald-50 text-emerald-600',
    path: 'M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z',
  },
  'ARL': {
    classes: 'bg-red-50 text-red-600',
    path: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  },
  'Compras': {
    classes: 'bg-violet-50 text-violet-600',
    path: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  },
  'Prestación de servicios': {
    classes: 'bg-teal-50 text-teal-600',
    path: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  },
};
const CATEGORY_ICON_DEFAULT: CategoryIcon = {
  classes: 'bg-neutral-100 text-neutral-400',
  path: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z',
};

type FormState = SupplyPlanRequest & { id?: string };

function emptyForm(): FormState {
  const now = new Date();
  return {
    consecutive_number: 0,
    status: 'pendiente',
    project_name: null, requirement_category: '', requirement_detail: '',
    receiving_party: '',
    estimated_request_date: null, actual_request_date: null,
    requirement_start_date: null, requirement_end_date: null,
    initial_budget: 0, executed_budget: 0,
    legalization_date: null, legalization_status: '',
    payment_date: null, invoice_number: '', nit: '', provider: '',
    acta_received_status: '', observation: '',
    period_year: now.getFullYear(), period_month: now.getMonth() + 1,
    budget_item_id: null,
  };
}

export interface FlatBudgetItemOption {
  id:              string;
  concept:         string;
  component_name:  string;
  technical_name:  string;
  quantity:        number;
  unit_value:      number;
  unit_measurement: string | null;
  total_value:     number;
}

/** Fila del detalle "Abastecimiento por rubro" — cuánto de un rubro ya está comprometido
 * (suma de presupuestos iniciales de sus requerimientos) y ejecutado (suma de pagos reales). */
export interface RubroBreakdown {
  budget_item_id:   string;
  technical_name:   string;
  component_name:   string;
  concept:          string;
  total_value:      number; // presupuestado en el rubro
  committed:        number; // suma de initial_budget de los requerimientos vinculados
  executed:         number; // suma de executed_budget (pagos reales) de esos requerimientos
  requirementCount: number;
}

@Component({
  selector: 'app-tab-abastecimiento',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective, ProcurementPaymentPanelComponent],
  templateUrl: './tab-abastecimiento.component.html',
})
export class TabAbastecimientoComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  constructor(private svc: ContractService, private projectSvc: ProjectService, private confirmDialog: ConfirmDialogService) {}

  private auth = inject(AuthStore);

  readonly categoryOptions = CATEGORY_OPTIONS;
  readonly categoryOther   = CATEGORY_OTHER;

  /** Estado propio del modo "Otro" — no se puede derivar solo del texto de la categoría porque
   * al elegir "Otro" el campo de texto arranca vacío, y un texto vacío no alcanza para saber que
   * el usuario sigue en modo "Otro" (por eso el input no aparecía). */
  categoryOtherMode = signal(false);

  categoryIsOther(): boolean {
    return this.categoryOtherMode();
  }

  /** El <select> de categoría solo puede tener uno de los valores fijos o "Otro". */
  categorySelectValue(): string {
    if (this.categoryOtherMode()) return CATEGORY_OTHER;
    const c = this.form().requirement_category;
    return c && CATEGORY_OPTIONS.includes(c) ? c : '';
  }

  onCategorySelect(value: string): void {
    this.categoryOtherMode.set(value === CATEGORY_OTHER);
    this.updateFormField('requirement_category', value === CATEGORY_OTHER ? '' : value);
  }

  categoryIcon(category: string | null): CategoryIcon {
    return (category && CATEGORY_ICONS[category]) || CATEGORY_ICON_DEFAULT;
  }

  /** Inicializa el modo "Otro" al abrir el panel, según si la categoría ya guardada es una personalizada. */
  private initCategoryMode(category: string | null | undefined): void {
    this.categoryOtherMode.set(!!category && !CATEGORY_OPTIONS.includes(category));
  }

  budgetItemOptions = signal<FlatBudgetItemOption[]>([]);

  /** Color estable para identificar un rubro en toda la tabla — gris para "sin rubro". */
  rubroColor(budgetItemId: string | null): string {
    if (!budgetItemId) return NO_RUBRO_COLOR;
    const idx = this.budgetItemOptions().findIndex(o => o.id === budgetItemId);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : NO_RUBRO_COLOR;
  }

  rubroLabel(budgetItemId: string | null): string {
    if (!budgetItemId) return 'Sin rubro';
    return this.budgetItemOptions().find(o => o.id === budgetItemId)?.concept ?? 'Sin rubro';
  }

  /** Total presupuestado del proyecto = suma de todos los rubros (mismo valor que "Total
   * Presupuestado" en la pestaña Presupuesto) — referencia fija, no depende de ningún filtro. */
  totalPresupuestado = computed(() => this.budgetItemOptions().reduce((s, o) => s + (o.total_value || 0), 0));

  /** Rubro seleccionado en el formulario actual, con su info ya cargada (concepto/cantidad/valor). */
  selectedBudgetItem = computed<FlatBudgetItemOption | null>(() => {
    const id = this.form().budget_item_id;
    if (!id) return null;
    return this.budgetItemOptions().find(o => o.id === id) ?? null;
  });

  /** Cuánto del rubro seleccionado ya está comprometido por OTROS requerimientos de abastecimiento
   * (excluyendo el que se está editando), para poder mostrar el disponible real antes de guardar. */
  private rubroCommittedByOthers(): number {
    const id = this.form().budget_item_id;
    const selfId = this.form().id;
    if (!id) return 0;
    return this.items()
      .filter(i => i.budget_item_id === id && i.id !== selfId)
      .reduce((sum, i) => sum + (i.initial_budget || 0), 0);
  }

  /** Disponible real del rubro para este requerimiento = total del rubro − lo ya comprometido por otros. */
  rubroAvailable(): number | null {
    const bi = this.selectedBudgetItem();
    if (!bi) return null;
    return bi.total_value - this.rubroCommittedByOthers();
  }

  rubroOverflow(): boolean {
    const available = this.rubroAvailable();
    if (available === null) return false;
    return (Number(this.form().initial_budget) || 0) > available + AMOUNT_EPSILON;
  }

  // ── Drawer de pagos de un requerimiento ─────────────────────────────────
  paymentsPanelOpen = signal(false);
  paymentsPanelItem = signal<SupplyPlanItem | null>(null);

  openPayments(item: SupplyPlanItem): void {
    this.paymentsPanelItem.set(item);
    this.paymentsPanelOpen.set(true);
  }

  closePayments(): void {
    this.paymentsPanelOpen.set(false);
  }

  onPaymentsChanged(): void {
    // Refresca la fila (executed_budget puede haber cambiado) — el resumen se recalcula solo
    // porque filteredTotals() es un computed sobre items().
    this.load();
  }

  readonly statusOptions = STATUS_OPTIONS;
  readonly months        = MONTHS;
  readonly yearOptions   = this.buildYearOptions();

  loading = signal(true);
  error   = signal<string | null>(null);
  items   = signal<SupplyPlanItem[]>([]);

  /** Detalle por rubro: cuánto de cada rubro de presupuesto ya está registrado (comprometido)
   * y pagado (ejecutado) en el plan de abastecimiento — calculado en el cliente a partir de lo
   * que ya se carga (items() + budgetItemOptions()), sin pedir nada nuevo al backend. Solo
   * incluye rubros con al menos un requerimiento vinculado. */
  rubroBreakdown = computed<RubroBreakdown[]>(() => {
    const byId = new Map<string, RubroBreakdown>();
    for (const bi of this.budgetItemOptions()) {
      byId.set(bi.id, {
        budget_item_id: bi.id, technical_name: bi.technical_name, component_name: bi.component_name, concept: bi.concept,
        total_value: bi.total_value, committed: 0, executed: 0, requirementCount: 0,
      });
    }
    for (const item of this.items()) {
      if (!item.budget_item_id) continue;
      const row = byId.get(item.budget_item_id);
      if (!row) continue;
      row.committed += item.initial_budget || 0;
      row.executed  += item.executed_budget || 0;
      row.requirementCount++;
    }
    return Array.from(byId.values())
      .sort((a, b) => b.committed - a.committed);
  });

  rubroCommittedPct(r: RubroBreakdown): number {
    if (!r.total_value) return 0;
    return Math.min(100, Math.round((r.committed / r.total_value) * 100));
  }
  rubroExecutedPct(r: RubroBreakdown): number {
    if (!r.committed) return 0;
    return Math.min(100, Math.round((r.executed / r.committed) * 100));
  }
  rubroOverflowRow(r: RubroBreakdown): boolean {
    return r.committed > r.total_value + AMOUNT_EPSILON;
  }

  filters = signal<SupplyPlanFilters>({ year: null, month: null, category: '', status: '' });
  /** Filtro por rubro — es puramente del lado del cliente (no existe como filtro en el backend),
   * se aplica sobre lo que ya devolvió load() con los demás filtros. */
  readonly rubroFilterNone = RUBRO_FILTER_NONE;
  rubroFilter = signal<string | null>(null);

  activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.year, f.month, f.category, f.status, this.rubroFilter()].filter(Boolean).length;
  });

  /** Filas de la tabla tras aplicar el filtro de rubro sobre lo ya cargado. */
  filteredItems = computed<SupplyPlanItem[]>(() => {
    const rf = this.rubroFilter();
    const list = this.items();
    if (!rf) return list;
    if (rf === RUBRO_FILTER_NONE) return list.filter(i => !i.budget_item_id);
    return list.filter(i => i.budget_item_id === rf);
  });

  /** Totales del resumen calculados sobre lo que está filtrado en la tabla (no el global del backend). */
  filteredTotals = computed(() => {
    const list = this.filteredItems();
    const initial = list.reduce((s, i) => s + (i.initial_budget || 0), 0);
    const executed = list.reduce((s, i) => s + (i.executed_budget || 0), 0);
    return { initial, executed, pct: initial > 0 ? (executed / initial) * 100 : 0 };
  });

  updateRubroFilter(value: string): void {
    this.rubroFilter.set(value || null);
  }

  panelOpen  = signal(false);
  form       = signal<FormState>(emptyForm());
  /** Nombre del solicitante a mostrar en el panel (solo lectura) — el usuario actual al crear,
   * o el nombre ya resuelto del requerimiento (o su legado en texto libre) al editar. */
  requesterDisplayName = signal<string>('');
  saving     = signal(false);
  saveError  = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  private buildYearOptions(): number[] {
    const y = new Date().getFullYear();
    const years: number[] = [];
    for (let i = y - 3; i <= y + 3; i++) years.push(i);
    return years;
  }

  ngOnInit(): void {
    this.load();
    this.loadBudgetItemOptions();
  }

  private loadBudgetItemOptions(): void {
    this.projectSvc.getBudgetWizard(this.projectId).subscribe({
      next: w => {
        const flat: FlatBudgetItemOption[] = (w.components ?? []).flatMap(comp =>
          (comp.budget_entries ?? []).flatMap((entry: BudgetEntry) =>
            (entry.items ?? []).map((item: BudgetItem) => ({
              id: item.id, concept: item.concept ?? '', component_name: entry.name, technical_name: comp.name,
              quantity: item.quantity, unit_value: item.unit_value, unit_measurement: item.unit_measurement ?? null,
              total_value: item.total_value,
            } as FlatBudgetItemOption))
          )
        );
        this.budgetItemOptions.set(flat);
      },
      error: () => this.budgetItemOptions.set([]),
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getSupplyPlan(this.projectId, this.filters()).subscribe({
      next: list => { this.items.set(list ?? []); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el plan de abastecimiento.'); this.loading.set(false); },
    });
  }

  /** year/month llegan como number|null reales (selects con [ngValue]); category/status llegan como string. */
  updateFilter(field: keyof SupplyPlanFilters, value: string | number | null): void {
    const normalized = value === '' || value === null || value === undefined
      ? null
      : (field === 'year' || field === 'month' ? Number(value) : value);
    this.filters.update(f => ({ ...f, [field]: normalized }));
    this.load();
  }

  clearFilters(): void {
    this.filters.set({ year: null, month: null, category: '', status: '' });
    this.rubroFilter.set(null);
    this.load();
  }

  monthName(m: number): string { return this.months[m - 1] ?? String(m); }

  // ── Panel de creación / edición ──────────────────────────────────────────

  openCreate(): void {
    this.form.set(emptyForm());
    this.initCategoryMode(null);
    this.requesterDisplayName.set(this.auth.userFullName() || '—');
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  openEdit(item: SupplyPlanItem): void {
    this.form.set({
      id: item.id,
      consecutive_number: item.consecutive_number,
      status: item.status,
      project_name: item.project_name ?? null, requirement_category: item.requirement_category ?? '',
      requirement_detail: item.requirement_detail ?? '',
      receiving_party: item.receiving_party ?? '',
      estimated_request_date: item.estimated_request_date?.slice(0, 10) ?? null,
      actual_request_date:    item.actual_request_date?.slice(0, 10) ?? null,
      requirement_start_date: item.requirement_start_date?.slice(0, 10) ?? null,
      requirement_end_date:   item.requirement_end_date?.slice(0, 10) ?? null,
      initial_budget: item.initial_budget, executed_budget: item.executed_budget,
      legalization_date: item.legalization_date?.slice(0, 10) ?? null,
      legalization_status: item.legalization_status ?? '',
      payment_date: item.payment_date?.slice(0, 10) ?? null,
      invoice_number: item.invoice_number ?? '', nit: item.nit ?? '', provider: item.provider ?? '',
      acta_received_status: item.acta_received_status ?? '', observation: item.observation ?? '',
      period_year: item.period_year, period_month: item.period_month,
      budget_item_id: item.budget_item_id ?? null,
    });
    this.initCategoryMode(item.requirement_category);
    this.requesterDisplayName.set(item.requested_by_name || item.requested_by || '—');
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void { this.panelOpen.set(false); }

  updateFormField(field: keyof FormState, value: string | number | null): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  save(): void {
    const f = this.form();
    if (!f.period_year || !f.period_month) { this.saveError.set('Año y mes del período son requeridos.'); return; }
    if (this.rubroOverflow()) {
      this.saveError.set(`El presupuesto inicial supera lo disponible en el rubro (disponible: ${this.formatCurrency(this.rubroAvailable() ?? 0)}).`);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const payload: SupplyPlanRequest = {
      consecutive_number: Number(f.consecutive_number) || 0,
      status: f.status,
      project_name: null,
      requirement_category: f.requirement_category || null,
      requirement_detail: f.requirement_detail || null,
      receiving_party: f.receiving_party || null,
      estimated_request_date: f.estimated_request_date || null,
      actual_request_date: f.actual_request_date || null,
      requirement_start_date: f.requirement_start_date || null,
      requirement_end_date: f.requirement_end_date || null,
      initial_budget: Number(f.initial_budget) || 0,
      executed_budget: Number(f.executed_budget) || 0,
      legalization_date: f.legalization_date || null,
      legalization_status: f.legalization_status || null,
      payment_date: f.payment_date || null,
      invoice_number: f.invoice_number || null,
      nit: f.nit || null,
      provider: f.provider || null,
      acta_received_status: f.acta_received_status || null,
      observation: f.observation || null,
      period_year: Number(f.period_year),
      period_month: Number(f.period_month),
      budget_item_id: f.budget_item_id || null,
    };

    const request$ = f.id
      ? this.svc.updateSupplyPlanItem(this.projectId, f.id, payload)
      : this.svc.createSupplyPlanItem(this.projectId, payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.panelOpen.set(false);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'Error al guardar el requerimiento.');
      },
    });
  }

  async deleteItem(item: SupplyPlanItem): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Eliminar el requerimiento #${item.consecutive_number}${item.requirement_category ? ' — ' + item.requirement_category : ''}?` }))) return;
    this.deletingId.set(item.id);
    this.svc.deleteSupplyPlanItem(this.projectId, item.id).subscribe({
      next: () => {
        this.items.update(list => list.filter(i => i.id !== item.id));
        this.deletingId.set(null);
      },
      error: () => this.deletingId.set(null),
    });
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }

  statusLabel(s: SupplyPlanStatus): string {
    return STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;
  }

  trackById(_: number, item: SupplyPlanItem) { return item.id; }
}
