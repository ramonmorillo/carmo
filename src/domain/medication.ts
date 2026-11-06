// Medicación vinculada a CIMA (migración 09). Vocabularios cerrados idénticos a los de la base de datos
// (carmo_private.frequency_label / dose_unit_allowed / carmo_treatments_route_check): la BD rechaza
// cualquier otro valor. Sin texto libre en el registro de la medicación.

export const FREQUENCY_LABELS: Record<string, string> = {
  q24h: 'Cada 24 horas', q12h: 'Cada 12 horas', q8h: 'Cada 8 horas', q6h: 'Cada 6 horas', q48h: 'Cada 48 horas',
  weekly: 'Semanal', q2w: 'Cada 2 semanas', q4w: 'Cada 4 semanas', monthly: 'Mensual', q3m: 'Cada 3 meses',
  q6m: 'Cada 6 meses', prn: 'A demanda', single: 'Dosis única', other: 'Otra pauta',
};

export const DOSE_UNITS = ['mg', 'g', 'mcg', 'UI', 'ml', 'comprimido', 'cápsula', 'sobre', 'pluma/jeringa', 'vial', 'inhalación', 'gota', 'parche', 'unidad'] as const;

export const ROUTE_LABELS: Record<string, string> = {
  oral: 'Oral', subcutaneous: 'Subcutánea', intravenous: 'Intravenosa', intramuscular: 'Intramuscular', sublingual: 'Sublingual',
  inhalation: 'Inhalatoria', transdermal: 'Transdérmica', topical: 'Cutánea / tópica', other: 'Otra',
};

export const TREATMENT_STATUS_LABELS: Record<string, string> = { active: 'Activo', suspended: 'Suspendido', finished: 'Finalizado' };

export const TREATMENT_EVENT_LABELS: Record<string, string> = {
  start: 'Inicio', dose_change: 'Cambio de dosis o pauta', suspension: 'Suspensión', restart: 'Reinicio', end: 'Finalización',
  adverse_reaction: 'Reacción adversa', incident: 'Incidencia',
};

/** Motivos codificados de los eventos (se guardan como texto en carmo_treatment_events.reason). */
export const EVENT_REASONS = [
  'Objetivo terapéutico no alcanzado', 'Reacción adversa o intolerancia', 'Objetivo terapéutico alcanzado', 'Interacción',
  'Decisión del paciente', 'Decisión del prescriptor', 'Ajuste según ficha técnica', 'Problema de suministro', 'Fin de tratamiento previsto', 'Otro motivo',
] as const;

export const REVIEW_OUTCOME_LABELS: Record<string, string> = {
  no_changes: 'Revisada, sin cambios', changes_recorded: 'Revisada, con cambios registrados', no_medication: 'Sin medicación',
};

/** Tratamientos principales del estudio (protocolo §8). Nombre canónico = el que reconoce la columna generada is_study_lipid_therapy. */
const STUDY_DRUGS: Array<[string, string]> = [['alirocumab', 'Alirocumab'], ['evolocumab', 'Evolocumab'], ['inclisiran', 'Inclisirán'], ['evinacumab', 'Evinacumab']];

export type CimaDto = {
  id: string; cima_cn: string | null; cima_nregistro: string | null; cima_name: string; ingredient_names: string[]; labtitular: string | null;
  pharmaceutical_form: string | null; routes: string[]; atc_codes: string[]; authorization_status: string | null; commercialized: boolean | null;
  dose: string | null; fetched_at: string;
};

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Principio activo a guardar: nombre canónico si es un tratamiento principal del estudio; si no, los principios activos de CIMA. */
export function activeIngredientFromCima(dto: Pick<CimaDto, 'ingredient_names' | 'cima_name'>): string {
  const haystack = stripAccents([...dto.ingredient_names, dto.cima_name].join(' ').toLowerCase());
  const study = STUDY_DRUGS.find(([key]) => haystack.includes(key));
  if (study) return study[1];
  const joined = dto.ingredient_names.map((n) => n.trim()).filter(Boolean).join(' + ');
  return (joined || dto.cima_name).slice(0, 120);
}

export function isStudyDrug(dto: Pick<CimaDto, 'ingredient_names' | 'cima_name'>): boolean {
  return ['Alirocumab', 'Evolocumab', 'Inclisirán', 'Evinacumab'].includes(activeIngredientFromCima(dto));
}

/** Vía de administración de CIMA («VÍA SUBCUTÁNEA», «USO CUTÁNEO»…) → código de CARMO. */
export function routeCodeFromCima(name: string): string {
  const n = stripAccents(name.toLowerCase());
  if (n.includes('subcut')) return 'subcutaneous';
  if (n.includes('intraven')) return 'intravenous';
  if (n.includes('intramusc')) return 'intramuscular';
  if (n.includes('sublingual')) return 'sublingual';
  if (n.includes('inhal') || n.includes('pulmonar')) return 'inhalation';
  if (n.includes('transderm')) return 'transdermal';
  if (n.includes('cutane') || n.includes('topic')) return 'topical';
  if (n.includes('oral') || n.includes('bucal')) return 'oral';
  return 'other';
}

/** Vías posibles para el medicamento elegido (sin duplicados; «Otra» si CIMA no informa ninguna). */
export function routeOptions(dto: Pick<CimaDto, 'routes'>): string[] {
  const codes = [...new Set(dto.routes.map(routeCodeFromCima))];
  return codes.length ? codes : ['other'];
}

const ATC_RE = /^[A-Z][0-9]{2}[A-Z]{0,2}[0-9]{0,2}$/;
const NREG_RE = /^[0-9A-Za-z/-]{1,20}$/;
const CN_RE = /^[0-9]{6,7}$/;

export type TreatmentForm = { dose_amount: string; dose_unit: string; frequency_code: string; route: string; start_date: string };

/** Carga útil para carmo_treatments a partir del medicamento de CIMA y del formulario. Lanza si falta algo obligatorio. */
export function treatmentPayload(dto: CimaDto, form: TreatmentForm, patientId: string, visitId: string | null): Record<string, unknown> {
  if (!dto.cima_nregistro || !NREG_RE.test(dto.cima_nregistro)) throw new Error('El medicamento de CIMA no tiene número de registro válido.');
  if (!FREQUENCY_LABELS[form.frequency_code]) throw new Error('Seleccione la pauta.');
  if (form.dose_amount && !(Number(form.dose_amount) > 0)) throw new Error('La dosis debe ser mayor que cero.');
  if (form.dose_amount && !(DOSE_UNITS as readonly string[]).includes(form.dose_unit)) throw new Error('Seleccione la unidad de la dosis.');
  if (!ROUTE_LABELS[form.route]) throw new Error('Seleccione la vía.');
  const atc = dto.atc_codes.find((c) => ATC_RE.test(c)) ?? null;
  return {
    patient_id: patientId,
    visit_id: visitId,
    active_ingredient: activeIngredientFromCima(dto),
    cima_nregistro: dto.cima_nregistro,
    cima_cn: dto.cima_cn && CN_RE.test(dto.cima_cn) ? dto.cima_cn : null,
    cima_name: dto.cima_name.slice(0, 300),
    atc_code: atc,
    pharmaceutical_form: dto.pharmaceutical_form?.slice(0, 200) ?? null,
    cima_snapshot: {
      nregistro: dto.cima_nregistro, cn: dto.cima_cn, nombre: dto.cima_name, principios_activos: dto.ingredient_names, laboratorio: dto.labtitular,
      forma: dto.pharmaceutical_form, vias: dto.routes, atc: dto.atc_codes, estado: dto.authorization_status, comercializado: dto.commercialized, consultado: dto.fetched_at,
    },
    dose_amount: form.dose_amount ? Number(form.dose_amount) : null,
    dose_unit: form.dose_amount ? form.dose_unit : null,
    frequency_code: form.frequency_code,
    route: form.route,
    start_date: form.start_date,
  };
}

/** Tratamientos vigentes (activos o suspendidos): los que cuentan para la revisión de la visita y la polimedicación. */
export function currentTreatments<T extends { status: string }>(treatments: T[]): T[] {
  return treatments.filter((t) => t.status === 'active' || t.status === 'suspended');
}

type CountableTreatment = { status: string; active_ingredient: string; frequency_code: string | null; cima_snapshot?: { principios_activos?: unknown } | null };

/**
 * Principios activos concurrentes y crónicos (variable «polimedicación» del modelo CMO): principios activos
 * distintos de los tratamientos ACTIVOS, sin pautas a demanda ni dosis únicas. Una combinación cuenta cada
 * principio activo. Los registros previos sin CIMA cuentan por su principio activo escrito.
 */
export function chronicActiveIngredients(treatments: CountableTreatment[]): string[] {
  const names = new Set<string>();
  for (const t of treatments) {
    if (t.status !== 'active' || t.frequency_code === 'prn' || t.frequency_code === 'single') continue;
    const fromCima = t.cima_snapshot?.principios_activos;
    const list = Array.isArray(fromCima) && fromCima.length ? fromCima.map(String) : t.active_ingredient.split(' + ');
    for (const n of list) {
      const key = stripAccents(n).toLowerCase().replace(/\s+/g, ' ').trim();
      if (key) names.add(key);
    }
  }
  return [...names].sort();
}
