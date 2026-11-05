// Indicadores agregados del panel (descriptivos). Siempre con numerador y denominador explícitos.
import { pairIexpac } from './iexpac';
import { currentObservations } from './observations';
import { isOverdue } from './schedule';

type P = { id: string; center_id: string; status: string; inclusion_date: string | null };
type V = { id: string; patient_id: string; visit_code: string; status: string; planned_date: string | null };
type A = { visit_id: string; patient_id: string; instrument_code: string; status: string; scores: { global: number | null; valid: boolean } | null };
type O = { id: string; supersedes_id: string | null; patient_id: string; visit_id: string | null; variable_code: string; value_numeric: number | null; unit: string | null; is_missing: boolean };

export type Stat = { n: number; mean: number | null; median: number | null };
export function describe(values: number[]): Stat {
  if (values.length === 0) return { n: 0, mean: null, median: null };
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2 };
}

const INCLUDED = new Set(['included', 'withdrawn', 'lost_to_followup', 'completed']);

export function computeDashboard(input: { patients: P[]; visits: V[]; administrations: A[]; observations: O[]; interventions: number; today: string }) {
  const included = input.patients.filter((p) => INCLUDED.has(p.status));
  const byCenter = new Map<string, number>();
  for (const p of included) byCenter.set(p.center_id, (byCenter.get(p.center_id) ?? 0) + 1);
  const byMonth = new Map<string, number>();
  for (const p of included) if (p.inclusion_date) byMonth.set(p.inclusion_date.slice(0, 7), (byMonth.get(p.inclusion_date.slice(0, 7)) ?? 0) + 1);
  const visitOf = (pid: string, code: string) => input.visits.find((v) => v.patient_id === pid && v.visit_code === code && v.status === 'done');
  const iex = (visitId?: string) => {
    const a = visitId ? input.administrations.find((x) => x.visit_id === visitId && x.instrument_code === 'IEXPAC' && x.status === 'completed') : undefined;
    return a?.scores?.valid ? a.scores.global : null;
  };
  const pairs = included.map((p) => pairIexpac(iex(visitOf(p.id, 'BASAL')?.id), iex(visitOf(p.id, 'FINAL')?.id)));
  const current = currentObservations(input.observations).filter((o) => o.variable_code === 'ldl_c' && !o.is_missing && o.value_numeric !== null);
  const ldlAt = (code: string, unit: string) =>
    included.map((p) => { const v = visitOf(p.id, code); return v ? current.find((o) => o.visit_id === v.id && o.unit === unit)?.value_numeric ?? null : null; })
      .filter((x): x is number => x !== null);
  const basalDone = included.filter((p) => visitOf(p.id, 'BASAL'));
  const iexBasalMissing = basalDone.filter((p) => iex(visitOf(p.id, 'BASAL')?.id) === null).length;
  return {
    screened: input.patients.length,
    included: included.length,
    active: input.patients.filter((p) => p.status === 'included').length,
    completed: input.patients.filter((p) => p.status === 'completed').length,
    withdrawn: input.patients.filter((p) => p.status === 'withdrawn').length,
    lost: input.patients.filter((p) => p.status === 'lost_to_followup').length,
    notIncluded: input.patients.filter((p) => p.status === 'not_included').length,
    byCenter,
    byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)),
    overdueVisits: input.visits.filter((v) => isOverdue(v.planned_date, v.status, input.today)).length,
    iexpacBaseline: describe(pairs.map((p) => p.baseline).filter((x): x is number => x !== null)),
    iexpacFinal: describe(pairs.map((p) => p.final).filter((x): x is number => x !== null)),
    iexpacDiff: describe(pairs.map((p) => p.difference).filter((x): x is number => x !== null)),
    iexpacBaselineMissing: { n: iexBasalMissing, of: basalDone.length },
    ldlBaselineMgdl: describe(ldlAt('BASAL', 'mg/dL')),
    ldlFinalMgdl: describe(ldlAt('FINAL', 'mg/dL')),
    interventions: input.interventions,
  };
}
