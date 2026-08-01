import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../../../core/api/http-client';
import { CursorPage, fetchAllPages } from '../../../../core/api/paginate';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import { Ally, AllySupervisor, CreateAllyRequest, UpdateAllyRequest } from '../models/ally.model';

@Injectable({ providedIn: 'root' })
export class AllyService {
  private http = inject(ApiHttpClient);

  // GET /allies?search=<texto>&status=active|inactive&limit=&cursor= — paginado (data, next_cursor).
  // Usado en la tabla admin de alianzas (con botones Anterior/Siguiente).
  //   search: coincide contra name, nit, email, phone
  //   status: filtra por is_active (sin el param, devuelve todos)
  list(params?: { search?: string; status?: 'active' | 'inactive'; cursor?: string | number; limit?: number }): Observable<CursorPage<Ally>> {
    const query: Record<string, string> = { limit: String(params?.limit ?? 20) };
    if (params?.search) query['search'] = params.search;
    if (params?.status) query['status'] = params.status;
    if (params?.cursor) query['cursor'] = String(params.cursor);
    return this.http.get<CursorPage<Ally>>(ENDPOINTS.allies.list, { params: query });
  }

  // Trae todos los aliados activos, sin paginar — para selects/dropdowns
  // (crear proyecto, tab equipo) donde se necesita el set completo.
  listAll(): Observable<Ally[]> {
    return fetchAllPages<Ally>(this.http, ENDPOINTS.allies.list, { status: 'active' });
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

  activate(id: string): Observable<void> {
    return this.http.put<void>(ENDPOINTS.allies.activate(id), {});
  }

  // GET /allies/:id/supervisors?search=<texto>&status=active|inactive&limit=&cursor= — paginado (data, next_cursor).
  //   search: coincide contra full_name, identification_number
  //   status: filtra por is_active — sin el param devuelve activos E inactivos
  //   (antes el backend forzaba is_active=true; ya no, hay que mandar status=active explícito si se quiere solo activos)
  listSupervisors(id: string, params?: { search?: string; status?: 'active' | 'inactive'; cursor?: string | number; limit?: number }): Observable<CursorPage<AllySupervisor>> {
    const query: Record<string, string> = { limit: String(params?.limit ?? 20) };
    if (params?.search) query['search'] = params.search;
    if (params?.status) query['status'] = params.status;
    if (params?.cursor) query['cursor'] = String(params.cursor);
    return this.http.get<CursorPage<AllySupervisor>>(ENDPOINTS.allies.supervisors(id), { params: query });
  }
}
