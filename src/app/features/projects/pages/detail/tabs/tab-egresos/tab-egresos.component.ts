import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProjectService } from '../../../../services/project.service';
import {
  BudgetExecution, CashFlowReport, CashFlowRubro, BudgetEntry, BudgetItem,
} from '../../../../models/project.model';

const AMOUNT_EPSILON = 0.01;

/** Mismo color por rubro que en Presupuesto/Abastecimiento/Flujo de Caja, para que un rubro se
 * vea siempre igual en toda la app — el índice viene del orden de rubro_breakdown del reporte. */
const PALETTE = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const NO_RUBRO_COLOR = '#CBD5E1';

/** Info de rubro resuelta desde getBudgetWizard — componente técnico de cada rubro, que el
 * reporte de flujo de caja (CashFlowRubro) no trae. */
interface RubroInfo {
  id:                      string;
  concept:                 string;
  technicalComponentId:    string | null;
  technicalComponentName:  string;
}

@Component({
  selector: 'app-tab-egresos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-egresos.component.html',
})
export class TabEgresosComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  constructor(private svc: ProjectService, private router: Router) {}

  loading = signal(true);
  error   = signal<string | null>(null);
  report  = signal<CashFlowReport | null>(null);
  executions = signal<BudgetExecution[]>([]);

  /** Rubros del reporte de flujo de caja — ya trae concept + los montos precomputados de
   * cobrado/ejecutado/disponible, así que no hay que reimplementar esa suma en el cliente. */
  rubros = computed<CashFlowRubro[]>(() => this.report()?.rubro_breakdown ?? []);

  /** Solo los rubros con algún movimiento relevante para Egresos (presupuesto asignado o ya
   * ejecutado), para no llenar el resumen de rubros vacíos. */
  rubrosConMovimiento = computed<CashFlowRubro[]>(() =>
    this.rubros().filter(r => r.total_presupuestado > 0 || r.egreso_real_registrado > 0)
  );

  /** Componente técnico de cada rubro — no viene en CashFlowRubro, se resuelve aparte desde
   * getBudgetWizard (misma fuente que usa Flujo de Caja para lo mismo). */
  rubroInfos = signal<RubroInfo[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getBudgetWizard(this.projectId).subscribe({
      next: w => {
        const infos: RubroInfo[] = (w.components ?? []).flatMap(comp =>
          (comp.budget_entries ?? []).flatMap((entry: BudgetEntry) =>
            (entry.items ?? []).map((item: BudgetItem) => ({
              id: item.id,
              concept: item.concept ?? '',
              technicalComponentId: comp.component_id ?? null,
              technicalComponentName: comp.name ?? 'Sin componente técnico',
            } as RubroInfo))
          )
        );
        this.rubroInfos.set(infos);
      },
      error: () => this.rubroInfos.set([]),
    });
    this.svc.getCashFlowReport(this.projectId).subscribe({
      next: r => {
        this.report.set(r);
        this.svc.listExecutions(this.projectId).subscribe({
          next: list => { this.executions.set(list ?? []); this.loading.set(false); },
          error: () => { this.error.set('No se pudieron cargar los egresos registrados.'); this.loading.set(false); },
        });
      },
      error: () => { this.error.set('No se pudo cargar el flujo de caja.'); this.loading.set(false); },
    });
  }

  rubroInfo(budgetItemId: string | null | undefined): RubroInfo | undefined {
    return this.rubroInfos().find(r => r.id === budgetItemId);
  }

  // ── Navegación a la página completa de Egresos (filtro + lista + registro) ──

  openEgresosList(): void {
    this.router.navigate(['/projects', this.projectId, 'egresos'], { queryParams: this.locked ? { locked: '1' } : {} });
  }

  openRegistrarEgreso(): void {
    if (this.locked) return;
    this.router.navigate(['/projects', this.projectId, 'egresos'], { queryParams: { new: '1' } });
  }

  rubroColor(budgetItemId: string | null | undefined): string {
    if (!budgetItemId) return NO_RUBRO_COLOR;
    const idx = this.rubros().findIndex(r => r.budget_item_id === budgetItemId);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : NO_RUBRO_COLOR;
  }

  /** % ejecutado contra el presupuesto planeado del rubro — ya no contra lo cobrado, que desde
   * la Fase 2b entra a nivel de proyecto (Desembolso), no por rubro. */
  rubroExecutedPct(r: CashFlowRubro): number {
    if (!r.total_presupuestado) return 0;
    return Math.min(100, Math.round((r.egreso_real_registrado / r.total_presupuestado) * 100));
  }

  rubroOverflow(r: CashFlowRubro): boolean {
    return r.egreso_real_registrado > r.total_presupuestado + AMOUNT_EPSILON;
  }

  /** Tope de Egresos a nivel de PROYECTO (no por rubro) — el dinero entra vía Desembolso, que
   * es % del valor total del proyecto, no de un rubro específico (ver documento de flujo v9). */
  disponibleProyecto = computed(() => this.report()?.disponible_proyecto ?? 0);

  // ── Resumen agrupado por Componente Técnico → Rubro ─────────────────────────

  /** Cuántos egresos hay registrados por rubro — cuenta simple sobre executions(). */
  rubroExecutionCounts = computed<Map<string, number>>(() => {
    const counts = new Map<string, number>();
    for (const e of this.executions()) counts.set(e.budget_item_id, (counts.get(e.budget_item_id) ?? 0) + 1);
    return counts;
  });

  /** "Presupuestado y ejecutado por rubro" agrupado por Componente Técnico, con conteo de
   * egresos por rubro — responde "cuántos egresos hay por cada rubro-componente técnico". */
  groupedByTechnical = computed(() => {
    const groups = new Map<string, {
      technicalComponentId: string;
      technicalComponentName: string;
      rubros: { budgetItemId: string; concept: string; count: number; presupuestado: number; ejecutado: number }[];
      totalCount: number;
      totalEjecutado: number;
    }>();
    for (const r of this.rubrosConMovimiento()) {
      const info = this.rubroInfo(r.budget_item_id);
      const techId = info?.technicalComponentId ?? '__sin_componente__';
      const techName = info?.technicalComponentName ?? 'Sin componente técnico';
      if (!groups.has(techId)) {
        groups.set(techId, { technicalComponentId: techId, technicalComponentName: techName, rubros: [], totalCount: 0, totalEjecutado: 0 });
      }
      const g = groups.get(techId)!;
      const count = this.rubroExecutionCounts().get(r.budget_item_id) ?? 0;
      g.rubros.push({ budgetItemId: r.budget_item_id, concept: r.concept, count, presupuestado: r.total_presupuestado, ejecutado: r.egreso_real_registrado });
      g.totalCount += count;
      g.totalEjecutado += r.egreso_real_registrado;
    }
    return [...groups.values()].sort((a, b) => b.totalEjecutado - a.totalEjecutado);
  });

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }

  trackByTechGroup(_: number, g: { technicalComponentId: string }) { return g.technicalComponentId; }
}
