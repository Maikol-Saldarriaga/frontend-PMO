import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { ProjectService } from '../../../../services/project.service';
import { ScopeComponent, ScopeActivity, ActivityFormData, ActivityRequest } from '../../../../models/project.model';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';

const BUDGET_EDIT_ROLES = ['ADMIN', 'COORDINADOR'];

interface RebalanceRow {
  id: string | null; // null = el nuevo elemento pendiente de crear
  name: string;
  percentage: number;
}

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
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './tab-alcance.component.html',
})
export class TabAlcanceComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  private auth = inject(AuthStore);

  readonly canEditBudget = computed(() => BUDGET_EDIT_ROLES.includes(this.auth.user()?.role ?? ''));

  constructor(private svc: ProjectService, private confirmDialog: ConfirmDialogService) {}

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
  newComponentBudget = signal<number | null>(null);

  editingCompId    = signal<string | null>(null);
  editingCompName  = signal('');
  editingCompPct   = signal<number | null>(null);
  editingCompBudget = signal<number | null>(null);

  // ── Rebalanceo de porcentajes (límite 100%) ──────────────────────────────────
  rebalanceMode    = signal<'component' | 'activity' | null>(null);
  rebalanceCompId  = signal<string | null>(null);
  rebalanceRows    = signal<RebalanceRow[]>([]);
  rebalanceSaving  = signal(false);
  rebalanceError   = signal<string | null>(null);
  // Si no es null, el rebalanceo viene de EDITAR un elemento existente (no de crear uno nuevo):
  // todas las filas ya tienen id, incluida la editada, así que al confirmar solo se actualiza,
  // sin crear nada.
  rebalanceEditId  = signal<string | null>(null);

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
          } as ScopeActivity)).sort((a: ScopeActivity, b: ScopeActivity) => (a.act ?? 0) - (b.act ?? 0)),
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
    if (this.usedComponentPct() + pct > 100) {
      this.openComponentRebalance(name, pct);
      return;
    }
    this.scopeSaving.set(true);
    this.saveError.set(null);
    const budget = this.canEditBudget() ? this.newComponentBudget() : null;
    this.svc.createComponent(this.projectId, { name, percentage: pct, budget }).subscribe({
      next: () => {
        this.addingComponent.set(false);
        this.newComponentName.set('');
        this.newComponentPct.set(null);
        this.newComponentBudget.set(null);
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

  editingCompOrder = signal<number | null>(null);

  startEditComp(comp: ScopeComponent): void {
    this.editingCompId.set(comp.id);
    this.editingCompName.set(comp.name);
    this.editingCompPct.set(comp.percentage);
    this.editingCompBudget.set(comp.budget ?? null);
    this.editingCompOrder.set(this.scopeComponents().findIndex(c => c.id === comp.id) + 1);
    this.saveError.set(null);
  }

  cancelEditComp(): void { this.editingCompId.set(null); this.editingCompOrder.set(null); this.saveError.set(null); }

  /** Solo cambia el número pendiente en pantalla — no reordena ni llama al backend hasta Guardar. */
  bumpEditOrder(direction: -1 | 1): void {
    const total = this.scopeComponents().length;
    const current = this.editingCompOrder() ?? 1;
    this.editingCompOrder.set(Math.min(Math.max(current + direction, 1), total));
  }

  saveEditComp(comp: ScopeComponent): void {
    const name = this.editingCompName().trim();
    const pct  = this.editingCompPct() ?? comp.percentage;
    if (!name) return;
    const othersSum = this.usedComponentPct() - (comp.percentage ?? 0);
    if (othersSum + pct > 100) {
      this.openComponentEditRebalance(comp, name, pct);
      return;
    }
    this.scopeSaving.set(true);
    this.saveError.set(null);
    const budget = this.canEditBudget() ? this.editingCompBudget() : comp.budget ?? null;
    const currentIndex = this.scopeComponents().findIndex(c => c.id === comp.id);
    const total = this.scopeComponents().length;
    const newOrder = Math.min(Math.max(this.editingCompOrder() ?? currentIndex + 1, 1), total);

    this.svc.updateComponent(this.projectId, comp.id, { name, percentage: pct, budget }).subscribe({
      next: updated => {
        this.scopeComponents.update(list => list.map(c =>
          c.id === comp.id ? { ...c, name: updated.name, percentage: updated.percentage, budget: updated.budget } : c
        ));
        if (newOrder - 1 === currentIndex) {
          this.editingCompId.set(null);
          this.editingCompOrder.set(null);
          this.scopeSaving.set(false);
          return;
        }
        // Reordena en el propio arreglo, sin recargar todo el tab — el backend ya escalona
        // el resto de componentes internamente.
        this.svc.updateComponentOrder(this.projectId, comp.id, newOrder).subscribe({
          next: () => {
            this.scopeComponents.update(list => {
              const next = [...list];
              const [moved] = next.splice(currentIndex, 1);
              next.splice(newOrder - 1, 0, moved);
              return next;
            });
            this.editingCompId.set(null);
            this.editingCompOrder.set(null);
            this.scopeSaving.set(false);
          },
          error: err => {
            this.saveError.set(err?.error?.error ?? 'Error al reordenar el componente.');
            this.scopeSaving.set(false);
          },
        });
      },
      error: err => {
        this.saveError.set(err?.error?.message ?? 'Error al actualizar el componente.');
        this.scopeSaving.set(false);
      },
    });
  }

  // ── Eliminar componente ───────────────────────────────────────────────────────

  async deleteComponent(comp: ScopeComponent): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Eliminar el componente "${comp.name}" y todas sus actividades?` }))) return;
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
    const currentAct = comp.scopes.find(a => a.id === sid);
    const othersSum = this.usedScopePct(comp) - (currentAct?.percentage ?? 0);
    if (othersSum + (f.percentage ?? 0) > 100) {
      this.openActivityEditRebalance(comp, sid, f.percentage ?? 0);
      return;
    }
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

  async deleteActivity(comp: ScopeComponent, actId: string): Promise<void> {
    const act = comp.scopes.find(a => a.id === actId);
    if (!(await this.confirmDialog.confirm({
      title: 'Eliminar actividad',
      message: `¿Eliminar la actividad "${act?.description ?? ''}" del componente "${comp.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
    }))) return;
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
    const pct = f.percentage ?? 0;
    if (this.usedScopePct(comp) + pct > 100) {
      this.openActivityRebalance(comp, pct);
      return;
    }
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

  formatBudget(value: number | null): string {
    return value === null || value === undefined || isNaN(value) ? '' : value.toLocaleString('es-CO');
  }

  /** Dasharray del círculo: a partir de 99.95% se pinta cerrado sin gap por redondeo. */
  dashArrayFor(pct: number): string {
    const clamped = Math.max(0, Math.min(100, pct ?? 0));
    if (clamped >= 99.95) return '113.1 0';
    return (clamped / 100 * 113.1) + ' 113.1';
  }

  /** Con dash completo el linecap "round" deja una costura visible; se usa "butt" al 100%. */
  linecapFor(pct: number): 'round' | 'butt' {
    return (pct ?? 0) >= 99.95 ? 'butt' : 'round';
  }

  // ── Rebalanceo de porcentajes ────────────────────────────────────────────────

  openComponentRebalance(newName: string, newPct: number): void {
    const rows: RebalanceRow[] = this.scopeComponents().map(c => ({ id: c.id, name: c.name, percentage: c.percentage ?? 0 }));
    rows.push({ id: null, name: newName, percentage: newPct });
    this.rebalanceRows.set(rows);
    this.rebalanceMode.set('component');
    this.rebalanceCompId.set(null);
    this.rebalanceEditId.set(null);
    this.rebalanceError.set(null);
  }

  openActivityRebalance(comp: ScopeComponent, newPct: number): void {
    const rows: RebalanceRow[] = comp.scopes.map(a => ({ id: a.id, name: a.description, percentage: a.percentage ?? 0 }));
    rows.push({ id: null, name: this.newActivityForm.description.trim() || 'Nueva actividad', percentage: newPct });
    this.rebalanceRows.set(rows);
    this.rebalanceMode.set('activity');
    this.rebalanceCompId.set(comp.id);
    this.rebalanceEditId.set(null);
    this.rebalanceError.set(null);
  }

  /** Editar un componente existente cuyo nuevo % lo haría superar el 100% junto al resto. Todas
   * las filas ya tienen id (incluida la editada, que muestra ya el % nuevo propuesto). */
  openComponentEditRebalance(comp: ScopeComponent, newName: string, newPct: number): void {
    const rows: RebalanceRow[] = this.scopeComponents().map(c => ({
      id: c.id, name: c.id === comp.id ? newName : c.name, percentage: c.id === comp.id ? newPct : (c.percentage ?? 0),
    }));
    this.rebalanceRows.set(rows);
    this.rebalanceMode.set('component');
    this.rebalanceCompId.set(null);
    this.rebalanceEditId.set(comp.id);
    this.rebalanceError.set(null);
  }

  /** Igual que arriba pero para editar una actividad existente dentro de un componente. */
  openActivityEditRebalance(comp: ScopeComponent, actId: string, newPct: number): void {
    const rows: RebalanceRow[] = comp.scopes.map(a => ({
      id: a.id, name: a.id === actId ? (this.editActivityForm.description.trim() || a.description) : a.description,
      percentage: a.id === actId ? newPct : (a.percentage ?? 0),
    }));
    this.rebalanceRows.set(rows);
    this.rebalanceMode.set('activity');
    this.rebalanceCompId.set(comp.id);
    this.rebalanceEditId.set(actId);
    this.rebalanceError.set(null);
  }

  rebalanceSum(): number {
    return this.rebalanceRows().reduce((s, r) => s + (r.percentage ?? 0), 0);
  }

  updateRebalanceRow(index: number, value: number): void {
    const rows = this.rebalanceRows().map((r, i) => i === index ? { ...r, percentage: value } : r);
    this.rebalanceRows.set(rows);
  }

  closeRebalance(): void {
    this.rebalanceMode.set(null);
    this.rebalanceCompId.set(null);
    this.rebalanceEditId.set(null);
    this.rebalanceRows.set([]);
    this.rebalanceError.set(null);
    this.rebalanceSaving.set(false);
  }

  confirmRebalance(): void {
    const sum = Math.round(this.rebalanceSum() * 100) / 100;
    if (sum !== 100) {
      this.rebalanceError.set('La suma de porcentajes debe ser exactamente 100%.');
      return;
    }
    const mode = this.rebalanceMode();
    const rows = this.rebalanceRows();
    const editId = this.rebalanceEditId();
    this.rebalanceSaving.set(true);
    this.rebalanceError.set(null);

    if (mode === 'component') {
      const updates = rows.filter(r => r.id).map(r => this.svc.updateComponent(this.projectId, r.id!, { name: r.name, percentage: r.percentage }));
      const newRow = rows.find(r => !r.id);

      if (editId) {
        // Edición de un componente existente: todas las filas ya tienen id, solo se actualiza.
        forkJoin(updates.length ? updates : [of(null)]).subscribe({
          next: () => {
            this.closeRebalance();
            this.editingCompId.set(null);
            this.load();
          },
          error: err => {
            this.rebalanceError.set(err?.error?.message ?? 'Error al ajustar los componentes.');
            this.rebalanceSaving.set(false);
          },
        });
        return;
      }

      forkJoin(updates.length ? updates : [of(null)]).subscribe({
        next: () => {
          this.svc.createComponent(this.projectId, { name: newRow!.name, percentage: newRow!.percentage }).subscribe({
            next: () => {
              this.closeRebalance();
              this.addingComponent.set(false);
              this.newComponentName.set('');
              this.newComponentPct.set(null);
              this.load();
            },
            error: err => {
              this.rebalanceError.set(err?.error?.message ?? 'Error al crear el nuevo componente.');
              this.rebalanceSaving.set(false);
            },
          });
        },
        error: err => {
          this.rebalanceError.set(err?.error?.message ?? 'Error al ajustar los componentes existentes.');
          this.rebalanceSaving.set(false);
        },
      });
    } else if (mode === 'activity') {
      const compId = this.rebalanceCompId()!;
      const comp = this.scopeComponents().find(c => c.id === compId)!;
      const existing = rows.filter(r => r.id);
      const newRow = rows.find(r => !r.id);
      const updates = existing.map(r => {
        const act = comp.scopes.find(a => a.id === r.id)!;
        const base = r.id === editId ? this.editActivityForm : this.activityToForm(act);
        const req = this.buildActivityRequest({ ...base, description: r.name, percentage: r.percentage });
        return this.svc.updateScope(this.projectId, compId, r.id!, req!);
      });

      if (editId) {
        // Edición de una actividad existente: todas las filas ya tienen id, solo se actualiza.
        forkJoin(updates.length ? updates : [of(null)]).subscribe({
          next: () => {
            this.closeRebalance();
            this.editingActivityId.set(null);
            this.editActivityCompId.set(null);
            this.load();
          },
          error: err => {
            this.rebalanceError.set(err?.error?.message ?? 'Error al ajustar las actividades.');
            this.rebalanceSaving.set(false);
          },
        });
        return;
      }

      forkJoin(updates.length ? updates : [of(null)]).subscribe({
        next: () => {
          const nextAct = comp.scopes.reduce((max, a) => Math.max(max, a.act ?? 0), 0) + 1;
          const f = { ...this.newActivityForm, percentage: newRow!.percentage, act: nextAct };
          const req = this.buildActivityRequest(f);
          if (!req) { this.rebalanceSaving.set(false); return; }
          this.svc.createScope(this.projectId, compId, req).subscribe({
            next: () => {
              this.closeRebalance();
              this.addingActivityToCompId.set(null);
              this.load();
            },
            error: err => {
              this.rebalanceError.set(err?.error?.message ?? 'Error al crear la nueva actividad.');
              this.rebalanceSaving.set(false);
            },
          });
        },
        error: err => {
          this.rebalanceError.set(err?.error?.message ?? 'Error al ajustar las actividades existentes.');
          this.rebalanceSaving.set(false);
        },
      });
    }
  }

  private activityToForm(act: ScopeActivity): ActivityFormData {
    return {
      act: act.act, description: act.description, percentage: act.percentage,
      start_date: act.start_date ? act.start_date.slice(0, 10) : '',
      end_date: act.end_date ? act.end_date.slice(0, 10) : '',
      start_plan: act.start_plan, responsible: act.responsible ?? '', objective: act.objective ?? '',
      actual_start_date: act.actual_start_date ? act.actual_start_date.slice(0, 10) : '',
      actual_end_date: act.actual_end_date ? act.actual_end_date.slice(0, 10) : '',
      actual_start_plan: act.actual_start_plan ?? null,
    };
  }
}
