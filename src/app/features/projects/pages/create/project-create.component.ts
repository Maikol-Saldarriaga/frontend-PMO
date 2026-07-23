import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, takeUntil, forkJoin } from 'rxjs';
import { ContractService } from '../../services/contract.service';
import { ProjectService } from '../../services/project.service';
import { renameFileForUpload } from '../../../../../core/utils/file.utils';
import { PROJECT_STEPS, ProjectDraft, ProjectStep1Request, ProjectStep4Request, ProjectWizardObjective } from '../../models/project.model';
import {
  ContractDraft, ContractProgressResponse,
  ContractLocation, ContractLocationItem,
  ContractStep1Request, ContractStep1bRequest,
  ContractStep3Request, ContractStep5Request, ContractStep6Request,
  ContractStep7Request, ContractStep8Request,
  ContractStep9Request, ContractStep10Request,
  WizardCondition, WizardActor, WizardIndicator,
  ContractWizardStep8,
  WizardGuarantee,
  ContractBeneficiaryItem,
} from '../../models/contract.model';
import { Step1GeneralInfoComponent } from './steps/step1/step1-general-info.component';
import { Step1bSupervisorsComponent, Step1bSavedData } from './steps/step1b/step1b-supervisors.component';
import { Step2LocationComponent } from './steps/step2/step2-location.component';
import { Step3AlignmentComponent } from './steps/step3/step3-alignment.component';
import { Step4ObjectivesComponent } from './steps/step4/step4-objectives.component';
import { Step5ConditionsComponent, Step5SubmitPayload } from './steps/step5/step5-conditions.component';
import { Step6BeneficiariesComponent } from './steps/step6/step6-beneficiaries.component';
import { Step7ActorsComponent } from './steps/step7/step7-actors.component';
import { Step8ScopeComponent } from './steps/step8/step8-scope.component';
import { Step9IndicatorsComponent, Step9SubmitPayload } from './steps/step9/step9-indicators.component';
import { Step10GuaranteesComponent } from './steps/step10/step10-guarantees.component';

const DRAFT_KEY = (id: string) => `pmo_contract_draft_${id}`;
const NEW_DRAFT  = 'pmo_contract_draft_new';

@Component({
  selector: 'app-project-create',
  standalone: true,
  imports: [CommonModule, Step1GeneralInfoComponent, Step1bSupervisorsComponent, Step2LocationComponent, Step3AlignmentComponent, Step4ObjectivesComponent, Step5ConditionsComponent, Step6BeneficiariesComponent, Step7ActorsComponent, Step8ScopeComponent, Step9IndicatorsComponent, Step10GuaranteesComponent],
  templateUrl: './project-create.component.html',
})
export class ProjectCreateComponent implements OnInit, OnDestroy {
  private router   = inject(Router);
  private route    = inject(ActivatedRoute);
  private contractSvc = inject(ContractService);
  private projectSvc  = inject(ProjectService);

  readonly steps = PROJECT_STEPS;

  currentStep      = signal(1);
  projectId        = signal<string | null>(null);
  serviceId        = signal<string | null>(null);
  // navSteps: índice máximo de step accesible, controlado solo desde el frontend
  navSteps         = signal(0);
  // completedSteps / totalSteps / percentDone: solo para display en la barra
  completedSteps   = signal(0);
  totalSteps       = signal(11);
  percentDone      = signal(0);
  submitting       = signal(false);
  loading          = signal(false);
  error            = signal<string | null>(null);
  success          = signal<string | null>(null);
  validationErrors = signal<string[]>([]);
  draftLoaded      = signal(false);
  stepData         = signal<Record<string, unknown>>({});
  showDraftPrompt  = signal(false);

  private toastTimer:  ReturnType<typeof setTimeout> | null = null;
  private navTimer:    ReturnType<typeof setTimeout> | null = null;
  private destroy$     = new Subject<void>();
  private draftChange$ = new Subject<void>();
  private pendingServerLoad: { id: string; step: number | null } | null = null;

  private flushDraft = (): void => this.saveDraft();
  private onVisibilityChange = (): void => { if (document.visibilityState === 'hidden') this.saveDraft(); };

  progressWidth = computed(() => `${this.percentDone()}%`);

  private get draftKey(): string {
    const id = this.projectId();
    return id ? DRAFT_KEY(id) : NEW_DRAFT;
  }

  ngOnInit(): void {
    this.draftChange$.pipe(debounceTime(600), takeUntil(this.destroy$))
      .subscribe(() => this.saveDraft());

    window.addEventListener('beforeunload', this.flushDraft);
    window.addEventListener('pagehide', this.flushDraft);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    const idParam   = this.route.snapshot.paramMap.get('id')
                   ?? this.route.snapshot.queryParamMap.get('id');
    const stepParam = this.route.snapshot.queryParamMap.get('step');

    if (idParam) {
      this.projectId.set(idParam);
      const step = stepParam ? +stepParam : null;
      const localDraft = this.readStoredDraft(DRAFT_KEY(idParam));
      if (localDraft) {
        this.pendingServerLoad = { id: idParam, step };
        this.showDraftPrompt.set(true);
      } else {
        this.loadFromServer(idParam, step);
      }
    } else if (this.readStoredDraft(NEW_DRAFT)) {
      this.showDraftPrompt.set(true);
    }
  }

  resumeDraft(): void {
    this.showDraftPrompt.set(false);
    if (this.pendingServerLoad) {
      this.loadDraft(DRAFT_KEY(this.pendingServerLoad.id), this.pendingServerLoad.step);
      this.pendingServerLoad = null;
    } else {
      this.loadDraft(NEW_DRAFT, null);
    }
  }

  discardDraft(): void {
    if (this.pendingServerLoad) {
      const { id, step } = this.pendingServerLoad;
      localStorage.removeItem(DRAFT_KEY(id));
      this.pendingServerLoad = null;
      this.showDraftPrompt.set(false);
      this.loadFromServer(id, step);
      return;
    }
    localStorage.removeItem(NEW_DRAFT);
    this.showDraftPrompt.set(false);
  }

  ngOnDestroy(): void {
    this.saveDraft();
    this.destroy$.next();
    this.destroy$.complete();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.navTimer)   clearTimeout(this.navTimer);
    window.removeEventListener('beforeunload', this.flushDraft);
    window.removeEventListener('pagehide', this.flushDraft);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private applyProgress(res: ContractProgressResponse): void {
    // Solo actualiza la barra de progreso (display), no el control de navegación
    this.completedSteps.set(res.completed_steps);
    this.totalSteps.set(res.total_steps);
    this.percentDone.set(res.percent_done);
  }

  private advanceNav(): void {
    // Usa Math.max para que re-enviar un step ya completado no avance más de la cuenta
    const currentIdx = this.stepIndex(this.currentStep());
    this.navSteps.update(n => Math.max(n, currentIdx + 1));
  }

  private loadFromServer(id: string, targetStep: number | null): void {
    this.loading.set(true);
    this.contractSvc.getWizard(id).subscribe({
      next: (wizard) => {
        const c   = wizard.step1?.contract;
        const svc = wizard.step1?.service;

        this.projectId.set(c?.id ?? id);
        this.serviceId.set(svc?.id ?? null);
        this.applyProgress(wizard.progress);

        const stepData: Record<string, unknown> = {};

        // ── Step 1 — contrato + servicio ──────────────────────────────────────
        if (c && svc) {
          stepData['step1'] = {
            project_number:     c.project_number        ?? '',
            social_reason:      c.company_name           ?? '',
            type:               c.type                   ?? 'contrato',
            has_worker_order:   svc.has_worker_order     ?? false,
            worker_order:       svc.number_work_order    ?? '',
            project_code:       svc.project_code         ?? '',
            project_name:       svc.project_name         ?? '',
            start_date:         c.start_date?.split('T')[0]   ?? '',
            end_date:           c.end_date?.split('T')[0]     ?? '',
            service_start_date: svc.start_date?.split('T')[0] ?? '',
            service_end_date:   svc.end_date?.split('T')[0]   ?? '',
            service_duration:   svc.duration                   ?? 0,
            duration_days:      c.duration                     ?? 0,
            objective:          c.object                       ?? '',
            total_budget:       c.value                        ?? 0,
            other_type_if:      c.other_type_if                ?? false,
            antecedent:         svc.antecedent                 ?? '',
          } as ProjectStep1Request;
        }

        // ── Step 1b — supervisores ────────────────────────────────────────────
        const sup = wizard.supervisors;
        stepData['step1b'] = {
          counterpart_supervisor: sup?.counterpart_supervisor?.id ?? null,
          ally_supervisor:        sup?.ally_supervisor?.id        ?? null,
        } as Step1bSavedData;

        // ── Step 2 — ubicaciones ───────────────────────────────────────────────
        if (wizard.step2?.length) stepData['step2'] = wizard.step2 as ContractLocationItem[];

        // ── Step 3 — alineación estratégica ───────────────────────────────────
        if (wizard.step3) stepData['step3'] = wizard.step3 as ContractStep3Request;

        // ── Step 4 — objetivo ─────────────────────────────────────────────────
        if (wizard.step4?.objective) {
          const obj = wizard.step4.objective;
          stepData['step4'] = {
            id:                  obj.id                   ?? '',
            necessity:           obj.necessity             ?? '',
            general_objective:   obj.general_objective     ?? '',
            goals:               obj.goal?.[0]             ?? '',
            causes:              obj.causes                ?? [],
            consequences:        obj.consequences          ?? [],
            specific_objectives: obj.specific_objectives   ?? [],
          } as ProjectWizardObjective;
        }

        // ── Step 5 — condiciones (anidadas en step4) ──────────────────────────
        if (wizard.step4?.conditions?.length) {
          stepData['step5'] = wizard.step4.conditions as WizardCondition[];
        }

        // ── Step 6 — beneficiarios ────────────────────────────────────────────
        if (wizard.step6?.length) stepData['step6'] = wizard.step6 as ContractBeneficiaryItem[];

        // ── Step 7 — actores ──────────────────────────────────────────────────
        if (wizard.step7?.length) stepData['step7'] = wizard.step7 as WizardActor[];

        // ── Step 8 — alcance ({ contract_budget, components }) ──────────────
        if (wizard.step8) stepData['step8'] = wizard.step8;

        // ── Step 9 — indicadores ──────────────────────────────────────────────
        if (wizard.step9?.length) stepData['step9'] = wizard.step9 as WizardIndicator[];

        // ── Step 10 — garantías ───────────────────────────────────────────────
        if (wizard.step10?.length) stepData['step10'] = wizard.step10 as WizardGuarantee[];

        this.stepData.set(stepData);

        // Derivar navSteps con condiciones ANIDADAS y SECUENCIALES
        // Si un step no está completo, los siguientes no se evalúan → evita saltos
        let nav = 0;
        if (c?.id && svc?.id) {
          nav = 1; // step 1 hecho → step 2 (Supervisores) accesible
          if (sup?.counterpart_supervisor?.id || sup?.ally_supervisor?.id) {
            nav = 2; // step 2 hecho → step 3 (Cobertura) accesible
            if (wizard.step2?.length) {
              nav = 3; // step 3 hecho → step 4 (Alineación) accesible
              if (wizard.step3?.indicator || wizard.step3?.course_action || wizard.step3?.context_justification) {
                nav = 4; // step 4 hecho → step 5 (Objetivos) accesible
                const obj = wizard.step4?.objective;
                if (obj?.necessity || obj?.general_objective) {
                  nav = 5; // step 5 hecho → step 6 (Condiciones) accesible
                  if (wizard.step4?.conditions?.length) {
                    nav = 6; // step 6 hecho → step 7 (Beneficiarios) accesible
                    if (wizard.step6?.length) {
                      nav = 7; // step 7 hecho → step 8 (Actores) accesible
                      if (wizard.step7?.length) {
                        nav = 8; // step 8 hecho → step 9 (Alcance) accesible
                        if (wizard.step8?.components?.length) {
                          nav = 9; // step 9 hecho → step 10 (Indicadores) accesible
                          if (wizard.step9?.length) {
                            nav = 10; // step 10 (Garantías) accesible
                            if (wizard.step10?.length) {
                              nav = 11; // paso siguiente
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        this.navSteps.set(nav);

        const nextStep = this.steps[nav]?.number ?? 1;
        this.currentStep.set(targetStep ?? nextStep);
        this.loading.set(false);
      },
      error: () => {
        const localDraft = this.readStoredDraft(DRAFT_KEY(id));
        if (localDraft) {
          this.applyDraft(localDraft);
          this.draftLoaded.set(true);
        } else {
          this.currentStep.set(targetStep ?? 1);
        }
        this.loading.set(false);
      },
    });
  }

  private loadDraft(key: string, targetStep: number | null): void {
    const draft = this.readStoredDraft(key);
    if (draft) {
      this.applyDraft(draft);
      this.draftLoaded.set(true);
    } else if (targetStep) {
      this.currentStep.set(targetStep);
    }
  }

  private readStoredDraft(key: string): ContractDraft | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as ContractDraft) : null;
    } catch { return null; }
  }

  private applyDraft(draft: ContractDraft): void {
    if (draft.contractId)  this.projectId.set(draft.contractId);
    if (draft.serviceId)   this.serviceId.set(draft.serviceId);
    this.currentStep.set(draft.currentStep ?? 1);
    this.navSteps.set((draft as ContractDraft & { navSteps?: number }).navSteps ?? 0);
    this.completedSteps.set(draft.completedSteps ?? 0);
    this.totalSteps.set(draft.totalSteps ?? 11);
    this.percentDone.set(draft.percentDone ?? 0);
    this.stepData.set(draft.stepData ?? {});
  }

  private saveDraft(): void {
    const draft = {
      contractId:     this.projectId(),
      serviceId:      this.serviceId(),
      currentStep:    this.currentStep(),
      navSteps:       this.navSteps(),
      completedSteps: this.completedSteps(),
      totalSteps:     this.totalSteps(),
      percentDone:    this.percentDone(),
      stepData:       this.stepData(),
      updatedAt:      Date.now(),
    };
    try {
      localStorage.setItem(this.draftKey, JSON.stringify(draft));
    } catch { /* localStorage lleno o bloqueado: borrador se pierde, nada más que hacer aquí */ }
  }

  private stepIndex(stepNumber: number): number {
    return this.steps.findIndex(s => s.number === stepNumber);
  }

  getStepStatus(stepNumber: number): 'completed' | 'current' | 'upcoming' {
    if (stepNumber === this.currentStep()) return 'current';
    return this.stepIndex(stepNumber) < this.navSteps() ? 'completed' : 'upcoming';
  }

  isStepClickable(stepNumber: number): boolean {
    return this.stepIndex(stepNumber) <= this.navSteps();
  }

  // ── Getters de datos por step ────────────────────────────────────────────────

  getStep1SavedData(): ProjectStep1Request | undefined {
    return this.stepData()['step1'] as ProjectStep1Request | undefined;
  }

  getStep1bSavedData(): Step1bSavedData | undefined {
    return this.stepData()['step1b'] as Step1bSavedData | undefined;
  }

  getStep2SavedLocations(): ContractLocationItem[] | undefined {
    return this.stepData()['step2'] as ContractLocationItem[] | undefined;
  }

  getStep3SavedData(): ContractStep3Request | undefined {
    return this.stepData()['step3'] as ContractStep3Request | undefined;
  }

  getStep4SavedData(): ProjectWizardObjective | undefined {
    return this.stepData()['step4'] as ProjectWizardObjective | undefined;
  }

  getStep5SavedData(): WizardCondition[] | undefined {
    return this.stepData()['step5'] as WizardCondition[] | undefined;
  }

  getStep6SavedData(): ContractBeneficiaryItem[] | undefined {
    return this.stepData()['step6'] as ContractBeneficiaryItem[] | undefined;
  }

  getStep7SavedData(): WizardActor[] | undefined {
    return this.stepData()['step7'] as WizardActor[] | undefined;
  }

  getStep8SavedData(): ContractWizardStep8 | undefined {
    return this.stepData()['step8'] as ContractWizardStep8 | undefined;
  }

  getStep9SavedData(): WizardIndicator[] | undefined {
    return this.stepData()['step9'] as WizardIndicator[] | undefined;
  }

  getStep10SavedData(): WizardGuarantee[] | undefined {
    return this.stepData()['step10'] as WizardGuarantee[] | undefined;
  }

  getStep9Components(): { id: string; name: string }[] {
    const step8 = this.stepData()['step8'] as ContractWizardStep8 | undefined;
    return step8?.components?.map(c => ({ id: c.id, name: c.component })) ?? [];
  }

  // ── Handlers de submit ───────────────────────────────────────────────────────

  private handleProgress(res: ContractProgressResponse, nextStep: number, successMsg: string): void {
    this.applyProgress(res);
    this.advanceNav();
    this.currentStep.set(nextStep);   // actualiza ANTES de guardar el borrador
    this.submitting.set(false);
    this.showToast('success', successMsg);
    this.saveDraft();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: nextStep },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private handleServiceResponse(nextStep: number, successMsg: string): void {
    this.advanceNav();
    this.currentStep.set(nextStep);   // actualiza ANTES de guardar el borrador
    this.submitting.set(false);
    this.showToast('success', successMsg);
    this.saveDraft();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: nextStep },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // El backend siempre responde {"error": "<resumen>"} y, para errores de validación con
  // varios campos, además {"errors": ["<campo 1>: <motivo>", ...]} (ver apierr.ResponseBody
  // en el backend). Antes este método buscaba `message`/`errors` bajo llaves que el backend
  // nunca envía (`message`), así que el mensaje real siempre se perdía y solo se veía el
  // fallback genérico — de ahí que el usuario solo viera "Error".
  private handleError(err: unknown, fallback: string): void {
    this.submitting.set(false);
    const e = err as { error?: { error?: string; errors?: string[] } };
    this.showToast('error', e?.error?.error ?? fallback, Array.isArray(e?.error?.errors) ? e.error!.errors! : []);
  }

  onStep9Submit(payload: Step9SubmitPayload): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step9: payload.request.indicators }));
    this.draftChange$.next();
    this.contractSvc.updateStep9(id, payload.request).subscribe({
      next: (res) => this.afterStep9Save(id, res, payload.uploads),
      error: (err) => this.handleError(err, 'Error al guardar los indicadores.'),
    });
  }

  private afterStep9Save(id: string, res: ContractProgressResponse, uploads: Step9SubmitPayload['uploads']): void {
    if (!uploads.length) { this.handleProgress(res, 11, 'Indicadores guardados correctamente.'); return; }

    // Las filas nuevas todavía no tienen id real; lo obtenemos recargando el wizard
    // (el backend no devuelve las filas guardadas en la respuesta del PUT bulk).
    this.contractSvc.getWizard(id).subscribe({
      next: wizard => {
        const savedIndicators = wizard.step9 ?? [];
        const calls = uploads.flatMap(u => {
          const ind = savedIndicators[u.rowIndex];
          if (!ind?.id) return [];
          return u.files.map((file, idx) => {
            const fd = new FormData();
            fd.append('file', renameFileForUpload(file, u.name, idx, u.files.length));
            fd.append('verification_type', u.verification_type);
            fd.append('name', u.name);
            return this.projectSvc.uploadIndicatorVerification(id, ind.id, fd);
          });
        });
        if (!calls.length) { this.handleProgress(res, 11, 'Indicadores guardados correctamente.'); return; }
        forkJoin(calls).subscribe({
          next: () => this.handleProgress(res, 11, 'Indicadores y medios de verificación guardados correctamente.'),
          error: () => this.handleProgress(res, 11, 'Los indicadores se guardaron, pero hubo un error al subir algunos medios de verificación.'),
        });
      },
      error: () => this.handleProgress(res, 11, 'Los indicadores se guardaron, pero no se pudieron subir los medios de verificación.'),
    });
  }

  onStep10Submit(data: ContractStep10Request): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step10: data.guarantees }));
    this.draftChange$.next();
    this.contractSvc.updateStep10(id, data).subscribe({
      next: () => {
        localStorage.removeItem(this.draftKey);
        this.submitting.set(false);
        this.router.navigate(['/projects', id]);
      },
      error: (err) => this.handleError(err, 'Error al guardar las garantías.'),
    });
  }

  onStep8Submit(data: ContractStep8Request): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID.'); return; }
    this.submitting.set(true);
    this.draftChange$.next();
    this.contractSvc.updateStep8(id, data).subscribe({
      next: (res) => {
        this.stepData.update(d => {
          const prev = d['step8'] as ContractWizardStep8 | undefined;
          const step8: ContractWizardStep8 = { contract_budget: prev?.contract_budget ?? null, components: res };
          return { ...d, step8 };
        });
        this.handleServiceResponse(10, 'Alcance guardado correctamente.');
      },
      error: (err) => this.handleError(err, 'Error al guardar el alcance.'),
    });
  }

  onStep7Submit(data: ContractStep7Request): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step7: data.actors }));
    this.draftChange$.next();
    this.contractSvc.updateStep7(id, data).subscribe({
      next: (res) => this.handleProgress(res, 9, 'Actores interesados guardados correctamente.'),
      error: (err) => this.handleError(err, 'Error al guardar los actores.'),
    });
  }

  onStep6Submit(data: ContractStep6Request): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step6: data.beneficiaries }));
    this.draftChange$.next();
    this.contractSvc.updateStep6(id, data).subscribe({
      next: (res) => this.handleProgress(res, 8, 'Beneficiarios guardados correctamente.'),
      error: (err) => this.handleError(err, 'Error al guardar los beneficiarios.'),
    });
  }

  onStep5Submit(payload: Step5SubmitPayload): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step5: payload.request.conditions }));
    this.draftChange$.next();
    this.contractSvc.updateStep5(id, payload.request).subscribe({
      next: (res) => this.afterStep5Save(id, res, payload.uploads),
      error: (err) => this.handleError(err, 'Error al guardar las condiciones.'),
    });
  }

  private afterStep5Save(id: string, res: ContractProgressResponse, uploads: Step5SubmitPayload['uploads']): void {
    if (!uploads.length) { this.handleProgress(res, 7, 'Condiciones guardadas correctamente.'); return; }

    const sid = this.serviceId();
    if (!sid) { this.handleProgress(res, 7, 'Condiciones guardadas, pero no se pudieron subir los soportes (falta el ID del servicio).'); return; }

    // Las filas nuevas todavía no tienen id real; lo obtenemos recargando el wizard
    // (el backend no devuelve las filas guardadas en la respuesta del PUT bulk).
    this.contractSvc.getWizard(id).subscribe({
      next: wizard => {
        const savedConditions = wizard.step4?.conditions ?? [];
        const calls = uploads.flatMap(u => {
          const cond = savedConditions[u.rowIndex];
          if (!cond?.id) return [];
          return u.files.map((file, idx) => {
            const fd = new FormData();
            fd.append('file', renameFileForUpload(file, u.name, idx, u.files.length));
            fd.append('condition_id', cond.id);
            fd.append('support_type', u.support_type);
            fd.append('name', u.name);
            return this.contractSvc.uploadSupport(id, sid, fd);
          });
        });
        if (!calls.length) { this.handleProgress(res, 7, 'Condiciones guardadas correctamente.'); return; }
        forkJoin(calls).subscribe({
          next: () => this.handleProgress(res, 7, 'Condiciones y soportes guardados correctamente.'),
          error: () => this.handleProgress(res, 7, 'Las condiciones se guardaron, pero hubo un error al subir algunos soportes.'),
        });
      },
      error: () => this.handleProgress(res, 7, 'Las condiciones se guardaron, pero no se pudieron subir los soportes.'),
    });
  }

  onStep4Submit(data: ProjectStep4Request): void {
    const id  = this.projectId();
    const sid = this.serviceId();
    if (!id || !sid) { this.showToast('error', 'No se encontró el ID del contrato o servicio.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step4: data }));
    this.draftChange$.next();
    this.contractSvc.updateStep4(id, sid, {
      objective: {
        necessity:           data.necessity,
        general_objective:   data.general_objective,
        causes:              data.causes,
        consequences:        data.consequences,
        specific_objectives: data.specific_objectives,
        goal:                data.goals ? [data.goals] : [],
      },
      conditions: [],
    }).subscribe({
      next: (res) => this.handleProgress(res, 6, 'Objetivos guardados correctamente.'),
      error: (err) => this.handleError(err, 'Error al guardar los objetivos.'),
    });
  }

  onStep3Submit(data: ContractStep3Request): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step3: data }));
    this.draftChange$.next();
    this.contractSvc.updateStep3(id, data).subscribe({
      next: () => this.handleServiceResponse(5, 'Alineación estratégica guardada correctamente.'),
      error: (err) => this.handleError(err, 'Error al guardar la alineación estratégica.'),
    });
  }

  onStep1bSubmit(data: ContractStep1bRequest): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID del contrato.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step1b: { counterpart_supervisor: data.counterpart_supervisor, ally_supervisor: data.ally_supervisor } }));
    this.draftChange$.next();
    this.contractSvc.updateStep1b(id, data).subscribe({
      next: () => this.handleServiceResponse(3, 'Supervisores guardados correctamente.'),
      error: (err) => this.handleError(err, 'Error al guardar los supervisores.'),
    });
  }

  onStep2Submit(locations: ContractLocation[]): void {
    const id = this.projectId();
    if (!id) { this.showToast('error', 'No se encontró el ID.'); return; }
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step2: locations }));
    this.draftChange$.next();
    this.contractSvc.updateStep2(id, { locations }).subscribe({
      next: (res) => this.handleProgress(res, 4, 'Ubicaciones guardadas correctamente.'),
      error: (err) => this.handleError(err, 'Error al guardar las ubicaciones.'),
    });
  }

  onStep1Submit(data: ProjectStep1Request): void {
    this.submitting.set(true);
    this.stepData.update(d => ({ ...d, step1: data }));
    this.draftChange$.next();

    const contractData: ContractStep1Request = {
      type:               data.type as 'contrato' | 'convenio',
      project_number:     data.project_number,
      company_name:       data.social_reason,
      start_date:         data.start_date || null,
      end_date:           data.end_date   || null,
      object:             data.objective,
      duration:           data.duration_days,
      value:              data.total_budget,
      other_type_if:      data.other_type_if,
      antecedent:         data.antecedent || null,
      has_worker_order:   data.has_worker_order,
      project_code:       data.project_code       || null,
      project_name:       data.project_name       || null,
      service_start_date: data.service_start_date || null,
      service_end_date:   data.service_end_date   || null,
      service_duration:   data.service_duration   ?? 0,
      ...(data.other_type_if && {
        ext_number:   data.ext_number  || null,
        ext_date:     data.ext_date    || null,
        ext_duration: data.ext_duration ?? null,
      }),
      ...(data.has_worker_order && {
        number_work_order: data.worker_order || null,
      }),
    };

    const existingId = this.projectId();
    const req$ = existingId
      ? this.contractSvc.updateStep1(existingId, contractData)
      : this.contractSvc.createStep1(contractData);

    req$.subscribe({
      next: (res) => {
        this.projectId.set(res.contract.id);
        this.serviceId.set(res.service.id);
        this.applyProgress(res.progress);
        this.advanceNav();
        this.currentStep.set(2);     // actualiza ANTES de guardar el borrador
        this.submitting.set(false);
        this.showToast('success', 'Información general guardada correctamente.');
        this.saveDraft();
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { step: 2, id: res.contract.id },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      },
      error: (err) => this.handleError(err, 'Error al guardar. Por favor intenta de nuevo.'),
    });
  }

  onValidationError(fields: string[]): void {
    this.showToast('error', 'Completa los campos obligatorios antes de continuar.', fields);
  }

  onStepDataChange(data: unknown): void {
    this.stepData.update(d => ({ ...d, [`step${this.currentStep()}`]: data }));
    this.draftChange$.next();
  }

  goToStep(step: number): void {
    if (this.isStepClickable(step)) {
      this.currentStep.set(step);
      this.error.set(null);
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { step },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      if (step === 8) this.refreshStep8Data();
    }
  }

  private refreshStep8Data(): void {
    const id = this.projectId();
    if (!id) return;
    this.contractSvc.getWizard(id).subscribe({
      next: wizard => {
        if (wizard.step8) this.stepData.update(d => ({ ...d, step8: wizard.step8 }));
      },
    });
  }

  clearDraft(): void {
    localStorage.removeItem(this.draftKey);
    this.currentStep.set(1);
    this.projectId.set(null);
    this.serviceId.set(null);
    this.navSteps.set(0);
    this.completedSteps.set(0);
    this.percentDone.set(0);
    this.stepData.set({});
    this.draftLoaded.set(false);
    this.error.set(null);
    this.router.navigate(['/projects/create'], { replaceUrl: true });
  }

  private showToast(type: 'error' | 'success', message: string, errors: string[] = []): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.error.set(null);
    this.success.set(null);
    this.validationErrors.set(errors);
    if (type === 'error') this.error.set(message);
    else                  this.success.set(message);
    // Con una lista de errores de validación el usuario necesita más de 5s para leerlos todos
    // (puede haber 8+ campos); el cierre manual (clearError()) sigue disponible en todo momento.
    const timeout = errors.length > 0 ? 15000 : 5000;
    this.toastTimer = setTimeout(() => {
      this.error.set(null);
      this.success.set(null);
      this.validationErrors.set([]);
    }, timeout);
  }

  clearError(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.error.set(null);
    this.success.set(null);
    this.validationErrors.set([]);
  }

  goBack(): void {
    this.router.navigate(['/projects']);
  }
}
