import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './coming-soon.component.html',
})
export class ComingSoonComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() description = '';
  /** Nombre del ícono a mostrar, ver *ngSwitch en el template */
  @Input() icon: 'users' | 'chart' = 'chart';
}
