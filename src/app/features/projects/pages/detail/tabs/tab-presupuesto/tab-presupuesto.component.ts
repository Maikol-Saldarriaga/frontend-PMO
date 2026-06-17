import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProjectService } from '../../../../services/project.service';
import { BudgetWizardResponse, BudgetWizardScope, BudgetWizardComponent } from '../../../../models/project.model';

const PALETTE = ['#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];

@Component({
  selector: 'app-tab-presupuesto',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-presupuesto.component.html',
})
export class TabPresupuestoComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService, private rtr: Router) {}

  budgetWizard  = signal<BudgetWizardResponse | null>(null);
  budgetLoading = signal(true);

  budgetComponentTotals = computed(() => {
    const w = this.budgetWizard();
    if (!w) return [];
    return w.components.map(comp => ({
      name: comp.name,
      is_complete: comp.is_complete,
      total: comp.scopes.reduce((s: number, sc: BudgetWizardScope) => s + (sc.budget?.total_value ?? 0), 0),
      scopes: comp.scopes.length,
      filled: comp.scopes.filter((sc: BudgetWizardScope) => sc.budget !== null).length,
    }));
  });

  budgetGrandTotal = computed(() => this.budgetComponentTotals().reduce((s: number, c: { total: number }) => s + c.total, 0));

  ngOnInit(): void {
    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: (w: BudgetWizardResponse) => { this.budgetWizard.set(w); this.budgetLoading.set(false); },
      error: () => this.budgetLoading.set(false),
    });
  }

  openBudgetEditor(): void  { this.rtr.navigate(['/dashboard/projects', this.projectId, 'budget']); }
  openMonthlyEditor(): void { this.rtr.navigate(['/dashboard/projects', this.projectId, 'monthly']); }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }
  formatCompact(v: number): string {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  }
  color(i: number): string { return PALETTE[i % PALETTE.length]; }

  scopesWithBudget(scopes: { budget: unknown | null }[]): number {
    return scopes.filter(s => s.budget !== null).length;
  }
  sumScopeField(scopes: BudgetWizardScope[], field: keyof NonNullable<BudgetWizardScope['budget']>): number {
    return scopes.reduce((sum, s) => sum + (s.budget ? (s.budget[field] as number ?? 0) : 0), 0);
  }
  sumAllComponents(components: BudgetWizardComponent[], field: keyof NonNullable<BudgetWizardScope['budget']>): number {
    return components.reduce((sum, c) => sum + this.sumScopeField(c.scopes, field), 0);
  }
}
