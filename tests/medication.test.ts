import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  activeIngredientFromCima, DOSE_UNITS, FREQUENCY_LABELS, isStudyDrug, ROUTE_LABELS, routeCodeFromCima, routeOptions, treatmentPayload, type CimaDto,
} from '../src/domain/medication';

const MIGRATION = readFileSync('supabase/migrations/20261106100000_carmo_cima_medication_visit_review.sql', 'utf8');

const repatha: CimaDto = {
  id: '115016001', cima_cn: '709551', cima_nregistro: '115016001', cima_name: 'REPATHA 140 MG SOLUCION INYECTABLE EN PLUMA PRECARGADA',
  ingredient_names: ['EVOLOCUMAB'], labtitular: 'Amgen Europe B.V.', pharmaceutical_form: 'SOLUCIÓN INYECTABLE EN PLUMA PRECARGADA',
  routes: ['VÍA SUBCUTÁNEA'], atc_codes: ['C10AX13', 'C10AX'], authorization_status: 'autorizado', commercialized: true, dose: '140 mg', fetched_at: '2026-11-06T10:00:00Z',
};

describe('vocabularios cerrados idénticos a la BD (migración 09)', () => {
  it('pautas: mismas claves y etiquetas que carmo_private.frequency_label', () => {
    for (const [code, label] of Object.entries(FREQUENCY_LABELS)) expect(MIGRATION).toContain(`when '${code}' then '${label}'`);
    expect((MIGRATION.match(/when '[a-z0-9]+' then '/g) ?? []).length).toBe(Object.keys(FREQUENCY_LABELS).length);
  });
  it('unidades: misma lista que carmo_private.dose_unit_allowed', () => {
    expect(MIGRATION).toContain(`p_unit in (${DOSE_UNITS.map((u) => `'${u}'`).join(', ')})`);
  });
  it('vías: mismas que la restricción carmo_treatments_route_check', () => {
    const m = MIGRATION.match(/check \(route in \(([^)]+)\)\)/);
    expect(m?.[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort()).toEqual(Object.keys(ROUTE_LABELS).sort());
  });
});

describe('medicamento de CIMA → registro de CARMO', () => {
  it('reconoce los tratamientos principales del estudio con su nombre canónico', () => {
    expect(activeIngredientFromCima(repatha)).toBe('Evolocumab');
    expect(activeIngredientFromCima({ ingredient_names: ['INCLISIRAN SODICO'], cima_name: 'LEQVIO 284 MG' })).toBe('Inclisirán');
    expect(isStudyDrug({ ingredient_names: ['ALIROCUMAB'], cima_name: 'PRALUENT' })).toBe(true);
    expect(isStudyDrug({ ingredient_names: ['ATORVASTATINA CALCICA TRIHIDRATO'], cima_name: 'ATORVASTATINA 40 MG' })).toBe(false);
  });
  it('concomitantes: principios activos de CIMA unidos', () => {
    expect(activeIngredientFromCima({ ingredient_names: ['EZETIMIBA', 'ROSUVASTATINA'], cima_name: 'X' })).toBe('EZETIMIBA + ROSUVASTATINA');
    expect(activeIngredientFromCima({ ingredient_names: [], cima_name: 'NOMBRE' })).toBe('NOMBRE');
  });
  it('vías de CIMA → códigos de CARMO', () => {
    expect(routeCodeFromCima('VÍA SUBCUTÁNEA')).toBe('subcutaneous');
    expect(routeCodeFromCima('VÍA ORAL')).toBe('oral');
    expect(routeCodeFromCima('VÍA INTRAVENOSA')).toBe('intravenous');
    expect(routeCodeFromCima('USO CUTÁNEO')).toBe('topical');
    expect(routeCodeFromCima('VÍA INHALATORIA')).toBe('inhalation');
    expect(routeCodeFromCima('VÍA OFTÁLMICA')).toBe('other');
    expect(routeOptions({ routes: [] })).toEqual(['other']);
    expect(routeOptions({ routes: ['VÍA ORAL', 'VÍA ORAL'] })).toEqual(['oral']);
  });
  it('carga útil: datos de CIMA, ATC de nivel 5, pauta codificada y visita', () => {
    const p = treatmentPayload(repatha, { dose_amount: '140', dose_unit: 'mg', frequency_code: 'q2w', route: 'subcutaneous', start_date: '2026-10-01' }, 'pat', 'vis');
    expect(p).toMatchObject({ patient_id: 'pat', visit_id: 'vis', active_ingredient: 'Evolocumab', cima_nregistro: '115016001', cima_cn: '709551', atc_code: 'C10AX13', dose_amount: 140, dose_unit: 'mg', frequency_code: 'q2w', route: 'subcutaneous' });
    expect((p.cima_snapshot as Record<string, unknown>).laboratorio).toBe('Amgen Europe B.V.');
  });
  it('sin dosis no se envía unidad; validaciones previas al guardado', () => {
    const p = treatmentPayload(repatha, { dose_amount: '', dose_unit: 'mg', frequency_code: 'q2w', route: 'subcutaneous', start_date: '2026-10-01' }, 'pat', null);
    expect(p.dose_amount).toBeNull();
    expect(p.dose_unit).toBeNull();
    expect(() => treatmentPayload({ ...repatha, cima_nregistro: null }, { dose_amount: '', dose_unit: '', frequency_code: 'q2w', route: 'oral', start_date: 'x' }, 'p', null)).toThrow(/registro/);
    expect(() => treatmentPayload(repatha, { dose_amount: '1', dose_unit: '', frequency_code: 'q2w', route: 'oral', start_date: 'x' }, 'p', null)).toThrow(/unidad/);
    expect(() => treatmentPayload(repatha, { dose_amount: '1', dose_unit: 'mg', frequency_code: 'cada tanto', route: 'oral', start_date: 'x' }, 'p', null)).toThrow(/pauta/);
  });
});

describe('polimedicación para el modelo CMO', () => {
  const t = (over: Record<string, unknown>) => ({ status: 'active', active_ingredient: 'X', frequency_code: 'q24h', cima_snapshot: null, ...over });
  it('cuenta principios activos distintos de tratamientos activos y crónicos', async () => {
    const { chronicActiveIngredients } = await import('../src/domain/medication');
    const list = chronicActiveIngredients([
      t({ active_ingredient: 'EZETIMIBA + ROSUVASTATINA', cima_snapshot: { principios_activos: ['EZETIMIBA', 'ROSUVASTATINA'] } }),
      t({ active_ingredient: 'Evolocumab', cima_snapshot: { principios_activos: ['EVOLOCUMAB'] }, frequency_code: 'q2w' }),
      t({ active_ingredient: 'ROSUVASTATINA', cima_snapshot: { principios_activos: ['Rosuvastatina'] } }),
      t({ active_ingredient: 'NITROGLICERINA', frequency_code: 'prn' }),
      t({ active_ingredient: 'ÁCIDO ACETILSALICÍLICO', status: 'suspended' }),
      t({ active_ingredient: 'Atorvastatina', status: 'finished' }),
      t({ active_ingredient: 'Enalapril', frequency_code: null }),
    ]);
    expect(list).toEqual(['enalapril', 'evolocumab', 'ezetimiba', 'rosuvastatina']);
  });
});

describe('medicación vigente en la fecha de una visita', () => {
  it('incluye lo iniciado antes y no finalizado; marca la suspensión vigente en esa fecha', async () => {
    const { medicationAtDate } = await import('../src/domain/medication');
    const trts = [
      { id: 'a', start_date: '2026-01-01', end_date: null },
      { id: 'b', start_date: '2026-03-01', end_date: null },
      { id: 'c', start_date: '2025-06-01', end_date: '2026-01-15' },
      { id: 'd', start_date: '2025-06-01', end_date: '2026-02-01' },
    ];
    const evts = [
      { treatment_id: 'a', event_type: 'suspension', event_date: '2026-01-20' },
      { treatment_id: 'a', event_type: 'restart', event_date: '2026-02-10' },
    ];
    const at = (d: string) => medicationAtDate(trts, evts, d).map((t) => `${t.id}${t.suspendedAtDate ? '(s)' : ''}`);
    expect(at('2026-02-01')).toEqual(['a(s)', 'd']);
    expect(at('2026-02-15')).toEqual(['a']);
    expect(at('2026-03-01')).toEqual(['a', 'b']);
  });
});
