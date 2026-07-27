import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../../core/auth/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: '../login/login.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  private authService = inject(AuthService);
  private route        = inject(ActivatedRoute);
  private router        = inject(Router);

  token          = '';
  tokenMissing   = false;
  password       = '';
  confirmPassword = '';
  showPassword   = false;
  loading        = false;
  success        = false;
  errorMsg       = '';
  currentYear    = new Date().getFullYear();

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.tokenMissing = !this.token;
  }

  get passwordMismatch(): boolean {
    return this.confirmPassword.length > 0 && this.password !== this.confirmPassword;
  }

  get passwordTooShort(): boolean {
    return this.password.length > 0 && this.password.length < 8;
  }

  onSubmit(): void {
    if (this.tokenMissing || this.loading) return;
    if (!this.password || this.password !== this.confirmPassword) return;
    if (this.password.length < 8) return;

    this.loading  = true;
    this.errorMsg = '';

    this.authService.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        setTimeout(() => this.router.navigate(['/login']), 2500);
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.status === 401
          ? 'El enlace expiró o ya fue usado. Solicita uno nuevo.'
          : 'No pudimos restablecer tu contraseña. Intenta de nuevo.';
      }
    });
  }
}
