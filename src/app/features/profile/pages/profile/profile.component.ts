import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';

import { AuthStore } from '../../../../../core/auth/store/auth.store';
import { UserService } from '../../../../../core/users/services/user.service';
import { UserDetail } from '../../../../../core/users/models/user.model';
import { evaluatePasswordStrength, PasswordStrength } from '../../../../shared/utils/password-strength';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private fb          = inject(FormBuilder);
  private authStore   = inject(AuthStore);
  private userService = inject(UserService);

  documentTypes = ['CC', 'CE', 'TI', 'PASAPORTE', 'NIT'];

  loadingProfile = signal(true);
  saving         = signal(false);
  saveSuccess    = signal(false);
  saveError      = signal<string | null>(null);
  avatarPreview  = signal<string | null>(null);
  selectedFile   = signal<File | null>(null);
  private avatarRetried = false;

  profileForm = this.fb.group({
    first_name:               ['', Validators.required],
    first_surname:            ['', Validators.required],
    phone:                    [''],
    birthdate:                [''],
    document_type:            ['CC'],
    identity_document_number: [''],
  });

  showCurrentPassword = signal(false);
  showNewPassword     = signal(false);
  changingPassword    = signal(false);
  passwordSuccess     = signal(false);
  passwordError       = signal<string | null>(null);

  strength: PasswordStrength | null = null;

  passwordForm = this.fb.group({
    current_password: ['', Validators.required],
    new_password:      ['', [Validators.required, Validators.minLength(8)]],
    confirm_password:  ['', Validators.required],
  }, { validators: passwordsMatchValidator });

  get user()     { return this.authStore.user(); }
  get initials() {
    const name = this.authStore.user()?.name ?? '';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  ngOnInit(): void {
    const userId = this.authStore.user()?.id;
    if (!userId) { this.loadingProfile.set(false); return; }

    this.userService.getProfile(userId).subscribe({
      next: (detail: UserDetail) => this.applyDetail(detail),
      error: () => this.loadingProfile.set(false),
    });
  }

  private applyDetail(d: UserDetail): void {
    const birthdate = d.birthdate ? d.birthdate.split('T')[0] : '';
    this.profileForm.patchValue({
      first_name:               d.first_name,
      first_surname:            d.first_surname,
      phone:                    d.phone ?? '',
      birthdate,
      document_type:            d.document_type ?? 'CC',
      identity_document_number: d.identity_document_number ?? '',
    });
    if (d.image_url) {
      this.avatarPreview.set(this.userService.resolveImageUrl(d.image_url));
    }
    this.loadingProfile.set(false);
  }

  /** No reintentar si el preview actual es un archivo recién seleccionado (base64 local); solo aplica a la URL remota firmada. */
  onAvatarError(): void {
    if (this.avatarRetried || this.selectedFile()) return;
    this.avatarRetried = true;
    this.userService.refreshMyAvatarUrl().subscribe({
      next: url => { if (url) { this.avatarPreview.set(url); this.avatarRetried = false; } },
      error: () => {},
    });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = e => this.avatarPreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  onSubmit(): void {
    if (this.profileForm.invalid || this.saving()) return;

    this.saving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set(null);

    const v = this.profileForm.getRawValue();
    this.userService.updateProfile({
      first_name:               v.first_name!,
      first_surname:            v.first_surname!,
      phone:                    v.phone ?? '',
      birthdate:                v.birthdate ?? '',
      document_type:            v.document_type ?? 'CC',
      identity_document_number: v.identity_document_number ?? '',
      image_url:                this.selectedFile(),
    }).subscribe({
      next: () => {
        this.authStore.updateUser({
          name:      `${v.first_name} ${v.first_surname}`,
          image_url: this.avatarPreview() ?? this.authStore.user()?.image_url ?? null,
        });
        this.saving.set(false);
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'Error al guardar los cambios.');
      },
    });
  }

  onNewPasswordInput(): void {
    const current = this.passwordForm.get('new_password')?.value ?? '';
    evaluatePasswordStrength(current).then(s => {
      if (this.passwordForm.get('new_password')?.value === current) this.strength = s;
    });
  }

  onChangePassword(): void {
    if (this.passwordForm.invalid || this.changingPassword()) return;

    this.changingPassword.set(true);
    this.passwordSuccess.set(false);
    this.passwordError.set(null);

    const v = this.passwordForm.getRawValue();
    this.userService.changePassword(v.current_password!, v.new_password!).subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.passwordSuccess.set(true);
        this.passwordForm.reset();
        this.strength = null;
        setTimeout(() => this.passwordSuccess.set(false), 3000);
      },
      error: err => {
        this.changingPassword.set(false);
        this.passwordError.set(
          err?.status === 401
            ? 'La contraseña actual no es correcta.'
            : 'No se pudo cambiar la contraseña. Intenta de nuevo.'
        );
      },
    });
  }
}

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword     = group.get('new_password')?.value;
  const confirmPassword = group.get('confirm_password')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}
