import { Component, Input, OnInit, signal, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractService } from '../../../../services/contract.service';
import { ContractConditionItem, WizardCondition, SupportResponse } from '../../../../models/contract.model';
import { renameFileForUpload } from '../../../../../../../core/utils/file.utils';
import { SupportTypeKey, SUPPORT_TYPES, SUPPORT_TYPE_LABELS } from '../../../../models/support-types.constant';

type ConditionType  = 'requisito_minimo' | 'supuesto' | 'exclusion' | 'restriccion';
type ComplianceType = 'fecha_especifica' | 'hito_proyecto' | 'periodicidad' | 'permanente';

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
  deleting:         boolean;
}

const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'requisito_minimo', label: 'Requisito Mínimo' },
  { value: 'supuesto',         label: 'Supuesto'         },
  { value: 'exclusion',        label: 'Exclusión'        },
  { value: 'restriccion',      label: 'Restricción'      },
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
  support_type: '', name: '', files: [], uploading: false, error: null,
});

const EMPTY = (): ConditionRow => ({
  condition: 'requisito_minimo', type_compliance: 'fecha_especifica',
  compliance_value: '', description: '',
  hasSupports: false, supports: [], upload: emptyUpload(), deleting: false,
});

@Component({
  selector: 'app-tab-condiciones',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-condiciones.component.html',
})
export class TabCondicionesComponent implements OnInit {
  @Input() projectId!: string;

  private contractSvc = inject(ContractService);

  serviceId = '';

  loading     = signal(true);
  error       = signal<string | null>(null);
  saving      = signal(false);
  saveError   = signal<string | null>(null);
  saveSuccess = signal(false);

  readonly conditionTypes    = CONDITION_TYPES;
  readonly complianceTypes   = COMPLIANCE_TYPES;
  readonly hitos             = HITOS;
  readonly periodicidades    = PERIODICIDADES;
  readonly supportTypeKeys   = Object.keys(SUPPORT_TYPES) as SupportTypeKey[];
  readonly supportTypeLabels = SUPPORT_TYPE_LABELS;
  readonly supportTypes      = SUPPORT_TYPES;

  rows: WritableSignal<ConditionRow[]> = signal([]);

  ngOnInit(): void {
    this.contractSvc.getWizard(this.projectId).subscribe({
      next: wizard => {
        this.serviceId = wizard.step1?.service?.id ?? '';
        const conditions = wizard.step4?.conditions ?? [];
        this.rows.set(
          conditions.length
            ? conditions.map(v => this.toRow(v))
            : [EMPTY()]
        );
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las condiciones del proyecto.');
        this.loading.set(false);
      },
    });
  }

  private toRow(v: WizardCondition): ConditionRow {
    return {
      id:               v.id,
      condition:        (v.condition as ConditionType) ?? 'requisito_minimo',
      type_compliance:  (v.type_compliance as ComplianceType) ?? 'fecha_especifica',
      compliance_value: v.compliance_value ?? '',
      description:      v.description ?? '',
      hasSupports:      !!(v.supports?.length),
      supports:         v.supports ?? [],
      upload:           emptyUpload(),
      deleting:         false,
    };
  }

  addRow(): void { this.rows.update(r => [...r, EMPTY()]); }

  removeRow(i: number): void {
    const row = this.rows()[i];
    this.saveError.set(null);

    if (!row.id) {
      this.rows.update(r => r.filter((_, idx) => idx !== i));
      return;
    }

    this.rows.update(rows => rows.map((r, idx) => idx === i ? { ...r, deleting: true } : r));

    const payload = {
      conditions: this.rows().map(r => ({
        ...(r.id ? { id: r.id } : {}),
        condition:        r.condition,
        type_compliance:  r.type_compliance,
        compliance_value: r.type_compliance === 'permanente' ? null : (r.compliance_value || null),
        description:      r.description || null,
        ...(r.id === row.id ? { delete: true } : {}),
      } as ContractConditionItem)),
    };

    this.contractSvc.updateStep5(this.projectId, payload).subscribe({
      next: () => {
        this.rows.update(rows => rows.filter((_, idx) => idx !== i));
      },
      error: err => {
        this.rows.update(rows => rows.map((r, idx) => idx === i ? { ...r, deleting: false } : r));
        this.saveError.set(err?.error?.message ?? 'No se pudo eliminar la condición en el servidor.');
      },
    });
  }

  updateField(i: number, field: keyof ConditionRow, value: string | number | boolean): void {
    this.rows.update(rows => rows.map((row, idx) => {
      if (idx !== i) return row;
      const updated = { ...row, [field]: value };
      if (field === 'type_compliance') updated.compliance_value = '';
      return updated;
    }));
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

  canSelectFiles(row: ConditionRow): boolean {
    return !!(row.upload.support_type && row.upload.name);
  }

  canUpload(row: ConditionRow): boolean {
    return !!(row.id && row.upload.support_type && row.upload.name && row.upload.files.length > 0);
  }

  previewFileName(i: number, fi: number): string {
    const row = this.rows()[i];
    return renameFileForUpload(row.upload.files[fi], row.upload.name, fi, row.upload.files.length).name;
  }

  uploadSupports(i: number): void {
    const row = this.rows()[i];
    if (!this.canUpload(row) || !this.projectId || !this.serviceId) return;

    this.rows.update(rows => rows.map((r, idx) =>
      idx === i ? { ...r, upload: { ...r.upload, uploading: true, error: null } } : r
    ));

    const uploads = row.upload.files.map((file, idx) => {
      const fd = new FormData();
      fd.append('file', renameFileForUpload(file, row.upload.name, idx, row.upload.files.length));
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

  save(): void {
    this.saveSuccess.set(false);
    this.saveError.set(null);
    this.saving.set(true);

    const payload = {
      conditions: this.rows().map(r => ({
        ...(r.id ? { id: r.id } : {}),
        condition:        r.condition,
        type_compliance:  r.type_compliance,
        compliance_value: r.type_compliance === 'permanente' ? null : (r.compliance_value || null),
        description:      r.description || null,
      } as ContractConditionItem)),
    };

    this.contractSvc.updateStep5(this.projectId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.saveSuccess.set(true);
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'No se pudieron guardar las condiciones.');
      },
    });
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
