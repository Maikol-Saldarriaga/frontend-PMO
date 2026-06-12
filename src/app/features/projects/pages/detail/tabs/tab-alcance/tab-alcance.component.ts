import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ScopeComponent, ScopeActivity, ActivityFormData, UpdateScopeRequest, CreateComponentRequest } from '../../../../models/project.model';

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

  editingActivityId = signal<string | null>(null);
  editActivityForm: ActivityFormData = EMPTY_ACTIVITY_FORM();

  addingActivityToCompId = signal<string | null>(null);
  newActivityForm: ActivityFormData = EMPTY_ACTIVITY_FORM();

  addingComponent    = signal(false);
  newComponentName   = signal('');
  newComponentPct    = signal<number | null>(null);
  editingCompId      = signal<string | null>(null);
  editingCompName    = signal('');

  ngOnInit(): void { this.load(); }

  load(): void {
    this.scopeLoading.set(true);
    this.scopeError.set(null);
    this.svc.getScopeComponents(this.projectId).subscribe({
      next: (res: any) => {
        // Soporta shape nuevo { project_progress, components } y el shape plano anterior
        const raw: any[] = Array.isArray(res) ? res : (res.components ?? []);
        this.projectProgress.set(res.project_progress ?? 0);

        const normalized: ScopeComponent[] = raw.map((c: any) => ({
          id:         c.id ?? c.component_id,
          name:       c.name ?? c.component,
          percentage: c.percentage ?? 0,
          progress:   c.progress ?? 0,
          scopes: (c.scopes ?? c.acts ?? []).map((a: any) => ({
            id:                  a.id,
            contract_agreement_id: a.contract_agreement_id ?? null,
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
            objective:           a.objective ?? null,
            responsible:         a.responsible ?? null,
            is_completed:        a.is_completed ?? false,
          })),
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

  // ── Editar actividad existente ───────────────────────────────────────────────

  startEditActivity(act: ScopeActivity): void {
    this.editingActivityId.set(act.id);
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
  }

  cancelEditActivity(): void { this.editingActivityId.set(null); }

  saveEditActivity(comp: ScopeComponent): void {
    const f   = this.editActivityForm;
    const req: UpdateScopeRequest = {
      acts: [{
        id:                this.editingActivityId()!,
        description:       f.description,
        percentage:        f.percentage ?? undefined,
        start_date:        f.start_date  ? `${f.start_date}T00:00:00Z`  : null,
        end_date:          f.end_date    ? `${f.end_date}T00:00:00Z`    : null,
        start_plan:        f.start_plan,
        responsible:       f.responsible || null,
        objective:         f.objective   || null,
        actual_start_date: f.actual_start_date ? `${f.actual_start_date}T00:00:00Z` : null,
        actual_end_date:   f.actual_end_date   ? `${f.actual_end_date}T00:00:00Z`   : null,
        actual_start_plan: f.actual_start_plan,
        delete: false,
      }],
    };
    this.scopeSaving.set(true);
    this.saveError.set(null);
    this.svc.updateComponentScopes(this.projectId, comp.id, req).subscribe({
      next: updated => {
        this.scopeComponents.update(list => list.map(c =>
          c.id === comp.id ? { ...c, ...updated, scopes: updated.scopes ?? c.scopes } : c
        ));
        this.editingActivityId.set(null);
        this.scopeSaving.set(false);
      },
      error: (err) => {
        this.saveError.set(err?.error?.message ?? 'Error al guardar. Verifica los porcentajes.');
        this.scopeSaving.set(false);
      },
    });
  }

  deleteActivity(comp: ScopeComponent, actId: string): void {
    if (!confirm('¿Eliminar esta actividad?')) return;
    this.svc.updateComponentScopes(this.projectId, comp.id, { acts: [{ id: actId, delete: true }] }).subscribe({
      next: updated => this.scopeComponents.update(list => list.map(c =>
        c.id === comp.id ? { ...c, ...updated, scopes: updated.scopes ?? c.scopes } : c
      )),
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
    if (!f.description.trim() || !f.start_date || !f.end_date) return;
    this.scopeSaving.set(true);
    this.saveError.set(null);
    this.svc.createScope(this.projectId, comp.id, {
      act:         f.act ?? 1,
      description: f.description,
      percentage:  f.percentage ?? 0,
      start_date:  `${f.start_date}T00:00:00Z`,
      end_date:    `${f.end_date}T00:00:00Z`,
      start_plan:  f.start_plan,
      responsible: f.responsible || null,
      objective:   f.objective   || null,
    }).subscribe({
      next: newAct => {
        this.scopeComponents.update(list => list.map(c =>
          c.id === comp.id ? { ...c, scopes: [...c.scopes, newAct] } : c
        ));
        this.addingActivityToCompId.set(null);
        this.scopeSaving.set(false);
      },
      error: (err) => {
        this.saveError.set(err?.error?.message ?? 'Error al guardar. Verifica que el % del componente no supere 100.');
        this.scopeSaving.set(false);
      },
    });
  }

  // ── Editar nombre de componente ──────────────────────────────────────────────

  startEditCompName(comp: ScopeComponent): void {
    this.editingCompId.set(comp.id);
    this.editingCompName.set(comp.name);
  }

  saveCompName(comp: ScopeComponent): void {
    const name = this.editingCompName().trim();
    if (!name) return;
    this.scopeSaving.set(true);
    this.svc.updateComponentScopes(this.projectId, comp.id, { name, acts: [] }).subscribe({
      next: updated => {
        this.scopeComponents.update(list => list.map(c =>
          c.id === comp.id ? { ...c, name: updated.name } : c
        ));
        this.editingCompId.set(null);
        this.scopeSaving.set(false);
      },
      error: () => this.scopeSaving.set(false),
    });
  }

  // ── Nuevo componente ─────────────────────────────────────────────────────────

  saveNewComponent(): void {
    const name = this.newComponentName().trim();
    const pct  = this.newComponentPct() ?? 0;
    if (!name) return;
    const req: CreateComponentRequest = { component_name: name, component_id: null, percentage: pct, acts: [] };
    this.scopeSaving.set(true);
    this.saveError.set(null);
    this.svc.createComponent(this.projectId, req).subscribe({
      next: () => {
        this.addingComponent.set(false);
        this.newComponentName.set('');
        this.newComponentPct.set(null);
        this.load();
        this.scopeSaving.set(false);
      },
      error: (err) => {
        this.saveError.set(err?.error?.message ?? 'Error al crear. Verifica que la suma de % no supere 100.');
        this.scopeSaving.set(false);
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

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
