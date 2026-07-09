import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../../core/auth/store/auth.store';
import { AuthService } from '../../../../../core/auth/services/auth.service';
import { API_BASE_URL } from '../../../../../core/config/api.config';
import { UserService } from '../../../../../core/users/services/user.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent {
  @Input() sidebarCollapsed = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  private router      = inject(Router);
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

  goToProfile(): void {
    this.router.navigate(['/profile']);
  }

  logout(): void { this.authService.logout(); }
}
