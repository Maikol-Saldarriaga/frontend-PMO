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
  ContractObligation, ObligationRequest, ObligationEvidence, ObligationEvidenceRequest, ObligationImportRequest,
  SupplyPlanItem, SupplyPlanRequest, SupplyPlanSummary, SupplyPlanFilters,
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

  // ── Matriz de Cumplimiento (Compliance Matrix) ──────────────────────────────

  getObligations(contractId: string): Observable<ContractObligation[]> {
    return this.http.get<ContractObligation[]>(ENDPOINTS.obligations.list(contractId));
  }

  getObligationById(contractId: string, id: string): Observable<ContractObligation> {
    return this.http.get<ContractObligation>(ENDPOINTS.obligations.byId(contractId, id));
  }

  createObligation(contractId: string, data: ObligationRequest): Observable<ContractObligation> {
    return this.http.post<ContractObligation>(ENDPOINTS.obligations.create(contractId), data);
  }

  updateObligation(contractId: string, id: string, data: ObligationRequest): Observable<ContractObligation> {
    return this.http.put<ContractObligation>(ENDPOINTS.obligations.update(contractId, id), data);
  }

  deleteObligation(contractId: string, id: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.obligations.delete(contractId, id));
  }

  createObligationEvidence(contractId: string, obligationId: string, data: ObligationEvidenceRequest): Observable<ObligationEvidence> {
    return this.http.post<ObligationEvidence>(ENDPOINTS.obligations.evidences(contractId, obligationId), data);
  }

  /** Evidencia como archivo real (multipart): campo `file` + `compliance_method`/`verification_note` opcionales. */
  uploadObligationEvidence(contractId: string, obligationId: string, form: FormData): Observable<ObligationEvidence> {
    return this.http.post<ObligationEvidence>(ENDPOINTS.obligations.evidenceUpload(contractId, obligationId), form);
  }

  updateObligationEvidence(contractId: string, obligationId: string, id: string, data: ObligationEvidenceRequest): Observable<ObligationEvidence> {
    return this.http.put<ObligationEvidence>(ENDPOINTS.obligations.evidenceById(contractId, obligationId, id), data);
  }

  deleteObligationEvidence(contractId: string, obligationId: string, id: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.obligations.evidenceById(contractId, obligationId, id));
  }

  /** Aditivo: agrupa filas por (clause, reference, text) y crea obligación + evidencias sin duplicar texto. */
  importObligations(contractId: string, data: ObligationImportRequest): Observable<ContractObligation[]> {
    return this.http.post<ContractObligation[]>(ENDPOINTS.obligations.import(contractId), data);
  }

  /** Destructivo: reemplaza toda la matriz del contrato por el payload enviado. */
  replaceObligations(contractId: string, data: ObligationImportRequest): Observable<ContractObligation[]> {
    return this.http.put<ContractObligation[]>(ENDPOINTS.obligations.replace(contractId), data);
  }

  // ── Plan de Abastecimiento (Supply Plan) ────────────────────────────────────

  getSupplyPlan(contractId: string, filters: SupplyPlanFilters = {}): Observable<SupplyPlanItem[]> {
    const params = new URLSearchParams();
    if (filters.year)     params.set('year',     String(filters.year));
    if (filters.month)    params.set('month',    String(filters.month));
    if (filters.category) params.set('category', filters.category);
    if (filters.status)   params.set('status',   filters.status);
    const qs = params.toString();
    return this.http.get<SupplyPlanItem[]>(`${ENDPOINTS.supplyPlan.list(contractId)}${qs ? '?' + qs : ''}`);
  }

  createSupplyPlanItem(contractId: string, data: SupplyPlanRequest): Observable<SupplyPlanItem> {
    return this.http.post<SupplyPlanItem>(ENDPOINTS.supplyPlan.create(contractId), data);
  }

  getSupplyPlanItem(contractId: string, id: string): Observable<SupplyPlanItem> {
    return this.http.get<SupplyPlanItem>(ENDPOINTS.supplyPlan.byId(contractId, id));
  }

  updateSupplyPlanItem(contractId: string, id: string, data: SupplyPlanRequest): Observable<SupplyPlanItem> {
    return this.http.put<SupplyPlanItem>(ENDPOINTS.supplyPlan.update(contractId, id), data);
  }

  deleteSupplyPlanItem(contractId: string, id: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.supplyPlan.delete(contractId, id));
  }

  getSupplyPlanSummary(contractId: string): Observable<SupplyPlanSummary> {
    return this.http.get<SupplyPlanSummary>(ENDPOINTS.supplyPlan.summary(contractId));
  }

  importSupplyPlan(contractId: string, items: SupplyPlanRequest[]): Observable<SupplyPlanItem[]> {
    return this.http.post<SupplyPlanItem[]>(ENDPOINTS.supplyPlan.import(contractId), items);
  }
}
