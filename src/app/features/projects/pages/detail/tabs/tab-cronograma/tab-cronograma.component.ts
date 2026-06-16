import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectService } from '../../../../services/project.service';
import { GanttResponse, GanttFilters, GanttActivity } from '../../../../models/project.model';

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

  actualBar(a: GanttActivity, timeline: { year: number; month: number }[]): { left: number; width: number } | null {
    if (!timeline.length || !a.actual_start_date) return null;
    const first = timeline[0];
    const last  = timeline[timeline.length - 1];
    const rangeStart = new Date(first.year, first.month - 1, 1).getTime();
    const rangeEnd   = new Date(last.year, last.month - 1 + 1, 0).getTime();
    const total      = rangeEnd - rangeStart;
    const start = Math.max(new Date(a.actual_start_date).getTime(), rangeStart);
    const end   = a.actual_end_date ? Math.min(new Date(a.actual_end_date).getTime(), rangeEnd) : Date.now();
    return {
      left:  Math.max(0, Math.min(100, (start - rangeStart) / total * 100)),
      width: Math.max(0.5, Math.min(100 - (start - rangeStart) / total * 100, (end - start) / total * 100)),
    };
  }

  activityColor(a: GanttActivity): string {
    if (a.is_completed) return '#10B981';
    if ((a.progress ?? 0) > 0) return '#0EA5E9';
    return '#CBD5E1';
  }

  activityColorActual(a: GanttActivity): string {
    if (a.is_completed) return '#059669';
    if ((a.progress ?? 0) > 0) return '#0284C7';
    return '#94A3B8';
  }

  // Avance real que aporta al total: percentage × (progress / 100)
  realContribution(a: GanttActivity): number {
    return (a.percentage ?? 0) * ((a.progress ?? 0) / 100);
  }

  trackByActivity(_: number, a: GanttActivity) { return a.id; }
}
