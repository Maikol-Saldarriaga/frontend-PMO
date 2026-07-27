import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Observable } from 'rxjs';
import { ContractService } from '../../../../services/contract.service';
import {
  SupplyPlanItem, ProcurementPayment, ProcurementPaymentRequest, ProcurementPaymentStatus,
} from '../../../../models/contract.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { AuthStore } from '../../../../../../../core/auth/store/auth.store';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';

const FINANCE_ROLES = ['ADMIN', 'COORDINADOR', 'FINANCE'];
const AMOUNT_EPSILON = 0.01;

interface PaymentFormState {
  value:              number | null;
  counterpart_value:  number | null;
  ally_value:         number | null;
  payment_date:       string | null;
  status:             ProcurementPaymentStatus;
  payment_reference:  string;
  observation:        string;
}

function emptyForm(): PaymentFormState {
  return {
    value: null, counterpart_value: null, ally_value: null,
    payment_date: new Date().toISOString().slice(0, 10),
    status: 'planeado', payment_reference: '', observation: '',
  };
}

@Component({
  selector: 'app-procurement-payment-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './procurement-payment-panel.component.html',
})
export class ProcurementPaymentPanelComponent implements OnChanges {
  @Input() projectId!: string;
  @Input() open = false;
  @Input() item: SupplyPlanItem | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  private svc  = inject(ContractService);
  private auth = inject(AuthStore);
  private confirmDialog = inject(ConfirmDialogService);

  readonly canWrite = computed(() => FINANCE_ROLES.includes(this.auth.user()?.role ?? ''));

  loading = signal(true);
  error   = signal<string | null>(null);
  payments = signal<ProcurementPayment[]>([]);

  totalPaid = computed(() => this.payments().reduce((s, p) => s + (p.value ?? 0), 0));
  progressPct = computed(() => {
    const cap = this.item?.initial_budget ?? 0;
    if (cap <= 0) return 0;
    return Math.min(100, Math.round((this.totalPaid() / cap) * 100));
  });
  overBudget = computed(() => this.totalPaid() > (this.item?.initial_budget ?? 0) + AMOUNT_EPSILON);

  showForm = signal(false);
  form: PaymentFormState = emptyForm();
  splitOverflow = computed(() => {
    const total = (this.form.counterpart_value ?? 0) + (this.form.ally_value ?? 0);
    return total > (this.form.value ?? 0) + AMOUNT_EPSILON;
  });

  /** Cuánto queda disponible del presupuesto inicial del requerimiento, considerando lo ya
   * pagado (sin contar el formulario que se está llenando). */
  requirementAvailable = computed(() => (this.item?.initial_budget ?? 0) - this.totalPaid());

  /** true cuando el pago que se está por registrar haría que el total pagado supere el
   * presupuesto inicial del requerimiento — bloquea el guardado, igual que el backend. */
  formOverBudget = computed(() => (this.form.value ?? 0) > this.requirementAvailable() + AMOUNT_EPSILON);

  stagedInvoice:  { file: File; preview: string | null } | null = null;
  stagedEvidence: { file: File; preview: string | null } | null = null;

  saving    = signal(false);
  saveError = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open && this.item) {
      this.load();
      this.cancelForm();
    }
  }

  private load(): void {
    if (!this.item) return;
    this.loading.set(true);
    this.error.set(null);
    this.svc.listProcurementPayments(this.projectId, this.item.id).subscribe({
      next: list => { this.payments.set(list ?? []); this.loading.set(false); },
      error: () => { this.error.set('No se pudieron cargar los pagos.'); this.loading.set(false); },
    });
  }

  close(): void {
    this.cancelForm();
    this.closed.emit();
  }

  // ── Formulario "Registrar pago" ──────────────────────────────────────────

  startForm(): void {
    this.form = emptyForm();
    this.saveError.set(null);
    this.clearStagedFiles();
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
    this.clearStagedFiles();
    this.form = emptyForm();
  }

  private clearStagedFiles(): void {
    if (this.stagedInvoice?.preview) URL.revokeObjectURL(this.stagedInvoice.preview);
    if (this.stagedEvidence?.preview) URL.revokeObjectURL(this.stagedEvidence.preview);
    this.stagedInvoice = null;
    this.stagedEvidence = null;
  }

  onInvoiceFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      if (this.stagedInvoice?.preview) URL.revokeObjectURL(this.stagedInvoice.preview);
      this.stagedInvoice = { file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null };
    }
    input.value = '';
  }

  onEvidenceFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      if (this.stagedEvidence?.preview) URL.revokeObjectURL(this.stagedEvidence.preview);
      this.stagedEvidence = { file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null };
    }
    input.value = '';
  }

  removeStagedInvoice(): void {
    if (this.stagedInvoice?.preview) URL.revokeObjectURL(this.stagedInvoice.preview);
    this.stagedInvoice = null;
  }

  removeStagedEvidence(): void {
    if (this.stagedEvidence?.preview) URL.revokeObjectURL(this.stagedEvidence.preview);
    this.stagedEvidence = null;
  }

  canSave(): boolean {
    return !!this.form.value && this.form.value > 0 && !this.splitOverflow() && !this.formOverBudget();
  }

  save(): void {
    if (!this.item || this.saving() || !this.canSave()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const payload: ProcurementPaymentRequest = {
      value:              Number(this.form.value) || 0,
      counterpart_value:  Number(this.form.counterpart_value) || 0,
      ally_value:         Number(this.form.ally_value) || 0,
      payment_date:       this.form.payment_date || null,
      status:             this.form.status,
      payment_reference:  this.form.payment_reference.trim() || null,
      observation:        this.form.observation.trim() || null,
    };

    this.svc.createProcurementPayment(this.projectId, this.item.id, payload).subscribe({
      next: payment => {
        const uploads: Observable<ProcurementPayment>[] = [];
        if (this.stagedInvoice) {
          const fd = new FormData();
          fd.append('file', this.stagedInvoice.file);
          uploads.push(this.svc.uploadProcurementPaymentInvoice(this.projectId, this.item!.id, payment.id, fd));
        }
        if (this.stagedEvidence) {
          const fd = new FormData();
          fd.append('file', this.stagedEvidence.file);
          uploads.push(this.svc.uploadProcurementPaymentEvidence(this.projectId, this.item!.id, payment.id, fd));
        }

        (uploads.length ? forkJoin(uploads) : of([])).subscribe({
          next: () => {
            this.saving.set(false);
            this.cancelForm();
            this.load();
            this.changed.emit();
          },
          error: err => {
            this.saving.set(false);
            this.saveError.set(err?.error?.message ?? 'El pago se registró, pero falló la subida de uno o más archivos.');
            this.load();
            this.changed.emit();
          },
        });
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'Error al registrar el pago.');
      },
    });
  }

  async deletePayment(p: ProcurementPayment): Promise<void> {
    if (!this.item) return;
    if (!(await this.confirmDialog.confirm({ message: '¿Eliminar este pago registrado?', variant: 'danger' }))) return;
    this.deletingId.set(p.id);
    this.svc.deleteProcurementPayment(this.projectId, this.item.id, p.id).subscribe({
      next: () => {
        this.payments.update(list => list.filter(x => x.id !== p.id));
        this.deletingId.set(null);
        this.changed.emit();
      },
      error: () => this.deletingId.set(null),
    });
  }

  statusLabel(s: ProcurementPaymentStatus): string {
    return s === 'pagado' ? 'Pagado' : 'Planeado';
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return d.slice(0, 10).split('-').reverse().join('/');
  }

  trackById(_: number, p: ProcurementPayment) { return p.id; }
}
