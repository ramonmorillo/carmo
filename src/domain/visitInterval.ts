// Tiempo real desde la visita inicial. Lógica pura (sin zona horaria): diferencia en DÍAS DE CALENDARIO
// entre dos fechas AAAA-MM-DD. Se calcula con Date.UTC para que los cambios de hora (DST) no alteren el
// resultado: con marcas locales, un intervalo que cruza el cambio de hora daría 8,96 o 9,04 días.

export type IntervalVisit = { id: string; visit_code: string; status: string; actual_date: string | null };

export type VisitInterval =
  | { available: true; days: number }
  | { available: false; reason: 'not_done' | 'no_actual_date' | 'no_baseline' | 'chronology' };

export const INTERVAL_UNAVAILABLE_LABELS: Record<Exclude<VisitInterval, { available: true }>['reason'], string> = {
  not_done: 'Intervalo no disponible: la visita no está realizada.',
  no_actual_date: 'Intervalo no disponible: falta la fecha efectiva de la visita.',
  no_baseline: 'Intervalo no disponible: no hay visita inicial realizada con fecha efectiva.',
  chronology: 'Intervalo no disponible: la fecha efectiva es anterior a la de la visita inicial (incoherencia cronológica).',
};

/** Número de días de calendario entre dos fechas ISO (to − from). Null si alguna no es una fecha válida. */
export function calendarDaysBetween(fromIso: string, toIso: string): number | null {
  const parse = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(t) ? null : t;
  };
  const a = parse(fromIso);
  const b = parse(toIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Visita inicial válida: realizada y con fecha efectiva (las anuladas no cuentan). */
export function validBaseline<T extends IntervalVisit>(visits: T[]): T | null {
  return visits
    .filter((v) => v.visit_code === 'BASAL' && v.status === 'done' && v.actual_date)
    .sort((a, b) => (a.actual_date as string).localeCompare(b.actual_date as string))[0] ?? null;
}

/** Días desde la visita inicial hasta la fecha efectiva de `visit` (0 en la propia inicial). */
export function intervalFromBaseline(visit: IntervalVisit, visits: IntervalVisit[]): VisitInterval {
  if (visit.status !== 'done') return { available: false, reason: 'not_done' };
  if (!visit.actual_date) return { available: false, reason: 'no_actual_date' };
  const baseline = validBaseline(visits);
  if (!baseline) return { available: false, reason: 'no_baseline' };
  if (baseline.id === visit.id) return { available: true, days: 0 };
  const days = calendarDaysBetween(baseline.actual_date as string, visit.actual_date);
  if (days === null) return { available: false, reason: 'no_actual_date' };
  if (days < 0) return { available: false, reason: 'chronology' };
  return { available: true, days };
}

export function intervalLabel(interval: VisitInterval): string {
  if (!interval.available) return 'No disponible';
  return interval.days === 1 ? '1 día' : `${interval.days} días`;
}
