import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService } from '../../../../services/project.service';
import {
  BudgetWizardResponse, BudgetEntry, BudgetItem, BudgetItemRequest, BUDGET_ITEM_UNIT_OPTIONS,
} from '../../../../models/project.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';

const PALETTE = ['#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];

export interface ItemRow {
  id:                        string;
  concept:                   string;
  description:               string;
  unit_measurement:          string;
  unit_value:                number | null;
  quantity:                  number | null;
  total_value:               number;
  counterpart_contribution:  number | null;
  ally_contribution:         number | null;
  start_date:                string | null; // "yyyy-MM-dd" para el input date
  expanded:                  boolean;
  dirty:                     boolean;
  saving:                    boolean;
  existingId:                string | null;
  rowError:                  string | null;
  rowSuccess:                boolean;
  savedTotalValue:           number; // último total_value persistido en el backend (0 si es un ítem nuevo)
}

export interface EntrySection {
  budget_component_id: string;
  name:                 string;
  company_contribution: number | null;
  ally_contribution:    number | null;
  total_contribution:   number | null;
  items:                ItemRow[];
  editingName:          boolean;
  nameDraft:            string;
  savingName:           boolean;
}

export interface ComponentSection {
  component_id:     string;
  name:             string;
  is_complete:      boolean;
  entries:          EntrySection[];
  budgetCap:        number | null; // presupuesto general del componente técnico
}

let rowSeq = 0;
const EMPTY_ITEM_ROW = (): ItemRow => ({
  id: `new-${++rowSeq}`,
  concept: '', description: '', unit_measurement: '',
  unit_value: null, quantity: null, total_value: 0,
  counterpart_contribution: null, ally_contribution: null,
  start_date: null,
  expanded: true, dirty: false, saving: false,
  existingId: null, rowError: null, rowSuccess: false,
  savedTotalValue: 0,
});

@Component({
  selector: 'app-tab-presupuesto',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './tab-presupuesto.component.html',
})
export class TabPresupuestoComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService, private rtr: Router) {}

  readonly unitOptions = BUDGET_ITEM_UNIT_OPTIONS;

  budgetWizard  = signal<BudgetWizardResponse | null>(null);
  budgetLoading = signal(true);
  saveMsg       = signal<string | null>(null);

  sections: ComponentSection[] = [];

  addingComponent      = signal(false);
  newComponentName     = '';
  newComponentTechId   = '';
  addingComponentError = signal<string | null>(null);
  addingComponentSaving = signal(false);

  budgetComponentTotals = computed(() => {
    return this.sections.map(s => ({
      name: s.name,
      is_complete: s.is_complete,
      total: this.compTotal(s),
      entries: s.entries.length,
      filled: s.entries.filter(e => e.items.length > 0).length,
    }));
  });

  budgetGrandTotal = computed(() => this.sections.reduce((s, sec) => s + this.compTotal(sec), 0));

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: (w: BudgetWizardResponse) => {
        this.budgetWizard.set(w);
        this.sections = this.mapWizard(w);
        this.budgetLoading.set(false);
      },
      error: () => this.budgetLoading.set(false),
    });
  }

  private mapWizard(w: BudgetWizardResponse): ComponentSection[] {
    return (w.components ?? []).map(comp => ({
      component_id: comp.component_id,
      name:         comp.name,
      is_complete:  comp.is_complete,
      budgetCap:    comp.budget ?? null,
      entries: (comp.budget_entries ?? []).map((entry: BudgetEntry) => ({
        budget_component_id:  entry.budget_component_id,
        name:                  entry.name,
        company_contribution:  entry.company_contribution,
        ally_contribution:     entry.ally_contribution,
        total_contribution:    entry.total_contribution,
        editingName:           false,
        nameDraft:             entry.name,
        savingName:            false,
        items: (entry.items ?? []).map((item: BudgetItem) => ({
          id:                        item.id,
          concept:                   item.concept ?? '',
          description:               item.description ?? '',
          unit_measurement:          item.unit_measurement ?? '',
          unit_value:                item.unit_value ?? null,
          quantity:                  item.quantity ?? null,
          total_value:               item.total_value ?? 0,
          counterpart_contribution:  item.counterpart_contribution ?? null,
          ally_contribution:         item.ally_contribution ?? null,
          start_date:                item.start_date ? item.start_date.slice(0, 10) : null,
          expanded:                  false,
          dirty:                     false,
          saving:                    false,
          existingId:                item.id,
          rowError:                  null,
          rowSuccess:                false,
          savedTotalValue:           item.total_value ?? 0,
        } as ItemRow)),
      } as EntrySection)),
    }));
  }

  // ── Totales ──────────────────────────────────────────────────────────────

  compTotal(s: ComponentSection): number {
    return s.entries.reduce((acc, e) => acc + (e.total_contribution ?? this.entryTotal(e)), 0);
  }
  compTotalCP(s: ComponentSection): number {
    return s.entries.reduce((acc, e) => acc + (e.company_contribution ?? e.items.reduce((a, r) => a + (r.counterpart_contribution ?? 0), 0)), 0);
  }
  compTotalAlly(s: ComponentSection): number {
    return s.entries.reduce((acc, e) => acc + (e.ally_contribution ?? e.items.reduce((a, r) => a + (r.ally_contribution ?? 0), 0)), 0);
  }
  entryTotal(e: EntrySection): number {
    return e.items.reduce((s, r) => s + r.total_value, 0);
  }
  grandTotalCP(): number {
    return this.sections.reduce((s, sec) => s + this.compTotalCP(sec), 0);
  }
  grandTotalAlly(): number {
    return this.sections.reduce((s, sec) => s + this.compTotalAlly(sec), 0);
  }

  /** Suma real de todos los ítems de presupuesto (todas las entries) del componente técnico. */
  compItemsTotal(s: ComponentSection): number {
    return s.entries.reduce((acc, e) => acc + this.entryTotal(e), 0);
  }
  capOverflow(s: ComponentSection): boolean {
    return s.budgetCap !== null && this.compItemsTotal(s) > s.budgetCap;
  }
  capRemaining(s: ComponentSection): number {
    return s.budgetCap !== null ? s.budgetCap - this.compItemsTotal(s) : 0;
  }
  capPct(s: ComponentSection): number {
    if (!s.budgetCap) return 0;
    return Math.min(100, Math.round((this.compItemsTotal(s) / s.budgetCap) * 100));
  }

  /** Estado real del componente técnico según su consumo de presupuesto (independiente de `is_complete` del backend). */
  sectionStatus(s: ComponentSection): { label: string; classes: string } {
    if (s.budgetCap !== null && s.budgetCap > 0 && this.compItemsTotal(s) >= s.budgetCap) {
      return { label: 'Completado', classes: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    }
    if (s.entries.length > 0) {
      return { label: 'En Asignación', classes: 'bg-accent-50 text-accent-700 border-accent-100' };
    }
    return { label: 'Pendiente', classes: 'bg-amber-50 text-amber-700 border-amber-100' };
  }

  color(i: number): string { return PALETTE[i % PALETTE.length]; }

  hasAnyEntries(): boolean {
    return this.sections.some(s => s.entries.length > 0);
  }

  // ── Sub-componentes de presupuesto (budget_component) ──────────────────────

  startAddComponent(): void {
    this.addingComponent.set(true);
    this.newComponentName = '';
    this.newComponentTechId = this.sections[0]?.component_id ?? '';
    this.addingComponentError.set(null);
  }

  cancelAddComponent(): void {
    this.addingComponent.set(false);
    this.newComponentName = '';
    this.newComponentTechId = '';
    this.addingComponentError.set(null);
  }

  saveNewComponent(): void {
    const name = this.newComponentName.trim();
    const techId = this.newComponentTechId;
    if (!name)   { this.addingComponentError.set('El nombre es requerido.'); return; }
    if (!techId) { this.addingComponentError.set('Selecciona un componente técnico.'); return; }

    this.addingComponentSaving.set(true);
    this.svc.createBudgetComponent(this.projectId, { component_id: techId, name }).subscribe({
      next: (bc) => {
        const sec = this.sections.find(s => s.component_id === techId);
        if (sec) {
          sec.entries.push({
            budget_component_id: bc.id,
            name:                 bc.name,
            company_contribution: bc.company_contribution,
            ally_contribution:    bc.ally_contribution,
            total_contribution:   bc.total_contribution,
            editingName:          false,
            nameDraft:            bc.name,
            savingName:           false,
            items:                [],
          });
        }
        this.addingComponentSaving.set(false);
        this.cancelAddComponent();
      },
      error: err => {
        this.addingComponentSaving.set(false);
        this.addingComponentError.set(err?.error?.message ?? 'Error al crear el componente de presupuesto.');
      },
    });
  }

  startEditEntryName(entry: EntrySection): void {
    entry.editingName = true;
    entry.nameDraft = entry.name;
  }

  cancelEditEntryName(entry: EntrySection): void {
    entry.editingName = false;
    entry.nameDraft = entry.name;
  }

  saveEntryName(entry: EntrySection): void {
    const name = entry.nameDraft.trim();
    if (!name || entry.savingName) return;
    entry.savingName = true;
    this.svc.updateBudgetComponent(this.projectId, entry.budget_component_id, { name }).subscribe({
      next: (bc) => {
        entry.name = bc.name;
        entry.editingName = false;
        entry.savingName = false;
      },
      error: () => {
        entry.savingName = false;
        this.showMsg('Error al renombrar el sub-componente.');
      },
    });
  }

  deleteEntry(sec: ComponentSection, entry: EntrySection): void {
    if (entry.items.length && !confirm(`"${entry.name}" tiene ${entry.items.length} ítem(s) de presupuesto. ¿Eliminar de todas formas?`)) return;
    if (!entry.items.length && !confirm(`¿Eliminar el sub-componente "${entry.name}"?`)) return;

    this.svc.deleteBudgetComponent(this.projectId, entry.budget_component_id).subscribe({
      next: () => {
        sec.entries = sec.entries.filter(e => e.budget_component_id !== entry.budget_component_id);
      },
      error: () => this.showMsg('Error al eliminar el sub-componente.'),
    });
  }

  // ── Ítems de presupuesto (budget_item) ──────────────────────────────────────

  addItemRow(entry: EntrySection): void {
    entry.items.push(EMPTY_ITEM_ROW());
  }

  markDirty(row: ItemRow): void { row.dirty = true; row.rowSuccess = false; row.rowError = null; }

  recalcTotal(row: ItemRow): void {
    row.total_value = (row.unit_value ?? 0) * (row.quantity ?? 0);
    row.dirty = true; row.rowSuccess = false; row.rowError = null;
  }

  toggleExpand(row: ItemRow): void { row.expanded = !row.expanded; }

  aportesTotal(row: ItemRow): number {
    return (row.counterpart_contribution ?? 0) + (row.ally_contribution ?? 0);
  }
  aportesOverflow(row: ItemRow): boolean {
    return this.aportesTotal(row) > row.total_value;
  }

  saveRow(sec: ComponentSection, entry: EntrySection, row: ItemRow): void {
    if (!row.dirty || row.saving) return;

    const missing: string[] = [];
    if (!row.concept?.trim())          missing.push('Concepto');
    if (!row.unit_measurement?.trim()) missing.push('Unidad de medida');
    if (!row.quantity)                 missing.push('Cantidad');
    if (!row.unit_value)               missing.push('Valor unitario');

    if (missing.length) {
      row.rowError = `Requeridos: ${missing.join(', ')}`;
      return;
    }

    const aportes = (row.counterpart_contribution ?? 0) + (row.ally_contribution ?? 0);
    if (aportes > row.total_value) {
      row.rowError = `Los aportes (${this.formatCurrency(aportes)}) no pueden superar el total del presupuesto (${this.formatCurrency(row.total_value)}).`;
      return;
    }

    if (sec.budgetCap !== null) {
      const projectedTotal = this.compItemsTotal(sec) - row.savedTotalValue + row.total_value;
      if (projectedTotal > sec.budgetCap) {
        row.rowError = `Este ítem haría que "${sec.name}" supere su presupuesto (${this.formatCurrency(sec.budgetCap)}). Quedarían ${this.formatCurrency(projectedTotal)} sumados entre todos sus componentes de presupuesto.`;
        return;
      }
    }

    row.rowError = null;
    row.saving = true;

    const payload: BudgetItemRequest = {
      budget_component_id:      entry.budget_component_id,
      concept:                  row.concept.trim(),
      description:              row.description,
      unit_measurement:         row.unit_measurement.trim(),
      unit_value:               row.unit_value   ?? 0,
      quantity:                 row.quantity     ?? 0,
      total_value:              row.total_value,
      counterpart_contribution: row.counterpart_contribution ?? 0,
      ally_contribution:        row.ally_contribution        ?? 0,
      start_date:               row.start_date ? `${row.start_date}T00:00:00Z` : undefined,
    };

    const isCreate = !row.existingId;
    const request$ = row.existingId
      ? this.svc.updateBudgetItem(this.projectId, row.existingId, payload)
      : this.svc.createBudgetItem(this.projectId, payload);

    request$.subscribe({
      next: (res) => {
        if (!row.existingId) row.existingId = res.id;
        row.dirty           = false;
        row.saving          = false;
        row.rowSuccess      = true;
        row.rowError        = null;
        row.savedTotalValue = row.total_value;
        row.expanded        = false;
        this.refreshEntryTotals(entry);
        this.refreshWizardMeta();

        // Al crear un ítem por primera vez, se genera automáticamente su distribución mensual.
        // Al editar uno existente no se regenera para no perder ajustes manuales ya hechos.
        if (isCreate && row.existingId && row.start_date && row.unit_measurement && row.quantity && row.quantity > 0 && Number.isInteger(row.quantity)) {
          this.svc.generateMonthly(this.projectId, row.existingId).subscribe({ next: () => {}, error: () => {} });
        }
      },
      error: () => {
        row.saving = false;
        this.showMsg('Error al guardar. Verifica los datos.');
      },
    });
  }

  deleteRow(entry: EntrySection, row: ItemRow): void {
    if (!row.existingId) {
      entry.items = entry.items.filter(r => r.id !== row.id);
      return;
    }

    if (!confirm(`¿Eliminar el ítem "${row.concept || 'sin concepto'}"? Esta acción no se puede revertir.`)) return;

    this.svc.deleteBudgetItem(this.projectId, row.existingId).subscribe({
      next: () => {
        entry.items = entry.items.filter(r => r.id !== row.id);
        this.refreshEntryTotals(entry);
        this.refreshWizardMeta();
      },
      error: () => this.showMsg('Error al eliminar el ítem.'),
    });
  }

  private refreshEntryTotals(entry: EntrySection): void {
    this.svc.getBudgetComponents(this.projectId).subscribe({
      next: (list) => {
        const bc = list.find(c => c.id === entry.budget_component_id);
        if (bc) {
          entry.company_contribution = bc.company_contribution;
          entry.ally_contribution    = bc.ally_contribution;
          entry.total_contribution   = bc.total_contribution;
        }
      },
    });
  }

  private refreshWizardMeta(): void {
    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: (w) => {
        this.budgetWizard.set(w);
        w.components.forEach(comp => {
          const sec = this.sections.find(s => s.component_id === comp.component_id);
          if (sec) {
            sec.is_complete = comp.is_complete;
            sec.budgetCap   = comp.budget ?? null;
          }
        });
      },
    });
  }

  private showMsg(msg: string): void {
    this.saveMsg.set(msg);
    setTimeout(() => this.saveMsg.set(null), 4000);
  }

  openMonthlyEditor(): void { this.rtr.navigate(['/projects', this.projectId, 'monthly']); }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }
  formatCompact(v: number): string {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  }

  trackByComp(_: number, s: ComponentSection)  { return s.component_id; }
  trackByEntry(_: number, e: EntrySection)     { return e.budget_component_id; }
  trackByRow (_: number, r: ItemRow)           { return r.id; }
}
