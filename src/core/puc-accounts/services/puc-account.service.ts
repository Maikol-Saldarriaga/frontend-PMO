import { Injectable, inject } from '@angular/core';
import { Observable, expand, map, reduce, EMPTY } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { PUCAccount, PUCAccountRequest, PUCAccountListParams, PUCAccountPage, PUCAccountLite } from '../models/puc-account.model';

@Injectable({ providedIn: 'root' })
export class PUCAccountService {
  private api = inject(ApiHttpClient);

  /** Página paginada (keyset) del catálogo PUC. */
  list(params: PUCAccountListParams = {}): Observable<PUCAccountPage> {
    const query: Record<string, string> = {};
    if (params.cursor) query['cursor'] = params.cursor;
    if (params.limit) query['limit'] = String(params.limit);
    if (params.search) query['search'] = params.search;
    if (params.status) query['status'] = params.status;
    return this.api.get<PUCAccountPage>(ENDPOINTS.pucAccounts.list, { params: query });
  }

  /** Trae el catálogo completo recorriendo todas las páginas — para consumidores que
   * necesitan la lista entera en memoria (ej. el picker de búsqueda de Egresos). */
  listAll(params: Omit<PUCAccountListParams, 'cursor'> = {}): Observable<PUCAccount[]> {
    return this.list({ ...params, limit: params.limit ?? 100 }).pipe(
      expand(page => page.next_cursor
        ? this.list({ ...params, limit: params.limit ?? 100, cursor: page.next_cursor })
        : EMPTY),
      map(page => page.data),
      reduce<PUCAccount[], PUCAccount[]>((acc, data) => acc.concat(data), []),
    );
  }

  /** Solo cuentas activas, orden sort_order/code — para dropdowns/pickers. Cacheado 30min
   * en backend, no usar para el catálogo administrable (esa sigue paginada por /puc-accounts). */
  picker(): Observable<PUCAccountLite[]> {
    return this.api.get<PUCAccountLite[]>(ENDPOINTS.pucAccounts.picker);
  }

  create(body: PUCAccountRequest): Observable<PUCAccount> {
    return this.api.post<PUCAccount>(ENDPOINTS.pucAccounts.create, body);
  }

  update(id: string, body: PUCAccountRequest): Observable<PUCAccount> {
    return this.api.put<PUCAccount>(ENDPOINTS.pucAccounts.update(id), body);
  }

  deactivate(id: string): Observable<void> {
    return this.api.delete<void>(ENDPOINTS.pucAccounts.deactivate(id));
  }
}
