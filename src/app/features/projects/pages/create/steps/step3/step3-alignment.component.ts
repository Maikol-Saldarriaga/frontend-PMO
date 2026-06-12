import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ContractStep3Request } from '../../../../models/contract.model';

@Component({
  selector: 'app-step3-alignment',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './step3-alignment.component.html',
})
export class Step3AlignmentComponent {
  @Input() set savedData(val: ContractStep3Request | undefined) {
    if (val) this.form.patchValue(val);
  }
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep3Request>();
  @Output() dataChange      = new EventEmitter<ContractStep3Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  private readonly fieldLabels: Record<string, string> = {
    indicator:             'Indicador',
    course_action:         'Curso de acción',
    context_justification: 'Contexto y justificación',
  };

  private fb = new FormBuilder();

  form = this.fb.group({
    indicator:             ['', Validators.required],
    course_action:         ['', Validators.required],
    context_justification: ['', Validators.required],
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      if (this.form.valid) this.dataChange.emit(this.buildPayload());
    });
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  private buildPayload(): ContractStep3Request {
    const v = this.form.getRawValue();
    return {
      indicator:             v.indicator             ?? '',
      course_action:         v.course_action         ?? '',
      context_justification: v.context_justification ?? '',
    };
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
