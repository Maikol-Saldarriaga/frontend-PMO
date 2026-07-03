import { Component } from '@angular/core';
import { ComingSoonComponent } from '../../../shared/components/coming-soon/coming-soon.component';

@Component({
  selector: 'app-resources',
  standalone: true,
  imports: [ComingSoonComponent],
  template: `
    <app-coming-soon
      title="Recursos"
      subtitle="Gestión de recursos humanos y materiales de los proyectos"
      icon="users"
      description="Aquí podrás consultar la disponibilidad y asignación de recursos (personas, equipos y materiales) entre los proyectos de la organización."
    />
  `,
})
export class ResourcesComponent {}
