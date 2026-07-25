import { Component, Input, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import { ContractService } from '../../../../services/contract.service';
import { SupervisorService } from '../../../../services/supervisor.service';
import { AllyService } from '../../../../../allies/services/ally.service';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';
import { TeamMember, UserListItem, ProjectSection, SectionPermission } from '../../../../models/project.model';
import { SupervisorUser, AffiliateUser } from '../../../../models/supervisor.model';
import { Ally } from '../../../../../allies/models/ally.model';

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

  private svc         = inject(ProjectService);
  private contractSvc = inject(ContractService);
  private supervisorSvc = inject(SupervisorService);
  private allySvc      = inject(AllyService);
  private auth          = inject(AuthStore);

  readonly sections = ALL_SECTIONS;
  readonly sectionLabels = SECTION_LABELS;

  isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');

  // ── Alianza / Coordinador principal / Supervisor aliado ────────────────────

  loadingAssignments = signal(true);
  assignmentsError   = signal<string | null>(null);

  allies      = signal<Ally[]>([]);
  supervisors = signal<SupervisorUser[]>([]);
  affiliates  = signal<AffiliateUser[]>([]);

  allyId               = signal<string | null>(null);
  principalSupervisorId = signal<string | null>(null);
  allySupervisorId      = signal<string | null>(null);

  showAssignmentForm = signal(false);
  formAllyId        = '';
  formPrincipalId   = '';
  formAllySupId     = '';
  savingAssignments = signal(false);
  assignmentSaveError = signal<string | null>(null);

  isPrincipalSupervisor = computed(() => {
    const me = this.auth.user()?.id;
    return !!me && me === this.principalSupervisorId();
  });

  isAllySupervisorUser = computed(() => {
    const me = this.auth.user()?.id;
    return !!me && me === this.allySupervisorId();
  });

  // Alianza, coordinador principal y supervisor aliado: solo ADMIN puede editar.
  canEditAssignments = computed(() => this.isAdmin());

  // Equipo de apoyo: además del ADMIN, el coordinador principal y el supervisor aliado pueden administrarlo.
  canEditTeam = computed(() => this.isAdmin() || this.isPrincipalSupervisor() || this.isAllySupervisorUser());

  allyName = computed(() => this.allies().find(a => a.id === this.allyId())?.name ?? null);
  principalSupervisorName = computed(() => this.supervisors().find(s => s.id === this.principalSupervisorId())?.full_name ?? null);
  allySupervisorName = computed(() => this.affiliates().find(a => a.id === this.allySupervisorId())?.full_name ?? null);

  // ── Equipo de apoyo ──────────────────────────────────────────────────────────

  members     = signal<TeamMember[]>([]);
  users       = signal<UserListItem[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);

  showForm    = signal(false);
  editingUser = signal<string | null>(null);
  selectedUserId = '';
  formPermissions: Record<ProjectSection, SectionPermission> = emptyPermissions();
  permMode    = signal<'read' | 'write' | 'custom'>('custom');
  saving      = signal(false);
  saveError   = signal<string | null>(null);

  // Excluye a quienes ya son miembros del equipo Y al coordinador principal /
  // supervisor aliado del proyecto — ya tienen acceso por ese rol, sumarlos
  // como "apoyo" es redundante (el backend también lo rechaza).
  availableUsers = computed(() => {
    const memberIds = new Set(this.members().map(m => m.user_id));
    const principalId = this.principalSupervisorId();
    const allySupId = this.allySupervisorId();
    return this.users().filter(u => !memberIds.has(u.id) && u.id !== principalId && u.id !== allySupId);
  });

  ngOnInit(): void {
    this.load();
    this.loadAssignments();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    let done = 0;
    const check = () => { if (++done === 2) this.loading.set(false); };

    this.svc.getTeam(this.projectId).subscribe({
      next:  m => { this.members.set(m ?? []); check(); },
      error: () => { this.error.set('No se pudo cargar el equipo.'); check(); },
    });

    this.svc.getUsers().subscribe({
      next:  u => { this.users.set(u ?? []); check(); },
      error: () => check(),
    });
  }

  // ── Alianza / supervisores ─────────────────────────────────────────────────

  loadAssignments(): void {
    this.loadingAssignments.set(true);
    this.assignmentsError.set(null);

    this.allySvc.list().subscribe({
      next:  allies => this.allies.set((allies ?? []).filter(a => a.is_active)),
      error: () => this.allies.set([]),
    });

    this.contractSvc.getWizard(this.projectId).subscribe({
      next: wizard => {
        const sup = wizard.supervisors;

        this.allyId.set(sup?.ally_id ?? null);
        this.principalSupervisorId.set(sup?.counterpart_supervisor?.id ?? null);
        this.allySupervisorId.set(sup?.ally_supervisor?.id ?? null);

        this.loadSupervisorLists();
        this.loadingAssignments.set(false);
      },
      error: () => {
        this.assignmentsError.set('No se pudo cargar la alianza y los supervisores.');
        this.loadingAssignments.set(false);
      },
    });
  }

  private loadSupervisorLists(): void {
    this.supervisorSvc.getList(this.allyId()).subscribe({
      next: res => {
        this.supervisors.set(res.users ?? []);
        this.affiliates.set(res.affiliates ?? []);
      },
      error: () => {},
    });
  }

  openAssignmentForm(): void {
    if (!this.canEditAssignments()) return;
    this.formAllyId      = this.allyId() ?? '';
    this.formPrincipalId = this.principalSupervisorId() ?? '';
    this.formAllySupId   = this.allySupervisorId() ?? '';
    this.assignmentSaveError.set(null);
    this.showAssignmentForm.set(true);
  }

  cancelAssignmentForm(): void {
    this.showAssignmentForm.set(false);
    this.assignmentSaveError.set(null);
  }

  // Cambiar la alianza reinicia el supervisor aliado seleccionado (pertenece a la alianza anterior)
  // y recarga la lista de afiliados para la nueva alianza.
  onFormAllyChange(): void {
    this.formAllySupId = '';
    this.supervisorSvc.getList(this.formAllyId || null).subscribe({
      next: res => {
        this.supervisors.set(res.users ?? []);
        this.affiliates.set(res.affiliates ?? []);
      },
      error: () => {},
    });
  }

  // Un solo PUT liviano (steps/supervisors) para los 3 campos — no reenvía el
  // step 1 completo, así que no exige fechas de servicio ni el resto de campos
  // del contrato (varios proyectos legados no las tienen guardadas).
  saveAssignments(): void {
    if (this.savingAssignments()) return;
    this.savingAssignments.set(true);
    this.assignmentSaveError.set(null);

    this.contractSvc.updateStep1b(this.projectId, {
      ally_id:                this.formAllyId       || '',
      counterpart_supervisor: this.formPrincipalId  || null,
      ally_supervisor:        this.formAllySupId    || null,
    }).subscribe({
      next: () => {
        this.savingAssignments.set(false);
        this.showAssignmentForm.set(false);
        this.loadAssignments();
      },
      error: err => this.handleAssignmentError(err),
    });
  }

  private handleAssignmentError(err: { status?: number; error?: { error?: string; message?: string } }): void {
    this.savingAssignments.set(false);
    const msg = err?.status === 403
      ? 'Solo un administrador puede editar la alianza y los supervisores.'
      : (err?.error?.error ?? err?.error?.message ?? 'Error al guardar los cambios.');
    this.assignmentSaveError.set(msg);
  }

  // ── Equipo de apoyo ──────────────────────────────────────────────────────────

  openAddForm(): void {
    if (!this.canEditTeam()) return;
    this.editingUser.set(null);
    this.selectedUserId = '';
    this.formPermissions = emptyPermissions();
    this.permMode.set('read');
    this.onPermModeChange('read');
    this.saveError.set(null);
    this.showForm.set(true);
  }

  openEditForm(member: TeamMember): void {
    if (!this.canEditTeam()) return;
    this.editingUser.set(member.user_id);
    this.selectedUserId = member.user_id;
    this.formPermissions = { ...member.permissions };
    this.permMode.set(this.detectPermMode(this.formPermissions));
    this.saveError.set(null);
    this.showForm.set(true);
  }

  // Detecta si todas las secciones comparten el mismo nivel (lectura o escritura)
  // para preseleccionar el modo rápido; si están mezcladas, cae en "custom".
  private detectPermMode(perms: Record<ProjectSection, SectionPermission>): 'read' | 'write' | 'custom' {
    const values = this.sections.map(s => perms[s]);
    if (values.every(v => v === 'write')) return 'write';
    if (values.every(v => v === 'read' || v === 'none') && values.some(v => v === 'read')) return 'read';
    return 'custom';
  }

  onPermModeChange(mode: 'read' | 'write' | 'custom'): void {
    this.permMode.set(mode);
    if (mode === 'read') {
      this.sections.forEach(s => this.setPermission(s, 'read'));
    } else if (mode === 'write') {
      this.sections.forEach(s => this.setPermission(s, 'write'));
    } else {
      this.sections.forEach(s => this.setPermission(s, 'none'));
    }
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
    if (this.saving() || !this.canEditTeam()) return;
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
    if (!this.canEditTeam()) return;
    if (!confirm(`¿Quitar a ${member.user_name} del equipo?`)) return;
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
