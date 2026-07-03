import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { DocumentFilters, DocumentService } from '../../services/document.service';
import { DocumentsSummary, DocumentType, ProjectDocument } from '../../models/document.model';
import { ProjectService } from '../../../projects/services/project.service';
import { ProjectCreateResponse } from '../../../projects/models/project.model';

@Component({
  selector: 'app-documents-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './documents-list.component.html',
})
export class DocumentsListComponent implements OnInit, OnDestroy {
  private documentService = inject(DocumentService);
  private projectService  = inject(ProjectService);
  private destroy$      = new Subject<void>();
  private nameSearch$    = new Subject<string>();

  documents = signal<ProjectDocument[]>([]);
  summary   = signal<DocumentsSummary | null>(null);
  projects  = signal<ProjectCreateResponse[]>([]);
  loading   = signal(true);
  error     = signal<string | null>(null);
  showFilters = signal(false);

  filters = signal<Required<DocumentFilters>>({ name: '', project_id: '', type: '' });

  readonly typeOptions: DocumentType[] = ['contrato', 'acta', 'informe', 'anexo', 'otro'];

  activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.name, f.project_id, f.type].filter(Boolean).length;
  });

  ngOnInit(): void {
    this.nameSearch$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(name => {
      this.filters.update(f => ({ ...f, name }));
      this.fetchDocuments();
    });

    this.projectService.getProjects(50, 0, {}).subscribe(res => this.projects.set(res.data ?? []));
    this.fetchDocuments();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchDocuments(): void {
    this.loading.set(true);
    this.error.set(null);
    this.documentService.getDocuments(this.filters()).subscribe({
      next: (res) => {
        this.documents.set(res.data);
        this.summary.set(res.summary);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los documentos.');
        this.loading.set(false);
      },
    });
  }

  onNameInput(value: string): void {
    this.nameSearch$.next(value);
  }

  setProject(value: string): void { this.filters.update(f => ({ ...f, project_id: value })); this.fetchDocuments(); }
  setType(value: string):    void { this.filters.update(f => ({ ...f, type: value as DocumentType | '' })); this.fetchDocuments(); }

  clearFilter(key: keyof Required<DocumentFilters>): void {
    this.filters.update(f => ({ ...f, [key]: '' }));
    this.fetchDocuments();
  }

  clearAllFilters(): void {
    this.filters.set({ name: '', project_id: '', type: '' });
    this.fetchDocuments();
  }

  typeLabel(type: DocumentType): string {
    const map: Record<DocumentType, string> = {
      contrato: 'Contrato', acta: 'Acta', informe: 'Informe', anexo: 'Anexo', otro: 'Otro',
    };
    return map[type];
  }

  typeBadgeClasses(type: DocumentType): string {
    const map: Record<DocumentType, string> = {
      contrato: 'text-accent-700 bg-accent-50 border-accent-200',
      acta:     'text-emerald-600 bg-emerald-50 border-emerald-200',
      informe:  'text-sky-600 bg-sky-50 border-sky-200',
      anexo:    'text-amber-600 bg-amber-50 border-amber-200',
      otro:     'text-neutral-500 bg-neutral-100 border-neutral-200',
    };
    return map[type];
  }

  formatSize(kb: number): string {
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  }

  getInitials(name: string | undefined): string {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
