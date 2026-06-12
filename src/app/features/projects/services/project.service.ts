import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';
import {
  ProjectDetails,
  ProjectComponent,
  PostBudgetItemRequest,
  BudgetItemResponse,
  BudgetListResponse,
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
  BudgetBulkRequest,
  GanttResponse,
  GanttFilters,
  ScopeComponent,
  ScopeActivity,
  ComponentsActsResponse,
  CreateComponentRequest,
  UpdateScopeRequest,
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

  saveBudgetBulk(id: string, data: BudgetBulkRequest): Observable<void> {
    return this.http.put<void>(ENDPOINTS.projects.budgetBulk(id), data);
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

  createComponent(id: string, data: CreateComponentRequest): Observable<{ id: string; component: string; acts: unknown[] }> {
    return this.http.post(ENDPOINTS.projects.components(id), data);
  }

  createScope(id: string, cid: string, data: {
    act?: number | null;
    description: string;
    percentage: number;
    start_date?: string | null;
    end_date?: string | null;
    start_plan?: number | null;
    responsible?: string | null;
    objective?: string | null;
  }): Observable<ScopeActivity> {
    return this.http.post<ScopeActivity>(ENDPOINTS.projects.componentScopes(id, cid), data);
  }

  updateComponentScopes(id: string, cid: string, data: UpdateScopeRequest): Observable<ScopeComponent> {
    return this.http.put<ScopeComponent>(ENDPOINTS.projects.componentScopes(id, cid), data);
  }

  getComponentsActs(id: string): Observable<ProjectComponent[]> {
    return this.http.get<ProjectComponent[]>(ENDPOINTS.projects.componentsActs(id));
  }

  getBudgetItems(id: string): Observable<BudgetListResponse> {
    return this.http.get<BudgetListResponse>(ENDPOINTS.projects.budget(id));
  }

  postBudgetItem(id: string, data: PostBudgetItemRequest): Observable<BudgetItemResponse> {
    return this.http.post<BudgetItemResponse>(ENDPOINTS.projects.budget(id), data);
  }
}
