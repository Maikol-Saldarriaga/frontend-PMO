import { Component, Input, Output, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectDetails, ProjectComponentDistribution, ProjectMonthlyContribution, GanttSummaryItem, Snapshot } from '../../../../models/project.model';

const PALETTE = ['#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];

@Component({
  selector: 'app-tab-resumen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-resumen.component.html',
})
export class TabResumenComponent {
  @Input() details!: ProjectDetails;
  @Output() switchTab = new EventEmitter<string>();

  readonly MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  readonly GAUGE_CIRC = 2 * Math.PI * 40;

  get donutSegments() {
    const dist = this.details?.component_distribution ?? [];
    if (!dist.length) return [];
    const r = 42; const circ = 2 * Math.PI * r;
    let offset = 0;
    return dist.map((c: ProjectComponentDistribution, i: number) => {
      const dash = (c.percentage / 100) * circ;
      const seg = { ...c, dash, gap: circ - dash, offset, color: PALETTE[i % PALETTE.length] };
      offset += dash;
      return seg;
    });
  }

  get barMax(): number {
    const m = this.details?.monthly_contributions ?? [];
    return Math.max(...m.map((x: ProjectMonthlyContribution) => x.counterpart_amount + x.ally_amount), 1);
  }

  // Avance real ponderado: percentage × (progress/100) sumado sobre todas las actividades
  get realProgress(): number {
    const summary = this.details?.gantt_summary ?? [];
    let weightedSum = 0, totalWeight = 0;
    for (const item of summary) {
      const pct = item.percentage ?? 0;
      weightedSum += pct * ((item.progress ?? 0) / 100);
      totalWeight += pct;
    }
    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
  }

  ganttBar(g: GanttSummaryItem): { left: number; width: number } {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd   = new Date(year, 11, 31).getTime();
    const total = yearEnd - yearStart;
    const start = g.start_date ? Math.max(new Date(g.start_date).getTime(), yearStart) : yearStart;
    const end   = g.end_date   ? Math.min(new Date(g.end_date).getTime(), yearEnd)     : yearEnd;
    return { left: Math.max(0, (start - yearStart) / total * 100), width: Math.max(1, (end - start) / total * 100) };
  }

  /** Posición/ancho de un período (snapshot) dentro del año en curso — mismo criterio que Cronograma. */
  periodBar(snap: Snapshot): { left: number; width: number } {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd   = new Date(year, 11, 31).getTime();
    const total = yearEnd - yearStart;
    const start = new Date(snap.start_date).getTime();
    const end   = new Date(snap.end_date).getTime();
    if (end < yearStart || start > yearEnd) return { left: 0, width: 0 };
    const clampedStart = Math.max(start, yearStart);
    const clampedEnd   = Math.min(end, yearEnd);
    return {
      left:  Math.max(0, Math.min(100, (clampedStart - yearStart) / total * 100)),
      width: Math.max(0.5, Math.min(100 - (clampedStart - yearStart) / total * 100, (clampedEnd - clampedStart) / total * 100)),
    };
  }

  /** Color del período: rojo atrasado, verde a tiempo, morado si hay adelanto (mismo criterio que Cronograma/Seguimiento Técnico). */
  periodFillColor(snap: Snapshot): string {
    const actual = snap.actual_pct ?? 0;
    if (actual > snap.planned_pct) return '#A855F7';
    if (actual === snap.planned_pct) return '#10B981';
    return '#F87171';
  }

  trackBySnap(_: number, s: Snapshot) { return s.start_date + s.end_date; }

  formatCompact(v: number): string {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  }

  color(i: number): string { return PALETTE[i % PALETTE.length]; }
  trackByComp(_: number, c: ProjectComponentDistribution)  { return c.component_id; }
  trackByMonth(_: number, m: ProjectMonthlyContribution)   { return `${m.year}-${m.month}`; }
  trackByGantt(_: number, g: GanttSummaryItem)             { return g.activity_id; }
}
