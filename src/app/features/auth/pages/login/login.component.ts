import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../../../../core/auth/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private authService = inject(AuthService);

  email       = '';
  password    = '';
  showPassword = false;
  loading     = false;
  errorMsg    = '';
  currentYear = new Date().getFullYear();

  onSubmit(): void {
    if (!this.email || !this.password) return;

    this.loading  = true;
    this.errorMsg = '';

    this.authService.login({ email: this.email, password: this.password })
      .subscribe({
        next: () => {
          this.loading = false;
          // La navegación a /dashboard la maneja AuthService
        },
        error: (err) => {
          this.loading  = false;
          this.errorMsg = err?.error?.message ?? 'Credenciales incorrectas. Intenta de nuevo.';
        }
      });
  }
}
