import { describe, expect, it } from 'vitest';
import { INSTRUMENT_UI, scoreQuestionnaire } from '../src/domain/questionnaires';

describe('cuestionarios reutilizados (mismas reglas que la BD)', () => {
  it('EQ-5D-3L: perfil solo completo; EVA independiente; sin índice', () => {
    expect(scoreQuestionnaire('EQ5D3L', { 1: 1, 2: 1, 3: 2, 4: 1, 5: 3 }, 70)).toEqual({ kind: 'eq5d', valid: true, profile: '11213', vas: 70, itemsAnswered: 5 });
    expect(scoreQuestionnaire('EQ5D3L', { 1: 1 }, 0)).toMatchObject({ valid: false, profile: null, vas: 0 });
  });
  it('EVASAF: completitud sin total', () => {
    const r = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 4]));
    expect(scoreQuestionnaire('EVASAF', r, null)).toEqual({ kind: 'evasaf', complete: true, itemsAnswered: 10 });
  });
  it('Morisky-Green: adherente solo con No-Sí-No-No y 4 ítems', () => {
    expect(scoreQuestionnaire('MORISKY_GREEN', { 1: 0, 2: 1, 3: 0, 4: 0 }, null)).toMatchObject({ valid: true, adherent: true });
    expect(scoreQuestionnaire('MORISKY_GREEN', { 1: 0, 2: 0, 3: 0, 4: 0 }, null)).toMatchObject({ adherent: false });
    expect(scoreQuestionnaire('MORISKY_GREEN', { 1: 0, 2: 1, 3: 0 }, null)).toMatchObject({ valid: false, adherent: null });
  });
  it('dominios coherentes con la BD', () => {
    expect(INSTRUMENT_UI.EQ5D3L.options.map((o) => o.value)).toEqual([1, 2, 3]);
    expect(INSTRUMENT_UI.EVASAF.items).toHaveLength(10);
    expect(INSTRUMENT_UI.MORISKY_GREEN.options.map((o) => o.value).sort()).toEqual([0, 1]);
    expect(INSTRUMENT_UI.EQ5D3L.modes).not.toContain('assisted');
  });
});
