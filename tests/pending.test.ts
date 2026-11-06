import { describe, expect, it } from 'vitest';
import { auditDiff, computePending, expectedVariables } from '../src/domain/pending';

const vars = [
  { code: 'weight', label: 'Peso', section: 'anthropometric', allowed_visits: ['BASAL', 'FINAL'], status: 'provisional' },
  { code: 'tobacco_use', label: 'Consumo de tabaco', section: 'cv_risk_factor', allowed_visits: ['BASAL', 'FINAL'], status: 'provisional' },
  { code: 'cigarettes_per_day', label: 'Cigarrillos', section: 'cv_risk_factor', allowed_visits: ['BASAL', 'FINAL'], status: 'provisional' },
  { code: 'years_since_quitting', label: 'Años sin fumar', section: 'cv_risk_factor', allowed_visits: ['BASAL', 'FINAL'], status: 'provisional' },
  { code: 'ami', label: 'IAM', section: 'cv_event', allowed_visits: ['BASAL', 'S12', 'FINAL'], status: 'provisional' },
  { code: 'age_years', label: 'Edad', section: 'demographic', allowed_visits: ['BASAL'], status: 'provisional' },
];
const instruments = [
  { code: 'IEXPAC', status: 'active', allowed_visits: ['BASAL', 'FINAL'] },
  { code: 'MORISKY_GREEN', status: 'active', allowed_visits: ['BASAL', 'S24', 'FINAL'] },
  { code: 'EQ5D5L', status: 'retired', allowed_visits: ['BASAL', 'FINAL'] },
];
const obs = (id: string, visit: string, code: string, b: boolean | null = null) => ({ id, supersedes_id: null, visit_id: visit, variable_code: code, value_boolean: b, is_missing: false });
const base = { variables: vars, instruments, deviations: [], followUp: { 1: { restratifyMonths: 6 }, 2: { restratifyMonths: 12 }, 3: { restratifyMonths: null } }, today: '2026-11-05' };

describe('variables esperadas por visita', () => {
  it('excluye eventos CV y condicionales de tabaco no aplicables', () => {
    expect(expectedVariables(vars, 'BASAL', false).map((v) => v.code)).toEqual(['weight', 'tobacco_use', 'age_years']);
    expect(expectedVariables(vars, 'BASAL', true).map((v) => v.code)).toEqual(['weight', 'tobacco_use', 'cigarettes_per_day', 'age_years']);
    expect(expectedVariables(vars, 'S12', null)).toEqual([]);
  });
});

describe('datos pendientes del paciente', () => {
  it('medicación sin revisar en visitas programadas realizadas (no en contactos extraordinarios)', () => {
    const visits = [
      { id: 'b', visit_code: 'BASAL', status: 'done', planned_date: '2026-10-01', record_state: 'closed' },
      { id: 'x', visit_code: 'EXTRA', status: 'done', planned_date: '2026-10-10', record_state: 'closed' },
    ];
    const args = { ...base, variables: [], instruments: [], patientStatus: 'included', visits, observations: [], administrations: [],
      stratifications: [{ id: 's', visit_id: 'b', supersedes_id: null, validation_status: 'confirmed', calculated_priority: 3, final_priority: 3, calculated_at: '2026-10-01', validated_at: '2026-10-01' }] };
    expect(computePending({ ...args, medicationReviewedVisitIds: [] }).map((i) => [i.kind, i.visitId])).toEqual([['medication', 'b']]);
    expect(computePending({ ...args, medicationReviewedVisitIds: ['b'] })).toEqual([]);
    expect(computePending(args)).toEqual([]);
  });
  it('candidato en cribado: nada pendiente aquí (lo gestiona la inclusión)', () => {
    expect(computePending({ ...base, patientStatus: 'screening', visits: [], observations: [], administrations: [], stratifications: [] })).toEqual([]);
  });
  it('incluido sin visita inicial realizada; visitas vencidas', () => {
    const r = computePending({ ...base, patientStatus: 'included', observations: [], administrations: [], stratifications: [],
      visits: [{ id: 'b', visit_code: 'BASAL', status: 'planned', planned_date: '2026-10-01', record_state: 'draft' }] });
    expect(r.map((i) => i.kind)).toEqual(['missing_data', 'overdue']);
  });
  it('visita inicial realizada: variables, cuestionarios, estratificación y cierre', () => {
    const r = computePending({ ...base, patientStatus: 'included',
      visits: [{ id: 'b', visit_code: 'BASAL', status: 'done', planned_date: '2026-10-01', record_state: 'draft' }],
      observations: [obs('o1', 'b', 'weight'), obs('o2', 'b', 'tobacco_use', true)],
      administrations: [{ visit_id: 'b', instrument_code: 'IEXPAC', status: 'completed', scores: { valid: false } }],
      stratifications: [] });
    const msgs = r.map((i) => i.message);
    expect(msgs).toContain('Visita inicial: 2 variable(s) sin registrar (Cigarrillos, Edad)');
    expect(msgs).toContain('Visita inicial: IEXPAC completado con ítems sin responder (sin resultado)');
    expect(msgs).toContain('Visita inicial: MORISKY_GREEN pendiente');
    expect(msgs.some((m) => m.includes('EQ5D5L'))).toBe(false);
    expect(msgs).toContain('Estratificación CMO de la visita inicial pendiente (esquema del protocolo)');
    expect(r.some((i) => i.kind === 'to_close')).toBe(true);
  });
  it('estratificación pendiente de validar y reestratificación vencida según la prioridad vigente', () => {
    const r = computePending({ ...base, patientStatus: 'included', observations: [], administrations: [],
      visits: [{ id: 'b', visit_code: 'BASAL', status: 'planned', planned_date: '2026-12-01', record_state: 'draft' }],
      stratifications: [
        { id: 's1', visit_id: 'b', supersedes_id: null, validation_status: 'modified', calculated_priority: 2, final_priority: 1, calculated_at: '2026-01-10T10:00:00Z', validated_at: '2026-01-11T10:00:00Z' },
      ] });
    expect(r.find((i) => i.kind === 'stratification')?.message).toBe('Reestratificación vencida (Prioridad 1: cada 6 meses; vencía el 2026-07-11)');
  });
  it('un paciente finalizado no genera vencimientos', () => {
    const r = computePending({ ...base, patientStatus: 'completed', observations: [], administrations: [], stratifications: [],
      visits: [{ id: 's', visit_code: 'S12', status: 'planned', planned_date: '2026-01-01', record_state: 'draft' }] });
    expect(r.some((i) => i.kind === 'overdue')).toBe(false);
  });
});

describe('historial de cambios (auditoría)', () => {
  it('muestra solo los campos que cambian, sin campos técnicos', () => {
    expect(auditDiff({ a: 1, b: 'x', updated_at: '1', revision: 1 }, { a: 2, b: 'x', updated_at: '2', revision: 2 })).toEqual([{ field: 'a', before: 1, after: 2 }]);
    expect(auditDiff(null, { a: 1 })).toEqual([]);
  });
});
