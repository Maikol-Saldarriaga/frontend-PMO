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
import { BudgetComponent } from './features/projects/pages/budget/budget.component';
import { authGuard } from '../core/auth/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login',   component: LoginComponent },
  { path: 'welcome', component: WelcomeComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '',                  component: HomeComponent },
      { path: 'profile',           component: ProfileComponent },
      { path: 'projects',              component: ProjectsListComponent },
      { path: 'projects/create',       component: ProjectCreateComponent },
      { path: 'projects/:id',          component: ProjectDetailComponent },
      { path: 'projects/:id/edit',     component: ProjectCreateComponent },
      { path: 'projects/:id/summary',  component: ProjectSummaryComponent },
      { path: 'projects/:id/budget',   component: BudgetComponent },
    ]
  },
  { path: '**', redirectTo: 'login' }
];
