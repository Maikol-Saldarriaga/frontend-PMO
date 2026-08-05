import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../../../core/api/http-client';
import { CursorPage } from '../../../../core/api/paginate';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import { UserDetail } from '../../../../core/users/models/user.model';
import {
  CreateSupervisorUserRequest,
  CreateSupervisorUserResponse,
} from '../../projects/models/supervisor.model';

@Injectable({ providedIn: 'root' })
export class FoundationUserService {
  private http = inject(ApiHttpClient);

  // GET /users?search=<texto>&status=active|inactive&limit=&cursor= — paginado (data, next_cursor).
  //   search: coincide contra first_name, first_surname, second_surname, email, phone
  //   status: filtra por is_active (sin el param, devuelve todos)
  list(params?: { search?: string; status?: 'active' | 'inactive'; cursor?: string | number; limit?: number }): Observable<CursorPage<UserDetail>> {
    const query: Record<string, string> = { limit: String(params?.limit ?? 20) };
    if (params?.search) query['search'] = params.search;
    if (params?.status) query['status'] = params.status;
    if (params?.cursor) query['cursor'] = String(params.cursor);
    return this.http.get<CursorPage<UserDetail>>(ENDPOINTS.users.list, { params: query });
  }

  createCoordinador(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.supervisors.createCoordinador, this.buildUserForm(data));
  }

  createDiligenciador(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.foundationUsers.createDiligenciador, this.buildUserForm(data));
  }

  activate(id: string): Observable<void> {
    return this.http.put<void>(ENDPOINTS.foundationUsers.activate(id), {});
  }

  deactivate(id: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.foundationUsers.deactivate(id));
  }

  private buildUserForm(data: CreateSupervisorUserRequest): FormData {
    const fd = new FormData();
    fd.append('first_name',               data.first_name);
    fd.append('first_surname',            data.first_surname);
    fd.append('second_surname',           data.second_surname);
    fd.append('document_type',            data.document_type);
    fd.append('identity_document_number', data.identity_document_number);
    fd.append('email',                    data.email);
    fd.append('phone',                    data.phone);
    fd.append('password',                 data.password);
    if (data.middle_name) fd.append('middle_name', data.middle_name);
    if (data.image_url)   fd.append('image_url',   data.image_url, data.image_url.name);
    return fd;
  }
}
