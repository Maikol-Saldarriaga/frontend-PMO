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
  type:         string;
  name:         string;
  line:         string;
  goal:         string;
  verifications: IndicatorVerification[];
  upload:        PendingUpload;
}

interface ComponentGroup {
  component_id:  string;
  componentName: string;
  indicators:    IndicatorRow[];
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

const EMPTY_INDICATOR = (): IndicatorRow => ({
  type: 'producto', name: '', line: '', goal: '',
  verifications: [], upload: emptyUpload(),
});

// Mismo catálogo que enums.IndicatorType en el backend (indicator_type.go).
export const INDICATOR_TYPES = [
  { value: 'gestion',   label: 'Gestión'   },
  { value: 'proceso',   label: 'Proceso'   },
  { value: 'resultado', label: 'Resultado' },
  { value: 'efecto',    label: 'Efecto'    },
  { value: 'impacto',   label: 'Impacto'   },
  { value: 'producto',  label: 'Producto'  },
];

@Component({
  selector: 'app-step9-indicators',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step9-indicators.component.html',
})
export class Step9IndicatorsComponent {
  @Input() projectId = '';

  private rawIndicators: WizardIndicator[] = [];
  private savedDataLoaded = false;
  // Igual que en Alcance (step8): el padre reenvía este mismo dato tras cada (dataChange), así
  // que solo se hidrata la primera vez que llega con datos; ediciones locales posteriores no se
  // vuelven a pisar con el eco del padre.
  @Input() set savedData(val: WizardIndicator[] | undefined) {
    if (this.savedDataLoaded || !val?.length) return;
    this.savedDataLoaded = true;
    this.rawIndicators = val;
    this.syncGroups();
    this.loadVerifications();
  }

  // Los componentes ya existen (vienen de Alcance / step8) — aquí solo se agregan indicadores
  // "hijos" a cada uno. El padre reenvía un array nuevo en cada detección de cambios; syncGroups
  // preserva los indicadores ya cargados/editados de cada grupo existente.
  private _components: { id: string; name: string }[] = [];
  @Input() set components(list: { id: string; name: string }[] | undefined) {
    this._components = list ?? [];
    this.syncGroups();
  }

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

  groups: WritableSignal<ComponentGroup[]> = signal([]);

  private toRow(v: WizardIndicator): IndicatorRow {
    return {
      id:   v.id,
      type: v.type ?? 'producto',
      name: v.name ?? '',
      line: v.line ?? '',
      goal: v.goal ?? '',
      verifications: [], upload: emptyUpload(),
    };
  }

  private syncGroups(): void {
    const byComp = new Map<string, WizardIndicator[]>();
    this.rawIndicators.forEach(v => {
      const arr = byComp.get(v.component_id) ?? [];
      arr.push(v);
      byComp.set(v.component_id, arr);
    });
    const current = this.groups();
    this.groups.set(this._components.map(c => {
      const existing = current.find(g => g.component_id === c.id);
      const indicators = existing?.indicators.length
        ? existing.indicators
        : (byComp.get(c.id) ?? []).map(v => this.toRow(v));
      return { component_id: c.id, componentName: c.name, indicators };
    }));
  }

  private loadVerifications(): void {
    this.groups().forEach((g, gi) => {
      g.indicators.forEach((row, ri) => {
        if (!row.id || !this.projectId) return;
        this.projectSvc.getIndicatorVerifications(this.projectId, row.id).subscribe({
          next: verifications => {
            this.groups.update(groups => groups.map((grp, i) =>
              i === gi
                ? { ...grp, indicators: grp.indicators.map((r, j) => j === ri ? { ...r, verifications } : r) }
                : grp));
          },
        });
      });
    });
  }

  addIndicator(gi: number): void {
    this.groups.update(gs => gs.map((g, i) => i === gi ? { ...g, indicators: [...g.indicators, EMPTY_INDICATOR()] } : g));
  }

  removeIndicator(gi: number, ri: number): void {
    this.groups.update(gs => gs.map((g, i) =>
      i === gi ? { ...g, indicators: g.indicators.filter((_, j) => j !== ri) } : g));
    this.emit();
  }

  update(gi: number, ri: number, field: keyof IndicatorRow, v: string): void {
    this.groups.update(gs => gs.map((g, i) =>
      i === gi
        ? { ...g, indicators: g.indicators.map((row, j) => j === ri ? { ...row, [field]: v } : row) }
        : g));
    this.emit();
  }

  updateUploadField(gi: number, ri: number, field: keyof PendingUpload, value: string): void {
    this.groups.update(gs => gs.map((g, i) => {
      if (i !== gi) return g;
      return {
        ...g,
        indicators: g.indicators.map((row, j) => {
          if (j !== ri) return row;
          const upload = { ...row.upload, [field]: value };
          if (field === 'verification_type') upload.name = '';
          return { ...row, upload };
        }),
      };
    }));
  }

  onFilesSelected(gi: number, ri: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.canSelectFiles(this.groups()[gi].indicators[ri])) { input.value = ''; return; }
    const files = Array.from(input.files ?? []);
    this.groups.update(gs => gs.map((g, i) => {
      if (i !== gi) return g;
      return { ...g, indicators: g.indicators.map((row, j) => j === ri ? { ...row, upload: { ...row.upload, files } } : row) };
    }));
  }

  removeFile(gi: number, ri: number, fileIdx: number): void {
    this.groups.update(gs => gs.map((g, i) => {
      if (i !== gi) return g;
      return {
        ...g,
        indicators: g.indicators.map((row, j) => {
          if (j !== ri) return row;
          const files = row.upload.files.filter((_, fi) => fi !== fileIdx);
          return { ...row, upload: { ...row.upload, files } };
        }),
      };
    }));
  }

  getVerificationNames(gi: number, ri: number): string[] {
    const key = this.groups()[gi].indicators[ri].upload.verification_type as VerificationTypeKey;
    return key ? VERIFICATION_TYPES[key] : [];
  }

  canSelectFiles(row: IndicatorRow): boolean {
    return !!(row.upload.verification_type && row.upload.name);
  }

  previewFileName(gi: number, ri: number, fi: number): string {
    const row = this.groups()[gi].indicators[ri];
    return renameFileForUpload(row.upload.files[fi], row.upload.name, fi, row.upload.files.length).name;
  }

  deleteVerification(gi: number, ri: number, v: IndicatorVerification): void {
    if (!this.projectId) return;
    this.projectSvc.deleteIndicatorVerification(this.projectId, v.indicator_id, v.id).subscribe({
      next: () => {
        this.groups.update(gs => gs.map((g, i) => {
          if (i !== gi) return g;
          return {
            ...g,
            indicators: g.indicators.map((row, j) =>
              j === ri ? { ...row, verifications: row.verifications.filter(x => x.id !== v.id) } : row),
          };
        }));
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
      indicators: this.groups().flatMap(g => g.indicators.map(r => ({
        ...(r.id ? { id: r.id } : {}),
        component_id: g.component_id,
        type:         r.type || null,
        name:         r.name || null,
        line:         r.line || null,
        goal:         r.goal || null,
      } as ContractIndicatorItem))),
    };
  }

  private emit(): void { this.dataChange.emit(this.buildPayload()); }

  onSubmit(): void {
    const invalid: string[] = [];
    this.groups().forEach(g => {
      g.indicators.forEach((r, ri) => {
        if (!r.name.trim()) invalid.push(`${g.componentName} — Indicador ${ri + 1}: Nombre requerido`);
      });
    });
    if (invalid.length) { this.validationError.emit(invalid); return; }

    const uploads: PendingIndicatorUpload[] = [];
    this.groups().forEach(g => {
      g.indicators.forEach((r, ri) => {
        if (r.upload.verification_type && r.upload.name && r.upload.files.length > 0) {
          uploads.push({
            rowIndex: this.flatIndexOffset(g, ri),
            verification_type: r.upload.verification_type as VerificationTypeKey,
            name: r.upload.name,
            files: r.upload.files,
          });
        }
      });
    });

    this.submitted.emit({ request: this.buildPayload(), uploads });
  }

  // Índice plano (mismo orden que buildPayload) para que el padre pueda mapear cada upload
  // pendiente al indicador ya guardado por el backend (sin id hasta esa recarga).
  private flatIndexOffset(target: ComponentGroup, targetRi: number): number {
    let idx = 0;
    for (const g of this.groups()) {
      if (g === target) return idx + targetRi;
      idx += g.indicators.length;
    }
    return idx + targetRi;
  }

  fileName(file: File): string { return file.name; }
  fileSize(file: File): string {
    const kb = file.size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  }
}
