import { Component, Input, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ProjectService } from '../../../../services/project.service';
import {
  BudgetEntry, BudgetItem, BudgetMonthlyDistribution, Invoice, InvoiceRequest, InvoiceStatus,
} from '../../../../models/project.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';
import { BudgetPeriodStatusComponent } from '../../../../components/budget-period-status/budget-period-status.component';

const INVOICE_ROLES = ['ADMIN', 'SUPERVISOR', 'FINANCE'];

export interface InvoiceItemRow {
  budget_item_id:        string;
  concept:                string;
  component_name:         string; // budget_component (financiero)
  technical_name:         string; // technical_component
  total_value:            number;
  unit_measurement:       string | null;
  quantity:               number | null;
  monthly_distributions:  BudgetMonthlyDistribution[];
}

export interface InvoiceSection {
  component_id: string;
  name:         string;
  rows:         InvoiceItemRow[];
}

@Component({
  selector: 'app-tab-facturacion',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective, BudgetPeriodStatusComponent],
  templateUrl: './tab-facturacion.component.html',
})
export class TabFacturacionComponent implements OnInit {
  @Input() projectId!: string;

  private svc  = inject(ProjectService);
  private auth = inject(AuthStore);

  loading  = signal(true);
  error    = signal<string | null>(null);
  sections: InvoiceSection[] = [];
  search   = '';

  selectedItem     = signal<InvoiceItemRow | null>(null);
  invoices         = signal<Invoice[]>([]);
  invoicesLoading  = signal(false);
  invoicesError    = signal<string | null>(null);

  showForm    = signal(false);
  formSaving  = signal(false);
  formError   = signal<string | null>(null);

  form: {
    value:                  number | null;
    value_before_tax:       number | null;
    collection_act_number:  string;
    status:                 InvoiceStatus;
    period:                 string; // "" = componente completo, o "YYYY-M" tomado de monthly_distributions
    date:                   string;
    description:            string;
  } = this.emptyForm();

  readonly canCreate = computed(() => INVOICE_ROLES.includes(this.auth.user()?.role ?? ''));

  ngOnInit(): void {
    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: (w) => {
        this.sections = (w.components ?? []).map(comp => ({
          component_id: comp.component_id,
          name:         comp.name,
          rows: (comp.budget_entries ?? []).flatMap((entry: BudgetEntry) =>
            (entry.items ?? []).map((item: BudgetItem) => ({
              budget_item_id:        item.id,
              concept:               item.concept ?? '',
              component_name:        entry.name,
              technical_name:        comp.name,
              total_value:           item.total_value ?? 0,
              unit_measurement:      item.unit_measurement ?? null,
              quantity:              item.quantity ?? null,
              monthly_distributions: item.monthly_distributions ?? [],
            } as InvoiceItemRow))
          ),
        }));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el presupuesto del proyecto.');
        this.loading.set(false);
      },
    });
  }

  filteredSections(): InvoiceSection[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.sections;
    return this.sections
      .map(s => ({ ...s, rows: s.rows.filter(r => r.concept.toLowerCase().includes(q) || r.component_name.toLowerCase().includes(q)) }))
      .filter(s => s.rows.length > 0);
  }

  hasAnyRows(): boolean {
    return this.sections.some(s => s.rows.length > 0);
  }

  selectItem(row: InvoiceItemRow): void {
    this.selectedItem.set(row);
    this.cancelForm();
    this.loadItemAndInvoices(row.budget_item_id);
  }

  /** Carga en paralelo el ítem presupuestal (billed_amount actualizado por mes) y su historial de facturas. */
  private loadItemAndInvoices(bid: string): void {
    this.invoicesLoading.set(true);
    this.invoicesError.set(null);

    forkJoin({
      item:     this.svc.getBudgetItem(this.projectId, bid),
      invoices: this.svc.listInvoices(this.projectId, bid),
    }).subscribe({
      next: ({ item, invoices }) => {
        const current = this.selectedItem();
        if (current && current.budget_item_id === bid) {
          this.selectedItem.set({
            ...current,
            total_value:           item.total_value ?? current.total_value,
            unit_measurement:      item.unit_measurement ?? null,
            quantity:              item.quantity ?? null,
            monthly_distributions: item.monthly_distributions ?? [],
          });
        }
        this.invoices.set(invoices ?? []);
        this.invoicesLoading.set(false);
      },
      error: () => {
        this.invoicesError.set('No se pudo cargar el ítem o su historial de facturas.');
        this.invoicesLoading.set(false);
      },
    });
  }

  // ── Nueva factura ────────────────────────────────────────────────────────

  private emptyForm() {
    return {
      value: null as number | null,
      value_before_tax: null as number | null,
      collection_act_number: '',
      status: 'PEND' as InvoiceStatus,
      period: '',
      date: new Date().toISOString().slice(0, 10),
      description: '',
    };
  }

  periodValue(dist: BudgetMonthlyDistribution): string {
    return `${dist.year}-${dist.month}`;
  }

  monthLabel(period: { year: number; month: number }): string {
    const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${names[period.month - 1] ?? ''} ${period.year}`;
  }

  startForm(): void {
    this.form = this.emptyForm();
    this.formError.set(null);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.formError.set(null);
    this.form = this.emptyForm();
  }

  submitInvoice(): void {
    const item = this.selectedItem();
    if (!item || this.formSaving()) return;

    if (!this.form.value || this.form.value <= 0) {
      this.formError.set('El valor de la factura es requerido y debe ser mayor a 0.');
      return;
    }

    this.formSaving.set(true);
    this.formError.set(null);

    let year: number | undefined;
    let month: number | undefined;
    if (this.form.period) {
      const [y, m] = this.form.period.split('-').map(Number);
      year = y; month = m;
    }

    const payload: InvoiceRequest = {
      value: this.form.value,
      status: this.form.status,
      year, month,
      value_before_tax: this.form.value_before_tax ?? undefined,
      collection_act_number: this.form.collection_act_number.trim() || undefined,
      description: this.form.description.trim() || undefined,
      date: this.form.date ? `${this.form.date}T00:00:00Z` : undefined,
    };

    this.svc.createInvoice(this.projectId, item.budget_item_id, payload).subscribe({
      next: () => {
        this.formSaving.set(false);
        this.cancelForm();
        this.loadItemAndInvoices(item.budget_item_id);
      },
      error: (err) => {
        this.formSaving.set(false);
        this.formError.set(err?.error?.error ?? 'Error al registrar la factura. Verifica los datos.');
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }
  formatCompact(v: number): string {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  }

  trackByComp(_: number, s: InvoiceSection)   { return s.component_id; }
  trackByRow(_: number, r: InvoiceItemRow)    { return r.budget_item_id; }
}
