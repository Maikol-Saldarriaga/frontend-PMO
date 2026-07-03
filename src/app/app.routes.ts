import { Routes } from '@angular/router';
import { WelcomeComponent } from './layouts/welcome/welcome.component';
import { LoginComponent } from './features/auth/pages/login/login.component';
import { DashboardComponent } from './layouts/dashboard/dashboard.component';
import { HomeComponent } from './features/dashboard/pages/home/home.component';
import { ProfileComponent } from './features/profile/pages/profile/profile.component';
import { ProjectsListComponent } from './features/projects/pages/list/projects-list.component';
import { ProjectCreateComponent } from './features/projects/pages/create/project-create.component';
import { ProjectDetailComponent } from './features/projects/pages/detail/project-detail.component';
import { ProjectSummaryComponent } from './features/projects/pages/summary/project-summary.component';
import { MonthlyComponent } from './features/projects/pages/monthly/monthly.component';
import { DocumentsListComponent } from './features/documents/pages/list/documents-list.component';
import { ScheduleListComponent } from './features/schedule/pages/list/schedule-list.component';
import { ResourcesComponent } from './features/resources/pages/resources.component';
import { ReportsComponent } from './features/reports/pages/reports.component';
import { authGuard, rootRedirectGuard } from '../core/auth/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [rootRedirectGuard], children: [] },
  { path: 'login',   component: LoginComponent },
  { path: 'welcome', component: WelcomeComponent },
  {
    path: '',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard',             component: HomeComponent },
      { path: 'profile',               component: ProfileComponent },
      { path: 'settings',              component: ProfileComponent },
      { path: 'projects',              component: ProjectsListComponent },
      { path: 'projects/create',       component: ProjectCreateComponent },
      { path: 'projects/:id',          component: ProjectDetailComponent },
      { path: 'projects/:id/edit',     component: ProjectCreateComponent },
      { path: 'projects/:id/summary',  component: ProjectSummaryComponent },
      { path: 'projects/:id/monthly',  component: MonthlyComponent },
      { path: 'documents',             component: DocumentsListComponent },
      { path: 'schedule',              component: ScheduleListComponent },
      { path: 'resources',             component: ResourcesComponent },
      { path: 'reports',               component: ReportsComponent },
    ]
  },
  { path: '**', canActivate: [rootRedirectGuard], children: [] }
];
