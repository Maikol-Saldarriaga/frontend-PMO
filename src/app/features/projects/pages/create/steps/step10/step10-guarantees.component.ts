import { Component, Input, Output, EventEmitter, signal, computed, WritableSignal, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ContractStep10Request, ContractGuaranteeItem, GuaranteeType, WizardGuarantee,
} from '../../../../models/contract.model';

interface GuaranteeRow {
  id?:              string | null;
  type:             GuaranteeType;
  description:      string;
  percentage:       number | null;
  extensionMonths:  number | null;
}

const EMPTY = (): GuaranteeRow => ({
  type: 'cumplimiento_de_contrato', description: '', percentage: null, extensionMonths: null,
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
  // Vigencia del contrato = fecha inicio del contrato a fecha fin (o fecha de extensión si el
  // contrato la tiene). Se recibe del Paso 1 y sirve de base para calcular la duración de
  // cada póliza: vigencia (meses) + extensión (meses) que el usuario añada para esa garantía.
  private _contractStartDate = signal<string | null>(null);
  private _contractEndDate   = signal<string | null>(null);
  private _hasExtension      = signal(false);
  private _extDate           = signal<string | null>(null);

  @Input() set contractStartDate(v: string | null | undefined) { this._contractStartDate.set(v ?? null); }
  @Input() set contractEndDate(v: string | null | undefined)   { this._contractEndDate.set(v ?? null); }
  @Input() set hasExtension(v: boolean | undefined)            { this._hasExtension.set(!!v); }
  @Input() set extDate(v: string | null | undefined)           { this._extDate.set(v ?? null); }

  readonly effectiveEndDate: Signal<string | null> = computed(() =>
    (this._hasExtension() && this._extDate()) ? this._extDate() : this._contractEndDate());

  readonly vigenciaMonths: Signal<number> = computed(() => {
    const start = this._contractStartDate();
    const end   = this.effectiveEndDate();
    if (!start || !end) return 0;
    return Step10GuaranteesComponent.monthsBetween(start, end);
  });

  readonly vigenciaLabel: Signal<string> = computed(() => {
    const start = this._contractStartDate();
    const end   = this.effectiveEndDate();
    if (!start || !end) return 'Sin definir (completa las fechas en el Paso 1)';
    return `${this.fmtDate(start)} — ${this.fmtDate(end)}`;
  });

  private static monthsBetween(startISO: string, endISO: string): number {
    const start = new Date(startISO);
    const end   = new Date(endISO);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    return Math.max(0, months);
  }

  private fmtDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  durationTotal(i: number): number {
    const row = this.rows()[i];
    return this.vigenciaMonths() + (row?.extensionMonths ?? 0);
  }

  private savedDataLoaded = false;
  // El padre reenvía este mismo dato tras cada (dataChange) emitido por este componente;
  // sin esta guarda, cada tecleo reescribe rows entero y borra lo que el usuario escribe.
  // `duration` que llega del backend es el total (vigencia + extensión); al cargar se le
  // resta la vigencia ya calculada para recuperar solo la extensión que el usuario tecleó.
  @Input() set savedData(val: WizardGuarantee[] | undefined) {
    if (this.savedDataLoaded || !val?.length) return;
    this.savedDataLoaded = true;
    const vigencia = this.vigenciaMonths();
    this.rows.set(val.map(v => ({
      id:              v.id,
      type:            v.type,
      description:     v.description ?? '',
      percentage:      v.percentage,
      extensionMonths: v.duration != null ? Math.max(0, v.duration - vigencia) : null,
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
      guarantees: this.rows().map((r, i) => ({
        ...(r.id ? { id: r.id } : {}),
        type:        r.type,
        description: r.description || null,
        percentage:  r.percentage,
        duration:    this.durationTotal(i),
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
