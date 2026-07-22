import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { AuthStore } from '../../../../../core/auth/store/auth.store';
import { UserService } from '../../../../../core/users/services/user.service';
import { UserDetail } from '../../../../../core/users/models/user.model';
import { API_BASE_URL } from '../../../../../core/config/api.config';
import { ROLE_LABELS, UserRole } from '../../../../../core/auth/models/role.model';

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
  roles: UserRole[] = ['ADMIN', 'COORDINADOR', 'DILIGENCIADOR', 'LAWYER', 'FINANCE', 'USER'];
  roleLabels = ROLE_LABELS;

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
    role:                     ['', Validators.required],
    phone:                    [''],
    birthdate:                [''],
    document_type:            ['CC'],
    identity_document_number: [''],
  });

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
      role:                     d.role,
      phone:                    d.phone ?? '',
      birthdate,
      document_type:            d.document_type ?? 'CC',
      identity_document_number: d.identity_document_number ?? '',
    });
    if (d.image_url) {
      const host = new URL(API_BASE_URL).hostname;
      this.avatarPreview.set(d.image_url.replace('localhost', host));
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
    const userId = this.user?.id;
    if (!userId) return;

    this.saving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set(null);

    const v = this.profileForm.getRawValue();
    this.userService.updateProfile(userId, {
      first_name:               v.first_name!,
      first_surname:            v.first_surname!,
      role:                     v.role!,
      phone:                    v.phone ?? '',
      birthdate:                v.birthdate ?? '',
      document_type:            v.document_type ?? 'CC',
      identity_document_number: v.identity_document_number ?? '',
      image_url:                this.selectedFile(),
    }).subscribe({
      next: () => {
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
}
