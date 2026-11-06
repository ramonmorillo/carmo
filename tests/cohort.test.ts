import { describe, expect, it } from 'vitest';

import { currentPriorityByPatient, demographicsByPatient, firstPriorityByPatient, followUpStatus, lastVisitDate } from '../src/domain/cohort';

const s = (id: string, pid: string, p: number, at: string, over: Record<string, unknown> = {}) =>
  ({ id, patient_id: pid, supersedes_id: null, final_priority: null, calculated_priority: p, total_score: 10, validation_status: 'confirmed', calculated_at: at, ...over });

describe('cohorte', () => {
  it('sexo y edad de las observaciones vigentes no ausentes', () => {
    const m = demographicsByPatient([
      { patient_id: 'a', variable_code: 'sex', value_text: 'F', value_numeric: null, is_missing: false },
      { patient_id: 'a', variable_code: 'age_years', value_text: null, value_numeric: 61, is_missing: false },
      { patient_id: 'b', variable_code: 'age_years', value_text: null, value_numeric: null, is_missing: true },
    ]);
    expect(m.get('a')).toEqual({ sex: 'F', age: 61 });
    expect(m.get('b')).toBeUndefined();
  });
  it('prioridad vigente (final si se elevó) y basal', () => {
    const strats = [s('1', 'a', 3, '2026-01-01T00:00:00Z'), s('2', 'a', 2, '2026-06-01T00:00:00Z', { final_priority: 1, validation_status: 'pending' }), s('3', 'b', 2, '2026-01-01T00:00:00Z'), s('4', 'b', 3, '2026-02-01T00:00:00Z', { supersedes_id: '3' })];
    expect(currentPriorityByPatient(strats).get('a')).toEqual({ priority: 1, score: 10, pending: true, date: '2026-06-01' });
    expect(currentPriorityByPatient(strats).get('b')?.priority).toBe(3);
    expect(firstPriorityByPatient(strats).get('a')).toBe(3);
    expect(firstPriorityByPatient(strats).get('b')).toBe(2);
  });
  it('situación del seguimiento y última visita', () => {
    const v = (status: string, planned: string | null, actual: string | null = null) => ({ patient_id: 'a', visit_code: 'S12', status, planned_date: planned, actual_date: actual });
    expect(followUpStatus('included', [v('planned', '2026-11-01'), v('planned', '2026-12-01')], '2026-11-06')).toEqual({ tone: 'warning', label: '1 visita vencida' });
    expect(followUpStatus('included', [v('planned', '2026-12-01')], '2026-11-06').label).toBe('Próxima visita 01/12/2026');
    expect(followUpStatus('completed', [], '2026-11-06').label).toBe('Seguimiento finalizado');
    expect(lastVisitDate([v('done', '2026-01-01', '2026-01-03'), v('done', '2026-04-01', '2026-04-02'), v('planned', '2026-12-01')])).toBe('2026-04-02');
  });
});
