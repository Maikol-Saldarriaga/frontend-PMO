import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ScopeComponent, ScopeActivity, ActivityFormData, ActivityRequest } from '../../../../models/project.model';

const PALETTE = ['#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];

const EMPTY_ACTIVITY_FORM = (): ActivityFormData => ({
  act: null, description: '', percentage: null,
  start_date: '', end_date: '', start_plan: null,
  responsible: '', objective: '',
  actual_start_date: '', actual_end_date: '', actual_start_plan: null,
});

@Component({
  selector: 'app-tab-alcance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-alcance.component.html',
})
export class TabAlcanceComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService) {}

  projectProgress  = signal<number>(0);
  scopeComponents  = signal<ScopeComponent[]>([]);
  scopeLoading     = signal(false);
  scopeError       = signal<string | null>(null);
  scopeSaving      = signal(false);
  saveError        = signal<string | null>(null);
  expandedComps    = signal<Set<string>>(new Set());

  editingActivityId     = signal<string | null>(null);
  editActivityCompId    = signal<string | null>(null);
  editActivityForm: ActivityFormData = EMPTY_ACTIVITY_FORM();

  addingActivityToCompId = signal<string | null>(null);
  newActivityForm: ActivityFormData = EMPTY_ACTIVITY_FORM();

  addingComponent  = signal(false);
  newComponentName = signal('');
  newComponentPct  = signal<number | null>(null);

  editingCompId    = signal<string | null>(null);
  editingCompName  = signal('');
  editingCompPct   = signal<number | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.scopeLoading.set(true);
    this.scopeError.set(null);
    this.svc.getScopeComponents(this.projectId).subscribe({
      next: res => {
        this.projectProgress.set(res.project_progress ?? 0);
        const normalized: ScopeComponent[] = (res.components ?? []).map((c: any) => ({
          id:         c.id,
          name:       c.name,
          percentage: c.percentage ?? 0,
          budget:     c.budget ?? null,
          progress:   c.progress ?? 0,
          scopes: (c.activities ?? []).map((a: any) => ({
            id:                  a.id,
            component_id:        a.component_id ?? null,
            act:                 a.act,
            description:         a.description,
            percentage:          a.percentage ?? 0,
            progress:            a.progress ?? 0,
            start_date:          a.start_date ?? null,
            end_date:            a.end_date ?? null,
            actual_start_date:   a.actual_start_date ?? null,
            actual_end_date:     a.actual_end_date ?? null,
            start_plan:          a.start_plan ?? null,
            plan_duration:       a.plan_duration ?? null,
            actual_start_plan:   a.actual_start_plan ?? null,
            actual_plan_duration: a.actual_plan_duration ?? null,
            objective:           a.objective ?? null,
            responsible:         a.responsible ?? null,
            is_completed:        a.is_completed ?? false,
          } as ScopeActivity)),
        }));
        this.scopeComponents.set(normalized);
        this.expandedComps.set(new Set(normalized.map(c => c.id)));
        this.scopeLoading.set(false);
      },
      error: () => {
        this.scopeError.set('No se pudo cargar el alcance. Verifica la conexión.');
        this.scopeLoading.set(false);
      },
    });
  }

  // ── Expand/collapse ──────────────────────────────────────────────────────────

  toggleComp(id: string): void {
    const s = new Set(this.expandedComps());
    s.has(id) ? s.delete(id) : s.add(id);
    this.expandedComps.set(s);
  }

  // ── Crear componente ─────────────────────────────────────────────────────────

  saveNewComponent(): void {
    const name = this.newComponentName().trim();
    const pct  = this.newComponentPct() ?? 0;
    if (!name) return;
    this.scopeSaving.set(true);
    this.saveError.set(null);
    this.svc.createComponent(this.projectId, { name, percentage: pct }).subscribe({
      next: () => {
        this.addingComponent.set(false);
        this.newComponentName.set('');
        this.newComponentPct.set(null);
        this.load();
        this.scopeSaving.set(false);
      },
      error: err => {
        this.saveError.set(err?.error?.message ?? 'Error al crear. Verifica que la suma de % no supere 100.');
        this.scopeSaving.set(false);
      },
    });
  }

  // ── Editar componente ─────────────────────────────────────────────────────────

  startEditComp(comp: ScopeComponent): void {
    this.editingCompId.set(comp.id);
    this.editingCompName.set(comp.name);
    this.editingCompPct.set(comp.percentage);
    this.saveError.set(null);
  }

  cancelEditComp(): void { this.editingCompId.set(null); this.saveError.set(null); }

  saveEditComp(comp: ScopeComponent): void {
    const name = this.editingCompName().trim();
    const pct  = this.editingCompPct() ?? comp.percentage;
    if (!name) return;
    this.scopeSaving.set(true);
    this.saveError.set(null);
    this.svc.updateComponent(this.projectId, comp.id, { name, percentage: pct }).subscribe({
      next: updated => {
        this.scopeComponents.update(list => list.map(c =>
          c.id === comp.id ? { ...c, name: updated.name, percentage: updated.percentage } : c
        ));
        this.editingCompId.set(null);
        this.scopeSaving.set(false);
      },
      error: err => {
        this.saveError.set(err?.error?.message ?? 'Error al actualizar el componente.');
        this.scopeSaving.set(false);
      },
    });
  }

  // ── Eliminar componente ───────────────────────────────────────────────────────

  deleteComponent(comp: ScopeComponent): void {
    if (!confirm(`¿Eliminar el componente "${comp.name}" y todas sus actividades?`)) return;
    this.svc.deleteComponent(this.projectId, comp.id).subscribe({
      next: () => this.scopeComponents.update(list => list.filter(c => c.id !== comp.id)),
      error: err => this.saveError.set(err?.error?.message ?? 'Error al eliminar el componente.'),
    });
  }

  // ── Editar actividad ─────────────────────────────────────────────────────────

  startEditActivity(act: ScopeActivity, compId: string): void {
    this.editingActivityId.set(act.id);
    this.editActivityCompId.set(compId);
    Object.assign(this.editActivityForm, {
      act:               act.act,
      description:       act.description,
      percentage:        act.percentage,
      start_date:        act.start_date  ? act.start_date.slice(0, 10)  : '',
      end_date:          act.end_date    ? act.end_date.slice(0, 10)    : '',
      start_plan:        act.start_plan,
      responsible:       act.responsible ?? '',
      objective:         act.objective   ?? '',
      actual_start_date: act.actual_start_date ? act.actual_start_date.slice(0, 10) : '',
      actual_end_date:   act.actual_end_date   ? act.actual_end_date.slice(0, 10)   : '',
      actual_start_plan: act.actual_start_plan ?? null,
    });
    this.saveError.set(null);
  }

  cancelEditActivity(): void { this.editingActivityId.set(null); this.editActivityCompId.set(null); this.saveError.set(null); }

  saveEditActivity(comp: ScopeComponent): void {
    const f   = this.editActivityForm;
    const sid = this.editingActivityId()!;
    const req = this.buildActivityRequest(f);
    if (!req) return;
    this.scopeSaving.set(true);
    this.saveError.set(null);
    this.svc.updateScope(this.projectId, comp.id, sid, req).subscribe({
      next: updated => {
        this.scopeComponents.update(list => list.map(c =>
          c.id === comp.id
            ? { ...c, scopes: c.scopes.map(a => a.id === sid ? { ...a, ...updated } : a) }
            : c
        ));
        this.editingActivityId.set(null);
        this.editActivityCompId.set(null);
        this.scopeSaving.set(false);
      },
      error: err => {
        this.saveError.set(err?.error?.message ?? 'Error al guardar. Verifica los datos.');
        this.scopeSaving.set(false);
      },
    });
  }

  // ── Eliminar actividad ───────────────────────────────────────────────────────

  deleteActivity(comp: ScopeComponent, actId: string): void {
    if (!confirm('¿Eliminar esta actividad?')) return;
    this.svc.deleteScope(this.projectId, comp.id, actId).subscribe({
      next: () => this.scopeComponents.update(list => list.map(c =>
        c.id === comp.id ? { ...c, scopes: c.scopes.filter(a => a.id !== actId) } : c
      )),
      error: err => this.saveError.set(err?.error?.message ?? 'Error al eliminar la actividad.'),
    });
  }

  // ── Agregar actividad ────────────────────────────────────────────────────────

  startAddActivity(compId: string): void {
    this.addingActivityToCompId.set(compId);
    Object.assign(this.newActivityForm, EMPTY_ACTIVITY_FORM());
    this.saveError.set(null);
    const s = new Set(this.expandedComps());
    s.add(compId);
    this.expandedComps.set(s);
  }

  cancelAddActivity(): void { this.addingActivityToCompId.set(null); this.saveError.set(null); }

  saveNewActivity(comp: ScopeComponent): void {
    const f = this.newActivityForm;
    // Número de actividad = máximo act existente + 1, o 1 si no hay ninguno
    const nextAct = comp.scopes.reduce((max, a) => Math.max(max, a.act ?? 0), 0) + 1;
    f.act = nextAct;
    const req = this.buildActivityRequest(f);
    if (!req) return;
    this.scopeSaving.set(true);
    this.saveError.set(null);
    this.svc.createScope(this.projectId, comp.id, req).subscribe({
      next: newAct => {
        this.scopeComponents.update(list => list.map(c =>
          c.id === comp.id ? { ...c, scopes: [...c.scopes, newAct] } : c
        ));
        this.addingActivityToCompId.set(null);
        this.scopeSaving.set(false);
      },
      error: err => {
        this.saveError.set(err?.error?.message ?? 'Error al guardar. Verifica que el % no supere 100.');
        this.scopeSaving.set(false);
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private buildActivityRequest(f: ActivityFormData): ActivityRequest | null {
    if (!f.description.trim() || !f.start_date || !f.end_date || !f.objective.trim() || !f.responsible.trim()) return null;
    const hasActual = !!(f.actual_start_date || f.actual_end_date || f.actual_start_plan !== null);
    const req: ActivityRequest = {
      act:         f.act ?? 1,
      description: f.description.trim(),
      start_date:  `${f.start_date}T00:00:00Z`,
      end_date:    `${f.end_date}T00:00:00Z`,
      start_plan:  f.start_plan ?? 0,
      objective:   f.objective.trim(),
      responsible: f.responsible.trim(),
      percentage:  f.percentage ?? 0,
    };
    if (hasActual) {
      req.actual_start_date = f.actual_start_date ? `${f.actual_start_date}T00:00:00Z` : null;
      req.actual_end_date   = f.actual_end_date   ? `${f.actual_end_date}T00:00:00Z`   : null;
      req.actual_start_plan = f.actual_start_plan;
    }
    return req;
  }

  totalActivities(): number {
    return this.scopeComponents().reduce((s, c) => s + (c.scopes?.length ?? 0), 0);
  }

  usedComponentPct(): number {
    return this.scopeComponents().reduce((s, c) => s + (c.percentage ?? 0), 0);
  }

  usedScopePct(comp: ScopeComponent): number {
    return comp.scopes.reduce((s, a) => s + (a.percentage ?? 0), 0);
  }

  color(i: number): string { return PALETTE[i % PALETTE.length]; }
}
