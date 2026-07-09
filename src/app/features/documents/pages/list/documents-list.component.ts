import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { DocumentFilters, DocumentService } from '../../services/document.service';
import { DocumentSource, DocumentsSummary, GlobalDocument } from '../../models/document.model';

interface ProjectOption { id: string; label: string; }

@Component({
  selector: 'app-documents-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './documents-list.component.html',
})
export class DocumentsListComponent implements OnInit, OnDestroy {
  private documentService = inject(DocumentService);
  private destroy$      = new Subject<void>();
  private nameSearch$    = new Subject<string>();

  documents = signal<GlobalDocument[]>([]);
  summary   = signal<DocumentsSummary | null>(null);
  loading   = signal(true);
  error     = signal<string | null>(null);
  showFilters = signal(false);

  filters = signal<Required<DocumentFilters>>({ name: '', project_id: '', source: '' });

  readonly sourceOptions: DocumentSource[] = ['condicion', 'entregable', 'indicador', 'cumplimiento', 'cambio', 'firma'];

  projects = computed<ProjectOption[]>(() => {
    const seen = new Map<string, string>();
    for (const d of this.documents()) {
      if (!seen.has(d.contract_id)) seen.set(d.contract_id, d.project_name || d.project_number || '—');
    }
    return Array.from(seen, ([id, label]) => ({ id, label }));
  });

  activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.name, f.project_id, f.source].filter(Boolean).length;
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
  setSource(value: string):  void { this.filters.update(f => ({ ...f, source: value as DocumentSource | '' })); this.fetchDocuments(); }

  clearFilter(key: keyof Required<DocumentFilters>): void {
    this.filters.update(f => ({ ...f, [key]: '' }));
    this.fetchDocuments();
  }

  clearAllFilters(): void {
    this.filters.set({ name: '', project_id: '', source: '' });
    this.fetchDocuments();
  }

  sourceLabel(source: DocumentSource): string {
    const map: Record<DocumentSource, string> = {
      condicion:    'Condición',
      entregable:   'Entregable',
      indicador:    'Indicador',
      cumplimiento: 'Cumplimiento',
      cambio:       'Cambio',
      firma:        'Firma',
    };
    return map[source];
  }

  sourceBadgeClasses(source: DocumentSource): string {
    const map: Record<DocumentSource, string> = {
      condicion:    'text-accent-700 bg-accent-50 border-accent-200',
      entregable:   'text-emerald-600 bg-emerald-50 border-emerald-200',
      indicador:    'text-sky-600 bg-sky-50 border-sky-200',
      cumplimiento: 'text-amber-600 bg-amber-50 border-amber-200',
      cambio:       'text-purple-600 bg-purple-50 border-purple-200',
      firma:        'text-neutral-500 bg-neutral-100 border-neutral-200',
    };
    return map[source];
  }

  getInitials(name: string | null | undefined): string {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
