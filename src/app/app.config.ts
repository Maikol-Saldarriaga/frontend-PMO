import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCO from '@angular/common/locales/es-CO';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHighcharts } from 'highcharts-angular';

import { routes } from './app.routes';
import { authInterceptor } from '../core/api/interceptors/auth.interceptor';
import { errorInterceptor } from '../core/api/interceptors/error.interceptor';

registerLocaleData(localeEsCO, 'es-CO');

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-CO' },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideHighcharts({
      instance: () => import('highcharts/esm/highcharts').then(m => m.default),
    }),
  ]
};
