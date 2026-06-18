import { Component, Input, Output, EventEmitter, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ContractStep8Request, ContractStep8Item, ContractActItem,
  WizardStep8ComponentResponse,
} from '../../../../models/contract.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';

interface ActRow {
  id?:               string | null;
  act:               number;
  description:       string;
  start_date:        string;
  end_date:          string;
  start_plan:        number | null;
  actual_start_date: string;
  actual_end_date:   string;
  actual_start_plan: number | null;
  responsible:       string;
  objective:         string;
  percentage:        number;
  budget:            number | null;
  plan_duration?:        number | null;
  actual_plan_duration?: number | null;
}

interface ComponentRow {
  id?:           string | null;
  componentName: string;
  percentage:    number | null;
  budget:        number | null;
  acts:          ActRow[];
}

const EMPTY_ACT = (): ActRow => ({
  act: 1, description: '', start_date: '', end_date: '',
  start_plan: null,
  actual_start_date: '', actual_end_date: '', actual_start_plan: null,
  responsible: '', objective: '',
  percentage: 0, budget: null,
});

const EMPTY_COMPONENT = (): ComponentRow => ({
  componentName: '', percentage: null, budget: null, acts: [EMPTY_ACT()],
});

@Component({
  selector: 'app-step8-scope',
  standalone: true,
  imports: [CommonModule, MoneyMaskDirective],
  templateUrl: './step8-scope.component.html',
})
export class Step8ScopeComponent {
  @Input() set savedData(val: WizardStep8ComponentResponse[] | undefined) {
    if (!val?.length) return;
    this.rows.set(val.map(comp => ({
      id:            comp.id,
      componentName: comp.component,
      percentage:    comp.percentage ?? null,
      budget:        comp.budget ?? null,
      acts:          comp.acts.map(a => ({
        id:                  a.id,
        act:                 a.act,
        description:         a.description        ?? '',
        start_date:          a.start_date?.split('T')[0]         ?? '',
        end_date:            a.end_date?.split('T')[0]           ?? '',
        start_plan:          a.start_plan          ?? null,
        actual_start_date:   a.actual_start_date?.split('T')[0]  ?? '',
        actual_end_date:     a.actual_end_date?.split('T')[0]    ?? '',
        actual_start_plan:   a.actual_start_plan   ?? null,
        responsible:         a.responsible         ?? '',
        objective:           a.objective           ?? '',
        percentage:          a.percentage          ?? 0,
        budget:              a.budget              ?? null,
        plan_duration:       a.plan_duration,
        actual_plan_duration: a.actual_plan_duration,
      } as ActRow)),
    })));
  }

  @Input() contractBudget: number | null = null;
  @Input() submitting = false;
  @Output() submitted       = new EventEmitter<ContractStep8Request>();
  @Output() dataChange      = new EventEmitter<ContractStep8Request>();
  @Output() goBack          = new EventEmitter<void>();
  @Output() validationError = new EventEmitter<string[]>();
  @Output() budgetWarning   = new EventEmitter<string[]>();

  rows: WritableSignal<ComponentRow[]> = signal([EMPTY_COMPONENT()]);

  // ── Presupuesto helpers ────────────────────────────────────────────────────
  get totalComponentBudget(): number {
    return this.rows().reduce((s, c) => s + (c.budget ?? 0), 0);
  }

  componentActBudget(ci: number): number {
    return this.rows()[ci]?.acts.reduce((s, a) => s + (a.budget ?? 0), 0) ?? 0;
  }

  componentPercentageTotal(ci: number): number {
    return this.rows()[ci]?.acts.reduce((s, a) => s + (a.percentage ?? 0), 0) ?? 0;
  }

  budgetOverflow(ci: number): boolean {
    const comp = this.rows()[ci];
    if (!comp?.budget) return false;
    return this.componentActBudget(ci) > comp.budget;
  }

  contractBudgetOverflow(): boolean {
    if (!this.contractBudget) return false;
    return this.totalComponentBudget > this.contractBudget;
  }

  // ── Componentes ────────────────────────────────────────────────────────────
  addComponent(): void {
    this.rows.update(r => [...r, EMPTY_COMPONENT()]);
  }

  removeComponent(ci: number): void {
    this.rows.update(r => r.filter((_, i) => i !== ci));
    this.emit();
  }

  updateComponentName(ci: number, value: string): void {
    this.rows.update(r => r.map((comp, i) =>
      i === ci ? { ...comp, componentName: value } : comp));
    this.emit();
  }

  updateComponentBudget(ci: number, value: number | null): void {
    this.rows.update(r => r.map((comp, i) =>
      i === ci ? { ...comp, budget: value } : comp));
    this.emit();
    this.checkBudgetWarnings();
  }

  updateComponentPercentage(ci: number, value: string): void {
    const n = parseFloat(value);
    const parsed = isNaN(n) ? null : n;
    this.rows.update(r => r.map((comp, i) =>
      i === ci ? { ...comp, percentage: parsed } : comp));
    this.emit();
  }

  get totalComponentPercentage(): number {
    return this.rows().reduce((s, c) => s + (c.percentage ?? 0), 0);
  }

  // ── Actividades ────────────────────────────────────────────────────────────
  addAct(ci: number): void {
    this.rows.update(r => r.map((comp, i) =>
      i === ci ? { ...comp, acts: [...comp.acts, EMPTY_ACT()] } : comp));
  }

  removeAct(ci: number, ai: number): void {
    this.rows.update(r => r.map((comp, i) =>
      i === ci ? { ...comp, acts: comp.acts.filter((_, j) => j !== ai) } : comp));
    this.emit();
  }

  updateAct(ci: number, ai: number, field: keyof ActRow, value: string | number | boolean | null): void {
    this.rows.update(r => r.map((comp, i) =>
      i === ci
        ? { ...comp, acts: comp.acts.map((a, j) => j === ai ? { ...a, [field]: value } : a) }
        : comp));
    this.emit();
    if (field === 'budget') this.checkBudgetWarnings();
  }

  hasActualData(act: ActRow): boolean {
    return !!(act.actual_start_date || act.actual_end_date || act.actual_start_plan !== null);
  }

  private dateToISO(d: string): string | null {
    return d ? `${d}T00:00:00Z` : null;
  }

  private buildPayload(): ContractStep8Request {
    return this.rows().map(comp => {
      const item: ContractStep8Item = {
        id:         comp.id ?? null,
        component:  comp.componentName,
        percentage: comp.percentage ?? null,
        budget:     comp.budget ?? null,
        acts: comp.acts.map(a => {
          const hasActual = this.hasActualData(a);
          const act: ContractActItem = {
            id:            a.id ?? null,
            act:           a.act,
            description:   a.description   || null,
            start_date:    this.dateToISO(a.start_date),
            end_date:      this.dateToISO(a.end_date),
            start_plan:    a.start_plan     ?? null,
            responsible:   a.responsible   || null,
            objective:     a.objective     || null,
            percentage:    a.percentage,
            budget:        a.budget        ?? null,
            delete:        false,
          };
          if (hasActual) {
            act.actual_start_date = this.dateToISO(a.actual_start_date);
            act.actual_end_date   = this.dateToISO(a.actual_end_date);
            act.actual_start_plan = a.actual_start_plan ?? null;
          }
          return act;
        }),
        delete: false,
      };
      return item;
    });
  }

  private fmt(n: number): string {
    return n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  checkBudgetWarnings(): void {
    const warnings: string[] = [];
    this.rows().forEach((comp, ci) => {
      if (comp.budget !== null && this.componentActBudget(ci) > comp.budget) {
        const exceso = this.componentActBudget(ci) - comp.budget;
        warnings.push(`Componente ${ci + 1} "${comp.componentName || 'sin nombre'}": las actividades exceden el presupuesto en $ ${this.fmt(exceso)}.`);
      }
    });
    if (this.contractBudget !== null && this.totalComponentBudget > this.contractBudget) {
      const exceso = this.totalComponentBudget - this.contractBudget;
      warnings.push(`El total de componentes excede el presupuesto del contrato en $ ${this.fmt(exceso)}.`);
    }
    if (warnings.length) this.budgetWarning.emit(warnings);
  }

  private emit(): void { this.dataChange.emit(this.buildPayload()); }

  onSubmit(): void {
    const invalid: string[] = [];
    this.rows().forEach((comp, ci) => {
      if (!comp.componentName.trim())
        invalid.push(`Componente ${ci + 1}: nombre del componente requerido`);
      comp.acts.forEach((a, ai) => {
        const lbl = `Comp. ${ci + 1} — Actividad ${ai + 1}`;
        if (!a.description.trim()) invalid.push(`${lbl}: descripción requerida`);
        if (!a.responsible.trim()) invalid.push(`${lbl}: responsable requerido`);
        if (!a.start_date)         invalid.push(`${lbl}: fecha inicio requerida`);
        if (!a.end_date)           invalid.push(`${lbl}: fecha fin requerida`);
        const hasActual = this.hasActualData(a);
        if (hasActual) {
          if (!a.actual_start_date) invalid.push(`${lbl}: fecha inicio real requerida cuando hay datos de ejecución`);
          if (!a.actual_end_date)   invalid.push(`${lbl}: fecha fin real requerida cuando hay datos de ejecución`);
          if (a.actual_start_plan === null) invalid.push(`${lbl}: plan inicio real requerido cuando hay datos de ejecución`);
        }
      });
      if (comp.budget !== null && this.componentActBudget(ci) > comp.budget)
        invalid.push(`Componente ${ci + 1}: el presupuesto de las actividades supera el del componente`);
    });
    if (this.contractBudget !== null && this.totalComponentBudget > this.contractBudget)
      invalid.push('El presupuesto total de componentes supera el presupuesto del contrato');
    if (invalid.length) { this.validationError.emit(invalid); return; }
    this.submitted.emit(this.buildPayload());
  }
}
