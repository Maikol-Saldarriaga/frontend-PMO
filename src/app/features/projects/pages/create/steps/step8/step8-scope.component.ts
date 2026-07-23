import { Component, Input, Output, EventEmitter, signal, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ContractStep8Request, ContractStep8Item, ContractActItem,
  WizardStep8ComponentResponse,
} from '../../../../models/contract.model';
import { MoneyMaskDirective } from '../../../../../../shared/directives/money-mask.directive';
import { ProjectService } from '../../../../services/project.service';

interface ActRow {
  id?:               string | null;
  act:               number;
  description:       string;
  start_date:        string;
  end_date:          string;
  start_plan:        number | null;
  responsible:       string;
  objective:         string;
  percentage:        number;
  plan_duration?:    number | null;
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
  responsible: '', objective: '',
  percentage: 0,
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
  private svc = inject(ProjectService);

  @Input() projectId: string | null = null;

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
        responsible:         a.responsible         ?? '',
        objective:           a.objective           ?? '',
        percentage:          a.percentage          ?? 0,
        plan_duration:       a.plan_duration,
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
  deleteError = signal<string | null>(null);

  // ── Presupuesto helpers ────────────────────────────────────────────────────
  get totalComponentBudget(): number {
    return this.rows().reduce((s, c) => s + (c.budget ?? 0), 0);
  }

  componentPercentageTotal(ci: number): number {
    return this.rows()[ci]?.acts.reduce((s, a) => s + (a.percentage ?? 0), 0) ?? 0;
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
    const comp = this.rows()[ci];
    this.deleteError.set(null);

    if (comp?.id && this.projectId) {
      this.svc.deleteComponent(this.projectId, comp.id).subscribe({
        next: () => {
          this.rows.update(r => r.filter((_, i) => i !== ci));
          this.emit();
        },
        error: err => {
          this.deleteError.set(err?.error?.message ?? 'No se pudo eliminar el componente en el servidor.');
        },
      });
      return;
    }

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
    this.rows.update(r => r.map((comp, i) => {
      if (i !== ci) return comp;
      // Número de actividad = máximo act existente + 1, o 1 si el componente no tiene ninguna aún.
      const nextAct = comp.acts.reduce((max, a) => Math.max(max, a.act ?? 0), 0) + 1;
      return { ...comp, acts: [...comp.acts, { ...EMPTY_ACT(), act: nextAct }] };
    }));
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
        acts: comp.acts.map(a => ({
          id:            a.id ?? null,
          act:           a.act,
          description:   a.description   || null,
          start_date:    this.dateToISO(a.start_date),
          end_date:      this.dateToISO(a.end_date),
          start_plan:    a.start_plan     ?? null,
          responsible:   a.responsible   || null,
          objective:     a.objective     || null,
          percentage:    a.percentage,
          delete:        false,
        } as ContractActItem)),
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
    if (this.contractBudget !== null && this.totalComponentBudget > this.contractBudget) {
      const adelantado = this.totalComponentBudget - this.contractBudget;
      warnings.push(`El total de componentes excede el presupuesto del contrato en $ ${this.fmt(adelantado)}.`);
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
      });
    });
    if (this.contractBudget !== null && this.totalComponentBudget > this.contractBudget)
      invalid.push('El presupuesto total de componentes supera el presupuesto del contrato');
    if (invalid.length) { this.validationError.emit(invalid); return; }
    this.submitted.emit(this.buildPayload());
  }
}
