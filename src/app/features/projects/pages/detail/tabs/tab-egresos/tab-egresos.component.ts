import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { ProjectService } from '../../../../services/project.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  BudgetExecution, CreateBudgetExecutionRequest, UpdateBudgetExecutionRequest, CashFlowReport, CashFlowRubro,
  BudgetEntry, BudgetItem, BudgetItemActivity,
} from '../../../../models/project.model';
import { PUCAccount } from '../../../../../../../core/puc-accounts/models/puc-account.model';
import { PucAccountPickerComponent } from '../../../../../../shared/components/puc-account-picker/puc-account-picker.component';

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
  puc_account_id:  string | null;
  provider:        string;
  invoice_number:  string;
}

function emptyForm(): FormState {
  return {
    budget_item_id: null, value: null, date: new Date().toISOString().slice(0, 10), description: '',
    puc_account_id: null, provider: '', invoice_number: '',
  };
}

/** Info de rubro resuelta desde getBudgetWizard — componente técnico + actividades amarradas,
 * que el reporte de flujo de caja (CashFlowRubro) no trae. */
interface RubroInfo {
  id:                      string;
  concept:                 string;
  technicalComponentId:    string | null;
  technicalComponentName:  string;
  activities:              BudgetItemActivity[];
}

function activityLabel(a: BudgetItemActivity): string {
  return a.act != null ? `Act. ${a.act}${a.description ? ' — ' + a.description : ''}` : (a.description ?? 'Actividad');
}

@Component({
  selector: 'app-tab-egresos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MoneyMaskDirective, PucAccountPickerComponent],
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
  pucAccounts = signal<PUCAccount[]>([]);
  activePUCAccounts = computed(() => this.pucAccounts().filter(a => a.is_active));

  /** Rubros del reporte de flujo de caja — ya trae concept + los montos precomputados de
   * cobrado/ejecutado/disponible, así que no hay que reimplementar esa suma en el cliente. */
  rubros = computed<CashFlowRubro[]>(() => this.report()?.rubro_breakdown ?? []);

  /** Solo los rubros con algún movimiento relevante para Egresos (presupuesto asignado o ya
   * ejecutado), para no llenar el resumen de rubros vacíos. */
  rubrosConMovimiento = computed<CashFlowRubro[]>(() =>
    this.rubros().filter(r => r.total_presupuestado > 0 || r.egreso_real_registrado > 0)
  );

  /** Componente técnico + actividades de cada rubro — no viene en CashFlowRubro, se resuelve
   * aparte desde getBudgetWizard (misma fuente que usa Flujo de Caja para lo mismo). */
  rubroInfos = signal<RubroInfo[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.listPUCAccounts().subscribe({
      next: items => this.pucAccounts.set(items ?? []),
      error: () => {},
    });
    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: w => {
        const infos: RubroInfo[] = (w.components ?? []).flatMap(comp =>
          (comp.budget_entries ?? []).flatMap((entry: BudgetEntry) =>
            (entry.items ?? []).map((item: BudgetItem) => ({
              id: item.id,
              concept: item.concept ?? '',
              technicalComponentId: comp.component_id ?? null,
              technicalComponentName: comp.name ?? 'Sin componente técnico',
              activities: item.activities ?? [],
            } as RubroInfo))
          )
        );
        this.rubroInfos.set(infos);
      },
      error: () => this.rubroInfos.set([]),
    });
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

  rubroInfo(budgetItemId: string | null | undefined): RubroInfo | undefined {
    return this.rubroInfos().find(r => r.id === budgetItemId);
  }

  rubroTechnicalName(budgetItemId: string | null | undefined): string {
    return this.rubroInfo(budgetItemId)?.technicalComponentName ?? 'Sin componente técnico';
  }

  // ── Filtros de la lista de egresos ──────────────────────────────────────────

  filterBudgetItemId          = signal<string | null>(null);
  filterTechnicalComponentId  = signal<string | null>(null);
  filterActivityId            = signal<string | null>(null);
  filterPucAccountId          = signal<string | null>(null);
  filterProvider              = signal('');
  filterDateFrom               = signal<string | null>(null);
  filterDateTo                 = signal<string | null>(null);

  technicalComponentOptions = computed(() => {
    const map = new Map<string, string>();
    for (const info of this.rubroInfos()) {
      if (info.technicalComponentId) map.set(info.technicalComponentId, info.technicalComponentName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Rubros disponibles para el filtro, acotados al componente técnico elegido (si hay uno). */
  rubroOptionsForFilter = computed(() => {
    const techId = this.filterTechnicalComponentId();
    return this.rubros().filter(r => !techId || this.rubroInfo(r.budget_item_id)?.technicalComponentId === techId);
  });

  activityOptions = computed(() => {
    const map = new Map<string, string>();
    for (const info of this.rubroInfos()) {
      for (const a of info.activities) map.set(a.id, activityLabel(a));
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  });

  hasActiveFilters = computed(() =>
    !!this.filterBudgetItemId() || !!this.filterTechnicalComponentId() || !!this.filterActivityId() ||
    !!this.filterPucAccountId() || !!this.filterProvider().trim() || !!this.filterDateFrom() || !!this.filterDateTo()
  );

  clearFilters(): void {
    this.filterBudgetItemId.set(null);
    this.filterTechnicalComponentId.set(null);
    this.filterActivityId.set(null);
    this.filterPucAccountId.set(null);
    this.filterProvider.set('');
    this.filterDateFrom.set(null);
    this.filterDateTo.set(null);
  }

  /** Egresos filtrados por rubro/componente técnico/actividad/PUC/proveedor/rango de fechas —
   * todo en cliente, ya que el dataset es de un solo proyecto (acotado por diseño). */
  filteredExecutions = computed<BudgetExecution[]>(() => {
    const budgetItemId = this.filterBudgetItemId();
    const techId = this.filterTechnicalComponentId();
    const activityId = this.filterActivityId();
    const pucId = this.filterPucAccountId();
    const provider = this.filterProvider().trim().toLowerCase();
    const from = this.filterDateFrom();
    const to = this.filterDateTo();

    return this.sortedExecutions().filter(e => {
      if (budgetItemId && e.budget_item_id !== budgetItemId) return false;
      const info = this.rubroInfo(e.budget_item_id);
      if (techId && info?.technicalComponentId !== techId) return false;
      if (activityId && !(info?.activities ?? []).some(a => a.id === activityId)) return false;
      if (pucId && e.puc_account_id !== pucId) return false;
      if (provider && !(e.provider ?? '').toLowerCase().includes(provider)) return false;
      const d = e.date?.slice(0, 10) ?? null;
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      return true;
    });
  });

  // ── Resumen agrupado por Componente Técnico → Rubro ─────────────────────────

  /** Cuántos egresos hay registrados por rubro — cuenta simple sobre executions(). */
  rubroExecutionCounts = computed<Map<string, number>>(() => {
    const counts = new Map<string, number>();
    for (const e of this.executions()) counts.set(e.budget_item_id, (counts.get(e.budget_item_id) ?? 0) + 1);
    return counts;
  });

  /** "Presupuestado y ejecutado por rubro" agrupado por Componente Técnico, con conteo de
   * egresos por rubro — responde "cuántos egresos hay por cada rubro-componente técnico". */
  groupedByTechnical = computed(() => {
    const groups = new Map<string, {
      technicalComponentId: string;
      technicalComponentName: string;
      rubros: { budgetItemId: string; concept: string; count: number; presupuestado: number; ejecutado: number }[];
      totalCount: number;
      totalEjecutado: number;
    }>();
    for (const r of this.rubrosConMovimiento()) {
      const info = this.rubroInfo(r.budget_item_id);
      const techId = info?.technicalComponentId ?? '__sin_componente__';
      const techName = info?.technicalComponentName ?? 'Sin componente técnico';
      if (!groups.has(techId)) {
        groups.set(techId, { technicalComponentId: techId, technicalComponentName: techName, rubros: [], totalCount: 0, totalEjecutado: 0 });
      }
      const g = groups.get(techId)!;
      const count = this.rubroExecutionCounts().get(r.budget_item_id) ?? 0;
      g.rubros.push({ budgetItemId: r.budget_item_id, concept: r.concept, count, presupuestado: r.total_presupuestado, ejecutado: r.egreso_real_registrado });
      g.totalCount += count;
      g.totalEjecutado += r.egreso_real_registrado;
    }
    return [...groups.values()].sort((a, b) => b.totalEjecutado - a.totalEjecutado);
  });

  pucAccountLabel(id: string | null | undefined): string {
    if (!id) return '—';
    const a = this.pucAccounts().find(x => x.id === id);
    return a ? `${a.code} — ${a.name}` : '—';
  }

  pucPickerOpen = signal(false);

  onPucPicked(account: PUCAccount): void {
    this.updateFormField('puc_account_id', account.id);
    this.pucPickerOpen.set(false);
  }

  rubroColor(budgetItemId: string | null | undefined): string {
    if (!budgetItemId) return NO_RUBRO_COLOR;
    const idx = this.rubros().findIndex(r => r.budget_item_id === budgetItemId);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : NO_RUBRO_COLOR;
  }

  rubroLabel(budgetItemId: string | null | undefined): string {
    return this.rubros().find(r => r.budget_item_id === budgetItemId)?.concept ?? 'Rubro desconocido';
  }

  /** % ejecutado contra el presupuesto planeado del rubro — ya no contra lo cobrado, que desde
   * la Fase 2b entra a nivel de proyecto (Desembolso), no por rubro. */
  rubroExecutedPct(r: CashFlowRubro): number {
    if (!r.total_presupuestado) return 0;
    return Math.min(100, Math.round((r.egreso_real_registrado / r.total_presupuestado) * 100));
  }

  rubroOverflow(r: CashFlowRubro): boolean {
    return r.egreso_real_registrado > r.total_presupuestado + AMOUNT_EPSILON;
  }

  /** Tope de Egresos a nivel de PROYECTO (no por rubro) — el dinero entra vía Desembolso, que
   * es % del valor total del proyecto, no de un rubro específico (ver documento de flujo v9). */
  disponibleProyecto = computed(() => this.report()?.disponible_proyecto ?? 0);

  /** Disponible real en el formulario actual: el disponible del proyecto, sumando de vuelta el
   * valor original del egreso que se está editando (porque ese valor ya está descontado en
   * disponible_proyecto del reporte) — mismo criterio de "excluir el propio registro" que usa
   * el backend al validar. */
  formAvailable = computed(() => {
    const base = this.disponibleProyecto();
    const id = this.form().id;
    if (!id) return base;
    const original = this.executions().find(e => e.id === id);
    return base + (original?.value ?? 0);
  });

  // ── Formulario "Registrar egreso" ──────────────────────────────────────────

  panelOpen = signal(false);
  form      = signal<FormState>(emptyForm());
  saving    = signal(false);
  saveError = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  formOverAvailable = computed(() => (Number(this.form().value) || 0) > this.formAvailable() + AMOUNT_EPSILON);

  canSave(): boolean {
    const f = this.form();
    return !!f.budget_item_id && !!f.value && f.value > 0 && !!f.date && !!f.puc_account_id && !this.formOverAvailable();
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
      puc_account_id: e.puc_account_id,
      provider: e.provider ?? '',
      invoice_number: e.invoice_number ?? '',
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
    if (!f.puc_account_id) { this.saveError.set('Selecciona una cuenta PUC.'); return; }
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
        puc_account_id: f.puc_account_id,
        provider: f.provider.trim() || null,
        invoice_number: f.invoice_number.trim() || null,
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
        puc_account_id: f.puc_account_id,
        provider: f.provider.trim() || null,
        invoice_number: f.invoice_number.trim() || null,
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
  trackByTechGroup(_: number, g: { technicalComponentId: string }) { return g.technicalComponentId; }
}
