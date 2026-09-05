import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  Hito, HitoRequest, HitoTriggerType, Disbursement, BudgetEntry, BudgetItem, BudgetItemActivity,
} from '../../../../models/project.model';

interface TechnicalComponentOption { id: string; name: string; }
interface ActivityOption { id: string; label: string; }

interface FormState {
  id?:                    string;
  description:            string;
  verification_method:    string;
  planned_date:           string | null;
  fodc_contribution:      number | null;
  ally_contribution:      number | null;
  trigger_type:           HitoTriggerType;
  trigger_threshold_pct:  number | null;
  activity_id:            string | null;
  component_id:           string | null;
  disbursement_id:        string | null;
}

function emptyForm(): FormState {
  return {
    description: '', verification_method: '', planned_date: null, fodc_contribution: null, ally_contribution: null,
    trigger_type: null, trigger_threshold_pct: null, activity_id: null, component_id: null, disbursement_id: null,
  };
}

function activityLabel(a: BudgetItemActivity): string {
  return a.act != null ? `Act. ${a.act}${a.description ? ' — ' + a.description : ''}` : (a.description ?? 'Actividad');
}

const TRIGGER_LABELS: Record<Exclude<HitoTriggerType, null>, string> = {
  avance_proyecto: 'Avance del proyecto',
  avance_actividad: 'Avance de actividad',
  avance_componente: 'Avance de componente',
  presupuesto: 'Presupuesto ejecutado',
  desembolso: 'Desembolso',
};

@Component({
  selector: 'app-tab-hitos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-hitos.component.html',
})
export class TabHitosComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  constructor(private svc: ProjectService, private confirmDialog: ConfirmDialogService) {}

  loading = signal(true);
  error   = signal<string | null>(null);
  hitos   = signal<Hito[]>([]);

  /** Avance real actual del proyecto — solo de referencia mientras se define un umbral. */
  currentProjectProgress = signal<number | null>(null);

  technicalComponents = signal<TechnicalComponentOption[]>([]);
  /** Actividades por componente técnico (id de componente -> actividades de sus rubros). */
  activitiesByComponent = signal<Map<string, ActivityOption[]>>(new Map());
  disbursements = signal<Disbursement[]>([]);

  allActivities = computed<ActivityOption[]>(() => {
    const seen = new Map<string, ActivityOption>();
    for (const list of this.activitiesByComponent().values()) {
      for (const a of list) seen.set(a.id, a);
    }
    return [...seen.values()];
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.svc.getProject(this.projectId).subscribe({
      next: p => this.currentProjectProgress.set(p.real_progress ?? null),
      error: () => {},
    });

    this.svc.listAllDisbursements(this.projectId).subscribe({
      next: list => this.disbursements.set([...(list ?? [])].sort((a, b) => a.sort_order - b.sort_order)),
      error: () => this.disbursements.set([]),
    });

    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: w => {
        const components: TechnicalComponentOption[] = [];
        const byComponent = new Map<string, ActivityOption[]>();
        for (const comp of w.components ?? []) {
          if (!comp.component_id) continue;
          components.push({ id: comp.component_id, name: comp.name });
          const activities = new Map<string, ActivityOption>();
          for (const entry of (comp.budget_entries ?? []) as BudgetEntry[]) {
            for (const item of (entry.items ?? []) as BudgetItem[]) {
              for (const a of item.activities ?? []) activities.set(a.id, { id: a.id, label: activityLabel(a) });
            }
          }
          byComponent.set(comp.component_id, [...activities.values()]);
        }
        this.technicalComponents.set(components);
        this.activitiesByComponent.set(byComponent);
      },
      error: () => { this.technicalComponents.set([]); this.activitiesByComponent.set(new Map()); },
    });

    this.svc.listAllHitos(this.projectId).subscribe({
      next: list => { this.hitos.set([...(list ?? [])].sort((a, b) => a.sort_order - b.sort_order)); this.loading.set(false); },
      error: () => { this.error.set('No se pudieron cargar los hitos.'); this.loading.set(false); },
    });
  }

  sortedHitos = computed<Hito[]>(() => this.hitos());
  completedCount = computed(() => this.hitos().filter(h => h.status === 'cumplido').length);
  progressPct = computed(() => {
    const total = this.hitos().length;
    return total ? Math.round((this.completedCount() / total) * 100) : 0;
  });

  triggerLabel(h: Hito): string {
    if (!h.trigger_type) return 'Manual';
    const base = TRIGGER_LABELS[h.trigger_type];
    switch (h.trigger_type) {
      case 'avance_proyecto':
      case 'presupuesto':
        return `${base} ≥ ${h.trigger_threshold_pct}%`;
      case 'avance_componente': {
        const name = this.technicalComponents().find(c => c.id === h.component_id)?.name ?? 'componente';
        return `${base} (${name}) ≥ ${h.trigger_threshold_pct}%`;
      }
      case 'avance_actividad': {
        const label = this.allActivities().find(a => a.id === h.activity_id)?.label ?? 'actividad';
        return `${base} (${label}) ≥ ${h.trigger_threshold_pct}%`;
      }
      case 'desembolso': {
        const d = this.disbursements().find(x => x.id === h.disbursement_id);
        return `${base}: ${d?.name ?? '—'}`;
      }
      default:
        return base;
    }
  }

  // ── Formulario "Registrar hito" ──────────────────────────────────────────

  panelOpen = signal(false);
  form      = signal<FormState>(emptyForm());
  saving    = signal(false);
  saveError = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  /** Actividades disponibles para el componente técnico elegido en el formulario. */
  formActivities = computed<ActivityOption[]>(() => {
    const compId = this.form().component_id;
    if (!compId) return this.allActivities();
    return this.activitiesByComponent().get(compId) ?? [];
  });

  updateFormField<K extends keyof FormState>(field: K, value: FormState[K]): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  onTriggerTypeChange(value: string): void {
    const t = (value || null) as HitoTriggerType;
    this.form.update(f => ({
      ...f, trigger_type: t, trigger_threshold_pct: null, activity_id: null, component_id: null, disbursement_id: null,
    }));
  }

  canSave(): boolean {
    const f = this.form();
    if (!f.description.trim()) return false;
    switch (f.trigger_type) {
      case 'avance_proyecto':
      case 'presupuesto':
        return f.trigger_threshold_pct != null;
      case 'avance_actividad':
        return f.trigger_threshold_pct != null && !!f.activity_id;
      case 'avance_componente':
        return f.trigger_threshold_pct != null && !!f.component_id;
      case 'desembolso':
        return !!f.disbursement_id;
      default:
        return true;
    }
  }

  openCreate(): void {
    this.form.set(emptyForm());
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  openEdit(h: Hito): void {
    this.form.set({
      id: h.id,
      description: h.description,
      verification_method: h.verification_method ?? '',
      planned_date: h.planned_date?.slice(0, 10) ?? null,
      fodc_contribution: h.fodc_contribution,
      ally_contribution: h.ally_contribution,
      trigger_type: h.trigger_type,
      trigger_threshold_pct: h.trigger_threshold_pct,
      activity_id: h.activity_id,
      component_id: h.component_id,
      disbursement_id: h.disbursement_id,
    });
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void { this.panelOpen.set(false); }

  save(): void {
    const f = this.form();
    if (!f.description.trim()) { this.saveError.set('La descripción es obligatoria.'); return; }
    if (!this.canSave()) { this.saveError.set('Completa los campos requeridos por el tipo de disparo elegido.'); return; }

    this.saving.set(true);
    this.saveError.set(null);

    const payload: HitoRequest = {
      description: f.description.trim(),
      verification_method: f.verification_method.trim() || null,
      planned_date: f.planned_date,
      fodc_contribution: f.fodc_contribution,
      ally_contribution: f.ally_contribution,
      trigger_type: f.trigger_type,
      trigger_threshold_pct: f.trigger_threshold_pct,
      activity_id: f.trigger_type === 'avance_actividad' ? f.activity_id : null,
      component_id: f.trigger_type === 'avance_componente' ? f.component_id : null,
      disbursement_id: f.trigger_type === 'desembolso' ? f.disbursement_id : null,
    };

    const request = f.id
      ? this.svc.updateHito(this.projectId, f.id, payload)
      : this.svc.createHito(this.projectId, payload);

    request.subscribe({
      next: () => { this.saving.set(false); this.panelOpen.set(false); this.load(); },
      error: err => { this.saving.set(false); this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar el hito.'); },
    });
  }

  async deleteHito(h: Hito): Promise<void> {
    if (!(await this.confirmDialog.confirm({
      message: `¿Eliminar el hito "${h.description}"? Esta acción no se puede deshacer.`,
      variant: 'danger',
    }))) return;

    this.deletingId.set(h.id);
    this.svc.deleteHito(this.projectId, h.id).subscribe({
      next: () => { this.deletingId.set(null); this.load(); },
      error: () => this.deletingId.set(null),
    });
  }

  completeHito(h: Hito): void {
    this.svc.completeHito(this.projectId, h.id).subscribe({
      next: () => this.load(),
      error: () => {},
    });
  }

  reopenHito(h: Hito): void {
    this.svc.reopenHito(this.projectId, h.id).subscribe({
      next: () => this.load(),
      error: () => {},
    });
  }

  formatCurrency(v: number | null): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return d.slice(0, 10).split('-').reverse().join('/');
  }

  trackById(_: number, h: Hito) { return h.id; }
}
