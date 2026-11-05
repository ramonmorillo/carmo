// Motor de estratificación CMO genérico y reproducible, dirigido por una definición versionada
// (src/domain/cmoCardioModel.json ⇄ carmo_cmo_models.definition). La base de datos rehace el mismo
// cálculo (carmo_private.cmo_compute) y rechaza cualquier discrepancia. Sin modelo VALIDADO no se
// guarda ninguna estratificación.

export type CmoOption = { value: string; label: string; points: number; forcePriority?: 1 | 2 | 3; excludes?: string };
export type CmoVariable = { code: string; block: string; group: string; label: string; options: CmoOption[] };
export type CmoBlock = { code: string; label: string; max: number };
export type CmoFollowUp = { label: string; restratifyMonths: number | null; firstFollowUpDays: number | null };
export type CmoModelDefinition = {
  version: string;
  title?: string;
  source?: string;
  blocks: CmoBlock[];
  maxScore: number;
  /** Puntuación mínima de cada prioridad (P1 > P2 > P3). */
  thresholds: { priority1Min: number; priority2Min: number };
  variables: CmoVariable[];
  followUp?: Record<'1' | '2' | '3', CmoFollowUp>;
};
export type CmoModelRecord = { version: string; status: 'draft' | 'validated' | 'retired'; definition: CmoModelDefinition };

export const CMO_ENGINE_VERSION = 'carmo-cmo-engine-2';

export type CmoItemResult = { code: string; block: string; value: string | null; points: number | null };
export type CmoResult = {
  engineVersion: string;
  modelVersion: string;
  items: CmoItemResult[];
  blocks: Record<string, number>;
  missing: string[];
  excluded: string | null;
  totalScore: number | null;
  scorePriority: 1 | 2 | 3 | null;
  priority: 1 | 2 | 3 | null;
  appliedExceptions: string[];
  justification: string;
};

export function assertModelUsable(model: CmoModelRecord | null | undefined): { usable: boolean; reason: string } {
  if (!model) return { usable: false, reason: 'No existe ningún modelo CMO cardiovascular cargado.' };
  if (model.status !== 'validated') return { usable: false, reason: `El modelo ${model.version} no está validado (estado: ${model.status}).` };
  return { usable: true, reason: '' };
}

/** Coherencia interna: códigos únicos, bloques existentes y máximos declarados = máximos calculados. */
export function validateDefinition(def: CmoModelDefinition): string[] {
  const errors: string[] = [];
  const codes = new Set<string>();
  const blockCodes = new Set(def.blocks.map((b) => b.code));
  const blockMax: Record<string, number> = {};
  for (const v of def.variables) {
    if (codes.has(v.code)) errors.push(`Variable duplicada: ${v.code}`);
    codes.add(v.code);
    if (!blockCodes.has(v.block)) errors.push(`Bloque inexistente en ${v.code}: ${v.block}`);
    if (v.options.length === 0) errors.push(`Variable sin opciones: ${v.code}`);
    if (new Set(v.options.map((o) => o.value)).size !== v.options.length) errors.push(`Opciones duplicadas en ${v.code}`);
    if (v.options.some((o) => !Number.isInteger(o.points) || o.points < 0)) errors.push(`Puntos no válidos en ${v.code}`);
    blockMax[v.block] = (blockMax[v.block] ?? 0) + Math.max(...v.options.map((o) => o.points));
  }
  for (const b of def.blocks) {
    if ((blockMax[b.code] ?? 0) !== b.max) errors.push(`Máximo del bloque ${b.code}: declarado ${b.max}, calculado ${blockMax[b.code] ?? 0}`);
  }
  const total = Object.values(blockMax).reduce((a, b) => a + b, 0);
  if (total !== def.maxScore) errors.push(`Puntuación máxima: declarada ${def.maxScore}, calculada ${total}`);
  if (!(def.thresholds.priority1Min > def.thresholds.priority2Min)) errors.push('Umbrales incoherentes (P1 debe exigir más puntos que P2).');
  return errors;
}

export function priorityFromScore(def: CmoModelDefinition, total: number): 1 | 2 | 3 {
  return total >= def.thresholds.priority1Min ? 1 : total >= def.thresholds.priority2Min ? 2 : 3;
}

/** Cálculo determinista. Sin imputación: con alguna variable sin responder no hay prioridad. */
export function computeCmo(def: CmoModelDefinition, inputs: Record<string, string | null | undefined>): CmoResult {
  const errors = validateDefinition(def);
  if (errors.length) throw new Error(`Definición del modelo no válida: ${errors.join('; ')}`);
  const blocks: Record<string, number> = Object.fromEntries(def.blocks.map((b) => [b.code, 0]));
  let excluded: string | null = null;
  const forced: Array<{ code: string; priority: 1 | 2 | 3 }> = [];
  const items: CmoItemResult[] = def.variables.map((v) => {
    const value = inputs[v.code] ?? null;
    if (value === null) return { code: v.code, block: v.block, value: null, points: null };
    const option = v.options.find((o) => o.value === value);
    if (!option) throw new Error(`Valor no admitido para ${v.code}: ${value}`);
    if (option.excludes) excluded = option.excludes;
    if (option.forcePriority) forced.push({ code: v.code, priority: option.forcePriority });
    blocks[v.block] += option.points;
    return { code: v.code, block: v.block, value, points: option.points };
  });
  const base = { engineVersion: CMO_ENGINE_VERSION, modelVersion: def.version, items, blocks };
  if (excluded) {
    return { ...base, missing: [], excluded, totalScore: null, scorePriority: null, priority: null, appliedExceptions: [], justification: `No aplicable: ${excluded}.` };
  }
  const missing = items.filter((i) => i.value === null).map((i) => i.code);
  if (missing.length > 0) {
    return { ...base, missing, excluded: null, totalScore: null, scorePriority: null, priority: null, appliedExceptions: [],
      justification: `Sin prioridad: faltan ${missing.length} variable(s) (${missing.join(', ')}).` };
  }
  const total = Object.values(blocks).reduce((a, b) => a + b, 0);
  const scorePriority = priorityFromScore(def, total);
  let priority: 1 | 2 | 3 = scorePriority;
  for (const f of forced) if (f.priority < priority) priority = f.priority;
  const parts = [
    `Puntuación ${total}/${def.maxScore} (${def.blocks.map((b) => `${b.code} ${blocks[b.code]}/${b.max}`).join(', ')}).`,
    `Puntos de corte: P1 ≥ ${def.thresholds.priority1Min}; P2 ≥ ${def.thresholds.priority2Min}; P3 < ${def.thresholds.priority2Min}.`,
  ];
  if (priority !== scorePriority) parts.push(`Regla excepcional (${forced.map((f) => f.code).join(', ')}): Prioridad ${priority} con independencia de la puntuación.`);
  return { ...base, missing: [], excluded: null, totalScore: total, scorePriority, priority, appliedExceptions: forced.map((f) => f.code), justification: parts.join(' ') };
}

/** Actuaciones acumulativas: un paciente de prioridad P recibe las de su nivel y las de los niveles inferiores. */
export function catalogForPriority<T extends { priority_levels: number[] }>(catalog: T[], priority: 1 | 2 | 3): T[] {
  return catalog.filter((c) => c.priority_levels.includes(priority));
}
