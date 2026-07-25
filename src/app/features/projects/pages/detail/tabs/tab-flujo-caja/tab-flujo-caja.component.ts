import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NgApexchartsModule,
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  ApexPlotOptions,
} from 'ng-apexcharts';
import { ProjectService } from '../../../../services/project.service';
import { CashFlowMonth, CashFlowReport, CashFlowRubro, FundingReceipt, BudgetEntry, BudgetItem } from '../../../../models/project.model';
import { buildTooltip } from '../../../../../../shared/utils/chart-tooltip.util';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Mismo color por rubro que en Presupuesto y Abastecimiento — el orden viene de la misma
 * fuente (getBudgetWizard), así que el mismo rubro se ve del mismo color en toda la app. */
const PALETTE = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const NO_RUBRO_COLOR = '#CBD5E1';
const AMOUNT_EPSILON = 0.01;

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

interface RubroName {
  id: string;
  concept: string;
  component_name: string;
  technical_name: string;
}

@Component({
  selector: 'app-tab-flujo-caja',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './tab-flujo-caja.component.html',
})
export class TabFlujoCajaComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private service: ProjectService) {}

  loading = signal(true);
  error   = signal<string | null>(null);
  report  = signal<CashFlowReport | null>(null);

  /** Nombres/orden de rubros — misma fuente que tab-presupuesto/tab-abastecimiento, para que el
   * color y el nombre completo (técnico · sub-componente · concepto) coincidan en toda la app. */
  rubroNames = signal<RubroName[]>([]);

  ngOnInit(): void {
    this.service.getBudgetWizard(this.projectId).subscribe({
      next: w => {
        const flat: RubroName[] = (w.components ?? []).flatMap(comp =>
          (comp.budget_entries ?? []).flatMap((entry: BudgetEntry) =>
            (entry.items ?? []).map((item: BudgetItem) => ({
              id: item.id, concept: item.concept ?? '', component_name: entry.name, technical_name: comp.name,
            } as RubroName))
          )
        );
        this.rubroNames.set(flat);
      },
      error: () => this.rubroNames.set([]),
    });

    this.service.getCashFlowReport(this.projectId).subscribe({
      next: (r) => { this.report.set(r); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el flujo de caja.'); this.loading.set(false); },
    });
  }

  rubroColor(budgetItemId: string | null | undefined): string {
    if (!budgetItemId) return NO_RUBRO_COLOR;
    const idx = this.rubroNames().findIndex(o => o.id === budgetItemId);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : NO_RUBRO_COLOR;
  }

  rubroFullName(budgetItemId: string | null | undefined): string {
    const o = this.rubroNames().find(x => x.id === budgetItemId);
    return o ? `${o.technical_name} · ${o.component_name}` : 'Sin rubro';
  }

  rubroConceptLabel(budgetItemId: string | null | undefined): string {
    const o = this.rubroNames().find(x => x.id === budgetItemId);
    return o ? o.concept : 'Sin rubro';
  }

  months = computed<CashFlowMonth[]>(() => this.report()?.months ?? []);
  deficitMonthsCount = computed(() => this.months().filter(m => m.deficit).length);

  /** Rubros ordenados por presupuesto total descendente, solo los que tienen algún movimiento
   * (presupuestado, egreso, ingreso o abastecimiento) — evita ruido de rubros vacíos que además
   * no vendrían del backend si nunca se les asignó presupuesto. */
  rubros = computed<CashFlowRubro[]>(() => [...(this.report()?.rubro_breakdown ?? [])].sort((a, b) => b.total_presupuestado - a.total_presupuestado));

  rubroOverCommitted(r: CashFlowRubro): boolean {
    return r.comprometido_abastecimiento > r.total_presupuestado + AMOUNT_EPSILON;
  }

  /** Desembolsos (cobros reales) ordenados del más reciente al más antiguo. */
  receipts = computed<FundingReceipt[]>(() => {
    return [...(this.report()?.receipts ?? [])].sort((a, b) => (b.receipt_date ?? '').localeCompare(a.receipt_date ?? ''));
  });

  chartReady = computed(() => !this.loading() && !this.error() && !!this.report());

  chartOptions = computed<ComboChartOptions>(() => {
    const data = this.months();
    return {
      series: [
        { name: 'Egreso total', type: 'column', data: data.map(m => Math.round(m.egreso_total)) },
        { name: 'Ingreso',      type: 'column', data: data.map(m => Math.round(m.ingreso_bruto)) },
        { name: 'Saldo acumulado', type: 'line', data: data.map(m => Math.round(m.saldo_acumulado)) },
      ],
      chart: { height: 360, type: 'line', toolbar: { show: false } },
      stroke: { width: [0, 0, 3], curve: 'smooth' },
      colors: ['#ef4444', '#10b981', '#0ea5e9'],
      xaxis: { categories: data.map(m => this.monthLabel(m)) },
      yaxis: { labels: { formatter: (val: number) => this.formatCompact(val) } },
      dataLabels: { enabled: false },
      legend: { show: false },
      tooltip: {
        shared: true,
        intersect: false,
        custom: ({ series, dataPointIndex, w }: any) =>
          buildTooltip(this.monthLabel(data[dataPointIndex]), w.config.series.map((s: any, i: number) => ({
            label: s.name, value: this.formatCurrency(series[i][dataPointIndex]), color: w.globals.colors[i],
          }))),
      },
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
      grid: { borderColor: '#e2e8f0' },
    };
  });

  /** Leyenda propia del combo (no depende del render nativo de ApexCharts,
   * que se ve vacío/roto por el mismo problema de CSS que el tooltip). */
  chartLegend = [
    { label: 'Egreso total', color: '#ef4444' },
    { label: 'Ingreso', color: '#10b981' },
    { label: 'Saldo acumulado', color: '#0ea5e9' },
  ];

  monthLabel(m: CashFlowMonth): string {
    return `${MONTH_NAMES[m.month - 1] ?? m.month} ${m.year}`;
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return d.slice(0, 10).split('-').reverse().join('/');
  }

  formatCompact(v: number): string {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
    return `${sign}$${abs}`;
  }

  trackByMonth(_: number, m: CashFlowMonth) { return `${m.year}-${m.month}`; }
  trackByRubro(_: number, r: CashFlowRubro) { return r.budget_item_id; }
  trackByReceipt(_: number, r: FundingReceipt) { return r.id; }
}
