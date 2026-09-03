import { Component, EventEmitter, inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../../core/auth/store/auth.store';
import { AuthService } from '../../../../../core/auth/services/auth.service';
import { API_BASE_URL } from '../../../../../core/config/api.config';
import { UserService } from '../../../../../core/users/services/user.service';
import { PortalToBodyDirective } from '../../../../shared/directives/portal-to-body.directive';
import { NotificationStoreService } from '../../../../../core/notifications/services/notification-store.service';
import { Notification } from '../../../../../core/notifications/models/notification.model';

const NOTIFICATIONS_POLL_MS = 30000;

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, PortalToBodyDirective],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent implements OnInit, OnDestroy {
  @Input() sidebarCollapsed = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  private authStore   = inject(AuthStore);
  private authService = inject(AuthService);
  private userService  = inject(UserService);
  private router       = inject(Router);
  notificationStore     = inject(NotificationStoreService);

  pageTitle     = 'Inicio';
  private avatarRetried = false;
  private pollHandle?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.notificationStore.refresh();
    this.pollHandle = setInterval(() => this.notificationStore.refresh(), NOTIFICATIONS_POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
  }

  onNotificationClick(n: Notification): void {
    this.notificationStore.markRead(n.id);
    this.router.navigate(['/projects', n.contract_agreement_id], { queryParams: { tab: n.tab } });
  }

  markAllRead(): void {
    this.notificationStore.markAllRead();
  }

  timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'Ahora';
    if (min < 60) return `Hace ${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `Hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    return `Hace ${days} d`;
  }

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
