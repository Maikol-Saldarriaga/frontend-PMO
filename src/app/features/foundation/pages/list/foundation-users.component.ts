import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { FoundationUserService } from '../../services/foundation-user.service';
import { UserDetail } from '../../../../../core/users/models/user.model';
import { UserRole, ROLE_LABELS } from '../../../../../core/auth/models/role.model';
import { SupervisorDocumentType } from '../../../projects/models/supervisor.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

// ADMIN excluido a propósito: desactivarlo por error aquí le quitaría el
// acceso a la plataforma (no hay otra pantalla para reactivarlo).
const FOUNDATION_ROLES: UserRole[] = ['COORDINADOR', 'DILIGENCIADOR', 'LAWYER', 'FINANCE', 'USER'];
const CREATABLE_ROLES: UserRole[] = ['COORDINADOR', 'DILIGENCIADOR'];

interface FoundationUserForm {
  first_name: string;
  first_surname: string;
  second_surname: string;
  document_type: SupervisorDocumentType;
  identity_document_number: string;
  birthdate: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

function emptyForm(): FoundationUserForm {
  return {
    first_name: '', first_surname: '', second_surname: '',
    document_type: 'CC', identity_document_number: '', birthdate: '',
    email: '', phone: '', password: '', role: 'DILIGENCIADOR',
  };
}

@Component({
  selector: 'app-foundation-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './foundation-users.component.html',
})
export class FoundationUsersComponent implements OnInit {
  private svc = inject(FoundationUserService);
  private confirmDialog = inject(ConfirmDialogService);

  readonly docTypes: SupervisorDocumentType[] = ['CC', 'CE', 'TI', 'PP', 'RC', 'NIT', 'PEP'];
  readonly creatableRoles = CREATABLE_ROLES;
  readonly roleLabels = ROLE_LABELS;

  allUsers = signal<UserDetail[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);

  users = computed(() => this.allUsers().filter(u => FOUNDATION_ROLES.includes(u.role as UserRole)));

  showForm  = signal(false);
  form: FoundationUserForm = emptyForm();
  saving    = signal(false);
  saveError = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.list().subscribe({
      next: users => { this.allUsers.set(users ?? []); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el listado de usuarios.'); this.loading.set(false); },
    });
  }

  openAddForm(): void {
    this.form = emptyForm();
    this.saveError.set(null);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  save(): void {
    if (this.saving()) return;
    const f = this.form;
    if (!f.first_name || !f.first_surname || !f.second_surname || !f.identity_document_number ||
        !f.birthdate || !f.email || !f.phone || !f.password) {
      this.saveError.set('Todos los campos son obligatorios.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const request = f.role === 'COORDINADOR'
      ? this.svc.createCoordinador(f)
      : this.svc.createDiligenciador(f);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al crear el usuario.');
      },
    });
  }

  async deactivate(user: UserDetail): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Desactivar a "${user.first_name} ${user.first_surname}"?` }))) return;
    this.svc.deactivate(user.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Error al desactivar el usuario.'),
    });
  }

  activate(user: UserDetail): void {
    this.svc.activate(user.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Error al activar el usuario.'),
    });
  }

  fullName(u: UserDetail): string {
    return [u.first_name, u.first_surname, u.second_surname].filter(Boolean).join(' ');
  }

  roleLabel(role: string): string {
    return this.roleLabels[role as UserRole] ?? role;
  }

  trackById(_: number, u: UserDetail) { return u.id; }
}
