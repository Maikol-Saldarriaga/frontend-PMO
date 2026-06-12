import { Component, Input, Output, EventEmitter, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractStep9Request, ContractIndicatorItem, WizardIndicator } from '../../../../models/contract.model';

interface IndicatorRow {
  id?:          string;
  component_id: string;
  type:         string;
  name:         string;
  line:         string;
  goal:         string;
  medium:       string;
}

const EMPTY = (): IndicatorRow => ({ component_id: '', type: 'producto', name: '', line: '', goal: '', medium: '' });

export const INDICATOR_TYPES = [
  { value: 'producto',  label: 'Producto'  },
  { value: 'resultado', label: 'Resultado' },
  { value: 'impacto',   label: 'Impacto'   },
];

@Component({
  selector: 'app-step9-indicators',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step9-indicators.component.html',
})
export class Step9IndicatorsComponent {
  @Input() set savedData(val: WizardIndicator[] | undefined) {
    if (!val?.length) return;
    this.rows.set(val.map(v => ({
      id:           v.id,
      component_id: v.component_id,
      type:         v.type  ?? 'producto',
      name:         v.name  ?? '',
      line:         v.line  ?? '',
      goal:         v.goal  ?? '',
      medium:       v.medium ?? '',
    })));
  }
  // Components list loaded from step8 to get component_id → name mapping
  @Input() components: { id: string; name: string }[] = [];
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep9Request>();
  @Output() dataChange      = new EventEmitter<ContractStep9Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  readonly indicatorTypes = INDICATOR_TYPES;
  rows: WritableSignal<IndicatorRow[]> = signal([EMPTY()]);

  addRow(): void             { this.rows.update(r => [...r, EMPTY()]); }
  removeRow(i: number): void { this.rows.update(r => r.filter((_, idx) => idx !== i)); }

  update(i: number, field: keyof IndicatorRow, v: string): void {
    this.rows.update(rows => rows.map((row, idx) => idx === i ? { ...row, [field]: v } : row));
    this.dataChange.emit(this.buildPayload());
  }

  private buildPayload(): ContractStep9Request {
    return {
      indicators: this.rows().map(r => ({
        ...(r.id ? { id: r.id } : {}),
        component_id: r.component_id,
        type:         r.type  || null,
        name:         r.name  || null,
        line:         r.line  || null,
        goal:         r.goal  || null,
        medium:       r.medium || null,
      } as ContractIndicatorItem)),
    };
  }

  onSubmit(): void {
    const invalid: string[] = [];
    this.rows().forEach((r, i) => {
      if (!r.component_id) invalid.push(`Indicador ${i + 1}: Componente`);
      if (!r.name.trim())  invalid.push(`Indicador ${i + 1}: Nombre`);
    });
    if (invalid.length) { this.validationError.emit(invalid); return; }
    this.submitted.emit(this.buildPayload());
  }
}
