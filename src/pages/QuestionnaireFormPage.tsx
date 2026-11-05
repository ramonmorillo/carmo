import { FormEvent, useEffect, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { SaveStatus } from '../components/ui/SaveStatus';
import { IEXPAC_ITEMS, scoreIexpac } from '../domain/iexpac';
import { patientCode, ROLE_CAN, VISIT_LABELS } from '../domain/study';
import { fmtNum, label, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { useSave } from '../lib/useSave';
import { carmo, carmoWrite, type Administration, type Instrument, type Patient, type Visit } from '../services/carmoData';

// Opciones de respuesta del IEXPAC (codificación 1-5). El enunciado de los ítems NO se reproduce en este
// repositorio público: se usa el instrumento autorizado (papel o versión aprobada) y aquí se registra el código.
const OPTIONS = [[1, 'Nunca'], [2, 'Casi nunca'], [3, 'A veces'], [4, 'Casi siempre'], [5, 'Siempre']] as const;

export function QuestionnaireFormPage() {
  const { visitId = '', instrument = '' } = useParams();
  const session = useCarmoSession();
  const save = useSave();
  const [ctx, setCtx] = useState<{ visit: Visit; patient: Patient; instrument: Instrument; existing: Administration | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState({ administration_mode: 'self', data_source: 'paper', administration_date: todayIso(), correction_reason: '', not_done_reason: '' });
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    try {
      const visit = await carmo.visit(visitId);
      if (!visit) { setError('Visita no accesible.'); return; }
      const [patient, instruments, admins] = await Promise.all([carmo.patient(visit.patient_id), carmo.instruments(), carmo.administrations(visit.patient_id)]);
      const inst = instruments.find((i) => i.code === instrument);
      if (!patient || !inst) { setError('Instrumento o paciente no disponible.'); return; }
      const existing = admins.find((a) => a.visit_id === visit.id && a.instrument_code === inst.code) ?? null;
      setCtx({ visit, patient, instrument: inst, existing });
      if (existing) {
        setResponses(existing.responses ?? {});
        setMeta((m) => ({ ...m, administration_mode: existing.administration_mode ?? 'self', data_source: existing.data_source ?? 'paper', administration_date: existing.administration_date ?? todayIso(), correction_reason: '' }));
      }
      setDirty(false);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, [visitId, instrument]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (error) return <ErrorState message={error} />;
  if (!ctx) return <LoadingState label="Cargando cuestionario…" />;
  if (ctx.instrument.status !== 'active') return <Notice tone="warning" title={`${ctx.instrument.code} no habilitado`}>Pendiente de verificar versión, licencia y regla de puntuación. {ctx.instrument.notes}</Notice>;
  if (ctx.instrument.code !== 'IEXPAC') return <Notice tone="warning">Formulario no implementado para {ctx.instrument.code}.</Notice>;

  const closed = ctx.visit.record_state === 'closed';
  const canWrite = ROLE_CAN.writeQuestionnaire(session.role) && !closed;
  const completed = ctx.existing?.status === 'completed';
  const preview = scoreIexpac(responses);

  const persist = (status: 'in_progress' | 'completed' | 'not_done') => {
    const values: Record<string, unknown> = status === 'not_done'
      ? { status, not_done_reason: meta.not_done_reason || 'other', responses: {}, administration_mode: null, data_source: null, administration_date: null }
      : { status, not_done_reason: null, responses, administration_mode: meta.administration_mode, data_source: meta.data_source, administration_date: meta.administration_date };
    void save.run(() => (ctx.existing
      ? carmoWrite.update('carmo_questionnaire_administrations', { ...values, revision: ctx.existing.revision, correction_reason: meta.correction_reason || null }, { id: ctx.existing.id, revision: ctx.existing.revision })
      : carmoWrite.insert('carmo_questionnaire_administrations', { ...values, visit_id: ctx.visit.id, patient_id: ctx.patient.id, instrument_code: ctx.instrument.code })), load);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); persist('completed'); };

  return (
    <div className="page-stack">
      <PageHeader eyebrow={<Link to={`/visits/${ctx.visit.id}`}>{patientCode(ctx.patient)} · {label(VISIT_LABELS, ctx.visit.visit_code)}</Link>} title={`IEXPAC · ${ctx.instrument.version}`}
        description="Variable principal. Registre el código de cada respuesta según el instrumento autorizado. Puntuación 0-10 solo con los 11 ítems respondidos." />
      {blocker.state === 'blocked' ? (
        <Notice tone="warning" title="Cambios sin guardar"><div className="carmo-actions"><button className="button-secondary" onClick={() => blocker.reset?.()}>Seguir editando</button><button className="button-ghost" onClick={() => blocker.proceed?.()}>Salir sin guardar</button></div></Notice>
      ) : null}
      {closed ? <Notice tone="info">Visita cerrada: solo lectura.</Notice> : null}
      {ctx.visit.visit_code === 'FINAL' && !ctx.existing && session.role !== 'external_evaluator' ? (
        <Notice tone="warning" title="Evaluador no conforme con el protocolo">El protocolo establece que el IEXPAC final lo cumplimenta un miembro de un equipo externo al equipo investigador. Si lo registra usted, quedará marcado como «no conforme».</Notice>
      ) : null}
      {ctx.existing?.evaluator_conformity === 'not_conform' ? <Notice tone="warning">Registrado por un evaluador no externo (no conforme con el protocolo).</Notice> : null}
      <form className="card" onSubmit={submit}>
        <div className="carmo-form">
          <label>Modalidad<select disabled={!canWrite} value={meta.administration_mode} onChange={(e) => { setMeta({ ...meta, administration_mode: e.target.value }); setDirty(true); }}><option value="self">Autoadministrado</option><option value="interviewer">Entrevista</option><option value="assisted">Con ayuda</option></select></label>
          <label>Soporte<select disabled={!canWrite} value={meta.data_source} onChange={(e) => { setMeta({ ...meta, data_source: e.target.value }); setDirty(true); }}><option value="paper">Papel (transcrito)</option><option value="electronic">Electrónico</option></select></label>
          <label>Fecha<input type="date" disabled={!canWrite} max={todayIso()} value={meta.administration_date} onChange={(e) => { setMeta({ ...meta, administration_date: e.target.value }); setDirty(true); }} /></label>
        </div>
        <div className="carmo-items" style={{ marginTop: '1rem' }}>
          {Array.from({ length: IEXPAC_ITEMS }, (_, i) => String(i + 1)).map((item) => (
            <div className="carmo-item" key={item}>
              <strong>Ítem {item}</strong>
              <fieldset disabled={!canWrite} aria-label={`Ítem ${item}`}>
                {OPTIONS.map(([code, text]) => (
                  <label key={code}><input type="radio" name={`item-${item}`} checked={responses[item] === code} onChange={() => { setResponses({ ...responses, [item]: code }); setDirty(true); }} />{code} · {text}</label>
                ))}
                {responses[item] !== undefined && canWrite ? <button type="button" className="button-ghost button-sm" onClick={() => { const r = { ...responses }; delete r[item]; setResponses(r); setDirty(true); }}>Borrar respuesta</button> : <span className="text-muted">{responses[item] === undefined ? 'Sin responder' : ''}</span>}
              </fieldset>
            </div>
          ))}
        </div>
        <Notice tone={preview.valid ? 'success' : 'info'}>
          {preview.itemsAnswered}/11 ítems respondidos. {preview.valid ? `Puntuación prevista: ${fmtNum(preview.global, 4)} (suma ${preview.sum}). La puntuación definitiva la calcula la base de datos.` : 'Sin puntuación global: faltan ítems (no se imputan).'}
        </Notice>
        {completed && canWrite ? <label className="carmo-form"><span>Motivo de la modificación (obligatorio en un cuestionario completado)<input required minLength={5} value={meta.correction_reason} onChange={(e) => setMeta({ ...meta, correction_reason: e.target.value })} /></span></label> : null}
        {canWrite ? (
          <div className="carmo-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="button-secondary" disabled={save.saving} onClick={() => persist('in_progress')}>Guardar borrador</button>
            <button type="submit" className="button-link" disabled={save.saving}>{preview.valid ? 'Guardar como completado' : 'Guardar como completado (incompleto)'}</button>
            <select aria-label="Motivo de no realización" value={meta.not_done_reason} onChange={(e) => setMeta({ ...meta, not_done_reason: e.target.value })}>
              <option value="">Motivo de no realización…</option><option value="patient_declined">Rechazo del paciente</option><option value="unable">No puede cumplimentarlo</option><option value="not_available">No disponible</option><option value="other">Otro</option>
            </select>
            <button type="button" className="button-ghost" disabled={save.saving || !meta.not_done_reason} onClick={() => persist('not_done')}>Registrar como no realizado</button>
          </div>
        ) : null}
        <SaveStatus state={save.state} />
        {ctx.existing ? <p className="carmo-hint">Revisión {ctx.existing.revision} · evaluador: {ctx.existing.evaluator_role ?? '—'} · las modificaciones quedan en la auditoría con valor anterior, nuevo y motivo.</p> : null}
      </form>
    </div>
  );
}
