import { describe, expect, it } from 'vitest';

import {
  addDays, agendaDate, buildMonthGrid, dayTone, filterAgendaVisits, formatLongDate, getAgendaStatus, groupByDate, shiftMonth, summarizeAgenda, type AgendaVisit,
} from '../src/domain/agenda';

const v = (over: Partial<AgendaVisit>): AgendaVisit => ({ id: 'x', patient_id: 'p1', code: '999-01', visit_code: 'S12', planned_date: '2026-11-10', actual_date: null, status: 'planned', record_state: 'draft', ...over });
const TODAY = '2026-11-06';

describe('agenda (organización DERMAPEX con el modelo de CARMO)', () => {
  it('estado de agenda: realizada, anulada/no realizada, prevista vencida y prevista', () => {
    expect(getAgendaStatus(v({ status: 'done', actual_date: '2026-11-01' }), TODAY)).toBe('completed');
    expect(getAgendaStatus(v({ status: 'not_done' }), TODAY)).toBe('cancelled');
    expect(getAgendaStatus(v({ status: 'cancelled' }), TODAY)).toBe('cancelled');
    expect(getAgendaStatus(v({ planned_date: '2026-11-05' }), TODAY)).toBe('overdue');
    expect(getAgendaStatus(v({ planned_date: '2026-11-06' }), TODAY)).toBe('scheduled');
  });
  it('fecha de agenda: la efectiva si consta; si no, la prevista', () => {
    expect(agendaDate(v({ actual_date: '2026-11-12' }))).toBe('2026-11-12');
    expect(agendaDate(v({}))).toBe('2026-11-10');
    expect(agendaDate(v({ planned_date: null }))).toBeNull();
  });
  it('rejilla mensual de 42 días empezando en lunes', () => {
    const g = buildMonthGrid('2026-11');
    expect(g).toHaveLength(42);
    expect(g[0].iso).toBe('2026-10-26');
    expect(g.filter((d) => d.inMonth)).toHaveLength(30);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(formatLongDate('2026-11-06')).toBe('Viernes, 6 de noviembre de 2026');
  });
  it('filtros, orden, agrupación y resumen', () => {
    const visits = [
      v({ id: 'a', planned_date: '2026-11-20', visit_code: 'S24' }),
      v({ id: 'b', patient_id: 'p2', code: '999-02', planned_date: '2026-11-01' }),
      v({ id: 'c', status: 'done', actual_date: '2026-11-03', planned_date: '2026-10-30', visit_code: 'BASAL' }),
      v({ id: 'd', planned_date: '2026-12-01' }),
    ];
    const nov = filterAgendaVisits(visits, { month: '2026-11', patientId: null, statuses: [] }, TODAY);
    expect(nov.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(filterAgendaVisits(visits, { month: null, patientId: 'p1', statuses: ['scheduled'] }, TODAY).map((x) => x.id)).toEqual(['a', 'd']);
    expect([...groupByDate(nov).keys()]).toEqual(['2026-11-01', '2026-11-03', '2026-11-20']);
    expect(summarizeAgenda(nov, TODAY)).toEqual({ total: 3, completed: 1, scheduled: 1, overdue: 1, cancelled: 0 });
    expect(dayTone(['completed', 'overdue'])).toBe('overdue');
  });
});
