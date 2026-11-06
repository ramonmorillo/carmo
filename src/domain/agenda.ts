// Agenda (misma organización que DERMAPEX): las visitas de carmo_visits situadas en el calendario. No hay
// tabla de citas: una cita es una visita prevista con fecha. Adaptado de dermapex/src/utils/agenda.ts al
// modelo de CARMO (planned_date / actual_date; estados planned / done / not_done / cancelled).
import { PROGRAMMED_VISITS } from './study';

export type AgendaVisit = { id: string; patient_id: string; code: string; visit_code: string; planned_date: string | null; actual_date: string | null; status: string; record_state: string };
export type AgendaStatus = 'completed' | 'scheduled' | 'overdue' | 'cancelled';

export const AGENDA_STATUS_LABELS: Record<AgendaStatus, string> = {
  completed: 'Realizada', scheduled: 'Prevista', overdue: 'Prevista vencida', cancelled: 'No realizada / anulada',
};
export const AGENDA_STATUS_TONES: Record<AgendaStatus, 'positive' | 'info' | 'warning' | 'neutral'> = {
  completed: 'positive', scheduled: 'info', overdue: 'warning', cancelled: 'neutral',
};
export const STATUS_ORDER: AgendaStatus[] = ['scheduled', 'overdue', 'completed', 'cancelled'];

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Fecha local ISO (YYYY-MM-DD), sin desplazamiento por zona horaria. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}
export const monthKey = (iso: string) => iso.slice(0, 7);
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}
export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function formatLongDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
}

/** Fecha en la agenda: la efectiva si consta; si no, la prevista. */
export function agendaDate(v: Pick<AgendaVisit, 'actual_date' | 'planned_date'>): string | null {
  return (v.actual_date ?? v.planned_date)?.slice(0, 10) ?? null;
}

export function getAgendaStatus(v: Pick<AgendaVisit, 'status' | 'planned_date'>, today: string): AgendaStatus {
  if (v.status === 'cancelled' || v.status === 'not_done') return 'cancelled';
  if (v.status === 'done') return 'completed';
  if (v.planned_date && v.planned_date.slice(0, 10) < today) return 'overdue';
  return 'scheduled';
}

/** Rejilla de 6 semanas (42 días) que empieza en lunes. */
export function buildMonthGrid(key: string): Array<{ iso: string; inMonth: boolean }> {
  const [y, m] = key.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const start = toIsoDate(new Date(y, m - 1, 1 - offset));
  return Array.from({ length: 42 }, (_, i) => { const iso = addDays(start, i); return { iso, inMonth: monthKey(iso) === key }; });
}

const ORDER = [...PROGRAMMED_VISITS, 'EXTRA'] as string[];
export function compareAgendaVisits(a: AgendaVisit, b: AgendaVisit): number {
  return (agendaDate(a) ?? '9999-12-31').localeCompare(agendaDate(b) ?? '9999-12-31') || a.code.localeCompare(b.code)
    || ORDER.indexOf(a.visit_code) - ORDER.indexOf(b.visit_code);
}

export function filterAgendaVisits(visits: AgendaVisit[], f: { month: string | null; patientId: string | null; statuses: AgendaStatus[] }, today: string): AgendaVisit[] {
  return visits.filter((v) => {
    if (f.patientId && v.patient_id !== f.patientId) return false;
    const date = agendaDate(v);
    if (f.month && (!date || monthKey(date) !== f.month)) return false;
    return !(f.statuses.length > 0 && !f.statuses.includes(getAgendaStatus(v, today)));
  }).sort(compareAgendaVisits);
}

export function groupByDate(visits: AgendaVisit[]): Map<string, AgendaVisit[]> {
  const map = new Map<string, AgendaVisit[]>();
  for (const v of visits) { const d = agendaDate(v); if (d) map.set(d, [...(map.get(d) ?? []), v]); }
  return map;
}

export function summarizeAgenda(visits: AgendaVisit[], today: string): Record<AgendaStatus, number> & { total: number } {
  const s = { total: 0, completed: 0, scheduled: 0, overdue: 0, cancelled: 0 };
  for (const v of visits) { s[getAgendaStatus(v, today)] += 1; s.total += 1; }
  return s;
}

/** Tono del contador de un día: lo pendiente de actuar manda sobre lo ya resuelto. */
export function dayTone(statuses: AgendaStatus[]): AgendaStatus {
  if (statuses.includes('overdue')) return 'overdue';
  if (statuses.includes('scheduled')) return 'scheduled';
  if (statuses.includes('completed')) return 'completed';
  return 'cancelled';
}
