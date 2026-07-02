// Catálogo maestro de medios de verificación / soportes.
// Compartido por Alcance, Indicadores, Condiciones y Restricciones — el backend
// reutiliza el mismo enums.SupportType para las columnas support_type / verification_type.
export type SupportTypeKey =
  | 'actas'
  | 'informes'
  | 'planes'
  | 'matrices'
  | 'herramientas_evaluacion'
  | 'bases_de_datos'
  | 'documentos_tecnicos'
  | 'formatos_y_fichas'
  | 'presentaciones'
  | 'documentos_administrativos'
  | 'documentos_legales'
  | 'evidencias_y_registros'
  | 'otros_soportes';

export const SUPPORT_TYPES: Record<SupportTypeKey, string[]> = {
  actas: [
    'Acta de avance de entregables',
    'Acta de comité de seguimiento',
    'Acta de reunión',
    'Acta de socialización',
    'Acta de cierre',
    'Acta de rendición de cuentas',
  ],
  informes: [
    'Informe técnico',
    'Informe de resultados de divulgación',
    'Informe de cumplimiento ambiental (ICA)',
    'Informe de acompañamiento a inversión de excedentes',
    'Informe de asistencia técnica',
    'Informe de ejecución',
    'Informe de seguimiento',
  ],
  planes: [
    'Plan de Obra',
    'Plan Operativo Anual (POA)',
    'Plan HSE',
    'Plan de Formación',
    'Plan de Alianza',
    'Plan de Trabajo',
    'Plan de Acción',
  ],
  matrices: [
    'Matriz de control documental del contrato',
    'Matriz de control documental de la Orden de Servicio',
    'Matriz de seguimiento',
    'Matriz de cumplimiento',
    'Matriz de evidencias',
  ],
  herramientas_evaluacion: [
    'Diagnóstico ICO',
    'Herramienta de medición de capacidades',
    'Herramienta de medición de capacidades por JAC',
    'Documento de línea base',
    'Diagnóstico organizacional',
  ],
  bases_de_datos: [
    'Base de datos de Estado de Elegibilidad de las JAC',
    'Base de datos de beneficiarios',
    'Base de datos de seguimiento',
  ],
  documentos_tecnicos: [
    'Documento guía de contratación actualizado',
    'Documento instructivo de contratación actualizado',
    'Formato de Instructivo para Contratación JAC (COT-INS-001)',
    'Documento de alianza',
    'Documento técnico',
    'Documento de rutas ambientales',
    'Análisis de proyectos',
    'Soportes MGA',
    'Proyecto formulado y cargado en MGA',
  ],
  formatos_y_fichas: [
    'Informe y ficha de asignación',
    'Ficha de asesoría técnica',
    'Ficha de asistencia técnica',
    'Formato de evaluación',
    'Encuesta',
  ],
  presentaciones: [
    'Presentación PowerPoint de alistamiento',
    'Presentación de socialización',
    'Presentación de resultados',
  ],
  documentos_administrativos: [
    'Acta',
    'Memorando',
    'Comunicación oficial',
    'Estrategia de comunicaciones',
    'Soportes institucionales',
  ],
  documentos_legales: [
    'Certificado de Cámara de Comercio',
    'Registro Único Tributario (RUT)',
    'Certificación bancaria',
    'Certificados disciplinarios',
    'Certificado de antecedentes fiscales',
    'Certificado de antecedentes judiciales',
    'Certificado de antecedentes de Procuraduría',
    'Certificado de antecedentes de Policía',
  ],
  evidencias_y_registros: [
    'Registro fotográfico',
    'Video',
    'Registro audiovisual',
    'Listado de asistencia',
    'Memorias',
    'Material pedagógico',
    'Registro de participación',
    'Registros de socialización',
    'Evidencias fotográficas',
    'Fotografías',
    'Soportes SIG',
  ],
  otros_soportes: [
    'Comunicaciones oficiales',
    'Documentos de soporte institucional',
    'Otros documentos de respaldo',
  ],
};

export const SUPPORT_TYPE_LABELS: Record<SupportTypeKey, string> = {
  actas: 'Actas',
  informes: 'Informes',
  planes: 'Planes',
  matrices: 'Matrices',
  herramientas_evaluacion: 'Herramientas de Evaluación',
  bases_de_datos: 'Bases de Datos',
  documentos_tecnicos: 'Documentos Técnicos',
  formatos_y_fichas: 'Formatos y Fichas',
  presentaciones: 'Presentaciones',
  documentos_administrativos: 'Documentos Administrativos',
  documentos_legales: 'Documentos Legales',
  evidencias_y_registros: 'Evidencias y Registros',
  otros_soportes: 'Otros Soportes',
};
