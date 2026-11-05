import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import model from '../src/domain/cmoCardioModel.json';
import actions from '../src/domain/cmoCardioActions.json';
import { assertModelUsable, catalogForPriority, computeCmo, priorityFromScore, validateDefinition, type CmoModelDefinition } from '../src/domain/cmoEngine';

const def = model as unknown as CmoModelDefinition;
const NONE: Record<string, string> = Object.fromEntries(def.variables.map((v) => [v.code, v.options.find((o) => o.points === 0)!.value]));
NONE.age_group = '19_49';
NONE.nutritional_status = 'normal';

describe('Modelo CMO cardiovascular (MAPEX-SEFH): fidelidad a las tablas', () => {
  it('20 variables del modelo; máximos 7 + 20 + 12 + 3 = 42 (los declarados en el documento)', () => {
    expect(validateDefinition(def)).toEqual([]);
    expect(new Set(def.variables.map((v) => v.group)).size).toBe(20);
    expect(def.blocks.map((b) => b.max)).toEqual([7, 20, 12, 3]);
    expect(def.maxScore).toBe(42);
  });
  it('puntos de corte: P2 ≥ 17, P1 ≥ 23 (límites incluidos)', () => {
    expect([16, 17, 22, 23, 42].map((t) => priorityFromScore(def, t))).toEqual([3, 2, 2, 1, 1]);
  });
  it('sin ningún factor: 0 puntos, Prioridad 3', () => {
    expect(computeCmo(def, NONE)).toMatchObject({ totalScore: 0, priority: 3 });
  });
  it('caso clínico 4 del documento: 18 puntos, Prioridad 2', () => {
    const r = computeCmo(def, {
      ...NONE, age_group: '50_69', base_cv_pathology: 'yes', non_cv_comorbidity: 'yes', dyslipidemia_above_target: 'yes', hypertension: 'yes',
      high_risk_medication: 'yes', pharmacotherapy_goals_not_met: 'yes', adherence: 'at_risk', physical_activity: 'sedentary', tobacco: 'current',
    });
    expect(r.blocks).toEqual({ demographic: 2, clinical: 6, pharmacotherapy: 7, sociosanitary: 3 });
    expect(r).toMatchObject({ totalScore: 18, priority: 2 });
  });
  it('caso clínico 5 del documento: 17 puntos (límite), Prioridad 2', () => {
    const r = computeCmo(def, {
      ...NONE, age_group: '70_plus', base_cv_pathology: 'yes', non_cv_comorbidity: 'yes', hypertension: 'yes',
      regimen_complexity: 'yes', high_risk_medication: 'yes', polypharmacy: '10_plus', adherence: 'at_risk', physical_activity: 'sedentary', tobacco: 'former_5y',
    });
    expect(r.blocks).toEqual({ demographic: 3, clinical: 4, pharmacotherapy: 8, sociosanitary: 2 });
    expect(r).toMatchObject({ totalScore: 17, priority: 2 });
  });
  it('comorbilidad CV y combinaciones IC son aditivas (necesario para el máximo clínico de 20)', () => {
    const r = computeCmo(def, { ...NONE, cv_comorbidity: 'yes', hf_ischemic_combination: 'yes', hf_af_combination: 'yes' });
    expect(r.blocks.clinical).toBe(8);
  });
  it('embarazo: Prioridad 1 con independencia de la puntuación', () => {
    const r = computeCmo(def, { ...NONE, pregnancy: 'yes' });
    expect(r).toMatchObject({ totalScore: 0, scorePriority: 3, priority: 1, appliedExceptions: ['pregnancy'] });
  });
  it('menor de 18 años: modelo no aplicable (modelo pediátrico)', () => {
    expect(computeCmo(def, { ...NONE, age_group: 'under_18' })).toMatchObject({ priority: null, excluded: expect.stringContaining('pediátrico') });
  });
  it('sin imputación: una variable sin responder impide asignar prioridad', () => {
    const inputs: Record<string, string | null> = { ...NONE, tobacco: null };
    expect(computeCmo(def, inputs)).toMatchObject({ priority: null, missing: ['tobacco'] });
  });
  it('máximo absoluto: 42 puntos', () => {
    const all = Object.fromEntries(def.variables.map((v) => [v.code, v.options.reduce((a, b) => (b.points >= a.points && !b.excludes ? b : a)).value]));
    expect(computeCmo(def, all).totalScore).toBe(42);
  });
  it('el modelo cargado como borrador no es utilizable hasta su validación', () => {
    expect(assertModelUsable({ version: def.version, status: 'draft', definition: def }).usable).toBe(false);
  });
});

describe('Catálogo de actuaciones (Tablas 5-7) y migración', () => {
  it('actuaciones acumulativas: P3 ⊂ P2 ⊂ P1', () => {
    const p1 = catalogForPriority(actions, 1).map((a) => a.code);
    const p2 = catalogForPriority(actions, 2).map((a) => a.code);
    const p3 = catalogForPriority(actions, 3).map((a) => a.code);
    expect(p3.every((c) => p2.includes(c)) && p2.every((c) => p1.includes(c))).toBe(true);
    expect([p3.length, p2.length, p1.length]).toEqual([17, 21, 29]);
  });
  it('la migración 07 contiene exactamente la misma definición y el mismo catálogo que la aplicación', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261105200000_carmo_cmo_cardio_model.sql', import.meta.url), 'utf8');
    const defJson = sql.match(/\$cmo_definition\$([\s\S]*?)\$cmo_definition\$/)?.[1];
    const actJson = sql.match(/\$cmo_actions\$([\s\S]*?)\$cmo_actions\$/)?.[1];
    expect(JSON.parse(defJson!)).toEqual(model);
    expect(JSON.parse(actJson!)).toEqual(actions);
  });
});
