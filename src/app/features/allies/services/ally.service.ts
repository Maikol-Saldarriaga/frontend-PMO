import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import { Ally, AllySupervisor, CreateAllyRequest, UpdateAllyRequest } from '../models/ally.model';

@Injectable({ providedIn: 'root' })
export class AllyService {
  private http = inject(ApiHttpClient);

  list(): Observable<Ally[]> {
    return this.http.get<Ally[]>(ENDPOINTS.allies.list);
  }

  create(data: CreateAllyRequest): Observable<Ally> {
    return this.http.post<Ally>(ENDPOINTS.allies.create, data);
  }

  getById(id: string): Observable<Ally> {
    return this.http.get<Ally>(ENDPOINTS.allies.detail(id));
  }

  update(id: string, data: UpdateAllyRequest): Observable<Ally> {
    return this.http.put<Ally>(ENDPOINTS.allies.update(id), data);
  }

  deactivate(id: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.allies.deactivate(id));
  }

  listSupervisors(id: string): Observable<AllySupervisor[]> {
    return this.http.get<AllySupervisor[]>(ENDPOINTS.allies.supervisors(id));
  }
}
