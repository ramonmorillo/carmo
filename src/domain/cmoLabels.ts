export const PRIORITY_LABELS: Record<number, string> = { 1: 'Prioridad 1', 2: 'Prioridad 2', 3: 'Prioridad 3' };
export const VALIDATION_LABELS: Record<string, string> = { pending: 'Pendiente de validación profesional', confirmed: 'Confirmada', modified: 'Elevada por criterio profesional' };
export const DOMAIN_LABELS: Record<string, string> = { capacity: 'Capacidad', motivation: 'Motivación', opportunity: 'Oportunidad' };
export const RECIPIENT_LABELS: Record<string, string> = { patient: 'Paciente', caregiver: 'Cuidador/a', physician: 'Médico/a', nurse: 'Enfermería', pharmacist: 'Farmacéutico/a', other: 'Otro' };
export const ACCEPTANCE_LABELS: Record<string, string> = { accepted: 'Aceptada', not_accepted: 'No aceptada', pending: 'Pendiente', not_applicable: 'No aplica' };

/** Prioridad vigente de una estratificación: la validada (final) o, si está pendiente, la calculada. */
export function effectivePriority(s: { final_priority: number | null; calculated_priority: number }): number {
  return s.final_priority ?? s.calculated_priority;
}
