// «Datos pendientes» de un paciente: lo que falta registrar, validar, realizar o cerrar según el
// protocolo v3.0 (esquema de procedimientos) y el modelo CMO (periodicidad). Lógica pura: la usan la
// ficha del paciente y la página de calidad de datos. No modifica nada; solo informa.
import { currentObservations } from './observations';

export type PendingKind = 'missing_data' | 'questionnaire' | 'stratification' | 'overdue' | 'to_close' | 'deviation';
export type PendingItem = { kind: PendingKind; severity: 'high' | 'medium' | 'low'; visitId: string | null; message: string };

type Visit = { id: string; visit_code: string; status: string; planned_date: string | null; record_state: string };
type Variable = { code: string; label: string; section: string; allowed_visits: string[]; status: string };
type Obs = { id: string; supersedes_id: string | null; visit_id: string | null; variable_code: string; value_boolean: boolean | null; is_missing: boolean };
type Admin = { visit_id: string; instrument_code: string; status: string; scores: { valid?: boolean; complete?: boolean } | null };
type Instrument = { code: string; status: string; allowed_visits: string[] };
type Strat = { id: string; visit_id: string; supersedes_id: string | null; validation_status: string; calculated_priority: number; final_priority: number | null; calculated_at: string; validated_at: string | null };
type Deviation = { status: string };
type FollowUp = Record<string, { restratifyMonths: number | null }>;

export const PENDING_KIND_LABELS: Record<PendingKind, string> = {
  missing_data: 'Variables sin registrar',
  questionnaire: 'Cuestionarios',
  stratification: 'Estratificación CMO',
  overdue: 'Visitas vencidas',
  to_close: 'Visitas por cerrar',
  deviation: 'Desviaciones abiertas',
};

const VISIT_NAMES: Record<string, string> = { BASAL: 'Visita inicial', S12: 'Semana 12', S24: 'Semana 24', S36: 'Semana 36', S48: 'Semana 48', FINAL: 'Visita final', EXTRA: 'Contacto extraordinario' };

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

/** Variables esperadas en una visita realizada: las del protocolo para esa visita, salvo eventos CV (se registran si ocurren) y las condicionales no aplicables. */
export function expectedVariables(variables: Variable[], visitCode: string, tobaccoUse: boolean | null): Variable[] {
  return variables.filter((v) => {
    if (v.status === 'blocked' || v.status === 'retired') return false;
    if (v.section === 'cv_event') return false;
    if (!v.allowed_visits.includes(visitCode)) return false;
    if ((v.code === 'cigarettes_per_day' || v.code === 'smoking_years') && tobaccoUse !== true) return false;
    if (v.code === 'years_since_quitting') return false; // solo aplica a exfumadores; el protocolo no lo exige siempre
    return true;
  });
}

export function computePending(input: {
  patientStatus: string;
  visits: Visit[];
  variables: Variable[];
  observations: Obs[];
  administrations: Admin[];
  instruments: Instrument[];
  stratifications: Strat[];
  deviations: Deviation[];
  followUp: FollowUp | null;
  today: string;
}): PendingItem[] {
  const items: PendingItem[] = [];
  if (!['included', 'completed', 'withdrawn', 'lost_to_followup'].includes(input.patientStatus)) return items;
  const active = input.patientStatus === 'included';
  const visits = input.visits.filter((v) => v.status !== 'cancelled');
  const current = currentObservations(input.observations);
  const basal = visits.find((v) => v.visit_code === 'BASAL');

  if (!basal || basal.status !== 'done') {
    items.push({ kind: 'missing_data', severity: 'high', visitId: basal?.id ?? null, message: 'Visita inicial no realizada' });
  }

  for (const v of visits.filter((x) => x.status === 'done')) {
    const name = VISIT_NAMES[v.visit_code] ?? v.visit_code;
    const atVisit = current.filter((o) => o.visit_id === v.id);
    const tobacco = atVisit.find((o) => o.variable_code === 'tobacco_use' && !o.is_missing)?.value_boolean ?? null;
    const recorded = new Set(atVisit.map((o) => o.variable_code));
    const missing = expectedVariables(input.variables, v.visit_code, tobacco).filter((x) => !recorded.has(x.code));
    if (missing.length) {
      items.push({ kind: 'missing_data', severity: 'high', visitId: v.id, message: `${name}: ${missing.length} variable(s) sin registrar (${missing.map((m) => m.label).join(', ')})` });
    }
    for (const inst of input.instruments.filter((i) => i.status === 'active' && i.allowed_visits.includes(v.visit_code))) {
      const a = input.administrations.find((x) => x.visit_id === v.id && x.instrument_code === inst.code);
      if (!a) items.push({ kind: 'questionnaire', severity: 'high', visitId: v.id, message: `${name}: ${inst.code} pendiente` });
      else if (a.status === 'in_progress') items.push({ kind: 'questionnaire', severity: 'medium', visitId: v.id, message: `${name}: ${inst.code} en curso (borrador)` });
      else if (a.status === 'completed' && a.scores && a.scores.valid === false) items.push({ kind: 'questionnaire', severity: 'medium', visitId: v.id, message: `${name}: ${inst.code} completado con ítems sin responder (sin resultado)` });
    }
    if (v.record_state !== 'closed') {
      items.push({ kind: 'to_close', severity: 'low', visitId: v.id, message: `${name}: realizada, pendiente de ${v.record_state === 'draft' ? 'revisión y cierre' : 'cierre'}` });
    }
  }

  if (active) {
    for (const v of visits.filter((x) => x.status === 'planned' && x.planned_date && x.planned_date < input.today)) {
      items.push({ kind: 'overdue', severity: 'high', visitId: v.id, message: `${VISIT_NAMES[v.visit_code] ?? v.visit_code}: prevista el ${v.planned_date}, sin realizar` });
    }
  }

  const strats = input.stratifications;
  const currentStrat = strats.filter((s) => !strats.some((n) => n.supersedes_id === s.id)).sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))[0];
  if (basal?.status === 'done' && !strats.some((s) => s.visit_id === basal.id)) {
    items.push({ kind: 'stratification', severity: 'high', visitId: basal.id, message: 'Estratificación CMO de la visita inicial pendiente (esquema del protocolo)' });
  }
  if (currentStrat?.validation_status === 'pending') {
    items.push({ kind: 'stratification', severity: 'medium', visitId: currentStrat.visit_id, message: 'Estratificación pendiente de validación profesional' });
  }
  if (active && currentStrat && input.followUp) {
    const p = currentStrat.final_priority ?? currentStrat.calculated_priority;
    const months = input.followUp[String(p)]?.restratifyMonths;
    if (months) {
      const due = addMonthsIso(currentStrat.validated_at ?? currentStrat.calculated_at, months);
      if (due < input.today) items.push({ kind: 'stratification', severity: 'medium', visitId: null, message: `Reestratificación vencida (Prioridad ${p}: cada ${months} meses; vencía el ${due})` });
    }
  }

  const openDev = input.deviations.filter((d) => d.status === 'open').length;
  if (openDev) items.push({ kind: 'deviation', severity: 'low', visitId: null, message: `${openDev} desviación(es) abierta(s)` });
  return items;
}

/** Diferencias entre el valor anterior y el nuevo de un registro auditado (campos técnicos excluidos). */
const TECH_FIELDS = new Set(['updated_at', 'revision', 'updated_by', 'recorded_at', 'created_at', 'completed_at', 'status_changed_at']);
export function auditDiff(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): Array<{ field: string; before: unknown; after: unknown }> {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  return [...keys].filter((k) => !TECH_FIELDS.has(k) && JSON.stringify(oldData[k] ?? null) !== JSON.stringify(newData[k] ?? null))
    .map((k) => ({ field: k, before: oldData[k] ?? null, after: newData[k] ?? null }));
}
