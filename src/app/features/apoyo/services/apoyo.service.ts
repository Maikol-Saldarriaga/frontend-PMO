import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../../../core/api/http-client';
import { CursorPage } from '../../../../core/api/paginate';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import { UserDetail } from '../../../../core/users/models/user.model';
import {
  CreateSupervisorUserRequest,
  UpdateSupervisorUserRequest,
  CreateSupervisorUserResponse,
} from '../../projects/models/supervisor.model';

@Injectable({ providedIn: 'root' })
export class ApoyoService {
  private http = inject(ApiHttpClient);

  // GET /users?role=APOYO&search=<texto>&status=active|inactive&limit=&cursor= — paginado
  // (data, next_cursor), admin-only.
  //   search: coincide contra first_name, first_surname, second_surname, email, phone
  //   status: filtra por is_active (sin el param, devuelve todos)
  list(params?: { search?: string; status?: 'active' | 'inactive'; cursor?: string | number; limit?: number }): Observable<CursorPage<UserDetail>> {
    const query: Record<string, string> = { role: 'APOYO', limit: String(params?.limit ?? 20) };
    if (params?.search) query['search'] = params.search;
    if (params?.status) query['status'] = params.status;
    if (params?.cursor) query['cursor'] = String(params.cursor);
    return this.http.get<CursorPage<UserDetail>>(ENDPOINTS.apoyo.list, { params: query });
  }

  create(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.apoyo.create, this.buildUserForm(data));
  }

  update(id: string, data: UpdateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.put<CreateSupervisorUserResponse>(ENDPOINTS.apoyo.update(id), this.buildUserForm(data));
  }

  activate(id: string): Observable<void> {
    return this.http.put<void>(ENDPOINTS.apoyo.activate(id), {});
  }

  deactivate(id: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.apoyo.deactivate(id));
  }

  private buildUserForm(data: UpdateSupervisorUserRequest): FormData {
    const fd = new FormData();
    fd.append('first_name',               data.first_name);
    fd.append('first_surname',            data.first_surname);
    fd.append('second_surname',           data.second_surname);
    fd.append('document_type',            data.document_type);
    fd.append('identity_document_number', data.identity_document_number);
    fd.append('email',                    data.email);
    fd.append('phone',                    data.phone);
    if (data.password)    fd.append('password',    data.password);
    if (data.middle_name) fd.append('middle_name', data.middle_name);
    if (data.image_url)   fd.append('image_url',   data.image_url, data.image_url.name);
    return fd;
  }
}
