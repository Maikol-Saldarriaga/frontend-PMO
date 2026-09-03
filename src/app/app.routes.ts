import { Routes } from '@angular/router';
import { WelcomeComponent } from './layouts/welcome/welcome.component';
import { LoginComponent } from './features/auth/pages/login/login.component';
import { ForgotPasswordComponent } from './features/auth/pages/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './features/auth/pages/reset-password/reset-password.component';
import { NotFoundComponent } from './features/not-found/pages/not-found/not-found.component';
import { DashboardComponent } from './layouts/dashboard/dashboard.component';
import { HomeComponent } from './features/dashboard/pages/home/home.component';
import { ProfileComponent } from './features/profile/pages/profile/profile.component';
import { ProjectsListComponent } from './features/projects/pages/list/projects-list.component';
import { ProjectCreateComponent } from './features/projects/pages/create/project-create.component';
import { ProjectDetailComponent } from './features/projects/pages/detail/project-detail.component';
import { ProjectSummaryComponent } from './features/projects/pages/summary/project-summary.component';
import { MonthlyComponent } from './features/projects/pages/monthly/monthly.component';
import { MovimientosComponent } from './features/projects/pages/movimientos/movimientos.component';
import { EgresosListComponent } from './features/projects/pages/egresos-list/egresos-list.component';
import { EgresosImportComponent } from './features/projects/pages/egresos-import/egresos-import.component';
import { TrackingReportComponent } from './features/projects/pages/tracking-report/tracking-report.component';
import { DocumentsListComponent } from './features/documents/pages/list/documents-list.component';
import { ScheduleListComponent } from './features/schedule/pages/list/schedule-list.component';
import { ResourcesComponent } from './features/resources/pages/resources.component';
import { ReportsComponent } from './features/reports/pages/reports.component';
import { AlliesListComponent } from './features/allies/pages/list/allies-list.component';
import { FoundationUsersComponent } from './features/foundation/pages/list/foundation-users.component';
import { ApoyoListComponent } from './features/apoyo/pages/list/apoyo-list.component';
import { BudgetCatalogComponent } from './features/budget-catalog/pages/list/budget-catalog.component';
import { PUCAccountsComponent } from './features/puc-accounts/pages/list/puc-accounts.component';
import { CostCentersComponent } from './features/cost-centers/pages/list/cost-centers.component';
import { authGuard, rootRedirectGuard, canCreateProjectGuard, adminGuard } from '../core/auth/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [rootRedirectGuard], children: [] },
  { path: 'login',   component: LoginComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password',  component: ResetPasswordComponent },
  { path: 'welcome', component: WelcomeComponent },
  {
    path: '',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard',             component: HomeComponent, canActivate: [adminGuard] },
      { path: 'profile',               component: ProfileComponent },
      { path: 'settings',              component: ProfileComponent },
      { path: 'projects',              component: ProjectsListComponent },
      { path: 'projects/create',       component: ProjectCreateComponent, canActivate: [canCreateProjectGuard] },
      { path: 'projects/:id',          component: ProjectDetailComponent },
      { path: 'projects/:id/edit',     component: ProjectCreateComponent },
      { path: 'projects/:id/summary',  component: ProjectSummaryComponent },
      { path: 'projects/:id/monthly',  component: MonthlyComponent },
      { path: 'projects/:id/movimientos', component: MovimientosComponent },
      { path: 'projects/:id/egresos',   component: EgresosListComponent },
      { path: 'projects/:id/egresos/import', component: EgresosImportComponent },
      { path: 'projects/:id/tracking-report', component: TrackingReportComponent },
      { path: 'documents',             component: DocumentsListComponent },
      { path: 'schedule',              component: ScheduleListComponent },
      { path: 'resources',             component: ResourcesComponent },
      { path: 'allies',                component: AlliesListComponent, canActivate: [adminGuard] },
      { path: 'foundation',            component: FoundationUsersComponent, canActivate: [adminGuard] },
      { path: 'apoyo',                 component: ApoyoListComponent, canActivate: [adminGuard] },
      { path: 'budget-catalog',        component: BudgetCatalogComponent, canActivate: [adminGuard] },
      { path: 'puc-accounts',          component: PUCAccountsComponent, canActivate: [adminGuard] },
      { path: 'cost-centers',          component: CostCentersComponent, canActivate: [adminGuard] },
      { path: 'reports',               component: ReportsComponent },
    ]
  },
  { path: '**', component: NotFoundComponent }
];
