import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService } from '../../../projects/services/project.service';
import { ProjectCreateResponse } from '../../../projects/models/project.model';
import { ScheduleRow, TimelineMonth } from '../../models/schedule.model';

@Component({
  selector: 'app-schedule-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './schedule-list.component.html',
})
export class ScheduleListComponent implements OnInit {
  private router         = inject(Router);
  private projectService = inject(ProjectService);

  loading = signal(true);
  error   = signal<string | null>(null);
  search  = signal('');
  status  = signal('');

  private allProjects = signal<ProjectCreateResponse[]>([]);

  readonly statusOptions = ['draft', 'activo', 'completado', 'cancelado'];

  filteredProjects = computed(() => {
    const q = this.search().toLowerCase().trim();
    const s = this.status();
    return this.allProjects().filter(p => {
      const matchesName   = !q || (p.project_name ?? p.project_number ?? '').toLowerCase().includes(q);
      const matchesStatus = !s || this.sk(p.status) === s;
      return matchesName && matchesStatus && p.start_date && p.end_date;
    });
  });

  timeline = computed<TimelineMonth[]>(() => {
    const projects = this.filteredProjects();
    if (projects.length === 0) return [];

    const { rangeStart, rangeEnd } = this.dateRange(projects);
    const months: TimelineMonth[] = [];
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor <= rangeEnd) {
      months.push({
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1,
        label: cursor.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  });

  rows = computed<ScheduleRow[]>(() => {
    const projects = this.filteredProjects();
    if (projects.length === 0) return [];

    const { rangeStart, rangeEnd } = this.dateRange(projects);
    const totalMs = rangeEnd.getTime() - rangeStart.getTime() || 1;

    return projects.map(p => {
      const start = new Date(p.start_date!);
      const end   = new Date(p.end_date!);
      const offsetPercent = Math.max(0, ((start.getTime() - rangeStart.getTime()) / totalMs) * 100);
      const widthPercent  = Math.max(2, ((end.getTime() - start.getTime()) / totalMs) * 100);
      return {
        id: p.id,
        name: p.project_name || p.project_number || '—',
        status: p.status,
        start_date: p.start_date!,
        end_date: p.end_date!,
        percent_done: p.percent_done,
        offsetPercent,
        widthPercent,
      };
    });
  });

  ngOnInit(): void {
    this.fetchProjects();
  }

  fetchProjects(): void {
    this.loading.set(true);
    this.error.set(null);
    this.projectService.getProjects(100, 0, {}).subscribe({
      next: (res) => {
        this.allProjects.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los cronogramas.');
        this.loading.set(false);
      },
    });
  }

  private dateRange(projects: ProjectCreateResponse[]): { rangeStart: Date; rangeEnd: Date } {
    const starts = projects.map(p => new Date(p.start_date!).getTime());
    const ends   = projects.map(p => new Date(p.end_date!).getTime());
    return { rangeStart: new Date(Math.min(...starts)), rangeEnd: new Date(Math.max(...ends)) };
  }

  onSearchInput(value: string): void { this.search.set(value); }
  setStatus(value: string):     void { this.status.set(value); }
  clearFilters(): void { this.search.set(''); this.status.set(''); }

  openProject(id: string): void {
    this.router.navigate(['/projects', id]);
  }

  private sk(s: string) { return (s ?? '').toLowerCase().trim(); }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador', activo: 'Activo', completado: 'Completado', cancelado: 'Cancelado',
    };
    return map[this.sk(status)] ?? status;
  }

  getBarColor(status: string): string {
    const s = this.sk(status);
    if (s === 'activo')     return 'bg-emerald-400';
    if (s === 'completado') return 'bg-sky-400';
    if (s === 'cancelado')  return 'bg-red-300';
    return 'bg-amber-400';
  }

  getStatusBadge(status: string): string {
    const s = this.sk(status);
    if (s === 'activo')     return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (s === 'completado') return 'text-sky-600     bg-sky-50     border-sky-200';
    if (s === 'cancelado')  return 'text-red-400     bg-red-50     border-red-100';
    return 'text-amber-600 bg-amber-50 border-amber-200';
  }
}
