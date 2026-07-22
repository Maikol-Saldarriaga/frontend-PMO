import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { FodcConfigService } from '../../../../core/fodc-config/services/fodc-config.service';
import { AuthStore } from '../../../../core/auth/store/auth.store';

@Component({
  selector: 'app-resources',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './resources.component.html',
  styleUrl: './resources.component.scss'
})
export class ResourcesComponent implements OnInit {
  private fb                = inject(FormBuilder);
  private fodcConfigService = inject(FodcConfigService);
  private authStore         = inject(AuthStore);
  private router            = inject(Router);

  fodcLoading   = signal(true);
  fodcSaving    = signal(false);
  fodcNotSet    = signal(false);
  fodcSaveOk    = signal(false);
  fodcSaveError = signal<string | null>(null);
  fodcUpdatedAt = signal<string | null>(null);
  fodcDisplayValue = signal('');

  fodcForm = this.fb.group({
    numeric_value: [0, [Validators.required, Validators.min(0)]],
    description:   [''],
  });

  private numberFormatter = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  private formatThousands(value: number): string {
    return this.numberFormatter.format(value);
  }

  ngOnInit(): void {
    if (this.authStore.user()?.role !== 'ADMIN') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadFodcConfig();
  }

  /** Input crudo "15.000.000,50" (miles=punto, decimal=coma) → number real para el form. */
  onNumericValueInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const clean = raw.replace(/[^\d,]/g, '');
    const parts = clean.split(',');
    const intPart = parts[0] ?? '';
    const decPart = parts.length > 1 ? parts.slice(1).join('').slice(0, 2) : '';
    const numeric = parseFloat(`${intPart || '0'}.${decPart || '0'}`);

    this.fodcForm.patchValue({ numeric_value: numeric }, { emitEvent: false });

    const formattedInt = this.numberFormatter.format(Number(intPart || '0'));
    this.fodcDisplayValue.set(decPart !== '' || parts.length > 1 ? `${formattedInt},${decPart}` : formattedInt);
  }

  private loadFodcConfig(): void {
    this.fodcLoading.set(true);
    this.fodcNotSet.set(false);
    this.fodcConfigService.getTotalMoney().subscribe({
      next: item => {
        const value = item.numeric_value ?? 0;
        this.fodcForm.patchValue({
          numeric_value: value,
          description:   item.description ?? '',
        });
        this.fodcDisplayValue.set(this.formatThousands(value));
        this.fodcUpdatedAt.set(item.updated_at);
        this.fodcLoading.set(false);
      },
      error: err => {
        this.fodcLoading.set(false);
        if (err?.status === 404) {
          this.fodcNotSet.set(true);
          this.fodcForm.patchValue({ numeric_value: 0, description: '' });
          this.fodcDisplayValue.set('0');
        }
      },
    });
  }

  onFodcSubmit(): void {
    if (this.fodcForm.invalid || this.fodcSaving()) return;
    this.fodcSaving.set(true);
    this.fodcSaveOk.set(false);
    this.fodcSaveError.set(null);

    const v = this.fodcForm.getRawValue();
    this.fodcConfigService.updateTotalMoney({
      numeric_value: v.numeric_value ?? 0,
      description:   v.description ?? '',
    }).subscribe({
      next: item => {
        this.fodcSaving.set(false);
        this.fodcSaveOk.set(true);
        this.fodcNotSet.set(false);
        this.fodcUpdatedAt.set(item.updated_at);
        this.fodcDisplayValue.set(this.formatThousands(item.numeric_value ?? 0));
        setTimeout(() => this.fodcSaveOk.set(false), 3000);
      },
      error: err => {
        this.fodcSaving.set(false);
        this.fodcSaveError.set(
          err?.status === 403
            ? 'Solo administrador puede modificar el fondo total.'
            : (err?.error?.message ?? 'Error al guardar la configuración.')
        );
      },
    });
  }
}
