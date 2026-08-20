import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BudgetCatalogService } from '../../../../../core/budget-catalog/services/budget-catalog.service';
import { BudgetComponentCatalogItem, BudgetComponentCatalogRequest, BudgetCostType } from '../../../../../core/budget-catalog/models/budget-catalog.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

interface CatalogForm {
  name:       string;
  cost_type:  BudgetCostType;
  sort_order: number;
}

function emptyForm(): CatalogForm {
  return { name: '', cost_type: 'directo', sort_order: 0 };
}

@Component({
  selector: 'app-budget-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './budget-catalog.component.html',
})
export class BudgetCatalogComponent implements OnInit {
  private svc = inject(BudgetCatalogService);
  private confirmDialog = inject(ConfirmDialogService);

  items       = signal<BudgetComponentCatalogItem[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');

  showForm     = signal(false);
  editingItem  = signal<BudgetComponentCatalogItem | null>(null);
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
        this.items.set([...items].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudo cargar el catálogo de rubros.'); this.loading.set(false); },
    });
  }

  onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
  }

  get filteredItems(): BudgetComponentCatalogItem[] {
    const status = this.statusFilter();
    if (status === 'all') return this.items();
    return this.items().filter(i => (status === 'active') === i.is_active);
  }

  openAddForm(): void {
    this.editingItem.set(null);
    this.form = emptyForm();
    this.saveError.set(null);
    this.showForm.set(true);
  }

  openEditForm(item: BudgetComponentCatalogItem): void {
    this.editingItem.set(item);
    this.form = { name: item.name, cost_type: item.cost_type, sort_order: item.sort_order };
    this.saveError.set(null);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  save(): void {
    if (this.saving()) return;
    const name = this.form.name.trim();
    if (!name) {
      this.saveError.set('El nombre es obligatorio.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const payload: BudgetComponentCatalogRequest = {
      name,
      cost_type: this.form.cost_type,
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
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar el rubro del catálogo.');
      },
    });
  }

  async deactivate(item: BudgetComponentCatalogItem): Promise<void> {
    if (!(await this.confirmDialog.confirm({ message: `¿Desactivar el rubro "${item.name}"? Los rubros ya creados a partir de él no se verán afectados.` }))) return;
    this.svc.deactivate(item.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Error al desactivar el rubro.'),
    });
  }

  costTypeLabel(t: BudgetCostType): string {
    return t === 'directo' ? 'Directo' : 'Indirecto';
  }

  trackById(_: number, i: BudgetComponentCatalogItem) { return i.id; }
}
