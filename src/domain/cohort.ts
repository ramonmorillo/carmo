// Datos de cohorte por paciente para el listado, la cabecera de la ficha y el panel (organización DERMAPEX).
// Solo lectura y lógica pura; las fuentes son los registros vigentes (sin imputar).

type Obs = { patient_id: string; variable_code: string; value_numeric: number | null; value_text: string | null; is_missing: boolean };
type Strat = { id: string; patient_id: string; supersedes_id: string | null; final_priority: number | null; calculated_priority: number; total_score: number | null; validation_status: string; calculated_at: string };
type Visit = { patient_id: string; visit_code: string; status: string; planned_date: string | null; actual_date: string | null };

export const SEX_LABELS: Record<string, string> = { M: 'Varón', F: 'Mujer', unknown: 'Sexo desconocido' };

/** Sexo y edad a la inclusión registrados (observaciones vigentes, no ausentes). */
export function demographicsByPatient(obs: Obs[]): Map<string, { sex: string | null; age: number | null }> {
  const map = new Map<string, { sex: string | null; age: number | null }>();
  for (const o of obs) {
    if (o.is_missing) continue;
    const cur = map.get(o.patient_id) ?? { sex: null, age: null };
    if (o.variable_code === 'sex' && o.value_text) cur.sex = o.value_text;
    if (o.variable_code === 'age_years' && o.value_numeric !== null) cur.age = o.value_numeric;
    map.set(o.patient_id, cur);
  }
  return map;
}

export type CurrentPriority = { priority: 1 | 2 | 3; score: number | null; pending: boolean; date: string };

/** Prioridad CMO vigente de cada paciente: la última estratificación no sustituida (final si se elevó). */
export function currentPriorityByPatient(strats: Strat[]): Map<string, CurrentPriority> {
  const map = new Map<string, CurrentPriority>();
  const current = strats.filter((s) => !strats.some((n) => n.supersedes_id === s.id)).sort((a, b) => b.calculated_at.localeCompare(a.calculated_at));
  for (const s of current) {
    if (map.has(s.patient_id)) continue;
    map.set(s.patient_id, { priority: (s.final_priority ?? s.calculated_priority) as 1 | 2 | 3, score: s.total_score, pending: s.validation_status === 'pending', date: s.calculated_at.slice(0, 10) });
  }
  return map;
}

/** Primera estratificación registrada de cada paciente (la inicial), para la evolución de la prioridad. */
export function firstPriorityByPatient(strats: Strat[]): Map<string, 1 | 2 | 3> {
  const map = new Map<string, 1 | 2 | 3>();
  for (const s of [...strats].sort((a, b) => a.calculated_at.localeCompare(b.calculated_at))) {
    if (!map.has(s.patient_id)) map.set(s.patient_id, (s.final_priority ?? s.calculated_priority) as 1 | 2 | 3);
  }
  return map;
}

export type FollowUp = { tone: 'positive' | 'info' | 'warning' | 'neutral'; label: string };

/** Situación del seguimiento del paciente (cabecera y listado). */
export function followUpStatus(patientStatus: string, visits: Visit[], today: string): FollowUp {
  if (patientStatus === 'completed') return { tone: 'positive', label: 'Seguimiento finalizado' };
  if (patientStatus === 'withdrawn') return { tone: 'neutral', label: 'Retirado' };
  if (patientStatus === 'lost_to_followup') return { tone: 'neutral', label: 'Pérdida de seguimiento' };
  if (patientStatus === 'screening') return { tone: 'info', label: 'En selección' };
  if (patientStatus === 'not_included') return { tone: 'neutral', label: 'No incluido' };
  const pending = visits.filter((v) => v.status === 'planned' && v.planned_date).sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''));
  const overdue = pending.filter((v) => (v.planned_date as string) < today);
  if (overdue.length) return { tone: 'warning', label: `${overdue.length} ${overdue.length === 1 ? 'visita vencida' : 'visitas vencidas'}` };
  if (pending.length) return { tone: 'info', label: `Próxima visita ${pending[0].planned_date!.split('-').reverse().join('/')}` };
  return { tone: 'info', label: 'Seguimiento activo' };
}

/** Última visita realizada (fecha efectiva). */
export function lastVisitDate(visits: Visit[]): string | null {
  return visits.filter((v) => v.status === 'done' && v.actual_date).map((v) => v.actual_date as string).sort().pop() ?? null;
}
