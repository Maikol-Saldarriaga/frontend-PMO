import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import {
  ContractStep1Request, ContractStep1Response,
  ContractStep1bRequest,
  ContractStep2Request,
  ContractLocationItem,
  ContractStep3Request,
  ContractStep4Request,
  ContractStep5Request,
  ContractStep6Request,
  ContractStep7Request,
  ContractStep8Request, WizardStep8ComponentResponse,
  ContractStep9Request,
  ContractStep10Request,
  ContractProgressResponse,
  ContractServiceResponse,
  ContractWizardResponse,
  SupportResponse,
} from '../models/contract.model';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private http = inject(ApiHttpClient);

  getWizard(id: string): Observable<ContractWizardResponse> {
    return this.http.get<ContractWizardResponse>(ENDPOINTS.contracts.wizard(id));
  }

  createStep1(data: ContractStep1Request): Observable<ContractStep1Response> {
    return this.http.post<ContractStep1Response>(ENDPOINTS.contracts.step1, data);
  }

  updateStep1(id: string, data: ContractStep1Request): Observable<ContractStep1Response> {
    return this.http.put<ContractStep1Response>(ENDPOINTS.contracts.stepById(id, 1), data);
  }

  updateStep1b(id: string, data: ContractStep1bRequest): Observable<ContractServiceResponse> {
    return this.http.put<ContractServiceResponse>(ENDPOINTS.contracts.step1b(id), data);
  }

  updateStep2(id: string, data: ContractStep2Request): Observable<ContractProgressResponse> {
    return this.http.put<ContractProgressResponse>(ENDPOINTS.contracts.stepById(id, 2), data);
  }

  getLocations(id: string): Observable<ContractLocationItem[]> {
    return this.http.get<ContractLocationItem[]>(ENDPOINTS.contracts.locations(id));
  }

  /** Reemplaza todas las ubicaciones del proyecto (usado fuera del wizard, ej. tab de detalle). */
  updateLocations(id: string, data: ContractStep2Request): Observable<ContractProgressResponse> {
    return this.http.put<ContractProgressResponse>(ENDPOINTS.contracts.locations(id), data);
  }

  updateStep3(id: string, data: ContractStep3Request): Observable<ContractServiceResponse> {
    return this.http.put<ContractServiceResponse>(ENDPOINTS.contracts.stepById(id, 3), data);
  }

  updateStep4(id: string, sid: string, data: ContractStep4Request): Observable<ContractProgressResponse> {
    return this.http.put<ContractProgressResponse>(ENDPOINTS.contracts.step4(id, sid), data);
  }

  updateStep5(id: string, data: ContractStep5Request): Observable<ContractProgressResponse> {
    return this.http.put<ContractProgressResponse>(ENDPOINTS.contracts.stepById(id, 5), data);
  }

  updateStep6(id: string, data: ContractStep6Request): Observable<ContractProgressResponse> {
    return this.http.put<ContractProgressResponse>(ENDPOINTS.contracts.stepById(id, 6), data);
  }

  updateStep7(id: string, data: ContractStep7Request): Observable<ContractProgressResponse> {
    return this.http.put<ContractProgressResponse>(ENDPOINTS.contracts.stepById(id, 7), data);
  }

  updateStep8(id: string, data: ContractStep8Request): Observable<WizardStep8ComponentResponse[]> {
    return this.http.put<WizardStep8ComponentResponse[]>(ENDPOINTS.contracts.stepById(id, 8), data);
  }

  updateStep9(id: string, data: ContractStep9Request): Observable<ContractProgressResponse> {
    return this.http.put<ContractProgressResponse>(ENDPOINTS.contracts.stepById(id, 9), data);
  }

  updateStep10(id: string, data: ContractStep10Request): Observable<ContractProgressResponse> {
    return this.http.put<ContractProgressResponse>(ENDPOINTS.contracts.stepById(id, 10), data);
  }

  uploadSupport(id: string, sid: string, form: FormData): Observable<SupportResponse> {
    return this.http.post<SupportResponse>(ENDPOINTS.contracts.supports(id, sid), form);
  }

  deleteSupport(id: string, sid: string, spid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.contracts.supportById(id, sid, spid));
  }
}
