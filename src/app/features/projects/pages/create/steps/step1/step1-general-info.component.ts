import {
  Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, signal, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProjectStep1Request } from '../../../../models/project.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';

/**
 * Meses "de calendario real" entre dos fechas: cuenta meses completos comparando el día del
 * mes (no una aproximación de días/30, que sobreestima en los meses de 31 días — p.ej. 1 mayo
 * a 1 agosto son exactamente 3 meses, pero 92 días / 30 redondea a 4), y suma 1 más si queda un
 * tramo de días sin completar un mes adicional. Usa los accesores UTC porque <input type="date">
 * entrega "YYYY-MM-DD", que Date interpreta en UTC; leerlo con getMonth()/getDate() (hora local)
 * puede correr la fecha un día según la zona horaria del navegador.
 */
function monthsBetweenDates(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  months = Math.max(months, 0);

  const fullMonthsEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  if (end.getTime() > fullMonthsEnd.getTime()) months += 1;
  return months;
}

@Component({
  selector: 'app-step1-general-info',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MoneyMaskDirective],
  templateUrl: './step1-general-info.component.html',
})
export class Step1GeneralInfoComponent implements OnInit, OnChanges {
  @Input() savedData?: ProjectStep1Request;
  @Input() projectId?: string | null;
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ProjectStep1Request>();
  @Output() dataChange      = new EventEmitter<ProjectStep1Request>();
  @Output() validationError = new EventEmitter<string[]>();

  private readonly fieldLabels: Record<string, string> = {
    project_number:     'Número de proyecto',
    social_reason:      'Razón social',
    type:               'Tipo de proyecto',
    start_date:         'Fecha de inicio del contrato',
    end_date:           'Fecha de fin del contrato',
    objective:          'Objeto',
    total_budget:       'Presupuesto total',
    ext_number:         'Número de extensión',
    ext_date:           'Fecha de extensión',
    antecedent:         'Antecedente',
    worker_order:       'N° Orden de trabajo',
    service_start_date: 'Fecha de inicio del servicio',
    service_end_date:   'Fecha de fin del servicio',
  };

  private fb = inject(FormBuilder);

  readonly projectTypes = ['contrato', 'convenio'];

  showExtensionFields  = signal(false);
  showWorkerOrder      = signal(false);
  durationMonths       = signal(0);
  serviceDurationDays  = signal(0);

  form = this.fb.group({
    project_number:     ['', Validators.required],
    social_reason:      ['', Validators.required],
    type:               ['contrato', Validators.required],
    start_date:         ['', Validators.required],
    end_date:           ['', Validators.required],
    duration_days:      [{ value: 0, disabled: true }],
    objective:          ['', [Validators.required, Validators.minLength(10)]],
    total_budget:       [null as number | null, [Validators.required, Validators.min(0)]],
    has_worker_order:   [false],
    worker_order:       [''],
    project_code:       [''],
    project_name:       [''],
    service_start_date: ['', Validators.required],
    service_end_date:   ['', Validators.required],
    service_duration:   [{ value: 0, disabled: true }],
    other_type_if:      [false],
    ext_number:         [''],
    ext_date:           [''],
    ext_duration:       [null as number | null],
    antecedent:         [''],
  });

  ngOnInit(): void {
    if (this.savedData) this.patchForm(this.savedData);

    this.form.get('start_date')?.valueChanges.subscribe(() => this.calculateDuration());
    this.form.get('end_date')?.valueChanges.subscribe(() => this.calculateDuration());
    this.form.get('service_start_date')?.valueChanges.subscribe(() => this.calculateServiceDuration());
    this.form.get('service_end_date')?.valueChanges.subscribe(() => this.calculateServiceDuration());

    this.form.get('has_worker_order')?.valueChanges.subscribe(val => {
      this.showWorkerOrder.set(!!val);
      this.applyWorkerOrderValidator(!!val);
      if (!val) {
        this.form.patchValue({ worker_order: '', project_code: '' }, { emitEvent: false });
        ['worker_order', 'project_code'].forEach(f => {
          this.form.get(f)?.markAsUntouched();
          this.form.get(f)?.markAsPristine();
        });
      }
    });

    this.form.get('other_type_if')?.valueChanges.subscribe(val => {
      this.showExtensionFields.set(!!val);
      this.applyExtensionValidators(!!val);
      if (!val) {
        this.form.patchValue({ ext_number: '', ext_date: '', ext_duration: null }, { emitEvent: false });
      }
    });

    this.form.valueChanges.subscribe(() => this.dataChange.emit(this.buildPayload()));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['savedData'] && !changes['savedData'].firstChange && this.savedData) {
      this.patchForm(this.savedData);
    }
  }

  private patchForm(data: ProjectStep1Request): void {
    this.form.patchValue({
      ...data,
      start_date:         data.start_date?.split('T')[0]         ?? '',
      end_date:           data.end_date?.split('T')[0]           ?? '',
      service_start_date: data.service_start_date?.split('T')[0] ?? '',
      service_end_date:   data.service_end_date?.split('T')[0]   ?? '',
      ext_date:           data.ext_date?.split('T')[0]           ?? '',
    });
    this.showExtensionFields.set(data.other_type_if);
    this.showWorkerOrder.set(data.has_worker_order);
    if (data.other_type_if)    this.applyExtensionValidators(true);
    if (data.has_worker_order) this.applyWorkerOrderValidator(true);
    if (data.start_date && data.end_date) {
      this.durationMonths.set(monthsBetweenDates(new Date(data.start_date), new Date(data.end_date)));
    } else if (data.duration_days) {
      this.durationMonths.set(Math.ceil(data.duration_days / 30));
    }
    if (data.service_duration) this.serviceDurationDays.set(data.service_duration);
  }

  private calculateDuration(): void {
    const start = this.form.get('start_date')?.value;
    const end   = this.form.get('end_date')?.value;
    if (start && end) {
      const startDate = new Date(start);
      const endDate   = new Date(end);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
      const validDays = days > 0 ? days : 0;
      this.form.get('duration_days')?.setValue(validDays);
      this.durationMonths.set(monthsBetweenDates(startDate, endDate));
    }
  }

  private calculateServiceDuration(): void {
    const start = this.form.get('service_start_date')?.value;
    const end   = this.form.get('service_end_date')?.value;
    if (start && end) {
      const days = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
      const validDays = days > 0 ? days : 0;
      this.form.get('service_duration')?.setValue(validDays);
      this.serviceDurationDays.set(validDays);
    }
  }

  private applyWorkerOrderValidator(active: boolean): void {
    const ctrl = this.form.get('worker_order');
    if (active) {
      ctrl?.setValidators(Validators.required);
    } else {
      ctrl?.clearValidators();
      ctrl?.markAsUntouched();
      ctrl?.markAsPristine();
    }
    ctrl?.updateValueAndValidity({ emitEvent: false });
  }

  private applyExtensionValidators(active: boolean): void {
    ['ext_number', 'ext_date', 'ext_duration'].forEach(f => {
      const ctrl = this.form.get(f);
      if (active) {
        if (f !== 'ext_duration') ctrl?.setValidators(Validators.required);
      } else {
        ctrl?.clearValidators();
        ctrl?.markAsUntouched();
        ctrl?.markAsPristine();
      }
      ctrl?.updateValueAndValidity({ emitEvent: false });
    });
  }

  private buildPayload(): ProjectStep1Request {
    const v = this.form.getRawValue();
    const payload: ProjectStep1Request = {
      project_number: v.project_number ?? '',
      social_reason:  v.social_reason  ?? '',
      type:           v.type           ?? 'contrato',
      start_date:     v.start_date ? `${v.start_date}T00:00:00Z` : '',
      end_date:       v.end_date   ? `${v.end_date}T00:00:00Z`   : '',
      duration_days:  v.duration_days  ?? 0,
      objective:      v.objective      ?? '',
      total_budget:   v.total_budget   ?? 0,
      has_worker_order:   v.has_worker_order   ?? false,
      other_type_if:      v.other_type_if      ?? false,
      antecedent:         v.antecedent         ?? '',
      project_name:       v.project_name       ?? '',
      project_code:       v.project_code       ?? '',
      service_start_date: v.service_start_date ? `${v.service_start_date}T00:00:00Z` : '',
      service_end_date:   v.service_end_date   ? `${v.service_end_date}T00:00:00Z`   : '',
      service_duration:   (v.service_duration as number | null) ?? 0,
    };

    if (v.has_worker_order) {
      payload.worker_order = v.worker_order ?? '';
    }
    if (v.other_type_if) {
      payload.ext_number   = v.ext_number   ?? '';
      payload.ext_date     = v.ext_date ? `${v.ext_date}T00:00:00Z` : '';
      payload.ext_duration = v.ext_duration ?? undefined;
    }
    return payload;
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const missing = Object.entries(this.form.controls)
        .filter(([, ctrl]) => ctrl.invalid)
        .map(([key]) => this.fieldLabels[key] ?? key);
      this.validationError.emit(missing);
      return;
    }
    this.submitted.emit(this.buildPayload());
  }
}
