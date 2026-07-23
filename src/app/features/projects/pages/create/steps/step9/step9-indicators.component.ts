import { Component, Input, Output, EventEmitter, signal, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractStep9Request, ContractIndicatorItem, WizardIndicator } from '../../../../models/contract.model';
import { ProjectService } from '../../../../services/project.service';
import { IndicatorVerification } from '../../../../models/project.model';
import { renameFileForUpload } from '../../../../../../../core/utils/file.utils';

type VerificationTypeKey = 'documentos_tecnicos' | 'documentos_administrativos' | 'documentos_legales' | 'evidencias' | 'otros_soportes';

interface PendingUpload {
  verification_type: VerificationTypeKey | '';
  name:               string;
  files:              File[];
}

export interface PendingIndicatorUpload {
  rowIndex:           number;
  verification_type:  VerificationTypeKey;
  name:               string;
  files:              File[];
}

export interface Step9SubmitPayload {
  request: ContractStep9Request;
  uploads: PendingIndicatorUpload[];
}

interface IndicatorRow {
  id?:          string;
  component_id: string;
  type:         string;
  name:         string;
  line:         string;
  goal:         string;
  verifications: IndicatorVerification[];
  upload:        PendingUpload;
}

// Mismo catálogo que en Condiciones/Soportes — el backend reutiliza enums.SupportType.
// "otros_soportes" es la salida de texto libre: el backend (ValidateSupportName) acepta
// cualquier nombre no vacío para ese tipo en particular, a diferencia de los demás que están
// restringidos a esta lista fija.
const VERIFICATION_TYPES: Record<VerificationTypeKey, string[]> = {
  documentos_tecnicos: [
    'Plan de Obra', 'POA', 'Diagnóstico ICO', 'Informe Técnico',
    'Formato de instructivo para contratación JAC. COT - INS - 001. Versión 2',
  ],
  documentos_administrativos: ['Acta', 'Memorando', 'Comunicación oficial'],
  documentos_legales: [
    'Cámara de Comercio', 'RUT', 'Certificación bancaria', 'Certificados disciplinarios',
  ],
  evidencias: ['Fotografías', 'Videos', 'Listados de asistencia'],
  otros_soportes: [],
};

const VERIFICATION_TYPE_LABELS: Record<VerificationTypeKey, string> = {
  documentos_tecnicos:        'Documentos Técnicos',
  documentos_administrativos: 'Documentos Administrativos',
  documentos_legales:         'Documentos Legales',
  evidencias:                 'Evidencias',
  otros_soportes:             'Otro',
};

const OTHER_VERIFICATION_TYPE: VerificationTypeKey = 'otros_soportes';

const emptyUpload = (): PendingUpload => ({
  verification_type: '', name: '', files: [],
});

const EMPTY = (): IndicatorRow => ({
  component_id: '', type: 'producto', name: '', line: '', goal: '',
  verifications: [], upload: emptyUpload(),
});

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
  @Input() projectId = '';
  @Input() set savedData(val: WizardIndicator[] | undefined) {
    if (!val?.length) return;
    this.rows.set(val.map(v => ({
      id:           v.id,
      component_id: v.component_id,
      type:         v.type  ?? 'producto',
      name:         v.name  ?? '',
      line:         v.line  ?? '',
      goal:         v.goal  ?? '',
      verifications: [],
      upload:        emptyUpload(),
    })));
    this.loadVerifications();
  }
  // Components list loaded from step8 to get component_id → name mapping
  @Input() components: { id: string; name: string }[] = [];
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<Step9SubmitPayload>();
  @Output() dataChange      = new EventEmitter<ContractStep9Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();

  private projectSvc = inject(ProjectService);

  readonly indicatorTypes        = INDICATOR_TYPES;
  readonly verificationTypeKeys   = Object.keys(VERIFICATION_TYPES) as VerificationTypeKey[];
  readonly verificationTypeLabels = VERIFICATION_TYPE_LABELS;
  readonly verificationTypes      = VERIFICATION_TYPES;

  rows: WritableSignal<IndicatorRow[]> = signal([EMPTY()]);

  private loadVerifications(): void {
    this.rows().forEach((row, i) => {
      if (!row.id || !this.projectId) return;
      this.projectSvc.getIndicatorVerifications(this.projectId, row.id).subscribe({
        next: verifications => {
          this.rows.update(rows => rows.map((r, idx) => idx === i ? { ...r, verifications } : r));
        },
      });
    });
  }

  addRow(): void             { this.rows.update(r => [...r, EMPTY()]); }
  removeRow(i: number): void { this.rows.update(r => r.filter((_, idx) => idx !== i)); }

  update(i: number, field: keyof IndicatorRow, v: string): void {
    this.rows.update(rows => rows.map((row, idx) => idx === i ? { ...row, [field]: v } : row));
    this.dataChange.emit(this.buildPayload());
  }

  updateUploadField(i: number, field: keyof PendingUpload, value: string): void {
    this.rows.update(rows => rows.map((row, idx) => {
      if (idx !== i) return row;
      const upload = { ...row.upload, [field]: value };
      if (field === 'verification_type') upload.name = '';
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

  getVerificationNames(i: number): string[] {
    const key = this.rows()[i].upload.verification_type as VerificationTypeKey;
    return key ? VERIFICATION_TYPES[key] : [];
  }

  canSelectFiles(row: IndicatorRow): boolean {
    return !!(row.upload.verification_type && row.upload.name);
  }

  previewFileName(i: number, fi: number): string {
    const row = this.rows()[i];
    return renameFileForUpload(row.upload.files[fi], row.upload.name, fi, row.upload.files.length).name;
  }

  deleteVerification(rowIdx: number, v: IndicatorVerification): void {
    if (!this.projectId) return;
    this.projectSvc.deleteIndicatorVerification(this.projectId, v.indicator_id, v.id).subscribe({
      next: () => {
        this.rows.update(rows => rows.map((r, idx) =>
          idx === rowIdx
            ? { ...r, verifications: r.verifications.filter(x => x.id !== v.id) }
            : r
        ));
      },
    });
  }

  verificationLabel(key: string): string {
    return VERIFICATION_TYPE_LABELS[key as VerificationTypeKey] ?? key;
  }

  isOtherType(key: string): boolean {
    return key === OTHER_VERIFICATION_TYPE;
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

    const uploads: PendingIndicatorUpload[] = this.rows()
      .map((r, rowIndex) => ({
        rowIndex,
        verification_type: r.upload.verification_type as VerificationTypeKey,
        name:               r.upload.name,
        files:              r.upload.files,
      }))
      .filter(u => u.verification_type && u.name && u.files.length > 0);

    this.submitted.emit({ request: this.buildPayload(), uploads });
  }

  fileName(file: File): string { return file.name; }
  fileSize(file: File): string {
    const kb = file.size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  }
}
