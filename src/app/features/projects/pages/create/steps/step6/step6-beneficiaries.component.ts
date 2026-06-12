import { Component, Input, Output, EventEmitter, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractStep6Request, ContractBeneficiaryItem, BeneficiaryType } from '../../../../models/contract.model';

interface BeneficiaryRow {
  id?:         string;
  beneficiary: BeneficiaryType;
  is_direct:   boolean;
  amount:      number | null;
  description: string;
}

const EMPTY = (): BeneficiaryRow => ({
  beneficiary: 'personas', is_direct: true, amount: null, description: '',
});

export const BENEFICIARY_TYPES: { value: BeneficiaryType; label: string }[] = [
  { value: 'personas',        label: 'Personas'        },
  { value: 'mujeres',         label: 'Mujeres'         },
  { value: 'hombres',         label: 'Hombres'         },
  { value: 'jovenes',         label: 'Jóvenes'         },
  { value: 'niños',           label: 'Niños'           },
  { value: 'adultos_mayores', label: 'Adultos mayores' },
  { value: 'familias',        label: 'Familias'        },
  { value: 'comunidades',     label: 'Comunidades'     },
  { value: 'organizaciones',  label: 'Organizaciones'  },
  { value: 'instituciones',   label: 'Instituciones'   },
  { value: 'otro',            label: 'Otro'            },
];

@Component({
  selector: 'app-step6-beneficiaries',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step6-beneficiaries.component.html',
})
export class Step6BeneficiariesComponent {
  @Input() set savedData(val: ContractBeneficiaryItem[] | undefined) {
    if (!val?.length) return;
    this.rows.set(val.map(v => ({
      id:          v.id,
      beneficiary: v.beneficiary,
      is_direct:   v.is_direct,
      amount:      v.amount,
      description: v.description ?? '',
    })));
  }
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep6Request>();
  @Output() dataChange      = new EventEmitter<ContractStep6Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  readonly beneficiaryTypes = BENEFICIARY_TYPES;
  rows: WritableSignal<BeneficiaryRow[]> = signal([EMPTY()]);

  addRow(): void             { this.rows.update(r => [...r, EMPTY()]); }
  removeRow(i: number): void { this.rows.update(r => r.filter((_, idx) => idx !== i)); }

  updateField(i: number, field: keyof BeneficiaryRow, value: string | boolean | number): void {
    this.rows.update(rows => rows.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
    this.dataChange.emit(this.buildPayload());
  }

  private buildPayload(): ContractStep6Request {
    return {
      beneficiaries: this.rows().map(r => ({
        ...(r.id ? { id: r.id } : {}),
        beneficiary: r.beneficiary,
        is_direct:   r.is_direct,
        amount:      r.amount ?? 0,
        description: r.description || null,
      } as ContractBeneficiaryItem)),
    };
  }

  onSubmit(): void {
    const invalid: string[] = [];
    this.rows().forEach((r, i) => {
      if (!r.amount || r.amount <= 0) invalid.push(`Beneficiario ${i + 1}: Cantidad`);
    });
    if (invalid.length) { this.validationError.emit(invalid); return; }
    this.submitted.emit(this.buildPayload());
  }
}
