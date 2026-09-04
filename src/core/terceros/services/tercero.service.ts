import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { fetchAllPages } from '../../api/paginate';
import { Tercero, TerceroRequest } from '../models/tercero.model';

@Injectable({ providedIn: 'root' })
export class TerceroService {
  private api = inject(ApiHttpClient);

  /** El backend ahora pagina (data, next_cursor) — acá se recorren todas las páginas porque
   * el consumidor (picker de Egresos) necesita el set completo del proyecto en memoria. */
  listByProject(projectId: string): Observable<Tercero[]> {
    return fetchAllPages<Tercero>(this.api, ENDPOINTS.terceros.list(projectId));
  }

  create(projectId: string, body: TerceroRequest): Observable<Tercero> {
    return this.api.post<Tercero>(ENDPOINTS.terceros.create(projectId), body);
  }

  update(projectId: string, id: string, body: TerceroRequest): Observable<Tercero> {
    return this.api.put<Tercero>(ENDPOINTS.terceros.update(projectId, id), body);
  }

  deactivate(projectId: string, id: string): Observable<void> {
    return this.api.delete<void>(ENDPOINTS.terceros.deactivate(projectId, id));
  }
}
