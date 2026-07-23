import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AllyService } from '../../services/ally.service';
import { Ally, AllySupervisor } from '../../models/ally.model';
import { SupervisorService } from '../../../projects/services/supervisor.service';
import { SupervisorDocumentType } from '../../../projects/models/supervisor.model';

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
  birthdate: string;
  email: string;
  phone: string;
  password: string;
}

function emptyAllyForm(): AllyForm {
  return { name: '', nit: '', phone: '', email: '', address: '' };
}

function emptySupervisorForm(): SupervisorForm {
  return {
    first_name: '', first_surname: '', second_surname: '',
    document_type: 'CC', identity_document_number: '', birthdate: '',
    email: '', phone: '', password: '',
  };
}

@Component({
  selector: 'app-allies-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './allies-list.component.html',
})
export class AlliesListComponent implements OnInit {
  private svc = inject(AllyService);
  private supervisorSvc = inject(SupervisorService);

  readonly docTypes: SupervisorDocumentType[] = ['CC', 'CE', 'TI', 'PP', 'RC', 'NIT', 'PEP'];

  allies  = signal<Ally[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

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
  supervisorForm: SupervisorForm = emptySupervisorForm();
  supervisorSaving    = signal(false);
  supervisorSaveError = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.list().subscribe({
      next: allies => { this.allies.set(allies ?? []); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el listado de aliados.'); this.loading.set(false); },
    });
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

  deactivate(ally: Ally): void {
    if (!confirm(`¿Desactivar el aliado "${ally.name}"?`)) return;
    this.svc.deactivate(ally.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Error al desactivar el aliado.'),
    });
  }

  // ── Supervisores del aliado ──────────────────────────────────────────────

  openSupervisors(ally: Ally): void {
    this.activeAlly.set(ally);
    this.showSupervisors.set(true);
    this.loadSupervisors();
  }

  closeSupervisors(): void {
    this.showSupervisors.set(false);
    this.showSupervisorForm.set(false);
    this.activeAlly.set(null);
  }

  private loadSupervisors(): void {
    const ally = this.activeAlly();
    if (!ally) return;
    this.supervisorsLoading.set(true);
    this.supervisorsError.set(null);
    this.svc.listSupervisors(ally.id).subscribe({
      next: sups => { this.supervisors.set(sups ?? []); this.supervisorsLoading.set(false); },
      error: () => { this.supervisorsError.set('No se pudieron cargar los supervisores.'); this.supervisorsLoading.set(false); },
    });
  }

  openAddSupervisorForm(): void {
    this.supervisorForm = emptySupervisorForm();
    this.supervisorSaveError.set(null);
    this.showSupervisorForm.set(true);
  }

  cancelSupervisorForm(): void {
    this.showSupervisorForm.set(false);
    this.supervisorSaveError.set(null);
  }

  saveSupervisor(): void {
    const ally = this.activeAlly();
    if (!ally || this.supervisorSaving()) return;

    const f = this.supervisorForm;
    if (!f.first_name || !f.first_surname || !f.second_surname || !f.identity_document_number ||
        !f.birthdate || !f.email || !f.phone || !f.password) {
      this.supervisorSaveError.set('Todos los campos son obligatorios excepto donde se indique.');
      return;
    }

    this.supervisorSaving.set(true);
    this.supervisorSaveError.set(null);
    this.supervisorSvc.createSupervisorAliado({ ...f, ally_id: ally.id }).subscribe({
      next: () => {
        this.supervisorSaving.set(false);
        this.showSupervisorForm.set(false);
        this.loadSupervisors();
      },
      error: err => {
        this.supervisorSaving.set(false);
        this.supervisorSaveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al crear el supervisor.');
      },
    });
  }
}
