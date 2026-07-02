// ── Respuesta de progreso universal ─────────────────────────────────────────

export interface ContractProgressResponse {
  contract_id:     string;
  total_steps:     number;
  completed_steps: number;
  percent_done:    number;
  steps?:          { key: string; label: string; completed: boolean; count: number }[];
}

// ── Step 1 ───────────────────────────────────────────────────────────────────

export interface ContractStep1Request {
  // Siempre presentes
  type:               'contrato' | 'convenio';
  project_number:     string;
  company_name:       string;
  start_date:         string | null;
  end_date:           string | null;
  object:             string;
  duration:           number;
  value:              number | null;
  other_type_if:      boolean;
  antecedent:         string | null;
  has_worker_order:   boolean;
  project_code:       string | null;
  project_name:       string | null;
  service_start_date: string | null;
  service_end_date:   string | null;
  service_duration:   number;
  // Solo si other_type_if: true
  ext_number?:        string | null;
  ext_date?:          string | null;
  ext_duration?:      number | null;
  // Solo si has_worker_order: true
  number_work_order?: string | null;
}

export interface ContractResponsible {
  id:        string;
  name:      string;
  image_url: string | null;
}

export interface ContractResponse {
  id:              string;
  company_id:      string;
  name:            string;
  project_number:  string;
  type:            string;
  object:          string;
  duration:        number;
  status:          string;
  completed_steps: number;
  date:            string | null;
  time:            string | null;
  description:     string | null;
  company_name:    string | null;
  start_date:      string | null;
  end_date:        string | null;
  value:           number | null;
  other_type_if:   boolean | null;
  responsible:     ContractResponsible | null;
  created_at:      string;
}

export interface SupervisorRef {
  id:        string;
  name:      string;
  image_url: string | null;
}

export interface ContractServiceResponse {
  id:                     string;
  contract_agreement_id:  string;
  has_worker_order:       boolean;
  number_work_order:      string | null;
  project_code:           string | null;
  project_name:           string | null;
  start_date:             string | null;
  end_date:               string | null;
  duration:               number | null;
  service_start_date:     string | null;
  service_end_date:       string | null;
  service_duration:       number | null;
  indicator:              string | null;
  course_action:          string | null;
  context_justification:  string | null;
  antecedent:             string | null;
  ally_supervisor:        SupervisorRef | null;
  counterpart_supervisor: SupervisorRef | null;
}

export interface ContractStep1Response {
  contract: ContractResponse;
  service:  ContractServiceResponse;
  progress: ContractProgressResponse;
}

// ── Step 1b — Supervisores ───────────────────────────────────────────────────

export interface ContractStep1bRequest {
  counterpart_supervisor?: string | null;
  ally_supervisor?:        string | null;
}

// ── Step 2 — Ubicaciones ─────────────────────────────────────────────────────

export interface ContractLocation {
  country:    string;
  department: string;
  municipality: string;
  sidewalk?:  string | null;
  details?:   string | null;
}

export interface ContractLocationItem extends ContractLocation {
  id: string;
}

export interface ContractStep2Request {
  locations: ContractLocation[];
}

// ── Step 3 — Alineación estratégica ─────────────────────────────────────────

export interface ContractStep3Request {
  indicator?:             string | null;
  course_action?:         string | null;
  context_justification?: string | null;
}

// ── Step 4 — Objetivo + Condiciones ─────────────────────────────────────────

export interface ContractObjective {
  necessity?:          string | null;
  general_objective?:  string | null;
  causes:              string[];
  consequences:        string[];
  specific_objectives: string[];
  goal:                string[];
}

export interface ContractConditionItem {
  id?:              string;
  condition:        string;
  type_compliance:  string;
  compliance_value: string | null;
  number_supports?: number;
  description?:     string | null;
  delete?:          boolean;
}

export interface ContractStep4Request {
  objective:  ContractObjective;
  conditions: ContractConditionItem[];
}

// ── Step 5 — Condiciones CRUD ────────────────────────────────────────────────

export interface ContractStep5Request {
  conditions: ContractConditionItem[];
}

// ── Step 6 — Beneficiarios CRUD ──────────────────────────────────────────────

export type BeneficiaryType =
  | 'personas' | 'mujeres' | 'hombres' | 'jovenes' | 'niños'
  | 'adultos_mayores' | 'familias' | 'comunidades' | 'organizaciones'
  | 'instituciones' | 'otro';

export interface ContractBeneficiaryItem {
  id?:          string;
  beneficiary:  BeneficiaryType;
  is_direct:    boolean;
  amount:       number;
  description?: string | null;
  delete?:      boolean;
}

export interface ContractStep6Request {
  beneficiaries: ContractBeneficiaryItem[];
}

// ── Step 7 — Actores CRUD ────────────────────────────────────────────────────

export type ActorType =
  | 'entidad_publica' | 'entidad_privada' | 'ong'
  | 'comunidad' | 'cooperacion' | 'otro';

export interface ContractActorItem {
  id?:        string;
  name:       string;
  type:       ActorType;
  interest?:  string | null;
  resources?: string | null;
  delete?:    boolean;
}

export interface ContractStep7Request {
  actors: ContractActorItem[];
}

// ── Step 8 — Alcance (componentes con actos anidados) ────────────────────────

export interface ContractActItem {
  id?:                 string | null;
  act:                 number;
  description?:        string | null;
  start_date?:         string | null;
  end_date?:           string | null;
  start_plan?:         number | null;
  actual_start_date?:  string | null;
  actual_end_date?:    string | null;
  actual_start_plan?:  number | null;
  responsible?:        string | null;
  objective?:          string | null;
  percentage?:         number;
  delete?:             boolean;
}

export interface ContractStep8Item {
  id?:         string | null;
  component:   string;
  percentage?: number | null;
  budget?:     number | null;
  acts:        ContractActItem[];
  delete?:     boolean;
}

export type ContractStep8Request = ContractStep8Item[];

// ── Step 9 — Indicadores CRUD ────────────────────────────────────────────────

export interface ContractIndicatorItem {
  id?:          string;
  component_id: string;
  type?:        string | null;
  name?:        string | null;
  line?:        string | null;
  goal?:        string | null;
  medium?:      string | null;
  delete?:      boolean;
}

export interface ContractStep9Request {
  indicators: ContractIndicatorItem[];
}

// ── Step 10 — Garantías ───────────────────────────────────────────────────────

export type GuaranteeType =
  | 'cumplimiento_de_contrato'
  | 'calidad_del_servicio'
  | 'buen_manejo_y_correcta_inversion_del_anticipo'
  | 'estabilidad_y_calidad_de_la_obra'
  | 'salarios_prestaciones_sociales_e_indemnizaciones'
  | 'responsabilidad_civil_extracontextual'
  | 'calidad_y_correcto_funcionamiento_de_los_bienes_y_equipo_suministrado'
  | 'seriedad_de_la_oferta'
  | 'pago_anticipado';

export interface ContractGuaranteeItem {
  id?:          string | null;
  type:         GuaranteeType;
  description?: string | null;
  percentage?:  number | null;
  duration?:    number | null;
  delete?:      boolean;
}

export interface ContractStep10Request {
  guarantees: ContractGuaranteeItem[];
}

export interface WizardGuarantee {
  id:                    string;
  contract_agreement_id: string;
  type:                  GuaranteeType;
  description:           string | null;
  percentage:            number | null;
  duration:              number | null;
}

// ── Wizard snapshot ──────────────────────────────────────────────────────────

export interface WizardObjective {
  id:                  string;
  project_service_id:  string;
  necessity:           string | null;
  general_objective:   string | null;
  causes:              string[];
  consequences:        string[];
  specific_objectives: string[];
  goal:                string[];
}

export interface SupportResponse {
  id:           string;
  project_service_id: string;
  support_type: string;
  name:         string;
  support_url:  string;
  state:        boolean;
}

export interface WizardCondition {
  id:                 string;
  project_service_id: string;
  condition:          string;
  type_compliance:    string;
  compliance_value:   string | null;
  number_supports:    number;
  description:        string | null;
  supports?:          SupportResponse[];
}

export interface WizardActor {
  id:                    string;
  contract_agreement_id: string;
  name:                  string;
  type:                  string;
  interest:              string | null;
  resources:             string | null;
}

export interface WizardActResponse {
  id:                    string;
  contract_agreement_id: string;
  component_id:          string;
  act:                   number;
  description:           string | null;
  start_date:            string | null;
  end_date:              string | null;
  actual_start_date?:    string | null;
  actual_end_date?:      string | null;
  start_plan?:           number | null;
  plan_duration?:        number | null;
  actual_start_plan?:    number | null;
  actual_plan_duration?: number | null;
  responsible:           string | null;
  objective:             string | null;
  percentage?:           number | null;
  number_checks?:        number | null;
  is_completed?:         boolean | null;
}

export interface WizardStep8ComponentResponse {
  id:          string;
  component:   string;
  percentage?: number | null;
  budget?:     number | null;
  acts:        WizardActResponse[];
}

export interface ContractWizardStep8 {
  contract_budget: number | null;
  components:      WizardStep8ComponentResponse[];
}

export interface WizardIndicator {
  id:                    string;
  contract_agreement_id: string;
  component_id:          string;
  type:                  string | null;
  name:                  string | null;
  line:                  string | null;
  goal:                  string | null;
  medium:                string | null;
}

export interface WizardSignature {
  id:                      string;
  date:                    string;
  signature_prepared_url:  string | null;
  approved_signature_url:  string | null;
}

// ── Estructura real del GET /contracts/:id/wizard ─────────────────────────────

export interface ContractWizardStep1 {
  contract: ContractResponse;
  service:  ContractServiceResponse;
}

export interface ContractWizardSupervisors {
  ally_supervisor:        SupervisorRef | null;
  counterpart_supervisor: SupervisorRef | null;
}

export interface ContractWizardStep4 {
  objective:  WizardObjective | null;
  conditions: WizardCondition[];
}

// ContractWizardStep8 is now defined above as an interface

export interface ContractWizardResponse {
  progress:    ContractProgressResponse;
  step1:       ContractWizardStep1;
  supervisors: ContractWizardSupervisors;
  step2:       ContractLocationItem[];
  step3:       ContractStep3Request | null;
  step4:       ContractWizardStep4;
  step6:       ContractBeneficiaryItem[];
  step7:       WizardActor[];
  step8:       ContractWizardStep8;
  step9:       WizardIndicator[];
  step10:      WizardGuarantee[];
  affiliates:  unknown[];
  budgets:     unknown[];
  schedules:   unknown[];
  signature:   WizardSignature | null;
  extensions:  unknown[];
  [key: string]: unknown;
}

// ── Draft ────────────────────────────────────────────────────────────────────

export interface ContractDraft {
  contractId:     string | null;
  serviceId:      string | null;
  currentStep:    number;
  completedSteps: number;
  totalSteps:     number;
  percentDone:    number;
  stepData:       Record<string, unknown>;
}
