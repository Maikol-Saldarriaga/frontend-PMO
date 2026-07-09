import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { ContractService } from '../../../../services/contract.service';
import {
  SupplyPlanItem, SupplyPlanRequest, SupplyPlanStatus, SupplyPlanSummary, SupplyPlanFilters,
} from '../../../../models/contract.model';

const STATUS_OPTIONS: { value: SupplyPlanStatus; label: string }[] = [
  { value: 'pendiente',    label: 'Pendiente' },
  { value: 'en_ejecucion', label: 'En Ejecución' },
  { value: 'finalizado',   label: 'Finalizado' },
  { value: 'cancelado',    label: 'Cancelado' },
];

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type FormState = SupplyPlanRequest & { id?: string };

function emptyForm(): FormState {
  const now = new Date();
  return {
    consecutive_number: 0,
    status: 'pendiente',
    project_name: '', requirement_category: '', requirement_detail: '',
    requested_by: '', receiving_party: '',
    estimated_request_date: null, actual_request_date: null,
    requirement_start_date: null, requirement_end_date: null,
    initial_budget: 0, executed_budget: 0,
    legalization_date: null, legalization_status: '',
    payment_date: null, invoice_number: '', nit: '', provider: '',
    acta_received_status: '', observation: '',
    period_year: now.getFullYear(), period_month: now.getMonth() + 1,
  };
}

@Component({
  selector: 'app-tab-abastecimiento',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './tab-abastecimiento.component.html',
})
export class TabAbastecimientoComponent implements OnInit {
  @Input() projectId!: string;

  constructor(private svc: ContractService) {}

  readonly statusOptions = STATUS_OPTIONS;
  readonly months        = MONTHS;
  readonly yearOptions   = this.buildYearOptions();

  loading = signal(true);
  error   = signal<string | null>(null);
  items   = signal<SupplyPlanItem[]>([]);
  summary = signal<SupplyPlanSummary | null>(null);

  filters = signal<SupplyPlanFilters>({ year: null, month: null, category: '', status: '' });
  activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.year, f.month, f.category, f.status].filter(Boolean).length;
  });

  panelOpen  = signal(false);
  form       = signal<FormState>(emptyForm());
  saving     = signal(false);
  saveError  = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  showImport    = signal(false);
  importText    = signal('');
  importSaving  = signal(false);
  importError   = signal<string | null>(null);
  importSuccess = signal<string | null>(null);

  private buildYearOptions(): number[] {
    const y = new Date().getFullYear();
    const years: number[] = [];
    for (let i = y - 3; i <= y + 3; i++) years.push(i);
    return years;
  }

  ngOnInit(): void {
    this.load();
    this.loadSummary();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getSupplyPlan(this.projectId, this.filters()).subscribe({
      next: list => { this.items.set(list ?? []); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el plan de abastecimiento.'); this.loading.set(false); },
    });
  }

  loadSummary(): void {
    this.svc.getSupplyPlanSummary(this.projectId).subscribe({
      next: s => this.summary.set(s),
      error: () => this.summary.set(null),
    });
  }

  /** year/month llegan como number|null reales (selects con [ngValue]); category/status llegan como string. */
  updateFilter(field: keyof SupplyPlanFilters, value: string | number | null): void {
    const normalized = value === '' || value === null || value === undefined
      ? null
      : (field === 'year' || field === 'month' ? Number(value) : value);
    this.filters.update(f => ({ ...f, [field]: normalized }));
    this.load();
  }

  clearFilters(): void {
    this.filters.set({ year: null, month: null, category: '', status: '' });
    this.load();
  }

  monthName(m: number): string { return this.months[m - 1] ?? String(m); }

  // ── Panel de creación / edición ──────────────────────────────────────────

  openCreate(): void {
    this.form.set(emptyForm());
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  openEdit(item: SupplyPlanItem): void {
    this.form.set({
      id: item.id,
      consecutive_number: item.consecutive_number,
      status: item.status,
      project_name: item.project_name ?? '', requirement_category: item.requirement_category ?? '',
      requirement_detail: item.requirement_detail ?? '',
      requested_by: item.requested_by ?? '', receiving_party: item.receiving_party ?? '',
      estimated_request_date: item.estimated_request_date?.slice(0, 10) ?? null,
      actual_request_date:    item.actual_request_date?.slice(0, 10) ?? null,
      requirement_start_date: item.requirement_start_date?.slice(0, 10) ?? null,
      requirement_end_date:   item.requirement_end_date?.slice(0, 10) ?? null,
      initial_budget: item.initial_budget, executed_budget: item.executed_budget,
      legalization_date: item.legalization_date?.slice(0, 10) ?? null,
      legalization_status: item.legalization_status ?? '',
      payment_date: item.payment_date?.slice(0, 10) ?? null,
      invoice_number: item.invoice_number ?? '', nit: item.nit ?? '', provider: item.provider ?? '',
      acta_received_status: item.acta_received_status ?? '', observation: item.observation ?? '',
      period_year: item.period_year, period_month: item.period_month,
    });
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void { this.panelOpen.set(false); }

  updateFormField(field: keyof FormState, value: string | number): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  save(): void {
    const f = this.form();
    if (!f.period_year || !f.period_month) { this.saveError.set('Año y mes del período son requeridos.'); return; }

    this.saving.set(true);
    this.saveError.set(null);

    const payload: SupplyPlanRequest = {
      consecutive_number: Number(f.consecutive_number) || 0,
      status: f.status,
      project_name: f.project_name || null,
      requirement_category: f.requirement_category || null,
      requirement_detail: f.requirement_detail || null,
      requested_by: f.requested_by || null,
      receiving_party: f.receiving_party || null,
      estimated_request_date: f.estimated_request_date || null,
      actual_request_date: f.actual_request_date || null,
      requirement_start_date: f.requirement_start_date || null,
      requirement_end_date: f.requirement_end_date || null,
      initial_budget: Number(f.initial_budget) || 0,
      executed_budget: Number(f.executed_budget) || 0,
      legalization_date: f.legalization_date || null,
      legalization_status: f.legalization_status || null,
      payment_date: f.payment_date || null,
      invoice_number: f.invoice_number || null,
      nit: f.nit || null,
      provider: f.provider || null,
      acta_received_status: f.acta_received_status || null,
      observation: f.observation || null,
      period_year: Number(f.period_year),
      period_month: Number(f.period_month),
    };

    const request$ = f.id
      ? this.svc.updateSupplyPlanItem(this.projectId, f.id, payload)
      : this.svc.createSupplyPlanItem(this.projectId, payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.panelOpen.set(false);
        this.load();
        this.loadSummary();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'Error al guardar el requerimiento.');
      },
    });
  }

  deleteItem(item: SupplyPlanItem): void {
    if (!confirm(`¿Eliminar el requerimiento #${item.consecutive_number}${item.project_name ? ' — ' + item.project_name : ''}?`)) return;
    this.deletingId.set(item.id);
    this.svc.deleteSupplyPlanItem(this.projectId, item.id).subscribe({
      next: () => {
        this.items.update(list => list.filter(i => i.id !== item.id));
        this.deletingId.set(null);
        this.loadSummary();
      },
      error: () => this.deletingId.set(null),
    });
  }

  // ── Importar (bulk create) ───────────────────────────────────────────────

  toggleImportPanel(): void {
    this.showImport.update(v => !v);
    this.importError.set(null);
    this.importSuccess.set(null);
  }

  /** Columnas separadas por tabulación (una fila por línea), en el mismo orden que se documenta en el panel. */
  private parseImportRows(text: string): SupplyPlanRequest[] {
    return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const c = line.split('\t').map(v => v.trim());
      const [
        consecutive, status, projectName, category, detail, requestedBy, receivingParty,
        initialBudget, executedBudget, year, month,
      ] = c;
      return {
        consecutive_number: Number(consecutive) || 0,
        status: (STATUS_OPTIONS.some(o => o.value === status) ? status : 'pendiente') as SupplyPlanStatus,
        project_name: projectName || null,
        requirement_category: category || null,
        requirement_detail: detail || null,
        requested_by: requestedBy || null,
        receiving_party: receivingParty || null,
        initial_budget: Number(initialBudget) || 0,
        executed_budget: Number(executedBudget) || 0,
        period_year: Number(year) || new Date().getFullYear(),
        period_month: Number(month) || 1,
      } as SupplyPlanRequest;
    }).filter(r => r.period_year && r.period_month);
  }

  importPreviewCount(): number { return this.parseImportRows(this.importText()).length; }

  runImport(): void {
    const rows = this.parseImportRows(this.importText());
    if (!rows.length) { this.importError.set('No se detectaron filas válidas.'); return; }

    this.importSaving.set(true);
    this.importError.set(null);
    this.importSuccess.set(null);

    this.svc.importSupplyPlan(this.projectId, rows).subscribe({
      next: () => {
        this.importSaving.set(false);
        this.importSuccess.set(`Se importaron ${rows.length} fila(s) correctamente.`);
        this.importText.set('');
        this.load();
        this.loadSummary();
      },
      error: err => {
        this.importSaving.set(false);
        this.importError.set(err?.error?.message ?? 'Error al importar el plan de abastecimiento.');
      },
    });
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }

  statusLabel(s: SupplyPlanStatus): string {
    return STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;
  }

  trackById(_: number, item: SupplyPlanItem) { return item.id; }
}
