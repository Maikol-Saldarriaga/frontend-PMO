export type ProjectType = 'Contrato' | 'Proyecto';
export type ProjectStatus = 'Draft' | 'Active' | 'Completed' | 'Cancelled';

export interface ProjectStep1Request {
  project_number:       string;
  social_reason:        string;
  type:                 string;
  has_worker_order:     boolean;
  worker_order?:        string;
  project_code?:        string;
  project_name?:        string;
  start_date:           string;
  end_date:             string;
  service_start_date?:  string;
  service_end_date?:    string;
  service_duration?:    number;
  duration_days:        number;
  objective:            string;
  total_budget:         number;
  other_type_if:        boolean;
  ext_number?:          string;
  ext_date?:            string;
  ext_duration?:        number;
  antecedent:           string;
}

export interface ProjectResponsible {
  id: string;
  name: string;
  image_url: string | null;
}

export interface ProjectCreateResponse {
  id:              string;
  company_id:      string;
  project_number:  string;
  project_name:    string | null;
  type:            string;
  company_name:    string | null;
  description:     string | null;
  object:          string | null;
  start_date:      string | null;
  end_date:        string | null;
  duration:        number;
  value:           number | null;
  other_type_if:   boolean;
  status:          string;
  completed_steps: number;
  total_steps:     number;
  percent_done:    number;
  responsible:     ProjectResponsible | null;
  created_at:      string;
}

export interface ProjectsSummary {
  total:      number;
  borrador:   number;
  activo:     number;
  completado: number;
  cancelado:  number;
}

export interface ProjectWizardStep1 {
  code:                 string | null;
  name:                 string;
  social_reason:        string;
  type:                 string;
  contract_number:      number;
  has_worker_order:     boolean;
  worker_order?:        string;
  start_date:           string;
  end_date:             string;
  duration_days:        number;
  objective:            string;
  total_budget:         number;
  principal_supervisor: string;
  customer_supervisor:  string;
  other_type_if:        boolean;
  extension_number?:    string;
  extension_date?:      string;
  antecedent?:          string;
  description?:         string | null;
}

// ── Step 2 ──────────────────────────────────────────────────────────────────

/** Lo que enviamos al backend (sin id) */
export interface ProjectLocation {
  country:      string;
  department:   string;
  municipality: string;
  address?:     string | null;
  details?:     string | null;
}

/** Lo que devuelve el backend (con id asignado) */
export interface ProjectLocationItem {
  id:           string;
  country:      string;
  department:   string;
  municipality: string;
  address:      string | null;
  details:      string | null;
}

/** Request: solo el array sin id */
export interface ProjectStep2Request {
  locations: ProjectLocation[];
}

/** Response: array con id + progreso */
export interface ProjectStep2Response {
  locations: ProjectLocationItem[];
  progress: {
    completed_steps: number;
    total_steps:     number;
    percent_done:    number;
  };
}

// ── Step 3 ──────────────────────────────────────────────────────────────────

export interface ProjectStep3Request {
  indicator:     string;
  course_action: string;
  justification: string;
}

export interface ProjectStep3Response {
  indicator:     string;
  course_action: string;
  justification: string;
  progress: {
    completed_steps: number;
    total_steps:     number;
    percent_done:    number;
  };
}

// ── Step 4 ──────────────────────────────────────────────────────────────────

export interface ProjectStep4Request {
  necessity:           string;
  general_objective:   string;
  goals:               string;
  causes:              string[];
  consequences:        string[];
  specific_objectives: string[];
}

export interface ProjectStep4Response {
  objective: {
    id:                  string;
    necessity:           string;
    general_objective:   string;
    goals:               string;
    causes:              string[];
    consequences:        string[];
    specific_objectives: string[];
  };
  progress: {
    completed_steps: number;
    total_steps:     number;
    percent_done:    number;
  };
}

export interface ProjectWizardObjective {
  id:                  string;
  necessity:           string;
  general_objective:   string;
  goals:               string;
  causes:              string[];
  consequences:        string[];
  specific_objectives: string[];
}

// ── Step 5 ──────────────────────────────────────────────────────────────────

export type ConditionType = 'supuesto' | 'requisito_minimo' | 'exclusion' | 'restriccion';

export interface ProjectConditionItem {
  type:             ConditionType;
  description:      string;
  fulfillment_date: string | null;
  support:          string;
}

export interface ProjectConditionItemResponse extends ProjectConditionItem {
  id: string;
}

export interface ProjectStep5Request {
  items: ProjectConditionItem[];
}

export interface ProjectStep5Response {
  items: ProjectConditionItemResponse[];
  progress: {
    completed_steps: number;
    total_steps:     number;
    percent_done:    number;
  };
}

// ── Step 6 ──────────────────────────────────────────────────────────────────

export interface ProjectBeneficiaryItem {
  beneficiary_type: string;
  beneficiary:      'directo' | 'indirecto';
  amount:           number;
  description:      string;
}

export interface ProjectBeneficiaryItemResponse extends ProjectBeneficiaryItem {
  id: string;
}

export interface ProjectStep6Request {
  items: ProjectBeneficiaryItem[];
}

export interface ProjectStep6Response {
  items: ProjectBeneficiaryItemResponse[];
  progress: {
    completed_steps: number;
    total_steps:     number;
    percent_done:    number;
  };
}

// ── Step 7 ──────────────────────────────────────────────────────────────────

export interface ProjectActorItem {
  name:      string;
  type:      string;
  interest:  string;
  resources: string;
}

export interface ProjectActorItemResponse extends ProjectActorItem { id: string; }

export interface ProjectStep7Request  { items: ProjectActorItem[]; }
export interface ProjectStep7Response {
  items: ProjectActorItemResponse[];
  progress: { completed_steps: number; total_steps: number; percent_done: number; };
}

// ── Step 8 ──────────────────────────────────────────────────────────────────

export interface ProjectScopeItem {
  component:          string;
  description:        string;
  objective:          string;
  responsible:        string;
  start_date:         string;
  end_date:           string;
  means_verification: string;
}

export interface ProjectScopeItemResponse extends ProjectScopeItem { id: string; }

export interface ProjectStep8Request  { items: ProjectScopeItem[]; }
export interface ProjectStep8Response {
  items: ProjectScopeItemResponse[];
  progress: { completed_steps: number; total_steps: number; percent_done: number; };
}

// ── Step 9 ──────────────────────────────────────────────────────────────────

export interface ProjectIndicatorItem {
  component: string;
  type:      string;
  name:      string;
  baseline:  string;
  goal:      string;
  medium:    string;
}

export interface ProjectIndicatorItemResponse extends ProjectIndicatorItem { id: string; }

export interface ProjectStep9Request  { items: ProjectIndicatorItem[]; }
export interface ProjectStep9Response {
  items: ProjectIndicatorItemResponse[];
  progress: { completed_steps: number; total_steps: number; percent_done: number; };
}

export interface ProjectWizardStrategicAlignment {
  id:            string;
  indicator:     string;
  course_action: string;
  justification: string;
  component:     string | null;
  type:          string | null;
  medium:        string | null;
}

// ── Wizard sub-types ────────────────────────────────────────────────────────

export interface ProjectWizardBeneficiary {
  id:               string;
  beneficiary_type: string;
  beneficiary:      string;
  amount:           number;
  description:      string;
}

export interface ProjectWizardActor {
  id:        string;
  name:      string;
  type:      string;
  interest:  string;
  resources: string;
}

export interface ProjectWizardScope {
  id:                 string;
  component:          string;
  description:        string;
  objective:          string;
  responsible:        string;
  start_date:         string;
  end_date:           string;
  means_verification: string;
}

export interface ProjectWizardIndicator {
  id:        string;
  component: string | null;
  type:      string | null;
  name:      string;
  baseline:  string;
  goal:      string;
  medium:    string | null;
}

export interface ProjectWizardSchedule {
  id:           string;
  component:    string;
  months:       number;
  days:         number;
  maximum_date: string;
  observations: string | null;
}

export interface ProjectWizardExtension {
  id:               string;
  extension_number: string;
  extension_date:   string;
  duration_days:    number | null;
  antecedent:       string;
  created_at:       string;
}

export interface ProjectWizardSignature {
  id:                  string;
  prepared_by:         string;
  approved_by:         string;
  prepared_signature:  string;
  approved_signature:  string;
  signed_at:           string;
}

export interface ProjectWizardResponse {
  id:                   string;
  company_id:           string;
  status:               string;
  completed_steps:      number;
  total_steps:          number;
  percent_done:         number;
  responsible:          ProjectResponsible | null;
  created_at:           string;
  basic_information:    ProjectWizardStep1 | null;
  locations:            ProjectLocationItem[] | null;
  strategic_alignment:  ProjectWizardStrategicAlignment | null;
  objectives:           ProjectWizardObjective | null;
  general_conditions:   ProjectConditionItemResponse[] | null;
  beneficiaries:        ProjectWizardBeneficiary[] | null;
  actors:               ProjectWizardActor[] | null;
  conditions:           ProjectConditionItemResponse[] | null;
  scopes:               ProjectWizardScope[] | null;
  indicators:           ProjectWizardIndicator[] | null;
  schedules:            ProjectWizardSchedule[] | null;
  extensions:           ProjectWizardExtension[] | null;
  signature:            ProjectWizardSignature | null;
  [key: string]:        unknown;
}

export interface ProjectsPageResponse {
  summary:     ProjectsSummary;
  data:        ProjectCreateResponse[];
  next_cursor: string | null;
}

export interface ProjectDraft {
  projectId: string | null;
  currentStep: number;
  completedSteps: number;
  totalSteps: number;
  percentDone: number;
  stepData: Record<string, unknown>;
}

// ── Project Details (dashboard) ───────────────────────────────────────────────

export interface ProjectComponentDistribution {
  component_id:   string;
  component_name: string;
  total:          number;
  percentage:     number;
}

export interface ProjectMonthlyContribution {
  year:               number;
  month:              number;
  month_label:        string;
  counterpart_amount: number;
  ally_amount:        number;
  total:              number;
}

// ── Gantt API (/projects/:id/gantt) ─────────────────────────────────────────

export interface GanttTimelineItem {
  year:  number;
  month: number;
  label: string;
}

export interface GanttActivity {
  id:                string;
  act:               number | null;
  description:       string | null;
  start_date:        string | null;
  end_date:          string | null;
  actual_start_date: string | null;
  actual_end_date:   string | null;
  percentage:        number | null;  // peso bruto de la actividad (0–100)
  progress:          number | null;  // avance acumulado por snapshots (0–100)
  responsible:       string | null;
  is_completed:      boolean | null;
  snapshots:         Snapshot[];     // períodos individuales (start_date/end_date/planned_pct/actual_pct) para pintar barras por período
}

export interface GanttComponent {
  id:         string;
  name:       string;
  activities: GanttActivity[];
}

export interface GanttResponse {
  timeline:   GanttTimelineItem[];
  components: GanttComponent[];
}

export interface GanttFilters {
  year?:     number;
  semester?: 1 | 2;
  month?:    number;
}

export interface GanttSummaryItem {
  scope_id:          string;
  component_name:    string;
  act:               number;
  description:       string;
  start_date:        string | null;
  end_date:          string | null;
  actual_start_date: string | null;
  actual_end_date:   string | null;
  percentage:        number;   // peso bruto de la actividad (0–100)
  progress:          number;   // avance acumulado por snapshots (0–100)
  responsible:       string | null;
  is_completed:      boolean;
  snapshots?:        Snapshot[]; // períodos individuales — pendiente que el backend lo agregue aquí (ya existe en GanttActivity)
}

export interface ProjectDetails {
  project_number:           string;
  project_name:             string | null;
  type:                     string;
  start_date:               string | null;
  end_date:                 string | null;
  duration:                 number;
  value:                    number | null;
  status:                   string;

  overall_progress:         number;
  total_milestones:         number;
  completed_milestones:     number;

  total_budget:             number;
  total_counterpart:        number;
  total_ally:               number;
  budget_progress:          number;
  remaining_budget:         number;
  remaining_budget_pct:     number;

  total_risks:              number;
  critical_risks:           number;

  component_distribution:   ProjectComponentDistribution[];
  monthly_contributions:    ProjectMonthlyContribution[];
  gantt_summary:            GanttSummaryItem[];
}

// ── Components & Activities ───────────────────────────────────────────────────

export interface ComponentActivity {
  id:          string;
  act:         number;
  description: string;
}

export interface ProjectComponent {
  component_id: string;
  component:    string;
  acts:         ComponentActivity[];
}

// ── Scope / Alcance ──────────────────────────────────────────────────────────

export interface ScopeActivity {
  id:                    string;
  component_id?:         string | null;
  act:                   number;
  description:           string;
  start_date:            string | null;
  end_date:              string | null;
  actual_start_date:     string | null;
  actual_end_date:       string | null;
  start_plan:            number | null;
  plan_duration?:        number | null;
  actual_start_plan?:    number | null;
  actual_plan_duration?: number | null;
  objective:             string | null;
  responsible:           string | null;
  percentage:            number;
  progress:              number;
  is_completed:          boolean;
  // budget es asignado desde otro módulo — solo lectura
  budget?:               number | null;
}

export interface ScopeComponent {
  id:         string;
  name:       string;
  percentage: number;
  budget?:    number | null;
  progress:   number;
  scopes:     ScopeActivity[];
}

export interface ComponentsActsResponse {
  project_progress: number;
  components:       ScopeComponent[];
}

// POST /projects/{id}/components
export interface CreateComponentRequest {
  name:       string;
  percentage: number;
  budget?:    number | null;
}

// PUT /projects/{id}/components/{cid}
export interface UpdateComponentRequest {
  name:       string;
  percentage: number;
  budget?:    number | null;
}

// POST or PUT /projects/{id}/components/{cid}/scopes[/{sid}]
export interface ActivityRequest {
  act:                number;
  description:        string;
  start_date:         string;
  end_date:           string;
  start_plan:         number;
  objective:          string;
  responsible:        string;
  percentage:         number;
  actual_start_date?: string | null;
  actual_end_date?:   string | null;
  actual_start_plan?: number | null;
}

export interface ActivityFormData {
  act:               number | null;
  description:       string;
  percentage:        number | null;
  start_date:        string;
  end_date:          string;
  start_plan:        number | null;
  responsible:       string;
  objective:         string;
  actual_start_date: string;
  actual_end_date:   string;
  actual_start_plan: number | null;
}

// ── Snapshots de Seguimiento Técnico ─────────────────────────────────────────

export interface Snapshot {
  id?:          string;
  id_scope?:    string;
  start_date:   string;
  end_date:     string;
  planned_pct:  number;
  actual_pct:   number;
  notes?:       string | null;
}

export interface SnapshotRequest {
  start_date:   string;
  end_date:     string;
  planned_pct:  number;
  actual_pct:   number;
  notes?:       string | null;
}

export interface ProjectSnapshotItem extends Snapshot {
  scope_id:         string;
  component_name:   string;
  act:              number;
  description:      string;
}

export interface ProjectSnapshotsResponse {
  snapshots:        ProjectSnapshotItem[];
  counts_by_scope:  Record<string, number>;
}

// ── Riesgos ───────────────────────────────────────────────────────────────────

export type RiskProbability = 'casi_seguro' | 'probable' | 'posible' | 'raro' | 'improbable';
export type RiskImpact      = 'catastrofico' | 'mayor' | 'moderado' | 'menor' | 'leve';
export type RiskLevel       = 'E' | 'A' | 'M' | 'B';
export type RiskTrackingStatus = 'pending' | 'materialized' | 'mitigated' | 'closed';

export interface RiskRequest {
  description:       string;
  zone?:             string | null;
  probability:       RiskProbability;
  impact:            RiskImpact;
  contingency_plan?: string | null;
  evidence?:         string | null;
  responsible?:      string | null;
}

export interface Risk {
  id:                     string;
  id_company:             string;
  id_contract_agreement:  string;
  description:            string;
  zone:                   string | null;
  probability:            RiskProbability;
  impact:                 RiskImpact;
  risk_level:             RiskLevel;
  contingency_plan:       string | null;
  evidence:               string | null;
  responsible:            string | null;
  created_at:             string;
}

export interface RiskTrackingRequest {
  year:    number;
  month:   number;
  status:  RiskTrackingStatus;
  notes?:  string | null;
}

export interface RiskTrackingItem {
  id:         string;
  id_company: string;
  id_risk:    string;
  year:       number;
  month:      number;
  status:     RiskTrackingStatus;
  notes:      string | null;
}

// ── Beneficiarios (affiliates) ──────────────────────────────────────────────

export type BeneficiaryDocumentType = 'CC' | 'CE' | 'TI' | 'PP' | 'RC' | 'NIT' | 'PEP';
export type BeneficiaryGender = 'M' | 'F' | 'Otro';
export type BeneficiaryZoneType = 'Urbana' | 'Rural';

export interface BeneficiaryRequest {
  is_beneficiary:         true;
  first_name:              string;
  middle_name?:            string | null;
  first_surname:           string;
  second_surname?:         string | null;
  type_identification:     BeneficiaryDocumentType;
  identification_number:   string;
  birthdate?:              string | null;
  gender?:                 BeneficiaryGender | null;
  ethnic_affiliation?:     string | null;
  is_lgbtiq?:              boolean;
  is_head_of_household?:   boolean;
  is_victim?:              boolean;
  profession?:             string | null;
  type_zone?:              BeneficiaryZoneType | null;
  entity?:                 string | null;
  job_title?:              string | null;
  phone?:                  string | null;
  email?:                  string | null;
  department?:             string | null;
  municipality?:           string | null;
  sidewalk?:                string | null;
}

export interface Beneficiary {
  id:                      string;
  contract_agreement_id:   string;
  is_beneficiary:          boolean;
  first_name:              string;
  middle_name:             string | null;
  first_surname:           string;
  second_surname:          string | null;
  type_identification:     BeneficiaryDocumentType;
  identification_number:   string;
  birthdate:               string | null;
  gender:                  BeneficiaryGender | null;
  ethnic_affiliation:      string | null;
  is_lgbtiq:               boolean;
  is_head_of_household:    boolean;
  is_victim:               boolean;
  profession:              string | null;
  type_zone:               BeneficiaryZoneType | null;
  entity:                  string | null;
  job_title:               string | null;
  phone:                   string | null;
  email:                   string | null;
  department:              string | null;
  municipality:            string | null;
  sidewalk:                string | null;
}

export interface BeneficiaryPageResponse {
  data:        Beneficiary[];
  next_cursor: string | null;
  has_more:    boolean;
}

export interface ScopeSnapshotsResponse {
  id_scope:          string;
  start_date:        string;
  end_date:          string;
  actual_start_date: string | null;
  actual_end_date:   string | null;
  snapshots:         Snapshot[];
}

// ── Budget ────────────────────────────────────────────────────────────────────

export interface BudgetMonthlyDistribution {
  id?:                 string;
  year:                number;
  month:               number;
  counterpart_amount:  number;
  ally_amount:         number;
  executed_amount?:    number;
  billed_amount?:      number;
}

export interface MonthlyDistributionRequest {
  year:               number;
  month:              number;
  counterpart_amount: number;
  ally_amount:        number;
  executed_amount?:   number;
  billed_amount?:     number;
}

export interface MonthlyBulkRequest {
  distributions: MonthlyDistributionRequest[];
}

export type MonthlyWizardResponse = BudgetWizardResponse;

export interface BudgetItem {
  id:                       string;
  contract_agreement_id:    string;
  component_id:             string;
  scope_id:                 string;
  concept:                  string;
  description:              string | null;
  unit_measurement:         string | null;
  unit_value:               number;
  quantity:                 number;
  total_value:              number;
  counterpart_contribution: number;
  ally_contribution:        number;
  sort_order:               number;
  created_at:               string;
  monthly_distributions:    BudgetMonthlyDistribution[];
}

export interface BudgetWizardScope {
  scope_id:     string;
  act:          number;
  description:  string;
  start_date:   string | null;
  end_date:     string | null;
  is_completed: boolean;
  percentage:   number;
  progress:     number;
  budget:       BudgetItem | null;
}

export interface BudgetWizardComponent {
  component_id: string;
  name:         string;
  percentage:   number;
  progress:     number;
  is_complete:  boolean;
  scopes:       BudgetWizardScope[];
}

export interface BudgetExecutionSummary {
  total_planeado:   number;
  total_ejecutado:  number;
  total_facturado:  number;
  total_contraparte: number;
  total_aliado:     number;
  pct_ejecucion:    number;
  pct_facturacion:  number;
}

export interface BudgetExecutionTimeSeries {
  year:                  number;
  month:                 number;
  month_label:           string;
  planeado:              number;
  ejecutado:             number;
  facturado:             number;
  planeado_acumulado:    number;
  ejecutado_acumulado:   number;
  facturado_acumulado:   number;
}

export interface BudgetExecutionDetail {
  id:                string;
  concepto:          string;
  presupuesto:       number;
  contraparte:       number;
  aliado:            number;
  total_ejecutado:   number;
  porcentaje_avance: number;
}

export interface BudgetExecution {
  summary:     BudgetExecutionSummary;
  time_series: BudgetExecutionTimeSeries[];
  details:     BudgetExecutionDetail[];
}

export interface BudgetWizardResponse {
  is_complete:   boolean;
  total_scopes:  number;
  filled_scopes: number;
  components:    BudgetWizardComponent[];
  execution:     BudgetExecution;
}

export interface BudgetItemRequest {
  scope_id:                 string;
  concept:                  string;
  description?:             string;
  unit_measurement?:        string;
  unit_value:               number;
  quantity:                 number;
  total_value:              number;
  counterpart_contribution: number;
  ally_contribution:        number;
  sort_order?:              number;
  monthly_distributions?:   Pick<BudgetMonthlyDistribution, 'year' | 'month' | 'counterpart_amount' | 'ally_amount'>[];
}

export interface BudgetFormData {
  concept:                  string;
  description:              string;
  unit_measurement:         string;
  unit_value:               number | null;
  quantity:                 number | null;
  total_value:              number;
  counterpart_contribution: number | null;
  ally_contribution:        number | null;
  monthly_distributions:    BudgetMonthlyDistribution[];
}

export const EMPTY_BUDGET_FORM = (): BudgetFormData => ({
  concept: '', description: '', unit_measurement: '', unit_value: null,
  quantity: null, total_value: 0, counterpart_contribution: null,
  ally_contribution: null, monthly_distributions: [],
});

export const PROJECT_STEPS = [
  { number: 1,  label: 'Información Básica',                                                   description: 'Datos básicos, tipo, código, contrato, fechas', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { number: 2,  label: 'Supervisores',                                                         description: 'Supervisor principal y supervisor del cliente',  icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { number: 3,  label: 'Cobertura geográfica',                                                 description: 'País, departamento, municipio, cobertura',      icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
  { number: 4,  label: 'Alineación estratégica del proyecto',                                  description: 'Contexto y razones del proyecto',               icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { number: 5,  label: 'Necesidades y objetivos del proyecto',                                 description: 'Necesidades, causas y consecuencias',           icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { number: 6,  label: 'Requisitos mínimos, exclusiones, supuestos y restricciones',           description: 'Resultado principal esperado',                  icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
  { number: 7,  label: 'Beneficiarios',                                                        description: 'Población beneficiada y caracterización',       icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { number: 8,  label: 'Actores interesados',                                                  description: 'Entidades, aliados y participantes',             icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { number: 9,  label: 'Alcance del Proyecto',                                                 description: 'Componentes, responsables y plazos',             icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { number: 10, label: 'Indicadores del Proyecto',                                             description: 'Qué incluye y qué no incluye',                  icon: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4' },
  { number: 11, label: 'Garantías',                                                             description: 'Pólizas y amparos del contrato',                icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
];
