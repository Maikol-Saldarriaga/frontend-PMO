import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import {
  SupervisorListResponse,
  CreateSupervisorUserRequest,
  CreateSupervisorUserResponse,
  UpdateSupervisorUserRequest,
  CreateAffiliateRequest,
  CreateAffiliateResponse,
} from '../models/supervisor.model';
import { UserDetail } from '../../../../core/users/models/user.model';

@Injectable({ providedIn: 'root' })
export class SupervisorService {
  private http = inject(ApiHttpClient);

  getById(id: string): Observable<UserDetail> {
    return this.http.get<UserDetail>(ENDPOINTS.users.get(id));
  }

  // allyId filtra los supervisores aliados (affiliates) a los de esa alianza —
  // el backend ya soporta ?ally_id=. Sin él, devuelve todos (comportamiento previo).
  // search: ILIKE sobre nombre completo, aplica tanto a coordinadores como a
  // supervisores aliados. Cada lista viene topada a 200 filas server-side.
  getList(allyId?: string | null, search?: string): Observable<SupervisorListResponse> {
    const params: Record<string, string> = {};
    if (allyId) params['ally_id'] = allyId;
    if (search) params['search'] = search;
    return this.http.get<SupervisorListResponse>(ENDPOINTS.supervisors.list, { params });
  }

  createCoordinador(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.supervisors.createCoordinador, this.buildUserForm(data));
  }

  createSupervisorAliado(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.supervisors.createSupervisorAliado, this.buildUserForm(data));
  }

  createApoyo(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.supervisors.createApoyo, this.buildUserForm(data));
  }

  updateSupervisorAliado(id: string, data: UpdateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.put<CreateSupervisorUserResponse>(ENDPOINTS.supervisors.update(id), this.buildUserForm(data));
  }

  activateSupervisor(id: string): Observable<void> {
    return this.http.put<void>(ENDPOINTS.supervisors.activate(id), {});
  }

  deactivateSupervisor(id: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.supervisors.deactivate(id));
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
    if (data.ally_id)     fd.append('ally_id',      data.ally_id);
    return fd;
  }

  createAffiliate(contractId: string, data: CreateAffiliateRequest): Observable<CreateAffiliateResponse> {
    return this.http.post<CreateAffiliateResponse>(ENDPOINTS.supervisors.createAffiliate(contractId), data);
  }
}
