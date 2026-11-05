// Calendario: fechas previstas y estado de ventana. Misma regla que la vista carmo_visit_windows.

export type WindowStatus = 'not_applicable' | 'not_done_yet' | 'window_undefined' | 'in_window' | 'out_of_window';

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function diffDays(aIso: string, bIso: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(aIso) - toUtc(bIso)) / 86400000);
}

export function windowStatus(params: {
  isExtra: boolean;
  plannedDate: string | null;
  actualDate: string | null;
  before: number | null;
  after: number | null;
}): WindowStatus {
  if (params.isExtra) return 'not_applicable';
  if (!params.actualDate) return 'not_done_yet';
  if (params.before === null || params.after === null || !params.plannedDate) return 'window_undefined';
  const delta = diffDays(params.actualDate, params.plannedDate);
  return delta >= -params.before && delta <= params.after ? 'in_window' : 'out_of_window';
}

export const WINDOW_STATUS_LABELS: Record<WindowStatus, string> = {
  not_applicable: 'No aplica',
  not_done_yet: 'Pendiente',
  window_undefined: 'Ventana no definida',
  in_window: 'En ventana',
  out_of_window: 'Fuera de ventana',
};

/** ¿Visita prevista vencida (fecha prevista pasada y sin realizar)? */
export function isOverdue(plannedDate: string | null, status: string, todayIso: string): boolean {
  return status === 'planned' && !!plannedDate && plannedDate < todayIso;
}
