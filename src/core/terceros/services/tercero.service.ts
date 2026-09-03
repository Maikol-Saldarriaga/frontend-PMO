import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { Tercero, TerceroRequest } from '../models/tercero.model';

@Injectable({ providedIn: 'root' })
export class TerceroService {
  private api = inject(ApiHttpClient);

  listByProject(projectId: string): Observable<Tercero[]> {
    return this.api.get<Tercero[]>(ENDPOINTS.terceros.list(projectId));
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
