import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../services/project.service';
import {
  Risk, RiskRequest, RiskProbability, RiskImpact, RiskLevel, RiskEvaluationResult,
  RiskTrackingItem, RiskTrackingRequest, RiskTrackingStatus,
} from '../../../../models/project.model';

interface RiskForm {
  description:       string;
  zone:               string;
  probability:        RiskProbability | '';
  impact:             RiskImpact | '';
  contingency_plan:   string;
  evidence:           string;
  responsible:        string;
  correction_reason:  string;
}

const emptyRiskForm = (): RiskForm => ({
  description: '', zone: '', probability: '', impact: '',
  contingency_plan: '', evidence: '', responsible: '', correction_reason: '',
});

interface TrackingForm {
  year:   number;
  month:  number;
  status: RiskTrackingStatus;
  notes:  string;
}

const emptyTrackingForm = (): TrackingForm => ({
  year:   new Date().getFullYear(),
  month:  new Date().getMonth() + 1,
  status: 'pending',
  notes:  '',
});

@Component({
  selector: 'app-tab-riesgos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tab-riesgos.component.html',
})
export class TabRiesgosComponent implements OnInit {
  @Input() projectId!: string;
  @Input() locked = false;

  constructor(private svc: ProjectService) {}

  readonly PROBABILITY_OPTIONS: { value: RiskProbability; label: string; score: number }[] = [
    { value: 'casi_seguro', label: 'Casi seguro', score: 5 },
    { value: 'probable',    label: 'Probable',    score: 4 },
    { value: 'posible',     label: 'Posible',      score: 3 },
    { value: 'raro',        label: 'Raro',          score: 2 },
    { value: 'improbable',  label: 'Improbable',    score: 1 },
  ];

  readonly IMPACT_OPTIONS: { value: RiskImpact; label: string; score: number }[] = [
    { value: 'catastrofico', label: 'Catastrófico', score: 5 },
    { value: 'mayor',        label: 'Mayor',        score: 4 },
    { value: 'moderado',     label: 'Moderado',      score: 3 },
    { value: 'menor',        label: 'Menor',          score: 2 },
    { value: 'leve',         label: 'Leve',           score: 1 },
  ];

  readonly STATUS_OPTIONS: { value: RiskTrackingStatus; label: string }[] = [
    { value: 'pending',      label: 'Pendiente' },
    { value: 'materialized', label: 'Materializado' },
    { value: 'mitigated',    label: 'Mitigado' },
    { value: 'closed',       label: 'Cerrado' },
  ];

  readonly MONTH_NAMES = ['', 'Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  readonly MONTHS = Array.from({ length: 12 }, (_, i) => ({ val: i + 1, label: this.MONTH_NAMES[i + 1] }));
  readonly YEARS  = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i);

  risks   = signal<Risk[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  showForm     = signal(false);
  editingRisk  = signal<Risk | null>(null);
  form: RiskForm = emptyRiskForm();
  saving       = signal(false);
  saveError    = signal<string | null>(null);

  // ── Evaluación IA (solo al crear; al editar el baseline sale del riesgo ya guardado) ──
  evalCategory  = '';
  evalContext   = '';
  evaluating    = signal(false);
  evaluateError = signal<string | null>(null);
  aiResult      = signal<RiskEvaluationResult | null>(null);

  // Baseline contra el que se compara para exigir motivo: el del riesgo ya guardado
  // (edición, inmutable) o el de la última evaluación de esta sesión (creación).
  //
  // Métodos normales, NO computed(): dependen de this.form.probability/impact, que son
  // propiedades planas mutadas por [(ngModel)] — no señales — así que un computed() no
  // se invalidaría al cambiarlas (solo recalcula cuando cambia una señal que lee, y
  // aquí solo "lee" campos planos). Zone.js sí vuelve a llamar estos métodos en cada
  // ciclo de detección de cambios, que es lo que necesitamos.
  aiBaseline(): { probability: RiskProbability; impact: RiskImpact; risk_level_label: string; justification: string | null; suggested_control: string | null } | null {
    const editing = this.editingRisk();
    if (editing?.ai_probability && editing?.ai_impact) {
      return {
        probability:       editing.ai_probability,
        impact:             editing.ai_impact,
        risk_level_label:   this.riskLevelLabel(editing.ai_risk_level ?? 'B'),
        justification:      editing.ai_justification,
        suggested_control:  editing.ai_suggested_control,
      };
    }
    const r = this.aiResult();
    return r ? {
      probability:       r.probability,
      impact:             r.impact,
      risk_level_label:   r.risk_level_label,
      justification:      r.justification,
      suggested_control:  r.suggested_control,
    } : null;
  }

  requiresCorrection(): boolean {
    const b = this.aiBaseline();
    if (!b || !this.form.probability || !this.form.impact) return false;
    return this.form.probability !== b.probability || this.form.impact !== b.impact;
  }

  selectedRisk    = signal<Risk | null>(null);
  tracking        = signal<RiskTrackingItem[]>([]);
  trackingLoading = signal(false);

  showTrackingForm   = signal(false);
  editingTracking     = signal<RiskTrackingItem | null>(null);
  trackingForm: TrackingForm = emptyTrackingForm();
  trackingSaving      = signal(false);
  trackingSaveError   = signal<string | null>(null);

  totalRisks    = computed(() => this.risks().length);
  byLevel = computed(() => {
    const counts: Record<RiskLevel, number> = { E: 0, A: 0, M: 0, B: 0 };
    for (const r of this.risks()) counts[r.risk_level]++;
    return counts;
  });
  criticalCount = computed(() => this.byLevel().E + this.byLevel().A);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getRisks(this.projectId).subscribe({
      next:  r => { this.risks.set(r ?? []); this.loading.set(false); },
      error: () => { this.error.set('No se pudieron cargar los riesgos.'); this.loading.set(false); },
    });
  }

  // ── CRUD riesgo ──────────────────────────────────────────────────────────

  openNewForm(): void {
    this.form = emptyRiskForm();
    this.evalCategory = '';
    this.evalContext = '';
    this.aiResult.set(null);
    this.evaluateError.set(null);
    this.editingRisk.set(null);
    this.showForm.set(true);
    this.saveError.set(null);
  }

  openEditForm(risk: Risk): void {
    this.form = {
      description:       risk.description,
      zone:               risk.zone ?? '',
      probability:        risk.probability,
      impact:             risk.impact,
      contingency_plan:   risk.contingency_plan ?? '',
      evidence:           risk.evidence ?? '',
      responsible:        risk.responsible ?? '',
      correction_reason:  risk.correction_reason ?? '',
    };
    this.aiResult.set(null);
    this.evaluateError.set(null);
    this.editingRisk.set(risk);
    this.showForm.set(true);
    this.saveError.set(null);
  }

  cancelForm(): void { this.showForm.set(false); this.editingRisk.set(null); this.saveError.set(null); }

  // Pide al agente IA una sugerencia de probabilidad/impacto (preview, no persiste
  // nada). Solo tiene sentido al crear — al editar el baseline ya quedó fijado.
  evaluateWithAI(): void {
    if (!this.form.description.trim()) { this.evaluateError.set('Escribe la descripción del riesgo antes de evaluar.'); return; }

    this.evaluating.set(true);
    this.evaluateError.set(null);
    this.svc.evaluateRisk(this.projectId, {
      description:        this.form.description.trim(),
      category:            this.evalCategory.trim() || null,
      additional_context:  this.evalContext.trim() || null,
    }).subscribe({
      next: result => {
        this.aiResult.set(result);
        this.form.probability = result.probability;
        this.form.impact = result.impact;
        this.form.correction_reason = '';
        this.evaluating.set(false);
      },
      error: err => {
        this.evaluateError.set(err?.error?.message ?? 'No se pudo evaluar el riesgo con IA.');
        this.evaluating.set(false);
      },
    });
  }

  saveRisk(): void {
    if (!this.form.description.trim()) { this.saveError.set('La descripción es obligatoria.'); return; }
    if (!this.form.probability)        { this.saveError.set('Selecciona la probabilidad.'); return; }
    if (!this.form.impact)             { this.saveError.set('Selecciona el impacto.'); return; }
    if (this.requiresCorrection() && !this.form.correction_reason.trim()) {
      this.saveError.set('Explica el motivo: por qué el agente falló y cuál es la probabilidad/impacto real.');
      return;
    }

    const aiResult = this.aiResult();
    const req: RiskRequest = {
      description:       this.form.description.trim(),
      zone:               this.form.zone.trim() || null,
      probability:        this.form.probability,
      impact:             this.form.impact,
      contingency_plan:   this.form.contingency_plan.trim() || null,
      evidence:           this.form.evidence.trim() || null,
      responsible:        this.form.responsible.trim() || null,
      correction_reason:  this.form.correction_reason.trim() || null,
      // El baseline de IA solo se manda al crear (echo de la evaluación de esta
      // sesión); al editar el backend lo ignora y sigue usando el ya guardado.
      ...(!this.editingRisk() && aiResult ? {
        ai_probability:       aiResult.probability,
        ai_impact:             aiResult.impact,
        ai_risk_level:         aiResult.risk_level,
        ai_justification:      aiResult.justification,
        ai_suggested_control:  aiResult.suggested_control,
        ai_evaluated_at:       aiResult.evaluated_at,
      } : {}),
    };

    this.saving.set(true);
    this.saveError.set(null);

    const editing = this.editingRisk();
    const request$ = editing
      ? this.svc.updateRisk(this.projectId, editing.id, req)
      : this.svc.createRisk(this.projectId, req);

    request$.subscribe({
      next: saved => {
        this.risks.update(list => {
          const idx = list.findIndex(r => r.id === saved.id);
          return idx >= 0 ? list.map((r, i) => i === idx ? saved : r) : [saved, ...list];
        });
        if (this.selectedRisk()?.id === saved.id) this.selectedRisk.set(saved);
        this.showForm.set(false);
        this.editingRisk.set(null);
        this.saving.set(false);
      },
      error: err => {
        this.saveError.set(err?.error?.message ?? 'Error al guardar el riesgo.');
        this.saving.set(false);
      },
    });
  }

  deleteRisk(risk: Risk): void {
    this.svc.deleteRisk(this.projectId, risk.id).subscribe({
      next: () => {
        this.risks.update(list => list.filter(r => r.id !== risk.id));
        if (this.selectedRisk()?.id === risk.id) this.selectedRisk.set(null);
      },
      error: () => this.error.set('No se pudo eliminar el riesgo.'),
    });
  }

  // ── Seguimiento mensual ──────────────────────────────────────────────────

  selectRisk(risk: Risk): void {
    if (this.selectedRisk()?.id === risk.id) return;
    this.selectedRisk.set(risk);
    this.tracking.set([]);
    this.showTrackingForm.set(false);
    this.trackingLoading.set(true);
    this.svc.getRiskTracking(this.projectId, risk.id).subscribe({
      next:  t => { this.tracking.set(t ?? []); this.trackingLoading.set(false); },
      error: () => this.trackingLoading.set(false),
    });
  }

  openNewTrackingForm(): void {
    this.trackingForm = emptyTrackingForm();
    this.editingTracking.set(null);
    this.showTrackingForm.set(true);
    this.trackingSaveError.set(null);
  }

  openEditTrackingForm(t: RiskTrackingItem): void {
    this.trackingForm = { year: t.year, month: t.month, status: t.status, notes: t.notes ?? '' };
    this.editingTracking.set(t);
    this.showTrackingForm.set(true);
    this.trackingSaveError.set(null);
  }

  cancelTrackingForm(): void {
    this.showTrackingForm.set(false);
    this.editingTracking.set(null);
    this.trackingSaveError.set(null);
  }

  saveTracking(): void {
    const risk = this.selectedRisk();
    if (!risk) return;

    const req: RiskTrackingRequest = {
      year:   this.trackingForm.year,
      month:  this.trackingForm.month,
      status: this.trackingForm.status,
      notes:  this.trackingForm.notes.trim() || null,
    };

    this.trackingSaving.set(true);
    this.trackingSaveError.set(null);
    this.svc.upsertRiskTracking(this.projectId, risk.id, req).subscribe({
      next: saved => {
        this.tracking.update(list => {
          const idx = list.findIndex(t => t.year === saved.year && t.month === saved.month);
          const next = idx >= 0 ? list.map((t, i) => i === idx ? saved : t) : [...list, saved];
          return next.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
        });
        this.showTrackingForm.set(false);
        this.editingTracking.set(null);
        this.trackingSaving.set(false);
      },
      error: err => {
        this.trackingSaveError.set(err?.error?.message ?? 'Error al guardar el seguimiento.');
        this.trackingSaving.set(false);
      },
    });
  }

  // ── Helpers de presentación ──────────────────────────────────────────────

  riskLevelLabel(level: RiskLevel): string {
    return { E: 'Extremo', A: 'Alto', M: 'Medio', B: 'Bajo' }[level];
  }

  riskLevelClasses(level: RiskLevel): string {
    return {
      E: 'bg-red-50 text-red-700 border-red-200',
      A: 'bg-orange-50 text-orange-700 border-orange-200',
      M: 'bg-amber-50 text-amber-700 border-amber-200',
      B: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }[level];
  }

  probabilityLabel(p: RiskProbability): string {
    return this.PROBABILITY_OPTIONS.find(o => o.value === p)?.label ?? p;
  }

  impactLabel(i: RiskImpact): string {
    return this.IMPACT_OPTIONS.find(o => o.value === i)?.label ?? i;
  }

  statusLabel(s: RiskTrackingStatus): string {
    return this.STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;
  }

  statusClasses(s: RiskTrackingStatus): string {
    return {
      pending:      'bg-gray-50 text-gray-600 border-gray-200',
      materialized: 'bg-red-50 text-red-700 border-red-200',
      mitigated:    'bg-emerald-50 text-emerald-700 border-emerald-200',
      closed:       'bg-sky-50 text-sky-700 border-sky-200',
    }[s];
  }

  monthLabel(m: number): string { return this.MONTH_NAMES[m] ?? String(m); }

  trackByRisk(_: number, r: Risk) { return r.id; }
  trackByTracking(_: number, t: RiskTrackingItem) { return t.year + '-' + t.month; }
}
