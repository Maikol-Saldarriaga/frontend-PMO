import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ServerTimeService } from '../../../../../../core/services/server-time.service';
import {
  ProjectSnapshotItem, Snapshot, SnapshotRequest, ScopeSnapshotsResponse,
  ScopeComponent, ScopeActivity, CheckpointPeriodicity, GenerateSnapshotsRequest,
  BudgetReportParams, DateRange,
} from '../../../../models/project.model';
import { environment } from '../../../../../../../environments/environment';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';

interface FlatActivity {
  id:            string;
  act:           number;
  description:   string;
  componentId:   string;
  componentName: string;
  percentage:    number;
  progress:      number;
}

interface ScopeBounds {
  start_date:        string;
  end_date:          string;
  actual_start_date: string | null;
  actual_end_date:   string | null;
}

/** El backend puede enviar fechas con hora/zona ("2026-05-01T00:00:00Z"); <input type="date"> solo respeta min/max en formato "YYYY-MM-DD". */
function toDateOnly(s: string | null | undefined): string | null {
  return s ? s.slice(0, 10) : null;
}

interface SnapshotForm {
  start_date:   string;
  end_date:     string;
  planned_pct:  number | null;
  observation:  string;
}

const emptyForm = (): SnapshotForm => ({
  start_date:  '',
  end_date:    '',
  planned_pct: null,
  observation: '',
});

interface AutoForm {
  periodicity: CheckpointPeriodicity;
  custom_days: number | null;
}

const emptyAutoForm = (): AutoForm => ({
  periodicity: 'mensual',
  custom_days: null,
});

interface ExcludedRangeDraft {
  start_date: string;
  end_date:   string;
}

interface RebalanceRow {
  id: string | null; // null = el período pendiente de crear (uno que se edita ya trae su propio id)
  start_date: string;
  end_date: string;
  percentage: number;
}

@Component({
  selector: 'app-tab-seguimiento-tecnico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-seguimiento-tecnico.component.html',
})
export class TabSeguimientoTecnicoComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  constructor(
    private svc: ProjectService,
    private timeSvc: ServerTimeService,
    private confirmDialog: ConfirmDialogService,
    private auth: AuthStore,
  ) {}

  /** Hora real (internet, vía NTP en el backend / worldtimeapi en el front), no el reloj local. */
  nowDate = signal<Date>(new Date());

  // ── Reporte de seguimiento técnico (mismo estilo/panel que el de Facturación) ──
  reportPanelOpen = signal(false);
  reportMode: 'month' | 'range' = 'month';
  reportFormat: 'pdf' | 'xlsx' = 'pdf';
  reportYear = new Date().getFullYear();
  reportMonth = new Date().getMonth() + 1;
  reportFromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  reportToDate = new Date().toISOString().slice(0, 10);
  reportGenerating = signal(false);
  reportError = signal<string | null>(null);
  readonly reportYearOptions = (() => {
    const y = new Date().getFullYear();
    const years: number[] = [];
    for (let i = y - 3; i <= y + 1; i++) years.push(i);
    return years;
  })();
  readonly reportMonthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  openReportPanel(): void {
    this.reportError.set(null);
    this.reportPanelOpen.set(true);
  }
  closeReportPanel(): void {
    this.reportPanelOpen.set(false);
  }

  generateReport(): void {
    if (this.reportGenerating()) return;
    if (this.reportMode === 'range' && this.reportFromDate > this.reportToDate) {
      this.reportError.set('La fecha inicial no puede ser posterior a la final.');
      return;
    }
    this.reportGenerating.set(true);
    this.reportError.set(null);

    const params: BudgetReportParams = this.reportMode === 'month'
      ? { format: this.reportFormat, year: this.reportYear, month: this.reportMonth }
      : { format: this.reportFormat, from_date: this.reportFromDate, to_date: this.reportToDate };

    this.svc.downloadTrackingReportDoc(this.projectId, params).subscribe({
      next: blob => {
        this.reportGenerating.set(false);
        const period = this.reportMode === 'month'
          ? `${this.reportYear}-${String(this.reportMonth).padStart(2, '0')}`
          : `${this.reportFromDate}_${this.reportToDate}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-seguimiento-${period}.${this.reportFormat}`;
        a.click();
        URL.revokeObjectURL(url);
        this.closeReportPanel();
      },
      error: () => {
        this.reportGenerating.set(false);
        this.reportError.set('No se pudo generar el reporte. Verifica que haya datos en el período seleccionado.');
      },
    });
  }

  allSnapshots    = signal<ProjectSnapshotItem[]>([]);
  countsByActivity = signal<Record<string, number>>({});
  scopeComponents = signal<ScopeComponent[]>([]);
  loading        = signal(true);
  error          = signal<string | null>(null);

  selectedActivity = signal<FlatActivity | null>(null);
  activitySnaps    = signal<Snapshot[]>([]);
  scopeBounds      = signal<ScopeBounds | null>(null);
  snapsLoading     = signal(false);

  showForm    = signal(false);
  editingSnap = signal<Snapshot | null>(null);
  form: SnapshotForm = emptyForm();
  saving      = signal(false);
  saveError   = signal<string | null>(null);

  // ── Distribución automática de períodos ──────────────────────────────────
  showAutoForm   = signal(false);
  autoForm: AutoForm = emptyAutoForm();
  autoPreviewList = signal<Snapshot[] | null>(null);
  autoLoading     = signal(false);
  autoError       = signal<string | null>(null);
  /** Rangos sin seguimiento: se excluyen tanto del cálculo automático como de los períodos ya guardados. */
  excludedRanges  = signal<ExcludedRangeDraft[]>([]);
  newExcludedRange: ExcludedRangeDraft = { start_date: '', end_date: '' };
  excludedRangeError = signal<string | null>(null);

  // ── Eliminar períodos ya registrados (individual o por rango) ────────────
  showDeleteRangeForm = signal(false);
  deleteRangeForm: ExcludedRangeDraft = { start_date: '', end_date: '' };
  deleteRangeLoading = signal(false);
  deleteRangeError   = signal<string | null>(null);

  activities = computed<FlatActivity[]>(() =>
    this.scopeComponents().flatMap(c =>
      c.scopes.map(a => ({
        id:            a.id,
        act:           a.act,
        description:   a.description,
        componentId:   c.id,
        componentName: c.name,
        percentage:    a.percentage,
        progress:      a.progress,
      }))
    )
  );

  snapshotCount = computed(() => this.allSnapshots().length);

  activitiesWithSnaps = computed(() => {
    return this.activities().filter(a => this.hasSnap(a.componentName, a.id, a.act)).length;
  });

  avgCompliance = computed(() => {
    const snaps = this.allSnapshots().filter(s => s.actual_pct !== null && s.planned_pct > 0);
    if (!snaps.length) return 0;
    const sum = snaps.reduce((acc, s) => acc + (s.actual_pct! / s.planned_pct) * 100, 0);
    return Math.round(sum / snaps.length);
  });

  activitiesTotal = computed(() => this.activities().length);

  // ── Totales acumulados de la actividad seleccionada ─────────────────────────

  totalPlanned = computed(() => {
    const sum = this.activitySnaps().reduce((s, x) => s + x.planned_pct, 0);
    return Math.round(sum * 10) / 10;
  });
  totalActual = computed(() => {
    const sum = this.activitySnaps().reduce((s, x) => s + (x.actual_pct ?? 0), 0);
    return Math.round(sum * 10) / 10;
  });

  // ── Límites reales de fecha (extensión si aplica) ───────────────────────────

  effectiveStart = computed(() => {
    const b = this.scopeBounds();
    return b ? toDateOnly(b.actual_start_date || b.start_date) : null;
  });
  effectiveEnd = computed(() => {
    const b = this.scopeBounds();
    return b ? toDateOnly(b.actual_end_date || b.end_date) : null;
  });

  ngOnInit(): void {
    this.load();
    this.timeSvc.getNow().subscribe(now => this.nowDate.set(now));
  }

  /**
   * Igual que en Entregables: si ya pasó el end_date y ya tiene actual_pct registrado, el backend rechaza la edición de fechas.
   * `environment.allowPastEdits` (espejo de ALLOW_PAST_EDITS del backend) permite que un ADMIN
   * siga editando pasada la fecha; para cualquier otro rol el bloqueo aplica siempre.
   */
  isSnapshotLocked(snap: Snapshot): boolean {
    if (snap.actual_pct === null || snap.actual_pct === undefined) return false;
    const end = toDateOnly(snap.end_date);
    if (!end) return false;
    const today = this.nowDate().toISOString().slice(0, 10);
    if (end >= today) return false;
    return !(environment.allowPastEdits && this.auth.user()?.role === 'ADMIN');
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    let done = 0;
    const check = () => { if (++done === 2) this.loading.set(false); };

    this.svc.getProjectSnapshots(this.projectId).subscribe({
      next:  r => {
        this.allSnapshots.set(r?.checkpoints ?? []);
        this.countsByActivity.set(r?.counts_by_activity ?? {});
        check();
      },
      error: () => { this.error.set('No se pudieron cargar los períodos.'); check(); },
    });

    this.svc.getScopeComponents(this.projectId).subscribe({
      next:  r => {
        const normalized = (r.components ?? []).map((c: any) => ({
          ...c,
          scopes: [...(c.activities ?? c.scopes ?? [])].sort((a, b) => (a.act ?? 0) - (b.act ?? 0)),
        }));
        this.scopeComponents.set(normalized);
        check();
      },
      error: () => check(),
    });
  }

  selectActivity(act: FlatActivity): void {
    if (this.selectedActivity()?.id === act.id) return;
    this.selectedActivity.set(act);
    this.activitySnaps.set([]);
    this.scopeBounds.set(null);
    this.showForm.set(false);
    this.showAutoForm.set(false);
    this.showDeleteRangeForm.set(false);
    this.loadActivitySnapshots(act.id);
  }

  private loadActivitySnapshots(activityId: string): void {
    this.snapsLoading.set(true);
    this.svc.getScopeSnapshots(this.projectId, activityId).subscribe({
      next:  (r: ScopeSnapshotsResponse) => {
        this.activitySnaps.set(r.checkpoints ?? []);
        this.scopeBounds.set({
          start_date:        r.start_date,
          end_date:          r.end_date,
          actual_start_date: r.actual_start_date,
          actual_end_date:   r.actual_end_date,
        });
        this.snapsLoading.set(false);
      },
      error: () => this.snapsLoading.set(false),
    });
  }

  openNewForm(): void {
    this.form = { ...emptyForm(), start_date: this.effectiveStart() ?? '', end_date: this.effectiveEnd() ?? '' };
    this.editingSnap.set(null);
    this.showAutoForm.set(false);
    this.showDeleteRangeForm.set(false);
    this.showForm.set(true);
    this.saveError.set(null);
  }

  openEditForm(snap: Snapshot): void {
    if (this.isSnapshotLocked(snap)) return;
    this.form = {
      start_date:  toDateOnly(snap.start_date) ?? '',
      end_date:    toDateOnly(snap.end_date)   ?? '',
      planned_pct: snap.planned_pct,
      observation: '',
    };
    this.editingSnap.set(snap);
    this.showAutoForm.set(false);
    this.showDeleteRangeForm.set(false);
    this.showForm.set(true);
    this.saveError.set(null);
  }

  cancelForm(): void { this.showForm.set(false); this.editingSnap.set(null); this.saveError.set(null); }

  /** Botón eliminar solo visible para ADMIN. Activo si el proyecto no está terminado (!locked),
   * o si está terminado pero la edición pasada la fecha está habilitada (mismo criterio que [[isSnapshotLocked]]). */
  canSeeDeleteSnapshot(): boolean {
    return this.auth.user()?.role === 'ADMIN';
  }

  canDeleteSnapshot(): boolean {
    if (!this.locked) return true;
    return environment.allowPastEdits;
  }

  deletingSnapId = signal<string | null>(null);

  // ── Distribución automática de períodos ──────────────────────────────────

  autoPreviewTotalPct = computed(() => {
    const list = this.autoPreviewList();
    if (!list) return 0;
    return Math.round(list.reduce((s, x) => s + x.planned_pct, 0) * 100) / 100;
  });

  openAutoForm(): void {
    this.autoForm = emptyAutoForm();
    this.autoPreviewList.set(null);
    this.autoError.set(null);
    this.excludedRanges.set([]);
    this.newExcludedRange = { start_date: '', end_date: '' };
    this.excludedRangeError.set(null);
    this.showForm.set(false);
    this.showDeleteRangeForm.set(false);
    this.showAutoForm.set(true);
  }

  cancelAutoForm(): void {
    this.showAutoForm.set(false);
    this.autoPreviewList.set(null);
    this.autoError.set(null);
    this.excludedRanges.set([]);
  }

  addExcludedRange(): void {
    const { start_date, end_date } = this.newExcludedRange;
    this.excludedRangeError.set(null);
    if (!start_date || !end_date) {
      this.excludedRangeError.set('Indica fecha inicio y fecha fin del rango a excluir.');
      return;
    }
    if (end_date < start_date) {
      this.excludedRangeError.set('La fecha fin del rango no puede ser anterior a la fecha inicio.');
      return;
    }
    const minDate = this.effectiveStart();
    const maxDate = this.effectiveEnd();
    if ((minDate && start_date < minDate) || (maxDate && end_date > maxDate)) {
      this.excludedRangeError.set('El rango excluido debe estar dentro del período de la actividad.');
      return;
    }
    const overlap = this.excludedRanges().some(r => start_date <= r.end_date && end_date >= r.start_date);
    if (overlap) {
      this.excludedRangeError.set('Ese rango se superpone con otro rango excluido ya agregado.');
      return;
    }
    this.excludedRanges.update(list => [...list, { start_date, end_date }].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    this.newExcludedRange = { start_date: '', end_date: '' };
    this.autoPreviewList.set(null);
  }

  removeExcludedRange(idx: number): void {
    this.excludedRanges.update(list => list.filter((_, i) => i !== idx));
    this.autoPreviewList.set(null);
  }

  previewAutoGenerate(): void {
    const act = this.selectedActivity();
    if (!act) return;
    if (this.autoForm.periodicity === 'personalizado' && (!this.autoForm.custom_days || this.autoForm.custom_days <= 0)) {
      this.autoError.set('Indica cada cuántos días se debe repetir el período.');
      return;
    }
    const req: GenerateSnapshotsRequest = {
      periodicity: this.autoForm.periodicity,
      custom_days: this.autoForm.custom_days ?? undefined,
      preview: true,
      excluded_ranges: this.excludedRanges(),
    };
    this.autoLoading.set(true);
    this.autoError.set(null);
    this.svc.generateSnapshots(this.projectId, act.id, req).subscribe({
      next: r => {
        this.autoPreviewList.set(r.checkpoints ?? []);
        this.autoLoading.set(false);
      },
      error: err => {
        this.autoError.set(err?.error?.error ?? err?.error?.message ?? 'No se pudieron calcular los períodos.');
        this.autoLoading.set(false);
      },
    });
  }

  async confirmAutoGenerate(): Promise<void> {
    const act = this.selectedActivity();
    const preview = this.autoPreviewList();
    if (!act || !preview) return;
    const replace = this.activitySnaps().length > 0;
    if (replace && !(await this.confirmDialog.confirm({ message: `Esto reemplazará los ${this.activitySnaps().length} período(s) existentes de esta actividad por los ${preview.length} generados automáticamente. ¿Continuar?` }))) {
      return;
    }
    const req: GenerateSnapshotsRequest = {
      periodicity: this.autoForm.periodicity,
      custom_days: this.autoForm.custom_days ?? undefined,
      preview: false,
      replace,
      excluded_ranges: this.excludedRanges(),
    };
    this.autoLoading.set(true);
    this.autoError.set(null);
    this.svc.generateSnapshots(this.projectId, act.id, req).subscribe({
      next: () => {
        this.autoLoading.set(false);
        this.showAutoForm.set(false);
        this.autoPreviewList.set(null);
        this.excludedRanges.set([]);
        this.loadActivitySnapshots(act.id);
        this.load();
      },
      error: err => {
        this.autoError.set(err?.error?.error ?? err?.error?.message ?? 'No se pudieron guardar los períodos.');
        this.autoLoading.set(false);
      },
    });
  }

  // ── Eliminar períodos ya registrados ──────────────────────────────────────

  async deleteSnapshot(snap: Snapshot): Promise<void> {
    const act = this.selectedActivity();
    if (!act || !snap.id || !this.canDeleteSnapshot() || this.isSnapshotLocked(snap)) return;
    const label = `${(snap.start_date || '').slice(0, 10)} → ${(snap.end_date || '').slice(0, 10)}`;
    if (!(await this.confirmDialog.confirm({ message: `¿Eliminar el período ${label}? Esta acción no se puede deshacer.`, variant: 'danger' }))) {
      return;
    }
    this.deletingSnapId.set(snap.id);
    this.svc.deleteSnapshot(this.projectId, act.id, snap.id).subscribe({
      next: () => {
        this.deletingSnapId.set(null);
        this.activitySnaps.update(list => list.filter(s => s.id !== snap.id));
        this.allSnapshots.update(list => list.filter(s => s.id_checkpoint !== snap.id));
        this.load();
      },
      error: err => {
        this.deletingSnapId.set(null);
        this.error.set(err?.error?.error ?? err?.error?.message ?? 'No se pudo eliminar el período.');
      },
    });
  }

  openDeleteRangeForm(): void {
    this.deleteRangeForm = { start_date: '', end_date: '' };
    this.deleteRangeError.set(null);
    this.showForm.set(false);
    this.showAutoForm.set(false);
    this.showDeleteRangeForm.set(true);
  }

  cancelDeleteRangeForm(): void {
    this.showDeleteRangeForm.set(false);
    this.deleteRangeError.set(null);
  }

  async confirmDeleteRange(): Promise<void> {
    const act = this.selectedActivity();
    if (!act) return;
    const { start_date, end_date } = this.deleteRangeForm;
    this.deleteRangeError.set(null);
    if (!start_date || !end_date) {
      this.deleteRangeError.set('Indica fecha inicio y fecha fin del rango a eliminar.');
      return;
    }
    if (end_date < start_date) {
      this.deleteRangeError.set('La fecha fin no puede ser anterior a la fecha inicio.');
      return;
    }
    const affected = this.activitySnaps().filter(s => {
      const s0 = toDateOnly(s.start_date)!, s1 = toDateOnly(s.end_date)!;
      return start_date <= s1 && end_date >= s0;
    });
    if (affected.length === 0) {
      this.deleteRangeError.set('Ningún período registrado se solapa con ese rango.');
      return;
    }
    if (!(await this.confirmDialog.confirm({ message: `Se eliminarán ${affected.length} período(s) que se solapan con ${start_date} → ${end_date}. ¿Continuar?` }))) {
      return;
    }
    this.deleteRangeLoading.set(true);
    const range: DateRange = { start_date, end_date };
    this.svc.deleteSnapshotsByRange(this.projectId, act.id, range).subscribe({
      next: () => {
        this.deleteRangeLoading.set(false);
        this.showDeleteRangeForm.set(false);
        this.loadActivitySnapshots(act.id);
        this.load();
      },
      error: err => {
        this.deleteRangeLoading.set(false);
        this.deleteRangeError.set(err?.error?.error ?? err?.error?.message ?? 'No se pudieron eliminar los períodos.');
      },
    });
  }

  /** Observación obligatoria solo si se alarga el end_date más allá del que ya tenía el checkpoint (extensión real). */
  requiresObservation(): boolean {
    const original = this.editingSnap();
    if (!original) return false;
    const originalStart = toDateOnly(original.start_date);
    const originalEnd   = toDateOnly(original.end_date);
    if (!originalEnd) return false;
    const extendedEnd = this.form.end_date > originalEnd;
    const today = this.nowDate().toISOString().slice(0, 10);
    const wasOverdue = originalEnd < today;
    const datesChanged = this.form.start_date !== originalStart || this.form.end_date !== originalEnd;
    return extendedEnd || (wasOverdue && datesChanged);
  }

  saveSnapshot(): void {
    const act = this.selectedActivity();
    if (!act) return;
    if (!this.form.start_date || !this.form.end_date || this.form.planned_pct === null) {
      this.saveError.set('Completa los campos obligatorios.');
      return;
    }
    if (this.form.end_date < this.form.start_date) {
      this.saveError.set('La fecha fin no puede ser anterior a la fecha inicio.');
      return;
    }
    const minDate = this.effectiveStart();
    const maxDate = this.effectiveEnd();
    if (minDate && this.form.start_date < minDate) {
      this.saveError.set(`La fecha inicio no puede ser anterior a ${minDate}.`);
      return;
    }
    if (maxDate && this.form.end_date > maxDate) {
      this.saveError.set(`La fecha fin no puede superar ${maxDate}.`);
      return;
    }
    if (this.requiresObservation() && !this.form.observation.trim()) {
      this.saveError.set('La observación es obligatoria al extender la fecha fin de este período.');
      return;
    }

    const original = this.editingSnap();
    const isSame = (s: Snapshot) => original
      ? ((original.id && s.id) ? s.id === original.id : (s.start_date === original.start_date && s.end_date === original.end_date))
      : false;
    const overlap = this.activitySnaps().some(s => {
      if (isSame(s)) return false;
      const existingStart = toDateOnly(s.start_date)!;
      const existingEnd   = toDateOnly(s.end_date)!;
      return this.form.start_date <= existingEnd && this.form.end_date >= existingStart;
    });
    if (overlap) {
      this.saveError.set('Ese rango de fechas se superpone con un período existente de esta actividad.');
      return;
    }

    const othersSum = this.activitySnaps()
      .filter(s => !isSame(s))
      .reduce((sum, s) => sum + s.planned_pct, 0);
    if (othersSum + this.form.planned_pct > 100) {
      this.openRebalance();
      return;
    }

    this.performSaveSnapshot(act, original);
  }

  private performSaveSnapshot(act: FlatActivity, original: Snapshot | null): void {
    const req: SnapshotRequest = {
      id:          original?.id,
      start_date:  this.form.start_date,
      end_date:    this.form.end_date,
      planned_pct: this.form.planned_pct!,
      observation: this.requiresObservation() ? this.form.observation.trim() : undefined,
    };

    this.saving.set(true);
    this.saveError.set(null);
    this.svc.upsertSnapshot(this.projectId, act.id, req).subscribe({
      next: saved => {
        this.activitySnaps.update(list => {
          const idx = original
            ? list.findIndex(s => (original.id && s.id) ? s.id === original.id : (s.start_date === original.start_date && s.end_date === original.end_date))
            : -1;
          const next = idx >= 0 ? list.map((s, i) => i === idx ? saved : s) : [...list, saved];
          return next.sort((a, b) => a.start_date.localeCompare(b.start_date));
        });
        this.allSnapshots.update(list => {
          const idx = original
            ? list.findIndex(s => s.id_activity === act.id && ((original.id && s.id_checkpoint) ? s.id_checkpoint === original.id : (s.start_date === original.start_date && s.end_date === original.end_date)))
            : -1;
          const existing = idx >= 0 ? list[idx] : null;
          const item: ProjectSnapshotItem = {
            id_checkpoint:        saved.id ?? existing?.id_checkpoint ?? '',
            id_activity:          act.id,
            act:                  act.act,
            activity_name:        act.description,
            description:          act.description,
            id_component:         act.componentId,
            component_name:       act.componentName,
            is_completed:         existing?.is_completed ?? false,
            start_date:           saved.start_date,
            end_date:             saved.end_date,
            planned_pct:          saved.planned_pct,
            actual_pct:           saved.actual_pct,
            notes:                saved.notes ?? null,
            verifications_count:  existing?.verifications_count ?? 0,
          };
          return idx >= 0 ? list.map((s, i) => i === idx ? item : s) : [...list, item];
        });
        this.showForm.set(false);
        this.editingSnap.set(null);
        this.saving.set(false);
      },
      error: err => {
        const msg = err?.status === 403
          ? 'Solo un administrador puede extender fechas ya vencidas.'
          : (err?.error?.error ?? err?.error?.message ?? 'Error al guardar el período.');
        this.saveError.set(msg);
        this.saving.set(false);
      },
    });
  }

  // ── Reorganizar % (mismo patrón que Alcance, cuando el planeado supera 100%) ────

  rebalanceMode    = signal(false);
  rebalanceRows    = signal<RebalanceRow[]>([]);
  rebalanceSaving  = signal(false);
  rebalanceError   = signal<string | null>(null);

  rebalanceSum = computed(() => Math.round(this.rebalanceRows().reduce((s, r) => s + (r.percentage ?? 0), 0) * 100) / 100);

  openRebalance(): void {
    const original = this.editingSnap();
    const rows: RebalanceRow[] = this.activitySnaps()
      .filter(s => !(original && s.id === original.id))
      .map(s => ({ id: s.id ?? null, start_date: s.start_date, end_date: s.end_date, percentage: s.planned_pct }));
    rows.push({ id: original?.id ?? null, start_date: this.form.start_date, end_date: this.form.end_date, percentage: this.form.planned_pct ?? 0 });
    this.rebalanceRows.set(rows);
    this.rebalanceError.set(null);
    this.rebalanceMode.set(true);
  }

  updateRebalanceRow(index: number, value: number): void {
    this.rebalanceRows.update(rows => rows.map((r, i) => i === index ? { ...r, percentage: value } : r));
  }

  closeRebalance(): void {
    this.rebalanceMode.set(false);
    this.rebalanceRows.set([]);
    this.rebalanceError.set(null);
    this.rebalanceSaving.set(false);
  }

  confirmRebalance(): void {
    if (this.rebalanceSum() !== 100) {
      this.rebalanceError.set('La suma de porcentajes debe ser exactamente 100%.');
      return;
    }
    const act = this.selectedActivity();
    if (!act) return;

    const rows = this.rebalanceRows();
    const pendingId = this.editingSnap()?.id ?? null;
    const bulkItems = rows
      .filter(r => r.id && r.id !== pendingId)
      .map(r => ({ id: r.id!, planned_pct: r.percentage }));
    const pendingRow = rows.find(r => r.id === pendingId) ?? rows[rows.length - 1];

    this.rebalanceSaving.set(true);
    this.rebalanceError.set(null);

    const proceed = () => {
      this.form.planned_pct = pendingRow.percentage;
      const original = this.editingSnap();
      this.closeRebalance();
      this.performSaveSnapshot(act, original);
    };

    if (!bulkItems.length) { proceed(); return; }

    this.svc.rebalanceCheckpointPct(this.projectId, act.id, bulkItems, pendingRow.percentage).subscribe({
      next: () => {
        this.activitySnaps.update(list => list.map(s => {
          const match = bulkItems.find(b => b.id === s.id);
          return match ? { ...s, planned_pct: match.planned_pct } : s;
        }));
        proceed();
      },
      error: err => {
        this.rebalanceError.set(err?.error?.error ?? 'Error al reorganizar los períodos.');
        this.rebalanceSaving.set(false);
      },
    });
  }

  variacion(snap: Snapshot): number {
    return Math.round(((snap.actual_pct ?? 0) - snap.planned_pct) * 10) / 10;
  }

  cumplimiento(snap: Snapshot): number {
    if (!snap.planned_pct) return 100;
    return Math.round(((snap.actual_pct ?? 0) / snap.planned_pct) * 100);
  }

  estado(snap: Snapshot): 'pendiente' | 'retrasado' | 'en-tiempo' | 'adelantado' {
    if (snap.actual_pct === null || snap.actual_pct === undefined) return 'pendiente';
    if (snap.actual_pct < snap.planned_pct) return 'retrasado';
    if (snap.actual_pct > snap.planned_pct) return 'adelantado';
    return 'en-tiempo';
  }

  /** Relleno (real) siempre a escala del planeado = 100%. Capeado en 100 para no desbordar la barra. */
  barFillRatio(snap: Snapshot): number {
    const actual = snap.actual_pct ?? 0;
    if (!snap.planned_pct) return actual > 0 ? 100 : 0;
    return Math.min((actual / snap.planned_pct) * 100, 100);
  }

  /** Color del relleno según estado: rojo atrasado, verde a tiempo, morado si hay adelanto. */
  barFillColor(snap: Snapshot): string {
    const actual = snap.actual_pct ?? 0;
    if (actual > snap.planned_pct) return 'bg-purple-400';
    if (actual === snap.planned_pct) return 'bg-emerald-500';
    return 'bg-red-400';
  }

  /**
   * counts_by_activity ya viene correctamente indexado por activity_id real; se respalda buscando por id_activity
   * si llegara a faltar. OJO: nunca usar component_name+act como respaldo — el número de "acto" no es único entre
   * actividades de un mismo componente, así que un solo registro terminaba contando como registro para TODAS las
   * actividades de ese componente que compartieran el mismo número de acto.
   */
  hasSnap(componentName: string, actId: string, act: number): boolean {
    return this.snapCount(componentName, actId, act) > 0;
  }

  snapCount(componentName: string, actId: string, act: number): number {
    const direct = this.countsByActivity()[actId];
    if (direct !== undefined) return direct;
    return this.allSnapshots().filter(s => s.id_activity === actId).length;
  }
}
