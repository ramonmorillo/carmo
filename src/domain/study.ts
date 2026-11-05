// Vocabularios del estudio CARMO (etiquetas en español). Los códigos coinciden con los CHECK de la BD
// (supabase/migrations). Vocabularios marcados PROVISIONAL: no definidos en el protocolo transcrito.

export const VISIT_CODES = ['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'] as const;
export type VisitCode = (typeof VISIT_CODES)[number];

export const VISIT_LABELS: Record<VisitCode, string> = {
  BASAL: 'Visita inicial (inclusión)',
  S12: 'Semana 12',
  S24: 'Semana 24',
  S36: 'Semana 36',
  S48: 'Semana 48 (no programada en el calendario 0.2)',
  FINAL: 'Visita fin de estudio (12 meses ±28 d)',
  EXTRA: 'Contacto extraordinario',
};

// Calendario CARMO-CAL-0.2 (protocolo v3.0): S48 de la tabla del protocolo vs 12 meses ±28 días (RG-05).
export const PROGRAMMED_VISITS: VisitCode[] = ['BASAL', 'S12', 'S24', 'S36', 'FINAL'];

/** Código visible: código de paciente del protocolo (<CCC>-<PP>) tras la inclusión; si no, código de selección. */
export function patientCode(p: { study_code: string | null; screening_code: string }): string {
  return p.study_code ?? p.screening_code;
}

export const FUTURE_USE_LABELS = { delete: 'Eliminados al terminar el estudio', keep_pseudonymized: 'Conservados seudonimizados para usos futuros' } as const;

export const VISIT_STATUS_LABELS = { planned: 'Prevista', done: 'Realizada', not_done: 'No realizada', cancelled: 'Anulada' } as const;
export const RECORD_STATE_LABELS = { draft: 'Borrador', reviewed: 'Revisada', closed: 'Cerrada' } as const;
export const MODALITY_LABELS = { in_person: 'Presencial', phone: 'Telefónica' } as const;

export const PATIENT_STATUS_LABELS = {
  screening: 'En cribado',
  included: 'Incluido · en seguimiento',
  not_included: 'No incluido',
  withdrawn: 'Retirado',
  lost_to_followup: 'Pérdida de seguimiento',
  completed: 'Seguimiento finalizado',
} as const;
export type PatientStatus = keyof typeof PATIENT_STATUS_LABELS;

/** PROVISIONAL (RG-12). */
export const STATUS_REASON_LABELS = {
  not_eligible: 'No cumple criterios',
  declined_consent: 'No otorga consentimiento',
  consent_withdrawn: 'Retirada del consentimiento',
  investigator_decision: 'Decisión del investigador',
  transfer: 'Traslado',
  death: 'Fallecimiento',
  other: 'Otro',
} as const;

export const ROLE_LABELS = {
  tech_admin: 'Administración técnica',
  coordinator: 'Coordinación científica',
  site_pi: 'Investigador/a principal de centro',
  site_investigator: 'Investigador/a colaborador/a',
  external_evaluator: 'Evaluador/a externo/a de cuestionarios',
  monitor: 'Monitor/auditor (solo lectura)',
} as const;
export type CarmoRole = keyof typeof ROLE_LABELS;

export const ROLE_CAN = {
  writeClinical: (r: CarmoRole | null) => r === 'coordinator' || r === 'site_pi' || r === 'site_investigator',
  writeQuestionnaire: (r: CarmoRole | null) => r === 'coordinator' || r === 'site_pi' || r === 'site_investigator' || r === 'external_evaluator',
  readClinical: (r: CarmoRole | null) => r === 'coordinator' || r === 'site_pi' || r === 'site_investigator' || r === 'monitor',
  close: (r: CarmoRole | null) => r === 'coordinator' || r === 'site_pi',
  admin: (r: CarmoRole | null) => r === 'coordinator' || r === 'tech_admin',
};

export const INCLUSION_BLOCKER_LABELS: Record<string, string> = {
  no_active_eligibility_set: 'No hay criterios de selección activos (pendientes de transcribir y validar desde el protocolo).',
  eligibility_set_empty: 'La versión de criterios no contiene criterios.',
  eligibility_not_satisfied: 'Hay criterios sin responder o no cumplidos en el sentido exigido.',
  no_signed_consent: 'Falta el consentimiento informado firmado (versión, fecha e investigador).',
  no_responsible_investigator: 'Falta el investigador responsable.',
  patient_not_found: 'Paciente no encontrado.',
};

export const TARGET_SAMPLE_SIZE = 135;

export const MISSING_REASON_LABELS = {
  not_done: 'No realizado',
  not_available: 'No disponible',
  not_applicable: 'No aplica',
  unknown: 'Desconocido',
  patient_declined: 'Rechazado por el paciente',
} as const;

export const DATA_SOURCE_LABELS = {
  clinical_record: 'Historia clínica',
  patient_interview: 'Entrevista al paciente',
  lab_report: 'Informe de laboratorio',
  dispensing_record: 'Registro de dispensación',
  other: 'Otro',
} as const;

export const TEMPORAL_CONTEXT_LABELS = {
  history_prior_inclusion: 'Antecedente previo a la inclusión',
  baseline: 'Situación basal',
  follow_up: 'Seguimiento',
  incident_event: 'Evento incidente durante el estudio',
} as const;
