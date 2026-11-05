import { describe, expect, it } from 'vitest';
import { suggestAgeGroup, suggestNutritionalStatus, suggestPolypharmacy, suggestTobacco } from '../src/domain/cmoSuggestions';

describe('sugerencias del modelo CMO (sin rellenar huecos de las tablas)', () => {
  it('edad', () => {
    expect([17, 19, 49, 50, 69, 70].map((a) => suggestAgeGroup(a)?.value)).toEqual(['under_18', '19_49', '19_49', '50_69', '50_69', '70_plus']);
    expect(suggestAgeGroup(18)?.value).toBeNull();
  });
  it('IMC', () => {
    expect([18.3, 18.5, 24.9, 25, 30, 30.1, 39.9, 40.1].map((b) => suggestNutritionalStatus(b)?.value))
      .toEqual(['undernutrition', 'normal', 'normal', 'overweight', 'overweight', 'obesity', 'obesity', 'severe_obesity']);
    expect([18.45, 24.95, 40].map((b) => suggestNutritionalStatus(b)?.value)).toEqual([null, null, null]);
  });
  it('polimedicación (10 es ambiguo en el modelo)', () => {
    expect([6, 7, 9, 10, 11].map((n) => suggestPolypharmacy(n)?.value)).toEqual(['lt_7', '7_10', '7_10', null, '10_plus']);
  });
  it('tabaco', () => {
    expect(suggestTobacco(true, null)?.value).toBe('current');
    expect(suggestTobacco(false, 2)?.value).toBe('former_5y');
    expect(suggestTobacco(false, 5)?.value).toBeNull();
    expect(suggestTobacco(false, 8)?.value).toBe('no');
    expect(suggestTobacco(null, null)).toBeNull();
  });
});
