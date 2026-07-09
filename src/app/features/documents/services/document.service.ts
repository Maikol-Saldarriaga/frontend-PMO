import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import { DocumentSource, DocumentsSummary, GlobalDocument } from '../models/document.model';

export interface DocumentFilters {
  name?:       string;
  project_id?: string;
  source?:     DocumentSource | '';
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private http = inject(ApiHttpClient);

  getDocuments(filters: DocumentFilters = {}): Observable<{ data: GlobalDocument[]; summary: DocumentsSummary }> {
    return this.http.get<GlobalDocument[]>(ENDPOINTS.projects.allDocuments).pipe(
      map(res => {
        let docs = res ?? [];

        if (filters.name) {
          const q = filters.name.toLowerCase();
          docs = docs.filter(d => d.name.toLowerCase().includes(q));
        }
        if (filters.project_id) {
          docs = docs.filter(d => d.contract_id === filters.project_id);
        }
        if (filters.source) {
          docs = docs.filter(d => d.source === filters.source);
        }

        docs = [...docs].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

        const summary: DocumentsSummary = {
          total:      docs.length,
          recent:     docs.filter(d => d.created_at && (Date.now() - new Date(d.created_at).getTime()) < 7 * 86400000).length,
          entregable: docs.filter(d => d.source === 'entregable').length,
          firma:      docs.filter(d => d.source === 'firma').length,
        };

        return { data: docs, summary };
      }),
    );
  }
}
