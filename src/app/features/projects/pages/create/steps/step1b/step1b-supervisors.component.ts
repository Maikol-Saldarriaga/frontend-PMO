import {
  Component, Input, Output, EventEmitter, OnInit, signal, inject, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ContractStep1bRequest } from '../../../../models/contract.model';
import { SupervisorService } from '../../../../services/supervisor.service';
import {
  SupervisorUser, AffiliateUser,
  CreateSupervisorUserResponse, CreateAffiliateResponse,
  SupervisorDocumentType,
} from '../../../../models/supervisor.model';

export interface Step1bSavedData {
  counterpart_supervisor?: string | null;
  ally_supervisor?:        string | null;
}

@Component({
  selector: 'app-step1b-supervisors',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './step1b-supervisors.component.html',
})
export class Step1bSupervisorsComponent implements OnInit {
  @Input() set savedData(val: Step1bSavedData | undefined) {
    if (!val) return;
    if (val.counterpart_supervisor) {
      this.form.get('counterpart_supervisor')?.setValue(val.counterpart_supervisor);
    }
    if (val.ally_supervisor) {
      this.form.get('ally_supervisor')?.setValue(val.ally_supervisor);
    }
  }
  @Input() projectId?: string | null;
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep1bRequest>();
  @Output() dataChange      = new EventEmitter<ContractStep1bRequest>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  private fb            = inject(FormBuilder);
  private supervisorSvc = inject(SupervisorService);

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
    entity:                [''],
    job_title:             [''],
    phone:                 [''],
    email:                 [''],
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
    this.supervisorSvc.getList().subscribe({
      next: (res) => {
        this.supervisors.set(res.users);
        this.affiliates.set(res.affiliates);
        const pid = this.form.get('counterpart_supervisor')?.value;
        const cid = this.form.get('ally_supervisor')?.value;
        if (pid) this.selectedPrincipal.set(res.users.find(u => u.id === pid) ?? null);
        if (cid) this.selectedCustomer.set(res.affiliates.find(a => a.id === cid) ?? null);
        this.loadingSupervisors.set(false);
      },
      error: () => this.loadingSupervisors.set(false),
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
    this.customerDropdownOpen.update(v => !v);
    this.principalDropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event.target'])
  onDocClick(target: HTMLElement): void {
    if (!target.closest('[data-supervisor-dropdown]')) {
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
    this.supervisorSvc.createUser({
      first_name:               v.first_name!,
      first_surname:            v.first_surname!,
      second_surname:           v.second_surname!,
      document_type:            v.document_type! as SupervisorDocumentType,
      identity_document_number: v.identity_document_number!,
      birthdate:                v.birthdate!,
      email:                    v.email!,
      phone:                    v.phone!,
      password:                 v.password!,
      role:                     'SUPERVISOR',
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
    this.customerForm.markAllAsTouched();
    if (this.customerForm.invalid || !this.projectId) return;
    this.savingCustomer.set(true);
    this.customerError.set(null);
    const v = this.customerForm.getRawValue();
    this.supervisorSvc.createAffiliate(this.projectId, {
      is_beneficiary:        false,
      first_name:            v.first_name!,
      first_surname:         v.first_surname!,
      second_surname:        v.second_surname!,
      type_identification:   v.type_identification!,
      identification_number: v.identification_number!,
      middle_name:           v.middle_name   || null,
      entity:                v.entity        || null,
      job_title:             v.job_title     || null,
      phone:                 v.phone         || null,
      email:                 v.email         || null,
      department:            v.department    || null,
      municipality:          v.municipality  || null,
    }).subscribe({
      next: (res: CreateAffiliateResponse) => {
        const aff: AffiliateUser = {
          id:                    res.id,
          full_name:             `${res.first_name} ${res.first_surname}`,
          type_identification:   res.type_identification,
          identification_number: res.identification_number,
        };
        this.affiliates.update(list => [...list, aff]);
        this.selectCustomer(aff);
        this.showCustomerModal.set(false);
        this.savingCustomer.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.customerError.set(err?.error?.message ?? 'Error al crear el supervisor.');
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
}
