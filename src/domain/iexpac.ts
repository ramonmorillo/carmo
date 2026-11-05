// IEXPAC (variable principal). Regla idéntica a carmo_private.iexpac_score (migración 04):
// IEXPAC = 10 × (Σ ítems 1-11 − 11) / 44, solo con los 11 ítems respondidos (1-5). Sin imputación.

export const IEXPAC_ITEMS = 11;
export const IEXPAC_MIN = 1;
export const IEXPAC_MAX = 5;
export const IEXPAC_SCORING_VERSION = 'carmo-iexpac-1';

export type IexpacScore = { itemsAnswered: number; sum: number | null; global: number | null; valid: boolean };

export function validateIexpacResponses(responses: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(responses)) {
    const item = Number(key);
    if (!/^\d+$/.test(key) || item < 1 || item > IEXPAC_ITEMS) errors.push(`Ítem ${key} inexistente.`);
    else if (typeof value !== 'number' || !Number.isInteger(value) || value < IEXPAC_MIN || value > IEXPAC_MAX) errors.push(`Ítem ${key}: respuesta fuera de rango.`);
  }
  return errors;
}

export function scoreIexpac(responses: Record<string, number | undefined>): IexpacScore {
  if (validateIexpacResponses(responses).length > 0) throw new Error('Respuestas IEXPAC no válidas.');
  let sum = 0;
  let n = 0;
  for (let i = 1; i <= IEXPAC_ITEMS; i += 1) {
    const v = responses[String(i)];
    if (typeof v === 'number') {
      sum += v;
      n += 1;
    }
  }
  if (n < IEXPAC_ITEMS) return { itemsAnswered: n, sum: null, global: null, valid: false };
  // Redondeo a 4 decimales, igual que round(numeric, 4) en PostgreSQL (mitad hacia arriba).
  const global = Math.round((10 * (sum - 11) * 10000) / 44) / 10000;
  return { itemsAnswered: n, sum, global, valid: true };
}

export type PairedIexpac = { baseline: number | null; final: number | null; difference: number | null; paired: boolean };

/** Diferencia individual final − basal; solo con ambas puntuaciones válidas. Descriptiva, no causal. */
export function pairIexpac(baseline: number | null | undefined, final: number | null | undefined): PairedIexpac {
  const b = typeof baseline === 'number' ? baseline : null;
  const f = typeof final === 'number' ? final : null;
  if (b === null || f === null) return { baseline: b, final: f, difference: null, paired: false };
  return { baseline: b, final: f, difference: Math.round((f - b) * 10000) / 10000, paired: true };
}
