import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../../../core/auth/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: '../login/login.component.scss'
})
export class ForgotPasswordComponent {
  private authService = inject(AuthService);

  email       = '';
  loading     = false;
  submitted   = false;
  currentYear = new Date().getFullYear();

  onSubmit(): void {
    if (!this.email || this.loading) return;

    this.loading = true;

    this.authService.forgotPassword(this.email).subscribe({
      // Siempre mostramos el mismo mensaje, exista o no el email (evita enumeración de usuarios)
      next:  () => { this.loading = false; this.submitted = true; },
      error: () => { this.loading = false; this.submitted = true; }
    });
  }
}
