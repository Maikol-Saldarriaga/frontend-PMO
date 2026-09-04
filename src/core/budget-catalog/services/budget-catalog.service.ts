import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { CursorPage, fetchAllPages } from '../../api/paginate';
import { ENDPOINTS } from '../../api/endpoints';
import { BudgetComponentCatalogItem, BudgetComponentCatalogRequest } from '../models/budget-catalog.model';

@Injectable({ providedIn: 'root' })
export class BudgetCatalogService {
  private api = inject(ApiHttpClient);

  /** Página paginada (keyset) del catálogo — usada por la pantalla admin con scroll infinito. */
  list(params?: { cursor?: string | number; limit?: number }): Observable<CursorPage<BudgetComponentCatalogItem>> {
    const query: Record<string, string> = { limit: String(params?.limit ?? 40) };
    if (params?.cursor) query['cursor'] = String(params.cursor);
    return this.api.get<CursorPage<BudgetComponentCatalogItem>>(ENDPOINTS.budgetCatalog.list, { params: query });
  }

  /** Catálogo completo — para pickers/dropdowns que necesitan el set entero en memoria. */
  listAll(): Observable<BudgetComponentCatalogItem[]> {
    return fetchAllPages<BudgetComponentCatalogItem>(this.api, ENDPOINTS.budgetCatalog.list);
  }

  create(body: BudgetComponentCatalogRequest): Observable<BudgetComponentCatalogItem> {
    return this.api.post<BudgetComponentCatalogItem>(ENDPOINTS.budgetCatalog.create, body);
  }

  update(id: string, body: BudgetComponentCatalogRequest): Observable<BudgetComponentCatalogItem> {
    return this.api.put<BudgetComponentCatalogItem>(ENDPOINTS.budgetCatalog.update(id), body);
  }

  deactivate(id: string): Observable<void> {
    return this.api.delete<void>(ENDPOINTS.budgetCatalog.deactivate(id));
  }
}
