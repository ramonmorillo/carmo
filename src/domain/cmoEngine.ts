// Motor de estratificación CMO genérico y reproducible. NO contiene reglas clínicas: el modelo
// cardiovascular (variables, puntos, umbrales, reglas excepcionales) se carga como definición
// versionada (tabla carmo_cmo_models) y solo se usa si está VALIDADO. Sin modelo validado, la
// interfaz y la base de datos impiden estratificar (RG-21).

export type CmoOption = { value: string; label: string; points: number };
export type CmoVariable = { code: string; label: string; dimension: string; options: CmoOption[] };
export type CmoExceptionRule = { id: string; description: string; when: { variable: string; equals: string }; forcePriority: 1 | 2 | 3 };
export type CmoModelDefinition = {
  version: string;
  variables: CmoVariable[];
  /** Puntuación mínima para cada prioridad (P1 > P2 > P3). */
  thresholds: { priority1Min: number; priority2Min: number };
  exceptions: CmoExceptionRule[];
};
export type CmoModelRecord = { version: string; status: 'draft' | 'validated' | 'retired'; definition: CmoModelDefinition };

export const CMO_ENGINE_VERSION = 'carmo-cmo-engine-1';

export type CmoItemResult = { code: string; label: string; dimension: string; value: string | null; points: number | null };
export type CmoResult = {
  engineVersion: string;
  modelVersion: string;
  items: CmoItemResult[];
  missing: string[];
  totalScore: number | null;
  priority: 1 | 2 | 3 | null;
  appliedExceptions: string[];
  justification: string;
};

export function assertModelUsable(model: CmoModelRecord | null | undefined): { usable: boolean; reason: string } {
  if (!model) return { usable: false, reason: 'No existe ningún modelo CMO cardiovascular cargado.' };
  if (model.status !== 'validated') return { usable: false, reason: `El modelo ${model.version} no está validado (estado: ${model.status}).` };
  return { usable: true, reason: '' };
}

export function validateDefinition(def: CmoModelDefinition): string[] {
  const errors: string[] = [];
  const codes = new Set<string>();
  for (const v of def.variables) {
    if (codes.has(v.code)) errors.push(`Variable duplicada: ${v.code}`);
    codes.add(v.code);
    if (v.options.length === 0) errors.push(`Variable sin opciones: ${v.code}`);
    const values = new Set(v.options.map((o) => o.value));
    if (values.size !== v.options.length) errors.push(`Opciones duplicadas en ${v.code}`);
  }
  if (!(def.thresholds.priority1Min > def.thresholds.priority2Min)) errors.push('Umbrales incoherentes (P1 debe exigir más puntos que P2).');
  for (const e of def.exceptions) if (!codes.has(e.when.variable)) errors.push(`Regla ${e.id}: variable inexistente ${e.when.variable}`);
  return errors;
}

/** Cálculo determinista. Con alguna variable sin responder NO asigna prioridad (no imputa). */
export function computeCmo(def: CmoModelDefinition, inputs: Record<string, string | null | undefined>): CmoResult {
  const errors = validateDefinition(def);
  if (errors.length) throw new Error(`Definición del modelo no válida: ${errors.join('; ')}`);
  const items: CmoItemResult[] = def.variables.map((v) => {
    const value = inputs[v.code] ?? null;
    const option = value === null ? undefined : v.options.find((o) => o.value === value);
    if (value !== null && !option) throw new Error(`Valor no admitido para ${v.code}: ${value}`);
    return { code: v.code, label: v.label, dimension: v.dimension, value, points: option ? option.points : null };
  });
  const missing = items.filter((i) => i.value === null).map((i) => i.code);
  if (missing.length > 0) {
    return { engineVersion: CMO_ENGINE_VERSION, modelVersion: def.version, items, missing, totalScore: null, priority: null, appliedExceptions: [],
      justification: `Sin prioridad: faltan ${missing.length} variable(s) (${missing.join(', ')}).` };
  }
  const total = items.reduce((acc, i) => acc + (i.points ?? 0), 0);
  let priority: 1 | 2 | 3 = total >= def.thresholds.priority1Min ? 1 : total >= def.thresholds.priority2Min ? 2 : 3;
  const applied = def.exceptions.filter((e) => inputs[e.when.variable] === e.when.equals);
  for (const e of applied) if (e.forcePriority < priority) priority = e.forcePriority;
  const parts = [`Puntuación total ${total} (P1 ≥ ${def.thresholds.priority1Min}; P2 ≥ ${def.thresholds.priority2Min}).`];
  if (applied.length) parts.push(`Reglas excepcionales: ${applied.map((e) => e.id).join(', ')}.`);
  return { engineVersion: CMO_ENGINE_VERSION, modelVersion: def.version, items, missing, totalScore: total, priority, appliedExceptions: applied.map((e) => e.id), justification: parts.join(' ') };
}
