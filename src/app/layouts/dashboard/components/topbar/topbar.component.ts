import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '../../../../../core/auth/store/auth.store';
import { AuthService } from '../../../../../core/auth/services/auth.service';
import { API_BASE_URL } from '../../../../../core/config/api.config';
import { UserService } from '../../../../../core/users/services/user.service';
import { PortalToBodyDirective } from '../../../../shared/directives/portal-to-body.directive';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, PortalToBodyDirective],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent {
  @Input() sidebarCollapsed = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  private authStore   = inject(AuthStore);
  private authService = inject(AuthService);
  private userService  = inject(UserService);

  pageTitle     = 'Inicio';
  notifications = 3;
  private avatarRetried = false;

  get user()      { return this.authStore.user(); }
  get avatarUrl() {
    const raw = this.user?.image_url ?? null;
    const baseHost = new URL(API_BASE_URL).hostname;
    return raw ? raw.replace('localhost', baseHost) : null;
  }

  /** La URL firmada de la foto de perfil expira (MinIO); si el <img> falla se pide una URL fresca una sola vez para evitar loops. */
  onAvatarError(): void {
    if (this.avatarRetried) return;
    this.avatarRetried = true;
    this.userService.refreshMyAvatarUrl().subscribe({
      next: () => { this.avatarRetried = false; },
      error: () => {},
    });
  }

  get initials()  {
    const name = this.user?.name ?? '';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  logout(): void { this.authService.logout(); }
}
