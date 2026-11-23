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

describe('enunciados de los instrumentos', () => {
  it('conserva las claves de ítem, el número de ítems y las escalas (las respuestas históricas siguen siendo válidas)', async () => {
    const { INSTRUMENT_UI, INSTRUMENT_ITEM_TEXTS } = await import('../src/domain/questionnaires');
    expect(INSTRUMENT_UI.IEXPAC.items.map((i) => i.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(INSTRUMENT_UI.EVASAF.items).toHaveLength(10);
    expect(INSTRUMENT_UI.EQ5D3L.items).toHaveLength(5);
    expect(INSTRUMENT_UI.MORISKY_GREEN.items.map((i) => i.key)).toEqual(['1', '2', '3', '4']);
    expect(INSTRUMENT_UI.IEXPAC.options.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
    expect(INSTRUMENT_UI.MORISKY_GREEN.options.map((o) => [o.value, o.label])).toEqual([[1, 'Sí'], [0, 'No']]);
    for (const code of Object.keys(INSTRUMENT_UI) as Array<keyof typeof INSTRUMENT_UI>) expect(INSTRUMENT_ITEM_TEXTS[code]).toBeDefined();
  });

  it('no declara «oficial» ningún instrumento sin texto cargado: los ítems sin enunciado siguen como «Ítem N»', async () => {
    const { INSTRUMENT_UI, INSTRUMENT_ITEM_TEXTS } = await import('../src/domain/questionnaires');
    for (const code of ['IEXPAC', 'EVASAF'] as const) {
      expect(INSTRUMENT_ITEM_TEXTS[code].status).toBe('missing');
      expect(INSTRUMENT_UI[code].items.every((i) => /^Ítem \d+$/.test(i.label))).toBe(true);
      expect(INSTRUMENT_ITEM_TEXTS[code].note).toMatch(/Fuente que hay que facilitar/);
    }
    expect(INSTRUMENT_ITEM_TEXTS.EQ5D3L.status).toBe('missing');
    expect(INSTRUMENT_ITEM_TEXTS.MORISKY_GREEN.status).toBe('project_wording_unverified');
  });

  it('la puntuación de Morisky-Green no cambia con el texto mostrado (adherente = No-Sí-No-No)', async () => {
    const { scoreQuestionnaire } = await import('../src/domain/questionnaires');
    expect(scoreQuestionnaire('MORISKY_GREEN', { '1': 0, '2': 1, '3': 0, '4': 0 }, null)).toMatchObject({ valid: true, adherent: true });
    expect(scoreQuestionnaire('MORISKY_GREEN', { '1': 1, '2': 1, '3': 0, '4': 0 }, null)).toMatchObject({ valid: true, adherent: false });
  });
});
