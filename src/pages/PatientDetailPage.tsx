import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { SaveStatus } from '../components/ui/SaveStatus';
import { StatusBadge } from '../components/ui/StatusBadge';
import { pairIexpac } from '../domain/iexpac';
import { effectivePriority, PRIORITY_LABELS, VALIDATION_LABELS } from '../domain/cmoLabels';
import { WINDOW_STATUS_LABELS, isOverdue, type WindowStatus } from '../domain/schedule';
import {
  INCLUSION_BLOCKER_LABELS, MODALITY_LABELS, PATIENT_STATUS_LABELS, PROGRAMMED_VISITS, RECORD_STATE_LABELS, ROLE_CAN,
  FUTURE_USE_LABELS, STATUS_REASON_LABELS, VISIT_LABELS, VISIT_STATUS_LABELS, patientCode, type VisitCode,
} from '../domain/study';
import { fmtDate, fmtNum, label, todayIso } from '../lib/format';
import { useCarmoSession, type CarmoSession } from '../lib/session';
import { useSave } from '../lib/useSave';
import {
  carmo, carmoWrite, type Administration, type Consent, type Deviation, type Dispensation, type EligibilityAnswer, type EligibilityCriterion,
  type CmoModel, type Instrument, type Intervention, type MedicationReview, type ObservationRow, type Variable,
  type Patient, type Profile, type Stratification, type Treatment, type TreatmentEvent, type Visit, type VisitWindow,
} from '../services/carmoData';
import { MedicationPanel } from './MedicationPanel';
import { AuditHistory } from './AuditHistory';
import { computePending, PENDING_KIND_LABELS } from '../domain/pending';
import { completeness, REQ_STATUS_LABELS, visitRequirements, type Requirement, type SectionKey } from '../domain/visitRequirements';

type Data = {
  patient: Patient; visits: Visit[]; windows: VisitWindow[]; criteria: EligibilityCriterion[]; answers: EligibilityAnswer[]; consents: Consent[];
  blockers: string[]; administrations: Administration[]; deviations: Deviation[]; profiles: Profile[];
  treatments: Treatment[]; events: TreatmentEvent[]; dispensations: Dispensation[]; currentStrat: Stratification | null;
  strats: Stratification[]; observations: ObservationRow[]; variables: Variable[]; instruments: Instrument[]; models: CmoModel[];
  reviews: MedicationReview[]; interventions: Intervention[];
};

export function PatientDetailPage() {
  const { id = '' } = useParams();
  const session = useCarmoSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const patient = await carmo.patient(id);
      if (!patient) { setError('Paciente no encontrado o fuera de su ámbito.'); return; }
      const clinical = ROLE_CAN.readClinical(session.role);
      const [visits, windows, criteria, answers, consents, blockers, administrations, deviations, profiles, treatments, events, dispensations, strats, observations, variables, instruments, models, reviews, interventions] = await Promise.all([
        carmo.visits(id), carmo.windows(), carmo.criteria(), clinical ? carmo.answers(id) : [], clinical ? carmo.consents(id) : [],
        patient.status === 'screening' ? carmo.inclusionBlockers(id) : Promise.resolve([] as string[]),
        carmo.administrations(id), clinical ? carmo.deviations(id) : [], carmo.profiles(),
        clinical ? carmo.treatments(id) : [], clinical ? carmo.treatmentEvents(id) : [], clinical ? carmo.dispensations(id) : [],
        clinical ? carmo.stratifications(id) : [],
        clinical ? carmo.observations(id) : [], carmo.variables(), carmo.instruments(), clinical ? carmo.cmoModels() : [],
        clinical ? carmo.medicationReviews(id) : [], clinical ? carmo.interventions(id) : [],
      ]);
      setData({ patient, visits, windows, criteria: criteria.filter((c) => c.set_id === patient.eligibility_set_id).sort((a, b) => a.ordinal - b.ordinal),
        answers, consents, blockers, administrations, deviations, profiles, treatments, events, dispensations,
        currentStrat: strats.find((s) => !strats.some((n) => n.supersedes_id === s.id)) ?? null, strats, observations, variables, instruments, models, reviews, interventions });
    } catch (e) { setError((e as Error).message); }
  }, [id, session.role]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Cargando ficha…" />;
  const { patient } = data;
  const center = session.centers.find((c) => c.id === patient.center_id);
  const iexB = data.administrations.find((a) => a.instrument_code === 'IEXPAC' && data.visits.find((v) => v.id === a.visit_id)?.visit_code === 'BASAL');
  const iexF = data.administrations.find((a) => a.instrument_code === 'IEXPAC' && data.visits.find((v) => v.id === a.visit_id)?.visit_code === 'FINAL');
  const paired = pairIexpac(iexB?.scores?.global, iexF?.scores?.global);
  const pendingVisits = data.visits.filter((v) => isOverdue(v.planned_date, v.status, todayIso())).length;

  return (
    <div className="page-stack">
      <PageHeader eyebrow={`Paciente · ${center?.code ?? ''}`} title={patientCode(patient)}
        description={<>{label(PATIENT_STATUS_LABELS, patient.status)} · cribado {fmtDate(patient.screening_date)} · inclusión {fmtDate(patient.inclusion_date)}{' '}
          {patient.is_synthetic ? <StatusBadge tone="warning">Dato sintético</StatusBadge> : null}</>} />
      <section className="carmo-kpis" aria-label="Resumen del paciente">
        <div className="carmo-kpi"><span>Estado</span><strong style={{ fontSize: '1rem' }}>{label(PATIENT_STATUS_LABELS, patient.status)}</strong></div>
        <div className="carmo-kpi"><span>Prioridad CMO</span><strong style={{ fontSize: '1rem' }}>{data.currentStrat ? PRIORITY_LABELS[effectivePriority(data.currentStrat)] : 'Sin estratificar'}</strong>
          <small>{data.currentStrat ? `${data.currentStrat.total_score} puntos · ${VALIDATION_LABELS[data.currentStrat.validation_status]}` : ''}{ROLE_CAN.readClinical(session.role) && patient.status !== 'screening' && patient.status !== 'not_included' ? <> · <Link to={`/patients/${patient.id}/stratification`}>Estratificación</Link></> : null}</small></div>
        <div className="carmo-kpi"><span>IEXPAC basal → final</span><strong style={{ fontSize: '1rem' }}>{fmtNum(paired.baseline)} → {fmtNum(paired.final)}</strong><small>{paired.paired ? `Diferencia ${fmtNum(paired.difference)}` : 'Sin par completo'}</small></div>
        <div className="carmo-kpi"><span>Visitas previstas vencidas</span><strong>{pendingVisits}</strong></div>
      </section>
      {ROLE_CAN.readClinical(session.role) ? <PendingPanel data={data} /> : null}
      {patient.status === 'screening' ? <InclusionSection data={data} session={session} reload={load} /> : null}
      {patient.status !== 'screening' && patient.status !== 'not_included' ? <VisitsSection data={data} session={session} reload={load} /> : null}
      {ROLE_CAN.readClinical(session.role) && patient.status !== 'screening' && patient.status !== 'not_included' ? (
        <MedicationPanel patient={patient} treatments={data.treatments} events={data.events} dispensations={data.dispensations} canWrite={ROLE_CAN.writeClinical(session.role) && patient.status === 'included'} reload={load} />
      ) : null}
      {ROLE_CAN.writeClinical(session.role) && patient.status === 'included' ? <StudyExitSection data={data} reload={load} /> : null}
      {ROLE_CAN.readClinical(session.role) && patient.status !== 'screening' ? <DeviationsSection data={data} session={session} reload={load} /> : null}
      {session.role === 'coordinator' || session.role === 'monitor' ? <AuditHistory patientId={patient.id} /> : null}
    </div>
  );
}

function InclusionSection({ data, session, reload }: { data: Data; session: CarmoSession; reload: () => Promise<void> }) {
  const save = useSave();
  const canWrite = ROLE_CAN.writeClinical(session.role);
  const [reason, setReason] = useState('');
  const [consent, setConsent] = useState({ document_version: '', signed_date: '', investigator_id: session.userId, future_use_choice: '' });
  const [notIncluded, setNotIncluded] = useState('not_eligible');
  const answerOf = (cid: string) => data.answers.find((a) => a.criterion_id === cid);

  const answer = (c: EligibilityCriterion, isMet: boolean) => {
    const existing = answerOf(c.id);
    if (existing && existing.is_met !== isMet && reason.trim().length < 5) {
      save.run(async () => ({ data: null, error: { message: 'Indique primero el motivo de la corrección (mínimo 5 caracteres).' } }));
      return;
    }
    void save.run(() => (existing
      ? carmoWrite.update('carmo_eligibility_answers', { is_met: isMet, verified_in_source: true, correction_reason: reason }, { patient_id: data.patient.id, criterion_id: c.id })
      : carmoWrite.insert('carmo_eligibility_answers', { patient_id: data.patient.id, criterion_id: c.id, is_met: isMet, verified_in_source: true })), reload);
  };
  const saveConsent = (e: FormEvent) => {
    e.preventDefault();
    void save.run(() => carmoWrite.insert('carmo_consents', { patient_id: data.patient.id, ...consent, future_use_choice: consent.future_use_choice || null }), reload);
  };
  const include = () => void save.run(() => carmoWrite.update('carmo_patients', { status: 'included' }, { id: data.patient.id }), reload);
  const reject = () => void save.run(() => carmoWrite.update('carmo_patients', { status: 'not_included', status_reason: notIncluded }, { id: data.patient.id }), reload);
  // Investigadores del centro; la coordinación solo si pertenece al centro (migración 08).
  const investigators = data.profiles.filter((p) => p.role === 'site_pi' || p.role === 'site_investigator'
    || (p.role === 'coordinator' && p.id === session.userId && session.memberships.some((m) => m.center_id === data.patient.center_id)));

  return (
    <section className="card">
      <h2>Selección e inclusión</h2>
      {data.criteria.length === 0 ? (
        <Notice tone="warning" title="Inclusión bloqueada">No hay criterios de selección activos asignados a este candidato. Deben transcribirse del protocolo aprobado, validarse y cargarse por la coordinación (RG-06).</Notice>
      ) : (
        <>
          <p className="carmo-hint">Versión de criterios asignada al candidato al registrarlo. Responda según la fuente documental (historia clínica).</p>
          <label className="carmo-hint">Motivo de corrección (obligatorio para cambiar una respuesta): <input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="table-wrap"><table className="carmo-table"><thead><tr><th>Código</th><th>Criterio</th><th>Respuesta</th></tr></thead><tbody>
            {data.criteria.map((c) => {
              const a = answerOf(c.id);
              return (
                <tr key={c.id}><td>{c.code}</td><td>{c.criterion_text}<p className="carmo-hint">{c.source_reference}</p></td>
                  <td><div className="carmo-actions">
                    <button type="button" className={a?.is_met === true ? 'button-link button-sm' : 'button-secondary button-sm'} disabled={!canWrite || save.saving} onClick={() => answer(c, true)}>Se cumple</button>
                    <button type="button" className={a?.is_met === false ? 'button-link button-sm' : 'button-secondary button-sm'} disabled={!canWrite || save.saving} onClick={() => answer(c, false)}>No se cumple</button>
                  </div></td></tr>
              );
            })}
          </tbody></table></div>
        </>
      )}
      <h3>Consentimiento informado</h3>
      {data.consents.length > 0 ? (
        <ul>{data.consents.map((c) => <li key={c.id}>Versión «{c.document_version}» · firmado {fmtDate(c.signed_date)} · {c.status === 'signed' ? 'vigente' : `retirado ${fmtDate(c.withdrawal_date)}`} · datos al terminar: {label(FUTURE_USE_LABELS, c.future_use_choice)}</li>)}</ul>
      ) : canWrite ? (
        <form className="carmo-form" onSubmit={saveConsent}>
          <label>Versión documental de la HIP/CI<input required maxLength={80} value={consent.document_version} onChange={(e) => setConsent({ ...consent, document_version: e.target.value })} /></label>
          <label>Fecha de firma<input type="date" required max={todayIso()} value={consent.signed_date} onChange={(e) => setConsent({ ...consent, signed_date: e.target.value })} /></label>
          <label>Investigador responsable<select value={consent.investigator_id} onChange={(e) => setConsent({ ...consent, investigator_id: e.target.value })}>
            {investigators.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? 'Investigador/a'}{p.id === session.userId ? ' (yo)' : ''}</option>)}
          </select></label>
          <label>Destino de los datos al terminar (elección en el CI)<select value={consent.future_use_choice} onChange={(e) => setConsent({ ...consent, future_use_choice: e.target.value })}>
            <option value="">No consta</option>{Object.entries(FUTURE_USE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <div><button className="button-link" type="submit" disabled={save.saving}>Registrar consentimiento</button></div>
          <p className="carmo-hint span-all">El documento firmado se archiva en el centro; CARMO solo registra la constancia.</p>
        </form>
      ) : <p className="text-muted">Sin consentimiento registrado.</p>}
      <h3>Requisitos para incluir</h3>
      {data.blockers.length === 0 ? <Notice tone="success">Se cumplen todos los requisitos verificables por el sistema.</Notice> : (
        <ul>{data.blockers.map((b) => <li key={b}>{INCLUSION_BLOCKER_LABELS[b] ?? b}</li>)}</ul>
      )}
      {canWrite ? (
        <div className="carmo-actions">
          <button type="button" className="button-link" disabled={data.blockers.length > 0 || save.saving} onClick={include}>Incluir en el estudio</button>
          <select value={notIncluded} onChange={(e) => setNotIncluded(e.target.value)} aria-label="Motivo de no inclusión">
            {(['not_eligible', 'declined_consent', 'investigator_decision', 'other'] as const).map((k) => <option key={k} value={k}>{STATUS_REASON_LABELS[k]}</option>)}
          </select>
          <button type="button" className="button-secondary" disabled={save.saving} onClick={reject}>Registrar no inclusión</button>
        </div>
      ) : null}
      <SaveStatus state={save.state} />
    </section>
  );
}

const SHORT_LINKS: Array<[SectionKey, string]> = [['datos', 'Datos'], ['variables', 'Variables'], ['medicacion', 'Medicación'], ['cmo', 'CMO'], ['intervenciones', 'Intervenciones'], ['cuestionarios', 'Cuestionarios'], ['cierre', 'Cierre']];

function reqCell(r: Requirement | undefined, text?: string) {
  if (!r) return <span className="cell-muted">—</span>;
  if (r.status === 'not_applicable' || r.status === 'optional') return <span className="cell-muted" title={r.detail}>{text ?? '—'}</span>;
  return <span title={r.detail}><StatusBadge tone={r.status === 'done' ? 'positive' : r.status === 'pending' ? 'warning' : 'neutral'}>{text ?? REQ_STATUS_LABELS[r.status]}</StatusBadge></span>;
}

/** Longitudinalidad de visitas (como en IRIS): una fila por visita con el estado de cada bloque y acceso directo. */
function VisitsSection({ data, session, reload }: { data: Data; session: CarmoSession; reload: () => Promise<void> }) {
  const save = useSave();
  const existing = new Set(data.visits.filter((v) => v.status !== 'cancelled').map((v) => v.visit_code));
  const missing = PROGRAMMED_VISITS.filter((c) => !existing.has(c));
  const canWrite = ROLE_CAN.writeClinical(session.role) && data.patient.status === 'included';
  const clinical = ROLE_CAN.readClinical(session.role);
  const order = (v: Visit) => (v.visit_code === 'EXTRA' ? 99 : PROGRAMMED_VISITS.indexOf(v.visit_code as VisitCode));
  const visits = [...data.visits].sort((a, b) => (a.actual_date ?? a.planned_date ?? '').localeCompare(b.actual_date ?? b.planned_date ?? '') || order(a) - order(b));
  const win = (id: string) => data.windows.find((w) => w.visit_id === id);
  const validated = data.models.find((m) => m.status === 'validated');
  const followUp = (validated?.definition.followUp as Record<string, { restratifyMonths: number | null }> | undefined) ?? null;
  const reqsOf = (v: Visit) => visitRequirements(v, {
    variables: data.variables, observations: data.observations, administrations: data.administrations, instruments: data.instruments,
    stratifications: data.strats, interventionCount: data.interventions.filter((i) => i.visit_id === v.id).length,
    review: data.reviews.find((r) => r.visit_id === v.id) ?? null, followUp, today: todayIso(), cmoAvailable: Boolean(validated),
  });
  const stratOf = (v: Visit) => data.strats.filter((s) => s.visit_id === v.id && !data.strats.some((n) => n.supersedes_id === s.id))[0];

  return (
    <section className="card">
      <h2>Longitudinalidad de visitas</h2>
      <p className="carmo-hint">Secuencia de visitas del protocolo (inicial, S12, S24, S36, final) y contactos extraordinarios, con el estado de cada bloque. Pase el cursor sobre un estado para ver el detalle; los enlaces abren el bloque de la visita.</p>
      {canWrite && missing.length > 0 ? (
        <div className="carmo-actions carmo-longitudinal-actions">
          <button type="button" className="button-link" disabled={save.saving}
            onClick={() => void save.run(() => carmoWrite.insert('carmo_visits', missing.map((code) => ({ patient_id: data.patient.id, visit_code: code }))), reload)}>
            Programar visitas previstas ({missing.map((m) => VISIT_LABELS[m]).join(', ')})
          </button>
        </div>
      ) : null}
      {visits.length > 0 ? (
        <ol className="visit-timeline" aria-label="Línea temporal de visitas">
          {visits.map((v) => {
            const s = stratOf(v);
            return (
              <li key={v.id}>
                <span className={v.status === 'done' ? 'timeline-node is-done' : v.status === 'cancelled' || v.status === 'not_done' ? 'timeline-node is-cancelled' : 'timeline-node'} aria-hidden="true" />
                <Link className="timeline-title" to={`/visits/${v.id}`}>{label(VISIT_LABELS, v.visit_code)}</Link>
                <span className="timeline-date">{fmtDate(v.actual_date ?? v.planned_date)} · {label(VISIT_STATUS_LABELS, v.status)}</span>
                <span className="timeline-meta">{s ? <StatusBadge tone="info">{PRIORITY_LABELS[effectivePriority(s)]} · {s.total_score} pts</StatusBadge> : <span className="carmo-hint">Sin estratificar</span>}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="table-wrap"><table className="carmo-table">
        <thead><tr><th>Visita</th><th>Fecha</th><th>Estado</th>{clinical ? <><th>Variables</th><th>Medicación</th><th>CMO</th><th>Cuestionarios</th><th className="num">Interv.</th><th>Completitud</th></> : null}<th>Registro</th><th>Acciones</th></tr></thead>
        <tbody>{visits.map((v) => {
          const w = win(v.id);
          const reqs = clinical ? reqsOf(v) : [];
          const r = (k: SectionKey) => reqs.find((x) => x.key === k);
          const s = stratOf(v);
          const c = completeness(reqs);
          const nInt = data.interventions.filter((i) => i.visit_id === v.id).length;
          return (
            <tr key={v.id}>
              <td className="strong"><Link to={`/visits/${v.id}`}>{label(VISIT_LABELS, v.visit_code)}</Link></td>
              <td className="numeric">{fmtDate(v.actual_date ?? v.planned_date)}{!v.actual_date && v.planned_date ? <><br /><span className="carmo-hint">prevista</span></> : null}
                {w ? <><br /><span className="carmo-hint">Ventana: {WINDOW_STATUS_LABELS[w.window_status as WindowStatus] ?? w.window_status}</span></> : null}</td>
              <td>{label(VISIT_STATUS_LABELS, v.status)}{isOverdue(v.planned_date, v.status, todayIso()) ? <> <StatusBadge tone="warning">Vencida</StatusBadge></> : null}<br /><span className="carmo-hint">{label(MODALITY_LABELS, v.modality)}</span></td>
              {clinical && v.status !== 'done' ? <>
                <td colSpan={4}><span className="carmo-hint">{v.status === 'planned' ? 'Visita aún no realizada: los bloques se completan al realizarla.' : 'Visita no realizada o anulada.'}</span></td>
                <td className="num">{nInt}</td>
                <td><span className="cell-muted">—</span></td>
              </> : null}
              {clinical && v.status === 'done' ? <>
                <td>{reqCell(r('variables'), r('variables')?.status === 'done' ? 'Completas' : r('variables')?.status === 'pending' ? 'Faltan' : undefined)}</td>
                <td>{reqCell(r('medicacion'), r('medicacion')?.status === 'done' ? 'Revisada' : r('medicacion')?.status === 'pending' ? 'Sin revisar' : undefined)}</td>
                <td>{s ? <span title={r('cmo')?.detail}><StatusBadge tone={s.validation_status === 'pending' ? 'warning' : 'info'}>{s.total_score} pts · P{effectivePriority(s)}</StatusBadge></span> : reqCell(r('cmo'), r('cmo')?.status === 'pending' ? 'Pendiente' : undefined)}</td>
                <td>{reqCell(r('cuestionarios'), r('cuestionarios')?.status === 'done' ? 'Completos' : r('cuestionarios')?.status === 'pending' ? 'Pendientes' : undefined)}</td>
                <td className="num">{nInt}</td>
                <td><StatusBadge tone={c.done === c.required ? 'positive' : 'neutral'}>{c.done}/{c.required}</StatusBadge></td>
              </> : null}
              <td>{label(RECORD_STATE_LABELS, v.record_state)}</td>
              <td><div className="table-actions">
                {(clinical ? SHORT_LINKS : SHORT_LINKS.filter(([k]) => k === 'datos' || k === 'cuestionarios')).map(([k, t]) => <Link key={k} to={`/visits/${v.id}?seccion=${k}`}>{t}</Link>)}
                {clinical && v.status === 'done' ? <Link to={`/visits/${v.id}/informe`}>Informe</Link> : null}
              </div></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {canWrite ? (
        <div className="carmo-actions" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="button-secondary" disabled={save.saving}
            onClick={() => void save.run(() => carmoWrite.insert('carmo_visits', { patient_id: data.patient.id, visit_code: 'EXTRA', status: 'planned', planned_date: todayIso() }), reload)}>
            Añadir contacto extraordinario
          </button>
        </div>
      ) : null}
      <p className="carmo-hint">Fechas previstas según el calendario versionado del protocolo (inclusión + días).</p>
      <SaveStatus state={save.state} />
    </section>
  );
}

function StudyExitSection({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const save = useSave();
  const [exit, setExit] = useState<'withdrawn' | 'lost_to_followup'>('withdrawn');
  const [reason, setReason] = useState('consent_withdrawn');
  const [withdrawalDate, setWithdrawalDate] = useState(todayIso());
  const active = data.consents.find((c) => c.status === 'signed');

  return (
    <section className="card">
      <h2>Cierre del seguimiento y salida del estudio</h2>
      <p className="carmo-hint">Diferencia entre cierre de visita (en cada visita), cierre del seguimiento (tras la visita final realizada) y salida anticipada (retirada o pérdida). Los datos recogidos se conservan; su uso tras una retirada está pendiente de definir con promotor y CEIm (RG-10).</p>
      <div className="carmo-actions">
        <button type="button" className="button-link" disabled={save.saving} onClick={() => void save.run(() => carmoWrite.update('carmo_patients', { status: 'completed' }, { id: data.patient.id }), reload)}>Cerrar seguimiento (visita final realizada)</button>
      </div>
      <div className="carmo-form" style={{ marginTop: '0.75rem' }}>
        <label>Salida<select value={exit} onChange={(e) => setExit(e.target.value as typeof exit)}><option value="withdrawn">Retirada</option><option value="lost_to_followup">Pérdida de seguimiento</option></select></label>
        <label>Motivo<select value={reason} onChange={(e) => setReason(e.target.value)}>{(['consent_withdrawn', 'investigator_decision', 'transfer', 'death', 'other'] as const).map((k) => <option key={k} value={k}>{STATUS_REASON_LABELS[k]}</option>)}</select></label>
        {reason === 'consent_withdrawn' && active ? (
          <label>Fecha de retirada del consentimiento<input type="date" max={todayIso()} value={withdrawalDate} onChange={(e) => setWithdrawalDate(e.target.value)} /></label>
        ) : null}
        <div><button type="button" className="button-secondary" disabled={save.saving} onClick={async () => {
          if (reason === 'consent_withdrawn' && active) {
            const ok = await save.run(() => carmoWrite.update('carmo_consents', { status: 'withdrawn', withdrawal_date: withdrawalDate, withdrawal_scope: 'stop_followup_data_pending_decision' }, { id: active.id }));
            if (!ok) return;
          }
          await save.run(() => carmoWrite.update('carmo_patients', { status: exit, status_reason: reason }, { id: data.patient.id }), reload);
        }}>Registrar salida</button></div>
      </div>
      <SaveStatus state={save.state} />
    </section>
  );
}

function DeviationsSection({ data, session, reload }: { data: Data; session: CarmoSession; reload: () => Promise<void> }) {
  const save = useSave();
  const [form, setForm] = useState({ category: 'visit_out_of_window', description: '', detected_date: todayIso(), visit_id: '' });
  const CATS: Record<string, string> = { visit_out_of_window: 'Visita fuera de ventana', missed_visit: 'Visita no realizada', eligibility: 'Elegibilidad', consent: 'Consentimiento', questionnaire: 'Cuestionario', data_entry: 'Registro de datos', other: 'Otra' };
  return (
    <section className="card">
      <h2>Incidencias y desviaciones</h2>
      {data.deviations.length === 0 ? <p className="text-muted">Sin incidencias registradas.</p> : (
        <ul>{data.deviations.map((d) => <li key={d.id}>{fmtDate(d.detected_date)} · {CATS[d.category] ?? d.category} · {d.status === 'open' ? 'abierta' : 'resuelta'} — {d.description}</li>)}</ul>
      )}
      {ROLE_CAN.writeClinical(session.role) ? (
        <form className="carmo-form" onSubmit={(e) => { e.preventDefault(); void save.run(() => carmoWrite.insert('carmo_deviations', { patient_id: data.patient.id, category: form.category, description: form.description, detected_date: form.detected_date, visit_id: form.visit_id || null }), reload); }}>
          <label>Categoría (provisional)<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Visita<select value={form.visit_id} onChange={(e) => setForm({ ...form, visit_id: e.target.value })}><option value="">—</option>{data.visits.map((v) => <option key={v.id} value={v.id}>{label(VISIT_LABELS, v.visit_code)}</option>)}</select></label>
          <label>Fecha<input type="date" max={todayIso()} value={form.detected_date} onChange={(e) => setForm({ ...form, detected_date: e.target.value })} /></label>
          <label className="span-all">Descripción (sin datos identificativos)<textarea required minLength={5} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div><button className="button-secondary" type="submit" disabled={save.saving}>Registrar incidencia</button></div>
        </form>
      ) : null}
      <SaveStatus state={save.state} />
    </section>
  );
}

function PendingPanel({ data }: { data: Data }) {
  const validated = data.models.find((m) => m.status === 'validated');
  const items = computePending({
    patientStatus: data.patient.status, visits: data.visits, variables: data.variables, observations: data.observations,
    administrations: data.administrations, instruments: data.instruments, stratifications: data.strats, deviations: data.deviations,
    followUp: (validated?.definition.followUp as Record<string, { restratifyMonths: number | null }> | undefined) ?? null, today: todayIso(),
    medicationReviewedVisitIds: data.reviews.map((r) => r.visit_id),
  });
  if (data.patient.status === 'screening' || data.patient.status === 'not_included') return null;
  const tone = (sev: string) => (sev === 'high' ? 'danger' : sev === 'medium' ? 'warning' : 'neutral') as 'danger' | 'warning' | 'neutral';
  return (
    <section className="card">
      <h2>Datos pendientes {items.length ? <StatusBadge tone="warning">{items.length}</StatusBadge> : <StatusBadge tone="positive">Al día</StatusBadge>}</h2>
      {items.length === 0 ? <p className="text-muted">No hay datos pendientes según el protocolo y el modelo CMO.</p> : (
        <ul>{items.map((i, n) => (
          <li key={n}><StatusBadge tone={tone(i.severity)}>{PENDING_KIND_LABELS[i.kind]}</StatusBadge>{' '}
            {i.visitId ? <Link to={`/visits/${i.visitId}${i.kind === 'medication' ? '?seccion=medicacion' : i.kind === 'questionnaire' ? '?seccion=cuestionarios' : i.kind === 'missing_data' ? '?seccion=variables' : i.kind === 'to_close' ? '?seccion=cierre' : ''}`}>{i.message}</Link> : i.kind === 'stratification' ? <Link to={`/patients/${data.patient.id}/stratification`}>{i.message}</Link> : i.message}</li>
        ))}</ul>
      )}
    </section>
  );
}
