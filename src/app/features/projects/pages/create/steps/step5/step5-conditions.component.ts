import { Component, Input, Output, EventEmitter, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractStep5Request, ContractConditionItem, WizardCondition } from '../../../../models/contract.model';

type ConditionType = 'requisito_minimo' | 'supuesto' | 'exclusion' | 'restriccion';

interface ConditionRow {
  id?:              string;
  condition:        ConditionType;
  fulfillment_date: string;
  number_supports:  number;
  description:      string;
}

const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'requisito_minimo', label: 'Requisito Mínimo' },
  { value: 'supuesto',         label: 'Supuesto'         },
  { value: 'exclusion',        label: 'Exclusión'        },
  { value: 'restriccion',      label: 'Restricción'      },
];

const EMPTY = (): ConditionRow => ({
  condition: 'requisito_minimo', fulfillment_date: '', number_supports: 1, description: '',
});

@Component({
  selector: 'app-step5-conditions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step5-conditions.component.html',
})
export class Step5ConditionsComponent {
  @Input() set savedData(val: WizardCondition[] | undefined) {
    if (!val?.length) return;
    this.rows.set(val.map(v => ({
      id:               v.id,
      condition:        (v.condition as ConditionType) ?? 'requisito_minimo',
      fulfillment_date: v.fulfillment_date?.split('T')[0] ?? '',
      number_supports:  v.number_supports,
      description:      v.description ?? '',
    })));
  }
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep5Request>();
  @Output() dataChange      = new EventEmitter<ContractStep5Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  readonly conditionTypes = CONDITION_TYPES;
  rows: WritableSignal<ConditionRow[]> = signal([EMPTY()]);

  addRow(): void             { this.rows.update(r => [...r, EMPTY()]); }
  removeRow(i: number): void { this.rows.update(r => r.filter((_, idx) => idx !== i)); }

  updateField(i: number, field: keyof ConditionRow, value: string | number): void {
    this.rows.update(rows => rows.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
    this.dataChange.emit(this.buildPayload());
  }

  private buildPayload(): ContractStep5Request {
    return {
      conditions: this.rows().map(r => ({
        ...(r.id ? { id: r.id } : {}),
        condition:        r.condition,
        fulfillment_date: r.fulfillment_date ? `${r.fulfillment_date}T00:00:00Z` : null,
        number_supports:  r.number_supports,
        description:      r.description || null,
      } as ContractConditionItem)),
    };
  }

  onSubmit(): void {
    this.submitted.emit(this.buildPayload());
  }
}
