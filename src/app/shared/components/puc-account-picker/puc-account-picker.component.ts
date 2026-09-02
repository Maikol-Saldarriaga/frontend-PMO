import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PUCAccount } from '../../../../core/puc-accounts/models/puc-account.model';

/** Nombre de cada Clase del PUC (Decreto 2650/1993) por su primer dígito, para agrupar
 * visualmente los resultados de búsqueda en vez de mostrar una lista plana de 300+ cuentas. */
const CLASS_LABELS: Record<string, string> = {
  '1': '1 · Activo',
  '2': '2 · Pasivo',
  '3': '3 · Patrimonio',
  '4': '4 · Ingresos',
  '5': '5 · Gastos',
  '6': '6 · Costo de ventas',
  '7': '7 · Costos de producción',
  '8': '8 · Cuentas de orden deudoras',
  '9': '9 · Cuentas de orden acreedoras',
};

interface PucGroup {
  label: string;
  items: PUCAccount[];
}

/** Modal de búsqueda de cuentas PUC — escribe código o nombre para filtrar, agrupado por
 * clase. Reutilizable dondequiera que haya que elegir una cuenta PUC (hoy: pestaña Egresos). */
@Component({
  selector: 'app-puc-account-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './puc-account-picker.component.html',
})
export class PucAccountPickerComponent {
  @Input() open = false;
  @Input() accounts: PUCAccount[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() picked = new EventEmitter<PUCAccount>();

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  query = signal('');

  groups = computed<PucGroup[]>(() => {
    const q = this.query().trim().toLowerCase();
    const filtered = q
      ? this.accounts.filter(a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      : this.accounts;

    const byClass = new Map<string, PUCAccount[]>();
    for (const a of filtered) {
      const cls = a.code.charAt(0);
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls)!.push(a);
    }
    return [...byClass.keys()]
      .sort()
      .map(cls => ({ label: CLASS_LABELS[cls] ?? `Clase ${cls}`, items: byClass.get(cls)! }));
  });

  totalResults = computed(() => this.groups().reduce((n, g) => n + g.items.length, 0));

  ngOnChanges(): void {
    if (this.open) {
      this.query.set('');
      setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
    }
  }

  onQueryChange(value: string): void {
    this.query.set(value);
  }

  select(account: PUCAccount): void {
    this.picked.emit(account);
    this.close();
  }

  selectFirstMatch(): void {
    const first = this.groups()[0]?.items[0];
    if (first) this.select(first);
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
