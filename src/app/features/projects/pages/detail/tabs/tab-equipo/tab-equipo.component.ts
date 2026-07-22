import { Component, Input, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { TeamMember, UserListItem, ProjectSection, SectionPermission } from '../../../../models/project.model';

export const SECTION_LABELS: Record<ProjectSection, string> = {
  budget:                'Presupuesto',
  technical_components:  'Componentes técnicos',
  activities:             'Actividades',
  affiliates:             'Afiliados',
  locations:              'Ubicaciones',
  beneficiaries:          'Beneficiarios',
  actors:                 'Actores',
  risks:                  'Riesgos',
  changes:                'Cambios',
  checkpoints:            'Seguimiento técnico',
  documents:              'Documentos',
  supply_plan:            'Plan de abastecimiento',
  compliance_matrix:      'Matriz de cumplimiento',
  finance:                'Facturación',
  signature:              'Firma',
  extensions:             'Extensiones',
};

const ALL_SECTIONS = Object.keys(SECTION_LABELS) as ProjectSection[];

function emptyPermissions(): Record<ProjectSection, SectionPermission> {
  const p = {} as Record<ProjectSection, SectionPermission>;
  ALL_SECTIONS.forEach(s => p[s] = 'none');
  return p;
}

@Component({
  selector: 'app-tab-equipo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-equipo.component.html',
})
export class TabEquipoComponent implements OnInit {
  @Input() projectId!: string;

  private svc = inject(ProjectService);

  readonly sections = ALL_SECTIONS;
  readonly sectionLabels = SECTION_LABELS;

  members     = signal<TeamMember[]>([]);
  users       = signal<UserListItem[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);

  showForm    = signal(false);
  editingUser = signal<string | null>(null);
  selectedUserId = '';
  formPermissions: Record<ProjectSection, SectionPermission> = emptyPermissions();
  saving      = signal(false);
  saveError   = signal<string | null>(null);

  availableUsers = computed(() => {
    const memberIds = new Set(this.members().map(m => m.user_id));
    return this.users().filter(u => !memberIds.has(u.id));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    let done = 0;
    const check = () => { if (++done === 2) this.loading.set(false); };

    this.svc.getTeam(this.projectId).subscribe({
      next:  m => { this.members.set(m ?? []); check(); },
      error: () => { this.error.set('No se pudo cargar el equipo de apoyo.'); check(); },
    });

    this.svc.getUsers().subscribe({
      next:  u => { this.users.set(u ?? []); check(); },
      error: () => check(),
    });
  }

  openAddForm(): void {
    this.editingUser.set(null);
    this.selectedUserId = '';
    this.formPermissions = emptyPermissions();
    this.saveError.set(null);
    this.showForm.set(true);
  }

  openEditForm(member: TeamMember): void {
    this.editingUser.set(member.user_id);
    this.selectedUserId = member.user_id;
    this.formPermissions = { ...member.permissions };
    this.saveError.set(null);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  setPermission(section: ProjectSection, value: SectionPermission): void {
    this.formPermissions[section] = value;
  }

  isRead(section: ProjectSection): boolean {
    return this.formPermissions[section] !== 'none';
  }

  isWrite(section: ProjectSection): boolean {
    return this.formPermissions[section] === 'write';
  }

  onReadChange(section: ProjectSection, checked: boolean): void {
    this.setPermission(section, checked ? (this.isWrite(section) ? 'write' : 'read') : 'none');
  }

  onWriteChange(section: ProjectSection, checked: boolean): void {
    this.setPermission(section, checked ? 'write' : (this.isRead(section) ? 'read' : 'none'));
  }

  save(): void {
    if (this.saving()) return;
    if (!this.selectedUserId) {
      this.saveError.set('Selecciona un usuario.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);

    const editing = this.editingUser();
    const request = editing
      ? this.svc.updateTeamPermissions(this.projectId, editing, this.formPermissions)
      : this.svc.addTeamMember(this.projectId, { user_id: this.selectedUserId, permissions: this.formPermissions });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        const msg = err?.status === 403
          ? 'No tienes permiso para administrar el equipo de este proyecto.'
          : (err?.error?.error ?? err?.error?.message ?? 'Error al guardar el miembro del equipo.');
        this.saveError.set(msg);
      },
    });
  }

  remove(member: TeamMember): void {
    if (!confirm(`¿Quitar a ${member.name} del equipo de apoyo?`)) return;
    this.svc.removeTeamMember(this.projectId, member.user_id).subscribe({
      next: () => this.load(),
      error: err => {
        const msg = err?.status === 403
          ? 'No tienes permiso para administrar el equipo de este proyecto.'
          : 'Error al quitar el miembro del equipo.';
        this.error.set(msg);
      },
    });
  }
}
