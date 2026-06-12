import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
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

  navItems: NavItem[] = [
    { label: 'Inicio',        icon: 'home',     route: '/dashboard' },
    { label: 'Proyectos',     icon: 'folder',   route: '/dashboard/projects' },
    { label: 'Tareas',        icon: 'check',    route: '/dashboard/tasks' },
    { label: 'Cronograma',    icon: 'calendar', route: '/dashboard/schedule' },
    { label: 'Recursos',      icon: 'users',    route: '/dashboard/resources' },
    { label: 'Reportes',      icon: 'chart',    route: '/dashboard/reports' },
    { label: 'Configuración', icon: 'settings', route: '/dashboard/settings' },
  ];

  toggle(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }
}
