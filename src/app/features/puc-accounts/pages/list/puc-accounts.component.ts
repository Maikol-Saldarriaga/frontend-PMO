import { Component, OnInit, OnDestroy, HostListener, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { PUCAccountService } from '../../../../../core/puc-accounts/services/puc-account.service';
import { PUCAccount, PUCAccountRequest, PUCAccountStats } from '../../../../../core/puc-accounts/models/puc-account.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

interface CatalogForm {
  code:       string;
  name:       string;
  sort_order: number;
}

function emptyForm(): CatalogForm {
  return { code: '', name: '', sort_order: 0 };
}

interface PucClassGroup {
  classCode: string;
  label:     string;
  items:     PUCAccount[];
}

const PAGE_SIZE = 40;

/** Nombre de cada Clase del PUC (Decreto 2650/1993) por su primer dígito — la misma
 * agrupación que usa el modal de búsqueda en el formulario de Egresos. */
const CLASS_LABELS: Record<string, string> = {
  '1': 'Activo',
  '2': 'Pasivo',
  '3': 'Patrimonio',
  '4': 'Ingresos',
  '5': 'Gastos',
  '6': 'Costo de ventas',
  '7': 'Costos de producción',
  '8': 'Cuentas de orden deudoras',
  '9': 'Cuentas de orden acreedoras',
};

@Component({
  selector: 'app-puc-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './puc-accounts.component.html',
})
export class PUCAccountsComponent implements OnInit, OnDestroy {
  private svc = inject(PUCAccountService);
  private confirmDialog = inject(ConfirmDialogService);
  private destroy$ = new Subject<void>();
  private searchInput$ = new Subject<string>();

  items       = signal<PUCAccount[]>([]);
  loading     = signal(true);
  loadingMore = signal(false);
  error       = signal<string | null>(null);
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  /** Búsqueda libre por código o nombre — filtra en el backend (catálogo puede tener miles
   * de subcuentas paginadas). */
  search = signal('');

  private nextCursor = signal<string | null>(null);
  /** Total/activas/inactivas del catálogo completo de la company — el backend las calcula
   * sobre todo el catálogo, ignora search/status del query. */
  stats = signal<PUCAccountStats>({ total: 0, active: 0, inactive: 0 });

  showForm     = signal(false);
  editingItem  = signal<PUCAccount | null>(null);
  form: CatalogForm = emptyForm();
  saving       = signal(false);
  saveError    = signal<string | null>(null);

  ngOnInit(): void {
    this.searchInput$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(term => {
      this.search.set(term);
      this.load();
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Recarga desde el inicio del catálogo (nuevo filtro/búsqueda o primera carga). */
  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.nextCursor.set(null);
    const status = this.statusFilter();
    this.svc.list({
      limit:  PAGE_SIZE,
      search: this.search().trim() || undefined,
      status: status === 'all' ? undefined : status,
    }).subscribe({
      next: page => {
        this.items.set(page.data);
        this.nextCursor.set(page.next_cursor);
        this.stats.set(page.stats);
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudo cargar el catálogo PUC.'); this.loading.set(false); },
    });
  }

  /** Trae la siguiente página y la agrega al final — se dispara solo al llegar al fondo
   * del scroll, nunca de forma proactiva. */
  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loading() || this.loadingMore()) return;

    this.loadingMore.set(true);
    const status = this.statusFilter();
    this.svc.list({
      cursor,
      limit:  PAGE_SIZE,
      search: this.search().trim() || undefined,
      status: status === 'all' ? undefined : status,
    }).subscribe({
      next: page => {
        this.items.update(current => [...current, ...page.data]);
        this.nextCursor.set(page.next_cursor);
        this.loadingMore.set(false);
      },
      error: () => { this.loadingMore.set(false); },
    });
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const scrolledToBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
    if (scrolledToBottom) this.loadMore();
  }

  onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
    this.load();
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value);
  }

  /** items() ya viene filtrado/paginado desde el backend — acá solo se agrupa por Clase
   * (primer dígito del código) en orden 1→9. */
  get filteredGroups(): PucClassGroup[] {
    const byClass = new Map<string, PUCAccount[]>();
    for (const i of this.items()) {
      const cls = i.code.charAt(0) || '?';
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls)!.push(i);
    }
    return [...byClass.keys()]
      .sort()
      .map(cls => ({ classCode: cls, label: CLASS_LABELS[cls] ?? `Clase ${cls}`, items: byClass.get(cls)! }));
  }

  get hasMore(): boolean { return this.nextCursor() !== null; }

  get activeCount(): number { return this.stats().active; }
  get inactiveCount(): number { return this.stats().inactive; }

  openAddForm(): void {
    this.editingItem.set(null);
    this.form = emptyForm();
    this.saveError.set(null);
    this.showForm.set(true);
  }

  openEditForm(item: PUCAccount): void {
    this.editingItem.set(item);
    this.form = { code: item.code, name: item.name, sort_order: item.sort_order };
    this.saveError.set(null);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  save(): void {
    if (this.saving()) return;
    const code = this.form.code.trim();
    const name = this.form.name.trim();
    if (!code) { this.saveError.set('El código es obligatorio.'); return; }
    if (!name) { this.saveError.set('El nombre es obligatorio.'); return; }

    this.saving.set(true);
    this.saveError.set(null);

    const payload: PUCAccountRequest = {
      code,
      name,
      sort_order: this.form.sort_order ?? 0,
    };

    const editing = this.editingItem();
    const request = editing ? this.svc.update(editing.id, payload) : this.svc.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar la cuenta PUC.');
      },
    });
  }

  async deactivate(item: PUCAccount): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Desactivar la cuenta PUC "${item.code} — ${item.name}"? Los registros que ya la usan conservan su referencia histórica.` }))) return;
    this.svc.deactivate(item.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Error al desactivar la cuenta PUC.'),
    });
  }

  trackById(_: number, i: PUCAccount) { return i.id; }
}
