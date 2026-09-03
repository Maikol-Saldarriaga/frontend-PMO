import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MoneyMaskDirective } from '../../../../shared/directives/money-mask.directive';
import { ProjectService } from '../../services/project.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  BudgetExecution, CreateBudgetExecutionRequest, UpdateBudgetExecutionRequest, CashFlowReport, CashFlowRubro,
  BudgetEntry, BudgetItem, BudgetItemActivity, BudgetMonthlyDistribution,
} from '../../models/project.model';
import { PUCAccountLite } from '../../../../../core/puc-accounts/models/puc-account.model';
import { PucAccountPickerComponent } from '../../../../shared/components/puc-account-picker/puc-account-picker.component';
import { RubroPickerComponent, RubroPickerGroup } from '../../../../shared/components/rubro-picker/rubro-picker.component';
import { Tercero, TerceroRequest } from '../../../../../core/terceros/models/tercero.model';
import { TerceroService } from '../../../../../core/terceros/services/tercero.service';
import { CostCenter } from '../../../../../core/cost-centers/models/cost-center.model';
import { CostCenterService } from '../../../../../core/cost-centers/services/cost-center.service';
import { buildRubroPickerGroups } from '../../utils/rubro-picker-groups';

const AMOUNT_EPSILON = 0.01;
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

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
  tercero_id:      string | null;
  invoice_number:  string;
}

function emptyForm(): FormState {
  return {
    budget_item_id: null, value: null, date: new Date().toISOString().slice(0, 10), description: '',
    puc_account_id: null, provider: '', tercero_id: null, invoice_number: '',
  };
}

/** Info de rubro resuelta desde getBudgetWizard — componente técnico + actividades amarradas,
 * que el reporte de flujo de caja (CashFlowRubro) no trae, más sus distribuciones mensuales para
 * calcular el presupuestado del mes elegido en el selector de rubro. */
interface RubroInfo {
  id:                      string;
  concept:                 string;
  technicalComponentId:    string | null;
  technicalComponentName:  string;
  activities:              BudgetItemActivity[];
  monthlyDistributions:    BudgetMonthlyDistribution[];
}

function activityLabel(a: BudgetItemActivity): string {
  return a.act != null ? `Act. ${a.act}${a.description ? ' — ' + a.description : ''}` : (a.description ?? 'Actividad');
}

/** Página completa (no una pestaña) para filtrar y administrar los egresos de un proyecto —
 * separada de la pestaña Egresos (que solo muestra el resumen) porque la tabla + filtros
 * necesitan más espacio del que cabe cómodamente dentro de esa pestaña. */
@Component({
  selector: 'app-egresos-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MoneyMaskDirective, PucAccountPickerComponent, RubroPickerComponent],
  templateUrl: './egresos-list.component.html',
})
export class EgresosListComponent implements OnInit {
  private router = inject(Router);
  private route  = inject(ActivatedRoute);
  private terceroSvc = inject(TerceroService);
  private costCenterSvc = inject(CostCenterService);

  constructor(private svc: ProjectService, private confirmDialog: ConfirmDialogService) {}

  projectId = '';
  locked = false;

  loading = signal(true);
  error   = signal<string | null>(null);
  report  = signal<CashFlowReport | null>(null);
  executions = signal<BudgetExecution[]>([]);
  /** /puc-accounts/picker ya devuelve solo activas, ordenadas — sin filtro extra acá. */
  pucAccounts = signal<PUCAccountLite[]>([]);
  activePUCAccounts = computed(() => this.pucAccounts());
  terceros = signal<Tercero[]>([]);
  activeTerceros = computed(() => this.terceros().filter(t => t.is_active));
  costCenters = signal<CostCenter[]>([]);
  /** { budget_item_id: { "YYYY-MM": ejecutado } } — ejecutado real del mes por rubro. */
  executionsMonthlySummary = signal<Record<string, Record<string, number>>>({});

  /** Rubros del reporte de flujo de caja — ya trae concept + los montos precomputados. */
  rubros = computed<CashFlowRubro[]>(() => this.report()?.rubro_breakdown ?? []);

  /** Componente técnico + actividades de cada rubro — se resuelve aparte desde getBudgetWizard. */
  rubroInfos = signal<RubroInfo[]>([]);

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/projects']); return; }
    this.locked = this.route.snapshot.queryParamMap.get('locked') === '1';

    this.load();

    if (this.route.snapshot.queryParamMap.get('new') === '1' && !this.locked) {
      this.openCreate();
    }
  }

  goBack(): void {
    this.router.navigate(['/projects', this.projectId], { queryParams: { tab: 'egresos' } });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.listPUCAccounts().subscribe({
      next: items => this.pucAccounts.set(items ?? []),
      error: () => {},
    });
    this.terceroSvc.listByProject(this.projectId).subscribe({
      next: items => this.terceros.set(items ?? []),
      error: () => {},
    });
    this.costCenterSvc.list().subscribe({
      next: items => this.costCenters.set(items ?? []),
      error: () => {},
    });
    this.svc.getExecutionsMonthlySummary(this.projectId).subscribe({
      next: summary => this.executionsMonthlySummary.set(summary ?? {}),
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
              monthlyDistributions: item.monthly_distributions ?? [],
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

  // ── KPIs de lo filtrado en pantalla — se recalculan solos al cambiar cualquier filtro ──────

  kpiCount = computed(() => this.filteredExecutions().length);
  kpiTotalDebito = computed(() =>
    this.filteredExecutions().filter(e => e.value > 0).reduce((sum, e) => sum + e.value, 0)
  );
  kpiTotalCredito = computed(() =>
    this.filteredExecutions().filter(e => e.value < 0).reduce((sum, e) => sum + Math.abs(e.value), 0)
  );
  kpiTotalNeto = computed(() => this.filteredExecutions().reduce((sum, e) => sum + e.value, 0));

  pucAccountLabel(id: string | null | undefined): string {
    if (!id) return '—';
    const a = this.pucAccounts().find(x => x.id === id);
    return a ? `${a.code} — ${a.name}` : '—';
  }

  pucPickerOpen = signal(false);

  onPucPicked(account: PUCAccountLite): void {
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

  // ── Selector de rubro agrupado por componente técnico ───────────────────────

  rubroPickerOpen = signal(false);

  /** "YYYY-MM" de la fecha elegida en el formulario — no el mes actual del calendario, sino el
   * mes al que aplica el egreso, para que presupuestado/ejecutado se calculen contra ese mes. */
  selectedMonthKey = computed(() => this.form().date?.slice(0, 7) ?? null);

  selectedMonthLabel = computed(() => {
    const key = this.selectedMonthKey();
    if (!key) return null;
    const [year, month] = key.split('-').map(Number);
    return `${MESES_ES[month - 1]} ${year}`;
  });

  rubroPickerGroups = computed<RubroPickerGroup[]>(() =>
    buildRubroPickerGroups(this.rubroInfos(), this.executionsMonthlySummary(), this.selectedMonthKey())
  );

  onRubroPicked(budgetItemId: string): void {
    this.updateFormField('budget_item_id', budgetItemId);
    this.rubroPickerOpen.set(false);
  }

  // ── Terceros (proveedor/contratista/tercero) reutilizables por proyecto ─────

  terceroLabel(id: string | null | undefined): string {
    if (!id) return '—';
    return this.terceros().find(t => t.id === id)?.name ?? '—';
  }

  costCenterLabel(id: string | null | undefined): string {
    if (!id) return '—';
    const cc = this.costCenters().find(c => c.id === id);
    return cc ? `${cc.code} — ${cc.name}` : '—';
  }

  terceroQuickAddOpen = signal(false);
  terceroQuickAddName = signal('');
  terceroQuickAddDocType = signal('');
  terceroQuickAddDocNumber = signal('');
  terceroQuickAddSaving = signal(false);
  terceroQuickAddError = signal<string | null>(null);

  openTerceroQuickAdd(): void {
    this.terceroQuickAddName.set('');
    this.terceroQuickAddDocType.set('');
    this.terceroQuickAddDocNumber.set('');
    this.terceroQuickAddError.set(null);
    this.terceroQuickAddOpen.set(true);
  }

  closeTerceroQuickAdd(): void {
    this.terceroQuickAddOpen.set(false);
  }

  saveTerceroQuickAdd(): void {
    const name = this.terceroQuickAddName().trim();
    if (!name) { this.terceroQuickAddError.set('Ingresa un nombre.'); return; }

    this.terceroQuickAddSaving.set(true);
    this.terceroQuickAddError.set(null);
    const payload: TerceroRequest = {
      name,
      document_type: this.terceroQuickAddDocType().trim() || null,
      document_number: this.terceroQuickAddDocNumber().trim() || null,
    };
    this.terceroSvc.create(this.projectId, payload).subscribe({
      next: tercero => {
        this.terceros.update(list => [...list, tercero]);
        this.updateFormField('tercero_id', tercero.id);
        this.terceroQuickAddSaving.set(false);
        this.terceroQuickAddOpen.set(false);
      },
      error: err => {
        this.terceroQuickAddSaving.set(false);
        this.terceroQuickAddError.set(err?.error?.message ?? err?.error?.error ?? 'Error al guardar el tercero.');
      },
    });
  }

  /** Tope de Egresos a nivel de PROYECTO (no por rubro) — el dinero entra vía Desembolso, que
   * es % del valor total del proyecto, no de un rubro específico (ver documento de flujo v9). */
  disponibleProyecto = computed(() => this.report()?.disponible_proyecto ?? 0);

  /** Disponible real en el formulario actual: el disponible del proyecto, sumando de vuelta el
   * valor original del egreso que se está editando. */
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
      tercero_id: e.tercero_id ?? null,
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
        provider: f.tercero_id ? null : (f.provider.trim() || null),
        tercero_id: f.tercero_id,
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
        provider: f.tercero_id ? null : (f.provider.trim() || null),
        tercero_id: f.tercero_id,
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
}
