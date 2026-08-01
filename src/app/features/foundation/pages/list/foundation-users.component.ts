import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

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
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

function emptyForm(): FoundationUserForm {
  return {
    first_name: '', first_surname: '', second_surname: '',
    document_type: 'CC', identity_document_number: '',
    email: '', phone: '', password: '', role: 'DILIGENCIADOR',
  };
}

@Component({
  selector: 'app-foundation-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './foundation-users.component.html',
})
export class FoundationUsersComponent implements OnInit, OnDestroy {
  private svc = inject(FoundationUserService);
  private confirmDialog = inject(ConfirmDialogService);
  private destroy$ = new Subject<void>();
  private searchInput$ = new Subject<string>();

  readonly docTypes: SupervisorDocumentType[] = ['CC', 'CE', 'TI', 'PP', 'RC', 'NIT', 'PEP'];
  readonly creatableRoles = CREATABLE_ROLES;
  readonly foundationRoles = FOUNDATION_ROLES;
  readonly roleLabels = ROLE_LABELS;

  allUsers   = signal<UserDetail[]>([]);
  loading    = signal(true);
  error      = signal<string | null>(null);
  nextCursor = signal<string | number | null>(null);
  pageIndex  = signal(0);
  private cursorHistory: (string | number | null)[] = [null];

  searchTerm   = signal('');
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  // "rol" no lo cubre el search del backend (solo nombre/email/teléfono) —
  // se filtra en cliente, solo sobre la página actual.
  roleFilter   = signal<UserRole | 'all'>('all');

  users = computed(() => {
    const role = this.roleFilter();
    return this.allUsers().filter(u => {
      if (!FOUNDATION_ROLES.includes(u.role as UserRole)) return false;
      if (role !== 'all' && u.role !== role) return false;
      return true;
    });
  });

  showForm  = signal(false);
  form: FoundationUserForm = emptyForm();
  saving    = signal(false);
  saveError = signal<string | null>(null);

  ngOnInit(): void {
    this.searchInput$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(term => {
      this.searchTerm.set(term);
      this.load();
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(term: string): void {
    this.searchInput$.next(term);
  }

  onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
    this.load();
  }

  load(resetPagination = true): void {
    this.loading.set(true);
    this.error.set(null);
    if (resetPagination) {
      this.cursorHistory = [null];
      this.pageIndex.set(0);
    }
    const status = this.statusFilter();
    const cursor = this.cursorHistory[this.pageIndex()];
    this.svc.list({
      search: this.searchTerm().trim() || undefined,
      status: status === 'all' ? undefined : status,
      cursor: cursor ?? undefined,
    }).subscribe({
      next: res => {
        this.allUsers.set(res.data ?? []);
        this.nextCursor.set(res.next_cursor);
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudo cargar el listado de usuarios.'); this.loading.set(false); },
    });
  }

  goToNextPage(): void {
    const cursor = this.nextCursor();
    if (!cursor) return;
    if (this.pageIndex() === this.cursorHistory.length - 1) {
      this.cursorHistory.push(cursor);
    }
    this.pageIndex.update(i => i + 1);
    this.load(false);
  }

  goToPrevPage(): void {
    if (this.pageIndex() === 0) return;
    this.pageIndex.update(i => i - 1);
    this.load(false);
  }

  get hasPrevPage(): boolean {
    return this.pageIndex() > 0;
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
        !f.email || !f.phone || !f.password) {
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
