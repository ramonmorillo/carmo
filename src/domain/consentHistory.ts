// Historial del consentimiento informado (carmo_consent_events): alta, rectificación y retirada, con
// autor, fecha, motivo y cambio campo a campo. Lógica pura de presentación.
import { FUTURE_USE_LABELS } from './study';

export type ConsentEventRow = {
  id: number; consent_id: string; patient_id: string; event_type: 'recorded' | 'rectified' | 'withdrawn';
  changes: Record<string, { from: unknown; to: unknown }>; reason: string | null; actor_id: string | null; actor_role: string | null; actor_name: string | null; at: string;
};

export const CONSENT_EVENT_LABELS: Record<ConsentEventRow['event_type'], string> = { recorded: 'Alta', rectified: 'Rectificación', withdrawn: 'Retirada' };

const FIELD_LABELS: Record<string, string> = {
  document_version: 'Versión documental', signed_date: 'Fecha de firma', investigator_id: 'Investigador responsable', future_use_choice: 'Destino de los datos',
  status: 'Estado', withdrawal_date: 'Fecha de retirada', withdrawal_scope: 'Alcance de la retirada', withdrawal_reason: 'Motivo de la retirada',
};
const SCOPE_LABELS: Record<string, string> = {
  stop_followup_data_pending_decision: 'Cese del seguimiento; uso de los datos pendiente de decisión (RG-10)',
  stop_followup_keep_data: 'Cese del seguimiento; datos conservados',
};
const STATUS_LABELS: Record<string, string> = { signed: 'Vigente', withdrawn: 'Retirado' };

function fmtIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Valor legible de un campo. `investigator` resuelve el id a un nombre si se conoce. */
export function formatConsentValue(field: string, value: unknown, investigator: (id: string) => string | null = () => null): string {
  if (value === null || value === undefined || value === '') return '—';
  const v = String(value);
  switch (field) {
    case 'signed_date': case 'withdrawal_date': return fmtIso(v);
    case 'future_use_choice': return (FUTURE_USE_LABELS as Record<string, string>)[v] ?? v;
    case 'withdrawal_scope': return SCOPE_LABELS[v] ?? v;
    case 'status': return STATUS_LABELS[v] ?? v;
    case 'investigator_id': return investigator(v) ?? 'Otro investigador del centro';
    default: return v;
  }
}

/** Líneas «Campo: antes → después» de un evento (en altas solo se muestra el valor registrado). */
export function describeConsentChanges(
  event: Pick<ConsentEventRow, 'event_type' | 'changes'>, investigator?: (id: string) => string | null,
): Array<{ field: string; label: string; from: string; to: string }> {
  const order = Object.keys(FIELD_LABELS);
  return Object.entries(event.changes ?? {})
    .filter(([field, c]) => field in FIELD_LABELS && !(event.event_type === 'recorded' && (c?.to === null || c?.to === undefined)))
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([field, c]) => ({ field, label: FIELD_LABELS[field], from: event.event_type === 'recorded' ? '' : formatConsentValue(field, c?.from, investigator), to: formatConsentValue(field, c?.to, investigator) }));
}

export function consentEventsChronological(rows: ConsentEventRow[]): ConsentEventRow[] {
  return [...rows].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
}
