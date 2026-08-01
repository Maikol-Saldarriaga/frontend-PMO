import { Component, Input, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ProjectService } from '../../../../services/project.service';
import { ContractService } from '../../../../services/contract.service';
import { SupervisorService } from '../../../../services/supervisor.service';
import { AllyService } from '../../../../../allies/services/ally.service';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';
import { TeamMember, UserListItem, ProjectSection, SectionPermission } from '../../../../models/project.model';
import { SupervisorUser, AffiliateUser, CreateSupervisorUserResponse, SupervisorDocumentType } from '../../../../models/supervisor.model';
import { Ally } from '../../../../../allies/models/ally.model';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';

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
export class TabEquipoComponent implements OnInit, OnDestroy {
  @Input() projectId!: string;
  @Input() locked = false;

  private svc         = inject(ProjectService);
  private contractSvc = inject(ContractService);
  private supervisorSvc = inject(SupervisorService);
  private allySvc      = inject(AllyService);
  private auth          = inject(AuthStore);
  private confirmDialog = inject(ConfirmDialogService);
  private destroy$ = new Subject<void>();
  private principalSearch$ = new Subject<string>();
  private allySupSearch$   = new Subject<string>();

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

  // ── Autocomplete: coordinador principal / supervisor aliado ────────────────
  principalSearchText  = '';
  allySupSearchText     = '';
  showPrincipalDropdown = signal(false);
  showAllySupDropdown   = signal(false);
  principalOptions      = signal<SupervisorUser[]>([]);
  allySupOptions         = signal<AffiliateUser[]>([]);

  isPrincipalSupervisor = computed(() => {
    const me = this.auth.user()?.id;
    return !!me && me === this.principalSupervisorId();
  });

  isAllySupervisorUser = computed(() => {
    const me = this.auth.user()?.id;
    return !!me && me === this.allySupervisorId();
  });

  // Alianza y supervisor aliado: ADMIN o el coordinador principal del proyecto pueden editar.
  canEditAssignments = computed(() => !this.locked && (this.isAdmin() || this.isPrincipalSupervisor()));

  // Coordinador principal: libre mientras no haya uno asignado; una vez elegido,
  // solo ADMIN puede cambiarlo (el backend devuelve 403 si un no-admin lo intenta).
  canChangePrincipal = computed(() => this.isAdmin() || !this.principalSupervisorId());

  // Equipo: además del ADMIN, el coordinador principal y el supervisor aliado pueden administrarlo.
  canEditTeam = computed(() => !this.locked && (this.isAdmin() || this.isPrincipalSupervisor() || this.isAllySupervisorUser()));

  allyName = computed(() => this.allies().find(a => a.id === this.allyId())?.name ?? null);
  principalSupervisorName = computed(() => this.supervisors().find(s => s.id === this.principalSupervisorId())?.full_name ?? null);
  allySupervisorName = computed(() => this.affiliates().find(a => a.id === this.allySupervisorId())?.full_name ?? null);

  // ── Equipo ──────────────────────────────────────────────────────────

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

    // Debounce cortico (250ms) — la idea es que se sienta reactivo tecleando,
    // sin saturar el backend en cada letra.
    this.principalSearch$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(term => this.fetchPrincipalOptions(term));

    this.allySupSearch$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(term => this.fetchAllySupOptions(term));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

    this.allySvc.listAll().subscribe({
      next:  allies => this.allies.set(allies ?? []),
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
    this.principalSearchText = this.principalSupervisorName() ?? '';
    this.allySupSearchText   = this.allySupervisorName() ?? '';
    this.principalOptions.set(this.supervisors());
    this.allySupOptions.set(this.affiliates());
    this.assignmentSaveError.set(null);
    this.showAssignmentForm.set(true);
  }

  private fetchPrincipalOptions(term: string): void {
    this.supervisorSvc.getList(this.formAllyId || null, term).subscribe({
      next: res => this.principalOptions.set(res.users ?? []),
      error: () => {},
    });
  }

  private fetchAllySupOptions(term: string): void {
    if (!this.formAllyId) { this.allySupOptions.set([]); return; }
    this.supervisorSvc.getList(this.formAllyId, term).subscribe({
      next: res => this.allySupOptions.set(res.affiliates ?? []),
      error: () => {},
    });
  }

  onPrincipalFocus(): void {
    if (!this.canChangePrincipal()) return;
    this.showPrincipalDropdown.set(true);
    if (!this.principalOptions().length) this.fetchPrincipalOptions('');
  }

  onPrincipalInput(value: string): void {
    if (!this.canChangePrincipal()) return;
    this.principalSearchText = value;
    this.formPrincipalId = '';
    this.showPrincipalDropdown.set(true);
    this.principalSearch$.next(value);
  }

  onPrincipalBlur(): void {
    setTimeout(() => this.showPrincipalDropdown.set(false), 150);
  }

  selectPrincipal(s: SupervisorUser): void {
    this.formPrincipalId = s.id;
    this.principalSearchText = s.full_name;
    this.showPrincipalDropdown.set(false);
  }

  clearPrincipal(): void {
    this.formPrincipalId = '';
    this.principalSearchText = '';
    this.showPrincipalDropdown.set(false);
  }

  onAllySupFocus(): void {
    if (!this.formAllyId) return;
    this.showAllySupDropdown.set(true);
    if (!this.allySupOptions().length) this.fetchAllySupOptions('');
  }

  onAllySupInput(value: string): void {
    this.allySupSearchText = value;
    this.formAllySupId = '';
    this.showAllySupDropdown.set(true);
    this.allySupSearch$.next(value);
  }

  onAllySupBlur(): void {
    setTimeout(() => this.showAllySupDropdown.set(false), 150);
  }

  selectAllySup(a: AffiliateUser): void {
    this.formAllySupId = a.id;
    this.allySupSearchText = a.full_name;
    this.showAllySupDropdown.set(false);
  }

  clearAllySup(): void {
    this.formAllySupId = '';
    this.allySupSearchText = '';
    this.showAllySupDropdown.set(false);
  }

  cancelAssignmentForm(): void {
    this.showAssignmentForm.set(false);
    this.assignmentSaveError.set(null);
  }

  // Cambiar la alianza reinicia el supervisor aliado seleccionado (pertenece a la alianza anterior)
  // y recarga la lista de afiliados para la nueva alianza.
  onFormAllyChange(): void {
    this.formAllySupId = '';
    this.allySupSearchText = '';
    this.fetchPrincipalOptions(this.principalSearchText);
    this.fetchAllySupOptions('');
  }

  // Un solo PUT liviano (steps/supervisors) para los 3 campos — no reenvía el
  // step 1 completo, así que no exige fechas de servicio ni el resto de campos
  // del contrato (varios proyectos legados no las tienen guardadas).
  saveAssignments(): void {
    if (this.locked || this.savingAssignments()) return;
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
      ? (err?.error?.error ?? err?.error?.message ?? 'Solo un administrador puede cambiar el coordinador principal.')
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

  // ── Crear usuario apoyo (rápido, desde el modal de agregar miembro) ────────

  showApoyoModal = signal(false);
  savingApoyo    = signal(false);
  apoyoError     = signal<string | null>(null);
  apoyoImageFile: File | null = null;
  apoyoForm = {
    first_name: '', middle_name: '', first_surname: '', second_surname: '',
    document_type: 'CC' as SupervisorDocumentType, identity_document_number: '',
    email: '', phone: '', password: '',
  };

  openApoyoModal(): void {
    this.apoyoError.set(null);
    this.apoyoImageFile = null;
    this.apoyoForm = {
      first_name: '', middle_name: '', first_surname: '', second_surname: '',
      document_type: 'CC', identity_document_number: '',
      email: '', phone: '', password: '',
    };
    this.showApoyoModal.set(true);
  }

  closeApoyoModal(): void {
    this.showApoyoModal.set(false);
    this.apoyoError.set(null);
  }

  onApoyoImageChange(event: Event): void {
    this.apoyoImageFile = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  createApoyo(): void {
    if (this.locked) return;
    const f = this.apoyoForm;
    if (!f.first_name || !f.first_surname || !f.second_surname || !f.identity_document_number
      || !f.email || !f.phone || !f.password) {
      this.apoyoError.set('Completa todos los campos obligatorios.');
      return;
    }
    this.savingApoyo.set(true);
    this.apoyoError.set(null);
    this.supervisorSvc.createApoyo({
      first_name:               f.first_name,
      first_surname:            f.first_surname,
      second_surname:           f.second_surname,
      document_type:            f.document_type,
      identity_document_number: f.identity_document_number,
      email:                    f.email,
      phone:                    f.phone,
      password:                 f.password,
      middle_name:              f.middle_name || undefined,
      image_url:                this.apoyoImageFile,
    }).subscribe({
      next: (res: CreateSupervisorUserResponse) => {
        const user: UserListItem = {
          id:    res.id,
          email: res.email,
          name:  `${res.first_name} ${res.first_surname}`,
        };
        this.users.update(list => [...list, user]);
        this.selectedUserId = user.id;
        this.savingApoyo.set(false);
        this.showApoyoModal.set(false);
      },
      error: (err: { error?: { error?: string; message?: string } }) => {
        this.savingApoyo.set(false);
        this.apoyoError.set(err?.error?.error ?? err?.error?.message ?? 'Error al crear el usuario de apoyo.');
      },
    });
  }

  async remove(member: TeamMember): Promise<void> {
    if (!this.canEditTeam()) return;
    if (!(await this.confirmDialog.confirm({ message: `¿Quitar a ${member.user_name} del equipo?` }))) return;
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
