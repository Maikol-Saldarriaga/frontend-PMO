import { Component, Input, Output, EventEmitter, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ContractStep10Request, ContractGuaranteeItem, GuaranteeType, WizardGuarantee,
} from '../../../../models/contract.model';

interface GuaranteeRow {
  id?:         string | null;
  type:        GuaranteeType;
  description: string;
  percentage:  number | null;
  duration:    number | null;
}

const EMPTY = (): GuaranteeRow => ({
  type: 'cumplimiento_de_contrato', description: '', percentage: null, duration: null,
});

export const GUARANTEE_TYPES: { value: GuaranteeType; label: string }[] = [
  { value: 'cumplimiento_de_contrato',                                          label: 'Cumplimiento de contrato'                                       },
  { value: 'calidad_del_servicio',                                              label: 'Calidad del servicio'                                           },
  { value: 'buen_manejo_y_correcta_inversion_del_anticipo',                    label: 'Buen manejo y correcta inversión del anticipo'                  },
  { value: 'estabilidad_y_calidad_de_la_obra',                                 label: 'Estabilidad y calidad de la obra'                               },
  { value: 'salarios_prestaciones_sociales_e_indemnizaciones',                 label: 'Salarios, prestaciones sociales e indemnizaciones'              },
  { value: 'responsabilidad_civil_extracontextual',                             label: 'Responsabilidad civil extracontractual'                         },
  { value: 'calidad_y_correcto_funcionamiento_de_los_bienes_y_equipo_suministrado', label: 'Calidad y correcto funcionamiento de bienes y equipos'    },
  { value: 'seriedad_de_la_oferta',                                            label: 'Seriedad de la oferta'                                          },
  { value: 'pago_anticipado',                                                  label: 'Pago anticipado'                                               },
];

@Component({
  selector: 'app-step10-guarantees',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step10-guarantees.component.html',
})
export class Step10GuaranteesComponent {
  @Input() set savedData(val: WizardGuarantee[] | undefined) {
    if (!val?.length) return;
    this.rows.set(val.map(v => ({
      id:          v.id,
      type:        v.type,
      description: v.description ?? '',
      percentage:  v.percentage,
      duration:    v.duration,
    })));
  }

  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep10Request>();
  @Output() dataChange      = new EventEmitter<ContractStep10Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  readonly guaranteeTypes = GUARANTEE_TYPES;
  rows: WritableSignal<GuaranteeRow[]> = signal([EMPTY()]);

  addRow(): void             { this.rows.update(r => [...r, EMPTY()]); }
  removeRow(i: number): void { this.rows.update(r => r.filter((_, idx) => idx !== i)); this.dataChange.emit(this.buildPayload()); }

  update(i: number, field: keyof GuaranteeRow, value: string | number | null): void {
    this.rows.update(rows => rows.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
    this.dataChange.emit(this.buildPayload());
  }

  private buildPayload(): ContractStep10Request {
    return {
      guarantees: this.rows().map(r => ({
        ...(r.id ? { id: r.id } : {}),
        type:        r.type,
        description: r.description || null,
        percentage:  r.percentage,
        duration:    r.duration,
      } as ContractGuaranteeItem)),
    };
  }

  onSubmit(): void {
    const invalid: string[] = [];
    this.rows().forEach((r, i) => {
      if (!r.type) invalid.push(`Garantía ${i + 1}: Tipo de garantía`);
    });
    if (invalid.length) { this.validationError.emit(invalid); return; }
    this.submitted.emit(this.buildPayload());
  }
}
