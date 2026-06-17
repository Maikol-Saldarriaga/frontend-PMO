import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import {
  BudgetWizardResponse,
  BudgetWizardScope,
  BudgetItemRequest,
} from '../../models/project.model';

export interface ActivityRow {
  scope_id:          string;
  act:               number;
  act_description:   string;
  start_date:        string | null;
  end_date:          string | null;
  concept:                  string;
  budget_description:       string;
  unit_measurement:         string;
  unit_value:               number | null;
  quantity:                 number | null;
  total_value:              number;
  counterpart_contribution: number | null;
  ally_contribution:        number | null;
  active:     boolean;
  expanded:   boolean;
  dirty:      boolean;
  saving:     boolean;
  existingId:  string | null;
  rowError:    string | null;
  rowSuccess:  boolean;
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

  compTotal(s: ComponentSection): number {
    return s.rows.reduce((acc, r) => acc + r.total_value, 0);
  }
  compTotalCP(s: ComponentSection): number {
    return s.rows.reduce((acc, r) => acc + (r.counterpart_contribution ?? 0), 0);
  }
  compTotalAlly(s: ComponentSection): number {
    return s.rows.reduce((acc, r) => acc + (r.ally_contribution ?? 0), 0);
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
        concept:                  scope.budget?.concept                  ?? '',
        budget_description:       (scope.budget as any)?.description     ?? '',
        unit_measurement:         scope.budget?.unit_measurement          ?? '',
        unit_value:               scope.budget?.unit_value                ?? null,
        quantity:                 scope.budget?.quantity                  ?? null,
        total_value:              scope.budget?.total_value               ?? 0,
        counterpart_contribution: scope.budget?.counterpart_contribution  ?? null,
        ally_contribution:        scope.budget?.ally_contribution         ?? null,
        active:     scope.budget !== null,
        expanded:   false,
        dirty:      false,
        saving:     false,
        existingId:  scope.budget?.id ?? null,
        rowError:    null,
        rowSuccess:  false,
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
  }

  markDirty(row: ActivityRow): void { row.dirty = true; row.rowSuccess = false; row.rowError = null; }

  recalcTotal(row: ActivityRow): void {
    row.total_value = (row.unit_value ?? 0) * (row.quantity ?? 0);
    row.dirty = true; row.rowSuccess = false; row.rowError = null;
  }

  toggleExpand(row: ActivityRow): void { row.expanded = !row.expanded; }

  // ── Guardar individual ────────────────────────────────────────────────────

  saveRow(row: ActivityRow): void {
    if (!row.active || !row.dirty || row.saving) return;

    const missing: string[] = [];
    if (!row.concept?.trim())          missing.push('Concepto');
    if (!row.unit_measurement?.trim()) missing.push('Unidad de medida');
    if (!row.quantity)                 missing.push('Cantidad');
    if (!row.unit_value)               missing.push('Valor unitario');

    if (missing.length) {
      row.rowError = `Requeridos: ${missing.join(', ')}`;
      return;
    }

    row.rowError = null;
    row.saving = true;

    const payload: BudgetItemRequest = {
      scope_id:                 row.scope_id,
      concept:                  row.concept.trim(),
      description:              row.budget_description,
      unit_measurement:         row.unit_measurement.trim(),
      unit_value:               row.unit_value   ?? 0,
      quantity:                 row.quantity     ?? 0,
      total_value:              row.total_value,
      counterpart_contribution: row.counterpart_contribution ?? 0,
      ally_contribution:        row.ally_contribution        ?? 0,
    };

    const request$ = row.existingId
      ? this.service.updateBudgetItem(this.projectId, row.existingId, payload)
      : this.service.createBudgetItem(this.projectId, payload);

    request$.subscribe({
      next: (res) => {
        if (!row.existingId) row.existingId = res.id;
        row.dirty      = false;
        row.saving     = false;
        row.rowSuccess = true;
        row.rowError   = null;
        this.refreshWizardMeta();
      },
      error: () => {
        row.saving = false;
        this.saveMsg.set('Error al guardar. Verifica los datos.');
        setTimeout(() => this.saveMsg.set(null), 4000);
      },
    });
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────

  deleteRow(row: ActivityRow): void {
    if (!row.existingId) { this.deactivateRow(row); return; }

    this.service.deleteBudgetItem(this.projectId, row.existingId).subscribe({
      next: () => {
        row.existingId = null;
        row.active = false;
        row.dirty  = false;
        row.saving = false;
        row.concept = ''; row.budget_description = ''; row.unit_measurement = '';
        row.unit_value = null; row.quantity = null; row.total_value = 0;
        row.counterpart_contribution = null; row.ally_contribution = null;
        this.refreshWizardMeta();
      },
      error: () => {
        this.saveMsg.set('Error al eliminar el presupuesto.');
        setTimeout(() => this.saveMsg.set(null), 4000);
      },
    });
  }

  private refreshWizardMeta(): void {
    this.service.getBudgetWizard(this.projectId).subscribe({
      next: (w) => {
        this.wizard.set(w);
        w.components.forEach(comp => {
          const sec = this.sections.find(s => s.component_id === comp.component_id);
          if (sec) sec.is_complete = comp.is_complete;
        });
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard/projects', this.projectId], { queryParams: { tab: 'presupuesto' } });
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(v);
  }

  monthName(m: number): string {
    return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m - 1] ?? '';
  }

  trackByComp(_: number, s: ComponentSection) { return s.component_id; }
  trackByRow (_: number, r: ActivityRow)       { return r.scope_id;     }
  trackByIdx (i: number)                       { return i;               }
}
