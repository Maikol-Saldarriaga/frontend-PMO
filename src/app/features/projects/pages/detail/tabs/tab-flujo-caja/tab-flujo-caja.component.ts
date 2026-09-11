import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  NgApexchartsModule,
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexMarkers,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  ApexPlotOptions,
  ApexAnnotations,
} from 'ng-apexcharts';
import { ProjectService } from '../../../../services/project.service';
import { CashFlowMonth, CashFlowReport, CashFlowRubro, FundingReceipt, BudgetEntry, BudgetItem, Disbursement } from '../../../../models/project.model';
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
  markers: ApexMarkers;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  plotOptions: ApexPlotOptions;
  grid: ApexGrid;
  annotations: ApexAnnotations;
}

interface RubroName {
  id: string;
  concept: string;
  component_name: string;
  technical_name: string;
}

type ViewMode = 'planeado' | 'real' | 'proyectado';

/** CashFlowMonth enriquecido con el saldo acumulado de los 3 estados (Planeado/Real/Proyectado)
 * — Real ya viene calculado del backend (flujo_neto/saldo_acumulado); Planeado y Proyectado se
 * acumulan en el cliente sobre el histórico COMPLETO (ver enrichedMonths), para que filtrar por
 * año no reinicie el saldo en 0. */
interface EnrichedMonth extends CashFlowMonth {
  saldoPlan:     number;
  ingresoProy:   number;
  egresoProy:    number;
  saldoProy:     number;
  esProyectado:  boolean;
}

interface ActiveRow {
  ingreso: number;
  egreso:  number;
  saldo:   number;
}

@Component({
  selector: 'app-tab-flujo-caja',
  standalone: true,
  imports: [CommonModule, FormsModule, NgApexchartsModule],
  templateUrl: './tab-flujo-caja.component.html',
})
export class TabFlujoCajaComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  constructor(private service: ProjectService) {}

  loading = signal(true);
  error   = signal<string | null>(null);
  report  = signal<CashFlowReport | null>(null);

  /** Nombres/orden de rubros — misma fuente que tab-presupuesto/tab-abastecimiento, para que el
   * color y el nombre completo (técnico · sub-componente · concepto) coincidan en toda la app. */
  rubroNames = signal<RubroName[]>([]);

  /** Configuración de administración del proyecto (misma fuente que tab-facturacion), para
   * mostrar el % real configurado — no solo el % implícito que se deriva de los montos. */
  appliesAdminFee    = signal(false);
  adminFeePercentage = signal<number | null>(null);
  /** Nombre del proyecto y de la empresa — solo para el encabezado del Reporte Financiero. */
  projectName = signal('');
  companyName = signal('');

  /** Desembolsos (tramos planeados del cronograma), para la comparación Planeado vs Real. */
  disbursements = signal<Disbursement[]>([]);

  // ── Filtro por años + vista Planeado/Real/Proyectado ────────────────────────

  /** Rango de años del proyecto (de start_date/end_date) — límites del selector de años.
   * Si el proyecto no trae fechas, se recalculan desde months() al cargar el reporte. */
  projectStartYear = signal<number | null>(null);
  projectEndYear   = signal<number | null>(null);

  yearFrom = signal<number | null>(null);
  yearTo   = signal<number | null>(null);

  availableYears = computed<number[]>(() => {
    const from = this.projectStartYear();
    const to = this.projectEndYear();
    if (from == null || to == null) return [];
    const years: number[] = [];
    for (let y = from; y <= to; y++) years.push(y);
    return years;
  });

  viewMode = signal<ViewMode>('real');
  readonly viewModes: { v: ViewMode; label: string }[] = [
    { v: 'planeado', label: 'Planeado' },
    { v: 'real', label: 'Real' },
    { v: 'proyectado', label: 'Proyectado' },
  ];

  ngOnInit(): void {
    this.service.getProject(this.projectId).subscribe({
      next: p => {
        this.appliesAdminFee.set(p.applies_admin_fee ?? false);
        this.adminFeePercentage.set(p.admin_fee_percentage ?? null);
        this.projectName.set(p.project_name ?? p.object ?? '');
        this.companyName.set(p.company_name ?? '');
        const startYear = p.start_date ? new Date(p.start_date).getFullYear() : null;
        const endYear = p.end_date ? new Date(p.end_date).getFullYear() : null;
        if (startYear != null && endYear != null) {
          this.projectStartYear.set(startYear);
          this.projectEndYear.set(endYear);
          this.yearFrom.set(startYear);
          this.yearTo.set(endYear);
        }
      },
      error: () => {},
    });

    this.service.listAllDisbursements(this.projectId).subscribe({
      next: list => this.disbursements.set([...(list ?? [])].sort((a, b) => a.sort_order - b.sort_order)),
      error: () => this.disbursements.set([]),
    });

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
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
        // Si el proyecto no trae fechas, se toma el rango real de meses con datos como fallback
        // para que el selector de años siempre tenga algo que mostrar.
        if (this.projectStartYear() == null && r.months?.length) {
          const years = r.months.map(m => m.year);
          const from = Math.min(...years), to = Math.max(...years);
          this.projectStartYear.set(from);
          this.projectEndYear.set(to);
          this.yearFrom.set(from);
          this.yearTo.set(to);
        }
      },
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

  /** Serie enriquecida con el saldo acumulado de los 3 estados, calculada sobre el histórico
   * COMPLETO (months(), sin filtrar por año) — así el saldo mostrado en cualquier mes no se
   * "reinicia en 0" al acotar el rango de años, sigue siendo el saldo real acumulado desde el
   * inicio del proyecto. "Real" ya viene calculado del backend (flujo_neto/saldo_acumulado,
   * corregido para usar egreso REAL ejecutado); "Planeado" y "Proyectado" se acumulan aquí. */
  enrichedMonths = computed<EnrichedMonth[]>(() => {
    const today = new Date();
    const currentKey = today.getFullYear() * 100 + (today.getMonth() + 1);
    let runningPlan = 0;
    let runningProy = 0;
    return this.months().map(m => {
      runningPlan += (m.ingreso_planeado - m.egreso_total);
      const isPast = (m.year * 100 + m.month) <= currentKey;
      const ingresoProy = isPast ? m.ingreso_bruto : m.ingreso_planeado;
      const egresoProy = isPast ? m.egreso_real_registrado : m.egreso_total;
      runningProy += (ingresoProy - egresoProy);
      return {
        ...m,
        saldoPlan: runningPlan,
        ingresoProy, egresoProy, saldoProy: runningProy,
        esProyectado: !isPast,
      };
    });
  });

  /** enrichedMonths recortado al rango de años seleccionado — solo afecta qué se MUESTRA, la
   * acumulación de saldo ya corrió sobre el histórico completo arriba. */
  displayMonths = computed<EnrichedMonth[]>(() => {
    const from = this.yearFrom();
    const to = this.yearTo();
    if (from == null || to == null) return this.enrichedMonths();
    return this.enrichedMonths().filter(m => m.year >= from && m.year <= to);
  });

  /** La fila "activa" según el modo elegido — la tabla/gráfico solo leen estos 3 campos. */
  activeRow(m: EnrichedMonth): ActiveRow {
    switch (this.viewMode()) {
      case 'planeado':   return { ingreso: m.ingreso_planeado, egreso: m.egreso_total, saldo: m.saldoPlan };
      case 'proyectado': return { ingreso: m.ingresoProy, egreso: m.egresoProy, saldo: m.saldoProy };
      default:           return { ingreso: m.ingreso_bruto, egreso: m.egreso_real_registrado, saldo: m.saldo_acumulado };
    }
  }

  activeRowDeficit(m: EnrichedMonth): boolean {
    return this.activeRow(m).saldo < 0;
  }

  deficitMonthsCount = computed(() => this.displayMonths().filter(m => this.activeRowDeficit(m)).length);

  viewModeLabel = computed(() => this.viewMode() === 'planeado' ? 'Planeado' : this.viewMode() === 'proyectado' ? 'Proyectado' : 'Real');

  /** Total de IVA cobrado (suma de m.iva_cobrada), para el pie de la tabla mensual — siempre
   * real, no depende del modo (el IVA se factura y cobra como su propia factura independiente,
   * nunca como una resta sobre el valor de la factura general). */
  totalIvaCobrada = computed(() => this.displayMonths().reduce((s, m) => s + (m.iva_cobrada || 0), 0));

  /** Total de egresos reales registrados (budget_executions), para el pie de la tabla mensual. */
  totalEjecutadoReal = computed(() => this.displayMonths().reduce((s, m) => s + (m.egreso_real_registrado || 0), 0));

  /** Totales planeados de contraparte/aliado, para el pie de la tabla mensual. */
  totalEgresoContraparte = computed(() => this.displayMonths().reduce((s, m) => s + (m.egreso_contraparte || 0), 0));
  totalEgresoAliado = computed(() => this.displayMonths().reduce((s, m) => s + (m.egreso_aliado || 0), 0));

  /** Totales del modo activo, sobre el rango de años filtrado — alimentan los KPIs superiores. */
  activeIngresoTotal = computed(() => this.displayMonths().reduce((s, m) => s + this.activeRow(m).ingreso, 0));
  activeEgresoTotal  = computed(() => this.displayMonths().reduce((s, m) => s + this.activeRow(m).egreso, 0));
  activeFlujoNeto    = computed(() => this.activeIngresoTotal() - this.activeEgresoTotal());
  activeSaldoFinal   = computed(() => {
    const rows = this.displayMonths();
    return rows.length ? this.activeRow(rows[rows.length - 1]).saldo : 0;
  });

  // ── Métricas financieras ─────────────────────────────────────────────────

  /** % del presupuesto total del proyecto ya ejecutado (egreso real / egreso planeado total). */
  pctEjecucionPresupuestal = computed(() => {
    const r = this.report();
    if (!r || !r.egreso_planeado_total) return null;
    return Math.round((r.total_ejecutado_proyecto / r.egreso_planeado_total) * 1000) / 10;
  });

  /** % del valor total del contrato ya cobrado (ingreso real / ingreso planeado total). */
  pctCobroContrato = computed(() => {
    const r = this.report();
    if (!r || !r.ingreso_planeado_total) return null;
    return Math.round((r.total_cobrado_proyecto / r.ingreso_planeado_total) * 1000) / 10;
  });

  /** Burn rate mensual promedio: promedio del egreso real de los últimos 3 meses CON ejecución
   * real (> 0), sobre el histórico completo — no depende del filtro de años, siempre refleja el
   * ritmo de gasto más reciente del proyecto. */
  burnRateMensual = computed(() => {
    const withSpend = this.months().filter(m => m.egreso_real_registrado > 0);
    if (!withSpend.length) return null;
    const lastThree = withSpend.slice(-3);
    return lastThree.reduce((s, m) => s + m.egreso_real_registrado, 0) / lastThree.length;
  });

  /** Runway: meses que alcanza el saldo disponible real al ritmo de gasto actual, sin nuevo
   * cobro. null cuando no hay burn rate (aún no se ha ejecutado nada) — no una división por 0. */
  runwayMeses = computed(() => {
    const burn = this.burnRateMensual();
    const disponible = this.report()?.disponible_proyecto ?? 0;
    if (!burn || burn <= 0) return null;
    return disponible / burn;
  });

  /** % de administración configurado en el contrato — antes se derivaba dividiendo
   * admin_fee_retenido del mes entre ingreso_bruto del mes, pero esos dos números vienen de
   * fechas distintas (retenido = fecha de factura, ingreso = fecha de cobro), así que un mes
   * con varias facturas emitidas y solo una cobrada daba un % sin sentido (ej. 33% en vez del
   * 10% real). Mostrar directamente el % del contrato es siempre correcto. */
  adminFeePercentageOfMonth(m: CashFlowMonth): number | null {
    if (!m.admin_fee_retenido) return null;
    return this.adminFeePercentage();
  }

  /** % de administración configurado en el contrato — ver nota en adminFeePercentageOfMonth. */
  totalAdminFeePercentage(): number | null {
    const total = this.report();
    if (!total || !total.total_admin_fee) return null;
    return this.adminFeePercentage();
  }

  /** Rubros ordenados por presupuesto total descendente, solo los que tienen algún movimiento
   * (presupuestado, egreso, ingreso o abastecimiento) — evita ruido de rubros vacíos que además
   * no vendrían del backend si nunca se les asignó presupuesto. */
  rubros = computed<CashFlowRubro[]>(() => [...(this.report()?.rubro_breakdown ?? [])].sort((a, b) => b.total_presupuestado - a.total_presupuestado));

  rubroOverCommitted(r: CashFlowRubro): boolean {
    return r.comprometido_abastecimiento > r.total_presupuestado + AMOUNT_EPSILON;
  }

  /** Desviación 5.2: lo realmente ejecutado contra lo que se había planeado gastar en este rubro.
   * Positivo = se ejecutó de más sobre lo planeado; negativo = quedó por debajo de lo planeado. */
  rubroDesviacion(r: CashFlowRubro): number {
    return r.egreso_real_registrado - r.egreso_planeado;
  }

  disbursementStatusLabel(s: Disbursement['status']): string {
    return s === 'pagado' ? 'Pagado' : s === 'parcial' ? 'Parcial' : 'Planeado';
  }

  disbursementLabel(d: Disbursement): string {
    if (d.planned_month && d.planned_year) return `${MONTH_NAMES[d.planned_month - 1] ?? d.planned_month} ${d.planned_year}`;
    return d.name || '—';
  }

  /** Tramo de desembolso al que factura un cobro — reemplazó al rubro como anclaje desde la
   * Fase 2b (el dinero entra a nivel de proyecto, no de rubro). */
  receiptDisbursementLabel(r: FundingReceipt): string {
    if (!r.disbursement_id) return '—';
    const d = this.disbursements().find(x => x.id === r.disbursement_id);
    return d ? this.disbursementLabel(d) : '—';
  }

  printReport(): void {
    window.print();
  }

  /** Desembolsos (cobros reales) ordenados del más reciente al más antiguo. */
  receipts = computed<FundingReceipt[]>(() => {
    return [...(this.report()?.receipts ?? [])].sort((a, b) => (b.receipt_date ?? '').localeCompare(a.receipt_date ?? ''));
  });

  chartReady = computed(() => !this.loading() && !this.error() && !!this.report());

  /** Curva S acumulada — panorama de TODO el cronograma de principio a fin, independiente del
   * filtro de años y del selector Planeado/Real/Proyectado de la tabla de abajo. Dibuja 4 series
   * pero solo 3 CONCEPTOS (la leyenda propia, chartLegend, agrupa las 2 de ingreso en una sola
   * entrada) — cada una normalizada como % de SU PROPIO total (ingreso_planeado_total para las de
   * ingreso, egreso_planeado_total para las de egreso — dos denominadores distintos, por eso el
   * eje Y solo muestra %, y el equivalente en pesos de cada punto se muestra en el tooltip usando
   * el total correcto de esa serie):
   *  - Ingreso cobrado (verde sólido): acumulado de lo efectivamente cobrado hasta HOY — se corta
   *    ahí (con un punto grande) porque es lo único ya ocurrido y verificado.
   *  - Ingreso proyectado (verde punteado, mismo color que el anterior para que se lea como
   *    continuación de una sola línea, no como un concepto aparte): arranca exactamente donde
   *    termina el cobrado (mismo punto, mismo valor) y reparte linealmente lo que falta por cobrar
   *    entre los meses restantes del cronograma, llegando a 100% en el mes de cierre.
   *    No hay línea "Ingreso Planeado" (línea base fija): Disbursement.planned_year/planned_month
   *    no es un concepto que se maneje realmente en la app (los desembolsos no se registran con
   *    una fecha planeada de cobro) — esa línea existía antes pero graficaba un dato sin respaldo.
   *  - Egreso Planeado (gris, línea base): acumulado del presupuesto por rubro
   *    (egreso_contraparte + egreso_aliado = egreso_total), mes a mes — a diferencia del ingreso,
   *    SÍ es un dato real y confiable (viene del presupuesto asignado, budget_monthly_distributions).
   *  - Egreso Real (rojo, "Ejecutado real"): acumulado de budget_executions — lo efectivamente
   *    gastado, sin corte por fecha (no hay "egreso proyectado": solo se pidió Planeado vs Real).
   */
  sCurveMonths = computed<EnrichedMonth[]>(() => [...this.enrichedMonths()].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month)));

  chartOptions = computed<ComboChartOptions>(() => {
    const months = this.sCurveMonths();
    const ingresoTotal = this.report()?.ingreso_planeado_total ?? 0;
    const egresoTotal = this.report()?.egreso_planeado_total ?? 0;
    const empty: ComboChartOptions = {
      series: [], chart: { height: 380, type: 'line', toolbar: { show: false } },
      xaxis: { categories: [] }, yaxis: {}, colors: ['#16a34a', '#16a34a', '#94a3b8', '#dc2626'],
      stroke: { width: 2, curve: 'straight' }, markers: { size: 0 },
      dataLabels: { enabled: false }, legend: { show: false }, tooltip: {}, plotOptions: {}, grid: {}, annotations: {},
    };
    if (!months.length || (ingresoTotal <= 0 && egresoTotal <= 0)) return empty;

    const today = new Date();
    const currentKey = today.getFullYear() * 12 + (today.getMonth() + 1);

    let cumIngresoReal = 0, cumEgresoPlan = 0, cumEgresoReal = 0;
    let todayIdx = -1, realPctAtToday = 0;
    const ingresoRealPct: (number | null)[] = [];
    const egresoPlanPct: number[] = [];
    const egresoRealPct: number[] = [];

    months.forEach((m) => {
      const key = m.year * 12 + m.month;
      if (key <= currentKey) {
        cumIngresoReal += m.ingreso_bruto;
        ingresoRealPct.push(ingresoTotal > 0 ? Math.min(100, Math.round((cumIngresoReal / ingresoTotal) * 1000) / 10) : 0);
      } else {
        ingresoRealPct.push(null);
      }
      cumEgresoPlan += m.egreso_total;
      egresoPlanPct.push(egresoTotal > 0 ? Math.min(100, Math.round((cumEgresoPlan / egresoTotal) * 1000) / 10) : 0);
      cumEgresoReal += m.egreso_real_registrado;
      egresoRealPct.push(egresoTotal > 0 ? Math.min(100, Math.round((cumEgresoReal / egresoTotal) * 1000) / 10) : 0);
    });
    // El último índice con dato real es "hoy" — de ahí arranca Proyectado, en el mismo punto.
    for (let i = 0; i < ingresoRealPct.length; i++) if (ingresoRealPct[i] !== null) { todayIdx = i; realPctAtToday = ingresoRealPct[i]!; }

    const lastIdx = months.length - 1;
    const projPct: (number | null)[] = months.map((_, i) => {
      if (todayIdx === -1 || i < todayIdx) return null;
      if (i === todayIdx) return realPctAtToday;
      if (lastIdx === todayIdx) return null;
      const t = (i - todayIdx) / (lastIdx - todayIdx);
      return Math.round((realPctAtToday + (100 - realPctAtToday) * t) * 10) / 10;
    });

    // Un total por serie, en el mismo orden, para que el tooltip convierta cada % al peso
    // correcto (ingreso_planeado_total para las 2 de ingreso, egreso_planeado_total para las 2 de
    // egreso).
    const seriesTotals = [ingresoTotal, ingresoTotal, egresoTotal, egresoTotal];

    return {
      series: [
        { name: 'Ingreso cobrado', type: 'line', data: ingresoRealPct },
        { name: 'Ingreso proyectado', type: 'line', data: projPct },
        { name: 'Egreso Planeado (presupuesto)', type: 'line', data: egresoPlanPct },
        { name: 'Egreso Real (ejecutado)', type: 'line', data: egresoRealPct },
      ],
      chart: { height: 380, type: 'line', toolbar: { show: false } },
      stroke: { width: [3, 2, 2, 3], curve: 'straight', dashArray: [0, 6, 4, 0] },
      markers: {
        size: 0,
        discrete: todayIdx >= 0 ? [{ seriesIndex: 0, dataPointIndex: todayIdx, fillColor: '#16a34a', strokeColor: '#fff', size: 7, shape: 'circle' }] : [],
      },
      colors: ['#16a34a', '#16a34a', '#94a3b8', '#dc2626'],
      xaxis: { categories: months.map(m => this.monthLabel(m)) },
      // El eje Y solo muestra el % — ya no hay un único "total" del que derivar un equivalente en
      // pesos válido para las 4 series (ingresos y egresos tienen denominadores distintos); ese
      // equivalente correcto por serie se muestra en el tooltip.
      yaxis: { min: 0, max: 100, labels: { formatter: (v: number) => `${Math.round(v)}%` } },
      dataLabels: { enabled: false },
      legend: { show: false },
      tooltip: {
        shared: true,
        intersect: false,
        custom: ({ series, dataPointIndex, w }: any) => {
          const rows = w.config.series
            .map((s: any, i: number) => ({ label: s.name, value: series[i][dataPointIndex], color: w.globals.colors[i], total: seriesTotals[i] }))
            .filter((r: any) => r.value !== null && r.value !== undefined)
            .map((r: any) => ({ ...r, value: `${r.value}% (${this.formatCurrency((r.value / 100) * r.total)})` }));
          return buildTooltip(this.monthLabel(months[dataPointIndex]), rows);
        },
      },
      plotOptions: {},
      grid: { borderColor: '#e2e8f0' },
      annotations: todayIdx >= 0 ? {
        xaxis: [{
          x: this.monthLabel(months[todayIdx]),
          borderColor: '#9ca3af',
          strokeDashArray: 4,
          label: { text: 'Hoy', style: { color: '#6b7280', background: 'transparent' }, orientation: 'horizontal' },
        }],
      } : {},
    };
  });

  /** Leyenda propia del combo (no depende del render nativo de ApexCharts,
   * que se ve vacío/roto por el mismo problema de CSS que el tooltip). */
  chartLegend = computed(() => [
    { label: 'Ingreso (cobrado / proyectado)', color: '#16a34a' },
    { label: 'Egreso Planeado (presupuesto)', color: '#94a3b8' },
    { label: 'Egreso Real (ejecutado)', color: '#dc2626' },
  ]);

  onYearFromChange(value: string): void { this.yearFrom.set(Number(value)); }
  onYearToChange(value: string): void { this.yearTo.set(Number(value)); }
  setViewMode(mode: ViewMode): void { this.viewMode.set(mode); }

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

  /** % de IVA de un desembolso (cobro), derivado de su propio value/value_before_tax —
   * el mismo cálculo usado en la pestaña Facturación, para que ambas vistas coincidan. */
  receiptIvaPercentage(r: FundingReceipt): number | null {
    if (r.value_before_tax == null || r.value_before_tax <= 0) return null;
    return Math.round(((r.value / r.value_before_tax) - 1) * 10000) / 100;
  }

  /** Valor del IVA de un cobro: value - value_before_tax. */
  receiptIvaAmount(r: FundingReceipt): number | null {
    if (r.value_before_tax == null) return null;
    return r.value - r.value_before_tax;
  }

  /** % de administración de un cobro, derivado del monto ya prorrateado (admin_fee_amount)
   * contra el valor del cobro — coherente aunque el % del contrato haya cambiado con el tiempo. */
  receiptAdminFeePercentage(r: FundingReceipt): number | null {
    if (!r.admin_fee_amount || !r.value) return null;
    return Math.round((r.admin_fee_amount / r.value) * 10000) / 100;
  }

  trackByMonth(_: number, m: CashFlowMonth) { return `${m.year}-${m.month}`; }
  trackByRubro(_: number, r: CashFlowRubro) { return r.budget_item_id; }
  trackByReceipt(_: number, r: FundingReceipt) { return r.id; }
  trackByDisbursement(_: number, d: Disbursement) { return d.id; }
}
