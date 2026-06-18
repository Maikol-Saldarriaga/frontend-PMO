import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '../../../../../core/auth/store/auth.store';

interface FodcProject {
  id: string;
  name: string;
  color: string;
  plannedBudget: number;
  invoicedTotal: number;
  plannedTotal: number;
}

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

  // ── Tabs ──────────────────────────────────────
  activeTab = signal<'general' | 'budget' | 'partnerships'>('general');

  setTab(tab: 'general' | 'budget' | 'partnerships'): void {
    this.activeTab.set(tab);
  }

  // ── Mock data FODC ────────────────────────────
  fodcGeneralBudget = 10_000_000_000; // 10 mil millones COP

  fodcProjects: FodcProject[] = [
    { id: 'p1', name: 'Sistema ERP Corporativo', color: '#0ea5e9', plannedBudget: 2_400_000_000, invoicedTotal: 1_650_000_000, plannedTotal: 2_400_000_000 },
    { id: 'p2', name: 'Migración Cloud AWS',      color: '#10b981', plannedBudget: 1_800_000_000, invoicedTotal: 1_700_000_000, plannedTotal: 1_800_000_000 },
    { id: 'p3', name: 'App Móvil Clientes',       color: '#f59e0b', plannedBudget: 1_200_000_000, invoicedTotal: 540_000_000,   plannedTotal: 1_200_000_000 },
    { id: 'p4', name: 'Rediseño Portal Web',      color: '#8b5cf6', plannedBudget: 650_000_000,    invoicedTotal: 210_000_000,   plannedTotal: 650_000_000 },
    { id: 'p5', name: 'Plataforma de Indicadores', color: '#ef4444', plannedBudget: 900_000_000,    invoicedTotal: 880_000_000,   plannedTotal: 900_000_000 },
  ];

  selectedProjectId = signal<string>('all');

  projectOptions = computed(() => [{ id: 'all', name: 'Todas' }, ...this.fodcProjects.map(p => ({ id: p.id, name: p.name }))]);

  onProjectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedProjectId.set(value);
  }

  // ── Donut 1: presupuesto usado vs total FODC ──
  fodcUsedTotal = computed(() => {
    const id = this.selectedProjectId();
    if (id === 'all') {
      return this.fodcProjects.reduce((acc, p) => acc + p.invoicedTotal, 0);
    }
    return this.fodcProjects.find(p => p.id === id)?.invoicedTotal ?? 0;
  });

  fodcUsedPct = computed(() => Math.min(100, Math.round((this.fodcUsedTotal() / this.fodcGeneralBudget) * 100)));

  usedDonutOffset = computed(() => {
    const circumference = 2 * Math.PI * 70;
    return circumference - (circumference * this.fodcUsedPct()) / 100;
  });

  // ── Donut 2: distribución por proyecto ────────
  projectSlices = computed(() => {
    const total = this.fodcProjects.reduce((acc, p) => acc + p.plannedBudget, 0);
    const circumference = 2 * Math.PI * 70;
    let cumulative = 0;
    return this.fodcProjects.map(p => {
      const pct = (p.plannedBudget / total) * 100;
      const dash = (circumference * pct) / 100;
      const offset = cumulative;
      cumulative += dash;
      return {
        ...p,
        pct: Math.round(pct * 10) / 10,
        dashArray: `${dash} ${circumference - dash}`,
        dashOffset: -offset,
      };
    });
  });

  // ── Línea: facturado vs planeado ──────────────
  invoicedVsPlanned = computed(() => {
    const id = this.selectedProjectId();
    const list = id === 'all' ? this.fodcProjects : this.fodcProjects.filter(p => p.id === id);
    const invoiced = list.reduce((acc, p) => acc + p.invoicedTotal, 0);
    const planned = list.reduce((acc, p) => acc + p.plannedTotal, 0);
    const invoicedPct = planned > 0 ? Math.round((invoiced / planned) * 100) : 0;
    return { invoiced, planned, invoicedPct };
  });

  formatCop(value: number): string {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)} mil M`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)} M`;
    return `$${value.toLocaleString('es-CO')}`;
  }

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
