import { describe, expect, it } from 'vitest';
import { visitEvents, type VisitLogRow } from '../src/domain/visitEvents';

const row = (id: number, kind: VisitLogRow['kind'], from: string, to: string, reason: string | null, at: string): VisitLogRow => ({
  id, visit_id: 'v', kind, from_state: from, to_state: to, reason, actor_id: 'u', actor_role: 'site_pi', actor_name: 'Ana', at,
});

describe('historial de la visita', () => {
  it('conserva la secuencia anular → cerrar → reabrir → corregir el motivo → cerrar, con sus motivos', () => {
    const events = visitEvents([
      row(5, 'record_state', 'draft', 'closed', null, '2026-11-12T10:00:00Z'),
      row(3, 'status', 'planned', 'cancelled', 'Ingreso hospitalario', '2026-11-10T09:00:00Z'),
      row(6, 'record_state', 'closed', 'draft', 'Corregir el motivo', '2026-11-13T09:00:00Z'),
      row(7, 'status', 'cancelled', 'cancelled', 'Ingreso hospitalario (corregido)', '2026-11-13T09:05:00Z'),
      row(8, 'record_state', 'draft', 'closed', null, '2026-11-13T09:10:00Z'),
    ]);
    expect(events.map((e) => e.id)).toEqual([3, 5, 6, 7, 8]);
    expect(events[0]).toMatchObject({ reason: 'Ingreso hospitalario', reasonMissing: false });
    expect(events[0].title).toContain('Anulada');
    expect(events[2]).toMatchObject({ reason: 'Corregir el motivo', reasonMissing: false });
    expect(events[2].title).toContain('Reabierta');
    expect(events[3].reason).toBe('Ingreso hospitalario (corregido)');
    expect(events[4].title).toBe('Cerrada: datos bloqueados');
  });

  it('visitas históricas sin motivo: se indica la ausencia, sin inventarlo (solo cuando era pertinente)', () => {
    const [cancelled, reopened, closed, done] = visitEvents([
      row(1, 'status', 'planned', 'cancelled', null, '2026-11-10T09:00:00Z'),
      row(2, 'record_state', 'closed', 'draft', '  ', '2026-11-11T09:00:00Z'),
      row(3, 'record_state', 'draft', 'closed', null, '2026-11-12T09:00:00Z'),
      row(4, 'status', 'planned', 'done', null, '2026-11-13T09:00:00Z'),
    ]);
    expect(cancelled).toMatchObject({ reason: null, reasonMissing: true });
    expect(reopened).toMatchObject({ reason: null, reasonMissing: true });
    expect(closed.reasonMissing).toBe(false);
    expect(done.reasonMissing).toBe(false);
  });

  it('a igual instante conserva el orden de registro (id)', () => {
    const at = '2026-11-10T09:00:00Z';
    const events = visitEvents([row(11, 'record_state', 'draft', 'closed', null, at), row(10, 'status', 'planned', 'not_done', 'No acude', at)]);
    expect(events.map((e) => e.id)).toEqual([10, 11]);
    expect(events[0].title).toContain('no realizada');
  });
});
