import { Component } from '@angular/core';
import { ComingSoonComponent } from '../../../shared/components/coming-soon/coming-soon.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [ComingSoonComponent],
  template: `
    <app-coming-soon
      title="Reportes"
      subtitle="Indicadores y reportes consolidados de todos los proyectos"
      icon="chart"
      description="Aquí encontrarás reportes ejecutivos, indicadores de avance y exportables en PDF/Excel de los proyectos de la organización."
    />
  `,
})
export class ReportsComponent {}
