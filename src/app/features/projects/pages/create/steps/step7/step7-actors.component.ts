import { Component, Input, Output, EventEmitter, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractStep7Request, ContractActorItem, ActorType, WizardActor } from '../../../../models/contract.model';

interface ActorRow { id?: string; name: string; type: ActorType; interest: string; resources: string; }

const EMPTY = (): ActorRow => ({ name: '', type: 'entidad_publica', interest: '', resources: '' });

export const ACTOR_TYPES: { value: ActorType; label: string }[] = [
  { value: 'entidad_publica',  label: 'Entidad pública'  },
  { value: 'entidad_privada',  label: 'Entidad privada'  },
  { value: 'ong',              label: 'ONG'              },
  { value: 'comunidad',        label: 'Comunidad'        },
  { value: 'cooperacion',      label: 'Cooperación'      },
  { value: 'otro',             label: 'Otro'             },
];

@Component({
  selector: 'app-step7-actors',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step7-actors.component.html',
})
export class Step7ActorsComponent {
  @Input() set savedData(val: WizardActor[] | undefined) {
    if (!val?.length) return;
    this.rows.set(val.map(v => ({
      id:        v.id,
      name:      v.name,
      type:      v.type as ActorType,
      interest:  v.interest  ?? '',
      resources: v.resources ?? '',
    })));
  }
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep7Request>();
  @Output() dataChange      = new EventEmitter<ContractStep7Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  readonly actorTypes = ACTOR_TYPES;
  rows: WritableSignal<ActorRow[]> = signal([EMPTY()]);

  addRow(): void             { this.rows.update(r => [...r, EMPTY()]); }
  removeRow(i: number): void { this.rows.update(r => r.filter((_, idx) => idx !== i)); }

  update(i: number, field: keyof ActorRow, v: string): void {
    this.rows.update(rows => rows.map((row, idx) => idx === i ? { ...row, [field]: v } : row));
    this.dataChange.emit(this.buildPayload());
  }

  private buildPayload(): ContractStep7Request {
    return {
      actors: this.rows().map(r => ({
        ...(r.id ? { id: r.id } : {}),
        name:      r.name,
        type:      r.type,
        interest:  r.interest  || null,
        resources: r.resources || null,
      } as ContractActorItem)),
    };
  }

  onSubmit(): void {
    const invalid: string[] = [];
    this.rows().forEach((r, i) => {
      if (!r.name.trim()) invalid.push(`Actor ${i + 1}: Nombre`);
    });
    if (invalid.length) { this.validationError.emit(invalid); return; }
    this.submitted.emit(this.buildPayload());
  }
}
