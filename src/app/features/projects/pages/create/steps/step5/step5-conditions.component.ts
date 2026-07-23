import { Component, Input, Output, EventEmitter, signal, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractStep5Request, ContractConditionItem, WizardCondition, SupportResponse } from '../../../../models/contract.model';
import { renameFileForUpload } from '../../../../../../../core/utils/file.utils';
import { ContractService } from '../../../../services/contract.service';
import { SupportTypeKey, SUPPORT_TYPES, SUPPORT_TYPE_LABELS } from '../../../../models/support-types.constant';

type ConditionType  = 'requisito_minimo' | 'supuesto' | 'exclusion' | 'restriccion';
type ComplianceType = 'fecha_especifica' | 'hito_proyecto' | 'periodicidad' | 'permanente';

interface PendingUpload {
  support_type: SupportTypeKey | '';
  name:         string;
  files:        File[];
}

export interface PendingConditionUpload {
  rowIndex:     number;
  support_type: SupportTypeKey;
  name:         string;
  files:        File[];
}

export interface Step5SubmitPayload {
  request: ContractStep5Request;
  uploads: PendingConditionUpload[];
}

interface ConditionRow {
  id?:              string;
  condition:        ConditionType;
  type_compliance:  ComplianceType;
  compliance_value: string;
  description:      string;
  hasSupports:      boolean;
  supports:         SupportResponse[];
  upload:           PendingUpload;
}

const CONDITION_TYPES: { value: ConditionType; label: string; description: string }[] = [
  {
    value: 'requisito_minimo',
    label: 'Requisito Mínimo',
    description: 'Condición o capacidad que debe estar presente en un producto, servicio o resultado para satisfacer una necesidad de negocio.',
  },
  {
    value: 'supuesto',
    label: 'Supuesto',
    description: 'Condición o compromiso que se le promete al proyecto y se considera verdadera, real o cierta, sin prueba ni demostración.',
  },
  {
    value: 'restriccion',
    label: 'Restricción',
    description: 'Factor limitante que afecta la ejecución de un proyecto, programa, portafolio o proceso.',
  },
  {
    value: 'exclusion',
    label: 'Exclusión',
    description: 'Identifica lo que está excluido del proyecto. Establece explícitamente lo que está fuera del alcance del proyecto o de un producto, resultado o servicio.',
  },
];

const COMPLIANCE_TYPES: { value: ComplianceType; label: string }[] = [
  { value: 'fecha_especifica', label: 'Fecha específica' },
  { value: 'hito_proyecto',    label: 'Hito del proyecto' },
  { value: 'periodicidad',     label: 'Periodicidad' },
  { value: 'permanente',       label: 'Permanente' },
];

const HITOS: { value: string; label: string }[] = [
  { value: 'formulacion', label: 'En Etapa de Formulación' },
  { value: 'evaluacion',  label: 'En Etapa de Evaluación' },
  { value: 'asignacion',  label: 'En Etapa de Asignación' },
  { value: 'ejecucion',   label: 'En Etapa de Ejecución' },
  { value: 'cierre',      label: 'En Etapa de Cierre' },
];

const PERIODICIDADES: { value: string; label: string }[] = [
  { value: 'mensual',     label: 'Mensual' },
  { value: 'trimestral',  label: 'Trimestral' },
  { value: 'semestral',   label: 'Semestral' },
  { value: 'anual',       label: 'Anual' },
];

const emptyUpload = (): PendingUpload => ({
  support_type: '', name: '', files: [],
});

const EMPTY = (): ConditionRow => ({
  condition: 'requisito_minimo', type_compliance: 'fecha_especifica',
  compliance_value: '', description: '',
  hasSupports: false, supports: [], upload: emptyUpload(),
});

@Component({
  selector: 'app-step5-conditions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step5-conditions.component.html',
})
export class Step5ConditionsComponent {
  @Input() projectId = '';
  @Input() serviceId = '';
  @Input() set savedData(val: WizardCondition[] | undefined) {
    if (!val?.length) return;
    this.rows.set(val.map(v => {
      const type_compliance = (v.type_compliance as ComplianceType) ?? 'fecha_especifica';
      // <input type="date"> solo acepta "YYYY-MM-DD"; el backend puede devolver la fecha con hora/zona.
      const compliance_value = type_compliance === 'fecha_especifica'
        ? (v.compliance_value?.split('T')[0] ?? '')
        : (v.compliance_value ?? '');
      return {
        id:               v.id,
        condition:        (v.condition as ConditionType) ?? 'requisito_minimo',
        type_compliance,
        compliance_value,
        description:      v.description ?? '',
        hasSupports:      !!(v.supports?.length),
        supports:         v.supports ?? [],
        upload:           emptyUpload(),
      };
    }));
  }
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<Step5SubmitPayload>();
  @Output() dataChange      = new EventEmitter<ContractStep5Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  private contractSvc = inject(ContractService);

  readonly conditionTypes    = CONDITION_TYPES;
  readonly complianceTypes   = COMPLIANCE_TYPES;
  readonly hitos             = HITOS;
  readonly periodicidades    = PERIODICIDADES;
  readonly supportTypeKeys   = Object.keys(SUPPORT_TYPES) as SupportTypeKey[];
  readonly supportTypeLabels = SUPPORT_TYPE_LABELS;
  readonly supportTypes      = SUPPORT_TYPES;

  rows: WritableSignal<ConditionRow[]> = signal([EMPTY()]);

  addRow(): void             { this.rows.update(r => [...r, EMPTY()]); }
  removeRow(i: number): void { this.rows.update(r => r.filter((_, idx) => idx !== i)); }

  updateField(i: number, field: keyof ConditionRow, value: string | number | boolean): void {
    this.rows.update(rows => rows.map((row, idx) => {
      if (idx !== i) return row;
      const updated = { ...row, [field]: value };
      if (field === 'type_compliance') updated.compliance_value = '';
      return updated;
    }));
    if (field !== 'hasSupports') this.dataChange.emit(this.buildPayload());
  }

  updateUploadField(i: number, field: keyof PendingUpload, value: string): void {
    this.rows.update(rows => rows.map((row, idx) => {
      if (idx !== i) return row;
      const upload = { ...row.upload, [field]: value };
      if (field === 'support_type') upload.name = '';
      return { ...row, upload };
    }));
  }

  onFilesSelected(i: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.canSelectFiles(this.rows()[i])) { input.value = ''; return; }
    const files = Array.from(input.files ?? []);
    this.rows.update(rows => rows.map((row, idx) =>
      idx === i ? { ...row, upload: { ...row.upload, files } } : row
    ));
  }

  removeFile(rowIdx: number, fileIdx: number): void {
    this.rows.update(rows => rows.map((row, idx) => {
      if (idx !== rowIdx) return row;
      const files = row.upload.files.filter((_, fi) => fi !== fileIdx);
      return { ...row, upload: { ...row.upload, files } };
    }));
  }

  getSupportNames(i: number): string[] {
    const key = this.rows()[i].upload.support_type as SupportTypeKey;
    return key ? SUPPORT_TYPES[key] : [];
  }

  canSelectFiles(row: ConditionRow): boolean {
    return !!(row.upload.support_type && row.upload.name);
  }

  previewFileName(i: number, fi: number): string {
    const row = this.rows()[i];
    return renameFileForUpload(row.upload.files[fi], row.upload.name, fi, row.upload.files.length).name;
  }

  deleteSupport(rowIdx: number, support: SupportResponse): void {
    if (!this.projectId || !this.serviceId) return;
    this.contractSvc.deleteSupport(this.projectId, this.serviceId, support.id).subscribe({
      next: () => {
        this.rows.update(rows => rows.map((r, idx) =>
          idx === rowIdx
            ? { ...r, supports: r.supports.filter(s => s.id !== support.id) }
            : r
        ));
      },
    });
  }

  private buildPayload(): ContractStep5Request {
    return {
      conditions: this.rows().map(r => ({
        ...(r.id ? { id: r.id } : {}),
        condition:        r.condition,
        type_compliance:  r.type_compliance,
        compliance_value: this.formatComplianceValue(r),
        description:      r.description || null,
      } as ContractConditionItem)),
    };
  }

  private formatComplianceValue(r: ConditionRow): string | null {
    if (r.type_compliance === 'permanente') return null;
    // El backend valida compliance_value como "YYYY-MM-DD" puro para fecha_especifica (sin hora/zona).
    return r.compliance_value || null;
  }

  onSubmit(): void {
    const uploads: PendingConditionUpload[] = this.rows()
      .map((r, rowIndex) => ({
        rowIndex,
        support_type: r.upload.support_type as SupportTypeKey,
        name:         r.upload.name,
        files:        r.upload.files,
      }))
      .filter(u => u.support_type && u.name && u.files.length > 0);
    this.submitted.emit({ request: this.buildPayload(), uploads });
  }

  conditionDescription(value: string): string {
    return CONDITION_TYPES.find(t => t.value === value)?.description ?? '';
  }

  supportLabel(key: string): string {
    return SUPPORT_TYPE_LABELS[key as SupportTypeKey] ?? key;
  }

  fileName(file: File): string { return file.name; }
  fileSize(file: File): string {
    const kb = file.size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  }
}
