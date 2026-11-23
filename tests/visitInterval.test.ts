import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, intervalFromBaseline, intervalLabel, type IntervalVisit } from '../src/domain/visitInterval';

const v = (id: string, code: string, status: string, actual: string | null): IntervalVisit => ({ id, visit_code: code, status, actual_date: actual });

describe('días desde la visita inicial', () => {
  const basal = v('b', 'BASAL', 'done', '2026-11-08');

  it('la visita inicial muestra 0', () => {
    expect(intervalFromBaseline(basal, [basal])).toEqual({ available: true, days: 0 });
  });

  it('S12 realizada el día 87 desde la inicial', () => {
    const s12 = v('s12', 'S12', 'done', '2027-02-03'); // 08/11/2026 + 87 días
    expect(calendarDaysBetween('2026-11-08', '2027-02-03')).toBe(87);
    expect(intervalFromBaseline(s12, [basal, s12])).toEqual({ available: true, days: 87 });
    expect(intervalLabel({ available: true, days: 87 })).toBe('87 días');
  });

  it('cruce del cambio de hora: días de calendario enteros (primavera y otoño en España)', () => {
    // 28/03/2027 (+1 h) y 25/10/2026 (−1 h)
    expect(calendarDaysBetween('2027-03-20', '2027-03-29')).toBe(9);
    expect(calendarDaysBetween('2026-10-20', '2026-11-02')).toBe(13);
    const b = v('b', 'BASAL', 'done', '2026-10-20');
    const s = v('s', 'S12', 'done', '2026-11-02');
    expect(intervalFromBaseline(s, [b, s])).toEqual({ available: true, days: 13 });
  });

  it('año bisiesto y fin de año', () => {
    expect(calendarDaysBetween('2027-12-31', '2028-03-01')).toBe(61);
    expect(calendarDaysBetween('2026-11-08', '2026-11-09')).toBe(1);
    expect(intervalLabel({ available: true, days: 1 })).toBe('1 día');
  });

  it('no disponible: visita solo programada, anulada o no realizada', () => {
    for (const status of ['planned', 'cancelled', 'not_done']) {
      expect(intervalFromBaseline(v('x', 'S24', status, '2027-04-01'), [basal])).toEqual({ available: false, reason: 'not_done' });
    }
  });

  it('no disponible: sin fecha efectiva, sin visita inicial válida o con incoherencia cronológica', () => {
    expect(intervalFromBaseline(v('x', 'S24', 'done', null), [basal])).toEqual({ available: false, reason: 'no_actual_date' });
    const planned = v('b2', 'BASAL', 'planned', null);
    expect(intervalFromBaseline(v('x', 'S24', 'done', '2027-04-01'), [planned])).toEqual({ available: false, reason: 'no_baseline' });
    const cancelled = v('b3', 'BASAL', 'cancelled', '2026-11-08');
    expect(intervalFromBaseline(v('x', 'S24', 'done', '2027-04-01'), [cancelled])).toEqual({ available: false, reason: 'no_baseline' });
    expect(intervalFromBaseline(v('x', 'S12', 'done', '2026-11-01'), [basal])).toEqual({ available: false, reason: 'chronology' });
    expect(intervalLabel({ available: false, reason: 'chronology' })).toBe('No disponible');
  });

  it('fechas con formato no válido no producen un intervalo', () => {
    expect(calendarDaysBetween('no-fecha', '2026-11-08')).toBeNull();
  });
});
