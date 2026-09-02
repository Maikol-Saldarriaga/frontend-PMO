import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PUCAccountService } from '../../../../../core/puc-accounts/services/puc-account.service';
import { PUCAccount, PUCAccountRequest } from '../../../../../core/puc-accounts/models/puc-account.model';
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
export class PUCAccountsComponent implements OnInit {
  private svc = inject(PUCAccountService);
  private confirmDialog = inject(ConfirmDialogService);

  items       = signal<PUCAccount[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  /** Búsqueda libre por código o nombre — el catálogo PUC completo puede tener miles de
   * subcuentas, así que el filtro por texto es la forma principal de encontrar una cuenta. */
  search = signal('');

  showForm     = signal(false);
  editingItem  = signal<PUCAccount | null>(null);
  form: CatalogForm = emptyForm();
  saving       = signal(false);
  saveError    = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.list().subscribe({
      next: items => {
        this.items.set([...items].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)));
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudo cargar el catálogo PUC.'); this.loading.set(false); },
    });
  }

  onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
  }

  onSearchChange(value: string): void {
    this.search.set(value);
  }

  get filteredItems(): PUCAccount[] {
    const status = this.statusFilter();
    let out = this.items();
    if (status !== 'all') out = out.filter(i => (status === 'active') === i.is_active);

    const q = this.search().trim().toLowerCase();
    if (q) {
      out = out.filter(i => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
    }
    return out;
  }

  /** filteredItems agrupado por Clase (primer dígito del código), en el orden 1→9. */
  get filteredGroups(): PucClassGroup[] {
    const byClass = new Map<string, PUCAccount[]>();
    for (const i of this.filteredItems) {
      const cls = i.code.charAt(0) || '?';
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls)!.push(i);
    }
    return [...byClass.keys()]
      .sort()
      .map(cls => ({ classCode: cls, label: CLASS_LABELS[cls] ?? `Clase ${cls}`, items: byClass.get(cls)! }));
  }

  get activeCount(): number { return this.items().filter(i => i.is_active).length; }
  get inactiveCount(): number { return this.items().filter(i => !i.is_active).length; }

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
