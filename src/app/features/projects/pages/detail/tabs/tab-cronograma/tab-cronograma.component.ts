import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectService } from '../../../../services/project.service';
import { GanttResponse, GanttFilters, GanttActivity, Snapshot } from '../../../../models/project.model';

@Component({
  selector: 'app-tab-cronograma',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-cronograma.component.html',
})
export class TabCronogramaComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService) {}

  ganttData    = signal<GanttResponse | null>(null);
  ganttLoading = signal(false);
  ganttFilters = signal<GanttFilters>({});
  ganttYears   = signal<number[]>([]);

  readonly MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  ngOnInit(): void { this.load({}); }

  load(filters: GanttFilters): void {
    this.ganttLoading.set(true);
    this.ganttFilters.set(filters);
    this.svc.getGantt(this.projectId, filters).subscribe({
      next: g => {
        this.ganttData.set(g);
        const years = [...new Set(g.timeline.map(t => t.year))].sort();
        this.ganttYears.set(years);
        this.ganttLoading.set(false);
      },
      error: () => this.ganttLoading.set(false),
    });
  }

  totalActivities(): number {
    return (this.ganttData()?.components ?? []).reduce((s, c) => s + c.activities.length, 0);
  }

  /** Progreso real = suma de actual_pct de los períodos. Si no hay períodos, usa el dato agregado del backend. */
  activityProgress(a: GanttActivity): number {
    const snaps = a.snapshots ?? [];
    if (!snaps.length) return a.progress ?? 0;
    const sum = snaps.reduce((s, x) => s + (x.actual_pct ?? 0), 0);
    return Math.min(Math.round(sum * 10) / 10, 100);
  }

  activityBar(a: GanttActivity, timeline: { year: number; month: number }[]): { left: number; width: number } {
    if (!timeline.length || !a.start_date) return { left: 0, width: 0 };
    const first = timeline[0];
    const last  = timeline[timeline.length - 1];
    const rangeStart = new Date(first.year, first.month - 1, 1).getTime();
    const rangeEnd   = new Date(last.year, last.month - 1 + 1, 0).getTime();
    const total      = rangeEnd - rangeStart;
    const start = Math.max(new Date(a.start_date).getTime(), rangeStart);
    const end   = a.end_date ? Math.min(new Date(a.end_date).getTime(), rangeEnd) : rangeEnd;
    return {
      left:  Math.max(0, Math.min(100, (start - rangeStart) / total * 100)),
      width: Math.max(0.5, Math.min(100 - (start - rangeStart) / total * 100, (end - start) / total * 100)),
    };
  }

  /** Posición/ancho de un período (snapshot) dentro del timeline visible. */
  periodBar(snap: Snapshot, timeline: { year: number; month: number }[]): { left: number; width: number } {
    if (!timeline.length) return { left: 0, width: 0 };
    const first = timeline[0];
    const last  = timeline[timeline.length - 1];
    const rangeStart = new Date(first.year, first.month - 1, 1).getTime();
    const rangeEnd   = new Date(last.year, last.month - 1 + 1, 0).getTime();
    const total      = rangeEnd - rangeStart;
    const start = new Date(snap.start_date).getTime();
    const end   = new Date(snap.end_date).getTime();
    if (end < rangeStart || start > rangeEnd) return { left: 0, width: 0 };
    const clampedStart = Math.max(start, rangeStart);
    const clampedEnd   = Math.min(end, rangeEnd);
    return {
      left:  Math.max(0, Math.min(100, (clampedStart - rangeStart) / total * 100)),
      width: Math.max(0.5, Math.min(100 - (clampedStart - rangeStart) / total * 100, (clampedEnd - clampedStart) / total * 100)),
    };
  }

  /** Color del período: rojo atrasado, verde a tiempo, morado si hay adelanto (mismo criterio que Seguimiento Técnico). */
  periodFillColor(snap: Snapshot): string {
    const actual = snap.actual_pct ?? 0;
    if (actual > snap.planned_pct) return '#A855F7';
    if (actual === snap.planned_pct) return '#10B981';
    return '#F87171';
  }

  activityColor(a: GanttActivity): string {
    if (a.is_completed) return '#10B981';
    if (this.activityProgress(a) > 0) return '#0EA5E9';
    return '#CBD5E1';
  }

  // Avance real que aporta al total: percentage × (progress / 100)
  realContribution(a: GanttActivity): number {
    return (a.percentage ?? 0) * (this.activityProgress(a) / 100);
  }

  trackByActivity(_: number, a: GanttActivity) { return a.id; }
  trackBySnap(_: number, s: Snapshot) { return s.start_date + s.end_date; }
}
