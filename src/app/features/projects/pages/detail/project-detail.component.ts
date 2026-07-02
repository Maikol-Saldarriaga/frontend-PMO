import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, ActivatedRoute } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { ProjectDetails } from '../../models/project.model';
import { TabResumenComponent }    from './tabs/tab-resumen/tab-resumen.component';
import { TabAlcanceComponent }    from './tabs/tab-alcance/tab-alcance.component';
import { TabCronogramaComponent } from './tabs/tab-cronograma/tab-cronograma.component';
import { TabPresupuestoComponent } from './tabs/tab-presupuesto/tab-presupuesto.component';
import { TabSeguimientoTecnicoComponent } from './tabs/tab-seguimiento-tecnico/tab-seguimiento-tecnico.component';
import { TabRiesgosComponent } from './tabs/tab-riesgos/tab-riesgos.component';
import { TabBeneficiariosComponent } from './tabs/tab-beneficiarios/tab-beneficiarios.component';
import { TabUbicacionesComponent } from './tabs/tab-ubicaciones/tab-ubicaciones.component';
import { TabCondicionesComponent } from './tabs/tab-condiciones/tab-condiciones.component';
import { TabEntregablesComponent } from './tabs/tab-entregables/tab-entregables.component';
import { TabIndicadoresComponent } from './tabs/tab-indicadores/tab-indicadores.component';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [
    CommonModule,
    TabResumenComponent,
    TabAlcanceComponent,
    TabCronogramaComponent,
    TabPresupuestoComponent,
    TabSeguimientoTecnicoComponent,
    TabRiesgosComponent,
    TabBeneficiariosComponent,
    TabUbicacionesComponent,
    TabCondicionesComponent,
    TabEntregablesComponent,
    TabIndicadoresComponent,
  ],
  templateUrl: './project-detail.component.html',
})
export class ProjectDetailComponent implements OnInit {
  private router    = inject(Router);
  private route     = inject(ActivatedRoute);
  private service   = inject(ProjectService);
  private sanitizer = inject(DomSanitizer);

  safeIcon(svgPath: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svgPath);
  }

  projectId  = '';
  details    = signal<ProjectDetails | null>(null);
  loading    = signal(true);
  error      = signal<string | null>(null);
  activeTab  = signal<string>('resumen');

  readonly TABS = [
    {
      id: 'resumen', label: 'Resumen', color: 'violet',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>`,
    },
    {
      id: 'alcance', label: 'Alcance', color: 'sky',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>`,
    },
    {
      id: 'ubicaciones', label: 'Ubicaciones', color: 'emerald',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>`,
    },
    {
      id: 'condiciones', label: 'Condiciones', color: 'orange',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>`,
    },
    {
      id: 'cronograma', label: 'Cronograma', color: 'blue',
      icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
    },
    {
      id: 'presupuesto', label: 'Presupuesto', color: 'green',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
    },
    {
      id: 'beneficiarios', label: 'Beneficiarios', color: 'cyan',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>`,
    },
    {
      id: 'seguimiento', label: 'Seguimiento', color: 'amber',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>`,
    },
    {
      id: 'riesgos', label: 'Riesgos', color: 'red',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>`,
    },
    {
      id: 'entregables', label: 'Entregables', color: 'indigo',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>`,
    },
    {
      id: 'documentos', label: 'Documentos', color: 'slate',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>`,
    },
    {
      id: 'indicadores', label: 'Indicadores', color: 'teal',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>`,
    },
    {
      id: 'historial', label: 'Historial', color: 'pink',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
    },
  ];

  statusCls = computed(() => {
    const s = (this.details()?.status ?? '').toLowerCase();
    return {
      'bg-emerald-50 border-emerald-200 text-emerald-700': s === 'activo',
      'bg-amber-50 border-amber-200 text-amber-700':       s === 'borrador' || s === 'registro',
      'bg-sky-50 border-sky-200 text-sky-700':             s === 'completado',
      'bg-red-50 border-red-200 text-red-700':             s === 'cancelado',
    };
  });

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) { this.router.navigate(['/projects']); return; }

    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab) this.activeTab.set(tab);

    this.refreshDetails();
  }

  private refreshDetails(): void {
    this.service.getProjectDetails(this.projectId).subscribe({
      next:  d => { this.details.set(d); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el proyecto.'); this.loading.set(false); },
    });
  }

  onTabClick(id: string): void {
    this.activeTab.set(id);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.refreshDetails();
  }

  goBack(): void { this.router.navigate(['/projects']); }

  formatCompact(v: number): string {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  }
}
