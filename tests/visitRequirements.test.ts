import { describe, expect, it } from 'vitest';

import { blockingBeforeClose, completeness, stratAt, visitRequirements, type VisitContext } from '../src/domain/visitRequirements';

const vars = [
  { code: 'ldl_c', label: 'cLDL', section: 'laboratory', allowed_visits: ['BASAL', 'S12', 'FINAL'], status: 'active' },
  { code: 'weight', label: 'Peso', section: 'anthropometric', allowed_visits: ['BASAL', 'FINAL'], status: 'active' },
  { code: 'mi', label: 'IAM', section: 'cv_event', allowed_visits: ['BASAL', 'S12', 'FINAL'], status: 'active' },
];
const instruments = [
  { code: 'IEXPAC', status: 'active', allowed_visits: ['BASAL', 'FINAL'] },
  { code: 'EQ5D5L', status: 'retired', allowed_visits: ['BASAL', 'FINAL'] },
];
const base = { id: 'v1', visit_code: 'BASAL', status: 'done', actual_date: '2026-10-01', planned_date: '2026-10-01', modality: 'in_person', responsible_id: 'u', record_state: 'draft' };
const ctx = (over: Partial<VisitContext> = {}): VisitContext => ({
  variables: vars, observations: [], administrations: [], instruments, stratifications: [], interventionCount: 0, review: null,
  followUp: { 1: { restratifyMonths: 6 }, 2: { restratifyMonths: 12 }, 3: { restratifyMonths: null } }, today: '2026-11-06', ...over,
});
const obs = (code: string, visit = 'v1') => ({ id: `${code}-${visit}`, supersedes_id: null, visit_id: visit, variable_code: code, value_boolean: null, is_missing: false });
const by = (r: ReturnType<typeof visitRequirements>, k: string) => r.find((x) => x.key === k)!;

describe('lo necesario en cada visita', () => {
  it('visita inicial vacía: todo lo obligatorio pendiente, sin eventos CV ni instrumentos retirados', () => {
    const r = visitRequirements(base, ctx());
    expect(by(r, 'variables')).toMatchObject({ status: 'pending' });
    expect(by(r, 'variables').detail).toContain('0/2');
    expect(by(r, 'variables').detail).not.toContain('IAM');
    expect(by(r, 'medicacion').status).toBe('pending');
    expect(by(r, 'cmo').detail).toContain('visita inicial');
    expect(by(r, 'cuestionarios').detail).toBe('Pendientes: IEXPAC.');
    expect(by(r, 'intervenciones').status).toBe('recommended');
    expect(blockingBeforeClose(r).map((x) => x.key)).toEqual(['variables', 'medicacion', 'cmo', 'cuestionarios']);
  });
  it('visita inicial completa', () => {
    const r = visitRequirements(base, ctx({
      observations: [obs('ldl_c'), obs('weight')], review: { visit_id: 'v1', outcome: 'no_changes' }, interventionCount: 2,
      administrations: [{ visit_id: 'v1', instrument_code: 'IEXPAC', status: 'completed', scores: { valid: true } }],
      stratifications: [{ id: 's1', visit_id: 'v1', supersedes_id: null, validation_status: 'confirmed', calculated_priority: 2, final_priority: 2, total_score: 18, calculated_at: '2026-10-01T10:00:00Z', validated_at: '2026-10-01T11:00:00Z' }],
    }));
    expect(blockingBeforeClose(r)).toEqual([]);
    expect(completeness(r)).toEqual({ done: 6, required: 7 });
  });
  it('cuestionario completado con ítems sin responder sigue pendiente; «no realizado» con motivo cuenta como resuelto', () => {
    expect(by(visitRequirements(base, ctx({ administrations: [{ visit_id: 'v1', instrument_code: 'IEXPAC', status: 'completed', scores: { valid: false } }] })), 'cuestionarios').status).toBe('pending');
    expect(by(visitRequirements(base, ctx({ administrations: [{ visit_id: 'v1', instrument_code: 'IEXPAC', status: 'not_done', scores: null }] })), 'cuestionarios').status).toBe('done');
  });
  it('seguimiento: la reestratificación solo se exige si ha vencido según la prioridad', () => {
    const s = { id: 's1', visit_id: 'v1', supersedes_id: null, validation_status: 'confirmed', calculated_priority: 1, final_priority: 1, total_score: 25, calculated_at: '2026-01-10T10:00:00Z', validated_at: '2026-01-10T10:00:00Z' };
    const s12 = { ...base, id: 'v2', visit_code: 'S12', actual_date: '2026-04-05' };
    expect(by(visitRequirements(s12, ctx({ stratifications: [s] })), 'cmo').status).toBe('not_applicable');
    const s36 = { ...base, id: 'v3', visit_code: 'S36', actual_date: '2026-09-20' };
    expect(by(visitRequirements(s36, ctx({ stratifications: [s] })), 'cmo')).toMatchObject({ status: 'pending' });
    expect(by(visitRequirements(s36, ctx({ stratifications: [s] })), 'cmo').detail).toContain('2026-07-10');
  });
  it('contacto extraordinario: medicación opcional; visita anulada: nada procede salvo los datos', () => {
    expect(by(visitRequirements({ ...base, visit_code: 'EXTRA' }, ctx()), 'medicacion').status).toBe('optional');
    const r = visitRequirements({ ...base, status: 'cancelled' }, ctx());
    expect(r.filter((x) => x.status === 'not_applicable').map((x) => x.key)).toEqual(['variables', 'medicacion', 'cmo', 'intervenciones', 'cuestionarios', 'evolucion']);
    expect(by(r, 'datos').status).toBe('done');
  });
  it('datos de la visita: exige fecha efectiva, modalidad y responsable', () => {
    expect(by(visitRequirements({ ...base, modality: null, responsible_id: null }, ctx()), 'datos').detail).toBe('Falta: modalidad, profesional responsable.');
    expect(by(visitRequirements({ ...base, status: 'planned', actual_date: null }, ctx()), 'datos').detail).toContain('estado «realizada»');
  });
  it('estratificación vigente en una fecha', () => {
    const a = { id: 'a', visit_id: 'v', supersedes_id: null, validation_status: 'confirmed', calculated_priority: 3, final_priority: null, total_score: 10, calculated_at: '2026-01-01T00:00:00Z', validated_at: null };
    const b = { ...a, id: 'b', calculated_at: '2026-06-01T00:00:00Z' };
    expect(stratAt([a, b], '2026-03-01')?.id).toBe('a');
    expect(stratAt([a, b], '2026-07-01')?.id).toBe('b');
    expect(stratAt([a, b], '2025-12-01')).toBeNull();
  });
});
