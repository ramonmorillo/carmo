import { describe, expect, it } from 'vitest';
import { pairIexpac, scoreIexpac, validateIexpacResponses } from '../src/domain/iexpac';

const all = (v: number) => Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i + 1), v]));

describe('IEXPAC (fórmula del protocolo: 10 × (Σ − 11) / 44)', () => {
  it('extremos 0 y 10', () => {
    expect(scoreIexpac(all(1))).toEqual({ itemsAnswered: 11, sum: 11, global: 0, valid: true });
    expect(scoreIexpac(all(5))).toEqual({ itemsAnswered: 11, sum: 55, global: 10, valid: true });
  });
  it('coincide con carmo_private.iexpac_score (round 4 decimales)', () => {
    expect(scoreIexpac({ ...all(3), '11': 4 }).global).toBe(5.2273);
    for (let sum = 11; sum <= 55; sum += 1) {
      const expected = Math.round((10 * (sum - 11) / 44) * 1e4) / 1e4;
      const r: Record<string, number> = all(1);
      let rest = sum - 11;
      for (let i = 1; i <= 11 && rest > 0; i += 1) { const add = Math.min(4, rest); r[String(i)] += add; rest -= add; }
      expect(scoreIexpac(r).global).toBeCloseTo(expected, 10);
    }
  });
  it('sin puntuación global con ítems incompletos (no imputa)', () => {
    const r = all(4); delete r['7'];
    expect(scoreIexpac(r)).toEqual({ itemsAnswered: 10, sum: null, global: null, valid: false });
  });
  it('rechaza respuestas fuera de dominio', () => {
    expect(validateIexpacResponses({ '1': 0 })).toHaveLength(1);
    expect(validateIexpacResponses({ '12': 3 })).toHaveLength(1);
    expect(validateIexpacResponses({ '1': 2.5 })).toHaveLength(1);
    expect(() => scoreIexpac({ '1': 6 })).toThrow();
  });
  it('diferencia pareada solo con ambas mediciones', () => {
    expect(pairIexpac(4.0909, 6.3636)).toEqual({ baseline: 4.0909, final: 6.3636, difference: 2.2727, paired: true });
    expect(pairIexpac(4, null).paired).toBe(false);
    expect(pairIexpac(undefined, 5).difference).toBeNull();
  });
});
