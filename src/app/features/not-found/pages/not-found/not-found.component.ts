import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AuthStore } from '../../../../../core/auth/store/auth.store';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss'
})
export class NotFoundComponent {
  private authStore = inject(AuthStore);

  currentYear = new Date().getFullYear();

  get homeUrl(): string {
    return this.authStore.isLoggedIn() ? '/dashboard' : '/login';
  }
}
