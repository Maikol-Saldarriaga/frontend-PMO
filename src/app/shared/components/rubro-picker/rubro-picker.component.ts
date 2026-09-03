import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/** Un rubro con su presupuestado/ejecutado ya resueltos para el mes elegido en el formulario
 * de egreso — el picker no sabe de fechas, solo pinta lo que el padre ya calculó. */
export interface RubroPickerItem {
  budgetItemId:      string;
  concept:           string;
  presupuestadoMes:  number;
  ejecutadoMes:       number;
}

export interface RubroPickerGroup {
  technicalComponentName: string;
  items: RubroPickerItem[];
}

/** Modal de selección de rubro agrupado por Componente Técnico, mostrando por rubro una barra
 * de presupuestado vs. ejecutado del mes de la fecha elegida — mismo shell que
 * PucAccountPickerComponent, adaptado para mostrar esta métrica adicional. */
@Component({
  selector: 'app-rubro-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rubro-picker.component.html',
})
export class RubroPickerComponent {
  @Input() open = false;
  @Input() groups: RubroPickerGroup[] = [];
  @Input() monthLabel: string | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() picked = new EventEmitter<string>();

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  query = signal('');

  filteredGroups = computed<RubroPickerGroup[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.groups.filter(g => g.items.length);
    return this.groups
      .map(g => ({ ...g, items: g.items.filter(i => i.concept.toLowerCase().includes(q)) }))
      .filter(g => g.items.length);
  });

  totalResults = computed(() => this.filteredGroups().reduce((n, g) => n + g.items.length, 0));

  ngOnChanges(): void {
    if (this.open) {
      this.query.set('');
      setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
    }
  }

  onQueryChange(value: string): void {
    this.query.set(value);
  }

  select(item: RubroPickerItem): void {
    this.picked.emit(item.budgetItemId);
    this.close();
  }

  selectFirstMatch(): void {
    const first = this.filteredGroups()[0]?.items[0];
    if (first) this.select(first);
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  pct(item: RubroPickerItem): number {
    if (!item.presupuestadoMes) return item.ejecutadoMes > 0 ? 100 : 0;
    return Math.min(100, (item.ejecutadoMes / item.presupuestadoMes) * 100);
  }

  overBudget(item: RubroPickerItem): boolean {
    return item.presupuestadoMes > 0 && item.ejecutadoMes > item.presupuestadoMes;
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }
}
