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
  type:          IndicatorType;
  name:          string;
  line:          string;
  goal:          string;
  verifications:        IndicatorVerification[];
  verificationsLoading: boolean;
  upload:               PendingUpload;
  deleting:             boolean;
}

interface ComponentGroup {
  component_id:  string;
  componentName: string;
  indicators:    IndicatorRow[];
}

// Mismo catálogo que enums.IndicatorType en el backend (indicator_type.go).
const INDICATOR_TYPES: { value: IndicatorType; label: string }[] = [
  { value: 'gestion',   label: 'Gestión'   },
  { value: 'proceso',   label: 'Proceso'   },
  { value: 'resultado', label: 'Resultado' },
  { value: 'efecto',    label: 'Efecto'    },
  { value: 'impacto',   label: 'Impacto'   },
  { value: 'producto',  label: 'Producto'  },
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

const EMPTY_INDICATOR = (): IndicatorRow => ({
  type: 'gestion', name: '', line: '', goal: '',
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
  @Input() locked = false;

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

  groups: WritableSignal<ComponentGroup[]> = signal([]);

  ngOnInit(): void {
    forkJoin({
      components: this.svc.getScopeComponents(this.projectId),
      indicators: this.svc.getIndicators(this.projectId),
    }).subscribe({
      next: ({ components, indicators }) => {
        const byComp = new Map<string, Indicator[]>();
        indicators.forEach(v => {
          const arr = byComp.get(v.component_id) ?? [];
          arr.push(v);
          byComp.set(v.component_id, arr);
        });
        this.groups.set(components.components.map(c => ({
          component_id:  c.id,
          componentName: c.name,
          indicators:    (byComp.get(c.id) ?? []).map(v => this.toRow(v)),
        })));
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
      id:   v.id,
      type: v.type,
      name: v.name,
      line: v.line ?? '',
      goal: v.goal ?? '',
      verifications: [],
      verificationsLoading: false,
      upload: emptyUpload(),
      deleting: false,
    };
  }

  private loadVerifications(): void {
    this.groups().forEach((g, gi) => {
      g.indicators.forEach((row, ri) => {
        if (!row.id) return;
        this.svc.getIndicatorVerifications(this.projectId, row.id).subscribe({
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
    const g = this.groups()[gi];
    const row = g.indicators[ri];
    this.saveError.set(null);

    if (!row.id) {
      this.groups.update(gs => gs.map((grp, i) =>
        i === gi ? { ...grp, indicators: grp.indicators.filter((_, j) => j !== ri) } : grp));
      return;
    }

    this.groups.update(gs => gs.map((grp, i) =>
      i === gi
        ? { ...grp, indicators: grp.indicators.map((r, j) => j === ri ? { ...r, deleting: true } : r) }
        : grp));

    this.svc.deleteIndicator(this.projectId, row.id).subscribe({
      next: () => {
        this.groups.update(gs => gs.map((grp, i) =>
          i === gi ? { ...grp, indicators: grp.indicators.filter((_, j) => j !== ri) } : grp));
      },
      error: err => {
        this.groups.update(gs => gs.map((grp, i) =>
          i === gi
            ? { ...grp, indicators: grp.indicators.map((r, j) => j === ri ? { ...r, deleting: false } : r) }
            : grp));
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'No se pudo eliminar el indicador en el servidor.');
      },
    });
  }

  updateField(gi: number, ri: number, field: 'type' | 'name' | 'line' | 'goal', value: string): void {
    this.groups.update(gs => gs.map((g, i) =>
      i === gi
        ? { ...g, indicators: g.indicators.map((row, j) => j === ri ? { ...row, [field]: value } : row) }
        : g));
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
    return !this.locked && !!(row.upload.verification_type && row.upload.name);
  }

  previewFileName(gi: number, ri: number, fi: number): string {
    const row = this.groups()[gi].indicators[ri];
    return renameFileForUpload(row.upload.files[fi], row.upload.name, fi, row.upload.files.length).name;
  }

  deleteVerification(gi: number, ri: number, v: IndicatorVerification): void {
    this.svc.deleteIndicatorVerification(this.projectId, v.indicator_id, v.id).subscribe({
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

  save(): void {
    this.saveSuccess.set(false);
    this.saveError.set(null);
    this.saving.set(true);

    const groups = this.groups();
    // Componentes sin indicadores hijos no generan ninguna llamada — no se envían al backend.
    const flat = groups.flatMap((g, gi) => g.indicators.map((r, ri) => ({ g, gi, r, ri, component_id: g.component_id })));

    const calls = flat.map(({ r, component_id }) => {
      const payload: IndicatorRequest = {
        component_id,
        type:   r.type,
        name:   r.name,
        line:   r.line,
        goal:   r.goal,
        medium: '',
      };
      return r.id
        ? this.svc.updateIndicator(this.projectId, r.id, payload)
        : this.svc.createIndicator(this.projectId, payload);
    });

    if (!calls.length) { this.saving.set(false); this.saveSuccess.set(true); return; }

    forkJoin(calls).subscribe({
      next: saved => {
        this.groups.update(gs => gs.map((g, gi) => ({
          ...g,
          indicators: g.indicators.map((row, ri) => {
            const idx = flat.findIndex(f => f.gi === gi && f.ri === ri);
            return idx >= 0 ? { ...row, id: saved[idx].id } : row;
          }),
        })));
        this.uploadPendingVerifications(flat, saved);
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'No se pudieron guardar los indicadores.');
      },
    });
  }

  private uploadPendingVerifications(
    flat: { g: ComponentGroup; gi: number; r: IndicatorRow; ri: number; component_id: string }[],
    saved: Indicator[],
  ): void {
    const uploadCalls = flat.flatMap((f, i) => {
      const ind = saved[i];
      const upload = f.r.upload;
      if (!ind?.id || !upload.verification_type || !upload.name || !upload.files.length) return [];
      return upload.files.map((file, idx) => {
        const fd = new FormData();
        fd.append('file', renameFileForUpload(file, upload.name, idx, upload.files.length));
        fd.append('verification_type', upload.verification_type);
        fd.append('name', upload.name);
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
        this.groups.update(gs => gs.map(g => ({
          ...g,
          indicators: g.indicators.map(r => ({ ...r, upload: emptyUpload() })),
        })));
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
