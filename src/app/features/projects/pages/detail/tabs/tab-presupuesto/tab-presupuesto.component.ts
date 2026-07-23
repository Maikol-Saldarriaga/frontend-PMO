import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService } from '../../../../services/project.service';
import {
  BudgetWizardResponse, BudgetEntry, BudgetItem, BUDGET_ITEM_UNIT_OPTIONS,
} from '../../../../models/project.model';
import { BudgetItemPanelComponent, BudgetPanelContext } from './budget-item-panel/budget-item-panel.component';

const PALETTE = ['#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];
const AMOUNT_EPSILON = 0.01;

export interface EntrySection {
  budget_component_id: string;
  name:                 string;
  company_contribution: number | null;
  ally_contribution:    number | null;
  total_contribution:   number | null;
  items:                BudgetItem[];
  editingName:          boolean;
  nameDraft:            string;
  savingName:           boolean;
}

export interface ComponentSection {
  component_id:     string;
  name:             string;
  percentage:       number;
  is_complete:      boolean;
  entries:          EntrySection[];
  budgetCap:        number | null; // presupuesto general del componente técnico
  editingBudget:    boolean;
  budgetDraft:      number | null;
  savingBudget:     boolean;
  budgetError:      string | null;
}

@Component({
  selector: 'app-tab-presupuesto',
  standalone: true,
  imports: [CommonModule, FormsModule, BudgetItemPanelComponent],
  templateUrl: './tab-presupuesto.component.html',
})
export class TabPresupuestoComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ProjectService, private rtr: Router) {}

  readonly unitOptions = BUDGET_ITEM_UNIT_OPTIONS;

  budgetWizard  = signal<BudgetWizardResponse | null>(null);
  budgetLoading = signal(true);
  saveMsg       = signal<string | null>(null);

  /** Presupuesto general del proyecto (Step 1), tope absoluto de la suma de todos los rubros. */
  projectTotalBudget = signal<number | null>(null);

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
    this.svc.getProjectDetails(this.projectId).subscribe({
      next: d => this.projectTotalBudget.set(d.value ?? null),
      error: () => this.projectTotalBudget.set(null),
    });
    this.load();
  }

  private load(): void {
    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: (w: BudgetWizardResponse) => {
        this.budgetWizard.set(w);
        this.sections = this.mapWizard(w);
        this.budgetLoading.set(false);
        this.syncPanelAfterReload();
      },
      error: () => this.budgetLoading.set(false),
    });
  }

  private mapWizard(w: BudgetWizardResponse): ComponentSection[] {
    return (w.components ?? []).map(comp => ({
      component_id: comp.component_id,
      name:         comp.name,
      percentage:   comp.percentage,
      is_complete:  comp.is_complete,
      budgetCap:    comp.budget ?? null,
      editingBudget: false,
      budgetDraft:   comp.budget ?? null,
      savingBudget:  false,
      budgetError:   null,
      entries: (comp.budget_entries ?? []).map((entry: BudgetEntry) => ({
        budget_component_id:  entry.budget_component_id,
        name:                  entry.name,
        company_contribution:  entry.company_contribution,
        ally_contribution:     entry.ally_contribution,
        total_contribution:    entry.total_contribution,
        editingName:           false,
        nameDraft:             entry.name,
        savingName:            false,
        items:                 entry.items ?? [],
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

  /** Suma de los topes ya asignados a los demás componentes técnicos (para calcular cuánto queda disponible del presupuesto general). */
  otherCapsTotal(s: ComponentSection): number {
    return this.sections
      .filter(x => x.component_id !== s.component_id)
      .reduce((acc, x) => acc + (x.budgetCap ?? 0), 0);
  }

  /** Cuánto del presupuesto general del proyecto (Step 1) queda disponible para asignarle de tope a este componente. */
  projectHeadroomFor(s: ComponentSection): number | null {
    const total = this.projectTotalBudget();
    if (total === null) return null;
    return total - this.otherCapsTotal(s);
  }

  startEditBudget(s: ComponentSection): void {
    s.editingBudget = true;
    s.budgetDraft = s.budgetCap;
    s.budgetError = null;
  }

  cancelEditBudget(s: ComponentSection): void {
    s.editingBudget = false;
    s.budgetDraft = s.budgetCap;
    s.budgetError = null;
  }

  saveBudget(s: ComponentSection): void {
    if (s.savingBudget) return;
    const draft = s.budgetDraft;
    s.budgetError = null;

    if (draft !== null && draft < 0) {
      s.budgetError = 'El presupuesto no puede ser negativo.';
      return;
    }

    if (draft !== null) {
      const consumed = this.compItemsTotal(s);
      if (draft < consumed - AMOUNT_EPSILON) {
        s.budgetError = `No puedes bajar el tope por debajo de lo ya distribuido (${this.formatCurrency(consumed)}). Reduce primero la distribución del rubro.`;
        return;
      }
      const headroom = this.projectHeadroomFor(s);
      if (headroom !== null && draft > headroom + AMOUNT_EPSILON) {
        s.budgetError = `Ese tope superaría el presupuesto general del proyecto. Disponible para este componente: ${this.formatCurrency(Math.max(0, headroom))}.`;
        return;
      }
    }

    s.savingBudget = true;
    this.svc.updateComponent(this.projectId, s.component_id, {
      name: s.name,
      percentage: s.percentage,
      budget: draft,
    }).subscribe({
      next: (comp) => {
        s.budgetCap = comp.budget ?? null;
        s.budgetDraft = s.budgetCap;
        s.savingBudget = false;
        s.editingBudget = false;
      },
      error: err => {
        s.savingBudget = false;
        s.budgetError = err?.error?.error ?? err?.error?.message ?? 'Error al actualizar el presupuesto del componente.';
      },
    });
  }

  color(i: number): string { return PALETTE[i % PALETTE.length]; }

  hasAnyEntries(): boolean {
    return this.sections.some(s => s.entries.length > 0);
  }

  periodicityLabel(value: string | null): string {
    return this.unitOptions.find(o => o.value === value)?.label ?? (value || '—');
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

  // ── Ítems de presupuesto (budget_item) — edición en el panel lateral ───────

  panelOpen    = signal(false);
  panelContext = signal<BudgetPanelContext | null>(null);
  private panelSection: ComponentSection | null = null;

  openNewItem(sec: ComponentSection, entry: EntrySection): void {
    this.panelSection = sec;
    this.panelContext.set({
      budgetComponentId:   entry.budget_component_id,
      budgetComponentName: entry.name,
      item:                null,
      sectionBudgetCap:    sec.budgetCap,
      otherItemsTotal:     this.compItemsTotal(sec),
    });
    this.panelOpen.set(true);
  }

  editItem(sec: ComponentSection, entry: EntrySection, item: BudgetItem): void {
    this.panelSection = sec;
    this.panelContext.set({
      budgetComponentId:   entry.budget_component_id,
      budgetComponentName: entry.name,
      item,
      sectionBudgetCap:    sec.budgetCap,
      otherItemsTotal:     this.compItemsTotal(sec) - item.total_value,
    });
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.panelContext.set(null);
    this.panelSection = null;
  }

  onPanelSaved(): void {
    this.load();
  }

  onPanelDeleted(): void {
    this.closePanel();
    this.load();
  }

  /** Tras recargar (ítem creado/editado/eliminado desde el panel), refresca el contexto del
   * panel si sigue abierto, para que sus totales de tope reflejen los datos ya persistidos. */
  private syncPanelAfterReload(): void {
    if (!this.panelOpen() || !this.panelSection) return;
    const sec = this.sections.find(s => s.component_id === this.panelSection!.component_id);
    if (!sec) return;
    this.panelSection = sec;
    const ctx = this.panelContext();
    if (!ctx) return;
    const entry = sec.entries.find(e => e.budget_component_id === ctx.budgetComponentId);
    const item = ctx.item ? entry?.items.find(i => i.id === ctx.item!.id) ?? null : null;
    this.panelContext.set({
      ...ctx,
      item,
      sectionBudgetCap: sec.budgetCap,
      otherItemsTotal:  this.compItemsTotal(sec) - (item?.total_value ?? 0),
    });
  }

  deleteItemQuick(sec: ComponentSection, entry: EntrySection, item: BudgetItem): void {
    if (!confirm(`¿Eliminar el ítem "${item.concept || 'sin concepto'}"? Esta acción no se puede revertir.`)) return;
    this.svc.deleteBudgetItem(this.projectId, item.id).subscribe({
      next: () => this.load(),
      error: () => this.showMsg('Error al eliminar el ítem.'),
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
  trackByItem(_: number, i: BudgetItem)        { return i.id; }
}
