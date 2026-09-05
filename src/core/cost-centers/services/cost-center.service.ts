import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { CursorPage, fetchAllPages } from '../../api/paginate';
import { ENDPOINTS } from '../../api/endpoints';
import { CostCenter, CostCenterRequest } from '../models/cost-center.model';

@Injectable({ providedIn: 'root' })
export class CostCenterService {
  private api = inject(ApiHttpClient);

  /** Página paginada (keyset) del catálogo — usada por la pantalla admin con scroll infinito. */
  list(params?: { cursor?: string | number; limit?: number }): Observable<CursorPage<CostCenter>> {
    const query: Record<string, string> = { limit: String(params?.limit ?? 40) };
    if (params?.cursor) query['cursor'] = String(params.cursor);
    return this.api.get<CursorPage<CostCenter>>(ENDPOINTS.costCenters.list, { params: query });
  }

  /** Catálogo completo — para el picker de Egresos, que necesita el set entero en memoria. */
  listAll(): Observable<CostCenter[]> {
    return fetchAllPages<CostCenter>(this.api, ENDPOINTS.costCenters.list);
  }

  create(body: CostCenterRequest): Observable<CostCenter> {
    return this.api.post<CostCenter>(ENDPOINTS.costCenters.create, body);
  }

  update(id: string, body: CostCenterRequest): Observable<CostCenter> {
    return this.api.put<CostCenter>(ENDPOINTS.costCenters.update(id), body);
  }

  deactivate(id: string): Observable<void> {
    return this.api.delete<void>(ENDPOINTS.costCenters.deactivate(id));
  }
}
