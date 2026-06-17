import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import {
  ProjectSnapshotItem, Snapshot, SnapshotRequest,
  ScopeComponent, ScopeActivity,
} from '../../../../models/project.model';

const MONTH_NAMES = [
  '', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

interface FlatActivity {
  id:            string;
  act:           number;
  description:   string;
  componentId:   string;
  componentName: string;
  percentage:    number;
  progress:      number;
}

interface SnapshotForm {
  year:         number;
  month:        number;
  planned_pct:  number | null;
  actual_pct:   number | null;
  notes:        string;
}

const emptyForm = (): SnapshotForm => ({
  year:        new Date().getFullYear(),
  month:       new Date().getMonth() + 1,
  planned_pct: null,
  actual_pct:  null,
  notes:       '',
});

@Component({
  selector: 'app-tab-seguimiento-tecnico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-seguimiento-tecnico.component.html',
})
export class TabSeguimientoTecnicoComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService) {}

  allSnapshots   = signal<ProjectSnapshotItem[]>([]);
  scopeComponents = signal<ScopeComponent[]>([]);
  loading        = signal(true);
  error          = signal<string | null>(null);

  selectedActivity = signal<FlatActivity | null>(null);
  activitySnaps    = signal<Snapshot[]>([]);
  snapsLoading     = signal(false);

  showForm    = signal(false);
  editingSnap = signal<Snapshot | null>(null);
  form: SnapshotForm = emptyForm();
  saving      = signal(false);
  saveError   = signal<string | null>(null);

  readonly MONTH_NAMES = MONTH_NAMES;
  readonly MONTHS = Array.from({ length: 12 }, (_, i) => ({ val: i + 1, label: MONTH_NAMES[i + 1] }));
  readonly YEARS  = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i);

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
    const ids = new Set(this.allSnapshots().map(s => s.scope_id));
    return ids.size;
  });

  avgCompliance = computed(() => {
    const snaps = this.allSnapshots().filter(s => s.planned_pct > 0);
    if (!snaps.length) return 0;
    const sum = snaps.reduce((acc, s) => acc + (s.actual_pct / s.planned_pct) * 100, 0);
    return Math.round(sum / snaps.length);
  });

  activitiesTotal = computed(() => this.activities().length);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    let done = 0;
    const check = () => { if (++done === 2) this.loading.set(false); };

    this.svc.getProjectSnapshots(this.projectId).subscribe({
      next:  r => { this.allSnapshots.set(r ?? []); check(); },
      error: () => { this.error.set('No se pudieron cargar los snapshots.'); check(); },
    });

    this.svc.getScopeComponents(this.projectId).subscribe({
      next:  r => { this.scopeComponents.set(r.components ?? []); check(); },
      error: () => check(),
    });
  }

  selectActivity(act: FlatActivity): void {
    if (this.selectedActivity()?.id === act.id) return;
    this.selectedActivity.set(act);
    this.activitySnaps.set([]);
    this.showForm.set(false);
    this.snapsLoading.set(true);
    this.svc.getScopeSnapshots(this.projectId, act.id).subscribe({
      next:  r => { this.activitySnaps.set(r ?? []); this.snapsLoading.set(false); },
      error: () => this.snapsLoading.set(false),
    });
  }

  openNewForm(): void {
    this.form = emptyForm();
    this.editingSnap.set(null);
    this.showForm.set(true);
    this.saveError.set(null);
  }

  openEditForm(snap: Snapshot): void {
    this.form = {
      year:        snap.year,
      month:       snap.month,
      planned_pct: snap.planned_pct,
      actual_pct:  snap.actual_pct,
      notes:       snap.notes ?? '',
    };
    this.editingSnap.set(snap);
    this.showForm.set(true);
    this.saveError.set(null);
  }

  cancelForm(): void { this.showForm.set(false); this.editingSnap.set(null); this.saveError.set(null); }

  saveSnapshot(): void {
    const act = this.selectedActivity();
    if (!act) return;
    if (this.form.planned_pct === null || this.form.actual_pct === null) {
      this.saveError.set('Completa los campos obligatorios.');
      return;
    }
    const req: SnapshotRequest = {
      year:        this.form.year,
      month:       this.form.month,
      planned_pct: this.form.planned_pct,
      actual_pct:  this.form.actual_pct,
      notes:       this.form.notes || null,
    };
    this.saving.set(true);
    this.saveError.set(null);
    this.svc.upsertSnapshot(this.projectId, act.id, req).subscribe({
      next: saved => {
        this.activitySnaps.update(list => {
          const idx = list.findIndex(s => s.year === saved.year && s.month === saved.month);
          return idx >= 0 ? list.map((s, i) => i === idx ? saved : s) : [...list, saved]
            .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
        });
        this.allSnapshots.update(list => {
          const idx = list.findIndex(s => s.scope_id === act.id && s.year === saved.year && s.month === saved.month);
          const item: ProjectSnapshotItem = { ...saved, scope_id: act.id, component_name: act.componentName, act: act.act, description: act.description };
          return idx >= 0 ? list.map((s, i) => i === idx ? item : s) : [...list, item];
        });
        this.showForm.set(false);
        this.editingSnap.set(null);
        this.saving.set(false);
      },
      error: err => {
        this.saveError.set(err?.error?.message ?? 'Error al guardar el snapshot.');
        this.saving.set(false);
      },
    });
  }

  variacion(snap: Snapshot): number {
    return Math.round((snap.actual_pct - snap.planned_pct) * 10) / 10;
  }

  cumplimiento(snap: Snapshot): number {
    if (!snap.planned_pct) return 100;
    return Math.round((snap.actual_pct / snap.planned_pct) * 100);
  }

  estado(snap: Snapshot): 'retrasado' | 'en-tiempo' | 'adelantado' {
    if (snap.actual_pct < snap.planned_pct) return 'retrasado';
    if (snap.actual_pct > snap.planned_pct) return 'adelantado';
    return 'en-tiempo';
  }

  monthLabel(m: number): string { return MONTH_NAMES[m] ?? String(m); }

  hasSnap(actId: string): boolean {
    return this.allSnapshots().some(s => s.scope_id === actId);
  }
}
