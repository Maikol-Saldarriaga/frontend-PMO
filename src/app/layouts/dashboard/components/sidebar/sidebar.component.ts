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
    { label: 'Proyectos',     icon: 'folder',   route: '/projects' },
    { label: 'Tareas',        icon: 'check',    route: '/tasks' },
    { label: 'Cronograma',    icon: 'calendar', route: '/schedule' },
    { label: 'Recursos',      icon: 'users',    route: '/resources' },
    { label: 'Reportes',      icon: 'chart',    route: '/reports' },
    { label: 'Configuración', icon: 'settings', route: '/settings' },
  ];

  toggle(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }
}
