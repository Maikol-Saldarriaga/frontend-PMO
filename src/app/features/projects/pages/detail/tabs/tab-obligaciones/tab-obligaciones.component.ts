import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Observable } from 'rxjs';
import { ContractService } from '../../../../services/contract.service';
import {
  ContractObligation, ObligationEvidence, ObligationRequest, ObligationEvidenceRequest,
  ObligationImportRow,
} from '../../../../models/contract.model';

type FileKind = 'image' | 'pdf' | 'other';

interface EvidenceRow extends ObligationEvidence {
  editing: boolean;
  draft:   ObligationEvidenceRequest;
  saving:  boolean;
  error:   string | null;
}

/** Evidencia nueva aún no persistida: por archivo (se sube con multipart) o por enlace (URL escrita a mano). */
interface StagedEvidence {
  mode:                     'file' | 'link';
  file?:                    File;
  preview?:                 string | null;
  kind?:                    FileKind;
  compliance_method:        string;
  compliance_location_url?: string;
  verification_note:       string;
}

interface HeaderForm {
  contract_clause:  string;
  clause_reference: string;
  obligation_text:  string;
}

function toEvidenceRow(e: ObligationEvidence): EvidenceRow {
  return {
    ...e, editing: false, saving: false, error: null,
    draft: {
      compliance_method: e.compliance_method ?? '',
      compliance_location_url: e.compliance_location_url,
      verification_note: e.verification_note ?? '',
    },
  };
}

function emptyHeaderForm(): HeaderForm {
  return { contract_clause: '', clause_reference: '', obligation_text: '' };
}

/** El backend no siempre incluye `evidences` cuando viene vacío; se normaliza para no romper los computeds/plantilla. */
function normalizeObligations(list: ContractObligation[] | null | undefined): ContractObligation[] {
  return (list ?? []).map(o => ({ ...o, evidences: o.evidences ?? [] }));
}

function fileKindOf(file: File): FileKind {
  return file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other';
}

/**
 * Igual heurística que `verificationKind` en Entregables: la URL firmada de MinIO no tiene
 * extensión (es solo el id de la evidencia + query de firma), así que primero se intenta con
 * `file_name` (el nombre original del archivo subido) y solo si no hay se cae a la URL —
 * eso cubre los enlaces externos (SharePoint, etc.) que sí pueden traer extensión en la URL.
 */
function evidenceFileKind(fileName: string | null | undefined, url: string): FileKind {
  const source = fileName || url;
  const ext = source.match(/\.([a-z0-9]+)(\?.*)?$/i)?.[1]?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

type ImportMode = 'add' | 'replace';

@Component({
  selector: 'app-tab-obligaciones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-obligaciones.component.html',
})
export class TabObligacionesComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ContractService) {}

  loading = signal(true);
  error   = signal<string | null>(null);

  rows = signal<ContractObligation[]>([]);

  totalEvidences = computed(() => this.rows().reduce((s, r) => s + (r.evidences?.length ?? 0), 0));
  obligationsWithoutEvidence = computed(() => this.rows().filter(r => !r.evidences?.length).length);

  // ── Panel lateral de creación / edición ─────────────────────────────────
  panelOpen  = signal(false);
  editingId  = signal<string | null>(null);
  deletingObligationId = signal<string | null>(null);

  headerForm: HeaderForm = emptyHeaderForm();
  private originalHeaderForm: HeaderForm = emptyHeaderForm();

  existingEvidences = signal<EvidenceRow[]>([]);
  stagedEvidences    = signal<StagedEvidence[]>([]);

  saving      = signal(false);
  saveError   = signal<string | null>(null);

  // ── Importar / Reemplazar ───────────────────────────────────────────────
  showImport   = signal(false);
  importMode   = signal<ImportMode>('add');
  importText   = signal('');
  importSaving = signal(false);
  importError  = signal<string | null>(null);
  importSuccess = signal<string | null>(null);

  importPreviewCount = computed(() => this.parseImportRows(this.importText()).length);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getObligations(this.projectId).subscribe({
      next: list => { this.rows.set(normalizeObligations(list)); this.loading.set(false); },
      error: () => { this.error.set('No se pudieron cargar las obligaciones del contrato.'); this.loading.set(false); },
    });
  }

  isHeaderDirty(): boolean {
    return this.headerForm.contract_clause !== this.originalHeaderForm.contract_clause
      || this.headerForm.clause_reference !== this.originalHeaderForm.clause_reference
      || this.headerForm.obligation_text !== this.originalHeaderForm.obligation_text;
  }

  // ── Abrir / cerrar panel ─────────────────────────────────────────────────

  openCreate(): void {
    this.editingId.set(null);
    this.headerForm = emptyHeaderForm();
    this.originalHeaderForm = emptyHeaderForm();
    this.existingEvidences.set([]);
    this.clearStagedEvidences();
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  openEdit(o: ContractObligation): void {
    this.editingId.set(o.id);
    this.headerForm = { contract_clause: o.contract_clause, clause_reference: o.clause_reference ?? '', obligation_text: o.obligation_text };
    this.originalHeaderForm = { ...this.headerForm };
    this.existingEvidences.set((o.evidences ?? []).map(toEvidenceRow));
    this.clearStagedEvidences();
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.clearStagedEvidences();
    this.panelOpen.set(false);
  }

  updateHeaderField(field: keyof HeaderForm, value: string): void {
    this.headerForm = { ...this.headerForm, [field]: value };
  }

  // ── Evidencias nuevas (staged) ───────────────────────────────────────────

  private clearStagedEvidences(): void {
    for (const se of this.stagedEvidences()) {
      if (se.preview) URL.revokeObjectURL(se.preview);
    }
    this.stagedEvidences.set([]);
  }

  onFilesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const staged: StagedEvidence[] = files.map(file => {
      const kind = fileKindOf(file);
      return {
        mode: 'file', file, kind,
        preview: kind !== 'other' ? URL.createObjectURL(file) : null,
        compliance_method: '', verification_note: '',
      };
    });
    this.stagedEvidences.update(list => [...list, ...staged]);
    input.value = '';
  }

  addStagedLink(): void {
    this.stagedEvidences.update(list => [...list, {
      mode: 'link', compliance_method: '', compliance_location_url: '', verification_note: '',
    }]);
  }

  removeStagedEvidence(i: number): void {
    this.stagedEvidences.update(list => {
      const target = list[i];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return list.filter((_, idx) => idx !== i);
    });
  }

  updateStagedField(i: number, field: 'compliance_method' | 'compliance_location_url' | 'verification_note', value: string): void {
    this.stagedEvidences.update(list => list.map((se, idx) => idx === i ? { ...se, [field]: value } : se));
  }

  canSave(): boolean {
    if (!this.headerForm.contract_clause.trim() || !this.headerForm.obligation_text.trim()) return false;
    return this.stagedEvidences().every(se => se.mode === 'file' || !!se.compliance_location_url?.trim());
  }

  // ── Guardar (crea/actualiza obligación y luego sube evidencias nuevas) ──

  save(): void {
    if (!this.canSave() || this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const id = this.editingId();
    const headerPayload: ObligationRequest = {
      contract_clause:  this.headerForm.contract_clause.trim(),
      clause_reference: this.headerForm.clause_reference.trim() || null,
      obligation_text:  this.headerForm.obligation_text.trim(),
    };

    const currentSnapshot = id ? this.rows().find(r => r.id === id) : undefined;

    const obligation$: Observable<ContractObligation> = id
      ? (this.isHeaderDirty() || !currentSnapshot
          ? this.svc.updateObligation(this.projectId, id, headerPayload)
          : of(currentSnapshot))
      : this.svc.createObligation(this.projectId, headerPayload);

    obligation$.subscribe({
      next: obligation => {
        const staged = this.stagedEvidences();
        const evidenceCalls: Observable<ObligationEvidence>[] = staged.map(se => {
          if (se.mode === 'file') {
            const fd = new FormData();
            fd.append('file', se.file!);
            if (se.compliance_method.trim()) fd.append('compliance_method', se.compliance_method.trim());
            if (se.verification_note.trim()) fd.append('verification_note', se.verification_note.trim());
            return this.svc.uploadObligationEvidence(this.projectId, obligation.id, fd);
          }
          const payload: ObligationEvidenceRequest = {
            compliance_method:       se.compliance_method.trim() || null,
            compliance_location_url: se.compliance_location_url!.trim(),
            verification_note:       se.verification_note.trim() || null,
          };
          return this.svc.createObligationEvidence(this.projectId, obligation.id, payload);
        });

        (evidenceCalls.length ? forkJoin(evidenceCalls) : of([])).subscribe({
          next: () => {
            this.saving.set(false);
            this.load();
            this.closePanel();
          },
          error: err => {
            this.saving.set(false);
            this.saveError.set(err?.error?.message ?? 'La obligación se guardó, pero falló la subida de una o más evidencias.');
            this.load();
          },
        });
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'Error al guardar la obligación.');
      },
    });
  }

  deleteObligation(o: ContractObligation): void {
    if (!confirm(`¿Eliminar la obligación de "${o.contract_clause}"? Esto también elimina sus ${o.evidences?.length ?? 0} evidencia(s).`)) return;

    this.deletingObligationId.set(o.id);
    this.svc.deleteObligation(this.projectId, o.id).subscribe({
      next: () => {
        this.rows.update(rows => rows.filter(r => r.id !== o.id));
        this.deletingObligationId.set(null);
      },
      error: () => this.deletingObligationId.set(null),
    });
  }

  // ── Evidencias ya existentes (edición inline dentro del panel) ──────────

  editEvidence(evId: string): void {
    this.updateExistingEvidence(evId, ev => ({ ...ev, editing: true }));
  }

  cancelEditEvidence(evId: string): void {
    this.updateExistingEvidence(evId, ev => ({
      ...ev, editing: false, error: null,
      draft: {
        compliance_method: ev.compliance_method ?? '',
        compliance_location_url: ev.compliance_location_url,
        verification_note: ev.verification_note ?? '',
      },
    }));
  }

  updateEvidenceDraft(evId: string, field: keyof ObligationEvidenceRequest, value: string): void {
    this.updateExistingEvidence(evId, ev => ({ ...ev, draft: { ...ev.draft, [field]: value } }));
  }

  saveEvidence(evId: string): void {
    const id = this.editingId();
    const ev = this.existingEvidences().find(e => e.id === evId);
    if (!id || !ev || ev.saving) return;
    // La URL nunca se edita desde acá (ver `updateEvidenceDraft`): evita que un usuario dañe por accidente el enlace a la evidencia ya subida.
    const url = ev.compliance_location_url.trim();

    this.updateExistingEvidence(evId, e => ({ ...e, saving: true, error: null }));

    const payload: ObligationEvidenceRequest = {
      compliance_method:       ev.draft.compliance_method?.trim() || null,
      compliance_location_url: url,
      verification_note:       ev.draft.verification_note?.trim() || null,
    };

    this.svc.updateObligationEvidence(this.projectId, id, evId, payload).subscribe({
      next: res => this.updateExistingEvidence(evId, () => toEvidenceRow(res)),
      error: err => this.updateExistingEvidence(evId, e => ({ ...e, saving: false, error: err?.error?.message ?? 'Error al guardar la evidencia.' })),
    });
  }

  deleteEvidence(ev: ObligationEvidence): void {
    const id = this.editingId();
    if (!id) return;
    if (!confirm('¿Eliminar esta evidencia de cumplimiento?')) return;
    this.svc.deleteObligationEvidence(this.projectId, id, ev.id).subscribe({
      next: () => {
        this.existingEvidences.update(list => list.filter(e => e.id !== ev.id));
        this.rows.update(rows => rows.map(r => r.id === id ? { ...r, evidences: r.evidences.filter(e => e.id !== ev.id) } : r));
      },
      error: () => this.saveError.set('Error al eliminar la evidencia.'),
    });
  }

  private updateExistingEvidence(evId: string, fn: (ev: EvidenceRow) => EvidenceRow): void {
    this.existingEvidences.update(list => list.map(e => e.id === evId ? fn(e) : e));
  }

  evidenceKind(ev: ObligationEvidence): FileKind {
    return evidenceFileKind(ev.file_name, ev.compliance_location_url);
  }

  // ── Importar / Reemplazar masivo ─────────────────────────────────────────

  toggleImportPanel(): void {
    this.showImport.update(v => !v);
    this.importError.set(null);
    this.importSuccess.set(null);
  }

  setImportMode(mode: ImportMode): void { this.importMode.set(mode); }

  /** Formato esperado por línea (separado por tabulaciones o " | "): cláusula, referencia, texto, método, url, nota */
  private parseImportRows(text: string): ObligationImportRow[] {
    return text.split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const cols = line.includes('\t') ? line.split('\t') : line.split('|');
        const [clause, reference, obligationText, method, url, note] = cols.map(c => (c ?? '').trim());
        return {
          contract_clause: clause ?? '',
          clause_reference: reference || null,
          obligation_text: obligationText ?? '',
          compliance_method: method || null,
          compliance_location_url: url || null,
          verification_note: note || null,
        } as ObligationImportRow;
      })
      .filter(r => r.contract_clause && r.obligation_text);
  }

  runImport(): void {
    const rows = this.parseImportRows(this.importText());
    if (!rows.length) { this.importError.set('No se detectaron filas válidas. Cada línea necesita al menos cláusula y texto de la obligación.'); return; }

    if (this.importMode() === 'replace' && !confirm(`Esto reemplaza TODA la matriz de cumplimiento actual (${this.rows().length} obligación(es)) por las ${rows.length} filas pegadas. ¿Continuar?`)) {
      return;
    }

    this.importSaving.set(true);
    this.importError.set(null);
    this.importSuccess.set(null);

    const request$ = this.importMode() === 'replace'
      ? this.svc.replaceObligations(this.projectId, { rows })
      : this.svc.importObligations(this.projectId, { rows });

    request$.subscribe({
      next: list => {
        this.rows.set(normalizeObligations(list));
        this.importSaving.set(false);
        this.importSuccess.set(`Se procesaron ${rows.length} fila(s) correctamente.`);
        this.importText.set('');
      },
      error: err => {
        this.importSaving.set(false);
        this.importError.set(err?.error?.message ?? 'Error al importar la matriz.');
      },
    });
  }

  trackByRow(_: number, r: ContractObligation) { return r.id; }
  trackByEvidence(_: number, e: EvidenceRow) { return e.id; }
}
