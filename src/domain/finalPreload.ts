// Precarga de variables clínicas de la visita inicial en la visita final (migración 16).
// Los valores precargados son PENDIENTES DE VERIFICAR: no son observaciones, no cuentan como dato final, no
// completan el bloque de variables ni permiten cerrar la visita. Se confirman o actualizan registrando una
// observación nueva (solo-adición). Lógica pura; la lista de campos replica la de public.carmo_preload_final_visit.

/**
 * Variables precargables (decisión PROVISIONAL, pendiente de validar por la coordinación: el protocolo v3.0
 * no fija por variable cuáles deben volver a medirse). Solo situación declarativa susceptible de revisión.
 * Deben coincidir con el array `v_codes` de supabase/migrations/20261123120000_carmo_final_visit_preload.sql
 * (lo comprueba tests/finalPreload.test.ts).
 */
export const PRELOADABLE_VARIABLES = ['family_support', 'tobacco_use', 'cigarettes_per_day', 'smoking_years', 'diabetes', 'hypertension'] as const;

/** Requieren una medición nueva en la visita final: no se precargan. */
export const REQUIRES_NEW_MEASUREMENT = ['weight', 'height', 'ldl_c', 'non_hdl_c'] as const;

/** Condicionales al consumo de tabaco del basal. */
export const SMOKING_DEPENDENT = ['cigarettes_per_day', 'smoking_years'] as const;

export type PreloadStatus = 'pending_verification' | 'confirmed' | 'updated' | 'discarded';
export const PRELOAD_STATUS_LABELS: Record<PreloadStatus, string> = {
  pending_verification: 'Valor de la visita inicial, pendiente de verificar',
  confirmed: 'Confirmado sin cambios respecto a la visita inicial',
  updated: 'Actualizado respecto a la visita inicial',
  discarded: 'Precarga descartada',
};

export type PreloadRow = {
  id: string; patient_id: string; visit_id: string; variable_code: string; source_observation_id: string;
  value_numeric: number | null; value_boolean: boolean | null; value_text: string | null; value_date: string | null; unit: string | null;
  status: PreloadStatus; resolved_observation_id: string | null; created_at: string; resolved_at: string | null;
};

export type PreloadAvailability = { enabled: boolean; reason: string | null };

type VisitLike = { id: string; visit_code: string; status: string; actual_date: string | null; record_state: string };

/** ¿Puede ofrecerse «Cargar valores de la visita inicial»? Visita final editable y visita inicial válida. */
export function preloadAvailability(visit: VisitLike, visits: VisitLike[], canWrite: boolean): PreloadAvailability {
  if (visit.visit_code !== 'FINAL') return { enabled: false, reason: 'Solo se ofrece en la visita final.' };
  if (!canWrite) return { enabled: false, reason: 'Su rol no puede registrar datos clínicos en esta visita.' };
  if (visit.status === 'cancelled' || visit.status === 'not_done') return { enabled: false, reason: 'La visita final está anulada o no realizada.' };
  if (visit.record_state === 'closed') return { enabled: false, reason: 'La visita está cerrada: reábrala con motivo para registrar datos.' };
  const basal = visits.find((v) => v.visit_code === 'BASAL' && v.status === 'done' && v.actual_date);
  if (!basal) return { enabled: false, reason: 'No hay una visita inicial realizada con fecha efectiva de la que copiar valores.' };
  return { enabled: true, reason: null };
}

/** Precarga pendiente de una variable (la única que puede estar abierta por variable y visita). */
export function pendingPreload(preloads: PreloadRow[], variableCode: string): PreloadRow | null {
  return preloads.find((p) => p.variable_code === variableCode && p.status === 'pending_verification') ?? null;
}

/** Última precarga resuelta (confirmada/actualizada) de una variable, para mostrar su origen. */
export function resolvedPreload(preloads: PreloadRow[], variableCode: string): PreloadRow | null {
  return [...preloads].filter((p) => p.variable_code === variableCode && (p.status === 'confirmed' || p.status === 'updated'))
    .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))[0] ?? null;
}

export function pendingPreloadCount(preloads: PreloadRow[], observationVariableCodesRecorded: Set<string>): number {
  return preloads.filter((p) => p.status === 'pending_verification' && !observationVariableCodesRecorded.has(p.variable_code)).length;
}

/** Carga útil de la observación que confirma «sin cambios» un valor precargado (misma variable, mismo valor). */
export function confirmationPayload(p: PreloadRow, ctx: { visitId: string; observedDate: string; dataSource: string; temporalContext: string }): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    patient_id: p.patient_id, visit_id: ctx.visitId, variable_code: p.variable_code, observed_date: ctx.observedDate,
    data_source: ctx.dataSource, temporal_context: ctx.temporalContext, is_missing: false, missing_reason: null, supersedes_id: null, correction_reason: null,
  };
  if (p.value_numeric !== null) { payload.value_numeric = p.value_numeric; payload.unit = p.unit; }
  else if (p.value_boolean !== null) payload.value_boolean = p.value_boolean;
  else if (p.value_text !== null) payload.value_text = p.value_text;
  else if (p.value_date !== null) payload.value_date = p.value_date;
  return payload;
}
