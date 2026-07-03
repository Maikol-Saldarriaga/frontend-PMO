import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BudgetMonthlyDistribution, Invoice } from '../../models/project.model';

export type PeriodEstado = 'facturado' | 'parcial' | 'pendiente' | 'aun_no_vence';

export interface PeriodViewRow {
  id:         string | undefined;
  year:       number;
  month:      number;
  programado: number;
  billed:     number;
  pct:        number;
  estado:     PeriodEstado;
  invoices:   Invoice[];
}

const UNIT_LABELS: Record<string, string> = {
  mes: 'Mensual', bimestre: 'Bimestral', trimestre: 'Trimestral', semestre: 'Semestral', anio: 'Anual',
};

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/**
 * Vista reutilizable de la distribución mensual de un ítem presupuestal con su
 * estado de facturación por periodo. Usada tanto en el detalle del ítem (tab
 * Presupuesto) como en la ficha de facturación (tab Facturación) — un solo
 * componente, no dos tablas distintas mostrando lo mismo.
 */
@Component({
  selector: 'app-budget-period-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './budget-period-status.component.html',
})
export class BudgetPeriodStatusComponent implements OnChanges {
  @Input() technicalComponentName: string | null = null;
  @Input() budgetComponentName:    string | null = null;
  @Input() concept                              = '';
  @Input() unitMeasurement:        string | null = null;
  @Input() quantity:               number | null = null;
  @Input() monthlyDistributions:   BudgetMonthlyDistribution[] = [];
  @Input() invoices:               Invoice[] = [];

  periods:          PeriodViewRow[] = [];
  generalInvoices:  Invoice[] = [];
  totalProgramado   = 0;
  totalFacturado    = 0;
  pctTotal          = 0;
  pendientesCount   = 0;
  aunNoVenceCount   = 0;
  periodicityLabel: string | null = null;

  ngOnChanges(): void {
    this.recompute();
  }

  private recompute(): void {
    const dists    = this.monthlyDistributions ?? [];
    const invoices = this.invoices ?? [];
    const today    = new Date();

    this.periods = dists
      .slice()
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map(d => {
        const programado = (d.counterpart_amount ?? 0) + (d.ally_amount ?? 0);
        const billed      = d.billed_amount ?? 0;
        const periodDate  = new Date(d.year, d.month - 1, 1);
        const yaVencio     = periodDate <= today;

        let estado: PeriodEstado;
        if (programado > 0 && billed >= programado) estado = 'facturado';
        else if (billed > 0)                         estado = 'parcial';
        else if (yaVencio)                           estado = 'pendiente';
        else                                          estado = 'aun_no_vence';

        return {
          id: d.id, year: d.year, month: d.month, programado, billed,
          pct: programado > 0 ? Math.min(100, Math.round((billed / programado) * 100)) : 0,
          estado,
          invoices: invoices.filter(i => i.year === d.year && i.month === d.month),
        };
      });

    this.generalInvoices = invoices.filter(i => i.year == null || i.month == null);

    this.totalProgramado = this.periods.reduce((s, p) => s + p.programado, 0);
    this.totalFacturado  = this.periods.reduce((s, p) => s + p.billed, 0);
    this.pctTotal         = this.totalProgramado > 0 ? Math.round((this.totalFacturado / this.totalProgramado) * 100) : 0;
    this.pendientesCount  = this.periods.filter(p => p.estado === 'pendiente' || p.estado === 'aun_no_vence').length;
    this.aunNoVenceCount  = this.periods.filter(p => p.estado === 'aun_no_vence').length;

    const unit = (this.unitMeasurement ?? '').trim().toLowerCase();
    this.periodicityLabel = (UNIT_LABELS[unit] && this.quantity)
      ? `${UNIT_LABELS[unit]} · ${this.quantity} periodo${this.quantity !== 1 ? 's' : ''}`
      : null;
  }

  periodLabel(p: PeriodViewRow): string {
    return `${MONTH_NAMES[p.month - 1] ?? ''} ${p.year}`;
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }

  trackByPeriod(_: number, p: PeriodViewRow) { return p.id ?? `${p.year}-${p.month}`; }
  trackByInvoice(_: number, i: Invoice)      { return i.id; }
}
