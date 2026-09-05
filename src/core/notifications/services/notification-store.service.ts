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

  loadingMore = signal(false);
  private nextCursor = signal<string | number | null>(null);
  get hasMore(): boolean { return this.nextCursor() !== null; }

  /** Recarga desde el inicio — usada por el polling del topbar. */
  refresh(): void {
    this.svc.list().subscribe({
      next: page => {
        this.notifications.set(page.data ?? []);
        this.nextCursor.set(page.next_cursor);
      },
      error: () => {},
    });
  }

  /** Trae la siguiente página y la agrega al final — se dispara al llegar al fondo del
   * dropdown de notificaciones, nunca de forma proactiva. */
  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;

    this.loadingMore.set(true);
    this.svc.list({ cursor }).subscribe({
      next: page => {
        this.notifications.update(current => [...current, ...(page.data ?? [])]);
        this.nextCursor.set(page.next_cursor);
        this.loadingMore.set(false);
      },
      error: () => { this.loadingMore.set(false); },
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
