import { Component, AfterViewInit } from '@angular/core';
import { RouterOutlet, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

declare const initFlowbite: () => void;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements AfterViewInit {
  constructor(private router: Router) {}

  ngAfterViewInit(): void {
    // Re-inicializar Flowbite en cada cambio de ruta
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        setTimeout(() => {
          if (typeof initFlowbite === 'function') initFlowbite();
        }, 50);
      });
  }
}
