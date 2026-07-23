import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  NgApexchartsModule, ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexGrid,
  ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis,
} from 'ng-apexcharts';
import * as XLSX from 'xlsx';
import { ProjectService } from '../../services/project.service';
import {
  TrackingReport, ComponentTrackingSummary, ActivityTrackingSummary, ReportToken, TrackingStatus,
} from '../../models/project.model';

interface LineChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  stroke: ApexStroke;
  xaxis: ApexXAxis;
  colors: string[];
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  grid: ApexGrid;
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

// Paleta de los seis estados de seguimiento — consistente con los badges ya usados
// en tab-entregables/tab-seguimiento-tecnico (emerald=completado, purple=adelantado,
// sky=en tiempo, rojo=retrasado, ámbar=vencido, gris=pendiente).
const STATUS_COLORS: Record<TrackingStatus, string> = {
  completado: '#10b981',
  adelantado: '#8b5cf6',
  en_tiempo:  '#0ea5e9',
  retrasado:  '#ef4444',
  vencido:    '#f59e0b',
  pendiente:  '#94a3b8',
};

const STATUS_LABELS: Record<TrackingStatus, string> = {
  completado: 'Completado',
  adelantado: 'Adelantado',
  en_tiempo:  'En tiempo',
  retrasado:  'Retrasado',
  vencido:    'Vencido',
  pendiente:  'Pendiente',
};

@Component({
  selector: 'app-tracking-report',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './tracking-report.component.html',
  styleUrl: './tracking-report.component.css',
})
export class TrackingReportComponent implements OnInit {
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);
  private svc     = inject(ProjectService);

  projectId = '';

  loading = signal(true);
  error   = signal<string | null>(null);
  report  = signal<TrackingReport | null>(null);

  statusLabels = STATUS_LABELS;

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/projects']); return; }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getTrackingReport(this.projectId).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el reporte de seguimiento.'); this.loading.set(false); },
    });
  }

  goBack(): void {
    this.router.navigate(['/projects', this.projectId], { queryParams: { tab: 'entregables' } });
  }

  print(): void {
    window.print();
  }

  // ── Formato ──────────────────────────────────────────────────────────────

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  formatPct(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return `${n.toFixed(1)}%`;
  }

  statusColor(status: TrackingStatus): string {
    return STATUS_COLORS[status] ?? '#94a3b8';
  }

  varianceClass(v: number): string {
    if (v > 0.5) return 'text-purple-600';
    if (v < -0.5) return 'text-red-500';
    return 'text-emerald-600';
  }

  // ── Gráficas ─────────────────────────────────────────────────────────────

  sCurveChart = computed<LineChartOptions | null>(() => {
    const r = this.report();
    if (!r || r.s_curve.length === 0) return null;
    return {
      series: [
        { name: 'Planeado acumulado', data: r.s_curve.map(p => Math.round(p.planned_cum * 100) / 100) },
        { name: 'Real acumulado',     data: r.s_curve.map(p => Math.round(p.actual_cum * 100) / 100) },
      ],
      chart: { type: 'area', height: 320, toolbar: { show: false } },
      stroke: { width: [2, 3], curve: 'straight' },
      colors: ['#94a3b8', '#0ea5e9'],
      xaxis: { categories: r.s_curve.map(p => this.formatDate(p.period_end)) },
      dataLabels: { enabled: false },
      legend: { position: 'top' },
      tooltip: { shared: true, y: { formatter: (v: number) => `${v.toFixed(1)}%` } },
      grid: { borderColor: '#e2e8f0' },
    };
  });

  statusDonut = computed<DonutChartOptions | null>(() => {
    const r = this.report();
    if (!r) return null;
    const sc = r.status_counts;
    const all: [TrackingStatus, number][] = [
      ['completado', sc.completado], ['adelantado', sc.adelantado], ['en_tiempo', sc.en_tiempo],
      ['retrasado', sc.retrasado], ['vencido', sc.vencido], ['pendiente', sc.pendiente],
    ];
    const entries = all.filter(([, n]) => n > 0);
    if (entries.length === 0) return null;
    return {
      series: entries.map(([, n]) => n),
      chart: { type: 'donut', height: 280 },
      labels: entries.map(([s]) => STATUS_LABELS[s]),
      colors: entries.map(([s]) => STATUS_COLORS[s]),
      legend: { position: 'bottom', fontSize: '12px' },
      dataLabels: { enabled: true },
      tooltip: {},
      plotOptions: { pie: { donut: { size: '65%' } } },
    };
  });

  componentBarChart = computed<BarChartOptions | null>(() => {
    const r = this.report();
    if (!r || r.components.length === 0) return null;
    const comps = r.components;
    return {
      series: [
        { name: 'Planeado a la fecha', data: comps.map(c => Math.round(c.planned_pct_to_date * 10) / 10) },
        { name: 'Real a la fecha',     data: comps.map(c => Math.round(c.actual_pct_to_date * 10) / 10) },
      ],
      chart: { type: 'bar', height: Math.max(220, comps.length * 70), toolbar: { show: false } },
      colors: ['#94a3b8', '#0ea5e9'],
      xaxis: { categories: comps.map(c => c.name ?? '—') },
      dataLabels: { enabled: true, formatter: (v: number) => `${v.toFixed(0)}%` },
      legend: { position: 'top' },
      tooltip: { y: { formatter: (v: number) => `${v.toFixed(1)}%` } },
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '35%' } },
      grid: { borderColor: '#e2e8f0' },
    };
  });

  riskBarChart = computed<BarChartOptions | null>(() => {
    const r = this.report();
    if (!r || r.top_at_risk.length === 0) return null;
    const items = r.top_at_risk;
    return {
      series: [{ name: 'Índice de riesgo', data: items.map(a => Math.round(a.risk_score * 10) / 10) }],
      chart: { type: 'bar', height: Math.max(220, items.length * 45), toolbar: { show: false } },
      colors: ['#ef4444'],
      xaxis: { categories: items.map(a => `Act. ${a.act ?? '—'} · ${(a.description ?? '').slice(0, 40)}`) },
      dataLabels: { enabled: true },
      legend: { show: false },
      tooltip: {},
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%', distributed: true } },
      grid: { borderColor: '#e2e8f0' },
    };
  });

  // ── Export a Excel (SheetJS, cliente) ───────────────────────────────────

  exportToExcel(): void {
    const r = this.report();
    if (!r) return;
    const wb = XLSX.utils.book_new();

    const resumen = [{
      'Proyecto': r.project_number,
      'Objeto': r.object,
      'Estado': r.status,
      'Fecha inicio': this.formatDate(r.start_date),
      'Fecha fin': this.formatDate(r.end_date),
      'Avance real (%)': r.kpis.overall_actual_pct,
      'Planeado a la fecha (%)': r.kpis.planned_pct_to_date,
      'Real a la fecha (%)': r.kpis.actual_pct_to_date,
      'Variación cronograma (%)': r.kpis.schedule_variance_pct,
      'SPI': r.kpis.spi,
      'Días transcurridos': r.kpis.days_elapsed,
      'Días restantes': r.kpis.days_remaining,
      'Días totales': r.kpis.days_total,
      '% tiempo transcurrido': r.kpis.time_elapsed_pct,
      'Componentes': r.kpis.total_components,
      'Actividades': r.kpis.total_activities,
      'Actividades completadas': r.kpis.completed_activities,
      'Checkpoints': r.kpis.total_checkpoints,
      'Generado': r.generated_at,
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');

    const componentes = r.components.map((c: ComponentTrackingSummary) => ({
      'Componente': c.name, 'Peso (%)': c.weight, 'Presupuesto': c.budget,
      'Actividades': c.total_activities, 'Completadas': c.completed_activities,
      'Planeado a la fecha (%)': c.planned_pct_to_date, 'Real a la fecha (%)': c.actual_pct_to_date,
      'Variación (%)': c.schedule_variance_pct, 'Cumplimiento promedio (%)': c.avg_compliance_pct,
      'A tiempo': c.on_time_count, 'Atrasadas': c.late_count,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(componentes), 'Componentes');

    const actividades = r.activities.map((a: ActivityTrackingSummary) => ({
      'Componente': a.component_name, 'Acto': a.act, 'Actividad': a.description, 'Responsable': a.responsible,
      'Peso (%)': a.weight, 'Inicio planeado': this.formatDate(a.planned_start_date), 'Fin planeado': this.formatDate(a.planned_end_date),
      'Inicio real': this.formatDate(a.actual_start_date), 'Fin real': this.formatDate(a.actual_end_date),
      'Completada': a.is_completed ? 'Sí' : 'No',
      'Planeado acumulado (%)': a.cumulative_planned_pct, 'Real acumulado (%)': a.cumulative_actual_pct,
      'Variación días': a.schedule_variance_days, 'Variación (%)': a.schedule_variance_pct,
      'Estado': this.statusLabels[a.status], 'Checkpoints': a.checkpoints_total, 'Entregados': a.checkpoints_delivered,
      'Índice de riesgo': a.risk_score,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actividades), 'Actividades');

    const checkpoints = r.flat_rows.map(row => ({
      'Componente': row.component_name, 'Peso comp. (%)': row.component_weight,
      'Acto': row.act, 'Actividad': row.activity_name, 'Responsable': row.responsible, 'Peso act. (%)': row.activity_weight,
      'Inicio': this.formatDate(row.start_date), 'Fin': this.formatDate(row.end_date),
      'Planeado (%)': row.planned_pct, 'Real (%)': row.actual_pct, 'Variación (%)': row.variance_pct,
      'Cumplimiento (%)': row.compliance_pct, 'Estado': this.statusLabels[row.status],
      'Verificaciones': row.verifications_count, 'Notas': row.notes,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checkpoints), 'Checkpoints');

    const curvaS = r.s_curve.map(p => ({
      'Fecha': this.formatDate(p.period_end), 'Planeado del periodo (%)': p.planned_pct, 'Real del periodo (%)': p.actual_pct,
      'Planeado acumulado (%)': p.planned_cum, 'Real acumulado (%)': p.actual_cum,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(curvaS), 'CurvaS');

    XLSX.writeFile(wb, `reporte-seguimiento-${r.project_number}.xlsx`);
  }

  // ── Export CSV (Power BI, vía backend) ──────────────────────────────────

  downloadingCsv = signal(false);

  downloadCsv(): void {
    const r = this.report();
    if (!r) return;
    this.downloadingCsv.set(true);
    this.svc.downloadTrackingReportCsv(this.projectId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-seguimiento-${r.project_number}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloadingCsv.set(false);
      },
      error: () => { this.downloadingCsv.set(false); },
    });
  }

  // ── Panel Power BI (tokens de reporte en vivo) ──────────────────────────

  showPowerBiPanel = signal(false);
  tokens = signal<ReportToken[]>([]);
  tokensLoading = signal(false);
  tokenError = signal<string | null>(null);
  generatingToken = signal(false);
  newTokenUrl = signal<string | null>(null);
  copiedUrl = signal(false);

  togglePowerBiPanel(): void {
    this.showPowerBiPanel.update(v => !v);
    if (this.showPowerBiPanel() && this.tokens().length === 0) {
      this.loadTokens();
    }
  }

  loadTokens(): void {
    this.tokensLoading.set(true);
    this.tokenError.set(null);
    this.svc.listReportTokens(this.projectId).subscribe({
      next: res => { this.tokens.set(res.tokens ?? []); this.tokensLoading.set(false); },
      error: () => { this.tokenError.set('No se pudieron cargar los tokens.'); this.tokensLoading.set(false); },
    });
  }

  generateToken(): void {
    this.generatingToken.set(true);
    this.tokenError.set(null);
    this.newTokenUrl.set(null);
    this.svc.createReportToken(this.projectId).subscribe({
      next: res => {
        this.newTokenUrl.set(res.url);
        this.generatingToken.set(false);
        this.loadTokens();
      },
      error: () => {
        this.tokenError.set('No se pudo generar el token.');
        this.generatingToken.set(false);
      },
    });
  }

  copyUrl(url: string): void {
    navigator.clipboard.writeText(url).then(() => {
      this.copiedUrl.set(true);
      setTimeout(() => this.copiedUrl.set(false), 2000);
    });
  }

  revokeToken(tokenId: string): void {
    if (!confirm('¿Revocar este token? Cualquier reporte de Power BI conectado con él dejará de funcionar.')) return;
    this.svc.revokeReportToken(this.projectId, tokenId).subscribe({
      next: () => this.tokens.update(list => list.filter(t => t.id_token !== tokenId)),
      error: () => this.tokenError.set('No se pudo revocar el token.'),
    });
  }
}
