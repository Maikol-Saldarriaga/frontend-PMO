import { AfterViewInit, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NgApexchartsModule,
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'ng-apexcharts';
import { AuthStore } from '../../../../../core/auth/store/auth.store';

interface FodcProject {
  id: string;
  name: string;
  color: string;
  plannedBudget: number;
  invoicedTotal: number;
  plannedTotal: number;
  executedTotal: number;
}

interface BudgetMonthPoint {
  month: string;
  planned: number;
  invoiced: number;
  executed: number;
}

type AllyCategoryKey = 'por_gestionar' | 'en_gestion' | 'suscrito';

interface AllyItemValue {
  name: string;
  budget: number;
  subscribed: number;
}

interface AllyCategoryData {
  key: AllyCategoryKey;
  label: string;
  items: AllyItemValue[];
}

interface Ally {
  id: string;
  name: string;
  color: string;
  categories: AllyCategoryData[];
  invoicedTotal: number;
  executedTotal: number;
}

interface DonutChartOptions {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  legend: ApexLegend;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  tooltip: ApexTooltip;
}

interface BarChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  colors: string[];
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  plotOptions: ApexPlotOptions;
  grid: ApexGrid;
}

interface ComboChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  colors: string[];
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  plotOptions: ApexPlotOptions;
  grid: ApexGrid;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements AfterViewInit {
  private authStore = inject(AuthStore);

  today = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  get user() { return this.authStore.user(); }

  // ── Tabs ──────────────────────────────────────
  activeTab = signal<'general' | 'budget' | 'partnerships'>('general');

  setTab(tab: 'general' | 'budget' | 'partnerships'): void {
    this.activeTab.set(tab);
    this.resyncChartsSize();
  }

  ngAfterViewInit(): void {
    this.resyncChartsSize();
  }

  /**
   * ApexCharts mide el ancho del contenedor al crearse. Si el grid/flex de Angular
   * todavía no terminó de acomodar las tarjetas (o el chart estaba oculto detrás
   * de un *ngIf de tab), esa medida queda obsoleta y el tooltip calcula mal el
   * punto de datos (aparece "activo" pero con los campos vacíos). Forzar un
   * resize tras pintar el tab corrige el ancho cacheado.
   */
  private resyncChartsSize(): void {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  }

  formatCop(value: number): string {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)} mil M`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)} M`;
    return `$${value.toLocaleString('es-CO')}`;
  }

  // ════════════════════════════════════════════════
  // Tab General FODC
  // ════════════════════════════════════════════════

  fodcGeneralBudget = 10_000_000_000; // 10 mil millones COP

  fodcProjects: FodcProject[] = [
    { id: 'p1', name: 'Sistema ERP Corporativo', color: '#0ea5e9', plannedBudget: 2_400_000_000, invoicedTotal: 1_650_000_000, plannedTotal: 2_400_000_000, executedTotal: 1_820_000_000 },
    { id: 'p2', name: 'Migración Cloud AWS',      color: '#10b981', plannedBudget: 1_800_000_000, invoicedTotal: 1_700_000_000, plannedTotal: 1_800_000_000, executedTotal: 1_750_000_000 },
    { id: 'p3', name: 'App Móvil Clientes',       color: '#f59e0b', plannedBudget: 1_200_000_000, invoicedTotal: 540_000_000,   plannedTotal: 1_200_000_000, executedTotal: 610_000_000 },
    { id: 'p4', name: 'Rediseño Portal Web',      color: '#8b5cf6', plannedBudget: 650_000_000,    invoicedTotal: 210_000_000,   plannedTotal: 650_000_000,   executedTotal: 260_000_000 },
    { id: 'p5', name: 'Plataforma de Indicadores', color: '#ef4444', plannedBudget: 900_000_000,    invoicedTotal: 880_000_000,   plannedTotal: 900_000_000,   executedTotal: 895_000_000 },
  ];

  selectedProjectId = signal<string>('all');

  projectOptions = computed(() => [{ id: 'all', name: 'Todas' }, ...this.fodcProjects.map(p => ({ id: p.id, name: p.name }))]);

  onProjectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedProjectId.set(value);
  }

  fodcUsedTotal = computed(() => {
    const id = this.selectedProjectId();
    if (id === 'all') return this.fodcProjects.reduce((acc, p) => acc + p.invoicedTotal, 0);
    return this.fodcProjects.find(p => p.id === id)?.invoicedTotal ?? 0;
  });

  fodcUsedPct = computed(() => Math.min(100, Math.round((this.fodcUsedTotal() / this.fodcGeneralBudget) * 100)));

  // Gauge: presupuesto FODC usado
  fodcUsedGauge = computed<DonutChartOptions>(() => ({
    series: [this.fodcUsedPct()],
    chart: { type: 'radialBar', height: 240 },
    labels: ['Usado'],
    colors: ['#0ea5e9'],
    legend: { show: false },
    dataLabels: {} as ApexDataLabels,
    tooltip: { enabled: false },
    plotOptions: {
      radialBar: {
        hollow: { size: '65%' },
        track: { background: '#e2e8f0' },
        dataLabels: {
          name: { show: true, fontSize: '12px', color: '#94a3b8', offsetY: -10 },
          value: { fontSize: '26px', fontWeight: 700, color: '#1e293b', offsetY: 6, formatter: (val: number) => `${val}%` },
        },
      },
    },
  }));

  // Donut: distribución del presupuesto por proyecto
  projectDistributionDonut = computed<DonutChartOptions>(() => ({
    series: this.fodcProjects.map(p => p.plannedBudget),
    chart: { type: 'donut', height: 280 },
    labels: this.fodcProjects.map(p => p.name),
    colors: this.fodcProjects.map(p => p.color),
    legend: { position: 'bottom', fontSize: '12px' },
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
    tooltip: { y: { formatter: (val: number) => this.formatCop(val) } },
    plotOptions: { pie: { donut: { size: '65%' } } },
  }));

  invoicedVsPlanned = computed(() => {
    const id = this.selectedProjectId();
    const list = id === 'all' ? this.fodcProjects : this.fodcProjects.filter(p => p.id === id);
    const invoiced = list.reduce((acc, p) => acc + p.invoicedTotal, 0);
    const planned = list.reduce((acc, p) => acc + p.plannedTotal, 0);
    const invoicedPct = planned > 0 ? Math.round((invoiced / planned) * 100) : 0;
    return { invoiced, planned, invoicedPct };
  });

  // Barras horizontales: facturado vs planeado
  invoicedVsPlannedChart = computed<BarChartOptions>(() => {
    const { invoiced, planned } = this.invoicedVsPlanned();
    return {
      series: [{ name: 'Valor', data: [invoiced, planned] }],
      chart: { type: 'bar', height: 180, toolbar: { show: false } },
      colors: ['#0ea5e9', '#94a3b8'],
      xaxis: { categories: ['Facturado', 'Planeado'], labels: { formatter: (val: string) => this.formatCop(+val) } },
      dataLabels: { enabled: true, formatter: (val: number) => this.formatCop(val) },
      legend: { show: false },
      tooltip: { y: { formatter: (val: number) => this.formatCop(val) } },
      plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '45%', distributed: true } },
      grid: { borderColor: '#e2e8f0' },
    };
  });

  // ════════════════════════════════════════════════
  // Tab Presupuesto
  // ════════════════════════════════════════════════

  private readonly MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  private readonly MONTH_WEIGHTS = [6, 7, 8, 8, 9, 9, 9, 9, 9, 9, 9, 8].map(w => w / 100);

  selectedBudgetProjectId = signal<string>('all');

  onBudgetProjectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedBudgetProjectId.set(value);
  }

  private budgetFilteredProjects = computed(() => {
    const id = this.selectedBudgetProjectId();
    return id === 'all' ? this.fodcProjects : this.fodcProjects.filter(p => p.id === id);
  });

  budgetTotals = computed(() => {
    const list = this.budgetFilteredProjects();
    const planned  = list.reduce((acc, p) => acc + p.plannedTotal, 0);
    const executed = list.reduce((acc, p) => acc + p.executedTotal, 0);
    const invoiced = list.reduce((acc, p) => acc + p.invoicedTotal, 0);
    return { planned, executed, invoiced };
  });

  executedPct = computed(() => {
    const { planned, executed } = this.budgetTotals();
    return planned > 0 ? Math.min(100, Math.round((executed / planned) * 100)) : 0;
  });

  // Gauge: planeado vs ejecutado
  executedGauge = computed<DonutChartOptions>(() => ({
    series: [this.executedPct()],
    chart: { type: 'radialBar', height: 240 },
    labels: ['Ejecutado'],
    colors: ['#10b981'],
    legend: { show: false },
    dataLabels: {} as ApexDataLabels,
    tooltip: { enabled: false },
    plotOptions: {
      radialBar: {
        hollow: { size: '65%' },
        track: { background: '#e2e8f0' },
        dataLabels: {
          name: { show: true, fontSize: '12px', color: '#94a3b8', offsetY: -10 },
          value: { fontSize: '26px', fontWeight: 700, color: '#1e293b', offsetY: 6, formatter: (val: number) => `${val}%` },
        },
      },
    },
  }));

  // Barras (planeado) + líneas (facturado, ejecutado) por mes
  budgetMonthlyChart = computed<BudgetMonthPoint[]>(() => {
    const list = this.budgetFilteredProjects();
    const weights = this.MONTH_WEIGHTS;
    let cum = 0;
    const cumWeights = weights.map(w => (cum += w));

    return this.MONTHS.map((month, i) => ({
      month,
      planned:  list.reduce((acc, p) => acc + p.plannedTotal  * weights[i], 0),
      invoiced: list.reduce((acc, p) => acc + p.invoicedTotal * cumWeights[i], 0),
      executed: list.reduce((acc, p) => acc + p.executedTotal * cumWeights[i], 0),
    }));
  });

  budgetComboChart = computed<ComboChartOptions>(() => {
    const data = this.budgetMonthlyChart();
    return {
      series: [
        { name: 'Planeado',  type: 'column', data: data.map(p => Math.round(p.planned)) },
        { name: 'Facturado', type: 'line',   data: data.map(p => Math.round(p.invoiced)) },
        { name: 'Ejecutado', type: 'line',   data: data.map(p => Math.round(p.executed)) },
      ],
      chart: { height: 340, type: 'line', toolbar: { show: false } },
      stroke: { width: [0, 3, 3], curve: 'smooth' },
      colors: ['#cbd5e1', '#0ea5e9', '#10b981'],
      xaxis: { categories: data.map(p => p.month) },
      yaxis: { labels: { formatter: (val: number) => this.formatCop(val) } },
      dataLabels: { enabled: false },
      legend: { position: 'top' },
      tooltip: { shared: true, intersect: false, y: { formatter: (val: number) => this.formatCop(val) } },
      plotOptions: { bar: { columnWidth: '45%', borderRadius: 4 } },
      grid: { borderColor: '#e2e8f0' },
    };
  });

  // Comparativo: cada proyecto contra sí mismo — % facturado de lo que tenía planeado
  comparativeData = computed(() => {
    return this.fodcProjects.map(p => {
      const invoicedPct = p.plannedTotal > 0 ? Math.round((p.invoicedTotal / p.plannedTotal) * 1000) / 10 : 0;
      return { ...p, invoicedPct };
    });
  });

  comparativeBarChart = computed<BarChartOptions>(() => {
    const data = this.comparativeData();
    return {
      series: [{ name: '% facturado de lo planeado', data: data.map(p => p.invoicedPct) }],
      chart: { type: 'bar', height: Math.max(220, data.length * 50), toolbar: { show: false } },
      colors: data.map(p => p.color),
      xaxis: { categories: data.map(p => p.name) },
      dataLabels: { enabled: true, formatter: (val: number) => `${val}%` },
      legend: { show: false },
      tooltip: {
        y: {
          formatter: (val: number, opts: { dataPointIndex: number }) => {
            const p = data[opts.dataPointIndex];
            return `${val}% · ${this.formatCop(p.invoicedTotal)} / ${this.formatCop(p.plannedTotal)}`;
          },
        },
      },
      plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '55%', distributed: true } },
      grid: { borderColor: '#e2e8f0' },
    };
  });

  // ════════════════════════════════════════════════
  // Tab Alianzas
  // ════════════════════════════════════════════════

  private readonly CATEGORY_DEFS: { key: AllyCategoryKey; label: string; color: string }[] = [
    { key: 'por_gestionar', label: 'POR GESTIONAR', color: '#f59e0b' },
    { key: 'en_gestion',    label: 'EN GESTIÓN',     color: '#0ea5e9' },
    { key: 'suscrito',      label: 'SUSCRITO',       color: '#10b981' },
  ];

  allies: Ally[] = [
    {
      id: 'a1', name: 'Fundación ABC', color: '#0ea5e9',
      categories: [
        { key: 'por_gestionar', label: 'POR GESTIONAR', items: [
          { name: 'Oferta',    budget: 120_000_000, subscribed: 0 },
          { name: 'Propuesta', budget: 80_000_000,  subscribed: 0 },
        ] },
        { key: 'en_gestion', label: 'EN GESTIÓN', items: [
          { name: 'Actas',                        budget: 200_000_000, subscribed: 60_000_000 },
          { name: 'Memorando de Entendimiento',   budget: 150_000_000, subscribed: 40_000_000 },
        ] },
        { key: 'suscrito', label: 'SUSCRITO', items: [
          { name: 'Convenio', budget: 300_000_000, subscribed: 300_000_000 },
          { name: 'Contrato', budget: 250_000_000, subscribed: 230_000_000 },
        ] },
      ],
      invoicedTotal: 410_000_000,
      executedTotal: 380_000_000,
    },
    {
      id: 'a2', name: 'Cooperativa XYZ', color: '#10b981',
      categories: [
        { key: 'por_gestionar', label: 'POR GESTIONAR', items: [
          { name: 'Oferta',    budget: 90_000_000, subscribed: 0 },
          { name: 'Propuesta', budget: 60_000_000, subscribed: 0 },
        ] },
        { key: 'en_gestion', label: 'EN GESTIÓN', items: [
          { name: 'Actas',                      budget: 140_000_000, subscribed: 50_000_000 },
          { name: 'Memorando de Entendimiento', budget: 100_000_000, subscribed: 30_000_000 },
        ] },
        { key: 'suscrito', label: 'SUSCRITO', items: [
          { name: 'Convenio', budget: 220_000_000, subscribed: 220_000_000 },
          { name: 'Contrato', budget: 180_000_000, subscribed: 160_000_000 },
        ] },
      ],
      invoicedTotal: 300_000_000,
      executedTotal: 270_000_000,
    },
    {
      id: 'a3', name: 'ONG Horizonte', color: '#f59e0b',
      categories: [
        { key: 'por_gestionar', label: 'POR GESTIONAR', items: [
          { name: 'Oferta',    budget: 70_000_000, subscribed: 0 },
          { name: 'Propuesta', budget: 40_000_000, subscribed: 0 },
        ] },
        { key: 'en_gestion', label: 'EN GESTIÓN', items: [
          { name: 'Actas',                      budget: 90_000_000, subscribed: 20_000_000 },
          { name: 'Memorando de Entendimiento', budget: 60_000_000, subscribed: 15_000_000 },
        ] },
        { key: 'suscrito', label: 'SUSCRITO', items: [
          { name: 'Convenio', budget: 150_000_000, subscribed: 150_000_000 },
          { name: 'Contrato', budget: 110_000_000, subscribed: 95_000_000 },
        ] },
      ],
      invoicedTotal: 200_000_000,
      executedTotal: 180_000_000,
    },
    {
      id: 'a4', name: 'Alianza Rural', color: '#8b5cf6',
      categories: [
        { key: 'por_gestionar', label: 'POR GESTIONAR', items: [
          { name: 'Oferta',    budget: 50_000_000, subscribed: 0 },
          { name: 'Propuesta', budget: 30_000_000, subscribed: 0 },
        ] },
        { key: 'en_gestion', label: 'EN GESTIÓN', items: [
          { name: 'Actas',                      budget: 70_000_000, subscribed: 10_000_000 },
          { name: 'Memorando de Entendimiento', budget: 45_000_000, subscribed: 8_000_000 },
        ] },
        { key: 'suscrito', label: 'SUSCRITO', items: [
          { name: 'Convenio', budget: 95_000_000, subscribed: 95_000_000 },
          { name: 'Contrato', budget: 70_000_000, subscribed: 60_000_000 },
        ] },
      ],
      invoicedTotal: 120_000_000,
      executedTotal: 100_000_000,
    },
  ];

  selectedAllyId = signal<string>('all');

  allyOptions = computed(() => [{ id: 'all', name: 'Todos' }, ...this.allies.map(a => ({ id: a.id, name: a.name }))]);

  onAllyChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedAllyId.set(value);
  }

  private alliesFiltered = computed(() => {
    const id = this.selectedAllyId();
    return id === 'all' ? this.allies : this.allies.filter(a => a.id === id);
  });

  private categoryTotals = computed(() => {
    const filtered = this.alliesFiltered();
    return this.CATEGORY_DEFS.map(def => {
      const total = filtered.reduce((acc, a) => {
        const cat = a.categories.find(c => c.key === def.key);
        return acc + (cat?.items.reduce((s, it) => s + it.budget, 0) ?? 0);
      }, 0);
      return { ...def, total };
    });
  });

  // Donut: distribución por categoría
  allyCategoryDonut = computed<DonutChartOptions>(() => {
    const cats = this.categoryTotals();
    return {
      series: cats.map(c => c.total),
      chart: { type: 'donut', height: 280 },
      labels: cats.map(c => c.label),
      colors: cats.map(c => c.color),
      legend: { position: 'bottom', fontSize: '12px' },
      dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
      tooltip: { y: { formatter: (val: number) => this.formatCop(val) } },
      plotOptions: { pie: { donut: { size: '65%' } } },
    };
  });

  // Tabla: categorías desplegables con sus items
  categoryTable = computed(() => {
    const filtered = this.alliesFiltered();
    return this.CATEGORY_DEFS.map(def => {
      const itemNames = filtered[0]?.categories.find(c => c.key === def.key)?.items.map(it => it.name) ?? [];
      const items = itemNames.map(name => {
        const budget = filtered.reduce((s, a) => {
          const it = a.categories.find(c => c.key === def.key)?.items.find(i => i.name === name);
          return s + (it?.budget ?? 0);
        }, 0);
        const subscribed = filtered.reduce((s, a) => {
          const it = a.categories.find(c => c.key === def.key)?.items.find(i => i.name === name);
          return s + (it?.subscribed ?? 0);
        }, 0);
        return { name, budget, subscribed, diff: subscribed - budget };
      });
      const totalBudget     = items.reduce((s, it) => s + it.budget, 0);
      const totalSubscribed = items.reduce((s, it) => s + it.subscribed, 0);
      return { ...def, items, totalBudget, totalSubscribed, totalDiff: totalSubscribed - totalBudget };
    });
  });

  expandedCats = signal<Set<string>>(new Set());

  toggleCategory(key: string): void {
    this.expandedCats.update(s => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  isExpanded(key: string): boolean {
    return this.expandedCats().has(key);
  }

  allySubscribedTotal(ally: Ally): number {
    return ally.categories.find(c => c.key === 'suscrito')?.items.reduce((s, it) => s + it.subscribed, 0) ?? 0;
  }

  // Barras (suscrito, facturado) + línea recta (ejecutado), por aliado — siempre todos
  allyComboChart = computed<ComboChartOptions>(() => {
    const data = this.allies;
    return {
      series: [
        { name: 'Suscrito',  type: 'column', data: data.map(a => this.allySubscribedTotal(a)) },
        { name: 'Facturado', type: 'column', data: data.map(a => a.invoicedTotal) },
        { name: 'Ejecutado', type: 'line',   data: data.map(a => a.executedTotal) },
      ],
      chart: { height: 340, type: 'line', toolbar: { show: false } },
      stroke: { width: [0, 0, 3], curve: 'straight' },
      colors: ['#94a3b8', '#0ea5e9', '#10b981'],
      xaxis: { categories: data.map(a => a.name) },
      yaxis: { labels: { formatter: (val: number) => this.formatCop(val) } },
      dataLabels: { enabled: false },
      legend: { position: 'top' },
      tooltip: { shared: true, intersect: false, y: { formatter: (val: number) => this.formatCop(val) } },
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
      grid: { borderColor: '#e2e8f0' },
    };
  });

  // ════════════════════════════════════════════════
  // KPIs (sin uso de gráficas)
  // ════════════════════════════════════════════════

  stats = [
    { label: 'Proyectos activos',  value: '12',  delta: '+2 este mes',     icon: 'folder', accent: true  },
    { label: 'Tareas pendientes',  value: '48',  delta: '8 vencidas',      icon: 'check',  accent: false },
    { label: 'Recursos asignados', value: '27',  delta: '3 disponibles',   icon: 'users',  accent: false },
    { label: 'Avance promedio',    value: '74%', delta: '+6% vs mes ant.',  icon: 'chart',  accent: true  },
  ];

  recentProjects = [
    { name: 'Sistema ERP Corporativo', status: 'En curso',    progress: 68, due: '30 Jun 2026' },
    { name: 'Migración Cloud AWS',      status: 'En revisión', progress: 90, due: '15 Jun 2026' },
    { name: 'App Móvil Clientes',       status: 'En curso',    progress: 42, due: '30 Jul 2026' },
    { name: 'Rediseño Portal Web',      status: 'Planeación',  progress: 15, due: '15 Ago 2026' },
  ];

  statusColor(status: string): string {
    const map: Record<string, string> = {
      'En curso':    'badge--success',
      'En revisión': 'badge--warning',
      'Planeación':  'badge--neutral',
      'Completado':  'badge--accent',
    };
    return map[status] ?? 'badge--neutral';
  }
}
