import { Injectable, inject } from '@angular/core';
import { Observable, map, delay } from 'rxjs';
import { ProjectService } from '../../projects/services/project.service';
import { DocumentsSummary, DocumentType, ProjectDocument } from '../models/document.model';

export interface DocumentFilters {
  name?:      string;
  project_id?: string;
  type?:      DocumentType | '';
}

const TYPES: DocumentType[] = ['contrato', 'acta', 'informe', 'anexo', 'otro'];
const NAME_BY_TYPE: Record<DocumentType, string[]> = {
  contrato: ['Contrato firmado', 'Otrosí modificatorio'],
  acta:     ['Acta de inicio', 'Acta de reunión de seguimiento', 'Acta de cierre'],
  informe:  ['Informe mensual de avance', 'Informe financiero'],
  anexo:    ['Anexo técnico', 'Anexo presupuestal'],
  otro:     ['Correspondencia', 'Soporte de entrega'],
};

/**
 * TODO: reemplazar por llamadas reales cuando el backend exponga /projects/:id/documents.
 * Por ahora genera un listado determinístico a partir de los proyectos reales del usuario,
 * para poder maquetar la UX final sin depender del endpoint.
 */
@Injectable({ providedIn: 'root' })
export class DocumentService {
  private projectService = inject(ProjectService);

  getDocuments(filters: DocumentFilters = {}): Observable<{ data: ProjectDocument[]; summary: DocumentsSummary }> {
    return this.projectService.getProjects(50, 0, {}).pipe(
      map(res => {
        const projects = res.data ?? [];
        let docs: ProjectDocument[] = [];

        projects.forEach((p, pIndex) => {
          TYPES.forEach((type, tIndex) => {
            const names = NAME_BY_TYPE[type];
            const name = names[(pIndex + tIndex) % names.length];
            const daysAgo = (pIndex * 7 + tIndex * 3) % 60;
            const created = new Date();
            created.setDate(created.getDate() - daysAgo);

            docs.push({
              id:           `${p.id}-${type}`,
              name:         `${name} — ${p.project_name || p.project_number}`,
              type,
              project_id:   p.id,
              project_name: p.project_name || p.project_number || '—',
              uploaded_by:  p.responsible?.name ?? 'Sin asignar',
              size_kb:      120 + ((pIndex * 37 + tIndex * 53) % 900),
              created_at:   created.toISOString(),
            });
          });
        });

        if (filters.name) {
          const q = filters.name.toLowerCase();
          docs = docs.filter(d => d.name.toLowerCase().includes(q));
        }
        if (filters.project_id) {
          docs = docs.filter(d => d.project_id === filters.project_id);
        }
        if (filters.type) {
          docs = docs.filter(d => d.type === filters.type);
        }

        docs.sort((a, b) => b.created_at.localeCompare(a.created_at));

        const summary: DocumentsSummary = {
          total:    docs.length,
          recent:   docs.filter(d => (Date.now() - new Date(d.created_at).getTime()) < 7 * 86400000).length,
          contrato: docs.filter(d => d.type === 'contrato').length,
          informe:  docs.filter(d => d.type === 'informe').length,
        };

        return { data: docs, summary };
      }),
      delay(250),
    );
  }
}
