import { Component, Input, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ProjectService } from '../../../../services/project.service';
import {
  BudgetEntry, BudgetItem, BudgetMonthlyDistribution, Invoice, InvoiceRequest, InvoiceStatus,
  FundingReceipt, FundingReceiptRequest, FundingReceiptStatus,
} from '../../../../models/project.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';
import { BudgetPeriodStatusComponent } from '../../../../components/budget-period-status/budget-period-status.component';

const INVOICE_ROLES = ['ADMIN', 'COORDINADOR', 'FINANCE'];

interface ReceiptFormState {
  value:             number | null;
  value_before_tax:  number | null;
  receipt_date:      string | null;
  status:            FundingReceiptStatus;
  receipt_reference: string;
  observation:       string;
}

function emptyReceiptForm(): ReceiptFormState {
  return {
    value: null, value_before_tax: null,
    receipt_date: new Date().toISOString().slice(0, 10),
    status: 'planeado', receipt_reference: '', observation: '',
  };
}

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

  // ── Cobros reales recibidos (por factura) ───────────────────────────────
  expandedInvoiceId    = signal<string | null>(null);
  receiptsByInvoice    = signal<Record<string, FundingReceipt[]>>({});
  receiptsLoadingId    = signal<string | null>(null);
  receiptFormInvoiceId = signal<string | null>(null);
  receiptForm: ReceiptFormState = emptyReceiptForm();
  receiptSaving        = signal(false);
  receiptError         = signal<string | null>(null);
  deletingReceiptId    = signal<string | null>(null);

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
    this.expandedInvoiceId.set(null);
    this.receiptsByInvoice.set({});
    this.cancelReceiptForm();
    this.loadItemAndInvoices(row.budget_item_id);
  }

  /** Carga en paralelo el ítem presupuestal (billed_amount actualizado por mes) y su historial de facturas.
   * Los cobros de CADA factura también se cargan de una vez aquí (no solo al expandir) para que el chip
   * "Cobrado $X / $Y" de la lista sea correcto desde el primer render — antes se quedaba en $0 hasta que
   * el usuario hacía click para expandir esa factura en particular. */
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
        this.loadAllReceipts(bid, invoices ?? []);
      },
      error: () => {
        this.invoicesError.set('No se pudo cargar el ítem o su historial de facturas.');
        this.invoicesLoading.set(false);
      },
    });
  }

  private loadAllReceipts(bid: string, invoices: Invoice[]): void {
    if (!invoices.length) { this.receiptsByInvoice.set({}); return; }
    forkJoin(
      invoices.reduce((acc, inv) => {
        acc[inv.id] = this.svc.listFundingReceipts(this.projectId, bid, inv.id);
        return acc;
      }, {} as Record<string, ReturnType<ProjectService['listFundingReceipts']>>)
    ).subscribe({
      next: byInvoiceId => this.receiptsByInvoice.set(byInvoiceId as Record<string, FundingReceipt[]>),
      error: () => {},
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

  // ── Cobros reales recibidos (por factura) ───────────────────────────────

  toggleInvoiceReceipts(invoice: Invoice): void {
    if (this.expandedInvoiceId() === invoice.id) {
      this.expandedInvoiceId.set(null);
      return;
    }
    this.expandedInvoiceId.set(invoice.id);
    this.cancelReceiptForm();
    if (!this.receiptsByInvoice()[invoice.id]) {
      this.loadReceipts(invoice);
    }
  }

  private loadReceipts(invoice: Invoice): void {
    const item = this.selectedItem();
    if (!item) return;
    this.receiptsLoadingId.set(invoice.id);
    this.svc.listFundingReceipts(this.projectId, item.budget_item_id, invoice.id).subscribe({
      next: list => {
        this.receiptsByInvoice.update(m => ({ ...m, [invoice.id]: list ?? [] }));
        this.receiptsLoadingId.set(null);
      },
      error: () => this.receiptsLoadingId.set(null),
    });
  }

  receiptsFor(invoiceId: string): FundingReceipt[] {
    return this.receiptsByInvoice()[invoiceId] ?? [];
  }

  collectedFor(invoiceId: string): number {
    return this.receiptsFor(invoiceId).reduce((s, r) => s + (r.value ?? 0), 0);
  }

  /** Totales del ítem seleccionado, para el resumen de "control de cobros" arriba de la lista. */
  totalInvoiced = computed(() => this.invoices().reduce((s, i) => s + (i.value ?? 0), 0));
  totalCollected = computed(() => this.invoices().reduce((s, i) => s + this.collectedFor(i.id), 0));
  collectionPct = computed(() => {
    const total = this.totalInvoiced();
    return total > 0 ? Math.min(100, Math.round((this.totalCollected() / total) * 100)) : 0;
  });

  startReceiptForm(invoice: Invoice): void {
    this.receiptFormInvoiceId.set(invoice.id);
    this.receiptForm = emptyReceiptForm();
    this.receiptError.set(null);
  }

  cancelReceiptForm(): void {
    this.receiptFormInvoiceId.set(null);
    this.receiptError.set(null);
    this.receiptForm = emptyReceiptForm();
  }

  submitReceipt(invoice: Invoice): void {
    const item = this.selectedItem();
    if (!item || this.receiptSaving()) return;

    if (!this.receiptForm.value || this.receiptForm.value <= 0) {
      this.receiptError.set('El valor del cobro es requerido y debe ser mayor a 0.');
      return;
    }

    this.receiptSaving.set(true);
    this.receiptError.set(null);

    const payload: FundingReceiptRequest = {
      value:              this.receiptForm.value,
      value_before_tax:   this.receiptForm.value_before_tax ?? undefined,
      receipt_date:       this.receiptForm.receipt_date || null,
      status:             this.receiptForm.status,
      receipt_reference:  this.receiptForm.receipt_reference.trim() || null,
      observation:        this.receiptForm.observation.trim() || null,
    };

    this.svc.createFundingReceipt(this.projectId, item.budget_item_id, invoice.id, payload).subscribe({
      next: () => {
        this.receiptSaving.set(false);
        this.cancelReceiptForm();
        this.loadReceipts(invoice);
      },
      error: err => {
        this.receiptSaving.set(false);
        this.receiptError.set(err?.error?.message ?? 'Error al registrar el cobro.');
      },
    });
  }

  deleteReceipt(invoice: Invoice, receipt: FundingReceipt): void {
    const item = this.selectedItem();
    if (!item) return;
    if (!confirm('¿Eliminar este cobro registrado?')) return;
    this.deletingReceiptId.set(receipt.id);
    this.svc.deleteFundingReceipt(this.projectId, item.budget_item_id, invoice.id, receipt.id).subscribe({
      next: () => {
        this.receiptsByInvoice.update(m => ({ ...m, [invoice.id]: (m[invoice.id] ?? []).filter(r => r.id !== receipt.id) }));
        this.deletingReceiptId.set(null);
      },
      error: () => this.deletingReceiptId.set(null),
    });
  }

  receiptStatusLabel(s: FundingReceiptStatus): string {
    return s === 'recibido' ? 'Recibido' : 'Planeado';
  }

  trackByInvoiceRow(_: number, i: Invoice) { return i.id; }
  trackByReceipt(_: number, r: FundingReceipt) { return r.id; }

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
