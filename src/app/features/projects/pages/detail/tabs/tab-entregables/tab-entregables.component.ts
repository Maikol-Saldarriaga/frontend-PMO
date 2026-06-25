import { Component, Input, OnInit, signal, computed, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Observable } from 'rxjs';
import { ProjectService } from '../../../../services/project.service';
import { ServerTimeService } from '../../../../../../core/services/server-time.service';
import {
  ProjectSnapshotItem, Delivery, DeliveryVerification, ScopeComponent,
} from '../../../../models/project.model';

type DeliveryEstado = 'pendiente' | 'vencido' | 'retrasado' | 'completado' | 'adelantado';
type DeliveryFilter = 'todos' | 'completados' | 'atrasados' | 'adelantados';

interface DeliveryDateGroup {
  dateKey: string;
  label:   string;
  items:   ProjectSnapshotItem[];
}

type FileKind = 'image' | 'pdf' | 'other';

interface StagedFile {
  file:    File;
  preview: string | null;
  kind:    FileKind;
}

/** El backend puede enviar fechas con hora/zona ("2026-01-01T00:00:00Z"); solo nos interesa la parte de fecha. */
function toDateOnly(s: string | null | undefined): string {
  return s ? s.slice(0, 10) : '';
}

function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

@Component({
  selector: 'app-tab-entregables',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-entregables.component.html',
})
export class TabEntregablesComponent implements OnInit {
  @Input() projectId!: string;
  @ViewChild('scrollContainer') scrollContainerRef?: ElementRef<HTMLElement>;

  constructor(private svc: ProjectService, private timeSvc: ServerTimeService) {}

  /** Hora real (internet), no el reloj local del equipo — se usa para decidir si un entregable venció. */
  nowDate = signal<Date>(new Date());

  allSnapshots    = signal<ProjectSnapshotItem[]>([]);
  scopeComponents = signal<ScopeComponent[]>([]);
  loading         = signal(true);
  error           = signal<string | null>(null);

  estadoFilter    = signal<DeliveryFilter>('todos');
  componentFilter = signal<string>('todos');

  selectedDelivery = signal<ProjectSnapshotItem | null>(null);
  delivery         = signal<Delivery | null>(null);
  deliveryLoading  = signal(false);
  deliveryForm: { actual_pct: number | null; notes: string } = { actual_pct: null, notes: '' };
  private originalDeliveryForm: { actual_pct: number | null; notes: string } = { actual_pct: null, notes: '' };
  saving        = signal(false);
  saveError     = signal<string | null>(null);
  savedMessage  = signal<string | null>(null);
  private savedMessageTimer: ReturnType<typeof setTimeout> | null = null;

  stagedFiles = signal<StagedFile[]>([]);

  componentNames = computed(() => {
    const names = this.scopeComponents().map(c => c.name);
    return Array.from(new Set(names));
  });

  deliveryCounts = computed(() => {
    const all = this.allSnapshots();
    let completados = 0, atrasados = 0, adelantados = 0;
    for (const s of all) {
      const e = this.estadoSnap(s);
      if (e === 'completado') completados++;
      else if (e === 'adelantado') adelantados++;
      else atrasados++;
    }
    return { todos: all.length, completados, atrasados, adelantados };
  });

  filteredDeliveries = computed(() => {
    const estado = this.estadoFilter();
    const comp = this.componentFilter();
    return this.allSnapshots().filter(s => {
      if (comp !== 'todos' && s.component_name !== comp) return false;
      if (estado === 'todos') return true;
      const e = this.estadoSnap(s);
      if (estado === 'completados')  return e === 'completado';
      if (estado === 'adelantados')  return e === 'adelantado';
      if (estado === 'atrasados')    return e === 'retrasado' || e === 'pendiente' || e === 'vencido';
      return true;
    });
  });

  groupedDeliveries = computed<DeliveryDateGroup[]>(() => {
    const groups = new Map<string, ProjectSnapshotItem[]>();
    for (const item of this.filteredDeliveries()) {
      const key = toDateOnly(item.start_date);
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateKey, items]) => ({
        dateKey,
        label: this.dateLabel(dateKey),
        items: items.sort((a, b) => a.component_name.localeCompare(b.component_name) || a.act - b.act),
      }));
  });

  /** No es un computed(): deliveryForm es un objeto plano (no signal), así que un computed() jamás se invalidaría tras la primera lectura. */
  isDirty(): boolean {
    return this.deliveryForm.actual_pct !== this.originalDeliveryForm.actual_pct
      || this.deliveryForm.notes !== this.originalDeliveryForm.notes;
  }

  ngOnInit(): void {
    this.load();
    this.timeSvc.getNow().subscribe(now => this.nowDate.set(now));
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    let done = 0;
    const check = () => {
      if (++done === 2) {
        this.loading.set(false);
        setTimeout(() => this.scrollToToday(), 0);
      }
    };

    this.svc.getProjectSnapshots(this.projectId).subscribe({
      next:  r => { this.allSnapshots.set(r?.snapshots ?? []); check(); },
      error: () => { this.error.set('No se pudieron cargar los entregables.'); check(); },
    });

    this.svc.getScopeComponents(this.projectId).subscribe({
      next:  r => { this.scopeComponents.set(r.components ?? []); check(); },
      error: () => check(),
    });
  }

  /** El entregable ya pasó su fecha fin según la hora real (no el reloj local). */
  isPastDue(item: { end_date: string }): boolean {
    return toDateOnly(item.end_date) < dateKeyOf(this.nowDate());
  }

  /** Posiciona el feed con "hoy" arriba: scroll hacia atrás (arriba) para ver el pasado, scroll hacia adelante (abajo) para ver lo más futuro. */
  private scrollToToday(): void {
    const container = this.scrollContainerRef?.nativeElement;
    const groups = this.groupedDeliveries();
    if (!container || !groups.length) return;

    const todayKey = dateKeyOf(this.nowDate());
    const target = groups.find(g => g.dateKey >= todayKey) ?? groups[groups.length - 1];
    const el = container.querySelector<HTMLElement>(`[data-date-key="${target.dateKey}"]`);
    el?.scrollIntoView({ block: 'start' });
  }

  private dateLabel(dateKey: string): string {
    if (!dateKey) return 'Sin fecha';
    const today = dateKeyOf(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = dateKeyOf(tomorrowDate);
    if (dateKey === today) return 'Hoy';
    if (dateKey === tomorrow) return 'Mañana';
    const [y, m, d] = dateKey.split('-').map(Number);
    return `${d} ${MESES[m - 1]}, ${y}`;
  }

  estadoSnap(s: ProjectSnapshotItem): DeliveryEstado {
    if (s.actual_pct === null || s.actual_pct === undefined) {
      return this.isPastDue(s) ? 'vencido' : 'pendiente';
    }
    if (s.actual_pct < s.planned_pct) return 'retrasado';
    if (s.actual_pct > s.planned_pct) return 'adelantado';
    return 'completado';
  }

  setEstadoFilter(f: DeliveryFilter): void { this.estadoFilter.set(f); setTimeout(() => this.scrollToToday(), 0); }
  setComponentFilter(c: string): void { this.componentFilter.set(c); setTimeout(() => this.scrollToToday(), 0); }

  openDelivery(item: ProjectSnapshotItem): void {
    if (!item.id_snapshot) return;
    this.selectedDelivery.set(item);
    this.delivery.set(null);
    this.saveError.set(null);
    this.savedMessage.set(null);
    this.clearStagedFiles();
    this.deliveryLoading.set(true);

    // Solo se "vence a 0%" si nunca se registró avance real; si ya tenía actual_pct, se queda como está, solo se bloquea la edición.
    const shouldZeroOut = item.actual_pct === null && this.isPastDue(item);

    this.svc.getDelivery(this.projectId, item.id_scope, item.id_snapshot).subscribe({
      next: d => {
        this.delivery.set(d);
        this.deliveryForm = { actual_pct: d.actual_pct, notes: d.notes ?? '' };
        this.originalDeliveryForm = { ...this.deliveryForm };
        this.deliveryLoading.set(false);
        if (shouldZeroOut) this.zeroOutExpiredDelivery(item);
      },
      error: () => {
        this.deliveryForm = { actual_pct: item.actual_pct, notes: item.notes ?? '' };
        this.originalDeliveryForm = { ...this.deliveryForm };
        this.deliveryLoading.set(false);
        if (shouldZeroOut) this.zeroOutExpiredDelivery(item);
      },
    });
  }

  /** El backend, al recibir un PUT con la fecha fin ya vencida, fuerza actual_pct a 0 e ignora el resto del payload. */
  private zeroOutExpiredDelivery(item: ProjectSnapshotItem): void {
    if (!item.id_snapshot) return;
    this.svc.upsertDelivery(this.projectId, item.id_scope, item.id_snapshot, { actual_pct: 0, notes: null }).subscribe({
      next: saved => {
        this.delivery.update(d => d ? { ...d, ...saved, verifications: d.verifications } : d);
        this.deliveryForm = { actual_pct: saved.actual_pct, notes: saved.notes ?? '' };
        this.originalDeliveryForm = { ...this.deliveryForm };
        this.updateSnapshotEntry(item, saved.actual_pct, saved.notes, saved.is_completed);
      },
      error: () => { /* el vencimiento es un side-effect silencioso; no bloquea la vista de solo lectura */ },
    });
  }

  /** Una vez vencida la fecha fin, el entregable queda en solo lectura sin importar si ya tenía avance registrado. */
  isDeliveryLocked(): boolean {
    const item = this.selectedDelivery();
    return !!item && this.isPastDue(item);
  }

  closeDelivery(): void {
    this.selectedDelivery.set(null);
    this.delivery.set(null);
    this.clearStagedFiles();
    if (this.savedMessageTimer) clearTimeout(this.savedMessageTimer);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.selectedDelivery()) this.closeDelivery();
  }

  /** El backend guarda la URL sin extensión (solo el id de la verificación); la extensión real viene en `file_name` (el nombre de archivo original capturado en el servidor al subir). */
  verificationKind(v: DeliveryVerification): FileKind {
    const ext = (v.file_name || v.name || v.verification_url).match(/\.([a-z0-9]+)(\?.*)?$/i)?.[1]?.toLowerCase() ?? '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    return 'other';
  }

  deletingVerificationId = signal<string | null>(null);

  deleteVerification(v: DeliveryVerification): void {
    const item = this.selectedDelivery();
    if (!item || !item.id_snapshot) return;
    if (!confirm(`¿Eliminar "${v.name || 'esta verificación'}"? Esta acción no se puede deshacer.`)) return;

    this.deletingVerificationId.set(v.id);
    this.svc.deleteDeliveryVerification(this.projectId, item.id_scope, item.id_snapshot, v.id).subscribe({
      next: () => {
        this.delivery.update(d => d ? { ...d, verifications: d.verifications.filter(x => x.id !== v.id) } : d);
        this.allSnapshots.update(list => list.map(s =>
          s.id_snapshot === item.id_snapshot ? { ...s, verifications_count: Math.max(0, s.verifications_count - 1) } : s
        ));
        this.selectedDelivery.update(sel => sel ? { ...sel, verifications_count: Math.max(0, sel.verifications_count - 1) } : sel);
        this.deletingVerificationId.set(null);
      },
      error: err => {
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al eliminar la verificación.');
        this.deletingVerificationId.set(null);
      },
    });
  }

  private clearStagedFiles(): void {
    for (const sf of this.stagedFiles()) {
      if (sf.preview) URL.revokeObjectURL(sf.preview);
    }
    this.stagedFiles.set([]);
  }

  onFilesSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const staged: StagedFile[] = files.map(file => {
      const kind: FileKind = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other';
      return {
        file,
        kind,
        preview: kind !== 'other' ? URL.createObjectURL(file) : null,
      };
    });
    this.stagedFiles.update(list => [...list, ...staged]);
    input.value = '';
  }

  removeStagedFile(index: number): void {
    this.stagedFiles.update(list => {
      const target = list[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return list.filter((_, i) => i !== index);
    });
  }

  saveAll(): void {
    const item = this.selectedDelivery();
    if (!item || !item.id_snapshot) return;

    const dirty = this.isDirty();
    const files = this.stagedFiles();
    if (!dirty && files.length === 0) return;

    if (dirty && (this.deliveryForm.actual_pct === null || this.deliveryForm.actual_pct < 0 || this.deliveryForm.actual_pct > 100)) {
      this.saveError.set('El % de avance real debe estar entre 0 y 100.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.savedMessage.set(null);

    const deliveryCall: Observable<Delivery | null> = dirty
      ? this.svc.upsertDelivery(this.projectId, item.id_scope, item.id_snapshot, {
          actual_pct: this.deliveryForm.actual_pct!,
          notes:      this.deliveryForm.notes || null,
        })
      : of(null);

    const uploadCalls: Observable<DeliveryVerification | null>[] = files.length
      ? files.map(sf => {
          const fd = new FormData();
          fd.append('file', sf.file);
          fd.append('name', sf.file.name);
          return this.svc.uploadDeliveryVerification(this.projectId, item.id_scope, item.id_snapshot, fd);
        })
      : [of(null)];

    forkJoin([deliveryCall, forkJoin(uploadCalls)]).subscribe({
      next: ([savedDelivery, uploaded]) => {
        const newVerifications = (uploaded.filter(Boolean) as DeliveryVerification[]);

        if (savedDelivery) {
          this.delivery.update(d => d ? { ...d, ...savedDelivery, verifications: d.verifications } : savedDelivery);
          this.originalDeliveryForm = { ...this.deliveryForm };
          this.updateSnapshotEntry(item, savedDelivery.actual_pct, savedDelivery.notes, savedDelivery.is_completed);
        }

        if (newVerifications.length) {
          this.delivery.update(d => d ? { ...d, verifications: [...d.verifications, ...newVerifications] } : d);
          this.allSnapshots.update(list => list.map(s =>
            s.id_snapshot === item.id_snapshot ? { ...s, verifications_count: s.verifications_count + newVerifications.length } : s
          ));
          this.selectedDelivery.update(sel => sel ? { ...sel, verifications_count: sel.verifications_count + newVerifications.length } : sel);
        }

        this.clearStagedFiles();
        this.saving.set(false);
        this.showSavedMessage('Guardado correctamente.');
      },
      error: err => {
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar los cambios.');
        this.saving.set(false);
      },
    });
  }

  private showSavedMessage(msg: string): void {
    this.savedMessage.set(msg);
    if (this.savedMessageTimer) clearTimeout(this.savedMessageTimer);
    this.savedMessageTimer = setTimeout(() => this.savedMessage.set(null), 3000);
  }

  private updateSnapshotEntry(item: ProjectSnapshotItem, actual_pct: number | null, notes: string | null, is_completed: boolean): void {
    const patch = (s: ProjectSnapshotItem) => s.id_snapshot === item.id_snapshot ? { ...s, actual_pct, notes, is_completed } : s;
    this.allSnapshots.update(list => list.map(patch));
    this.selectedDelivery.update(sel => sel ? { ...sel, actual_pct, notes, is_completed } : sel);
  }
}
