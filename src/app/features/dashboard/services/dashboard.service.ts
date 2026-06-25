import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpClient } from '../../../../core/api/http-client';
import { ENDPOINTS } from '../../../../core/api/endpoints';

export interface DashboardFodcProject {
  id: string;
  name: string;
  planned_total: number;
  invoiced_total: number;
  executed_total: number;
}

export interface DashboardFodcProjectsResponse {
  general_budget: number;
  projects: DashboardFodcProject[];
}

export interface DashboardBudgetMonth {
  month: string;
  planned: number;
  invoiced: number;
  executed: number;
}

export interface DashboardBudgetMonthlyResponse {
  months: DashboardBudgetMonth[];
}

export type AllyCategoryKey = 'por_gestionar' | 'en_gestion' | 'suscrito';

export interface DashboardAllyCategoryItem {
  name: string;
  budget: number;
  subscribed: number;
}

export interface DashboardAllyCategory {
  key: AllyCategoryKey;
  label: string;
  items: DashboardAllyCategoryItem[];
}

export interface DashboardAllyCategoriesResponse {
  categories: DashboardAllyCategory[];
}

export interface DashboardAlly {
  id: string;
  name: string;
  subscribed_total: number;
  invoiced_total: number;
  executed_total: number;
}

export interface DashboardAlliesListResponse {
  allies: DashboardAlly[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(ApiHttpClient);

  getFodcProjects(): Observable<DashboardFodcProjectsResponse> {
    return this.http.get<DashboardFodcProjectsResponse>(ENDPOINTS.dashboard.fodcProjects);
  }

  getBudgetMonthly(projectId?: string | null): Observable<DashboardBudgetMonthlyResponse> {
    const params = projectId ? { project_id: projectId } : undefined;
    return this.http.get<DashboardBudgetMonthlyResponse>(ENDPOINTS.dashboard.budgetMonthly, { params });
  }

  getAllyCategories(allyId?: string | null): Observable<DashboardAllyCategoriesResponse> {
    const params = allyId ? { ally_id: allyId } : undefined;
    return this.http.get<DashboardAllyCategoriesResponse>(ENDPOINTS.dashboard.allyCategories, { params });
  }

  getAlliesList(): Observable<DashboardAlliesListResponse> {
    return this.http.get<DashboardAlliesListResponse>(ENDPOINTS.dashboard.alliesList);
  }
}
