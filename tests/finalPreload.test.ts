import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { confirmationPayload, pendingPreload, PRELOADABLE_VARIABLES, preloadAvailability, REQUIRES_NEW_MEASUREMENT, type PreloadRow } from '../src/domain/finalPreload';

const visit = (code: string, status = 'done', actual: string | null = '2026-11-08', record = 'draft') => ({ id: code, visit_code: code, status, actual_date: actual, record_state: record });
const preload = (over: Partial<PreloadRow>): PreloadRow => ({
  id: 'p', patient_id: 'pt', visit_id: 'f', variable_code: 'diabetes', source_observation_id: 'o', value_numeric: null, value_boolean: true, value_text: null,
  value_date: null, unit: null, status: 'pending_verification', resolved_observation_id: null, created_at: '2027-11-01T00:00:00Z', resolved_at: null, ...over,
});

describe('precarga de la visita final', () => {
  it('la lista de variables precargables coincide con la de la base de datos', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261123120000_carmo_final_visit_preload.sql', import.meta.url), 'utf8');
    const list = /v_codes constant text\[\] := array\[([^\]]+)\]/.exec(sql)?.[1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(list).toEqual([...PRELOADABLE_VARIABLES]);
    for (const code of REQUIRES_NEW_MEASUREMENT) expect(PRELOADABLE_VARIABLES).not.toContain(code);
  });

  it('se habilita solo en una visita final editable con visita inicial válida', () => {
    const all = [visit('BASAL'), visit('FINAL', 'planned', null)];
    expect(preloadAvailability(all[1], all, true)).toEqual({ enabled: true, reason: null });
    expect(preloadAvailability(visit('S12'), all, true).enabled).toBe(false);
    expect(preloadAvailability(all[1], all, false).enabled).toBe(false);
    expect(preloadAvailability(visit('FINAL', 'cancelled'), all, true).enabled).toBe(false);
    expect(preloadAvailability(visit('FINAL', 'done', '2027-11-01', 'closed'), all, true).reason).toContain('cerrada');
    expect(preloadAvailability(all[1], [visit('BASAL', 'planned', null), all[1]], true).reason).toContain('visita inicial');
    expect(preloadAvailability(all[1], [visit('BASAL', 'cancelled'), all[1]], true).enabled).toBe(false);
  });

  it('solo hay una precarga pendiente por variable; las resueltas no cuentan como pendientes', () => {
    const rows = [preload({}), preload({ id: 'q', variable_code: 'hypertension', status: 'confirmed', resolved_at: '2027-11-02T00:00:00Z' })];
    expect(pendingPreload(rows, 'diabetes')?.id).toBe('p');
    expect(pendingPreload(rows, 'hypertension')).toBeNull();
  });

  it('la confirmación copia el valor y su unidad, con fecha y origen elegidos al verificar (no copia la fecha basal)', () => {
    const num = confirmationPayload(preload({ variable_code: 'cigarettes_per_day', value_boolean: null, value_numeric: 10, unit: 'cig/día' }),
      { visitId: 'f', observedDate: '2027-11-05', dataSource: 'clinical_record', temporalContext: 'follow_up' });
    expect(num).toMatchObject({ variable_code: 'cigarettes_per_day', value_numeric: 10, unit: 'cig/día', observed_date: '2027-11-05', visit_id: 'f', is_missing: false });
    expect(num).not.toHaveProperty('value_boolean');
    const bool = confirmationPayload(preload({}), { visitId: 'f', observedDate: '2027-11-05', dataSource: 'clinical_record', temporalContext: 'follow_up' });
    expect(bool).toMatchObject({ value_boolean: true });
    expect(bool).not.toHaveProperty('unit');
  });
});
