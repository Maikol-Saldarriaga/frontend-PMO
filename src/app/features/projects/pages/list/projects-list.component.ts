import { Component, inject, OnInit, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ProjectService, ProjectFilters } from '../../services/project.service';
import { ProjectCreateResponse, ProjectsSummary } from '../../models/project.model';
import { API_BASE_URL } from '../../../../../core/config/api.config';

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './projects-list.component.html',
})
export class ProjectsListComponent implements OnInit, OnDestroy {
  private router         = inject(Router);
  private projectService = inject(ProjectService);
  private destroy$       = new Subject<void>();
  private nameSearch$    = new Subject<string>();

  projects   = signal<ProjectCreateResponse[]>([]);
  summary    = signal<ProjectsSummary | null>(null);
  loading    = signal(true);
  error      = signal<string | null>(null);
  nextCursor = signal<string | null>(null);
  showFilters = signal(false);

  filters = signal<Required<ProjectFilters>>({
    name: '', type: '', status: '', date_from: '', date_to: '',
  });

  readonly typeOptions   = ['contrato', 'convenio'];
  readonly statusOptions = ['draft', 'activo', 'completado', 'cancelado'];

  activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.name, f.type, f.status, f.date_from, f.date_to].filter(Boolean).length;
  });

  ngOnInit(): void {
    // Debounce name search — only fires API after 400ms of inactivity
    this.nameSearch$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(name => {
      this.filters.update(f => ({ ...f, name }));
      this.fetchProjects();
    });

    this.fetchProjects();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchProjects(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.projectService.getProjects(20, 0, f).subscribe({
      next: (res) => {
        this.projects.set(res.data ?? []);
        this.summary.set(res.summary ?? null);
        this.nextCursor.set(res.next_cursor);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los proyectos.');
        this.loading.set(false);
      },
    });
  }

  onNameInput(value: string): void {
    this.nameSearch$.next(value);
  }

  onFilterChange(): void {
    this.fetchProjects();
  }

  clearFilter(key: keyof Required<ProjectFilters>): void {
    this.filters.update(f => ({ ...f, [key]: '' }));
    this.fetchProjects();
  }

  clearAllFilters(): void {
    this.filters.set({ name: '', type: '', status: '', date_from: '', date_to: '' } as Required<ProjectFilters>);
    this.fetchProjects();
  }

  setType(value: string):     void { this.filters.update(f => ({ ...f, type: value }));      this.fetchProjects(); }
  setStatus(value: string):   void { this.filters.update(f => ({ ...f, status: value }));    this.fetchProjects(); }
  setDateFrom(value: string): void { this.filters.update(f => ({ ...f, date_from: value })); this.fetchProjects(); }
  setDateTo(value: string):   void { this.filters.update(f => ({ ...f, date_to: value }));   this.fetchProjects(); }

  openProject(project: ProjectCreateResponse): void {
    if (project.percent_done >= 100) {
      this.router.navigate(['/projects', project.id]);
    } else {
      this.router.navigate(['/projects', project.id, 'edit'], {
        queryParams: { step: (project.completed_steps ?? 0) + 1 },
      });
    }
  }

  createProject(): void {
    this.router.navigate(['/projects/create']);
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador', activo: 'Activo', completado: 'Completado', cancelado: 'Cancelado',
    };
    return map[status?.toLowerCase()] ?? status;
  }

  // ── Card color helpers ───────────────────────────────────────────────────────
  private sk(s: string) { return (s ?? '').toLowerCase().trim(); }

  getCardClasses(status: string): string {
    const s = this.sk(status);
    if (s === 'activo')     return 'bg-emerald-50/40 border-emerald-100 hover:border-emerald-200 hover:bg-emerald-50/60';
    if (s === 'completado') return 'bg-sky-50/40     border-sky-100     hover:border-sky-200     hover:bg-sky-50/60';
    if (s === 'cancelado')  return 'bg-red-50/30     border-red-100     hover:border-red-200     hover:bg-red-50/50';
    return 'bg-amber-50/40 border-amber-100 hover:border-amber-200 hover:bg-amber-50/60';
  }
  getAccentBar(status: string): string {
    const s = this.sk(status);
    if (s === 'activo')     return 'bg-emerald-400';
    if (s === 'completado') return 'bg-sky-400';
    if (s === 'cancelado')  return 'bg-red-300';
    return 'bg-amber-400';
  }
  getTrackColor(status: string): string {
    const s = this.sk(status);
    if (s === 'activo')     return '#ecfdf5';
    if (s === 'completado') return '#f0f9ff';
    if (s === 'cancelado')  return '#fff1f2';
    return '#fffbeb';
  }
  getProgressStroke(status: string): string {
    const s = this.sk(status);
    if (s === 'activo')     return '#34d399';
    if (s === 'completado') return '#38bdf8';
    if (s === 'cancelado')  return '#f87171';
    return '#fbbf24';
  }
  getPercentTextColor(status: string): string {
    const s = this.sk(status);
    if (s === 'activo')     return 'text-emerald-600';
    if (s === 'completado') return 'text-sky-600';
    if (s === 'cancelado')  return 'text-red-400';
    return 'text-amber-500';
  }
  getStatusBadge(status: string): string {
    const s = this.sk(status);
    if (s === 'activo')     return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (s === 'completado') return 'text-sky-600     bg-sky-50     border-sky-200';
    if (s === 'cancelado')  return 'text-red-400     bg-red-50     border-red-100';
    return 'text-amber-600 bg-amber-50 border-amber-200';
  }
  getResponsibleInitials(name: string | undefined): string {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  resolveImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const apiHost = new URL(API_BASE_URL).hostname;
    return url.replace(/localhost/, apiHost);
  }
  truncate(text: string | null | undefined, max = 90): string {
    if (!text) return '—';
    return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
  }
}
