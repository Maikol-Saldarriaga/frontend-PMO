import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { AllyService } from '../../services/ally.service';
import { Ally, AllySupervisor } from '../../models/ally.model';
import { SupervisorService } from '../../../projects/services/supervisor.service';
import { SupervisorDocumentType } from '../../../projects/models/supervisor.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

interface AllyForm {
  name: string;
  nit: string;
  phone: string;
  email: string;
  address: string;
}

interface SupervisorForm {
  first_name: string;
  first_surname: string;
  second_surname: string;
  document_type: SupervisorDocumentType;
  identity_document_number: string;
  email: string;
  phone: string;
  password: string;
}

type SupervisorDialogMode = 'create' | 'edit';

function emptyAllyForm(): AllyForm {
  return { name: '', nit: '', phone: '', email: '', address: '' };
}

function emptySupervisorForm(): SupervisorForm {
  return {
    first_name: '', first_surname: '', second_surname: '',
    document_type: 'CC', identity_document_number: '',
    email: '', phone: '', password: '',
  };
}

@Component({
  selector: 'app-allies-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './allies-list.component.html',
})
export class AlliesListComponent implements OnInit, OnDestroy {
  private svc = inject(AllyService);
  private supervisorSvc = inject(SupervisorService);
  private confirmDialog = inject(ConfirmDialogService);
  private destroy$ = new Subject<void>();
  private searchInput$ = new Subject<string>();
  private supervisorSearchInput$ = new Subject<string>();

  readonly docTypes: SupervisorDocumentType[] = ['CC', 'CE', 'TI', 'PP', 'RC', 'NIT', 'PEP'];

  allies     = signal<Ally[]>([]);
  loading    = signal(true);
  error      = signal<string | null>(null);
  nextCursor = signal<string | number | null>(null);
  pageIndex  = signal(0);
  private cursorHistory: (string | number | null)[] = [null];

  searchTerm   = signal('');
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');

  supervisorSearchTerm  = signal('');
  supervisorNextCursor  = signal<string | number | null>(null);
  supervisorPageIndex   = signal(0);
  private supervisorCursorHistory: (string | number | null)[] = [null];

  // ── Modal: crear/editar aliado ──────────────────────────────────────────
  showForm    = signal(false);
  editingAlly = signal<Ally | null>(null);
  form: AllyForm = emptyAllyForm();
  saving      = signal(false);
  saveError   = signal<string | null>(null);

  // ── Modal: supervisores del aliado ──────────────────────────────────────
  showSupervisors    = signal(false);
  activeAlly         = signal<Ally | null>(null);
  supervisors        = signal<AllySupervisor[]>([]);
  supervisorsLoading = signal(false);
  supervisorsError   = signal<string | null>(null);

  showSupervisorForm  = signal(false);
  supervisorDialogMode: SupervisorDialogMode = 'create';
  editingSupervisor   = signal<AllySupervisor | null>(null);
  supervisorForm: SupervisorForm = emptySupervisorForm();
  supervisorSaving    = signal(false);
  supervisorSaveError = signal<string | null>(null);

  ngOnInit(): void {
    this.searchInput$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(term => {
      this.searchTerm.set(term);
      this.load();
    });

    this.supervisorSearchInput$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(term => {
      this.supervisorSearchTerm.set(term);
      this.loadSupervisors();
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

  onSupervisorSearchInput(term: string): void {
    this.supervisorSearchInput$.next(term);
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
        this.allies.set(res.data ?? []);
        this.nextCursor.set(res.next_cursor);
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudo cargar el listado de aliados.'); this.loading.set(false); },
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

  // ── Crear/editar aliado ──────────────────────────────────────────────────

  openAddForm(): void {
    this.editingAlly.set(null);
    this.form = emptyAllyForm();
    this.saveError.set(null);
    this.showForm.set(true);
  }

  openEditForm(ally: Ally): void {
    this.editingAlly.set(ally);
    this.form = {
      name: ally.name,
      nit: ally.nit ?? '',
      phone: ally.phone ?? '',
      email: ally.email ?? '',
      address: ally.address ?? '',
    };
    this.saveError.set(null);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  save(): void {
    if (this.saving()) return;
    if (!this.form.name.trim()) {
      this.saveError.set('El nombre es obligatorio.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);

    const payload = {
      name: this.form.name.trim(),
      nit: this.form.nit || null,
      phone: this.form.phone || null,
      email: this.form.email || null,
      address: this.form.address || null,
    };

    const editing = this.editingAlly();
    const request = editing ? this.svc.update(editing.id, payload) : this.svc.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar el aliado.');
      },
    });
  }

  async deactivate(ally: Ally): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Desactivar el aliado "${ally.name}"?` }))) return;
    this.svc.deactivate(ally.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Error al desactivar el aliado.'),
    });
  }

  activate(ally: Ally): void {
    this.svc.activate(ally.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Error al activar el aliado.'),
    });
  }

  // ── Supervisores del aliado ──────────────────────────────────────────────

  openSupervisors(ally: Ally): void {
    this.activeAlly.set(ally);
    this.supervisorSearchTerm.set('');
    this.showSupervisors.set(true);
    this.loadSupervisors();
  }

  closeSupervisors(): void {
    this.showSupervisors.set(false);
    this.showSupervisorForm.set(false);
    this.activeAlly.set(null);
  }

  private loadSupervisors(resetPagination = true): void {
    const ally = this.activeAlly();
    if (!ally) return;
    this.supervisorsLoading.set(true);
    this.supervisorsError.set(null);
    if (resetPagination) {
      this.supervisorCursorHistory = [null];
      this.supervisorPageIndex.set(0);
    }
    const cursor = this.supervisorCursorHistory[this.supervisorPageIndex()];
    this.svc.listSupervisors(ally.id, { search: this.supervisorSearchTerm().trim() || undefined, cursor: cursor ?? undefined }).subscribe({
      next: res => {
        this.supervisors.set(res.data ?? []);
        this.supervisorNextCursor.set(res.next_cursor);
        this.supervisorsLoading.set(false);
      },
      error: () => { this.supervisorsError.set('No se pudieron cargar los supervisores.'); this.supervisorsLoading.set(false); },
    });
  }

  goToSupervisorNextPage(): void {
    const cursor = this.supervisorNextCursor();
    if (!cursor) return;
    if (this.supervisorPageIndex() === this.supervisorCursorHistory.length - 1) {
      this.supervisorCursorHistory.push(cursor);
    }
    this.supervisorPageIndex.update(i => i + 1);
    this.loadSupervisors(false);
  }

  goToSupervisorPrevPage(): void {
    if (this.supervisorPageIndex() === 0) return;
    this.supervisorPageIndex.update(i => i - 1);
    this.loadSupervisors(false);
  }

  get hasSupervisorPrevPage(): boolean {
    return this.supervisorPageIndex() > 0;
  }

  openAddSupervisorForm(): void {
    this.supervisorDialogMode = 'create';
    this.editingSupervisor.set(null);
    this.supervisorForm = emptySupervisorForm();
    this.supervisorSaveError.set(null);
    this.showSupervisorForm.set(true);
  }

  openEditSupervisorForm(sup: AllySupervisor): void {
    this.supervisorDialogMode = 'edit';
    this.editingSupervisor.set(sup);
    this.supervisorForm = {
      ...emptySupervisorForm(),
      first_name: sup.full_name.split(' ')[0] ?? '',
      identity_document_number: sup.identification_number,
      document_type: (sup.type_identification as SupervisorDocumentType) || 'CC',
    };
    this.supervisorSaveError.set(null);
    this.showSupervisorForm.set(true);

    this.supervisorSvc.getById(sup.id).subscribe({
      next: detail => {
        this.supervisorForm = {
          ...this.supervisorForm,
          first_name: detail.first_name,
          first_surname: detail.first_surname,
          second_surname: detail.second_surname ?? '',
          document_type: (detail.document_type as SupervisorDocumentType) || 'CC',
          identity_document_number: detail.identity_document_number,
          email: detail.email,
          phone: detail.phone,
        };
      },
      error: () => this.supervisorSaveError.set('No se pudo cargar el detalle del supervisor.'),
    });
  }

  cancelSupervisorForm(): void {
    this.showSupervisorForm.set(false);
    this.editingSupervisor.set(null);
    this.supervisorSaveError.set(null);
  }

  saveSupervisor(): void {
    const ally = this.activeAlly();
    if (!ally || this.supervisorSaving()) return;

    const editing = this.editingSupervisor();
    const f = this.supervisorForm;
    const passwordRequired = !editing;
    if (!f.first_name || !f.first_surname || !f.second_surname || !f.identity_document_number ||
        !f.email || !f.phone || (passwordRequired && !f.password)) {
      this.supervisorSaveError.set('Todos los campos son obligatorios excepto donde se indique.');
      return;
    }

    this.supervisorSaving.set(true);
    this.supervisorSaveError.set(null);

    const request = editing
      ? this.supervisorSvc.updateSupervisorAliado(editing.id, { ...f, ally_id: ally.id })
      : this.supervisorSvc.createSupervisorAliado({ ...f, ally_id: ally.id });

    request.subscribe({
      next: () => {
        this.supervisorSaving.set(false);
        this.showSupervisorForm.set(false);
        this.editingSupervisor.set(null);
        this.loadSupervisors();
      },
      error: err => {
        this.supervisorSaving.set(false);
        this.supervisorSaveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar el supervisor.');
      },
    });
  }

  async deactivateSupervisor(sup: AllySupervisor): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Desactivar al supervisor "${sup.full_name}"?` }))) return;
    this.supervisorSvc.deactivateSupervisor(sup.id).subscribe({
      next: () => this.loadSupervisors(),
      error: () => this.supervisorsError.set('Error al desactivar el supervisor.'),
    });
  }

  activateSupervisor(sup: AllySupervisor): void {
    this.supervisorSvc.activateSupervisor(sup.id).subscribe({
      next: () => this.loadSupervisors(),
      error: () => this.supervisorsError.set('Error al activar el supervisor.'),
    });
  }
}
