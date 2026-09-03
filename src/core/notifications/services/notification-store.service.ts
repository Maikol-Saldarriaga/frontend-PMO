import { Injectable, computed, inject, signal } from '@angular/core';

import { Notification } from '../models/notification.model';
import { NotificationService } from './notification.service';

/** Store de notificaciones (signals) compartido por toda la app — se llena vía polling desde
 * TopbarComponent (única "montura" siempre presente mientras hay sesión). Actualiza el estado
 * local de forma optimista en markRead/markAllRead para que el badge/lista respondan al toque
 * sin esperar la respuesta del backend. */
@Injectable({ providedIn: 'root' })
export class NotificationStoreService {
  private svc = inject(NotificationService);

  notifications = signal<Notification[]>([]);
  unreadCount = computed(() => this.notifications().filter(n => !n.is_read).length);

  refresh(): void {
    this.svc.list().subscribe({
      next: items => this.notifications.set(items ?? []),
      error: () => {},
    });
  }

  markRead(id: string): void {
    const already = this.notifications().find(n => n.id === id)?.is_read;
    if (already) return;
    this.notifications.update(list => list.map(n => n.id === id ? { ...n, is_read: true } : n));
    this.svc.markRead(id).subscribe({ error: () => this.refresh() });
  }

  markAllRead(): void {
    if (!this.unreadCount()) return;
    this.notifications.update(list => list.map(n => ({ ...n, is_read: true })));
    this.svc.markAllRead().subscribe({ error: () => this.refresh() });
  }
}
