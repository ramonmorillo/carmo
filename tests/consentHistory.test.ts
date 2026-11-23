import { describe, expect, it } from 'vitest';
import { consentEventsChronological, describeConsentChanges, formatConsentValue, type ConsentEventRow } from '../src/domain/consentHistory';

const ev = (id: number, type: ConsentEventRow['event_type'], changes: ConsentEventRow['changes'], at: string, reason: string | null = null): ConsentEventRow => ({
  id, consent_id: 'c', patient_id: 'p', event_type: type, changes, reason, actor_id: 'u', actor_role: 'site_investigator', actor_name: 'María', at,
});

describe('historial del consentimiento', () => {
  it('muestra el cambio campo a campo con valores legibles', () => {
    const lines = describeConsentChanges(ev(2, 'rectified', {
      signed_date: { from: '2026-11-07', to: '2026-11-06' }, future_use_choice: { from: 'delete', to: 'keep_pseudonymized' }, investigator_id: { from: 'a', to: 'b' },
    }, '2026-11-10T10:00:00Z', 'Fecha mal transcrita'), (id) => (id === 'b' ? 'Dra. B' : null));
    expect(lines).toEqual([
      { field: 'signed_date', label: 'Fecha de firma', from: '07/11/2026', to: '06/11/2026' },
      { field: 'investigator_id', label: 'Investigador responsable', from: 'Otro investigador del centro', to: 'Dra. B' },
      { field: 'future_use_choice', label: 'Destino de los datos', from: 'Eliminados al terminar el estudio', to: 'Conservados seudonimizados para usos futuros' },
    ]);
  });

  it('en el alta solo se muestra el valor registrado', () => {
    const lines = describeConsentChanges(ev(1, 'recorded', { document_version: { from: null, to: 'v1' }, signed_date: { from: null, to: '2026-11-07' } }, '2026-11-07T10:00:00Z'));
    expect(lines.map((l) => [l.label, l.from, l.to])).toEqual([['Versión documental', '', 'v1'], ['Fecha de firma', '', '07/11/2026']]);
  });

  it('retirada: estado, fecha, alcance y motivo', () => {
    const lines = describeConsentChanges(ev(3, 'withdrawn', {
      status: { from: 'signed', to: 'withdrawn' }, withdrawal_date: { from: null, to: '2026-11-20' },
      withdrawal_scope: { from: null, to: 'stop_followup_data_pending_decision' }, withdrawal_reason: { from: null, to: 'El participante lo solicita' },
    }, '2026-11-20T10:00:00Z', 'El participante lo solicita'));
    expect(lines.map((l) => l.label)).toEqual(['Estado', 'Fecha de retirada', 'Alcance de la retirada', 'Motivo de la retirada']);
    expect(lines[0]).toMatchObject({ from: 'Vigente', to: 'Retirado' });
    expect(formatConsentValue('withdrawal_date', null)).toBe('—');
  });

  it('ordena cronológicamente conservando la secuencia', () => {
    const rows = [ev(3, 'withdrawn', {}, '2026-11-20T10:00:00Z'), ev(1, 'recorded', {}, '2026-11-07T10:00:00Z'), ev(2, 'rectified', {}, '2026-11-07T10:00:00Z')];
    expect(consentEventsChronological(rows).map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
