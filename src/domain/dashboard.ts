// Indicadores agregados del panel (descriptivos). Siempre con numerador y denominador explícitos.
import { pairIexpac } from './iexpac';
import { currentObservations } from './observations';
import { isOverdue } from './schedule';

type P = { id: string; center_id: string; status: string; inclusion_date: string | null };
type V = { id: string; patient_id: string; visit_code: string; status: string; planned_date: string | null };
type A = { visit_id: string; patient_id: string; instrument_code: string; status: string; scores: { global?: number | null; valid?: boolean; vas?: number | null; adherent?: boolean | null } | null };
type O = { id: string; supersedes_id: string | null; patient_id: string; visit_id: string | null; variable_code: string; value_numeric: number | null; unit: string | null; is_missing: boolean };

export type Stat = { n: number; mean: number | null; median: number | null };
export function describe(values: number[]): Stat {
  if (values.length === 0) return { n: 0, mean: null, median: null };
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2 };
}

const INCLUDED = new Set(['included', 'withdrawn', 'lost_to_followup', 'completed']);

type S = { id: string; patient_id: string; supersedes_id: string | null; final_priority: number | null; calculated_priority: number };

export function computeDashboard(input: { patients: P[]; visits: V[]; administrations: A[]; observations: O[]; interventions: number; strats?: S[]; today: string }) {
  const included = input.patients.filter((p) => INCLUDED.has(p.status));
  const byCenter = new Map<string, number>();
  for (const p of included) byCenter.set(p.center_id, (byCenter.get(p.center_id) ?? 0) + 1);
  const byMonth = new Map<string, number>();
  for (const p of included) if (p.inclusion_date) byMonth.set(p.inclusion_date.slice(0, 7), (byMonth.get(p.inclusion_date.slice(0, 7)) ?? 0) + 1);
  const visitOf = (pid: string, code: string) => input.visits.find((v) => v.patient_id === pid && v.visit_code === code && v.status === 'done');
  const iex = (visitId?: string) => {
    const a = visitId ? input.administrations.find((x) => x.visit_id === visitId && x.instrument_code === 'IEXPAC' && x.status === 'completed') : undefined;
    return a?.scores?.valid && typeof a.scores.global === 'number' ? a.scores.global : null;
  };
  const scoreOf = (visitId: string | undefined, code: string) =>
    visitId ? input.administrations.find((x) => x.visit_id === visitId && x.instrument_code === code && x.status === 'completed')?.scores ?? null : null;
  const adherence = (code: string) => {
    const vals = included.map((p) => scoreOf(visitOf(p.id, code)?.id, 'MORISKY_GREEN')?.adherent).filter((x): x is boolean => typeof x === 'boolean');
    return { adherent: vals.filter(Boolean).length, n: vals.length };
  };
  const vasAt = (code: string) => included.map((p) => scoreOf(visitOf(p.id, code)?.id, 'EQ5D3L')?.vas).filter((x): x is number => typeof x === 'number');
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
    priorities: input.strats ? (() => {
      const cur = input.strats.filter((s) => !input.strats!.some((n) => n.supersedes_id === s.id));
      const res = { 1: 0, 2: 0, 3: 0, none: 0 } as Record<1 | 2 | 3 | 'none', number>;
      for (const p of included) {
        const s = cur.find((x) => x.patient_id === p.id);
        if (!s) res.none += 1; else res[(s.final_priority ?? s.calculated_priority) as 1 | 2 | 3] += 1;
      }
      return res;
    })() : null,
    moriskyBaseline: adherence('BASAL'),
    moriskyFinal: adherence('FINAL'),
    eqVasBaseline: describe(vasAt('BASAL')),
    eqVasFinal: describe(vasAt('FINAL')),
  };
}

// ── Panel con la organización de DERMAPEX (cohorte, seguimiento, evolución, actividad, calidad) ──────────
type PV = { id: string; patient_id: string; visit_code: string; status: string; planned_date: string | null; actual_date: string | null; record_state: string };
type PS = { id: string; patient_id: string; visit_id: string; supersedes_id: string | null; final_priority: number | null; calculated_priority: number; total_score: number | null; validation_status: string; calculated_at: string };
type PI = { id: string; patient_id: string; visit_id: string | null; catalog_code: string; intervention_date: string; is_scheduled: boolean; modality: string };
type PO = { patient_id: string; variable_code: string; value_numeric: number | null; value_text: string | null; is_missing: boolean };

const daysBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

export function computePanel(input: {
  patients: Array<{ id: string; status: string; inclusion_date: string | null }>; visits: PV[]; strats: PS[]; interventions: PI[];
  catalogDomain: Record<string, string>; demographics: PO[]; reviewedVisitIds: string[]; today: string;
}) {
  const inc = input.patients.filter((p) => INCLUDED.has(p.status));
  const incIds = new Set(inc.map((p) => p.id));
  const visits = input.visits.filter((v) => incIds.has(v.patient_id));
  // Cohorte
  const ages = input.demographics.filter((o) => incIds.has(o.patient_id) && o.variable_code === 'age_years' && !o.is_missing && o.value_numeric !== null).map((o) => o.value_numeric as number);
  const sexes = input.demographics.filter((o) => incIds.has(o.patient_id) && o.variable_code === 'sex' && !o.is_missing && (o.value_text === 'M' || o.value_text === 'F'));
  const current = input.strats.filter((s) => !input.strats.some((n) => n.supersedes_id === s.id)).sort((a, b) => b.calculated_at.localeCompare(a.calculated_at));
  const first = [...input.strats].sort((a, b) => a.calculated_at.localeCompare(b.calculated_at));
  const prioOf = (s: PS) => (s.final_priority ?? s.calculated_priority) as 1 | 2 | 3;
  const byPriority = { 1: 0, 2: 0, 3: 0, none: 0 } as Record<1 | 2 | 3 | 'none', number>;
  const evolution = { improved: 0, stable: 0, worsened: 0 };
  const firstScores: number[] = []; const lastScores: number[] = [];
  for (const p of inc) {
    const cur = current.find((s) => s.patient_id === p.id);
    if (!cur) { byPriority.none += 1; continue; }
    byPriority[prioOf(cur)] += 1;
    const fst = first.find((s) => s.patient_id === p.id)!;
    if (fst.id !== cur.id) {
      const d = prioOf(cur) - prioOf(fst);
      if (d > 0) evolution.improved += 1; else if (d < 0) evolution.worsened += 1; else evolution.stable += 1;
      if (fst.total_score !== null && cur.total_score !== null) { firstScores.push(fst.total_score); lastScores.push(cur.total_score); }
    }
  }
  // Seguimiento
  const doneBy = (code: string) => visits.filter((v) => v.visit_code === code && v.status === 'done').length;
  const lastDone = (pid: string) => visits.filter((v) => v.patient_id === pid && v.status === 'done' && v.actual_date).map((v) => v.actual_date as string).sort().pop() ?? null;
  const active = inc.filter((p) => p.status === 'included');
  const without90 = active.filter((p) => { const ref = lastDone(p.id) ?? p.inclusion_date; return ref !== null && daysBetween(ref, input.today) > 90; }).length;
  // Actividad
  const ints = input.interventions.filter((i) => incIds.has(i.patient_id));
  const byDomain = { capacity: 0, motivation: 0, opportunity: 0 } as Record<string, number>;
  for (const i of ints) { const d = input.catalogDomain[i.catalog_code]; if (d in byDomain) byDomain[d] += 1; }
  // Calidad
  const basalDone = visits.filter((v) => v.visit_code === 'BASAL' && v.status === 'done');
  return {
    cohort: {
      included: inc.length, active: active.length,
      age: describe(ages), womenPct: sexes.length ? (sexes.filter((o) => o.value_text === 'F').length / sexes.length) * 100 : null, sexN: sexes.length,
      byPriority,
    },
    followup: {
      stages: (['BASAL', 'S12', 'S24', 'S36', 'FINAL'] as const).map((c) => ({ code: c, done: doneBy(c) })),
      extra: doneBy('EXTRA'),
      overdue: visits.filter((v) => isOverdue(v.planned_date, v.status, input.today)).length,
      without90,
    },
    evolution: { ...evolution, firstScore: describe(firstScores), lastScore: describe(lastScores) },
    activity: {
      total: ints.length, perPatient: inc.length ? ints.length / inc.length : 0, byDomain,
      scheduled: ints.filter((i) => i.is_scheduled).length, telematic: ints.filter((i) => i.modality !== 'in_person').length,
    },
    upcoming: visits.filter((v) => v.status === 'planned' && v.planned_date && v.planned_date >= input.today).sort((a, b) => (a.planned_date as string).localeCompare(b.planned_date as string)).slice(0, 8),
    recent: visits.filter((v) => v.status === 'done' && v.actual_date).sort((a, b) => (b.actual_date as string).localeCompare(a.actual_date as string)).slice(0, 8),
    recentInterventions: [...ints].sort((a, b) => b.intervention_date.localeCompare(a.intervention_date)).slice(0, 8),
    quality: {
      basalWithoutStrat: basalDone.filter((v) => !input.strats.some((s) => s.visit_id === v.id)).length,
      pendingValidation: current.filter((s) => incIds.has(s.patient_id) && s.validation_status === 'pending').length,
      doneNotClosed: visits.filter((v) => v.status === 'done' && v.record_state !== 'closed').length,
      medicationNotReviewed: visits.filter((v) => v.status === 'done' && v.visit_code !== 'EXTRA' && !input.reviewedVisitIds.includes(v.id)).length,
    },
  };
}
