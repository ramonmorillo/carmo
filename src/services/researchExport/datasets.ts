// Conjuntos de exportación de CARMO (una sola fuente de verdad de columnas → CSV, SPSS, XLSX y
// diccionario). Las tablas raw reproducen lo almacenado; los conjuntos de análisis se derivan sin
// imputar ni alterar datos. Todo lo visible lo decide la RLS de quien exporta.

import { pairIexpac } from '../../domain/iexpac';
import { currentObservations, deriveBmi, numericChange } from '../../domain/observations';
import { CMO_ENGINE_VERSION } from '../../domain/cmoEngine';
import type { ColumnSpec, ColumnType, Dataset } from './spec';
import type { TableRequest } from './reader';

export const QUESTIONNAIRE_SCORING_VERSION = 'carmo-iexpac-1, carmo-eq5d3l-1 (perfil + EVA, sin índice), carmo-evasaf-1 (sin total), carmo-mg-1 (adherente = No-Sí-No-No) · carmo_private.questionnaire_scores';
export const STRATIFICATION_SCORING_VERSION = `${CMO_ENGINE_VERSION} + carmo_private.cmo_compute · modelo CMO-CV-SEFH-2024 (ver columna model_version)`;

type Row = Record<string, unknown>;
type RawCol = [name: string, type: ColumnType, label: string, values?: Record<string, string>];

const RAW_TABLES = {
  centers: { table: 'carmo_centers', title: 'Centros', grain: 'centro', cols: [
    ['id', 'string', 'Identificador interno del centro'], ['code', 'string', 'Código del centro'], ['name', 'string', 'Nombre'],
    ['study_number', 'integer', 'Número de estudio'], ['participation_status', 'string', 'Estado de participación'], ['is_active', 'boolean', 'Activo'],
  ] as RawCol[] },
  patients: { table: 'carmo_patients', title: 'Pacientes (tabla original)', grain: 'paciente', cols: [
    ['id', 'string', 'Identificador interno estable'], ['center_id', 'string', 'Centro (id)'], ['screening_code', 'string', 'Código de selección'],
    ['study_code', 'string', 'Código de paciente (protocolo)'], ['inclusion_seq', 'integer', 'Orden de inclusión en el centro'],
    ['status', 'string', 'Estado en el estudio'], ['status_reason', 'string', 'Motivo del estado'], ['screening_date', 'date', 'Fecha de cribado'],
    ['inclusion_date', 'date', 'Fecha de inclusión'], ['is_synthetic', 'boolean', 'Dato sintético (fase de validación)'], ['eligibility_set_id', 'string', 'Versión de criterios (id)'],
    ['created_at', 'datetime', 'Alta en el sistema'],
  ] as RawCol[] },
  consents: { table: 'carmo_consents', title: 'Consentimientos', grain: 'consentimiento', cols: [
    ['id', 'string', 'Id'], ['patient_id', 'string', 'Paciente (id)'], ['document_version', 'string', 'Versión documental'], ['signed_date', 'date', 'Fecha de firma'],
    ['status', 'string', 'Estado'], ['withdrawal_date', 'date', 'Fecha de retirada'], ['withdrawal_scope', 'string', 'Alcance de la retirada'],
    ['future_use_choice', 'string', 'Destino de los datos al terminar (CI)', { delete: 'Eliminados', keep_pseudonymized: 'Conservados seudonimizados' }],
  ] as RawCol[] },
  visits: { table: 'carmo_visits', title: 'Visitas (tabla original)', grain: 'visita', cols: [
    ['id', 'string', 'Id de visita'], ['patient_id', 'string', 'Paciente (id)'], ['visit_code', 'string', 'Visita'], ['planned_date', 'date', 'Fecha prevista'],
    ['actual_date', 'date', 'Fecha efectiva'], ['status', 'string', 'Estado'], ['modality', 'string', 'Modalidad'], ['responsible_id', 'string', 'Responsable (id)'],
    ['record_state', 'string', 'Estado del registro'], ['revision', 'integer', 'Revisión'],
  ] as RawCol[] },
  windows: { table: 'carmo_visit_windows', key: 'visit_id', title: 'Ventanas de visita', grain: 'visita', cols: [
    ['visit_id', 'string', 'Id de visita'], ['window_start', 'date', 'Inicio de ventana'], ['window_end', 'date', 'Fin de ventana'],
    ['window_status', 'string', 'Estado de ventana'], ['deviation_days', 'integer', 'Días respecto a la fecha prevista'],
  ] as RawCol[] },
  variables: { table: 'carmo_variables', key: 'code', title: 'Diccionario de variables del eCRD', grain: 'variable', cols: [
    ['code', 'string', 'Código'], ['section', 'string', 'Sección'], ['label', 'string', 'Etiqueta'], ['value_type', 'string', 'Tipo'],
    ['status', 'string', 'Estado de la definición'], ['definition_version', 'integer', 'Versión de la definición'], ['source_reference', 'string', 'Fuente'],
  ] as RawCol[] },
  observations: { table: 'carmo_observations', title: 'Observaciones (todas, incluidas las corregidas)', grain: 'observación', cols: [
    ['id', 'string', 'Id'], ['patient_id', 'string', 'Paciente (id)'], ['visit_id', 'string', 'Visita (id)'], ['variable_code', 'string', 'Variable'],
    ['variable_definition_version', 'integer', 'Versión de la definición'], ['value_numeric', 'decimal', 'Valor numérico'], ['value_boolean', 'boolean', 'Valor sí/no'],
    ['value_text', 'string', 'Valor categórico/texto'], ['value_date', 'date', 'Valor fecha'], ['unit', 'string', 'Unidad'], ['is_missing', 'boolean', 'Dato ausente'],
    ['missing_reason', 'string', 'Motivo de ausencia'], ['observed_date', 'date', 'Fecha de la medición'], ['data_source', 'string', 'Origen'],
    ['temporal_context', 'string', 'Contexto temporal'], ['supersedes_id', 'string', 'Corrige a (id)'], ['correction_reason', 'string', 'Motivo de corrección'],
    ['recorded_at', 'datetime', 'Registrado'],
  ] as RawCol[] },
  questionnaires: { table: 'carmo_questionnaire_administrations', title: 'Cuestionarios (administraciones)', grain: 'administración', cols: [
    ['id', 'string', 'Id'], ['visit_id', 'string', 'Visita (id)'], ['patient_id', 'string', 'Paciente (id)'], ['instrument_code', 'string', 'Instrumento'],
    ['instrument_version', 'string', 'Versión del instrumento'], ['status', 'string', 'Estado'], ['not_done_reason', 'string', 'Motivo de no realización'],
    ['administration_mode', 'string', 'Modalidad'], ['data_source', 'string', 'Soporte'], ['administration_date', 'date', 'Fecha'],
    ['responses', 'json', 'Respuestas (original)'], ['vas_value', 'integer', 'EVA 0-100 (EQ-5D)'], ['items_answered', 'integer', 'Ítems respondidos'], ['scores', 'json', 'Puntuaciones (BD)'],
    ['scoring_version', 'string', 'Versión de puntuación'], ['evaluator_role', 'string', 'Rol del evaluador'],
    ['evaluator_conformity', 'string', 'Evaluador conforme con el protocolo (IEXPAC final externo)'], ['revision', 'integer', 'Revisión'],
  ] as RawCol[] },
  treatments: { table: 'carmo_treatments', title: 'Tratamientos', grain: 'tratamiento', cols: [
    ['id', 'string', 'Id'], ['patient_id', 'string', 'Paciente (id)'], ['active_ingredient', 'string', 'Principio activo'],
    ['is_study_lipid_therapy', 'boolean', 'Tratamiento hipolipemiante principal del estudio'], ['presentation', 'string', 'Presentación'],
    ['dose_amount', 'decimal', 'Dosis vigente'], ['dose_unit', 'string', 'Unidad de dosis'], ['frequency', 'string', 'Frecuencia'], ['route', 'string', 'Vía'],
    ['start_date', 'date', 'Inicio'], ['end_date', 'date', 'Fin'], ['status', 'string', 'Estado'], ['started_before_inclusion', 'boolean', 'Iniciado antes de la inclusión'],
  ] as RawCol[] },
  treatmentEvents: { table: 'carmo_treatment_events', title: 'Historial de tratamiento', grain: 'evento de tratamiento', cols: [
    ['id', 'string', 'Id'], ['treatment_id', 'string', 'Tratamiento (id)'], ['patient_id', 'string', 'Paciente (id)'], ['visit_id', 'string', 'Visita (id)'],
    ['event_type', 'string', 'Tipo de evento'], ['event_date', 'date', 'Fecha'], ['new_dose_amount', 'decimal', 'Nueva dosis'], ['new_dose_unit', 'string', 'Unidad'],
    ['new_frequency', 'string', 'Nueva frecuencia'], ['reason', 'string', 'Motivo'], ['adverse_reaction_description', 'string', 'Reacción adversa'],
  ] as RawCol[] },
  dispensations: { table: 'carmo_dispensations', title: 'Dispensaciones', grain: 'dispensación', cols: [
    ['id', 'string', 'Id'], ['treatment_id', 'string', 'Tratamiento (id)'], ['patient_id', 'string', 'Paciente (id)'], ['dispensed_date', 'date', 'Fecha'],
    ['units_dispensed', 'decimal', 'Unidades'], ['days_supply', 'integer', 'Días de cobertura'], ['supersedes_id', 'string', 'Corrige a (id)'],
  ] as RawCol[] },
  interventions: { table: 'carmo_interventions', title: 'Intervenciones farmacéuticas', grain: 'intervención', cols: [
    ['id', 'string', 'Id'], ['patient_id', 'string', 'Paciente (id)'], ['visit_id', 'string', 'Visita (id)'], ['catalog_code', 'string', 'Categoría (catálogo)'],
    ['intervention_date', 'date', 'Fecha'], ['is_scheduled', 'boolean', 'Programada'], ['modality', 'string', 'Modalidad'], ['recipient', 'string', 'Destinatario'],
    ['acceptance', 'string', 'Aceptación'], ['followup_status', 'string', 'Seguimiento'],
  ] as RawCol[] },
  stratifications: { table: 'carmo_stratifications', title: 'Estratificaciones CMO', grain: 'estratificación', cols: [
    ['id', 'string', 'Id'], ['patient_id', 'string', 'Paciente (id)'], ['visit_id', 'string', 'Visita (id)'], ['model_version', 'string', 'Versión del modelo'],
    ['engine_version', 'string', 'Versión del motor'], ['inputs', 'json', 'Respuestas del modelo (original)'], ['item_results', 'json', 'Resultado de la BD (total, bloques, ítems)'],
    ['total_score', 'decimal', 'Puntuación'], ['calculated_priority', 'integer', 'Prioridad calculada'],
    ['validation_status', 'string', 'Validación profesional'], ['final_priority', 'integer', 'Prioridad final'], ['validation_reason', 'string', 'Motivo de la elevación'], ['calculated_at', 'datetime', 'Calculada'],
    ['supersedes_id', 'string', 'Reestratifica a (id)'],
  ] as RawCol[] },
  deviations: { table: 'carmo_deviations', title: 'Desviaciones e incidencias', grain: 'desviación', cols: [
    ['id', 'string', 'Id'], ['patient_id', 'string', 'Paciente (id)'], ['visit_id', 'string', 'Visita (id)'], ['category', 'string', 'Categoría'],
    ['detected_date', 'date', 'Fecha'], ['status', 'string', 'Estado'],
  ] as RawCol[] },
} as const;

export type TableKey = keyof typeof RAW_TABLES;
export type RawData = Record<TableKey, Row[]>;

export const TABLE_REQUESTS = Object.fromEntries(
  Object.entries(RAW_TABLES).map(([k, t]) => [k, { table: t.table, columns: t.cols.map((c) => c[0]).join(','), orderBy: 'key' in t ? t.key : 'id' } satisfies TableRequest]),
) as Record<TableKey, TableRequest>;

/** Columnas no exportadas (minimización): texto libre con riesgo de identificadores y autoría nominal. */
export const EXCLUDED_COLUMNS: Array<{ table: string; columns: string; reason: string }> = [
  { table: 'carmo_visit_evolutions', columns: 'todas', reason: 'Texto libre clínico: riesgo de identificadores directos. Exportación pendiente de decisión (RG-14).' },
  { table: 'carmo_deviations', columns: 'description, resolution', reason: 'Texto libre: riesgo de identificadores.' },
  { table: 'carmo_interventions', columns: 'reason, action_taken, outcome', reason: 'Texto libre: riesgo de identificadores.' },
  { table: '(todas)', columns: 'created_by, recorded_by, evaluator_id, assessed_by, investigator_id', reason: 'Identificadores de profesionales: no necesarios para el análisis.' },
];

export type IntegrityIssue = { tipo: string; gravedad: 'error' | 'revisar'; tabla: string; registro_id: string | null; study_code: string | null; detalle: string };
export type BuildResult = { datasets: Dataset[]; issues: IntegrityIssue[] };

function rawDataset(key: TableKey, rows: Row[]): Dataset {
  const t = RAW_TABLES[key];
  const columns: ColumnSpec[] = t.cols.map(([name, type, label, values]) => ({ name, type, label, values, source: `${t.table}.${name}` }));
  const names = columns.map((c) => c.name);
  return {
    id: t.table, folder: 'raw', title: t.title, grain: `Una fila por ${t.grain}`, key: ['key' in t ? t.key : 'id'], columns,
    rows: rows.map((r) => Object.fromEntries(names.map((n) => [n, r[n] ?? null]))),
  };
}

const LONGITUDINAL_NUMERIC = ['ldl_c', 'non_hdl_c', 'weight'] as const;

export function buildDatasets(raw: RawData, todayIso: string): BuildResult {
  void todayIso;
  const issues: IntegrityIssue[] = [];
  const datasets: Dataset[] = (Object.keys(RAW_TABLES) as TableKey[]).map((k) => rawDataset(k, raw[k]));

  const centerCode = new Map(raw.centers.map((c) => [String(c.id), String(c.code)]));
  const visitsById = new Map(raw.visits.map((v) => [String(v.id), v]));
  const currentObs = currentObservations(raw.observations as Array<Row & { id: string; supersedes_id: string | null }>);

  // Basal y final de cada paciente (visita realizada y no anulada).
  const visitOf = (patientId: string, code: string) =>
    raw.visits.find((v) => v.patient_id === patientId && v.visit_code === code && v.status === 'done');
  const obsAt = (patientId: string, visitId: string | undefined, variable: string) => {
    if (!visitId) return undefined;
    const o = currentObs.find((x) => x.patient_id === patientId && x.visit_id === visitId && x.variable_code === variable && !x.is_missing);
    return o ? { value: (o.value_numeric as number | null) ?? null, unit: (o.unit as string | null) ?? null } : undefined;
  };
  const scoresAt = (visitId: string | undefined, code: string) => {
    if (!visitId) return undefined;
    const q = raw.questionnaires.find((x) => x.visit_id === visitId && x.instrument_code === code && x.status === 'completed');
    return q?.scores as { global?: number | null; profile?: string | null; vas?: number | null; adherent?: boolean | null } | undefined;
  };
  const iexpacAt = (visitId: string | undefined) => {
    const g = scoresAt(visitId, 'IEXPAC')?.global;
    return typeof g === 'number' ? g : null;
  };
  const treatmentsOf = (pid: string) => raw.treatments.filter((t) => t.patient_id === pid && t.is_study_lipid_therapy === true);

  const patientRows: Row[] = [];
  const longRows: Row[] = [];
  for (const p of raw.patients) {
    const pid = String(p.id);
    const basal = visitOf(pid, 'BASAL');
    const final = visitOf(pid, 'FINAL');
    const iex = pairIexpac(iexpacAt(basal?.id as string | undefined), iexpacAt(final?.id as string | undefined));
    if (p.status === 'included' || p.status === 'completed') {
      if (!basal) issues.push({ tipo: 'sin_visita_basal', gravedad: 'revisar', tabla: 'carmo_visits', registro_id: pid, study_code: String(p.study_code), detalle: 'Paciente incluido sin evaluación inicial realizada.' });
    }
    if (p.status === 'completed' && !final) {
      issues.push({ tipo: 'finalizado_sin_final', gravedad: 'error', tabla: 'carmo_patients', registro_id: pid, study_code: String(p.study_code), detalle: 'Seguimiento finalizado sin visita final realizada.' });
    }
    const included = ['included', 'withdrawn', 'lost_to_followup', 'completed'].includes(String(p.status));
    patientRows.push({
      screening_code: p.screening_code, study_code: p.study_code ?? null, center_code: centerCode.get(String(p.center_id)) ?? null, status: p.status, status_reason: p.status_reason ?? null,
      inclusion_date: p.inclusion_date ?? null, is_synthetic: p.is_synthetic, pob_itt: included,
      pob_pp: p.status === 'completed', pob_iexpac_pareada: included && iex.paired,
      fecha_basal: basal?.actual_date ?? null, fecha_final: final?.actual_date ?? null,
    });
    if (!p.study_code) continue;
    const row: Row = { study_code: p.study_code, iexpac_basal: iex.baseline, iexpac_final: iex.final, iexpac_dif: iex.difference };
    for (const v of LONGITUDINAL_NUMERIC) {
      const ch = numericChange(obsAt(pid, basal?.id as string | undefined, v), obsAt(pid, final?.id as string | undefined, v));
      row[`${v}_basal`] = ch.baseline; row[`${v}_final`] = ch.final; row[`${v}_unidad`] = ch.unit; row[`${v}_dif`] = ch.absolute;
      if (ch.reason === 'unit_mismatch') {
        issues.push({ tipo: 'unidades_distintas', gravedad: 'revisar', tabla: 'carmo_observations', registro_id: pid, study_code: String(p.study_code), detalle: `${v}: unidad basal y final distintas; no se calcula el cambio (sin conversión automática).` });
      }
    }
    const eqB = scoresAt(basal?.id as string | undefined, 'EQ5D3L');
    const eqF = scoresAt(final?.id as string | undefined, 'EQ5D3L');
    row.eq5d_perfil_basal = eqB?.profile ?? null; row.eq5d_perfil_final = eqF?.profile ?? null;
    row.eq5d_eva_basal = eqB?.vas ?? null; row.eq5d_eva_final = eqF?.vas ?? null;
    row.eq5d_eva_dif = typeof eqB?.vas === 'number' && typeof eqF?.vas === 'number' ? eqF.vas - eqB.vas : null;
    const mg = (v: Row | undefined) => { const a = scoresAt(v?.id as string | undefined, 'MORISKY_GREEN')?.adherent; return typeof a === 'boolean' ? a : null; };
    row.mg_adherente_basal = mg(basal); row.mg_adherente_s24 = mg(visitOf(pid, 'S24')); row.mg_adherente_final = mg(final);
    const trts = treatmentsOf(pid);
    const naiveDerived = trts.length === 0 ? null : trts.every((t) => t.started_before_inclusion === false);
    row.naive_derivado = naiveDerived;
    const naiveObs = currentObs.find((o) => o.patient_id === pid && o.variable_code === 'naive_patient' && !o.is_missing);
    if (naiveObs && naiveDerived !== null && naiveObs.value_boolean !== naiveDerived) {
      issues.push({ tipo: 'naive_discordante', gravedad: 'revisar', tabla: 'carmo_observations', registro_id: pid, study_code: String(p.study_code), detalle: 'La variable «paciente naïve» no coincide con el registro de tratamientos (inicio del medicamento del estudio respecto a la inclusión).' });
    }
    const stratsOf = raw.stratifications.filter((s) => s.patient_id === pid);
    const currentStrat = (rows: Row[]) => rows.find((s) => !rows.some((n) => n.supersedes_id === s.id));
    const sBasal = basal ? currentStrat(stratsOf.filter((s) => s.visit_id === basal.id)) : undefined;
    const sNow = currentStrat(stratsOf);
    const eff = (s: Row | undefined) => (s ? ((s.final_priority as number | null) ?? (s.calculated_priority as number)) : null);
    row.cmo_puntos_basal = (sBasal?.total_score as number | undefined) ?? null;
    row.cmo_prioridad_basal = eff(sBasal);
    row.cmo_prioridad_vigente = eff(sNow);
    row.imc_basal = deriveBmi(obsAt(pid, basal?.id as string | undefined, 'weight'), obsAt(pid, basal?.id as string | undefined, 'height'));
    row.imc_final = deriveBmi(obsAt(pid, final?.id as string | undefined, 'weight'), obsAt(pid, final?.id as string | undefined, 'height'));
    longRows.push(row);
  }
  if (raw.patients.some((p) => p.is_synthetic === true)) {
    issues.push({ tipo: 'datos_sinteticos', gravedad: 'revisar', tabla: 'carmo_patients', registro_id: null, study_code: null, detalle: 'La extracción contiene pacientes sintéticos (fase de validación). No usar para análisis.' });
  }
  for (const q of raw.questionnaires) {
    if (!visitsById.has(String(q.visit_id))) issues.push({ tipo: 'cuestionario_sin_visita', gravedad: 'error', tabla: 'carmo_questionnaire_administrations', registro_id: String(q.id), study_code: null, detalle: 'Cuestionario cuya visita no es visible o no existe.' });
  }

  const studyCode = new Map(raw.patients.map((p) => [String(p.id), p.study_code]));
  const itemRows: Row[] = [];
  for (const q of raw.questionnaires) {
    const visit = visitsById.get(String(q.visit_id));
    for (const [item, value] of Object.entries((q.responses as Record<string, number>) ?? {})) {
      itemRows.push({ administration_id: q.id, study_code: studyCode.get(String(q.patient_id)) ?? null, visit_code: visit?.visit_code ?? null,
        instrument_code: q.instrument_code, instrument_version: q.instrument_version, item: Number(item), response: value });
    }
  }

  const c = (name: string, type: ColumnType, label: string, source: string, extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ name, type, label, source, ...extra });
  datasets.push({
    id: 'pacientes', folder: 'analisis', title: 'Pacientes', grain: 'Una fila por sujeto seleccionado', key: ['screening_code'], rows: patientRows,
    columns: [
      c('screening_code', 'string', 'Código de selección', 'carmo_patients.screening_code'),
      c('study_code', 'string', 'Código de paciente (protocolo)', 'carmo_patients.study_code'), c('center_code', 'string', 'Centro', 'carmo_centers.code'),
      c('status', 'string', 'Estado', 'carmo_patients.status'), c('status_reason', 'string', 'Motivo del estado', 'carmo_patients.status_reason'),
      c('inclusion_date', 'date', 'Fecha de inclusión', 'carmo_patients.inclusion_date'), c('is_synthetic', 'boolean', 'Dato sintético', 'carmo_patients.is_synthetic'),
      c('pob_itt', 'boolean', 'Población por intención de tratar', 'derivada', { rule: 'Protocolo: todos los incluidos, aunque no terminen el seguimiento (estado ∈ {incluido, retirado, pérdida, finalizado})' }),
      c('pob_pp', 'boolean', 'Población por protocolo', 'derivada', { rule: 'Protocolo: incluidos que completan los 12 meses (estado = finalizado)' }),
      c('pob_iexpac_pareada', 'boolean', 'Población: IEXPAC basal y final válidos', 'derivada', { rule: 'incluido y puntuación IEXPAC global válida en BASAL y FINAL realizadas' }),
      c('fecha_basal', 'date', 'Fecha evaluación inicial', 'carmo_visits.actual_date (BASAL)'), c('fecha_final', 'date', 'Fecha visita final', 'carmo_visits.actual_date (FINAL)'),
    ],
  });
  const longCols: ColumnSpec[] = [
    c('study_code', 'string', 'Código seudonimizado', 'carmo_patients.study_code'),
    c('iexpac_basal', 'decimal', 'IEXPAC basal (0-10)', 'carmo_questionnaire_administrations.scores.global', { instrument: 'IEXPAC', visit: 'BASAL' }),
    c('iexpac_final', 'decimal', 'IEXPAC final (0-10)', 'carmo_questionnaire_administrations.scores.global', { instrument: 'IEXPAC', visit: 'FINAL' }),
    c('iexpac_dif', 'decimal', 'Diferencia IEXPAC final − basal', 'derivada', { rule: 'iexpac_final − iexpac_basal; vacío si falta alguna', notes: 'Descriptiva; no implica causalidad (diseño antes-después sin grupo control).' }),
  ];
  for (const v of LONGITUDINAL_NUMERIC) {
    longCols.push(
      c(`${v}_basal`, 'decimal', `${v} basal`, 'carmo_observations_current', { visit: 'BASAL' }),
      c(`${v}_final`, 'decimal', `${v} final`, 'carmo_observations_current', { visit: 'FINAL' }),
      c(`${v}_unidad`, 'string', `${v} unidad`, 'carmo_observations.unit'),
      c(`${v}_dif`, 'decimal', `${v} cambio final − basal`, 'derivada', { rule: 'solo con la misma unidad en ambas visitas; sin conversión' }),
    );
  }
  longCols.push(
    c('eq5d_perfil_basal', 'string', 'EQ-5D-3L perfil basal (5 dígitos)', 'carmo_questionnaire_administrations.scores.profile', { instrument: 'EQ5D3L', visit: 'BASAL' }),
    c('eq5d_perfil_final', 'string', 'EQ-5D-3L perfil final', 'carmo_questionnaire_administrations.scores.profile', { instrument: 'EQ5D3L', visit: 'FINAL' }),
    c('eq5d_eva_basal', 'integer', 'EQ-5D EVA basal (0-100)', 'carmo_questionnaire_administrations.vas_value', { instrument: 'EQ5D3L', visit: 'BASAL' }),
    c('eq5d_eva_final', 'integer', 'EQ-5D EVA final (0-100)', 'carmo_questionnaire_administrations.vas_value', { instrument: 'EQ5D3L', visit: 'FINAL' }),
    c('eq5d_eva_dif', 'integer', 'EQ-5D EVA final − basal', 'derivada', { rule: 'solo con ambas EVA' }),
    c('mg_adherente_basal', 'boolean', 'Morisky-Green adherente (basal)', 'scores.adherent', { instrument: 'MORISKY_GREEN', visit: 'BASAL', rule: 'No-Sí-No-No; vacío si incompleto' }),
    c('mg_adherente_s24', 'boolean', 'Morisky-Green adherente (S24)', 'scores.adherent', { instrument: 'MORISKY_GREEN', visit: 'S24' }),
    c('mg_adherente_final', 'boolean', 'Morisky-Green adherente (final)', 'scores.adherent', { instrument: 'MORISKY_GREEN', visit: 'FINAL' }),
    c('naive_derivado', 'boolean', 'Nuevo a tratamiento según el registro de tratamientos', 'derivada', { rule: 'todos los medicamentos del estudio iniciados en o después de la inclusión; vacío sin tratamiento del estudio registrado' }),
    c('cmo_puntos_basal', 'decimal', 'CMO: puntuación en la visita inicial (0-42)', 'carmo_stratifications.total_score', { visit: 'BASAL' }),
    c('cmo_prioridad_basal', 'integer', 'CMO: prioridad en la visita inicial', 'derivada', { values: { '1': 'Prioridad 1', '2': 'Prioridad 2', '3': 'Prioridad 3' }, rule: 'final_priority si se validó con elevación; si no, calculated_priority; estratificación vigente de la visita inicial' }),
    c('cmo_prioridad_vigente', 'integer', 'CMO: prioridad vigente (última estratificación)', 'derivada', { values: { '1': 'Prioridad 1', '2': 'Prioridad 2', '3': 'Prioridad 3' } }),
    c('imc_basal', 'decimal', 'IMC basal (kg/m²)', 'derivada', { rule: 'peso (kg) / (talla (cm)/100)²', unit: 'kg/m2' }),
    c('imc_final', 'decimal', 'IMC final (kg/m²)', 'derivada', { rule: 'peso (kg) / (talla (cm)/100)²', unit: 'kg/m2' }),
  );
  datasets.push({ id: 'longitudinal_pareado', folder: 'analisis', title: 'Basal y final emparejados (Wilcoxon pareado; casos completos)', grain: 'Una fila por sujeto incluido', key: ['study_code'], rows: longRows, columns: longCols });
  datasets.push({
    id: 'cuestionarios_items', folder: 'analisis', title: 'Respuestas por ítem', grain: 'Una fila por ítem respondido', key: ['administration_id', 'item'], rows: itemRows,
    columns: [
      c('administration_id', 'string', 'Administración (id)', 'carmo_questionnaire_administrations.id'), c('study_code', 'string', 'Código seudonimizado', 'carmo_patients.study_code'),
      c('visit_code', 'string', 'Visita', 'carmo_visits.visit_code'), c('instrument_code', 'string', 'Instrumento', 'carmo_questionnaire_administrations.instrument_code'),
      c('instrument_version', 'string', 'Versión', 'carmo_questionnaire_administrations.instrument_version'), c('item', 'integer', 'Ítem', 'responses (clave)'),
      c('response', 'integer', 'Respuesta (código)', 'responses (valor)'),
    ],
  });
  const issueCols = ['tipo', 'gravedad', 'tabla', 'registro_id', 'study_code', 'detalle'].map((n) => c(n, 'string', n, 'derivada'));
  datasets.push({ id: 'incidencias_integridad', folder: 'analisis', title: 'Incidencias de integridad', grain: 'Una fila por incidencia', key: ['tipo', 'registro_id', 'detalle'], columns: issueCols,
    rows: issues.map((i) => ({ ...i })) });
  return { datasets, issues };
}
