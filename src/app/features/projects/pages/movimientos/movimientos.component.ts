import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import {
  BudgetEntry, BudgetItem, BudgetMonthlyDistribution, BudgetWizardComponent,
  BudgetExecutionSummary, BudgetExecutionTimeSeries,
} from '../../models/project.model';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Un punto planeado/ejecutado para un período (year-month) — la unidad mínima que se
 * agrega hacia arriba (ítem → rubro → componente → general). */
export interface MonthlyPoint {
  year:      number;
  month:     number;
  label:     string;
  planeado:  number;
  ejecutado: number;
}

export interface ItemNode {
  id:             string;
  concept:        string;
  unit:           string | null;
  totalPlaneado:  number;
  totalEjecutado: number;
  pct:            number;
  months:         MonthlyPoint[];
  expanded:       boolean;
}

export interface RubroNode {
  id:             string;
  name:           string;
  totalPlaneado:  number;
  totalEjecutado: number;
  pct:            number;
  months:         MonthlyPoint[];
  items:          ItemNode[];
  expanded:       boolean;
}

export interface ComponentNode {
  id:             string;
  name:           string;
  totalPlaneado:  number;
  totalEjecutado: number;
  pct:            number;
  months:         MonthlyPoint[];
  rubros:         RubroNode[];
  expanded:       boolean;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Suma varias listas de MonthlyPoint en una sola, agrupando por year-month y ordenando
 * cronológicamente — así una fila de rubro/componente/general nunca queda desordenada
 * aunque sus ítems tengan períodos distintos entre sí. */
function mergeMonths(lists: MonthlyPoint[][]): MonthlyPoint[] {
  const map = new Map<string, MonthlyPoint>();
  for (const list of lists) {
    for (const p of list) {
      const key = monthKey(p.year, p.month);
      const existing = map.get(key);
      if (existing) {
        existing.planeado += p.planeado;
        existing.ejecutado += p.ejecutado;
      } else {
        map.set(key, { ...p });
      }
    }
  }
  return [...map.values()].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
}

function pct(ejecutado: number, planeado: number): number {
  return planeado > 0 ? Math.min(100, Math.round((ejecutado / planeado) * 1000) / 10) : 0;
}

@Component({
  selector: 'app-movimientos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './movimientos.component.html',
})
export class MovimientosComponent implements OnInit {
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);
  private service = inject(ProjectService);

  projectId = '';

  loading = signal(true);
  error   = signal<string | null>(null);

  generalSummary = signal<BudgetExecutionSummary | null>(null);
  generalSeries  = signal<BudgetExecutionTimeSeries[]>([]);
  components: ComponentNode[] = [];

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/projects']); return; }

    this.service.getBudgetWizard(this.projectId).subscribe({
      next: (w) => {
        this.generalSummary.set(w.execution?.summary ?? null);
        this.generalSeries.set(w.execution?.time_series ?? []);
        this.components = (w.components ?? []).map(comp => this.buildComponentNode(comp));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los movimientos del presupuesto.');
        this.loading.set(false);
      },
    });
  }

  private itemMonths(item: BudgetItem): MonthlyPoint[] {
    return [...(item.monthly_distributions ?? [])]
      .sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
      .map((d: BudgetMonthlyDistribution) => ({
        year: d.year, month: d.month, label: `${MONTH_NAMES[d.month - 1] ?? d.month} ${d.year}`,
        planeado: (d.counterpart_amount ?? 0) + (d.ally_amount ?? 0),
        ejecutado: d.executed_amount ?? 0,
      }));
  }

  private buildItemNode(item: BudgetItem): ItemNode {
    const months = this.itemMonths(item);
    const totalPlaneado = months.reduce((s, m) => s + m.planeado, 0);
    const totalEjecutado = months.reduce((s, m) => s + m.ejecutado, 0);
    return {
      id: item.id, concept: item.concept ?? '(sin nombre)', unit: item.unit_measurement,
      totalPlaneado, totalEjecutado, pct: pct(totalEjecutado, totalPlaneado),
      months, expanded: false,
    };
  }

  /** Algunos budget_components quedaron sin `name` en la base de datos (creados antes de
   * que ese campo existiera, o sin diligenciarlo en el wizard) — en vez de repetir un
   * genérico "(sin nombre)" indistinguible en cada fila, se numera dentro de su propio
   * componente técnico ("Rubro 1", "Rubro 2"...) para que al menos se puedan diferenciar. */
  private buildRubroNode(entry: BudgetEntry, index: number): RubroNode {
    const items = (entry.items ?? []).map(i => this.buildItemNode(i));
    const months = mergeMonths(items.map(i => i.months));
    const totalPlaneado = items.reduce((s, i) => s + i.totalPlaneado, 0);
    const totalEjecutado = items.reduce((s, i) => s + i.totalEjecutado, 0);
    const name = entry.name?.trim() ? entry.name : `Rubro ${index + 1} (sin nombre asignado)`;
    return {
      id: entry.budget_component_id, name,
      totalPlaneado, totalEjecutado, pct: pct(totalEjecutado, totalPlaneado),
      months, items, expanded: false,
    };
  }

  private buildComponentNode(comp: BudgetWizardComponent): ComponentNode {
    const rubros = (comp.budget_entries ?? []).map((e, i) => this.buildRubroNode(e, i));
    const months = mergeMonths(rubros.map(r => r.months));
    const totalPlaneado = rubros.reduce((s, r) => s + r.totalPlaneado, 0);
    const totalEjecutado = rubros.reduce((s, r) => s + r.totalEjecutado, 0);
    return {
      id: comp.component_id, name: comp.name?.trim() ? comp.name : '(sin nombre)',
      totalPlaneado, totalEjecutado, pct: pct(totalEjecutado, totalPlaneado),
      months, rubros, expanded: false,
    };
  }

  toggleComponent(c: ComponentNode): void { c.expanded = !c.expanded; }
  toggleRubro(r: RubroNode): void { r.expanded = !r.expanded; }
  toggleItem(i: ItemNode): void { i.expanded = !i.expanded; }

  goBack(): void {
    this.router.navigate(['/projects', this.projectId], { queryParams: { tab: 'facturacion' } });
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }
  formatCompact(v: number): string {
    const abs = Math.abs(v ?? 0);
    if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
    return `$${abs.toFixed(0)}`;
  }

  trackByComp(_: number, c: ComponentNode)  { return c.id; }
  trackByRubro(_: number, r: RubroNode)     { return r.id; }
  trackByItem(_: number, i: ItemNode)       { return i.id; }
  trackByMonth(_: number, m: MonthlyPoint)  { return `${m.year}-${m.month}`; }
}
