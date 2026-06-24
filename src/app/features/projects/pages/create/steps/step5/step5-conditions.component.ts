import { Component, Input, Output, EventEmitter, signal, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractStep5Request, ContractConditionItem, WizardCondition, SupportResponse } from '../../../../models/contract.model';
import { ContractService } from '../../../../services/contract.service';

type ConditionType  = 'requisito_minimo' | 'supuesto' | 'exclusion' | 'restriccion';
type ComplianceType = 'Fecha específica' | 'Hito del proyecto' | 'Periodicidad' | 'Permanente';
type SupportTypeKey = 'documentos_tecnicos' | 'documentos_administrativos' | 'documentos_legales' | 'evidencias';

interface PendingUpload {
  support_type: SupportTypeKey | '';
  name:         string;
  files:        File[];
  uploading:    boolean;
  error:        string | null;
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

const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'requisito_minimo', label: 'Requisito Mínimo' },
  { value: 'supuesto',         label: 'Supuesto'         },
  { value: 'exclusion',        label: 'Exclusión'        },
  { value: 'restriccion',      label: 'Restricción'      },
];

const COMPLIANCE_TYPES: ComplianceType[] = [
  'Fecha específica', 'Hito del proyecto', 'Periodicidad', 'Permanente',
];

const HITOS = [
  'En Etapa de Formulación', 'En Etapa de Evaluación', 'En Etapa de Asignación',
  'En Etapa de Ejecución', 'En Etapa de Cierre',
];

const PERIODICIDADES = ['Mensual', 'Trimestral', 'Semestral', 'Anual'];

const SUPPORT_TYPES: Record<SupportTypeKey, string[]> = {
  documentos_tecnicos: [
    'Plan de Obra', 'POA', 'Diagnóstico ICO', 'Informe Técnico',
    'Formato de instructivo para contratación JAC. COT - INS - 001. Versión 2',
  ],
  documentos_administrativos: ['Acta', 'Memorando', 'Comunicación oficial'],
  documentos_legales: [
    'Cámara de Comercio', 'RUT', 'Certificación bancaria', 'Certificados disciplinarios',
  ],
  evidencias: ['Fotografías', 'Videos', 'Listados de asistencia'],
};

const SUPPORT_TYPE_LABELS: Record<SupportTypeKey, string> = {
  documentos_tecnicos:        'Documentos Técnicos',
  documentos_administrativos: 'Documentos Administrativos',
  documentos_legales:         'Documentos Legales',
  evidencias:                 'Evidencias',
};

const emptyUpload = (): PendingUpload => ({
  support_type: '', name: '', files: [], uploading: false, error: null,
});

const EMPTY = (): ConditionRow => ({
  condition: 'requisito_minimo', type_compliance: 'Fecha específica',
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
    this.rows.set(val.map(v => ({
      id:               v.id,
      condition:        (v.condition as ConditionType) ?? 'requisito_minimo',
      type_compliance:  (v.type_compliance as ComplianceType) ?? 'Fecha específica',
      compliance_value: v.compliance_value ?? '',
      description:      v.description ?? '',
      hasSupports:      !!(v.supports?.length),
      supports:         v.supports ?? [],
      upload:           emptyUpload(),
    })));
  }
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep5Request>();
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
    const files = Array.from(input.files ?? []);
    this.rows.update(rows => rows.map((row, idx) =>
      idx === i ? { ...row, upload: { ...row.upload, files, error: null } } : row
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

  canUpload(row: ConditionRow): boolean {
    return !!(row.id && row.upload.support_type && row.upload.name && row.upload.files.length > 0);
  }

  uploadSupports(i: number): void {
    const row = this.rows()[i];
    if (!this.canUpload(row) || !this.projectId || !this.serviceId) return;

    this.rows.update(rows => rows.map((r, idx) =>
      idx === i ? { ...r, upload: { ...r.upload, uploading: true, error: null } } : r
    ));

    const uploads = row.upload.files.map(file => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('condition_id', row.id!);
      fd.append('support_type', row.upload.support_type);
      fd.append('name', row.upload.name);
      return this.contractSvc.uploadSupport(this.projectId, this.serviceId, fd);
    });

    let completed = 0;
    const newSupports: SupportResponse[] = [];

    uploads.forEach(obs => {
      obs.subscribe({
        next: res => {
          newSupports.push(res);
          completed++;
          if (completed === uploads.length) {
            this.rows.update(rows => rows.map((r, idx) =>
              idx === i ? {
                ...r,
                supports: [...r.supports, ...newSupports],
                upload: emptyUpload(),
              } : r
            ));
          }
        },
        error: err => {
          this.rows.update(rows => rows.map((r, idx) =>
            idx === i ? {
              ...r, upload: {
                ...r.upload, uploading: false,
                error: err?.error?.message ?? 'Error al subir el archivo.',
              }
            } : r
          ));
        },
      });
    });
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
        compliance_value: r.type_compliance === 'Permanente' ? null : (r.compliance_value || null),
        description:      r.description || null,
      } as ContractConditionItem)),
    };
  }

  onSubmit(): void {
    this.submitted.emit(this.buildPayload());
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
