import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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
  CreateBudgetComponentRequest,
  UpdateBudgetComponentRequest,
  BudgetReconciliation,
  Invoice,
  InvoiceRequest,
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
  GenerateSnapshotsRequest,
  GenerateSnapshotsResponse,
  DateRange,
  DeleteSnapshotsByRangeResponse,
  TrackingReport,
  ReportToken,
  CreateReportTokenResponse,
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
  BeneficiaryBulkResponse,
  IndicatorVerification,
  Indicator,
  IndicatorRequest,
  ProjectDocumentsResponse,
  ProjectScheduleItem,
  ProjectAccess,
  TeamMember,
  TeamMemberRequest,
  SectionPermission,
  ProjectSection,
  UserListItem,
  ProjectExtension,
  ProjectExtensionRequest,
  FundingReceipt,
  FundingReceiptRequest,
  CashFlowReport,
  BudgetReportParams,
  Guarantee,
  GuaranteeRequest,
  ProjectSignatureInfo,
  ProjectSignatureRequest,
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

  getProjects(limit = 20, cursor: string | number = 0, filters: ProjectFilters = {}): Observable<ProjectsPageResponse> {
    const params = new URLSearchParams({ limit: String(limit), cursor: String(cursor) });
    if (filters.name)      params.set('name',      filters.name);
    if (filters.type)      params.set('type',      filters.type);
    if (filters.status)    params.set('status',    filters.status);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to)   params.set('date_to',   filters.date_to);
    return this.http.get<ProjectsPageResponse>(`${ENDPOINTS.projects.list}?${params.toString()}`);
  }

  getSchedule(statuses?: string[]): Observable<ProjectScheduleItem[]> {
    const url = statuses && statuses.length
      ? `${ENDPOINTS.projects.schedule}?status=${statuses.join(',')}`
      : ENDPOINTS.projects.schedule;
    return this.http.get<ProjectScheduleItem[]>(url);
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

  getBudgetItem(id: string, bid: string): Observable<BudgetItem> {
    return this.http.get<BudgetItem>(ENDPOINTS.projects.budgetItem(id, bid));
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

  createBudgetComponent(id: string, data: CreateBudgetComponentRequest): Observable<BudgetComponent> {
    return this.http.post<BudgetComponent>(ENDPOINTS.projects.budgetComponents(id), data);
  }

  updateBudgetComponent(id: string, bid: string, data: UpdateBudgetComponentRequest): Observable<BudgetComponent> {
    return this.http.put<BudgetComponent>(ENDPOINTS.projects.budgetComponentById(id, bid), data);
  }

  deleteBudgetComponent(id: string, bid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.budgetComponentById(id, bid));
  }

  getBudgetReconciliation(id: string): Observable<BudgetReconciliation> {
    return this.http.get<BudgetReconciliation>(ENDPOINTS.projects.budgetReconciliation(id));
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

  generateMonthly(id: string, bid: string): Observable<BudgetMonthlyDistribution[]> {
    return this.http.post<BudgetMonthlyDistribution[]>(ENDPOINTS.projects.monthlyGenerate(id, bid), {});
  }

  listInvoices(id: string, bid: string): Observable<Invoice[]> {
    return this.http.get<Invoice[]>(ENDPOINTS.projects.invoices(id, bid));
  }

  createInvoice(id: string, bid: string, data: InvoiceRequest): Observable<Invoice> {
    return this.http.post<Invoice>(ENDPOINTS.projects.invoices(id, bid), data);
  }

  updateInvoice(id: string, bid: string, iid: string, data: InvoiceRequest): Observable<Invoice> {
    return this.http.put<Invoice>(ENDPOINTS.projects.invoiceById(id, bid, iid), data);
  }

  deleteInvoice(id: string, bid: string, iid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.invoiceById(id, bid, iid));
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

  updateComponentOrder(id: string, cid: string, order: number): Observable<ScopeComponent[]> {
    return this.http.put<ScopeComponent[]>(ENDPOINTS.projects.componentOrder(id, cid), { order });
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

  generateSnapshots(id: string, sid: string, data: GenerateSnapshotsRequest): Observable<GenerateSnapshotsResponse> {
    return this.http.post<GenerateSnapshotsResponse>(ENDPOINTS.projects.scopeSnapshotsAutoGenerate(id, sid), data);
  }

  deleteSnapshot(id: string, sid: string, snid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.scopeSnapshotById(id, sid, snid));
  }

  deleteSnapshotsByRange(id: string, sid: string, range: DateRange): Observable<DeleteSnapshotsByRangeResponse> {
    return this.http.post<DeleteSnapshotsByRangeResponse>(ENDPOINTS.projects.scopeSnapshotsDeleteRange(id, sid), range);
  }

  rebalanceCheckpointPct(id: string, sid: string, items: { id: string; planned_pct: number }[], pendingPct: number): Observable<ScopeSnapshotsResponse> {
    return this.http.put<ScopeSnapshotsResponse>(ENDPOINTS.projects.scopeSnapshotsRebalance(id, sid), { items, pending_pct: pendingPct });
  }

  getTrackingReport(id: string): Observable<TrackingReport> {
    return this.http.get<TrackingReport>(ENDPOINTS.projects.trackingReport(id));
  }

  downloadTrackingReportCsv(id: string): Observable<Blob> {
    return this.http.getBlob(ENDPOINTS.projects.trackingReportCsv(id));
  }

  createReportToken(id: string): Observable<CreateReportTokenResponse> {
    return this.http.post<CreateReportTokenResponse>(ENDPOINTS.projects.trackingReportTokens(id), {});
  }

  listReportTokens(id: string): Observable<{ tokens: ReportToken[] }> {
    return this.http.get<{ tokens: ReportToken[] }>(ENDPOINTS.projects.trackingReportTokens(id));
  }

  revokeReportToken(id: string, tokenId: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.trackingReportTokenById(id, tokenId));
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

  bulkImportBeneficiaries(id: string, items: BeneficiaryRequest[]): Observable<BeneficiaryBulkResponse> {
    return this.http.post<BeneficiaryBulkResponse>(ENDPOINTS.projects.affiliatesBulk(id), { items });
  }

  getDocuments(id: string): Observable<ProjectDocumentsResponse> {
    return this.http.get<ProjectDocumentsResponse>(ENDPOINTS.projects.documents(id));
  }

  getMyAccess(id: string): Observable<ProjectAccess> {
    return this.http.get<ProjectAccess>(ENDPOINTS.projects.myAccess(id));
  }

  getTeam(id: string): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(ENDPOINTS.projects.team(id));
  }

  addTeamMember(id: string, data: TeamMemberRequest): Observable<TeamMember> {
    return this.http.post<TeamMember>(ENDPOINTS.projects.team(id), data);
  }

  updateTeamPermissions(id: string, uid: string, permissions: Record<ProjectSection, SectionPermission>): Observable<TeamMember> {
    return this.http.put<TeamMember>(ENDPOINTS.projects.teamMemberPermissions(id, uid), { permissions });
  }

  removeTeamMember(id: string, uid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.teamMember(id, uid));
  }

  // El equipo de apoyo de un proyecto solo admite usuarios con role=APOYO
  // (el backend rechaza con 400 cualquier otro rol al agregarlo al equipo).
  getUsers(): Observable<UserListItem[]> {
    return this.http.get<any>(ENDPOINTS.users.list, { params: { role: 'APOYO' } }).pipe(
      map(res => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.users ?? []);
        return list
          .map((u: any) => ({
            id:    u.id,
            email: u.email,
            name:  u.name ?? [u.first_name, u.middle_name, u.first_surname, u.second_surname].filter(Boolean).join(' '),
          }));
      }),
    );
  }

  createExtension(id: string, data: ProjectExtensionRequest): Observable<ProjectExtension> {
    return this.http.post<ProjectExtension>(ENDPOINTS.projects.extensions(id), data);
  }

  updateExtension(id: string, eid: string, data: ProjectExtensionRequest): Observable<ProjectExtension> {
    return this.http.put<ProjectExtension>(ENDPOINTS.projects.extensionById(id, eid), data);
  }

  // ── Cobros reales recibidos (contra una factura ya registrada) ─────────────

  listFundingReceipts(id: string, budgetItemId: string, invoiceId: string): Observable<FundingReceipt[]> {
    return this.http.get<FundingReceipt[]>(ENDPOINTS.projects.receipts(id, budgetItemId, invoiceId));
  }

  createFundingReceipt(id: string, budgetItemId: string, invoiceId: string, data: FundingReceiptRequest): Observable<FundingReceipt> {
    return this.http.post<FundingReceipt>(ENDPOINTS.projects.receipts(id, budgetItemId, invoiceId), data);
  }

  updateFundingReceipt(id: string, budgetItemId: string, invoiceId: string, receiptId: string, data: FundingReceiptRequest): Observable<FundingReceipt> {
    return this.http.put<FundingReceipt>(ENDPOINTS.projects.receiptById(id, budgetItemId, invoiceId, receiptId), data);
  }

  deleteFundingReceipt(id: string, budgetItemId: string, invoiceId: string, receiptId: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.receiptById(id, budgetItemId, invoiceId, receiptId));
  }

  /** Sube el comprobante de pago (archivo) de un cobro ya registrado — form debe traer un
   * campo "file" (mismo patrón que uploadSignatureImage). */
  uploadReceiptDocument(id: string, budgetItemId: string, invoiceId: string, receiptId: string, form: FormData): Observable<FundingReceipt> {
    return this.http.post<FundingReceipt>(ENDPOINTS.projects.receiptDocument(id, budgetItemId, invoiceId, receiptId), form);
  }

  // ── Flujo de Caja ────────────────────────────────────────────────────────

  getCashFlowReport(id: string): Observable<CashFlowReport> {
    return this.http.get<CashFlowReport>(ENDPOINTS.projects.cashFlow(id));
  }

  // ── Reporte de Presupuesto (planeado/ejecutado/facturación/desembolsos/flujo de caja) ──

  downloadBudgetReport(id: string, params: BudgetReportParams): Observable<Blob> {
    const qp = new URLSearchParams();
    qp.set('format', params.format);
    if (params.year != null && params.month != null) {
      qp.set('year', String(params.year));
      qp.set('month', String(params.month));
    } else if (params.from_date && params.to_date) {
      qp.set('from_date', params.from_date);
      qp.set('to_date', params.to_date);
    }
    return this.http.getBlob(`${ENDPOINTS.projects.budgetReport(id)}?${qp.toString()}`);
  }

  downloadTrackingReportDoc(id: string, params: BudgetReportParams): Observable<Blob> {
    const qp = new URLSearchParams();
    qp.set('format', params.format);
    if (params.year != null && params.month != null) {
      qp.set('year', String(params.year));
      qp.set('month', String(params.month));
    } else if (params.from_date && params.to_date) {
      qp.set('from_date', params.from_date);
      qp.set('to_date', params.to_date);
    }
    return this.http.getBlob(`${ENDPOINTS.projects.trackingReportDoc(id)}?${qp.toString()}`);
  }

  // ── Garantías ─────────────────────────────────────────────────────────────

  getGuarantees(id: string): Observable<Guarantee[]> {
    return this.http.get<Guarantee[]>(ENDPOINTS.projects.guarantees(id));
  }

  createGuarantee(id: string, data: GuaranteeRequest): Observable<Guarantee> {
    return this.http.post<Guarantee>(ENDPOINTS.projects.guarantees(id), data);
  }

  updateGuarantee(id: string, gid: string, data: GuaranteeRequest): Observable<Guarantee> {
    return this.http.put<Guarantee>(ENDPOINTS.projects.guaranteeById(id, gid), data);
  }

  deleteGuarantee(id: string, gid: string): Observable<void> {
    return this.http.delete<void>(ENDPOINTS.projects.guaranteeById(id, gid));
  }

  // ── Firmas ────────────────────────────────────────────────────────────────

  getSignature(id: string): Observable<ProjectSignatureInfo> {
    return this.http.get<ProjectSignatureInfo>(ENDPOINTS.projects.signature(id));
  }

  saveSignature(id: string, data: ProjectSignatureRequest): Observable<ProjectSignatureInfo> {
    return this.http.put<ProjectSignatureInfo>(ENDPOINTS.projects.signature(id), data);
  }

  uploadSignatureImage(id: string, kind: 'prepared' | 'approved', form: FormData): Observable<ProjectSignatureInfo> {
    return this.http.post<ProjectSignatureInfo>(ENDPOINTS.projects.signatureImage(id, kind), form);
  }

}
