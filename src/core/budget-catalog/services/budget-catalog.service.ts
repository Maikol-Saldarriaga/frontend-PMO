import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { BudgetComponentCatalogItem, BudgetComponentCatalogRequest } from '../models/budget-catalog.model';

@Injectable({ providedIn: 'root' })
export class BudgetCatalogService {
  private api = inject(ApiHttpClient);

  list(): Observable<BudgetComponentCatalogItem[]> {
    return this.api.get<BudgetComponentCatalogItem[]>(ENDPOINTS.budgetCatalog.list);
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
