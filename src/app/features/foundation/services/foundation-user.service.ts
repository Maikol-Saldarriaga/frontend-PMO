import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import { UserDetail } from '../../../../core/users/models/user.model';
import {
  CreateSupervisorUserRequest,
  CreateSupervisorUserResponse,
} from '../../projects/models/supervisor.model';

@Injectable({ providedIn: 'root' })
export class FoundationUserService {
  private http = inject(ApiHttpClient);

  // El backend pagina la respuesta ({ data, next_cursor }); antes se esperaba
  // un array plano y el .filter() del componente fallaba en silencio, dejando
  // la pantalla en "Cargando usuarios..." para siempre.
  list(): Observable<UserDetail[]> {
    return this.http.get<any>(ENDPOINTS.users.list).pipe(
      map(res => Array.isArray(res) ? res : (res?.data ?? [])),
    );
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
    fd.append('birthdate',                data.birthdate);
    fd.append('email',                    data.email);
    fd.append('phone',                    data.phone);
    fd.append('password',                 data.password);
    if (data.middle_name) fd.append('middle_name', data.middle_name);
    if (data.address)     fd.append('address',     data.address);
    if (data.image_url)   fd.append('image_url',   data.image_url, data.image_url.name);
    return fd;
  }
}
