import { describe, expect, it } from 'vitest';
import { computeDashboard, describe as stat } from '../src/domain/dashboard';

describe('panel científico (descriptivo, con denominadores)', () => {
  const patients = [
    { id: 'a', center_id: 'c1', status: 'completed', inclusion_date: '2026-01-10' },
    { id: 'b', center_id: 'c1', status: 'included', inclusion_date: '2026-02-01' },
    { id: 'c', center_id: 'c2', status: 'withdrawn', inclusion_date: '2026-02-03' },
    { id: 'd', center_id: 'c2', status: 'not_included', inclusion_date: null },
    { id: 'e', center_id: 'c2', status: 'screening', inclusion_date: null },
  ];
  const visits = [
    { id: 'ab', patient_id: 'a', visit_code: 'BASAL', status: 'done', planned_date: '2026-01-10' },
    { id: 'af', patient_id: 'a', visit_code: 'FINAL', status: 'done', planned_date: '2027-01-10' },
    { id: 'bb', patient_id: 'b', visit_code: 'BASAL', status: 'done', planned_date: '2026-02-01' },
    { id: 'b12', patient_id: 'b', visit_code: 'S12', status: 'planned', planned_date: '2026-04-26' },
  ];
  const administrations = [
    { visit_id: 'ab', patient_id: 'a', instrument_code: 'IEXPAC', status: 'completed', scores: { global: 4, valid: true } },
    { visit_id: 'af', patient_id: 'a', instrument_code: 'IEXPAC', status: 'completed', scores: { global: 6, valid: true } },
    { visit_id: 'bb', patient_id: 'b', instrument_code: 'IEXPAC', status: 'completed', scores: { global: null, valid: false } },
  ];
  const observations = [
    { id: 'o1', supersedes_id: null, patient_id: 'a', visit_id: 'ab', variable_code: 'ldl_c', value_numeric: 150, unit: 'mg/dL', is_missing: false },
    { id: 'o2', supersedes_id: 'o1', patient_id: 'a', visit_id: 'ab', variable_code: 'ldl_c', value_numeric: 140, unit: 'mg/dL', is_missing: false },
    { id: 'o3', supersedes_id: null, patient_id: 'b', visit_id: 'bb', variable_code: 'ldl_c', value_numeric: 3.5, unit: 'mmol/L', is_missing: false },
  ];
  const d = computeDashboard({ patients, visits, administrations, observations, interventions: 0, today: '2026-11-05' });
  it('recuentos por estado y centro', () => {
    expect(d).toMatchObject({ screened: 5, included: 3, active: 1, completed: 1, withdrawn: 1, notIncluded: 1, overdueVisits: 1 });
    expect(Object.fromEntries(d.byCenter)).toEqual({ c1: 2, c2: 1 });
    expect(d.byMonth).toEqual([['2026-01', 1], ['2026-02', 2]]);
  });
  it('IEXPAC solo con puntuaciones válidas; diferencia solo pareada', () => {
    expect(d.iexpacBaseline).toMatchObject({ n: 1, mean: 4 });
    expect(d.iexpacDiff).toMatchObject({ n: 1, mean: 2 });
    expect(d.iexpacBaselineMissing).toEqual({ n: 1, of: 2 });
  });
  it('LDL-c: valor vigente y sin mezclar unidades', () => {
    expect(d.ldlBaselineMgdl).toMatchObject({ n: 1, mean: 140 });
  });
  it('estadístico descriptivo', () => {
    expect(stat([])).toEqual({ n: 0, mean: null, median: null });
    expect(stat([1, 3, 2, 10])).toEqual({ n: 4, mean: 4, median: 2.5 });
  });
});

describe('panel: prioridades CMO vigentes', () => {
  it('cuenta la estratificación vigente (no sustituida) y la prioridad elevada', () => {
    const d = computeDashboard({
      patients: [{ id: 'a', center_id: 'c', status: 'included', inclusion_date: '2026-01-01' }, { id: 'b', center_id: 'c', status: 'included', inclusion_date: '2026-01-01' }, { id: 'c', center_id: 'c', status: 'included', inclusion_date: '2026-01-01' }],
      visits: [], administrations: [], observations: [], interventions: 0, today: '2026-11-05',
      strats: [
        { id: 's1', patient_id: 'a', supersedes_id: null, final_priority: null, calculated_priority: 3 },
        { id: 's2', patient_id: 'a', supersedes_id: 's1', final_priority: 1, calculated_priority: 2 },
        { id: 's3', patient_id: 'b', supersedes_id: null, final_priority: null, calculated_priority: 2 },
      ],
    });
    expect(d.priorities).toEqual({ 1: 1, 2: 1, 3: 0, none: 1 });
  });
});

describe('panel con la organización de DERMAPEX', () => {
  it('cohorte, evolución de prioridad, seguimiento, actividad y calidad', async () => {
    const { computePanel } = await import('../src/domain/dashboard');
    const s = (id: string, pid: string, vid: string, p: number, at: string, score: number, over: Record<string, unknown> = {}) =>
      ({ id, patient_id: pid, visit_id: vid, supersedes_id: null, final_priority: null, calculated_priority: p, total_score: score, validation_status: 'confirmed', calculated_at: at, ...over });
    const r = computePanel({
      patients: [{ id: 'a', status: 'included', inclusion_date: '2026-01-01' }, { id: 'b', status: 'included', inclusion_date: '2026-10-01' }, { id: 'c', status: 'screening', inclusion_date: null }],
      visits: [
        { id: 'va', patient_id: 'a', visit_code: 'BASAL', status: 'done', planned_date: '2026-01-01', actual_date: '2026-01-02', record_state: 'closed' },
        { id: 'va2', patient_id: 'a', visit_code: 'S12', status: 'done', planned_date: '2026-03-26', actual_date: '2026-03-30', record_state: 'draft' },
        { id: 'vb', patient_id: 'b', visit_code: 'BASAL', status: 'done', planned_date: '2026-10-01', actual_date: '2026-10-01', record_state: 'draft' },
        { id: 'vb2', patient_id: 'b', visit_code: 'S12', status: 'planned', planned_date: '2026-12-24', actual_date: null, record_state: 'draft' },
      ],
      strats: [s('1', 'a', 'va', 1, '2026-01-02T00:00:00Z', 25), s('2', 'a', 'va2', 2, '2026-03-30T00:00:00Z', 19, { supersedes_id: '1' })],
      interventions: [{ id: 'i', patient_id: 'a', visit_id: 'va', catalog_code: 'X', intervention_date: '2026-01-02', is_scheduled: true, modality: 'in_person' }],
      catalogDomain: { X: 'motivation' },
      demographics: [{ patient_id: 'a', variable_code: 'age_years', value_numeric: 60, value_text: null, is_missing: false }, { patient_id: 'a', variable_code: 'sex', value_numeric: null, value_text: 'F', is_missing: false }, { patient_id: 'b', variable_code: 'sex', value_numeric: null, value_text: 'M', is_missing: false }],
      reviewedVisitIds: ['va'], today: '2026-11-06',
    });
    expect(r.cohort).toMatchObject({ included: 2, womenPct: 50, sexN: 2, byPriority: { 1: 0, 2: 1, 3: 0, none: 1 } });
    expect(r.evolution).toMatchObject({ improved: 1, stable: 0, worsened: 0 });
    expect(r.followup.stages.map((x) => x.done)).toEqual([2, 1, 0, 0, 0]);
    expect(r.followup.without90).toBe(1);
    expect(r.activity).toMatchObject({ total: 1, perPatient: 0.5, byDomain: { capacity: 0, motivation: 1, opportunity: 0 } });
    expect(r.upcoming.map((v) => v.id)).toEqual(['vb2']);
    expect(r.quality).toEqual({ basalWithoutStrat: 1, pendingValidation: 0, doneNotClosed: 2, medicationNotReviewed: 2 });
  });
});
