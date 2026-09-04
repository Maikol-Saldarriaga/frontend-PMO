import { Component, OnInit, HostListener, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CostCenterService } from '../../../../../core/cost-centers/services/cost-center.service';
import { CostCenter, CostCenterRequest } from '../../../../../core/cost-centers/models/cost-center.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

const PAGE_SIZE = 40;

interface CatalogForm {
  code:       string;
  name:       string;
  sort_order: number;
}

function emptyForm(): CatalogForm {
  return { code: '', name: '', sort_order: 0 };
}

/** Catálogo de Centros de Costo — cada proyecto debe tener uno asignado desde el Formulario
 * Base (Paso 1); este catálogo es donde se dan de alta los códigos disponibles para elegir. */
@Component({
  selector: 'app-cost-centers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cost-centers.component.html',
})
export class CostCentersComponent implements OnInit {
  private svc = inject(CostCenterService);
  private confirmDialog = inject(ConfirmDialogService);

  items       = signal<CostCenter[]>([]);
  loading     = signal(true);
  loadingMore = signal(false);
  error       = signal<string | null>(null);
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  search      = signal('');

  private nextCursor = signal<string | number | null>(null);

  showForm     = signal(false);
  editingItem  = signal<CostCenter | null>(null);
  form: CatalogForm = emptyForm();
  saving       = signal(false);
  saveError    = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.nextCursor.set(null);
    this.svc.list({ limit: PAGE_SIZE }).subscribe({
      next: page => {
        this.items.set([...page.data].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)));
        this.nextCursor.set(page.next_cursor);
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudo cargar el catálogo de centros de costo.'); this.loading.set(false); },
    });
  }

  /** Trae la siguiente página y la agrega al final — se dispara solo al llegar al fondo
   * del scroll, nunca de forma proactiva. */
  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loading() || this.loadingMore()) return;

    this.loadingMore.set(true);
    this.svc.list({ cursor, limit: PAGE_SIZE }).subscribe({
      next: page => {
        this.items.update(current =>
          [...current, ...page.data].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)));
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

  get hasMore(): boolean { return this.nextCursor() !== null; }

  onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
  }

  onSearchChange(value: string): void {
    this.search.set(value);
  }

  get filteredItems(): CostCenter[] {
    const status = this.statusFilter();
    let out = this.items();
    if (status !== 'all') out = out.filter(i => (status === 'active') === i.is_active);

    const q = this.search().trim().toLowerCase();
    if (q) {
      out = out.filter(i => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
    }
    return out;
  }

  get activeCount(): number { return this.items().filter(i => i.is_active).length; }
  get inactiveCount(): number { return this.items().filter(i => !i.is_active).length; }

  openAddForm(): void {
    this.editingItem.set(null);
    this.form = emptyForm();
    this.saveError.set(null);
    this.showForm.set(true);
  }

  openEditForm(item: CostCenter): void {
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

    const payload: CostCenterRequest = {
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
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar el centro de costo.');
      },
    });
  }

  async deactivate(item: CostCenter): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Desactivar el centro de costo "${item.code} — ${item.name}"? Los proyectos que ya lo usan conservan su referencia histórica.` }))) return;
    this.svc.deactivate(item.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Error al desactivar el centro de costo.'),
    });
  }

  trackById(_: number, i: CostCenter) { return i.id; }
}
