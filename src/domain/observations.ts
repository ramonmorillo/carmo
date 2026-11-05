// Observaciones de solo-adición: valor vigente, IMC derivado y cambios longitudinales.

export type Observation = {
  id: string;
  patient_id: string;
  visit_id: string | null;
  variable_code: string;
  value_numeric: number | null;
  value_boolean: boolean | null;
  value_text: string | null;
  value_date: string | null;
  unit: string | null;
  is_missing: boolean;
  missing_reason: string | null;
  observed_date: string;
  temporal_context: string;
  supersedes_id: string | null;
  recorded_at: string;
};

/** Filas vigentes: las que ninguna otra corrige. (Igual que la vista carmo_observations_current.) */
export function currentObservations<T extends Pick<Observation, 'id' | 'supersedes_id'>>(rows: T[]): T[] {
  const superseded = new Set(rows.map((r) => r.supersedes_id).filter((x): x is string => !!x));
  return rows.filter((r) => !superseded.has(r.id));
}

/** Historia de correcciones de una observación vigente (de la más reciente a la original). */
export function correctionChain<T extends Pick<Observation, 'id' | 'supersedes_id'>>(rows: T[], currentId: string): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: T[] = [];
  let cursor = byId.get(currentId);
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.supersedes_id ? byId.get(cursor.supersedes_id) : undefined;
  }
  return chain;
}

/** IMC = peso (kg) / talla (m)². Solo con ambos valores numéricos en kg y cm. Variable derivada (no almacenada). */
export function deriveBmi(weight: { value: number | null; unit: string | null } | undefined, height: { value: number | null; unit: string | null } | undefined): number | null {
  if (!weight || !height || weight.value === null || height.value === null) return null;
  if (weight.unit !== 'kg' || height.unit !== 'cm' || height.value <= 0) return null;
  const m = height.value / 100;
  return Math.round((weight.value / (m * m)) * 10) / 10;
}

export type NumericChange = { baseline: number | null; final: number | null; unit: string | null; absolute: number | null; comparable: boolean; reason?: string };

/** Cambio final − basal de una variable numérica. No compara unidades distintas ni convierte. */
export function numericChange(
  baseline: { value: number | null; unit: string | null } | undefined,
  final: { value: number | null; unit: string | null } | undefined,
): NumericChange {
  const b = baseline?.value ?? null;
  const f = final?.value ?? null;
  if (b === null || f === null) return { baseline: b, final: f, unit: baseline?.unit ?? final?.unit ?? null, absolute: null, comparable: false, reason: 'missing' };
  if (baseline?.unit !== final?.unit) return { baseline: b, final: f, unit: null, absolute: null, comparable: false, reason: 'unit_mismatch' };
  return { baseline: b, final: f, unit: baseline?.unit ?? null, absolute: Math.round((f - b) * 10000) / 10000, comparable: true };
}
