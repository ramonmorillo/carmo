// Historial de la visita (carmo_visit_state_log): cambios de estado de la visita (anulada, no realizada,
// realizada…) y del registro (borrador, revisada, cerrada, reabierta) con su motivo. Lógica pura.
// Los motivos son los guardados en su momento: nunca se generan retroactivamente; si no constan, se indica.

export type VisitLogRow = {
  id: number; visit_id: string; kind: 'record_state' | 'status'; from_state: string; to_state: string; reason: string | null;
  actor_id: string | null; actor_role: string | null; actor_name: string | null; at: string;
};

const STATUS_NAMES: Record<string, string> = { planned: 'Prevista', done: 'Realizada', not_done: 'No realizada', cancelled: 'Anulada', none: 'Alta' };
const RECORD_NAMES: Record<string, string> = { draft: 'Borrador', reviewed: 'Revisada', closed: 'Cerrada' };

export type VisitEvent = {
  id: number; at: string; title: string; kind: VisitLogRow['kind'];
  /** Texto del motivo guardado, si lo hay. */
  reason: string | null;
  /** Se esperaba un motivo (anulación, no realización o reapertura) y no consta. */
  reasonMissing: boolean;
  actorName: string | null; actorRole: string | null;
};

export function describeVisitEvent(row: VisitLogRow): VisitEvent {
  const reason = row.reason && row.reason.trim() ? row.reason.trim() : null;
  let title: string;
  let expectsReason = false;
  if (row.kind === 'status') {
    const to = STATUS_NAMES[row.to_state] ?? row.to_state;
    if (row.from_state === row.to_state) title = `Motivo de la visita ${to.toLowerCase()} modificado`;
    else if (row.from_state === 'none') title = `Visita registrada como ${to.toLowerCase()}`;
    else title = `${STATUS_NAMES[row.from_state] ?? row.from_state} → ${to}`;
    expectsReason = row.to_state === 'cancelled' || row.to_state === 'not_done';
    if (row.to_state === 'cancelled' && row.from_state !== row.to_state && row.from_state !== 'none') title = `Anulada (estado anterior: ${(STATUS_NAMES[row.from_state] ?? row.from_state).toLowerCase()})`;
    if (row.to_state === 'not_done' && row.from_state !== row.to_state && row.from_state !== 'none') title = `Marcada como no realizada (estado anterior: ${(STATUS_NAMES[row.from_state] ?? row.from_state).toLowerCase()})`;
  } else if (row.to_state === 'draft' && row.from_state !== 'draft') {
    title = `Reabierta (estaba ${(RECORD_NAMES[row.from_state] ?? row.from_state).toLowerCase()})`;
    expectsReason = true;
  } else if (row.to_state === 'closed') title = 'Cerrada: datos bloqueados';
  else if (row.to_state === 'reviewed') title = 'Marcada como revisada';
  else title = `${RECORD_NAMES[row.from_state] ?? row.from_state} → ${RECORD_NAMES[row.to_state] ?? row.to_state}`;
  return { id: row.id, at: row.at, title, kind: row.kind, reason, reasonMissing: expectsReason && !reason, actorName: row.actor_name, actorRole: row.actor_role };
}

/** Eventos en orden cronológico (a igual instante, por id: la secuencia se conserva). */
export function visitEvents(rows: VisitLogRow[]): VisitEvent[] {
  return [...rows].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id).map(describeVisitEvent);
}
