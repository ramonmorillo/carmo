import { describe, expect, it } from 'vitest';
import { runResearchExport } from '../src/services/researchExport/bundle';
import { STANDARD_DIALECT, parseCsv } from '../src/services/researchExport/csv';
import { TABLE_REQUESTS } from '../src/services/researchExport/datasets';
import { readZip } from '../src/services/researchExport/zip';
import type { DataSource } from '../src/services/researchExport/reader';

const P1 = 'p1', P2 = 'p2', VB = 'vb', VF = 'vf';
const iex = (v: number) => Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i + 1), v]));
const obs = (id: string, visit: string, code: string, value: number, unit: string, supersedes: string | null = null) => ({
  id, patient_id: P1, visit_id: visit, variable_code: code, variable_definition_version: 1, value_numeric: value, value_boolean: null, value_text: null,
  value_date: null, unit, is_missing: false, missing_reason: null, observed_date: '2026-01-10', data_source: 'lab_report', temporal_context: 'baseline',
  supersedes_id: supersedes, correction_reason: supersedes ? 'corrección' : null, recorded_at: '2026-01-10T10:00:00Z',
});

function fixture(): Record<string, Record<string, unknown>[]> {
  return {
    carmo_centers: [{ id: 'c1', code: 'CA', name: 'Centro A', study_number: 1, participation_status: 'authorized', is_active: true }],
    carmo_patients: [
      { id: P1, center_id: 'c1', screening_code: 'SEL-001-001', study_code: '001-01', inclusion_seq: 1, status: 'completed', status_reason: null, screening_date: '2026-01-01', inclusion_date: '2026-01-02', is_synthetic: true, eligibility_set_id: 's', created_at: '2026-01-01T00:00:00Z' },
      { id: P2, center_id: 'c1', screening_code: 'SEL-001-002', study_code: '001-02', inclusion_seq: 2, status: 'included', status_reason: null, screening_date: '2026-01-01', inclusion_date: '2026-01-02', is_synthetic: true, eligibility_set_id: 's', created_at: '2026-01-01T00:00:00Z' },
    ],
    carmo_consents: [],
    carmo_visits: [
      { id: VB, patient_id: P1, visit_code: 'BASAL', planned_date: '2026-01-02', actual_date: '2026-01-10', status: 'done', modality: 'in_person', responsible_id: 'u', record_state: 'closed', revision: 3 },
      { id: VF, patient_id: P1, visit_code: 'FINAL', planned_date: '2027-01-02', actual_date: '2027-01-05', status: 'done', modality: 'phone', responsible_id: 'u', record_state: 'draft', revision: 1 },
    ],
    carmo_visit_windows: [
      { visit_id: VB, window_start: '2026-01-02', window_end: '2026-01-29', window_status: 'in_window', deviation_days: 8 },
      { visit_id: VF, window_start: '2026-12-05', window_end: '2027-01-30', window_status: 'in_window', deviation_days: 3 },
    ],
    carmo_variables: [{ code: 'ldl_c', section: 'laboratory', label: 'LDL-c', value_type: 'numeric', status: 'provisional', definition_version: 1, source_reference: 'x' }],
    carmo_observations: [
      obs('o1', VB, 'ldl_c', 150, 'mg/dL'), obs('o2', VB, 'ldl_c', 140, 'mg/dL', 'o1'), obs('o3', VF, 'ldl_c', 70, 'mg/dL'),
      obs('o4', VB, 'weight', 80, 'kg'), obs('o5', VB, 'height', 175, 'cm'),
    ],
    carmo_questionnaire_administrations: [
      { id: 'q1', visit_id: VB, patient_id: P1, instrument_code: 'IEXPAC', instrument_version: 'IEXPAC-11', status: 'completed', not_done_reason: null, administration_mode: 'self', data_source: 'paper', administration_date: '2026-01-10', responses: iex(3), items_answered: 11, scores: { global: 4.5455, sum: 33, valid: true }, scoring_version: 'carmo-iexpac-1', evaluator_role: 'external_evaluator', revision: 1 },
      { id: 'q2', visit_id: VF, patient_id: P1, instrument_code: 'IEXPAC', instrument_version: 'IEXPAC-11', status: 'completed', not_done_reason: null, administration_mode: 'self', data_source: 'paper', administration_date: '2027-01-05', responses: iex(4), items_answered: 11, scores: { global: 7.2727, sum: 44, valid: true }, scoring_version: 'carmo-iexpac-1', evaluator_role: 'external_evaluator', revision: 1 },
    ],
    carmo_treatments: [], carmo_treatment_events: [], carmo_dispensations: [], carmo_interventions: [], carmo_stratifications: [], carmo_deviations: [],
  };
}

function memorySource(db: Record<string, Record<string, unknown>[]>, opts: { dropFrom?: string } = {}): DataSource {
  return {
    async count(table) { return db[table].length; },
    async page(request, from, to) {
      const rows = [...db[request.table]].sort((a, b) => String(a[request.orderBy]).localeCompare(String(b[request.orderBy])));
      const page = rows.slice(from, to + 1);
      return opts.dropFrom === request.table ? page.slice(1) : page;
    },
  };
}

const options = { dialect: STANDARD_DIALECT, bom: false, appVersion: 'test', userId: null, now: new Date('2027-02-01T10:00:00Z') };

function csvOf(zip: Uint8Array, path: string): string[][] {
  const entry = readZip(zip).find((e) => e.path === path);
  if (!entry) throw new Error(`falta ${path}`);
  return parseCsv(new TextDecoder().decode(entry.data), ',');
}

describe('exportación de investigación', () => {
  it('cubre todas las tablas fuente declaradas', () => {
    expect(Object.keys(fixture()).sort()).toEqual(Object.values(TABLE_REQUESTS).map((r) => r.table).sort());
  });

  it('G5: no omite registros válidos y concilia recuentos', async () => {
    const db = fixture();
    const bundle = await runResearchExport(memorySource(db), options);
    for (const t of bundle.manifest.source_tables) expect(t.db_count).toBe(t.exported_rows);
    expect(csvOf(bundle.zip, 'raw/carmo_observations.csv')).toHaveLength(1 + db.carmo_observations.length);
    expect(csvOf(bundle.zip, 'raw/carmo_patients.csv')).toHaveLength(3);
    const files = readZip(bundle.zip).map((e) => e.path);
    expect(files).toEqual(expect.arrayContaining(['manifest.json', 'diccionario_variables.csv', 'carmo_export.xlsx', 'raw/carmo_patients.sps', 'analisis/longitudinal_pareado.csv']));
  });

  it('una lectura incompleta aborta la exportación (nunca se entrega como completa)', async () => {
    await expect(runResearchExport(memorySource(fixture(), { dropFrom: 'carmo_observations' }), options)).rejects.toThrow(/incompleta|Exportación/);
  });

  it('dataset pareado: valor vigente tras corrección, IEXPAC emparejado e IMC derivado, sin imputar', async () => {
    const bundle = await runResearchExport(memorySource(fixture()), options);
    const [header, ...rows] = csvOf(bundle.zip, 'analisis/longitudinal_pareado.csv');
    const r1 = Object.fromEntries(header.map((h, i) => [h, rows.find((r) => r[0] === '001-01')![i]]));
    expect(r1).toMatchObject({ iexpac_basal: '4.5455', iexpac_final: '7.2727', iexpac_dif: '2.7272', ldl_c_basal: '140', ldl_c_final: '70', ldl_c_dif: '-70', imc_basal: '26.1', imc_final: '' });
    const r2 = Object.fromEntries(header.map((h, i) => [h, rows.find((r) => r[0] === '001-02')![i]]));
    expect(r2.iexpac_basal).toBe('');
    expect(r2.iexpac_dif).toBe('');
    const [ph, ...prows] = csvOf(bundle.zip, 'analisis/pacientes.csv');
    const col = (n: string) => prows.map((r) => r[ph.indexOf(n)]);
    expect(col('pob_iexpac_pareada')).toEqual(['1', '0']);
    expect(col('pob_itt')).toEqual(['1', '1']);
    expect(col('pob_pp')).toEqual(['1', '0']);
  });

  it('los datos originales no se modifican al exportar', async () => {
    const db = fixture();
    const before = JSON.stringify(db);
    await runResearchExport(memorySource(db), options);
    expect(JSON.stringify(db)).toBe(before);
  });

  it('señala datos sintéticos y pacientes sin visita basal', async () => {
    const bundle = await runResearchExport(memorySource(fixture()), options);
    const [, ...issues] = csvOf(bundle.zip, 'analisis/incidencias_integridad.csv');
    expect(issues.map((r) => r[0])).toEqual(expect.arrayContaining(['datos_sinteticos', 'sin_visita_basal']));
  });
});
