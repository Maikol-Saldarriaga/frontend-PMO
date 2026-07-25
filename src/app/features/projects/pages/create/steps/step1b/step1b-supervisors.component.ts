import {
  Component, Input, Output, EventEmitter, OnInit, signal, inject, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { ContractStep1bRequest } from '../../../../models/contract.model';
import { SupervisorService } from '../../../../services/supervisor.service';
import {
  SupervisorUser, AffiliateUser,
  CreateSupervisorUserResponse,
  SupervisorDocumentType,
} from '../../../../models/supervisor.model';
import { UserService } from '../../../../../../../core/users/services/user.service';
import { ProjectService } from '../../../../services/project.service';
import { TeamMember, UserListItem, ProjectSection, SectionPermission } from '../../../../models/project.model';
import { SECTION_LABELS } from '../../../detail/tabs/tab-equipo/tab-equipo.component';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';

const ALL_SECTIONS = Object.keys(SECTION_LABELS) as ProjectSection[];

function emptyPermissions(): Record<ProjectSection, SectionPermission> {
  const p = {} as Record<ProjectSection, SectionPermission>;
  ALL_SECTIONS.forEach(s => p[s] = 'none');
  return p;
}

export interface Step1bSavedData {
  counterpart_supervisor?: string | null;
  ally_supervisor?:        string | null;
}

@Component({
  selector: 'app-step1b-supervisors',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './step1b-supervisors.component.html',
})
export class Step1bSupervisorsComponent implements OnInit {
  @Input() set savedData(val: Step1bSavedData | undefined) {
    if (!val) return;
    if (val.counterpart_supervisor) {
      this.form.get('counterpart_supervisor')?.setValue(val.counterpart_supervisor, { emitEvent: false });
    }
    if (val.ally_supervisor) {
      this.form.get('ally_supervisor')?.setValue(val.ally_supervisor, { emitEvent: false });
    }
  }
  @Input() projectId?: string | null;
  @Input() submitting = false;
  // Alianza elegida en step 1 — filtra el dropdown de supervisor aliado.
  // Sin alianza, ese control queda deshabilitado (el backend rechaza ally_supervisor
  // si el proyecto no tiene ally_id asignado).
  @Input() allyId: string | null = null;
  @Input() allyName: string | null = null;
  @Output() submitted       = new EventEmitter<ContractStep1bRequest>();
  @Output() dataChange      = new EventEmitter<ContractStep1bRequest>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  private fb            = inject(FormBuilder);
  private supervisorSvc = inject(SupervisorService);
  private userService   = inject(UserService);
  private projectSvc    = inject(ProjectService);
  private authStore     = inject(AuthStore);
  private avatarRetried = new Set<string>();

  readonly sections      = ALL_SECTIONS;
  readonly sectionLabels = SECTION_LABELS;

  teamMembers    = signal<TeamMember[]>([]);
  allUsers       = signal<UserListItem[]>([]);
  loadingTeam    = signal(false);

  showTeamForm    = signal(false);
  editingTeamUser = signal<string | null>(null);
  selectedTeamUserId = '';
  teamFormPermissions: Record<ProjectSection, SectionPermission> = emptyPermissions();
  teamPermMode = signal<'read' | 'write' | 'custom'>('read');
  savingTeam      = signal(false);
  teamError       = signal<string | null>(null);

  // Excluye a quienes ya son miembros del equipo Y al coordinador principal /
  // supervisor aliado recién elegidos arriba — ya tienen acceso por ese rol.
  availableTeamUsers(): UserListItem[] {
    const memberIds = new Set(this.teamMembers().map(m => m.user_id));
    const principalId = this.form.get('counterpart_supervisor')?.value;
    const allySupId = this.form.get('ally_supervisor')?.value;
    return this.allUsers().filter(u => !memberIds.has(u.id) && u.id !== principalId && u.id !== allySupId);
  }

  readonly docTypes = ['CC', 'CE', 'TI', 'PP', 'RC', 'NIT', 'PEP'];

  supervisors        = signal<SupervisorUser[]>([]);
  affiliates         = signal<AffiliateUser[]>([]);
  loadingSupervisors = signal(false);

  principalDropdownOpen = signal(false);
  customerDropdownOpen  = signal(false);
  selectedPrincipal     = signal<SupervisorUser | null>(null);
  selectedCustomer      = signal<AffiliateUser | null>(null);

  showPrincipalModal = signal(false);
  showCustomerModal  = signal(false);
  savingPrincipal    = signal(false);
  savingCustomer     = signal(false);
  principalError     = signal<string | null>(null);
  customerError      = signal<string | null>(null);

  principalForm = this.fb.group({
    first_name:               ['', Validators.required],
    first_surname:            ['', Validators.required],
    second_surname:           ['', Validators.required],
    middle_name:              [''],
    document_type:            ['CC', Validators.required],
    identity_document_number: ['', Validators.required],
    birthdate:                ['', Validators.required],
    email:                    ['', [Validators.required, Validators.email]],
    phone:                    ['', Validators.required],
    password:                 ['', [Validators.required, Validators.minLength(6)]],
    address:                  [''],
  });

  principalImageFile: File | null = null;

  customerForm = this.fb.group({
    first_name:            ['', Validators.required],
    middle_name:           [''],
    first_surname:         ['', Validators.required],
    second_surname:        ['', Validators.required],
    type_identification:   ['CC', Validators.required],
    identification_number: ['', Validators.required],
    birthdate:             ['', Validators.required],
    entity:                [''],
    job_title:             [''],
    phone:                 ['', Validators.required],
    email:                 ['', [Validators.required, Validators.email]],
    password:              ['', [Validators.required, Validators.minLength(6)]],
    department:            [''],
    municipality:          [''],
  });

  form = this.fb.group({
    counterpart_supervisor: [''],
    ally_supervisor:        [''],
  });

  ngOnInit(): void {
    this.form.valueChanges.subscribe(() => this.dataChange.emit(this.buildPayload()));
    this.loadSupervisors();
    if (this.projectId) this.loadTeam();
  }

  private buildPayload(): ContractStep1bRequest {
    const v = this.form.getRawValue();
    return {
      counterpart_supervisor: v.counterpart_supervisor || null,
      ally_supervisor:        v.ally_supervisor        || null,
    };
  }

  // ── Supervisores ─────────────────────────────────────────────────────────

  loadSupervisors(): void {
    this.loadingSupervisors.set(true);
    this.supervisorSvc.getList(this.allyId).subscribe({
      next: (res) => {
        this.supervisors.set(res.users);
        this.affiliates.set(res.affiliates);
        const pid = this.form.get('counterpart_supervisor')?.value;
        const cid = this.form.get('ally_supervisor')?.value;
        if (pid) {
          this.selectedPrincipal.set(res.users.find(u => u.id === pid) ?? null);
        } else if (this.authStore.user()?.role === 'COORDINADOR') {
          const me = res.users.find(u => u.id === this.authStore.user()!.id);
          if (me) this.selectPrincipal(me);
        }
        // Sin alianza, res.affiliates siempre viene vacío (el backend ya no
        // devuelve nada) — limpiamos cualquier ally_supervisor viejo del form
        // para no reenviar un id que el backend ahora rechaza.
        if (cid && !this.allyId) {
          this.form.get('ally_supervisor')?.setValue('', { emitEvent: false });
          this.selectedCustomer.set(null);
        } else if (cid) {
          this.selectedCustomer.set(res.affiliates.find(a => a.id === cid) ?? null);
        }
        this.loadingSupervisors.set(false);
      },
      error: () => this.loadingSupervisors.set(false),
    });
  }

  /** La URL firmada del avatar expira (MinIO); se pide una fresca una sola vez por usuario para evitar loops. */
  onSupervisorAvatarError(user: SupervisorUser): void {
    if (!user.id || this.avatarRetried.has(user.id)) return;
    this.avatarRetried.add(user.id);
    this.userService.refreshAvatarUrlById(user.id).subscribe({
      next: url => { if (url) user.image_url = url; },
      error: () => {},
    });
  }

  selectPrincipal(user: SupervisorUser): void {
    this.selectedPrincipal.set(user);
    this.form.get('counterpart_supervisor')?.setValue(user.id);
    this.principalDropdownOpen.set(false);
  }

  selectCustomer(aff: AffiliateUser): void {
    this.selectedCustomer.set(aff);
    this.form.get('ally_supervisor')?.setValue(aff.id);
    this.customerDropdownOpen.set(false);
  }

  togglePrincipalDropdown(): void {
    this.principalDropdownOpen.update(v => !v);
    this.customerDropdownOpen.set(false);
  }

  toggleCustomerDropdown(): void {
    if (!this.allyId) return;
    this.customerDropdownOpen.update(v => !v);
    this.principalDropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event.target'])
  onDocClick(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement) || !target.closest('[data-supervisor-dropdown]')) {
      this.principalDropdownOpen.set(false);
      this.customerDropdownOpen.set(false);
    }
  }

  // ── Modales ───────────────────────────────────────────────────────────────

  openPrincipalModal(): void {
    this.principalDropdownOpen.set(false);
    this.principalError.set(null);
    this.principalImageFile = null;
    this.principalForm.reset({ document_type: 'CC' });
    this.showPrincipalModal.set(true);
  }

  onPrincipalImageChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.principalImageFile = file;
  }

  closePrincipalModal(): void {
    this.showPrincipalModal.set(false);
    this.principalError.set(null);
  }

  openCustomerModal(): void {
    if (!this.allyId) return;
    this.customerDropdownOpen.set(false);
    this.customerError.set(null);
    this.customerForm.reset({ type_identification: 'CC' });
    this.showCustomerModal.set(true);
  }

  closeCustomerModal(): void {
    this.showCustomerModal.set(false);
    this.customerError.set(null);
  }

  createPrincipal(): void {
    this.principalForm.markAllAsTouched();
    if (this.principalForm.invalid) return;
    this.savingPrincipal.set(true);
    this.principalError.set(null);
    const v = this.principalForm.getRawValue();
    this.supervisorSvc.createCoordinador({
      first_name:               v.first_name!,
      first_surname:            v.first_surname!,
      second_surname:           v.second_surname!,
      document_type:            v.document_type! as SupervisorDocumentType,
      identity_document_number: v.identity_document_number!,
      birthdate:                v.birthdate!,
      email:                    v.email!,
      phone:                    v.phone!,
      password:                 v.password!,
      middle_name:              v.middle_name  || undefined,
      address:                  v.address      || undefined,
      image_url:                this.principalImageFile,
    }).subscribe({
      next: (res: CreateSupervisorUserResponse) => {
        const user: SupervisorUser = {
          id:                    res.id,
          full_name:             `${res.first_name} ${res.first_surname}`,
          type_identification:   res.document_type,
          identification_number: res.identity_document_number,
          image_url:             res.image_url,
        };
        this.supervisors.update(list => [...list, user]);
        this.selectPrincipal(user);
        this.showPrincipalModal.set(false);
        this.savingPrincipal.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.principalError.set(err?.error?.message ?? 'Error al crear el supervisor.');
        this.savingPrincipal.set(false);
      },
    });
  }

  createCustomer(): void {
    if (!this.allyId) {
      this.customerError.set('Este proyecto no tiene una alianza asignada — asígnala en el paso 1.');
      return;
    }
    this.customerForm.markAllAsTouched();
    if (this.customerForm.invalid) return;
    this.savingCustomer.set(true);
    this.customerError.set(null);
    const v = this.customerForm.getRawValue();
    this.supervisorSvc.createSupervisorAliado({
      first_name:               v.first_name!,
      first_surname:            v.first_surname!,
      second_surname:           v.second_surname!,
      document_type:            v.type_identification! as SupervisorDocumentType,
      identity_document_number: v.identification_number!,
      birthdate:                v.birthdate!,
      email:                    v.email!,
      phone:                    v.phone!,
      password:                 v.password!,
      middle_name:              v.middle_name || undefined,
      ally_id:                  this.allyId ?? undefined,
    }).subscribe({
      next: (res: CreateSupervisorUserResponse) => {
        const aff: AffiliateUser = {
          id:                    res.id,
          full_name:             `${res.first_name} ${res.first_surname}`,
          type_identification:   res.document_type,
          identification_number: res.identity_document_number,
        };
        this.affiliates.update(list => [...list, aff]);
        this.selectCustomer(aff);
        this.showCustomerModal.set(false);
        this.savingCustomer.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.customerError.set(err?.error?.message ?? 'Error al crear el supervisor aliado.');
        this.savingCustomer.set(false);
      },
    });
  }

  isPrincipalFieldInvalid(field: string): boolean {
    const ctrl = this.principalForm.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  isCustomerFieldInvalid(field: string): boolean {
    const ctrl = this.customerForm.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  onSubmit(): void {
    this.submitted.emit(this.buildPayload());
  }

  // ── Equipo de apoyo (añadido también aquí para asignarlo desde el formulario base) ──

  loadTeam(): void {
    if (!this.projectId) return;
    this.loadingTeam.set(true);
    let done = 0;
    const check = () => { if (++done === 2) this.loadingTeam.set(false); };

    this.projectSvc.getTeam(this.projectId).subscribe({
      next:  m => { this.teamMembers.set(m ?? []); check(); },
      error: () => check(),
    });
    this.projectSvc.getUsers().subscribe({
      next:  u => { this.allUsers.set(u ?? []); check(); },
      error: () => check(),
    });
  }

  openAddTeamForm(): void {
    this.editingTeamUser.set(null);
    this.selectedTeamUserId = '';
    this.teamFormPermissions = emptyPermissions();
    this.teamPermMode.set('read');
    this.onTeamPermModeChange('read');
    this.teamError.set(null);
    this.showTeamForm.set(true);
  }

  openEditTeamForm(member: TeamMember): void {
    this.editingTeamUser.set(member.user_id);
    this.selectedTeamUserId = member.user_id;
    this.teamFormPermissions = { ...member.permissions };
    this.teamPermMode.set(this.detectTeamPermMode(this.teamFormPermissions));
    this.teamError.set(null);
    this.showTeamForm.set(true);
  }

  // Detecta si todas las secciones comparten el mismo nivel (lectura o escritura)
  // para preseleccionar el modo rápido; si están mezcladas, cae en "custom".
  private detectTeamPermMode(perms: Record<ProjectSection, SectionPermission>): 'read' | 'write' | 'custom' {
    const values = this.sections.map(s => perms[s]);
    if (values.every(v => v === 'write')) return 'write';
    if (values.every(v => v === 'read' || v === 'none') && values.some(v => v === 'read')) return 'read';
    return 'custom';
  }

  onTeamPermModeChange(mode: 'read' | 'write' | 'custom'): void {
    this.teamPermMode.set(mode);
    if (mode === 'read') {
      this.sections.forEach(s => this.setTeamPermission(s, 'read'));
    } else if (mode === 'write') {
      this.sections.forEach(s => this.setTeamPermission(s, 'write'));
    } else {
      this.sections.forEach(s => this.setTeamPermission(s, 'none'));
    }
  }

  cancelTeamForm(): void {
    this.showTeamForm.set(false);
    this.teamError.set(null);
  }

  setTeamPermission(section: ProjectSection, value: SectionPermission): void {
    this.teamFormPermissions[section] = value;
  }

  isTeamRead(section: ProjectSection): boolean {
    return this.teamFormPermissions[section] !== 'none';
  }

  isTeamWrite(section: ProjectSection): boolean {
    return this.teamFormPermissions[section] === 'write';
  }

  onTeamReadChange(section: ProjectSection, checked: boolean): void {
    this.setTeamPermission(section, checked ? (this.isTeamWrite(section) ? 'write' : 'read') : 'none');
  }

  onTeamWriteChange(section: ProjectSection, checked: boolean): void {
    this.setTeamPermission(section, checked ? 'write' : (this.isTeamRead(section) ? 'read' : 'none'));
  }

  saveTeamMember(): void {
    if (!this.projectId || this.savingTeam()) return;
    if (!this.selectedTeamUserId) {
      this.teamError.set('Selecciona un usuario.');
      return;
    }
    this.savingTeam.set(true);
    this.teamError.set(null);

    const editing = this.editingTeamUser();
    const request = editing
      ? this.projectSvc.updateTeamPermissions(this.projectId, editing, this.teamFormPermissions)
      : this.projectSvc.addTeamMember(this.projectId, { user_id: this.selectedTeamUserId, permissions: this.teamFormPermissions });

    request.subscribe({
      next: () => {
        this.savingTeam.set(false);
        this.showTeamForm.set(false);
        this.loadTeam();
      },
      error: err => {
        this.savingTeam.set(false);
        const msg = err?.status === 403
          ? 'No tienes permiso para administrar el equipo de este proyecto.'
          : (err?.error?.error ?? err?.error?.message ?? 'Error al guardar el miembro del equipo.');
        this.teamError.set(msg);
      },
    });
  }

  removeTeamMember(member: TeamMember): void {
    if (!this.projectId) return;
    if (!confirm(`¿Quitar a ${member.user_name} del equipo de apoyo?`)) return;
    this.projectSvc.removeTeamMember(this.projectId, member.user_id).subscribe({
      next: () => this.loadTeam(),
      error: () => this.teamError.set('Error al quitar el miembro del equipo.'),
    });
  }
}
