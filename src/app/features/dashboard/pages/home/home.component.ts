import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '../../../../../core/auth/store/auth.store';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  private authStore = inject(AuthStore);

  today = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  get user() { return this.authStore.user(); }

  stats = [
    { label: 'Proyectos activos',  value: '12',  delta: '+2 este mes',     icon: 'folder', accent: true  },
    { label: 'Tareas pendientes',  value: '48',  delta: '8 vencidas',      icon: 'check',  accent: false },
    { label: 'Recursos asignados', value: '27',  delta: '3 disponibles',   icon: 'users',  accent: false },
    { label: 'Avance promedio',    value: '74%', delta: '+6% vs mes ant.',  icon: 'chart',  accent: true  },
  ];

  recentProjects = [
    { name: 'Sistema ERP Corporativo', status: 'En curso',    progress: 68, due: '30 Jun 2026' },
    { name: 'Migración Cloud AWS',      status: 'En revisión', progress: 90, due: '15 Jun 2026' },
    { name: 'App Móvil Clientes',       status: 'En curso',    progress: 42, due: '30 Jul 2026' },
    { name: 'Rediseño Portal Web',      status: 'Planeación',  progress: 15, due: '15 Ago 2026' },
  ];

  statusColor(status: string): string {
    const map: Record<string, string> = {
      'En curso':    'badge--success',
      'En revisión': 'badge--warning',
      'Planeación':  'badge--neutral',
      'Completado':  'badge--accent',
    };
    return map[status] ?? 'badge--neutral';
  }
}
