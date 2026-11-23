import { FormEvent, useState } from 'react';

import { fmtDateTime } from '../components/ui/VisitEventHistory';
import { Notice } from '../components/ui/Notice';
import { SaveStatus } from '../components/ui/SaveStatus';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CONSENT_EVENT_LABELS, consentEventsChronological, describeConsentChanges, type ConsentEventRow } from '../domain/consentHistory';
import { FUTURE_USE_LABELS, ROLE_CAN, ROLE_LABELS } from '../domain/study';
import { fmtDate, label, todayIso } from '../lib/format';
import { type CarmoSession } from '../lib/session';
import { useSave } from '../lib/useSave';
import { carmoWrite, type Consent, type Patient, type Profile } from '../services/carmoData';

type Props = { patient: Patient; consents: Consent[]; events: ConsentEventRow[]; investigators: Profile[]; profiles: Profile[]; session: CarmoSession; reload: () => Promise<void> };

const SCOPES = {
  stop_followup_data_pending_decision: 'Cese del seguimiento; uso de los datos pendiente de decisión (RG-10)',
  stop_followup_keep_data: 'Cese del seguimiento; datos conservados',
} as const;

/**
 * Consentimiento informado: constancia, rectificación y retirada como acciones DIFERENCIADAS, con historial
 * (fecha, autor, motivo y cambio). La rectificación corrige un error de registro; la retirada es la decisión
 * del participante. Ninguna reescribe el pasado: cada cambio queda en carmo_consent_events.
 */
export function ConsentPanel({ patient, consents, events, investigators, profiles, session, reload }: Props) {
  const canWrite = ROLE_CAN.writeClinical(session.role);
  const save = useSave();
  const [open, setOpen] = useState<{ id: string; mode: 'rectify' | 'withdraw' } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? investigators.find((p) => p.id === id)?.full_name ?? null;
  const withdrawnWhileIncluded = patient.status === 'included' && consents.some((c) => c.status === 'withdrawn');
  const finishFollowUp = () => void save.run(() => carmoWrite.update('carmo_patients', { status: 'withdrawn', status_reason: 'consent_withdrawn' }, { id: patient.id }), reload);

  return (
    <section className="card" aria-label="Consentimiento informado">
      <h2>Consentimiento informado</h2>
      <p className="carmo-hint">
        <strong>Rectificar</strong> corrige un error de registro (fecha, versión, investigador, destino de los datos); <strong>retirar</strong> registra la decisión del participante de retirar su consentimiento.
        Son acciones distintas y ambas quedan en el historial con autor, fecha y motivo. El documento firmado se archiva en el centro.
      </p>
      {withdrawnWhileIncluded ? (
        <Notice tone="warning" title="Consentimiento retirado con seguimiento aún activo">
          El paciente sigue en estado «Incluido». La retirada del consentimiento finaliza el seguimiento; los datos ya recogidos se conservan (uso posterior pendiente de definir, RG-10).
          {canWrite ? <div className="carmo-actions"><button type="button" className="button-link" disabled={save.saving} onClick={finishFollowUp}>Finalizar el seguimiento por retirada del consentimiento</button></div> : null}
        </Notice>
      ) : null}
      {consents.length === 0 ? <p className="text-muted">Sin consentimiento registrado.</p> : consents.map((c) => (
        <div key={c.id} data-testid="consent-item" style={{ margin: "0.75rem 0" }}>
          <p>
            <strong>Versión «{c.document_version}»</strong> · firmado {fmtDate(c.signed_date)}{' '}
            {c.status === 'signed' ? <StatusBadge tone="positive">Vigente</StatusBadge> : <StatusBadge tone="warning">Retirado {fmtDate(c.withdrawal_date)}</StatusBadge>}
            <br /><span className="text-muted">Investigador: {nameOf(c.investigator_id) ?? '—'} · datos al terminar: {label(FUTURE_USE_LABELS, c.future_use_choice)}</span>
            {c.status === 'withdrawn' ? <><br /><span className="text-muted">Retirada: {c.withdrawal_reason ?? 'motivo no registrado (registro anterior a esta versión)'} · {label(SCOPES, c.withdrawal_scope)}</span></> : null}
          </p>
          {canWrite ? (
            <div className="carmo-actions">
              <button type="button" className="button-secondary button-sm" disabled={save.saving} onClick={() => { setNotice(null); setOpen(open?.id === c.id && open.mode === 'rectify' ? null : { id: c.id, mode: 'rectify' }); }}>Rectificar consentimiento</button>
              {c.status === 'signed' ? <button type="button" className="button-secondary button-sm" disabled={save.saving} onClick={() => { setNotice(null); setOpen(open?.id === c.id && open.mode === 'withdraw' ? null : { id: c.id, mode: 'withdraw' }); }}>Retirar consentimiento</button> : null}
            </div>
          ) : null}
          {open?.id === c.id && open.mode === 'rectify' ? <RectifyForm consent={c} investigators={investigators} save={save} setNotice={setNotice} onDone={async () => { setOpen(null); await reload(); }} onCancel={() => setOpen(null)} /> : null}
          {open?.id === c.id && open.mode === 'withdraw' ? <WithdrawForm consent={c} patient={patient} save={save} onDone={async () => { setOpen(null); await reload(); }} onCancel={() => setOpen(null)} /> : null}
        </div>
      ))}
      {notice ? <Notice tone="info">{notice}</Notice> : null}
      <SaveStatus state={save.state} />

      <h3>Historial del consentimiento</h3>
      {events.length === 0 ? <p className="text-muted">Sin historial registrado.</p> : (
        <div className="table-wrap"><table className="carmo-table" aria-label="Historial del consentimiento">
          <thead><tr><th>Fecha y hora</th><th>Acción</th><th>Autor</th><th>Motivo</th><th>Cambio</th></tr></thead>
          <tbody>{consentEventsChronological(events).map((e) => (
            <tr key={e.id}>
              <td>{fmtDateTime(e.at)}</td><td>{CONSENT_EVENT_LABELS[e.event_type]}</td>
              <td>{e.actor_name ?? (e.actor_role ? label(ROLE_LABELS, e.actor_role) : 'Administración (SQL)')}</td>
              <td>{e.reason ?? <span className="text-muted">{e.event_type === 'recorded' ? '—' : 'No registrado'}</span>}</td>
              <td>{describeConsentChanges(e, nameOf).map((l) => <div key={l.field}><strong>{l.label}:</strong> {l.from ? `${l.from} → ` : ''}{l.to}</div>)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

type SaveApi = ReturnType<typeof useSave>;

function RectifyForm({ consent, investigators, save, setNotice, onDone, onCancel }: { consent: Consent; investigators: Profile[]; save: SaveApi; setNotice: (m: string | null) => void; onDone: () => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState({
    document_version: consent.document_version, signed_date: consent.signed_date, investigator_id: consent.investigator_id,
    future_use_choice: consent.future_use_choice ?? '', withdrawal_date: consent.withdrawal_date ?? '', reason: '',
  });
  const known = investigators.some((p) => p.id === consent.investigator_id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const changes: Record<string, unknown> = {};
    if (f.document_version.trim() !== consent.document_version) changes.document_version = f.document_version.trim();
    if (f.signed_date !== consent.signed_date) changes.signed_date = f.signed_date;
    if (f.investigator_id !== consent.investigator_id) changes.investigator_id = f.investigator_id;
    if ((f.future_use_choice || null) !== consent.future_use_choice) changes.future_use_choice = f.future_use_choice || null;
    if (consent.status === 'withdrawn' && f.withdrawal_date && f.withdrawal_date !== consent.withdrawal_date) changes.withdrawal_date = f.withdrawal_date;
    if (Object.keys(changes).length === 0) { setNotice('No hay cambios que registrar: modifique algún campo para rectificar el consentimiento.'); return; }
    setNotice(null);
    void save.run(() => carmoWrite.update('carmo_consents', { ...changes, correction_reason: f.reason.trim() }, { id: consent.id }), onDone);
  };
  return (
    <form className="carmo-form" onSubmit={submit} aria-label="Rectificar consentimiento">
      <label>Versión documental de la HIP/CI<input required maxLength={80} value={f.document_version} onChange={(e) => setF({ ...f, document_version: e.target.value })} /></label>
      <label>Fecha de firma<input type="date" required max={todayIso()} value={f.signed_date} onChange={(e) => setF({ ...f, signed_date: e.target.value })} /></label>
      <label>Investigador responsable<select value={f.investigator_id} onChange={(e) => setF({ ...f, investigator_id: e.target.value })}>
        {!known ? <option value={consent.investigator_id}>Investigador registrado (sin cambios)</option> : null}
        {investigators.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? 'Investigador/a'}</option>)}
      </select></label>
      <label>Destino de los datos al terminar (elección en el CI)<select value={f.future_use_choice} onChange={(e) => setF({ ...f, future_use_choice: e.target.value })}>
        <option value="">No consta</option>{Object.entries(FUTURE_USE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {consent.status === 'withdrawn' ? <label>Fecha de retirada<input type="date" min={f.signed_date} max={todayIso()} value={f.withdrawal_date} onChange={(e) => setF({ ...f, withdrawal_date: e.target.value })} /></label> : null}
      <label className="span-all">Motivo de la rectificación (obligatorio, mínimo 5 caracteres)<input required minLength={5} maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      <div className="carmo-actions span-all">
        <button className="button-link" type="submit" disabled={save.saving}>Guardar rectificación</button>
        <button className="button-ghost" type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function WithdrawForm({ consent, patient, save, onDone, onCancel }: { consent: Consent; patient: Patient; save: SaveApi; onDone: () => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState({ withdrawal_date: todayIso(), withdrawal_scope: 'stop_followup_data_pending_decision', reason: '', confirm: false });
  const ends = patient.status === 'included';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await save.run(() => carmoWrite.update('carmo_consents', {
      status: 'withdrawn', withdrawal_date: f.withdrawal_date, withdrawal_scope: f.withdrawal_scope, withdrawal_reason: f.reason.trim(),
    }, { id: consent.id }));
    if (!ok) return;
    // La retirada finaliza el seguimiento (la BD exige la retirada registrada antes de cambiar el estado del paciente).
    if (ends && !(await save.run(() => carmoWrite.update('carmo_patients', { status: 'withdrawn', status_reason: 'consent_withdrawn' }, { id: patient.id })))) { await onDone(); return; }
    await onDone();
  };
  return (
    <form className="carmo-form" onSubmit={(e) => void submit(e)} aria-label="Retirar consentimiento">
      <label>Fecha de la retirada<input type="date" required min={consent.signed_date} max={todayIso()} value={f.withdrawal_date} onChange={(e) => setF({ ...f, withdrawal_date: e.target.value })} /></label>
      <label>Alcance<select value={f.withdrawal_scope} onChange={(e) => setF({ ...f, withdrawal_scope: e.target.value })}>
        {Object.entries(SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="span-all">Motivo de la retirada (obligatorio, mínimo 5 caracteres)<input required minLength={5} maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      <label className="span-all"><span><input type="checkbox" checked={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.checked })} />{' '}
        Confirmo que el participante retira su consentimiento.{' '}
        {ends ? 'Esto finaliza su seguimiento (estado «Retirado»); los datos ya recogidos se conservan y su uso posterior está pendiente de definir (RG-10).' : 'Los datos ya recogidos se conservan; su uso posterior está pendiente de definir (RG-10).'}
        {' '}La retirada no se revierte desde la aplicación: un nuevo consentimiento exige registrarlo de nuevo.</span></label>
      <div className="carmo-actions span-all">
        <button className="button-link" type="submit" disabled={save.saving || !f.confirm}>Confirmar retirada del consentimiento</button>
        <button className="button-ghost" type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
