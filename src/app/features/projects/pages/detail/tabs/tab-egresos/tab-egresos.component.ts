import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { ProjectService } from '../../../../services/project.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  BudgetExecution, CreateBudgetExecutionRequest, UpdateBudgetExecutionRequest, CashFlowReport, CashFlowRubro,
} from '../../../../models/project.model';

const AMOUNT_EPSILON = 0.01;

/** Mismo color por rubro que en Presupuesto/Abastecimiento/Flujo de Caja, para que un rubro se
 * vea siempre igual en toda la app — el índice viene del orden de rubro_breakdown del reporte. */
const PALETTE = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const NO_RUBRO_COLOR = '#CBD5E1';

interface FormState {
  id?:             string;
  budget_item_id:  string | null;
  value:           number | null;
  date:            string | null;
  description:     string;
}

function emptyForm(): FormState {
  return { budget_item_id: null, value: null, date: new Date().toISOString().slice(0, 10), description: '' };
}

@Component({
  selector: 'app-tab-egresos',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './tab-egresos.component.html',
})
export class TabEgresosComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  constructor(private svc: ProjectService, private confirmDialog: ConfirmDialogService) {}

  loading = signal(true);
  error   = signal<string | null>(null);
  report  = signal<CashFlowReport | null>(null);
  executions = signal<BudgetExecution[]>([]);

  /** Rubros del reporte de flujo de caja — ya trae concept + los montos precomputados de
   * cobrado/ejecutado/disponible, así que no hay que reimplementar esa suma en el cliente. */
  rubros = computed<CashFlowRubro[]>(() => this.report()?.rubro_breakdown ?? []);

  /** Solo los rubros con algún movimiento relevante para Egresos (cobrado o ya ejecutado),
   * para no llenar el resumen de rubros vacíos que nunca han recibido plata. */
  rubrosConMovimiento = computed<CashFlowRubro[]>(() =>
    this.rubros().filter(r => r.ingreso_recibido > 0 || r.egreso_real_registrado > 0)
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getCashFlowReport(this.projectId).subscribe({
      next: r => {
        this.report.set(r);
        this.svc.listExecutions(this.projectId).subscribe({
          next: list => { this.executions.set(list ?? []); this.loading.set(false); },
          error: () => { this.error.set('No se pudieron cargar los egresos registrados.'); this.loading.set(false); },
        });
      },
      error: () => { this.error.set('No se pudo cargar el flujo de caja.'); this.loading.set(false); },
    });
  }

  rubroColor(budgetItemId: string | null | undefined): string {
    if (!budgetItemId) return NO_RUBRO_COLOR;
    const idx = this.rubros().findIndex(r => r.budget_item_id === budgetItemId);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : NO_RUBRO_COLOR;
  }

  rubroLabel(budgetItemId: string | null | undefined): string {
    return this.rubros().find(r => r.budget_item_id === budgetItemId)?.concept ?? 'Rubro desconocido';
  }

  rubroExecutedPct(r: CashFlowRubro): number {
    if (!r.ingreso_recibido) return 0;
    return Math.min(100, Math.round((r.egreso_real_registrado / r.ingreso_recibido) * 100));
  }

  rubroOverflow(r: CashFlowRubro): boolean {
    return r.egreso_real_registrado > r.ingreso_recibido + AMOUNT_EPSILON;
  }

  /** Disponible real para un rubro en el formulario actual: el disponible ya calculado por el
   * backend (cash-flow), sumando de vuelta el valor original del egreso que se está editando
   * (porque ese valor ya está descontado en disponible_para_ejecutar del reporte) — mismo
   * criterio de "excluir el propio registro" que usa el backend al validar. */
  private rubroAvailableRaw(budgetItemId: string | null, excludeExecutionId: string | undefined): number {
    if (!budgetItemId) return 0;
    const rubro = this.rubros().find(r => r.budget_item_id === budgetItemId);
    const base = rubro?.disponible_para_ejecutar ?? 0;
    if (!excludeExecutionId) return base;
    const original = this.executions().find(e => e.id === excludeExecutionId && e.budget_item_id === budgetItemId);
    return base + (original?.value ?? 0);
  }

  // ── Formulario "Registrar egreso" ──────────────────────────────────────────

  panelOpen = signal(false);
  form      = signal<FormState>(emptyForm());
  saving    = signal(false);
  saveError = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  /** Disponible en vivo para el rubro seleccionado en el formulario, considerando la edición actual. */
  formAvailable = computed(() => this.rubroAvailableRaw(this.form().budget_item_id, this.form().id));

  formOverAvailable = computed(() => (Number(this.form().value) || 0) > this.formAvailable() + AMOUNT_EPSILON);

  canSave(): boolean {
    const f = this.form();
    return !!f.budget_item_id && !!f.value && f.value > 0 && !!f.date && !this.formOverAvailable();
  }

  openCreate(): void {
    this.form.set(emptyForm());
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  openEdit(e: BudgetExecution): void {
    this.form.set({
      id: e.id,
      budget_item_id: e.budget_item_id,
      value: e.value,
      date: e.date?.slice(0, 10) ?? null,
      description: e.description ?? '',
    });
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void { this.panelOpen.set(false); }

  updateFormField(field: keyof FormState, value: string | number | null): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  save(): void {
    const f = this.form();
    if (!f.budget_item_id) { this.saveError.set('Selecciona un rubro.'); return; }
    if (!f.value || f.value <= 0) { this.saveError.set('Ingresa un valor mayor a cero.'); return; }
    if (!f.date) { this.saveError.set('Selecciona una fecha.'); return; }
    if (this.formOverAvailable()) {
      this.saveError.set(`El valor supera lo disponible para ejecutar en este rubro (disponible: ${this.formatCurrency(this.formAvailable())}).`);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    if (f.id) {
      const payload: UpdateBudgetExecutionRequest = {
        value: Number(f.value) || 0,
        date: f.date,
        description: f.description.trim() || null,
      };
      this.svc.updateExecution(this.projectId, f.id, payload).subscribe({
        next: () => { this.saving.set(false); this.panelOpen.set(false); this.load(); },
        error: err => { this.saving.set(false); this.saveError.set(err?.error?.message ?? err?.error?.error ?? 'Error al actualizar el egreso.'); },
      });
    } else {
      const payload: CreateBudgetExecutionRequest = {
        budget_item_id: f.budget_item_id,
        value: Number(f.value) || 0,
        date: f.date,
        description: f.description.trim() || null,
      };
      this.svc.createExecution(this.projectId, payload).subscribe({
        next: () => { this.saving.set(false); this.panelOpen.set(false); this.load(); },
        error: err => { this.saving.set(false); this.saveError.set(err?.error?.message ?? err?.error?.error ?? 'Error al registrar el egreso.'); },
      });
    }
  }

  async deleteExecution(e: BudgetExecution): Promise<void> {
    if (!(await this.confirmDialog.confirm({
      message: `¿Eliminar este egreso de ${this.formatCurrency(e.value)} contra "${this.rubroLabel(e.budget_item_id)}"? Esto libera esa disponibilidad para volver a ejecutarse. Esta acción no se puede deshacer.`,
      variant: 'danger',
    }))) return;

    this.deletingId.set(e.id);
    this.svc.deleteExecution(this.projectId, e.id).subscribe({
      next: () => { this.deletingId.set(null); this.load(); },
      error: () => this.deletingId.set(null),
    });
  }

  /** Egresos ordenados del más reciente al más antiguo. */
  sortedExecutions = computed<BudgetExecution[]>(() =>
    [...this.executions()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  );

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return d.slice(0, 10).split('-').reverse().join('/');
  }

  trackById(_: number, e: BudgetExecution) { return e.id; }
  trackByRubro(_: number, r: CashFlowRubro) { return r.budget_item_id; }
}
