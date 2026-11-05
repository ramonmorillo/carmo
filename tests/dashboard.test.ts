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
