import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { ProjectService } from '../../../../services/project.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { Disbursement, DisbursementRequest, DisbursementStatus, VigenciaBudget } from '../../../../models/project.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';

const MONTH_NAMES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface FormState {
  id?:             string;
  name:            string;
  percentage:      number | null;
  planned_year:    number | null;
  planned_month:   number | null;
  justification:   string;
  requested_date:  string | null;
  observation:     string;
}

function emptyForm(): FormState {
  return {
    name: '', percentage: null, planned_year: null, planned_month: null,
    justification: '', requested_date: new Date().toISOString().slice(0, 10), observation: '',
  };
}

/** Solicitud de Desembolsos — tramos planeados como % de lo PRESUPUESTADO EN LA VIGENCIA
 * (planned_year), no del valor total del proyecto ni de un rubro, que permanecen "planeado"
 * hasta que la(s) factura(s) ligada(s) a ellos se cobran (funding_receipts). Cada desembolso
 * debe elegir una vigencia (año) con presupuesto planeado — el backend rechaza tanto la
 * ausencia de vigencia como una vigencia sin nada presupuestado, y valida dos topes: 100% de
 * lo presupuestado EN ESA vigencia, y que la suma de todos los desembolsos (de todas las
 * vigencias) nunca supere el valor total del proyecto. Ver Disbursement / documento de flujo
 * financiero, sección "Rama de Ingresos". Mismo patrón visual/estructural que
 * TabEgresosComponent: KPIs arriba, tabla principal, panel lateral para crear/editar. */
@Component({
  selector: 'app-tab-desembolsos',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],
  templateUrl: './tab-desembolsos.component.html',
})
export class TabDesembolsosComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  constructor(private svc: ProjectService, private confirmDialog: ConfirmDialogService) {}

  readonly monthNames = MONTH_NAMES;

  loading = signal(true);
  error   = signal<string | null>(null);
  items   = signal<Disbursement[]>([]);

  // ── Valor total del proyecto + facturado acumulado — contexto de en qué punto del
  // presupuesto general están los desembolsos (no viene del endpoint de desembolsos, sino
  // del propio proyecto y del resumen de ejecución presupuestal). ──
  projectValue    = signal<number | null>(null);
  totalFacturado  = signal(0);

  // ── Vigencias (años) con presupuesto planeado — cada desembolso debe elegir una, y el %
  // que se le asigna es una fracción de SU total presupuestado, no del valor del proyecto. ──
  vigencias = signal<VigenciaBudget[]>([]);

  // ── Filtro de la tabla por vigencia — 'all' agrega todas (solo tiene sentido para los
  // totales en dinero: el % mezclado entre vigencias de distinto tamaño no dice nada). ──
  filterYear = signal<number | 'all'>('all');

  filteredItems = computed(() => {
    const year = this.filterYear();
    return year === 'all' ? this.items() : this.items().filter(i => i.planned_year === year);
  });

  ngOnInit(): void {
    this.load();

    this.svc.getProject(this.projectId).subscribe({
      next: p => this.projectValue.set(p.value ?? null),
      error: () => {},
    });

    this.svc.listDisbursementVigencias(this.projectId).subscribe({
      next: v => this.vigencias.set(v),
      error: () => {},
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.listAllDisbursements(this.projectId).subscribe({
      next: items => {
        const sorted = [...(items ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
        this.items.set(sorted);
        this.loading.set(false);
        this.loadTotalFacturado(sorted);
      },
      error: () => {
        this.error.set('No se pudieron cargar los desembolsos.');
        this.loading.set(false);
      },
    });
  }

  /** Total realmente facturado del proyecto (Fase 2b: la factura cuelga del desembolso, no
   * del rubro) — se suma en el cliente porque ya no existe un solo agregado de "facturado por
   * rubro" que lo cubra (esa columna dejó de crecer con facturas nuevas). Recorre las
   * facturas de cada desembolso y suma su `value`. */
  private loadTotalFacturado(disbursements: Disbursement[]): void {
    if (!disbursements.length) { this.totalFacturado.set(0); return; }
    forkJoin(
      disbursements.map(d => this.svc.listInvoicesByDisbursement(this.projectId, d.id))
    ).subscribe({
      next: lists => this.totalFacturado.set(lists.reduce((s, l) => s + l.reduce((s2, inv) => s2 + (inv.value ?? 0), 0), 0)),
      error: () => {},
    });
  }

  // ── KPIs + totales (fila final de la tabla) — sobre filteredItems(), así que reflejan la
  // vigencia elegida en el filtro (o todas, para los que son sumables en dinero). ──
  totalPlanned    = computed(() => this.filteredItems().reduce((s, i) => s + i.planned_amount, 0));
  totalPaid       = computed(() => this.filteredItems().reduce((s, i) => s + i.paid_amount, 0));
  totalBalance    = computed(() => this.filteredItems().reduce((s, i) => s + i.balance, 0));
  collectionPct   = computed(() => {
    const total = this.totalPlanned();
    return total > 0 ? Math.min(100, Math.round((this.totalPaid() / total) * 100)) : 0;
  });

  /** % de la vigencia filtrada ya comprometido en desembolsos — solo tiene sentido con una
   * vigencia específica elegida (mezclar % de vigencias con distinto presupuesto no dice
   * nada); en 'Todas' se deja sin dato. */
  totalPercentage = computed<number | null>(() => {
    const year = this.filterYear();
    if (year === 'all') return null;
    return this.filteredItems().reduce((s, i) => s + i.percentage, 0);
  });

  /** % del valor total del proyecto que ya se ha facturado — el contexto que pidió el
   * usuario: cuánto de la plata general del proyecto ya salió en facturas, sin importar a
   * qué desembolso (o a ninguno) esté ligada cada una. */
  facturadoPct = computed(() => {
    const total = this.projectValue();
    return total && total > 0 ? Math.min(100, Math.round((this.totalFacturado() / total) * 100)) : 0;
  });

  // ── Formulario "Nuevo/Editar desembolso" (panel lateral) ────────────────
  panelOpen = signal(false);
  form      = signal<FormState>(emptyForm());
  saving    = signal(false);
  saveError = signal<string | null>(null);
  deletingId = signal<string | null>(null);

  /** Total presupuestado de la vigencia elegida en el formulario — lo que el % del formulario
   * es una fracción de (no el valor total del proyecto). 0 mientras no se elija vigencia. */
  formVigenciaTotal = computed(() => {
    const year = this.form().planned_year;
    if (year == null) return 0;
    return this.vigencias().find(v => v.year === year)?.total_presupuestado ?? 0;
  });

  /** % disponible antes de superar el 100% de lo presupuestado EN LA VIGENCIA elegida —
   * excluye el propio ítem si se está editando, y solo cuenta desembolsos de esa misma
   * vigencia (una vigencia distinta no compite por el mismo 100%). */
  availablePercentage = computed(() => {
    const year = this.form().planned_year;
    if (year == null) return 0;
    const editingId = this.form().id;
    const used = this.items()
      .filter(i => i.id !== editingId && i.planned_year === year)
      .reduce((s, i) => s + i.percentage, 0);
    return Math.max(0, 100 - used);
  });

  formOverPercentage = computed(() => (Number(this.form().percentage) || 0) > this.availablePercentage() + 0.01);

  /** Equivalente en dinero del % que se está escribiendo — se recalcula en vivo contra el
   * total presupuestado de la vigencia elegida, para que el usuario vea a cuánto corresponde
   * ese % sin tener que calcularlo mentalmente. */
  formPlannedAmount = computed(() => {
    const pct = Number(this.form().percentage) || 0;
    return this.formVigenciaTotal() * pct / 100;
  });

  canSave(): boolean {
    const f = this.form();
    return !!f.name.trim() && !!f.planned_year && !!f.percentage && f.percentage > 0 && f.percentage <= 100 && !this.formOverPercentage();
  }

  openCreate(): void {
    const f = emptyForm();
    // si la tabla ya está filtrada por una vigencia, arrancar el formulario en esa misma —
    // ahorra el clic de volver a elegirla en el caso más común (agregar otro tramo a la
    // vigencia que se está mirando).
    const filtered = this.filterYear();
    if (filtered !== 'all') f.planned_year = filtered;
    this.form.set(f);
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  openEdit(item: Disbursement): void {
    this.form.set({
      id: item.id,
      name: item.name,
      percentage: item.percentage,
      planned_year: item.planned_year ?? null,
      planned_month: item.planned_month ?? null,
      justification: item.justification ?? '',
      requested_date: item.requested_date ? item.requested_date.slice(0, 10) : null,
      observation: item.observation ?? '',
    });
    this.saveError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  updateFormField<K extends keyof FormState>(field: K, value: FormState[K]): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  /** Permite escribir el desembolso directamente en pesos — se convierte a % del total
   * presupuestado de la vigencia elegida (mismo dato que persiste el backend). Complementa
   * al input de %: cualquiera de los dos que se edite actualiza al otro. */
  updateFormAmount(amount: number | null): void {
    const total = this.formVigenciaTotal();
    const pct = total > 0 && amount ? Math.round((amount / total) * 10000) / 100 : null;
    this.updateFormField('percentage', pct);
  }

  save(): void {
    const f = this.form();
    const name = f.name.trim();
    if (!name) { this.saveError.set('El nombre / hito es obligatorio.'); return; }
    if (!f.planned_year) { this.saveError.set('Debes elegir la vigencia a la que va este desembolso.'); return; }
    if (!f.percentage || f.percentage <= 0 || f.percentage > 100) { this.saveError.set('El porcentaje debe estar entre 0 y 100.'); return; }
    if (this.formOverPercentage()) {
      this.saveError.set(`La suma de porcentajes de la vigencia ${f.planned_year} superaría el 100% de lo presupuestado para ese año (disponible: ${this.availablePercentage().toFixed(2)}%).`);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const payload: DisbursementRequest = {
      name,
      percentage: f.percentage,
      planned_year: f.planned_year || null,
      planned_month: f.planned_month || null,
      justification: f.justification.trim() || null,
      requested_date: f.requested_date || null,
      observation: f.observation.trim() || null,
    };

    const request = f.id
      ? this.svc.updateDisbursement(this.projectId, f.id, payload)
      : this.svc.createDisbursement(this.projectId, payload);

    request.subscribe({
      next: () => { this.saving.set(false); this.panelOpen.set(false); this.load(); },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.error ?? err?.error?.message ?? 'Error al guardar el desembolso.');
      },
    });
  }

  async remove(item: Disbursement): Promise<void> {
    if (this.deletingId()) return;
    const message = item.paid_amount > 0
      ? `Este desembolso ya tiene ${this.formatCurrency(item.paid_amount)} cobrados. Las facturas ligadas a él quedarán sin desembolso asociado, pero no se eliminan. ¿Eliminar de todas formas?`
      : `¿Eliminar el desembolso "${item.name}"? Esta acción no se puede deshacer.`;
    if (!(await this.confirmDialog.confirm({ message, variant: 'danger' }))) return;

    this.deletingId.set(item.id);
    this.svc.deleteDisbursement(this.projectId, item.id).subscribe({
      next: () => { this.deletingId.set(null); this.load(); },
      error: () => { this.deletingId.set(null); this.error.set('Error al eliminar el desembolso.'); },
    });
  }

  // ── Helpers de presentación ───────────────────────────────────────────────

  statusLabel(s: DisbursementStatus): string {
    return s === 'pagado' ? 'Pagado' : s === 'parcial' ? 'Parcial' : 'Planeado';
  }

  monthLabel(item: Disbursement): string {
    if (!item.planned_month) return '—';
    const name = MONTH_NAMES[item.planned_month] ?? '';
    return item.planned_year ? `${name} ${item.planned_year}` : name;
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }

  /** Versión compacta ($1.2B / $850M / $12K) para las tarjetas KPI, que no tienen espacio
   * para cifras completas de proyectos grandes. */
  formatCompactCurrency(v: number): string {
    const abs = Math.abs(v ?? 0);
    if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return this.formatCurrency(v);
  }

  formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    return d.slice(0, 10).split('-').reverse().join('/');
  }

  trackById(_: number, i: Disbursement) { return i.id; }
}
