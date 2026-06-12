import { Component, inject, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import {
  BudgetWizardResponse,
  BudgetWizardScope,
  BudgetMonthlyDistribution,
  BudgetBulkItem,
} from '../../models/project.model';

export interface ActivityRow {
  // Campos de la actividad/alcance (readonly, vienen del wizard)
  scope_id:          string;
  act:               number;
  act_description:   string;   // descripción de la actividad
  start_date:        string | null;
  end_date:          string | null;
  // Campos del presupuesto (editables)
  concept:                  string;
  budget_description:       string;
  unit_measurement:         string;
  unit_value:               number | null;
  quantity:                 number | null;
  total_value:              number;
  counterpart_contribution: number | null;
  ally_contribution:        number | null;
  monthly_distributions:    BudgetMonthlyDistribution[];
  // UI
  active:     boolean;
  expanded:   boolean;
  dirty:      boolean;
  existingId: string | null;
}

export interface ComponentSection {
  component_id: string;
  name:         string;
  is_complete:  boolean;
  rows:         ActivityRow[];
}

@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './budget.component.html',
})
export class BudgetComponent implements OnInit {
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);
  private service = inject(ProjectService);

  projectId = '';

  wizard  = signal<BudgetWizardResponse | null>(null);
  loading = signal(true);
  saving  = signal(false);
  error   = signal<string | null>(null);
  saveMsg = signal<string | null>(null);

  sections: ComponentSection[] = [];

  // ── KPIs ─────────────────────────────────────────────────────────────────

  get allRows(): ActivityRow[] { return this.sections.flatMap(s => s.rows); }

  get totalPresupuesto(): number {
    return this.allRows.reduce((s, r) => s + r.total_value, 0);
  }
  get totalContraparte(): number {
    return this.allRows.reduce((s, r) => s + (r.counterpart_contribution ?? 0), 0);
  }
  get totalAliado(): number {
    return this.allRows.reduce((s, r) => s + (r.ally_contribution ?? 0), 0);
  }
  get ejecucionPct(): number {
    return this.totalPresupuesto
      ? Math.round((this.totalContraparte / this.totalPresupuesto) * 100)
      : 0;
  }
  get hasDirty(): boolean { return this.allRows.some(r => r.dirty); }

  compTotal(s: ComponentSection): number {
    return s.rows.reduce((acc, r) => acc + r.total_value, 0);
  }
  compTotalCP(s: ComponentSection): number {
    return s.rows.reduce((acc, r) => acc + (r.counterpart_contribution ?? 0), 0);
  }
  compTotalAlly(s: ComponentSection): number {
    return s.rows.reduce((acc, r) => acc + (r.ally_contribution ?? 0), 0);
  }
  distTotalCP(row: ActivityRow): number {
    return row.monthly_distributions.reduce((s, d) => s + d.counterpart_amount, 0);
  }
  distTotalAlly(row: ActivityRow): number {
    return row.monthly_distributions.reduce((s, d) => s + d.ally_amount, 0);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/dashboard/projects']); return; }

    this.service.getBudgetWizard(this.projectId).subscribe({
      next: (w) => {
        this.wizard.set(w);
        this.sections = this.mapWizard(w);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el presupuesto.');
        this.loading.set(false);
      },
    });
  }

  private mapWizard(w: BudgetWizardResponse): ComponentSection[] {
    return (w.components ?? []).map(comp => ({
      component_id: comp.component_id,
      name:         comp.name,
      is_complete:  comp.is_complete,
      rows: (comp.scopes ?? []).map((scope: BudgetWizardScope) => ({
        scope_id:                 scope.scope_id,
        act:                      scope.act,
        act_description:          scope.description,
        start_date:               scope.start_date,
        end_date:                 scope.end_date,
        concept:                  scope.budget?.concept                 ?? '',
        budget_description:       (scope.budget as any)?.description    ?? '',
        unit_measurement:         scope.budget?.unit_measurement         ?? '',
        unit_value:               scope.budget?.unit_value               ?? null,
        quantity:                 scope.budget?.quantity                 ?? null,
        total_value:              scope.budget?.total_value              ?? 0,
        counterpart_contribution: scope.budget?.counterpart_contribution ?? null,
        ally_contribution:        scope.budget?.ally_contribution        ?? null,
        monthly_distributions:    [...(scope.budget?.monthly_distributions ?? [])],
        active:     scope.budget !== null,
        expanded:   false,
        dirty:      false,
        existingId: scope.budget?.id ?? null,
      } as ActivityRow)),
    }));
  }

  // ── Edición ───────────────────────────────────────────────────────────────

  activateRow(row: ActivityRow): void {
    row.active = true;
    row.dirty  = true;
  }

  deactivateRow(row: ActivityRow): void {
    if (row.existingId) return;
    row.active = false; row.dirty = false;
    row.concept = ''; row.budget_description = ''; row.unit_measurement = '';
    row.unit_value = null; row.quantity = null; row.total_value = 0;
    row.counterpart_contribution = null; row.ally_contribution = null;
    row.monthly_distributions = [];
  }

  markDirty(row: ActivityRow): void { row.dirty = true; }

  recalcTotal(row: ActivityRow): void {
    row.total_value = (row.unit_value ?? 0) * (row.quantity ?? 0);
    row.dirty = true;
  }

  toggleExpand(row: ActivityRow): void { row.expanded = !row.expanded; }

  // ── Distribuciones mensuales ──────────────────────────────────────────────

  addMonth(row: ActivityRow): void {
    const last = row.monthly_distributions.at(-1);
    let year  = last?.year  ?? new Date().getFullYear();
    let month = (last?.month ?? 0) + 1;
    if (month > 12) { month = 1; year++; }
    row.monthly_distributions.push({ year, month, counterpart_amount: 0, ally_amount: 0 });
    row.dirty = true;
  }

  removeMonth(row: ActivityRow, mi: number): void {
    row.monthly_distributions.splice(mi, 1);
    row.dirty = true;
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  saveAll(): void {
    const items: BudgetBulkItem[] = this.sections.flatMap((sec, si) =>
      sec.rows.filter(r => r.active).map((row, ri) => ({
        component_id:             sec.component_id,
        schedule_activity_id:     row.scope_id,
        concept:                  row.concept || row.act_description,
        description:              row.budget_description,
        unit_measurement:         row.unit_measurement,
        unit_value:               row.unit_value   ?? 0,
        quantity:                 row.quantity     ?? 0,
        total_value:              row.total_value,
        counterpart_contribution: row.counterpart_contribution ?? 0,
        ally_contribution:        row.ally_contribution        ?? 0,
        sort_order:               si * 100 + ri,
        monthly_distributions:    row.monthly_distributions,
      }))
    );

    this.saving.set(true);
    this.saveMsg.set(null);
    this.service.saveBudgetBulk(this.projectId, { items }).subscribe({
      next: () => {
        this.saving.set(false);
        this.sections.forEach(s => s.rows.forEach(r => r.dirty = false));
        this.saveMsg.set('Presupuesto guardado correctamente.');
        setTimeout(() => this.saveMsg.set(null), 4000);
      },
      error: () => {
        this.saving.set(false);
        this.saveMsg.set('Error al guardar. Verifica los datos.');
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard/projects', this.projectId]);
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(v);
  }

  monthName(m: number): string {
    return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m - 1] ?? '';
  }

  months = [1,2,3,4,5,6,7,8,9,10,11,12];

  trackByComp(_: number, s: ComponentSection) { return s.component_id; }
  trackByRow (_: number, r: ActivityRow)       { return r.scope_id;     }
  trackByIdx (i: number)                       { return i;               }
}
