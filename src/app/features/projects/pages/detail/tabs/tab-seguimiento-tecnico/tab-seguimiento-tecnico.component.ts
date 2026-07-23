import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ServerTimeService } from '../../../../../../core/services/server-time.service';
import {
  ProjectSnapshotItem, Snapshot, SnapshotRequest, ScopeSnapshotsResponse,
  ScopeComponent, ScopeActivity, CheckpointPeriodicity, GenerateSnapshotsRequest,
} from '../../../../models/project.model';
import { environment } from '../../../../../../../environments/environment';

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

@Component({
  selector: 'app-tab-seguimiento-tecnico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-seguimiento-tecnico.component.html',
})
export class TabSeguimientoTecnicoComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService, private timeSvc: ServerTimeService) {}

  /** Hora real (internet, vía NTP en el backend / worldtimeapi en el front), no el reloj local. */
  nowDate = signal<Date>(new Date());

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
   * `environment.enforceDeliveryDateLocks` permite desactivar esta restricción temporalmente (ej. pruebas).
   */
  isSnapshotLocked(snap: Snapshot): boolean {
    if (!environment.enforceDeliveryDateLocks) return false;
    if (snap.actual_pct === null || snap.actual_pct === undefined) return false;
    const end = toDateOnly(snap.end_date);
    if (!end) return false;
    const today = this.nowDate().toISOString().slice(0, 10);
    return end < today;
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
        const normalized = (r.components ?? []).map((c: any) => ({ ...c, scopes: c.activities ?? c.scopes ?? [] }));
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
    this.showForm.set(true);
    this.saveError.set(null);
  }

  cancelForm(): void { this.showForm.set(false); this.editingSnap.set(null); this.saveError.set(null); }

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
    this.showForm.set(false);
    this.showAutoForm.set(true);
  }

  cancelAutoForm(): void {
    this.showAutoForm.set(false);
    this.autoPreviewList.set(null);
    this.autoError.set(null);
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

  confirmAutoGenerate(): void {
    const act = this.selectedActivity();
    const preview = this.autoPreviewList();
    if (!act || !preview) return;
    const replace = this.activitySnaps().length > 0;
    if (replace && !confirm(`Esto reemplazará los ${this.activitySnaps().length} período(s) existentes de esta actividad por los ${preview.length} generados automáticamente. ¿Continuar?`)) {
      return;
    }
    const req: GenerateSnapshotsRequest = {
      periodicity: this.autoForm.periodicity,
      custom_days: this.autoForm.custom_days ?? undefined,
      preview: false,
      replace,
    };
    this.autoLoading.set(true);
    this.autoError.set(null);
    this.svc.generateSnapshots(this.projectId, act.id, req).subscribe({
      next: () => {
        this.autoLoading.set(false);
        this.showAutoForm.set(false);
        this.autoPreviewList.set(null);
        this.loadActivitySnapshots(act.id);
        this.load();
      },
      error: err => {
        this.autoError.set(err?.error?.error ?? err?.error?.message ?? 'No se pudieron guardar los períodos.');
        this.autoLoading.set(false);
      },
    });
  }

  /** Observación obligatoria solo si se alarga el end_date más allá del que ya tenía el checkpoint (extensión real). */
  requiresObservation(): boolean {
    const original = this.editingSnap();
    if (!original) return false;
    const originalEnd = toDateOnly(original.end_date);
    return !!originalEnd && this.form.end_date > originalEnd;
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

    const req: SnapshotRequest = {
      id:          original?.id,
      start_date:  this.form.start_date,
      end_date:    this.form.end_date,
      planned_pct: this.form.planned_pct,
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
