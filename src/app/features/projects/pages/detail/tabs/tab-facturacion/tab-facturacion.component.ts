import { Component, Input, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { ProjectService } from '../../../../services/project.service';
import { ContractService } from '../../../../services/contract.service';
import { ContractResponse } from '../../../../models/contract.model';
import {
  BudgetEntry, BudgetItem, BudgetMonthlyDistribution, Invoice, InvoiceRequest, InvoiceStatus,
  FundingReceipt, FundingReceiptRequest, FundingReceiptStatus,
} from '../../../../models/project.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { PortalToBodyDirective } from '../../../../../../shared/directives/portal-to-body.directive';
import { BudgetPeriodStatusComponent } from '../../../../components/budget-period-status/budget-period-status.component';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';

const AMOUNT_EPSILON = 0.01;
/** Misma paleta usada en el tab Presupuesto, para que cada componente técnico se vea con el mismo color en ambas pestañas. */
const PALETTE = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

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
    // Un cobro se registra cuando el dinero YA se recibió — no existe un "planeado" para
    // un cobro (eso es lo que representa la factura misma antes de cobrarse).
    status: 'recibido', receipt_reference: '', observation: '',
  };
}

export interface InvoiceItemRow {
  budget_item_id:        string;
  concept:                string;
  component_name:         string; // budget_component (financiero)
  technical_name:         string; // technical_component
  technical_component_id: string;
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
  imports: [CommonModule, FormsModule, RouterLink, MoneyMaskDirective, BudgetPeriodStatusComponent, PortalToBodyDirective],
  templateUrl: './tab-facturacion.component.html',
})
export class TabFacturacionComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  private svc  = inject(ProjectService);
  private contractSvc = inject(ContractService);
  private confirmDialog = inject(ConfirmDialogService);

  // ── Reporte de presupuesto (planeado/ejecutado/facturación/desembolsos/flujo de caja) ──
  reportPanelOpen = signal(false);
  reportMode: 'month' | 'range' = 'month';
  reportFormat: 'pdf' | 'xlsx' = 'pdf';
  reportYear = new Date().getFullYear();
  reportMonth = new Date().getMonth() + 1;
  reportFromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  reportToDate = new Date().toISOString().slice(0, 10);
  reportGenerating = signal(false);
  reportError = signal<string | null>(null);
  readonly reportYearOptions = (() => {
    const y = new Date().getFullYear();
    const years: number[] = [];
    for (let i = y - 3; i <= y + 1; i++) years.push(i);
    return years;
  })();
  readonly reportMonthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  openReportPanel(): void {
    this.reportError.set(null);
    this.reportPanelOpen.set(true);
  }
  closeReportPanel(): void {
    this.reportPanelOpen.set(false);
  }

  generateReport(): void {
    if (this.reportGenerating()) return;
    if (this.reportMode === 'range' && this.reportFromDate > this.reportToDate) {
      this.reportError.set('La fecha inicial no puede ser posterior a la final.');
      return;
    }
    this.reportGenerating.set(true);
    this.reportError.set(null);

    const params = this.reportMode === 'month'
      ? { format: this.reportFormat, year: this.reportYear, month: this.reportMonth }
      : { format: this.reportFormat, from_date: this.reportFromDate, to_date: this.reportToDate };

    this.svc.downloadBudgetReport(this.projectId, params).subscribe({
      next: blob => {
        this.reportGenerating.set(false);
        const period = this.reportMode === 'month'
          ? `${this.reportYear}-${String(this.reportMonth).padStart(2, '0')}`
          : `${this.reportFromDate}_${this.reportToDate}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-presupuesto-${period}.${this.reportFormat}`;
        a.click();
        URL.revokeObjectURL(url);
        this.closeReportPanel();
      },
      error: () => {
        this.reportGenerating.set(false);
        this.reportError.set('No se pudo generar el reporte. Verifica que haya datos en el período seleccionado.');
      },
    });
  }

  loading  = signal(true);
  error    = signal<string | null>(null);
  sections: InvoiceSection[] = [];
  search   = '';

  // ── Configuración de administración/IVA del proyecto (cargada una vez) ──
  ivaPercentage      = signal(19);
  appliesAdminFee    = signal(false);
  adminFeePercentage = signal<number | null>(null);

  /** Estimado en vivo del % de administración sobre el valor que se está digitando en el
   * formulario de factura — el monto real lo calcula y guarda el backend al facturar. Usa los
   * valores del propio formulario (editables ahí mismo), no los del proyecto ya guardados,
   * para que el estimado reaccione al toggle/porcentaje antes de guardar. Es un método (no un
   * computed()) porque `form` es un objeto plano mutado directamente, no un signal. */
  formAdminFeeEstimate(): { fee: number; net: number } | null {
    if (!this.form.applies_admin_fee || this.form.admin_fee_percentage == null || !this.form.value) return null;
    const fee = this.form.value * (this.form.admin_fee_percentage / 100);
    return { fee, net: this.form.value - fee };
  }

  onFormAdminToggle(applies: boolean): void {
    this.form.applies_admin_fee = applies;
    if (!applies) this.form.admin_fee_percentage = null;
  }

  selectedItem     = signal<InvoiceItemRow | null>(null);
  invoices         = signal<Invoice[]>([]);
  invoicesLoading  = signal(false);
  invoicesError    = signal<string | null>(null);

  /** Sub-vista dentro del ítem seleccionado: facturación (emisión), cobros (recaudo real) y
   * distribución mensual, cada una en su propia pantalla para que ninguna quede oculta por scroll. */
  facturacionView   = signal<'facturas' | 'cobros' | 'periodo'>('facturas');
  highlightedInvoiceId = signal<string | null>(null);

  goToCobros(inv: Invoice): void {
    this.highlightedInvoiceId.set(inv.id);
    this.facturacionView.set('cobros');
  }

  /** Pendiente por cobrar del ítem seleccionado (facturado - cobrado real). */
  totalPending = computed(() => Math.max(0, this.totalInvoiced() - this.totalCollected()));

  /** Pendiente por facturar del ítem seleccionado (presupuestado - ya facturado) — lo que
   * todavía se puede facturar contra este rubro sin superar su tope presupuestal. */
  totalPendingToInvoice = computed(() => Math.max(0, (this.selectedItem()?.total_value ?? 0) - this.totalInvoiced()));

  showForm    = signal(false);
  formSaving  = signal(false);
  formError   = signal<string | null>(null);
  editingInvoiceId = signal<string | null>(null);

  form: {
    value:                  number | null;
    value_before_tax:       number | null;
    no_iva:                 boolean;
    collection_act_number:  string;
    status:                 InvoiceStatus;
    period:                 string; // "" = componente completo, o "YYYY-M" tomado de monthly_distributions
    date:                   string;
    description:            string;
    // Configuración de administración/IVA del PROYECTO, editable aquí mismo — se guarda contra
    // el contrato (no por factura) justo antes de registrar/actualizar esta factura si cambió.
    applies_admin_fee:      boolean;
    admin_fee_percentage:   number | null;
    iva_percentage:         number;
  } = this.emptyForm();

  /** El candado real de esta pestaña: full_access, owner, coordinador, o un miembro de equipo
   * con acceso personalizado de escritura a la sección 'finance' del proyecto — no un rol
   * global fijo, para que un coordinador o alguien con permiso individual sí puedan facturar. */
  canCreate(): boolean {
    return !this.locked;
  }

  // ── Cobros reales recibidos (por factura) ───────────────────────────────
  receiptsByInvoice    = signal<Record<string, FundingReceipt[]>>({});
  receiptsLoadingId    = signal<string | null>(null);
  receiptFormInvoiceId = signal<string | null>(null);
  receiptForm: ReceiptFormState = emptyReceiptForm();
  receiptSaving        = signal(false);
  receiptError         = signal<string | null>(null);
  deletingReceiptId    = signal<string | null>(null);

  ngOnInit(): void {
    this.svc.getProject(this.projectId).subscribe({
      next: p => {
        this.ivaPercentage.set(p.iva_percentage ?? 19);
        this.appliesAdminFee.set(p.applies_admin_fee ?? false);
        this.adminFeePercentage.set(p.admin_fee_percentage ?? null);
      },
      error: () => {},
    });

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
              technical_component_id: comp.component_id,
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

  /** Resumen general del presupuesto (todos los componentes/ítems), mostrado bajo la lista
   * de la izquierda para aprovechar el espacio que deja libre cuando tiene pocos ítems. */
  totalComponentsCount(): number { return this.sections.filter(s => s.rows.length > 0).length; }

  /** Color estable por componente técnico (mismo índice/orden que en Presupuesto), independiente del filtro de búsqueda. */
  colorForComponent(componentId: string): string {
    const i = this.sections.findIndex(s => s.component_id === componentId);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  }
  totalItemsCount(): number { return this.sections.reduce((s, sec) => s + sec.rows.length, 0); }
  totalProjectBudget(): number { return this.sections.reduce((s, sec) => s + sec.rows.reduce((rs, r) => rs + (r.total_value ?? 0), 0), 0); }

  selectItem(row: InvoiceItemRow): void {
    this.selectedItem.set(row);
    this.editingInvoiceId.set(null);
    this.cancelForm();
    this.facturacionView.set('facturas');
    this.highlightedInvoiceId.set(null);
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
      no_iva: false,
      collection_act_number: '',
      status: 'PEND' as InvoiceStatus,
      period: '',
      date: this.todayLocalDate(),
      description: '',
      // Precargados con la configuración actual del proyecto — editables en el formulario.
      applies_admin_fee: this.appliesAdminFee(),
      admin_fee_percentage: this.adminFeePercentage(),
      iva_percentage: this.ivaPercentage(),
    };
  }

  /** "Hoy" en fecha local (no `toISOString()`, que primero pasa a UTC y cerca de
   * medianoche en Bogotá ya cruzó al día siguiente, precargando la fecha equivocada). */
  private todayLocalDate(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Convierte fecha ISO UTC (ej. "2025-12-01T00:00:00Z") a "YYYY-MM-DD" usando los
   * componentes UTC, no locales — evita el corrimiento de un día al restar el offset
   * de Bogotá (UTC-5) sobre una medianoche UTC. */
  private isoToDateInput(iso: string): string {
    const d = new Date(iso);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  periodValue(dist: BudgetMonthlyDistribution): string {
    return `${dist.year}-${dist.month}`;
  }

  monthLabel(period: { year: number; month: number }): string {
    const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${names[period.month - 1] ?? ''} ${period.year}`;
  }

  /** Todos los meses de distribución del ítem, siempre disponibles para facturar — facturar
   * más de lo planeado/presupuestado está permitido a propósito (el backend ya no lo bloquea),
   * así que un mes ya completado no desaparece del selector: se puede seguir facturando sobre
   * él, y el usuario ve la advertencia correspondiente (ver [invoiceOverageWarning]). */
  availableMonths = computed(() => this.selectedItem()?.monthly_distributions ?? []);

  /** Ya facturado en un período dado (excluyendo la factura que se está editando, si aplica). */
  private billedByPeriodMap = computed(() => {
    const editingId = this.editingInvoiceId();
    const map = new Map<string, number>();
    for (const inv of this.invoices()) {
      if (inv.year == null || inv.month == null || inv.id === editingId) continue;
      const key = `${inv.year}-${inv.month}`;
      map.set(key, (map.get(key) ?? 0) + inv.value);
    }
    return map;
  });

  billedForPeriod(dist: BudgetMonthlyDistribution): number {
    return this.billedByPeriodMap().get(this.periodValue(dist)) ?? 0;
  }

  programmedForPeriod(dist: BudgetMonthlyDistribution): number {
    return dist.counterpart_amount + dist.ally_amount;
  }

  /** true si ese período ya alcanzó o superó lo programado — se usa solo para avisar en el
   * selector (⚠), nunca para bloquearlo. */
  periodExceeded(dist: BudgetMonthlyDistribution): boolean {
    return this.billedForPeriod(dist) >= this.programmedForPeriod(dist) - AMOUNT_EPSILON;
  }

  /** Advertencia NO bloqueante: si el valor que se está por guardar supera lo programado para
   * el período elegido y/o el total presupuestado del rubro, se avisa aquí — pero la factura
   * se puede guardar igual (facturar de más está permitido intencionalmente). */
  invoiceOverageWarning(): string | null {
    const item = this.selectedItem();
    if (!item || !this.form.value) return null;
    const messages: string[] = [];

    if (this.form.period) {
      const dist = item.monthly_distributions.find(d => this.periodValue(d) === this.form.period);
      if (dist) {
        const totalPeriod = this.billedForPeriod(dist) + this.form.value;
        const programmed = this.programmedForPeriod(dist);
        if (totalPeriod > programmed + AMOUNT_EPSILON) {
          messages.push(`Supera lo programado para ${this.monthLabel(dist)} por ${this.formatCurrency(totalPeriod - programmed)}.`);
        }
      }
    }

    const editingId = this.editingInvoiceId();
    const alreadyInvoiced = this.invoices().reduce((s, inv) => inv.id === editingId ? s : s + inv.value, 0);
    const totalItem = alreadyInvoiced + this.form.value;
    if (totalItem > item.total_value + AMOUNT_EPSILON) {
      messages.push(`Supera el presupuesto total del rubro por ${this.formatCurrency(totalItem - item.total_value)}.`);
    }

    return messages.length ? messages.join(' ') : null;
  }

  /** Valor antes de IVA = valor / (1 + iva%/100), usando el % de IVA del propio formulario
   * (editable ahí mismo, precargado con el del proyecto), salvo que la factura esté marcada
   * "No incluye IVA", en cuyo caso valor antes de IVA = valor. No editable a mano. */
  onFormValueChange(value: number | null): void {
    this.form.value = value;
    const factor = 1 + (this.form.iva_percentage || 0) / 100;
    this.form.value_before_tax = value ? (this.form.no_iva ? value : Math.round((value / factor) * 100) / 100) : null;
  }

  onFormNoIvaChange(noIva: boolean): void {
    this.form.no_iva = noIva;
    this.onFormValueChange(this.form.value);
  }

  onFormIvaChange(iva: number | null): void {
    this.form.iva_percentage = iva ?? 0;
    this.onFormValueChange(this.form.value);
  }

  startForm(): void {
    this.editingInvoiceId.set(null);
    this.form = this.emptyForm();
    this.formError.set(null);
    this.showForm.set(true);
  }

  /** Edición permitida mientras la factura no tenga ningún cobro ya RECIBIDO (ver
   * [canEditInvoice]) — cobros en estado "planeado" no bloquean, igual que el backend. */
  startEditInvoice(inv: Invoice): void {
    this.editingInvoiceId.set(inv.id);
    this.form = {
      value: inv.value,
      value_before_tax: inv.value_before_tax,
      no_iva: inv.value_before_tax != null && Math.abs(inv.value_before_tax - inv.value) < AMOUNT_EPSILON,
      collection_act_number: inv.collection_act_number ?? '',
      status: inv.status,
      period: inv.year != null && inv.month != null ? `${inv.year}-${inv.month}` : '',
      date: this.isoToDateInput(inv.date),
      description: inv.description ?? '',
      applies_admin_fee: this.appliesAdminFee(),
      admin_fee_percentage: this.adminFeePercentage(),
      // Precargado con el % de IVA REAL de esta factura (derivado de su propio value/
      // value_before_tax), no el del proyecto — así se ve y se puede corregir lo que
      // realmente quedó facturado, y ese ajuste es justo lo que luego hereda el cobro.
      iva_percentage: this.invoiceIvaPercentage(inv),
    };
    this.formError.set(null);
    this.showForm.set(true);
  }

  /** Coincide con la regla real del backend: solo bloquea si ya existe un cobro en estado
   * "recibido" contra esta factura — uno "planeado" no impide seguir editándola (incluido
   * su % de IVA), para que ese ajuste se refleje al calcular cobros futuros. */
  canEditInvoice(inv: Invoice): boolean {
    return !this.receiptsFor(inv.id).some(r => r.status === 'recibido');
  }

  deletingInvoiceId = signal<string | null>(null);

  /** Elimina la factura — el backend hace cascada sobre sus cobros (ON DELETE CASCADE), así
   * que se advierte explícitamente al usuario antes de confirmar cuando ya tiene cobros. */
  async deleteInvoice(inv: Invoice): Promise<void> {
    const item = this.selectedItem();
    if (!item || this.deletingInvoiceId()) return;

    const receiptCount = this.receiptsFor(inv.id).length;
    const message = receiptCount > 0
      ? `Esta factura tiene ${receiptCount} cobro${receiptCount === 1 ? '' : 's'} registrado${receiptCount === 1 ? '' : 's'}. Al eliminarla, ese${receiptCount === 1 ? '' : 's'} cobro${receiptCount === 1 ? '' : 's'} también se eliminará${receiptCount === 1 ? '' : 'n'} permanentemente. ¿Deseas continuar?`
      : '¿Eliminar esta factura? Esta acción no se puede deshacer.';
    if (!(await this.confirmDialog.confirm({ message, variant: 'danger' }))) return;

    this.deletingInvoiceId.set(inv.id);
    this.svc.deleteInvoice(this.projectId, item.budget_item_id, inv.id).subscribe({
      next: () => {
        this.deletingInvoiceId.set(null);
        if (this.editingInvoiceId() === inv.id) this.cancelForm();
        this.loadItemAndInvoices(item.budget_item_id);
      },
      error: () => this.deletingInvoiceId.set(null),
    });
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingInvoiceId.set(null);
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

    if (!this.form.period) {
      this.formError.set('El mes a facturar es requerido.');
      return;
    }

    if (this.form.iva_percentage == null || this.form.iva_percentage < 0 || this.form.iva_percentage > 100) {
      this.formError.set('El % de IVA debe estar entre 0 y 100.');
      return;
    }

    if (this.form.applies_admin_fee && (this.form.admin_fee_percentage == null || this.form.admin_fee_percentage < 0 || this.form.admin_fee_percentage > 100)) {
      this.formError.set('El % de administración debe estar entre 0 y 100.');
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

    const editingId = this.editingInvoiceId();
    const request$ = editingId
      ? this.svc.updateInvoice(this.projectId, item.budget_item_id, editingId, payload)
      : this.svc.createInvoice(this.projectId, item.budget_item_id, payload);

    // Si el usuario tocó el % de administración/IVA en este mismo formulario, primero se
    // guarda esa configuración a nivel de proyecto (afecta también desembolsos y flujo de
    // caja) y solo después se registra/actualiza la factura, para que ya se calcule con el
    // % nuevo. Si no cambió nada, se salta el PUT y va directo a la factura.
    const configChanged =
      this.form.applies_admin_fee !== this.appliesAdminFee() ||
      this.form.admin_fee_percentage !== this.adminFeePercentage() ||
      this.form.iva_percentage !== this.ivaPercentage();

    const configUpdate$ = configChanged
      ? this.contractSvc.updateAdminFeeConfig(this.projectId, {
          applies_admin_fee: this.form.applies_admin_fee,
          iva_percentage: this.form.iva_percentage,
          ...(this.form.applies_admin_fee && { admin_fee_percentage: this.form.admin_fee_percentage }),
        })
      : of<ContractResponse | null>(null);

    configUpdate$.pipe(switchMap(res => {
      if (res) {
        this.appliesAdminFee.set(res.applies_admin_fee ?? this.form.applies_admin_fee);
        this.adminFeePercentage.set(res.admin_fee_percentage ?? null);
        this.ivaPercentage.set(res.iva_percentage ?? this.form.iva_percentage);
      }
      return request$;
    })).subscribe({
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

  /** Factura sobre la que se está registrando un cobro (drawer lateral). */
  receiptFormInvoice(): Invoice | null {
    const id = this.receiptFormInvoiceId();
    return id ? this.invoices().find(i => i.id === id) ?? null : null;
  }

  receiptsFor(invoiceId: string): FundingReceipt[] {
    return this.receiptsByInvoice()[invoiceId] ?? [];
  }

  collectedFor(invoiceId: string): number {
    return this.receiptsFor(invoiceId).reduce((s, r) => s + (r.value ?? 0), 0);
  }

  /** Tope real de lo cobrable contra una factura: net_value (facturado menos % de
   * administración retenido) cuando el contrato aplica ese fee, o el valor bruto si no. */
  collectibleCap(inv: Invoice): number {
    return inv.net_value ?? inv.value;
  }

  /** % de IVA efectivo de una factura, derivado de lo que ya quedó guardado en ella
   * (value vs. value_before_tax) — no del ajuste actual del proyecto, que puede haber
   * cambiado desde que se facturó. Esto es lo que se reutiliza al registrar un cobro,
   * para no volver a preguntar algo que ya se definió al facturar. */
  invoiceIvaPercentage(inv: Invoice): number {
    if (inv.value_before_tax == null || inv.value_before_tax <= 0) return this.ivaPercentage();
    return Math.round(((inv.value / inv.value_before_tax) - 1) * 10000) / 100;
  }

  /** % de administración efectivo de una factura, derivado de admin_fee_amount/value. */
  invoiceAdminFeePercentage(inv: Invoice): number | null {
    if (!inv.admin_fee_amount || inv.value <= 0) return null;
    return Math.round((inv.admin_fee_amount / inv.value) * 10000) / 100;
  }

  /** % de IVA de un cobro puntual, derivado de su propio value/value_before_tax — normalmente
   * igual al de la factura (se hereda al registrarlo), pero se calcula por cobro para reflejar
   * fielmente lo que quedó guardado en cada uno. */
  receiptIvaPercentage(r: FundingReceipt): number | null {
    if (r.value_before_tax == null || r.value_before_tax <= 0) return null;
    return Math.round(((r.value / r.value_before_tax) - 1) * 10000) / 100;
  }

  collectedPct(inv: Invoice): number {
    const cap = this.collectibleCap(inv);
    return cap > 0 ? Math.min(100, (this.collectedFor(inv.id) / cap) * 100) : 0;
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
    this.receiptDocumentFile.set(null);
  }

  // ── Comprobante de pago adjunto ──────────────────────────────────────────
  receiptDocumentFile = signal<File | null>(null);
  uploadingDocumentId = signal<string | null>(null);

  onReceiptFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.receiptDocumentFile.set(input.files?.[0] ?? null);
  }

  removeReceiptFile(): void {
    this.receiptDocumentFile.set(null);
  }

  /** Adjuntar comprobante a un cobro que ya existe (por si no se subió al registrarlo). */
  onAttachExistingDocument(invoice: Invoice, receipt: FundingReceipt, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const item = this.selectedItem();
    if (!item) return;

    this.uploadingDocumentId.set(receipt.id);
    const form = new FormData();
    form.append('file', file);
    this.svc.uploadReceiptDocument(this.projectId, item.budget_item_id, invoice.id, receipt.id, form).subscribe({
      next: updated => {
        this.uploadingDocumentId.set(null);
        this.receiptsByInvoice.update(m => ({
          ...m,
          [invoice.id]: (m[invoice.id] ?? []).map(r => r.id === updated.id ? updated : r),
        }));
      },
      error: () => this.uploadingDocumentId.set(null),
    });
  }

  /** Antes de IVA = valor / (1 + iva%/100), usando el % de IVA YA definido en la factura que
   * se está cobrando (no uno nuevo) — el usuario no vuelve a decidir el IVA al cobrar, se
   * reutiliza lo que ya quedó fijado al facturar. No editable a mano. */
  onReceiptValueChange(value: number | null): void {
    this.receiptForm.value = value;
    const invoice = this.receiptFormInvoice();
    const iva = invoice ? this.invoiceIvaPercentage(invoice) : this.ivaPercentage();
    const factor = 1 + iva / 100;
    this.receiptForm.value_before_tax = value ? Math.round((value / factor) * 100) / 100 : null;
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

    // El backend topa el cobro contra net_value (facturado menos % de administración
    // retenido) cuando el contrato aplica ese fee — replicamos el mismo tope aquí para
    // que el mensaje de error sea preciso antes de golpear al servidor.
    const collectibleCap = invoice.net_value ?? invoice.value;
    const alreadyCollected = this.collectedFor(invoice.id);
    if (alreadyCollected + this.receiptForm.value > collectibleCap + AMOUNT_EPSILON) {
      const remaining = Math.max(0, collectibleCap - alreadyCollected);
      this.receiptError.set(`El cobro supera lo disponible para desembolso. Máximo disponible: ${this.formatCurrency(remaining)}.`);
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

    const file = this.receiptDocumentFile();
    this.svc.createFundingReceipt(this.projectId, item.budget_item_id, invoice.id, payload).pipe(
      switchMap(created => {
        if (!file) return of(created);
        const form = new FormData();
        form.append('file', file);
        return this.svc.uploadReceiptDocument(this.projectId, item.budget_item_id, invoice.id, created.id, form);
      }),
    ).subscribe({
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

  async deleteReceipt(invoice: Invoice, receipt: FundingReceipt): Promise<void> {
    const item = this.selectedItem();
    if (!item) return;
    if (!(await this.confirmDialog.confirm({ message: '¿Eliminar este cobro registrado?', variant: 'danger' }))) return;
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
    return `$${v.toFixed(2)}`;
  }

  trackByComp(_: number, s: InvoiceSection)   { return s.component_id; }
  trackByRow(_: number, r: InvoiceItemRow)    { return r.budget_item_id; }
}
