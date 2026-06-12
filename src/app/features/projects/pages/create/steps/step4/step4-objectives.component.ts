import { Component, Input, Output, EventEmitter, signal, WritableSignal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProjectStep4Request, ProjectWizardObjective } from '../../../../models/project.model';

type StrList = WritableSignal<string[]>;

@Component({
  selector: 'app-step4-objectives',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './step4-objectives.component.html',
})
export class Step4ObjectivesComponent {
  @Input() set savedData(val: ProjectWizardObjective | undefined) {
    if (!val) return;
    this.form.patchValue({
      necessity:         val.necessity,
      general_objective: val.general_objective,
      goals:             val.goals,
    });
    this.causes.set(val.causes?.length        ? [...val.causes]              : ['']);
    this.consequences.set(val.consequences?.length  ? [...val.consequences]        : ['']);
    this.specificObjectives.set(val.specific_objectives?.length ? [...val.specific_objectives] : ['']);
  }
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ProjectStep4Request>();
  @Output() dataChange      = new EventEmitter<ProjectStep4Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  private readonly fieldLabels: Record<string, string> = {
    necessity:         'Necesidad / Problemática',
    general_objective: 'Objetivo general',
    goals:             'Metas',
  };

  private fb = new FormBuilder();

  form = this.fb.group({
    necessity:         ['', Validators.required],
    general_objective: ['', Validators.required],
    goals:             ['', Validators.required],
  });

  causes              = signal<string[]>(['']);
  consequences        = signal<string[]>(['']);
  specificObjectives  = signal<string[]>(['']);

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  addItem(list: StrList): void               { list.update(arr => [...arr, '']); }
  removeItem(list: StrList, i: number): void { list.update(arr => arr.filter((_, idx) => idx !== i)); }
  updateItem(list: StrList, i: number, v: string): void { list.update(arr => arr.map((x, idx) => idx === i ? v : x)); }

  private buildPayload(): ProjectStep4Request {
    const v = this.form.getRawValue();
    return {
      necessity:           v.necessity           ?? '',
      general_objective:   v.general_objective   ?? '',
      goals:               v.goals               ?? '',
      causes:              this.causes().filter(c => c.trim()),
      consequences:        this.consequences().filter(c => c.trim()),
      specific_objectives: this.specificObjectives().filter(c => c.trim()),
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
