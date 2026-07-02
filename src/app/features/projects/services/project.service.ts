import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import {
  ProjectDetails,
  BudgetItemRequest,
  BudgetItem,
  MonthlyWizardResponse,
  MonthlyBulkRequest,
  MonthlyDistributionRequest,
  BudgetMonthlyDistribution,
  ProjectStep1Request,
  ProjectStep2Request,
  ProjectStep2Response,
  ProjectStep3Request,
  ProjectStep3Response,
  ProjectStep4Request,
  ProjectStep4Response,
  ProjectStep5Request,
  ProjectStep5Response,
  ProjectStep6Request,
  ProjectStep6Response,
  ProjectStep7Request, ProjectStep7Response,
  ProjectStep8Request, ProjectStep8Response,
  ProjectStep9Request, ProjectStep9Response,
  ProjectCreateResponse,
  ProjectsPageResponse,
  ProjectWizardResponse,
  BudgetWizardResponse,
  BudgetComponent,
  BudgetComponentRequest,
  GanttResponse,
  GanttFilters,
  ScopeComponent,
  ScopeActivity,
  ComponentsActsResponse,
  CreateComponentRequest,
  UpdateComponentRequest,
  ActivityRequest,
  Snapshot,
  SnapshotRequest,
  ProjectSnapshotsResponse,
  ScopeSnapshotsResponse,
  DeliveryRequest,
  Delivery,
  DeliveryVerification,
  Risk,
  RiskRequest,
  RiskTrackingItem,
  RiskTrackingRequest,
  Beneficiary,
  BeneficiaryRequest,
  BeneficiaryPageResponse,
  IndicatorVerification,
  Indicator,
  IndicatorRequest,
} from '../models/project.model';

export interface ProjectFilters {
  name?:      string;
  type?:      string;
  status?:    string;
  date_from?: string;
  date_to?:   string;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private http = inject(ApiHttpClient);

  getProjects(limit = 20, cursor = 0, filters: ProjectFilters = {}): Observable<ProjectsPageResponse> {
    const params = new URLSearchParams({ limit: String(limit), cursor: String(cursor) });
    if (filters.name)      params.set('name',      filters.name);
    if (filters.type)      params.set('type',      filters.type);
    if (filters.status)    params.set('status',    filters.status);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to)   params.set('date_to',   filters.date_to);
    return this.http.get<ProjectsPageResponse>(`${ENDPOINTS.projects.list}?${params.toString()}`);
  }

  getProject(id: string): Observable<ProjectCreateResponse> {
    return this.http.get<ProjectCreateResponse>(ENDPOINTS.projects.detail(id));
  }

  getProjectWizard(id: string): Observable<ProjectWizardResponse> {
    return this.http.get<ProjectWizardResponse>(`${ENDPOINTS.projects.detail(id)}/wizard`);
  }

  createStep1(data: ProjectStep1Request): Observable<ProjectCreateResponse> {
    return this.http.post<ProjectCreateResponse>(ENDPOINTS.projects.steps(1), data);
  }

  updateStep1(projectId: string, data: ProjectStep1Request): Observable<ProjectCreateResponse> {
    return this.http.put<ProjectCreateResponse>(ENDPOINTS.projects.stepById(projectId, 1), data);
  }

  updateStep2(projectId: string, data: ProjectStep2Request): Observable<ProjectStep2Response> {
    return this.http.put<ProjectStep2Response>(ENDPOINTS.projects.stepById(projectId, 2), data);
  }

  updateStep3(projectId: string, data: ProjectStep3Request): Observable<ProjectStep3Response> {
    return this.http.put<ProjectStep3Response>(ENDPOINTS.projects.stepById(projectId, 3), data);
  }

  updateStep4(projectId: string, data: ProjectStep4Request): Observable<ProjectStep4Response> {
    return this.http.put<ProjectStep4Response>(ENDPOINTS.projects.stepById(projectId, 4), data);
  }

  updateStep5(projectId: string, data: ProjectStep5Request): Observable<ProjectStep5Response> {
    return this.http.put<ProjectStep5Response>(ENDPOINTS.projects.stepById(projectId, 5), data);
  }

  updateStep6(projectId: string, data: ProjectStep6Request): Observable<ProjectStep6Response> {
    return this.http.put<ProjectStep6Response>(ENDPOINTS.projects.stepById(projectId, 6), data);
  }

  updateStep7(id: string, data: ProjectStep7Request): Observable<ProjectStep7Response> {
    return this.http.put<ProjectStep7Response>(ENDPOINTS.projects.stepById(id, 7), data);
  }

  updateStep8(id: string, data: ProjectStep8Request): Observable<ProjectStep8Response> {
    return this.http.put<ProjectStep8Response>(ENDPOINTS.projects.stepById(id, 8), data);
  }

  updateStep9(id: string, data: ProjectStep9Request): Observable<ProjectStep9Response> {
    return this.http.put<ProjectStep9Response>(ENDPOINTS.projects.stepById(id, 9), data);
  }

  getProjectDetails(id: string): Observable<ProjectDetails> {
    return this.http.get<ProjectDetails>(ENDPOINTS.projects.details(id));
  }

  getBudgetWizard(id: string): Observable<BudgetWizardResponse> {
    return this.http.get<BudgetWizardResponse>(ENDPOINTS.projects.budgetWizard(id));
  }

  createBudgetItem(id: string, data: BudgetItemRequest): Observable<BudgetItem> {
    return this.http.post<BudgetItem>(ENDPOINTS.projects.budget(id), data);
  }

  updateBudgetItem(id: string, bid: string, data: BudgetItemRequest): Observable<BudgetItem> {
    return this.http.put<BudgetItem>(ENDPOINTS.projects.budgetItem(id, bid), data);
  }

  deleteBudgetItem(id: string, bid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.budgetItem(id, bid));
  }

  getBudgetComponents(id: string): Observable<BudgetComponent[]> {
    return this.http.get<BudgetComponent[]>(ENDPOINTS.projects.budgetComponents(id));
  }

  createBudgetComponent(id: string, data: BudgetComponentRequest): Observable<BudgetComponent> {
    return this.http.post<BudgetComponent>(ENDPOINTS.projects.budgetComponents(id), data);
  }

  updateBudgetComponent(id: string, bid: string, data: BudgetComponentRequest): Observable<BudgetComponent> {
    return this.http.put<BudgetComponent>(ENDPOINTS.projects.budgetComponentById(id, bid), data);
  }

  deleteBudgetComponent(id: string, bid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.budgetComponentById(id, bid));
  }

  getMonthlyWizard(id: string): Observable<MonthlyWizardResponse> {
    return this.http.get<MonthlyWizardResponse>(ENDPOINTS.projects.monthlyWizard(id));
  }

  saveMonthlyBulk(id: string, bid: string, data: MonthlyBulkRequest): Observable<void> {
    return this.http.put<void>(ENDPOINTS.projects.monthlyBulk(id, bid), data);
  }

  updateMonthlyDistribution(id: string, bid: string, did: string, data: MonthlyDistributionRequest): Observable<BudgetMonthlyDistribution> {
    return this.http.put<BudgetMonthlyDistribution>(ENDPOINTS.projects.monthlySingle(id, bid, did), data);
  }

  deleteMonthlyDistribution(id: string, bid: string, did: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.monthlySingle(id, bid, did));
  }

  getGantt(id: string, filters: GanttFilters = {}): Observable<GanttResponse> {
    const params = new URLSearchParams();
    if (filters.year)     params.set('year',     String(filters.year));
    if (filters.semester) params.set('semester', String(filters.semester));
    if (filters.month)    params.set('month',    String(filters.month));
    const qs = params.toString();
    return this.http.get<GanttResponse>(`${ENDPOINTS.projects.gantt(id)}${qs ? '?' + qs : ''}`);
  }

  getScopeComponents(id: string): Observable<ComponentsActsResponse> {
    return this.http.get<ComponentsActsResponse>(ENDPOINTS.projects.componentsActs(id));
  }

  createComponent(id: string, data: CreateComponentRequest): Observable<ScopeComponent> {
    return this.http.post<ScopeComponent>(ENDPOINTS.projects.components(id), data);
  }

  updateComponent(id: string, cid: string, data: UpdateComponentRequest): Observable<ScopeComponent> {
    return this.http.put<ScopeComponent>(ENDPOINTS.projects.componentById(id, cid), data);
  }

  deleteComponent(id: string, cid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.componentById(id, cid));
  }

  createScope(id: string, cid: string, data: ActivityRequest): Observable<ScopeActivity> {
    return this.http.post<ScopeActivity>(ENDPOINTS.projects.componentScopes(id, cid), data);
  }

  updateScope(id: string, cid: string, sid: string, data: ActivityRequest): Observable<ScopeActivity> {
    return this.http.put<ScopeActivity>(ENDPOINTS.projects.scopeById(id, cid, sid), data);
  }

  deleteScope(id: string, cid: string, sid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.scopeById(id, cid, sid));
  }

  getProjectSnapshots(id: string): Observable<ProjectSnapshotsResponse> {
    return this.http.get<ProjectSnapshotsResponse>(ENDPOINTS.projects.snapshots(id));
  }

  getScopeSnapshots(id: string, sid: string): Observable<ScopeSnapshotsResponse> {
    return this.http.get<ScopeSnapshotsResponse>(ENDPOINTS.projects.scopeSnapshots(id, sid));
  }

  upsertSnapshot(id: string, sid: string, data: SnapshotRequest): Observable<Snapshot> {
    return this.http.put<Snapshot>(ENDPOINTS.projects.scopeSnapshot(id, sid), data);
  }

  getDelivery(id: string, sid: string, snid: string): Observable<Delivery> {
    return this.http.get<Delivery>(ENDPOINTS.projects.snapshotDelivery(id, sid, snid));
  }

  upsertDelivery(id: string, sid: string, snid: string, data: DeliveryRequest): Observable<Delivery> {
    return this.http.put<Delivery>(ENDPOINTS.projects.snapshotDelivery(id, sid, snid), data);
  }

  deleteDelivery(id: string, sid: string, snid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.snapshotDelivery(id, sid, snid));
  }

  uploadDeliveryVerification(id: string, sid: string, snid: string, form: FormData): Observable<DeliveryVerification> {
    return this.http.post<DeliveryVerification>(ENDPOINTS.projects.snapshotDeliveryVerifications(id, sid, snid), form);
  }

  deleteDeliveryVerification(id: string, sid: string, snid: string, vid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.snapshotDeliveryVerificationById(id, sid, snid, vid));
  }

  getIndicators(id: string): Observable<Indicator[]> {
    return this.http.get<Indicator[]>(ENDPOINTS.projects.indicators(id));
  }

  createIndicator(id: string, data: IndicatorRequest): Observable<Indicator> {
    return this.http.post<Indicator>(ENDPOINTS.projects.indicators(id), data);
  }

  updateIndicator(id: string, iid: string, data: IndicatorRequest): Observable<Indicator> {
    return this.http.put<Indicator>(ENDPOINTS.projects.indicatorById(id, iid), data);
  }

  deleteIndicator(id: string, iid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.indicatorById(id, iid));
  }

  getIndicatorVerifications(id: string, iid: string): Observable<IndicatorVerification[]> {
    return this.http.get<IndicatorVerification[]>(ENDPOINTS.projects.indicatorVerifications(id, iid));
  }

  uploadIndicatorVerification(id: string, iid: string, form: FormData): Observable<IndicatorVerification> {
    return this.http.post<IndicatorVerification>(ENDPOINTS.projects.indicatorVerifications(id, iid), form);
  }

  deleteIndicatorVerification(id: string, iid: string, vid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.indicatorVerificationById(id, iid, vid));
  }

  getRisks(id: string): Observable<Risk[]> {
    return this.http.get<Risk[]>(ENDPOINTS.projects.risks(id));
  }

  createRisk(id: string, data: RiskRequest): Observable<Risk> {
    return this.http.post<Risk>(ENDPOINTS.projects.risks(id), data);
  }

  updateRisk(id: string, rid: string, data: RiskRequest): Observable<Risk> {
    return this.http.put<Risk>(ENDPOINTS.projects.riskById(id, rid), data);
  }

  deleteRisk(id: string, rid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.riskById(id, rid));
  }

  getRiskTracking(id: string, rid: string): Observable<RiskTrackingItem[]> {
    return this.http.get<RiskTrackingItem[]>(ENDPOINTS.projects.riskTracking(id, rid));
  }

  upsertRiskTracking(id: string, rid: string, data: RiskTrackingRequest): Observable<RiskTrackingItem> {
    return this.http.put<RiskTrackingItem>(ENDPOINTS.projects.riskTracking(id, rid), data);
  }

  getBeneficiaries(id: string, cursor?: string | null, limit = 50): Observable<BeneficiaryPageResponse> {
    const params = new URLSearchParams({ is_beneficiary: 'true', limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.http.get<BeneficiaryPageResponse>(`${ENDPOINTS.projects.affiliates(id)}?${params.toString()}`);
  }

  createBeneficiary(id: string, data: BeneficiaryRequest): Observable<Beneficiary> {
    return this.http.post<Beneficiary>(ENDPOINTS.projects.affiliates(id), { ...data, is_beneficiary: true });
  }

  updateBeneficiary(id: string, bid: string, data: BeneficiaryRequest): Observable<Beneficiary> {
    return this.http.put<Beneficiary>(ENDPOINTS.projects.affiliateById(id, bid), { ...data, is_beneficiary: true });
  }

  deleteBeneficiary(id: string, bid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.affiliateById(id, bid));
  }

}
