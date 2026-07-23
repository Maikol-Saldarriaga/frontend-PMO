import { Component, EventEmitter, Input, Output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthStore } from '../../../../../core/auth/store/auth.store';
import { UserRole } from '../../../../../core/auth/models/role.model';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  private authStore = inject(AuthStore);

  private allNavItems: NavItem[] = [
    { label: 'Inicio',        icon: 'home',     route: '/dashboard' },
    { label: 'Proyectos',     icon: 'folder',   route: '/projects' },
    { label: 'Documentos',    icon: 'document', route: '/documents' },
    { label: 'Cronograma',    icon: 'calendar', route: '/schedule' },
    { label: 'Recursos',      icon: 'users',    route: '/resources', adminOnly: true },
    { label: 'Alianzas',      icon: 'link',     route: '/allies',    adminOnly: true },
    { label: 'Reportes',      icon: 'chart',    route: '/reports' },
    { label: 'Configuración', icon: 'settings', route: '/settings' },
  ];

  navItems = computed(() => {
    const role: UserRole | undefined = this.authStore.user()?.role;
    const isAdmin = role === 'ADMIN';
    return this.allNavItems.filter(item => !item.adminOnly || isAdmin);
  });

  toggle(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }
}
