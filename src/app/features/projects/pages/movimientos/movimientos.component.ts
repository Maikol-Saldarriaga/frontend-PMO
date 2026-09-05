import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import {
  BudgetEntry, BudgetItem, BudgetMonthlyDistribution, BudgetWizardComponent,
  BudgetExecutionSummary,
} from '../../models/project.model';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Un punto planeado/ejecutado para un período (year-month) — la unidad mínima que se
 * agrega hacia arriba (ítem → rubro → componente → general). `ejecutado` viene SIEMPRE del
 * resumen mensual de egresos reales cargados vía auxiliares (ver ProjectService
 * .getExecutionsMonthlySummary), nunca del campo manual `executed_amount` de la distribución. */
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

function sumPlaneado(months: MonthlyPoint[]): number { return months.reduce((s, m) => s + m.planeado, 0); }
function sumEjecutado(months: MonthlyPoint[]): number { return months.reduce((s, m) => s + m.ejecutado, 0); }

@Component({
  selector: 'app-movimientos',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  /** Egresos reales por rubro y "YYYY-MM" (auxiliares) — fuente del "ejecutado" en todo este
   * componente, reemplazando el viejo campo manual `executed_amount`. */
  private executionsSummary = signal<Record<string, Record<string, number>>>({});
  components = signal<ComponentNode[]>([]);

  /** Filtro de año — 'all' agrega todos los períodos; un año concreto acota meses y recalcula
   * totales/porcentajes solo con ese año, para poder ver "qué se planeó y qué se ejecutó" en
   * un año puntual sin el ruido de los demás. */
  selectedYear = signal<number | 'all'>('all');

  availableYears = computed<number[]>(() => {
    const years = new Set<number>();
    for (const c of this.components()) {
      for (const m of c.months) years.add(m.year);
    }
    return [...years].sort((a, b) => b - a);
  });

  /** Vista por año: recorta los meses de cada nodo al año seleccionado y recalcula sus totales
   * y % localmente — la data cruda (this.components) nunca se muta, así cambiar de año no
   * pierde nada. */
  viewComponents = computed<ComponentNode[]>(() => {
    const year = this.selectedYear();
    if (year === 'all') return this.components();
    return this.components().map(c => this.restrictComponentToYear(c, year));
  });

  private restrictItemToYear(item: ItemNode, year: number): ItemNode {
    const months = item.months.filter(m => m.year === year);
    const totalPlaneado = sumPlaneado(months);
    const totalEjecutado = sumEjecutado(months);
    return { ...item, months, totalPlaneado, totalEjecutado, pct: pct(totalEjecutado, totalPlaneado) };
  }

  private restrictRubroToYear(rubro: RubroNode, year: number): RubroNode {
    const items = rubro.items.map(i => this.restrictItemToYear(i, year));
    const months = rubro.months.filter(m => m.year === year);
    const totalPlaneado = sumPlaneado(months);
    const totalEjecutado = sumEjecutado(months);
    return { ...rubro, items, months, totalPlaneado, totalEjecutado, pct: pct(totalEjecutado, totalPlaneado) };
  }

  private restrictComponentToYear(comp: ComponentNode, year: number): ComponentNode {
    const rubros = comp.rubros.map(r => this.restrictRubroToYear(r, year));
    const months = comp.months.filter(m => m.year === year);
    const totalPlaneado = sumPlaneado(months);
    const totalEjecutado = sumEjecutado(months);
    return { ...comp, rubros, months, totalPlaneado, totalEjecutado, pct: pct(totalEjecutado, totalPlaneado) };
  }

  /** Totales generales sobre la vista actual (respeta el filtro de año) — reemplazan al
   * `generalSummary`/`generalSeries` del backend (que son siempre "todo el histórico") cuando
   * hay un año seleccionado, para que las tarjetas de arriba coincidan con la tabla de abajo. */
  viewTotalPlaneado  = computed(() => this.viewComponents().reduce((s, c) => s + c.totalPlaneado, 0));
  viewTotalEjecutado = computed(() => this.viewComponents().reduce((s, c) => s + c.totalEjecutado, 0));
  viewPct            = computed(() => pct(this.viewTotalEjecutado(), this.viewTotalPlaneado()));
  viewMonths         = computed(() => mergeMonths(this.viewComponents().map(c => c.months)));

  selectYear(y: number | 'all'): void { this.selectedYear.set(y); }

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/projects']); return; }

    this.service.getExecutionsMonthlySummary(this.projectId).subscribe({
      next: summary => this.executionsSummary.set(summary ?? {}),
      error: () => this.executionsSummary.set({}),
    });

    this.service.getBudgetWizard(this.projectId).subscribe({
      next: (w) => {
        this.generalSummary.set(w.execution?.summary ?? null);
        const comps = (w.components ?? []).map(comp => this.buildComponentNode(comp));
        if (w.project_level_entries?.length) {
          comps.push(this.buildProjectLevelNode(w.project_level_entries));
        }
        this.components.set(comps);
        // El año más reciente con algún movimiento (planeado o real) es un punto de partida
        // más útil que "todos los años" mezclados en una sola tabla ilegible.
        const years = new Set<number>();
        for (const c of comps) for (const m of c.months) years.add(m.year);
        if (years.size) this.selectedYear.set(Math.max(...years));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los movimientos del presupuesto.');
        this.loading.set(false);
      },
    });
  }

  /** Ejecutado real de este ítem para un year-month, desde el resumen de auxiliares — 0 si
   * el ítem no tiene ningún egreso registrado contra él en ese período. */
  private realExecuted(itemId: string, year: number, month: number): number {
    return this.executionsSummary()[itemId]?.[monthKey(year, month)] ?? 0;
  }

  private itemMonths(item: BudgetItem): MonthlyPoint[] {
    // Unión de los meses PLANEADOS (de la distribución) y los meses con ejecución REAL
    // (auxiliares) — un rubro puede tener gasto real en un mes sin programación, o viceversa.
    const byKey = new Map<string, { year: number; month: number; planeado: number }>();
    for (const d of item.monthly_distributions ?? []) {
      byKey.set(monthKey(d.year, d.month), {
        year: d.year, month: d.month,
        planeado: (d.counterpart_amount ?? 0) + (d.ally_amount ?? 0),
      });
    }
    const realMonths = this.executionsSummary()[item.id] ?? {};
    for (const key of Object.keys(realMonths)) {
      if (!byKey.has(key)) {
        const [y, m] = key.split('-').map(Number);
        byKey.set(key, { year: y, month: m, planeado: 0 });
      }
    }
    return [...byKey.values()]
      .sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
      .map(({ year, month, planeado }) => ({
        year, month, label: `${MONTH_NAMES[month - 1] ?? month} ${year}`,
        planeado, ejecutado: this.realExecuted(item.id, year, month),
      }));
  }

  private buildItemNode(item: BudgetItem): ItemNode {
    const months = this.itemMonths(item);
    const totalPlaneado = sumPlaneado(months);
    const totalEjecutado = sumEjecutado(months);
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

  /** Rubros indirecto (catálogo `cost_type = indirecto`) — no enlazados a ningún componente
   * técnico, agrupados como un nodo hermano "Nivel Proyecto" al mismo nivel que los
   * componentes técnicos, construido con la misma lógica de agregación (`buildRubroNode`). */
  private buildProjectLevelNode(entries: BudgetEntry[]): ComponentNode {
    const rubros = entries.map((e, i) => this.buildRubroNode(e, i));
    const months = mergeMonths(rubros.map(r => r.months));
    const totalPlaneado = rubros.reduce((s, r) => s + r.totalPlaneado, 0);
    const totalEjecutado = rubros.reduce((s, r) => s + r.totalEjecutado, 0);
    return {
      id: '__project_level__', name: 'Nivel Proyecto',
      totalPlaneado, totalEjecutado, pct: pct(totalEjecutado, totalPlaneado),
      months, rubros, expanded: false,
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

  /** Abre el listado de egresos (auxiliares) del proyecto, ya filtrado por este rubro — el
   * detalle fila a fila de qué movimientos individuales componen su "ejecutado real". */
  verAuxiliaresDeRubro(rubroId: string): void {
    this.router.navigate(['/projects', this.projectId, 'egresos'], { queryParams: { budget_item_id: rubroId } });
  }

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
  trackByYear(_: number, y: number | 'all') { return y; }
}
