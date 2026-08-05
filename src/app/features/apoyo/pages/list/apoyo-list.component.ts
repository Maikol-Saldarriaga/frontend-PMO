import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { ApoyoService } from '../../services/apoyo.service';
import { UserDetail } from '../../../../../core/users/models/user.model';
import { SupervisorDocumentType } from '../../../projects/models/supervisor.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

interface ApoyoForm {
  first_name: string;
  middle_name: string;
  first_surname: string;
  second_surname: string;
  document_type: SupervisorDocumentType;
  identity_document_number: string;
  email: string;
  phone: string;
  password: string;
}

function emptyForm(): ApoyoForm {
  return {
    first_name: '', middle_name: '', first_surname: '', second_surname: '',
    document_type: 'CC', identity_document_number: '',
    email: '', phone: '', password: '',
  };
}

@Component({
  selector: 'app-apoyo-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './apoyo-list.component.html',
})
export class ApoyoListComponent implements OnInit, OnDestroy {
  private svc = inject(ApoyoService);
  private confirmDialog = inject(ConfirmDialogService);
  private destroy$ = new Subject<void>();
  private searchInput$ = new Subject<string>();

  readonly docTypes: SupervisorDocumentType[] = ['CC', 'CE', 'TI', 'PP', 'RC', 'NIT', 'PEP'];

  users      = signal<UserDetail[]>([]);
  loading    = signal(true);
  error      = signal<string | null>(null);
  nextCursor = signal<string | number | null>(null);
  pageIndex  = signal(0);
  private cursorHistory: (string | number | null)[] = [null];

  searchTerm   = signal('');
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');

  showForm    = signal(false);
  editingUser = signal<UserDetail | null>(null);
  form: ApoyoForm = emptyForm();
  imageFile: File | null = null;
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
        this.users.set(res.data ?? []);
        this.nextCursor.set(res.next_cursor);
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudo cargar el listado de apoyos.'); this.loading.set(false); },
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
    this.editingUser.set(null);
    this.form = emptyForm();
    this.imageFile = null;
    this.saveError.set(null);
    this.showForm.set(true);
  }

  openEditForm(user: UserDetail): void {
    this.editingUser.set(user);
    this.form = {
      first_name:               user.first_name,
      middle_name:              user.middle_name ?? '',
      first_surname:            user.first_surname,
      second_surname:           user.second_surname ?? '',
      document_type:            user.document_type as SupervisorDocumentType,
      identity_document_number: user.identity_document_number,
      email:                    user.email,
      phone:                    user.phone,
      password:                 '',
    };
    this.imageFile = null;
    this.saveError.set(null);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  onImageChange(event: Event): void {
    this.imageFile = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  save(): void {
    if (this.saving()) return;
    const f = this.form;
    const editing = this.editingUser();
    if (!f.first_name || !f.first_surname || !f.second_surname || !f.identity_document_number
      || !f.email || !f.phone || (!editing && !f.password)) {
      this.saveError.set('Completa todos los campos obligatorios.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const payload = {
      first_name:               f.first_name,
      first_surname:            f.first_surname,
      second_surname:           f.second_surname,
      document_type:            f.document_type,
      identity_document_number: f.identity_document_number,
      email:                    f.email,
      phone:                    f.phone,
      password:                 f.password,
      middle_name:              f.middle_name || undefined,
      image_url:                this.imageFile,
    };

    const request = editing
      ? this.svc.update(editing.id, payload)
      : this.svc.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar el usuario de apoyo.');
      },
    });
  }

  async deactivate(user: UserDetail): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Desactivar a "${this.fullName(user)}"?` }))) return;
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

  trackById(_: number, u: UserDetail) { return u.id; }
}
