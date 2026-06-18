import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { BudgetMonthlyDistribution, BudgetWizardScope } from '../../models/project.model';
import { MoneyMaskDirective } from '../../../../shared/directives/money-mask.directive';

export interface MonthlyRow {
  scope_id:          string;
  act:               number;
  description:       string;
  budget_id:         string | null;
  concept:           string;
  counterpartCap:    number;
  allyCap:           number;
  distributions:     BudgetMonthlyDistribution[];
  expanded:          boolean;
  dirty:             boolean;
  saving:            boolean;
  rowError:          string | null;
  rowSuccess:        boolean;
}

export interface MonthlySection {
  component_id: string;
  name:         string;
  rows:         MonthlyRow[];
}

@Component({
  selector: 'app-monthly',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './monthly.component.html',
})
export class MonthlyComponent implements OnInit {
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);
  private service = inject(ProjectService);

  projectId = '';

  loading  = signal(true);
  error    = signal<string | null>(null);
  sections: MonthlySection[] = [];

  months = [1,2,3,4,5,6,7,8,9,10,11,12];

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/dashboard/projects']); return; }

    this.service.getMonthlyWizard(this.projectId).subscribe({
      next: (w) => {
        this.sections = (w.components ?? []).map(comp => ({
          component_id: comp.component_id,
          name:         comp.name,
          rows: (comp.scopes ?? []).map((scope: BudgetWizardScope) => ({
            scope_id:      scope.scope_id,
            act:           scope.act,
            description:   scope.description,
            budget_id:     scope.budget?.id ?? null,
            concept:       scope.budget?.concept ?? '',
            counterpartCap: scope.budget?.counterpart_contribution ?? 0,
            allyCap:        scope.budget?.ally_contribution        ?? 0,
            distributions: [...(scope.budget?.monthly_distributions ?? [])],
            expanded:      false,
            dirty:         false,
            saving:        false,
            rowError:      null,
            rowSuccess:    false,
          } as MonthlyRow)),
        }));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la distribución mensual.');
        this.loading.set(false);
      },
    });
  }

  toggleExpand(row: MonthlyRow): void { row.expanded = !row.expanded; }

  markDirty(row: MonthlyRow): void {
    row.dirty = true; row.rowSuccess = false; row.rowError = null;
  }

  addMonth(row: MonthlyRow): void {
    const last = row.distributions.at(-1);
    let year  = last?.year  ?? new Date().getFullYear();
    let month = (last?.month ?? 0) + 1;
    if (month > 12) { month = 1; year++; }
    row.distributions.push({ year, month, counterpart_amount: 0, ally_amount: 0, executed_amount: 0, billed_amount: 0 });
    row.dirty = true; row.rowSuccess = false;
  }

  removeMonth(row: MonthlyRow, mi: number): void {
    row.distributions.splice(mi, 1);
    row.dirty = true; row.rowSuccess = false;
  }

  saveRow(row: MonthlyRow): void {
    if (!row.budget_id || !row.dirty || row.saving) return;

    const totalCP   = this.distTotalCP(row);
    const totalAlly = this.distTotalAlly(row);
    if (totalCP > row.counterpartCap) {
      row.rowError = `La contrapartida mensual (${this.formatCurrency(totalCP)}) no puede superar el total asignado (${this.formatCurrency(row.counterpartCap)}).`;
      return;
    }
    if (totalAlly > row.allyCap) {
      row.rowError = `El aporte aliado mensual (${this.formatCurrency(totalAlly)}) no puede superar el total asignado (${this.formatCurrency(row.allyCap)}).`;
      return;
    }

    row.saving = true; row.rowError = null;

    this.service.saveMonthlyBulk(this.projectId, row.budget_id, {
      distributions: row.distributions.map(d => ({
        year:               d.year,
        month:              d.month,
        counterpart_amount: d.counterpart_amount,
        ally_amount:        d.ally_amount,
        executed_amount:    d.executed_amount ?? 0,
        billed_amount:      d.billed_amount   ?? 0,
      })),
    }).subscribe({
      next: () => {
        row.dirty = false; row.saving = false; row.rowSuccess = true;
      },
      error: () => {
        row.saving = false;
        row.rowError = 'Error al guardar la distribución.';
      },
    });
  }

  distTotalCP(row: MonthlyRow): number {
    return row.distributions.reduce((s, d) => s + d.counterpart_amount, 0);
  }
  distTotalAlly(row: MonthlyRow): number {
    return row.distributions.reduce((s, d) => s + d.ally_amount, 0);
  }
  distTotalExecuted(row: MonthlyRow): number {
    return row.distributions.reduce((s, d) => s + (d.executed_amount ?? 0), 0);
  }
  distTotalBilled(row: MonthlyRow): number {
    return row.distributions.reduce((s, d) => s + (d.billed_amount ?? 0), 0);
  }

  goBack(): void {
    this.router.navigate(['/dashboard/projects', this.projectId], { queryParams: { tab: 'presupuesto' } });
  }

  monthName(m: number): string {
    return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m - 1] ?? '';
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(v);
  }

  trackByComp(_: number, s: MonthlySection) { return s.component_id; }
  trackByRow (_: number, r: MonthlyRow)     { return r.scope_id; }
  trackByIdx (i: number)                    { return i; }
}
