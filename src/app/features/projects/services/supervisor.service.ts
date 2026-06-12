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

  getList(): Observable<SupervisorListResponse> {
    return this.http.get<SupervisorListResponse>(ENDPOINTS.supervisors.list);
  }

  createUser(data: CreateSupervisorUserRequest): Observable<CreateSupervisorUserResponse> {
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
    fd.append('role',                     data.role);
    if (data.middle_name) fd.append('middle_name', data.middle_name);
    if (data.address)     fd.append('address',     data.address);
    if (data.image_url)   fd.append('image_url',   data.image_url, data.image_url.name);
    return this.http.post<CreateSupervisorUserResponse>(ENDPOINTS.supervisors.createUser, fd);
  }

  createAffiliate(contractId: string, data: CreateAffiliateRequest): Observable<CreateAffiliateResponse> {
    return this.http.post<CreateAffiliateResponse>(ENDPOINTS.supervisors.createAffiliate(contractId), data);
  }
}
