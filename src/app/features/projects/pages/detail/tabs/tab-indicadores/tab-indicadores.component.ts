import { Component, Input, OnInit, signal, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { ProjectService } from '../../../../services/project.service';
import { Indicator, IndicatorRequest, IndicatorType, IndicatorVerification } from '../../../../models/project.model';
import { renameFileForUpload } from '../../../../../../../core/utils/file.utils';

type VerificationTypeKey = 'documentos_tecnicos' | 'documentos_administrativos' | 'documentos_legales' | 'evidencias';

interface PendingUpload {
  verification_type: VerificationTypeKey | '';
  name:               string;
  files:              File[];
}

interface IndicatorRow {
  id?:           string;
  component_id:  string;
  type:          IndicatorType;
  name:          string;
  line:          string;
  goal:          string;
  verifications:        IndicatorVerification[];
  verificationsLoading: boolean;
  upload:               PendingUpload;
  deleting:             boolean;
}

const INDICATOR_TYPES: { value: IndicatorType; label: string }[] = [
  { value: 'gestion',   label: 'Gestión'   },
  { value: 'proceso',   label: 'Proceso'   },
  { value: 'resultado', label: 'Resultado' },
  { value: 'efecto',    label: 'Efecto'    },
  { value: 'impacto',   label: 'Impacto'   },
];

// Mismo catálogo que en Condiciones/Soportes — el backend reutiliza enums.SupportType.
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
};

const VERIFICATION_TYPE_LABELS: Record<VerificationTypeKey, string> = {
  documentos_tecnicos:        'Documentos Técnicos',
  documentos_administrativos: 'Documentos Administrativos',
  documentos_legales:         'Documentos Legales',
  evidencias:                 'Evidencias',
};

const emptyUpload = (): PendingUpload => ({ verification_type: '', name: '', files: [] });

const EMPTY = (): IndicatorRow => ({
  component_id: '', type: 'gestion', name: '', line: '', goal: '',
  verifications: [], verificationsLoading: false, upload: emptyUpload(), deleting: false,
});

@Component({
  selector: 'app-tab-indicadores',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-indicadores.component.html',
})
export class TabIndicadoresComponent implements OnInit {
  @Input() projectId!: string;

  private svc = inject(ProjectService);

  loading     = signal(true);
  error       = signal<string | null>(null);
  saving      = signal(false);
  saveError   = signal<string | null>(null);
  saveSuccess = signal(false);

  readonly indicatorTypes         = INDICATOR_TYPES;
  readonly verificationTypeKeys   = Object.keys(VERIFICATION_TYPES) as VerificationTypeKey[];
  readonly verificationTypeLabels = VERIFICATION_TYPE_LABELS;
  readonly verificationTypes      = VERIFICATION_TYPES;

  components: { id: string; name: string }[] = [];
  rows: WritableSignal<IndicatorRow[]> = signal([]);

  ngOnInit(): void {
    forkJoin({
      components: this.svc.getScopeComponents(this.projectId),
      indicators: this.svc.getIndicators(this.projectId),
    }).subscribe({
      next: ({ components, indicators }) => {
        this.components = components.components.map(c => ({ id: c.id, name: c.name }));
        this.rows.set(indicators.length ? indicators.map(v => this.toRow(v)) : [EMPTY()]);
        this.loading.set(false);
        if (indicators.length) this.loadVerifications();
      },
      error: () => {
        this.error.set('No se pudieron cargar los indicadores del proyecto.');
        this.loading.set(false);
      },
    });
  }

  private toRow(v: Indicator): IndicatorRow {
    return {
      id:           v.id,
      component_id: v.component_id,
      type:         v.type,
      name:         v.name,
      line:         v.line ?? '',
      goal:         v.goal ?? '',
      verifications: [],
      verificationsLoading: false,
      upload: emptyUpload(),
      deleting: false,
    };
  }

  private loadVerifications(): void {
    this.rows().forEach((row, i) => {
      if (!row.id) return;
      this.svc.getIndicatorVerifications(this.projectId, row.id).subscribe({
        next: verifications => {
          this.rows.update(rows => rows.map((r, idx) => idx === i ? { ...r, verifications } : r));
        },
      });
    });
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

    this.svc.deleteIndicator(this.projectId, row.id).subscribe({
      next: () => {
        this.rows.update(rows => rows.filter((_, idx) => idx !== i));
      },
      error: err => {
        this.rows.update(rows => rows.map((r, idx) => idx === i ? { ...r, deleting: false } : r));
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'No se pudo eliminar el indicador en el servidor.');
      },
    });
  }

  updateField(i: number, field: 'component_id' | 'type' | 'name' | 'line' | 'goal', value: string): void {
    this.rows.update(rows => rows.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
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
    this.svc.deleteIndicatorVerification(this.projectId, v.indicator_id, v.id).subscribe({
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

  componentName(id: string): string {
    return this.components.find(c => c.id === id)?.name ?? '—';
  }

  save(): void {
    this.saveSuccess.set(false);
    this.saveError.set(null);
    this.saving.set(true);

    const rows = this.rows();
    const calls = rows.map(r => {
      const payload: IndicatorRequest = {
        component_id: r.component_id,
        type:         r.type,
        name:         r.name,
        line:         r.line,
        goal:         r.goal,
        medium:       '',
      };
      return r.id
        ? this.svc.updateIndicator(this.projectId, r.id, payload)
        : this.svc.createIndicator(this.projectId, payload);
    });

    if (!calls.length) { this.saving.set(false); return; }

    forkJoin(calls).subscribe({
      next: saved => {
        this.rows.set(saved.map((s, i) => ({ ...rows[i], id: s.id })));
        this.uploadPendingVerifications(saved);
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'No se pudieron guardar los indicadores.');
      },
    });
  }

  private uploadPendingVerifications(saved: Indicator[]): void {
    const rows = this.rows();
    const uploadCalls = rows.flatMap((r, i) => {
      const ind = saved[i];
      if (!ind?.id || !r.upload.verification_type || !r.upload.name || !r.upload.files.length) return [];
      return r.upload.files.map((file, idx) => {
        const fd = new FormData();
        fd.append('file', renameFileForUpload(file, r.upload.name, idx, r.upload.files.length));
        fd.append('verification_type', r.upload.verification_type);
        fd.append('name', r.upload.name);
        return this.svc.uploadIndicatorVerification(this.projectId, ind.id, fd);
      });
    });

    if (!uploadCalls.length) {
      this.saving.set(false);
      this.saveSuccess.set(true);
      return;
    }

    forkJoin(uploadCalls).subscribe({
      next: () => {
        this.rows.update(rows => rows.map(r => ({ ...r, upload: emptyUpload() })));
        this.loadVerifications();
        this.saving.set(false);
        this.saveSuccess.set(true);
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set('Los indicadores se guardaron, pero hubo un error al subir algunos medios de verificación.');
      },
    });
  }

  fileName(file: File): string { return file.name; }
  fileSize(file: File): string {
    const kb = file.size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  }
}
