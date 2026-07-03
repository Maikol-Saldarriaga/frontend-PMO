import { Component, Input, OnChanges, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ProjectDocument, ProjectDocumentSource, ProjectDocumentsResponse } from '../../../../models/project.model';

interface SourceFilter {
  value: ProjectDocumentSource | 'todos';
  label: string;
}

@Component({
  selector: 'app-tab-documentos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-documentos.component.html',
})
export class TabDocumentosComponent implements OnChanges {
  @Input() projectId!: string;

  private service = inject(ProjectService);

  loading  = signal(true);
  error    = signal<string | null>(null);
  response = signal<ProjectDocumentsResponse | null>(null);

  search        = '';
  activeSource: ProjectDocumentSource | 'todos' = 'todos';

  readonly SOURCE_FILTERS: SourceFilter[] = [
    { value: 'todos',      label: 'Todos' },
    { value: 'condicion',  label: 'Condiciones' },
    { value: 'entregable', label: 'Entregables' },
    { value: 'indicador',  label: 'Indicadores' },
  ];

  filteredDocuments = computed(() => {
    const res = this.response();
    if (!res) return [];
    const term = this.search.trim().toLowerCase();
    return res.documents.filter(doc => {
      const matchesSource = this.activeSource === 'todos' || doc.source === this.activeSource;
      const matchesSearch = !term
        || doc.name.toLowerCase().includes(term)
        || doc.parent.label.toLowerCase().includes(term);
      return matchesSource && matchesSearch;
    });
  });

  ngOnChanges(): void {
    if (this.projectId) this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getDocuments(this.projectId).subscribe({
      next:  res => { this.response.set(res); this.loading.set(false); },
      error: () => { this.error.set('No se pudieron cargar los documentos del proyecto.'); this.loading.set(false); },
    });
  }

  setSource(value: ProjectDocumentSource | 'todos'): void {
    this.activeSource = value;
  }

  countFor(source: ProjectDocumentSource): number {
    return this.response()?.by_source?.[source] ?? 0;
  }

  sourceLabel(source: ProjectDocumentSource): string {
    return { condicion: 'Condición', entregable: 'Entregable', indicador: 'Indicador' }[source];
  }

  sourceBadgeClass(source: ProjectDocumentSource): string {
    return {
      condicion:  'bg-orange-50 text-orange-700 border-orange-100',
      entregable: 'bg-indigo-50 text-indigo-700 border-indigo-100',
      indicador:  'bg-teal-50 text-teal-700 border-teal-100',
    }[source];
  }

  fileExt(doc: ProjectDocument): string {
    const clean = doc.file_url.split('?')[0];
    const match = clean.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  resolveUrl(url: string): string {
    return url.replace('localhost', '192.168.110.20');
  }

  formatDate(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
