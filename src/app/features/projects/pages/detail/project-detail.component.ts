import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  ],
  templateUrl: './project-detail.component.html',
})
export class ProjectDetailComponent implements OnInit {
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);
  private service = inject(ProjectService);

  projectId  = '';
  details    = signal<ProjectDetails | null>(null);
  loading    = signal(true);
  error      = signal<string | null>(null);
  activeTab  = signal<string>('resumen');

  readonly TABS = [
    { id: 'resumen',      label: 'Resumen'      },
    { id: 'alcance',      label: 'Alcance'      },
    { id: 'ubicaciones',  label: 'Ubicaciones'  },
    { id: 'cronograma',   label: 'Cronograma'   },
    { id: 'presupuesto',  label: 'Presupuesto'  },
    { id: 'beneficiarios', label: 'Beneficiarios' },
    { id: 'seguimiento',  label: 'Seguimiento Técnico' },
    { id: 'riesgos',      label: 'Riesgos'      },
    { id: 'entregables',  label: 'Entregables'  },
    { id: 'documentos',   label: 'Documentos'   },
    { id: 'indicadores',  label: 'Indicadores'  },
    { id: 'historial',    label: 'Historial'    },
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
    if (!this.projectId) { this.router.navigate(['/dashboard/projects']); return; }

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

  goBack(): void { this.router.navigate(['/dashboard/projects']); }

  formatCompact(v: number): string {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  }
}
