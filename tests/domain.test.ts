import { describe, expect, it } from 'vitest';
import { addDaysIso, isOverdue, windowStatus } from '../src/domain/schedule';
import { correctionChain, currentObservations, deriveBmi, numericChange } from '../src/domain/observations';
import { assertModelUsable, computeCmo, validateDefinition, type CmoModelDefinition } from '../src/domain/cmoEngine';
import { createSaveGuard } from '../src/domain/saveGuard';

describe('calendario', () => {
  it('fechas previstas y ventanas', () => {
    expect(addDaysIso('2026-01-31', 84)).toBe('2026-04-25');
    expect(windowStatus({ isExtra: false, plannedDate: '2027-01-01', actualDate: '2027-01-29', before: 28, after: 28 })).toBe('in_window');
    expect(windowStatus({ isExtra: false, plannedDate: '2027-01-01', actualDate: '2027-01-30', before: 28, after: 28 })).toBe('out_of_window');
    expect(windowStatus({ isExtra: false, plannedDate: '2026-04-25', actualDate: '2026-05-30', before: null, after: null })).toBe('window_undefined');
    expect(windowStatus({ isExtra: true, plannedDate: null, actualDate: '2026-05-30', before: null, after: null })).toBe('not_applicable');
    expect(isOverdue('2026-01-01', 'planned', '2026-02-01')).toBe(true);
    expect(isOverdue('2026-01-01', 'done', '2026-02-01')).toBe(false);
  });
});

describe('observaciones de solo-adición', () => {
  const rows = [
    { id: 'a', supersedes_id: null }, { id: 'b', supersedes_id: 'a' }, { id: 'c', supersedes_id: 'b' }, { id: 'x', supersedes_id: null },
  ];
  it('valor vigente y cadena de correcciones conservada', () => {
    expect(currentObservations(rows).map((r) => r.id)).toEqual(['c', 'x']);
    expect(correctionChain(rows, 'c').map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
  it('IMC derivado reproducible y sin unidades ambiguas', () => {
    expect(deriveBmi({ value: 80, unit: 'kg' }, { value: 175, unit: 'cm' })).toBe(26.1);
    expect(deriveBmi({ value: 80, unit: 'kg' }, { value: 1.75, unit: 'm' })).toBeNull();
    expect(deriveBmi(undefined, { value: 175, unit: 'cm' })).toBeNull();
  });
  it('no compara unidades distintas ni convierte', () => {
    expect(numericChange({ value: 130, unit: 'mg/dL' }, { value: 70, unit: 'mg/dL' })).toMatchObject({ absolute: -60, comparable: true });
    expect(numericChange({ value: 130, unit: 'mg/dL' }, { value: 1.8, unit: 'mmol/L' })).toMatchObject({ absolute: null, reason: 'unit_mismatch' });
  });
});

// Modelo SINTÉTICO solo para probar el motor. NO es el modelo CMO cardiovascular ni se usa en clínica.
const TOY: CmoModelDefinition = {
  version: 'TOY-TEST',
  variables: [
    { code: 'v1', label: 'Variable ficticia 1', dimension: 'd1', options: [{ value: 'a', label: 'A', points: 0 }, { value: 'b', label: 'B', points: 3 }] },
    { code: 'v2', label: 'Variable ficticia 2', dimension: 'd2', options: [{ value: 'a', label: 'A', points: 1 }, { value: 'b', label: 'B', points: 4 }] },
  ],
  thresholds: { priority1Min: 6, priority2Min: 3 },
  exceptions: [{ id: 'EX1', description: 'Regla ficticia', when: { variable: 'v2', equals: 'b' }, forcePriority: 2 }],
};

describe('motor CMO genérico (sin reglas clínicas)', () => {
  it('bloquea modelos no validados', () => {
    expect(assertModelUsable(null).usable).toBe(false);
    expect(assertModelUsable({ version: 'X', status: 'draft', definition: TOY }).usable).toBe(false);
    expect(assertModelUsable({ version: 'X', status: 'validated', definition: TOY }).usable).toBe(true);
  });
  it('cálculo reproducible, desglose y reglas excepcionales', () => {
    const r1 = computeCmo(TOY, { v1: 'a', v2: 'a' });
    expect(r1).toMatchObject({ totalScore: 1, priority: 3 });
    const r2 = computeCmo(TOY, { v1: 'a', v2: 'b' });
    expect(r2).toMatchObject({ totalScore: 4, priority: 2, appliedExceptions: ['EX1'] });
    expect(computeCmo(TOY, { v1: 'b', v2: 'b' })).toMatchObject({ totalScore: 7, priority: 1 });
    expect(computeCmo(TOY, { v1: 'b', v2: 'b' })).toEqual(computeCmo(TOY, { v1: 'b', v2: 'b' }));
  });
  it('sin imputación: falta una variable → sin prioridad', () => {
    expect(computeCmo(TOY, { v1: 'b' })).toMatchObject({ priority: null, totalScore: null, missing: ['v2'] });
  });
  it('valida la definición y los valores', () => {
    expect(validateDefinition({ ...TOY, thresholds: { priority1Min: 2, priority2Min: 3 } })).not.toHaveLength(0);
    expect(() => computeCmo(TOY, { v1: 'z', v2: 'a' })).toThrow();
  });
});

describe('guardado seguro (G7)', () => {
  it('un fallo de red nunca se presenta como guardado', async () => {
    const save = createSaveGuard();
    expect((await save(async () => { throw new TypeError('Failed to fetch'); })).kind).toBe('network_error');
    expect((await save(async () => ({ data: null, error: { message: 'FetchError: network timeout' } }))).kind).toBe('network_error');
  });
  it('rechazo de la BD y 0 filas no son éxito', async () => {
    const save = createSaveGuard();
    expect((await save(async () => ({ data: null, error: { message: 'new row violates row-level security policy' } }))).kind).toBe('rejected');
    expect((await save(async () => ({ data: [], error: null }))).kind).toBe('rejected');
    expect((await save(async () => ({ data: [{ id: 1 }], error: null }))).kind).toBe('saved');
  });
  it('impide el doble envío', async () => {
    const save = createSaveGuard();
    let release!: () => void;
    const first = save(() => new Promise((resolve) => { release = () => resolve({ data: [{ id: 1 }], error: null }); }));
    expect((await save(async () => ({ data: [{ id: 2 }], error: null }))).kind).toBe('busy');
    release();
    expect((await first).kind).toBe('saved');
  });
});
