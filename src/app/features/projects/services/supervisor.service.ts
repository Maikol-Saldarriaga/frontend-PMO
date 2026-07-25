import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import {
  SupervisorListResponse,
  CreateSupervisorUserRequest,
  CreateSupervisorUserResponse,
  CreateAffiliateRequest,
  CreateAffiliateResponse,
} from '../models/supervisor.model';

@Injectable({ providedIn: 'root' })
export class SupervisorService {
  private http = inject(ApiHttpClient);

  // allyId filtra los supervisores aliados (affiliates) a los de esa alianza —
  // el backend ya soporta ?ally_id=. Sin él, devuelve todos (comportamiento previo).
  getList(allyId?: string | null): Observable<SupervisorListResponse> {
    const params = allyId ? { ally_id: allyId } : undefined;
    return this.http.get<SupervisorListResponse>(ENDPOINTS.supervisors.list, { params });
  }

  createCoordinador(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.supervisors.createCoordinador, this.buildUserForm(data));
  }

  createSupervisorAliado(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.supervisors.createSupervisorAliado, this.buildUserForm(data));
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
    if (data.ally_id)     fd.append('ally_id',      data.ally_id);
    return fd;
  }

  createAffiliate(contractId: string, data: CreateAffiliateRequest): Observable<CreateAffiliateResponse> {
    return this.http.post<CreateAffiliateResponse>(ENDPOINTS.supervisors.createAffiliate(contractId), data);
  }
}
