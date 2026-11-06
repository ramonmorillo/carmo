import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { SaveStatus } from '../components/ui/SaveStatus';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ACCEPTANCE_LABELS, PRIORITY_LABELS, VALIDATION_LABELS, effectivePriority } from '../domain/cmoLabels';
import { correctionChain, currentObservations } from '../domain/observations';
import { storedScoreLabel } from '../domain/questionnaires';
import {
  patientCode, DATA_SOURCE_LABELS, MISSING_REASON_LABELS, MODALITY_LABELS, RECORD_STATE_LABELS, ROLE_CAN, TEMPORAL_CONTEXT_LABELS, VISIT_LABELS, VISIT_STATUS_LABELS,
} from '../domain/study';
import {
  blockingBeforeClose, REQ_STATUS_LABELS, SECTION_LABELS, SECTION_ORDER, visitRequirements, type Requirement, type SectionKey,
} from '../domain/visitRequirements';
import { fmtDate, label, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { useSave } from '../lib/useSave';
import {
  carmo, carmoWrite, type Administration, type CmoModel, type Dispensation, type Evolution, type Instrument, type Intervention, type InterventionCatalogItem,
  type MedicationReview, type ObservationRow, type Patient, type Profile, type Stratification, type Treatment, type TreatmentEvent, type Variable, type Visit,
} from '../services/carmoData';
import { MedicationPanel } from './MedicationPanel';

type Data = {
  visit: Visit; patient: Patient; variables: Variable[]; observations: ObservationRow[]; evolution: Evolution | null; instruments: Instrument[];
  administrations: Administration[]; profiles: Profile[]; treatments: Treatment[]; events: TreatmentEvent[]; dispensations: Dispensation[];
  review: MedicationReview | null; strats: Stratification[]; interventions: Intervention[]; catalog: InterventionCatalogItem[]; models: CmoModel[];
};

const CHECK_ICON: Record<string, string> = { done: '✓', pending: '!', recommended: '◐', optional: '·', not_applicable: '–' };

export function VisitPage() {
  const { visitId = '' } = useParams();
  const session = useCarmoSession();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const visit = await carmo.visit(visitId);
      if (!visit) { setError('Visita no encontrada o fuera de su ámbito.'); return; }
      const clinical = ROLE_CAN.readClinical(session.role);
      const pid = visit.patient_id;
      const [patient, variables, observations, evolution, instruments, administrations, profiles, treatments, events, dispensations, reviews, strats, interventions, catalog, models] = await Promise.all([
        carmo.patient(pid), carmo.variables(), clinical ? carmo.observations(pid) : [],
        clinical ? carmo.evolution(visit.id) : null, carmo.instruments(), carmo.administrations(pid), carmo.profiles(),
        clinical ? carmo.treatments(pid) : [], clinical ? carmo.treatmentEvents(pid) : [], clinical ? carmo.dispensations(pid) : [],
        clinical ? carmo.medicationReviews(pid) : [], clinical ? carmo.stratifications(pid) : [], clinical ? carmo.interventions(pid) : [],
        clinical ? carmo.interventionCatalog() : [], clinical ? carmo.cmoModels() : [],
      ]);
      if (!patient) { setError('Paciente no accesible.'); return; }
      setData({ visit, patient, variables, observations, evolution, instruments, administrations, profiles, treatments, events, dispensations,
        review: reviews.find((r) => r.visit_id === visit.id) ?? null, strats, interventions, catalog, models });
    } catch (e) { setError((e as Error).message); }
  }, [visitId, session.role]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Cargando visita…" />;
  const { visit, patient } = data;
  const clinical = ROLE_CAN.readClinical(session.role);
  const closed = visit.record_state === 'closed';
  const canWrite = ROLE_CAN.writeClinical(session.role) && !closed && visit.status !== 'cancelled';
  const validated = data.models.find((m) => m.status === 'validated');
  const reqs = clinical ? visitRequirements(visit, {
    variables: data.variables, observations: data.observations, administrations: data.administrations, instruments: data.instruments,
    stratifications: data.strats, interventionCount: data.interventions.filter((i) => i.visit_id === visit.id).length, review: data.review,
    followUp: (validated?.definition.followUp as Record<string, { restratifyMonths: number | null }> | undefined) ?? null, today: todayIso(), cmoAvailable: Boolean(validated),
  }) : [];
  const visible: SectionKey[] = clinical ? SECTION_ORDER : ['datos', 'cuestionarios', ...(ROLE_CAN.close(session.role) ? ['cierre' as SectionKey] : [])];
  const requested = params.get('seccion') as SectionKey | null;
  const firstPending = reqs.find((r) => r.status === 'pending')?.key;
  const tab: SectionKey = requested && visible.includes(requested) ? requested : (firstPending && visible.includes(firstPending) ? firstPending : 'datos');
  const go = (k: SectionKey) => setParams({ seccion: k }, { replace: true });
  const reqOf = (k: SectionKey) => reqs.find((r) => r.key === k);

  return (
    <div className="page-stack">
      <PageHeader eyebrow={<Link to={`/patients/${patient.id}`}>{patientCode(patient)}</Link>} title={label(VISIT_LABELS, visit.visit_code)}
        description={<>Prevista {fmtDate(visit.planned_date)} · efectiva {fmtDate(visit.actual_date)} · {label(VISIT_STATUS_LABELS, visit.status)} · registro <StatusBadge tone={closed ? 'neutral' : 'info'}>{label(RECORD_STATE_LABELS, visit.record_state)}</StatusBadge></>} />
      {clinical ? <div className="carmo-actions"><Link className="button-secondary" to={`/visits/${visit.id}/informe`}>Informe imprimible de la visita</Link></div> : null}
      {closed ? <Notice tone="info" title="Visita cerrada">Los datos de esta visita están bloqueados. El IP del centro o la coordinación pueden reabrirla indicando el motivo; la reapertura queda registrada.</Notice> : null}
      {clinical ? <ChecklistCard reqs={reqs} go={go} /> : null}
      <section className="card">
        <div className="carmo-tabs" role="tablist" aria-label="Bloques de la visita">
          {visible.map((k) => {
            const r = reqOf(k);
            return <button key={k} type="button" role="tab" className="carmo-tab" aria-selected={tab === k} onClick={() => go(k)}>
              {r ? <span className={`carmo-dot carmo-dot-${r.status}`} aria-hidden="true" /> : null}{SECTION_LABELS[k]}{r ? <span className="visually-hidden"> ({REQ_STATUS_LABELS[r.status]})</span> : null}</button>;
          })}
        </div>
        {reqOf(tab) ? <p className="carmo-hint" style={{ marginTop: 0 }}><strong>{REQ_STATUS_LABELS[reqOf(tab)!.status]}.</strong> {reqOf(tab)!.detail}</p> : null}
        {tab === 'datos' ? <VisitForm data={data} canWrite={ROLE_CAN.writeClinical(session.role) && !closed} reload={load} userId={session.userId} /> : null}
        {tab === 'variables' && visit.status !== 'cancelled' ? <ObservationsSection data={data} canWrite={canWrite} reload={load} /> : null}
        {tab === 'medicacion' ? <MedicationPanel patient={patient} treatments={data.treatments} events={data.events} dispensations={data.dispensations}
          canWrite={canWrite && patient.status === 'included'} reload={load} visit={visit} review={data.review} /> : null}
        {tab === 'cmo' ? <StratificationSection data={data} canWrite={canWrite} /> : null}
        {tab === 'intervenciones' ? <InterventionsSection data={data} canWrite={canWrite} /> : null}
        {tab === 'cuestionarios' ? <QuestionnaireLinks data={data} /> : null}
        {tab === 'evolucion' ? <EvolutionSection data={data} canWrite={canWrite} reload={load} /> : null}
        {tab === 'cierre' ? (ROLE_CAN.close(session.role) ? <RecordStateActions visit={visit} reqs={reqs} reload={load} /> : <p className="text-muted">La revisión y el cierre los realiza el IP del centro o la coordinación.</p>) : null}
      </section>
    </div>
  );
}

function ChecklistCard({ reqs, go }: { reqs: Requirement[]; go: (k: SectionKey) => void }) {
  const pending = reqs.filter((r) => r.status === 'pending' && r.key !== 'cierre').length;
  return (
    <section className="card">
      <h2>Lo necesario en esta visita {pending ? <StatusBadge tone="warning">{pending} pendiente(s)</StatusBadge> : <StatusBadge tone="positive">Completa</StatusBadge>}</h2>
      <p className="carmo-hint">Según el esquema de procedimientos del protocolo v3.0, el modelo CMO y el registro de medicación. Pulse un bloque para abrirlo.</p>
      <ul className="carmo-checklist">{reqs.map((r) => (
        <li key={r.key}>
          <span className={`carmo-check carmo-check-${r.status}`} aria-hidden="true">{CHECK_ICON[r.status]}</span>
          <button type="button" className="button-ghost button-sm" style={{ justifySelf: 'start' }} onClick={() => go(r.key)}>{r.label}</button>
          <span className="text-muted">{r.detail}</span>
          <StatusBadge tone={r.status === 'done' ? 'positive' : r.status === 'pending' ? 'danger' : r.status === 'recommended' ? 'warning' : 'neutral'}>{REQ_STATUS_LABELS[r.status]}</StatusBadge>
        </li>
      ))}</ul>
    </section>
  );
}

function StratificationSection({ data, canWrite }: { data: Data; canWrite: boolean }) {
  const own = data.strats.filter((s) => s.visit_id === data.visit.id);
  return (
    <div>
      {own.length === 0 ? <p className="text-muted">Sin estratificación registrada en esta visita.</p> : (
        <div className="table-wrap"><table className="carmo-table"><thead><tr><th>Calculada</th><th>Puntos</th><th>Prioridad</th><th>Validación</th></tr></thead><tbody>
          {own.map((s) => <tr key={s.id}><td>{fmtDate(s.calculated_at)}{data.strats.some((n) => n.supersedes_id === s.id) ? ' (sustituida)' : ''}</td><td>{s.total_score ?? '—'}</td>
            <td>{PRIORITY_LABELS[effectivePriority(s)]}</td><td>{VALIDATION_LABELS[s.validation_status] ?? s.validation_status}</td></tr>)}
        </tbody></table></div>
      )}
      <p><Link className={canWrite ? 'button-link' : ''} to={`/patients/${data.patient.id}/stratification?visit=${data.visit.id}`}>{canWrite ? 'Estratificar o validar en esta visita' : 'Ver estratificación del paciente'}</Link></p>
    </div>
  );
}

function InterventionsSection({ data, canWrite }: { data: Data; canWrite: boolean }) {
  const items = data.interventions.filter((i) => i.visit_id === data.visit.id);
  const cat = (c: string) => data.catalog.find((x) => x.code === c);
  return (
    <div>
      {items.length === 0 ? <p className="text-muted">Sin intervenciones registradas en esta visita.</p> : (
        <div className="table-wrap"><table className="carmo-table"><thead><tr><th>Fecha</th><th>Actuación</th><th>Tipo</th><th>Modalidad</th><th>Aceptación</th></tr></thead><tbody>
          {items.map((i) => <tr key={i.id}><td>{fmtDate(i.intervention_date)}</td><td>{i.catalog_code} · {cat(i.catalog_code)?.label ?? ''}</td><td>{i.is_scheduled ? 'Programada' : 'No programada'}</td>
            <td>{i.modality === 'in_person' ? 'Presencial' : 'Telemática'}</td><td>{label(ACCEPTANCE_LABELS, i.acceptance)}</td></tr>)}
        </tbody></table></div>
      )}
      {canWrite ? <p><Link className="button-link" to={`/interventions?patient=${data.patient.id}&visit=${data.visit.id}`}>Registrar intervención en esta visita</Link></p> : null}
    </div>
  );
}

function VisitForm({ data, canWrite, reload, userId }: { data: Data; canWrite: boolean; reload: () => Promise<void>; userId: string }) {
  const save = useSave();
  const v = data.visit;
  const [form, setForm] = useState({ status: v.status, actual_date: v.actual_date ?? '', modality: v.modality ?? '', responsible_id: v.responsible_id ?? userId, status_reason: v.status_reason ?? '', planned_date: v.planned_date ?? '' });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(() => carmoWrite.update('carmo_visits', {
      status: form.status, actual_date: form.status === 'done' || form.status === 'not_done' ? form.actual_date || null : null,
      modality: form.modality || null, responsible_id: form.responsible_id || null, status_reason: form.status_reason || null,
      planned_date: form.planned_date || null,
    }, { id: v.id, revision: v.revision }), reload);
  };
  const responsibles = data.profiles.filter((p) => ['site_pi', 'site_investigator', 'coordinator'].includes(p.role));
  return (
    <div>
      <form className="carmo-form" onSubmit={submit}>
        <label>Estado<select disabled={!canWrite} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(VISIT_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Fecha prevista<input type="date" disabled={!canWrite} value={form.planned_date} onChange={(e) => setForm({ ...form, planned_date: e.target.value })} /></label>
        <label>Fecha efectiva<input type="date" disabled={!canWrite || form.status === 'planned' || form.status === 'cancelled'} max={todayIso()} value={form.actual_date} onChange={(e) => setForm({ ...form, actual_date: e.target.value })} /></label>
        <label>Modalidad<select disabled={!canWrite} value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}><option value="">—</option>{Object.entries(MODALITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Profesional responsable<select disabled={!canWrite} value={form.responsible_id} onChange={(e) => setForm({ ...form, responsible_id: e.target.value })}>
          {responsibles.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? 'Profesional'}{p.id === userId ? ' (yo)' : ''}</option>)}</select></label>
        {form.status === 'not_done' || form.status === 'cancelled' ? <label className="span-all">Motivo (obligatorio)<input required value={form.status_reason} onChange={(e) => setForm({ ...form, status_reason: e.target.value })} /></label> : null}
        {canWrite ? <div><button className="button-link" type="submit" disabled={save.saving}>Guardar visita</button></div> : null}
      </form>
      <p className="carmo-hint">Control de concurrencia: si otra persona guardó antes, el servidor no confirma el guardado y se pide recargar.</p>
      <SaveStatus state={save.state} />
    </div>
  );
}

function RecordStateActions({ visit, reqs, reload }: { visit: Visit; reqs: Requirement[]; reload: () => Promise<void> }) {
  const save = useSave();
  const [reason, setReason] = useState('');
  const blocking = blockingBeforeClose(reqs);
  const set = (state: string, extra: Record<string, unknown> = {}) => void save.run(() => carmoWrite.update('carmo_visits', { record_state: state, ...extra }, { id: visit.id, revision: visit.revision }), reload);
  const open = visit.record_state !== 'closed';
  return (
    <div>
      {open && blocking.length > 0 ? (
        <Notice tone="danger" title={`No se puede cerrar: ${blocking.length} bloque(s) obligatorio(s) pendiente(s)`}>
          <ul>{blocking.map((r) => <li key={r.key}><strong>{r.label}:</strong> {r.detail}</li>)}</ul>
          <p className="carmo-hint">Complete cada bloque (o registre el motivo de ausencia del dato o de no realización del cuestionario). La base de datos aplica la misma regla. Puede marcar la visita como revisada mientras tanto.</p>
        </Notice>
      ) : open ? <Notice tone="success">Todos los bloques obligatorios de la visita están completos: puede cerrarse.</Notice> : null}
      <div className="carmo-actions">
        {visit.record_state === 'draft' ? <button type="button" className="button-secondary" disabled={save.saving} onClick={() => set('reviewed')}>Marcar como revisada</button> : null}
        {open ? <button type="button" className="button-link" disabled={save.saving || blocking.length > 0} title={blocking.length ? 'Hay bloques obligatorios pendientes' : undefined} onClick={() => set('closed')}>Cerrar visita</button> : null}
        {visit.record_state !== 'draft' ? <>
          <input aria-label="Motivo de reapertura" placeholder="Motivo de reapertura" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="button-secondary" disabled={save.saving || reason.trim().length < 5} onClick={() => set('draft', { reopen_reason: reason })}>Reabrir</button>
        </> : null}
      </div>
      <SaveStatus state={save.state} />
    </div>
  );
}

function QuestionnaireLinks({ data }: { data: Data }) {
  const applicable = data.instruments.filter((i) => i.status === 'active' && i.allowed_visits.includes(data.visit.visit_code));
  if (applicable.length === 0) return <p className="text-muted">El protocolo no prevé cuestionarios en esta visita.</p>;
  return (
    <div className="table-wrap"><table className="carmo-table"><thead><tr><th>Instrumento</th><th>Versión</th><th>Administración</th></tr></thead><tbody>
      {applicable.map((i) => {
        const a = data.administrations.find((x) => x.visit_id === data.visit.id && x.instrument_code === i.code);
        return (
          <tr key={i.code}><td>{i.code}</td><td>{i.version}</td>
            <td><Link to={`/visits/${data.visit.id}/questionnaires/${i.code}`}>{a ? (a.status === 'completed' ? `Completado · ${storedScoreLabel(i.code, a.scores)}` : a.status === 'not_done' ? 'No realizado' : 'En curso') : 'Registrar'}</Link></td></tr>
        );
      })}
    </tbody></table></div>
  );
}

function ObservationsSection({ data, canWrite, reload }: { data: Data; canWrite: boolean; reload: () => Promise<void> }) {
  const vars = data.variables.filter((v) => v.allowed_visits.includes(data.visit.visit_code) && v.status !== 'retired');
  const visitObs = data.observations.filter((o) => o.visit_id === data.visit.id || (o.visit_id === null && data.visit.visit_code === 'BASAL' && o.temporal_context === 'history_prior_inclusion'));
  const current = currentObservations(visitObs);
  const sections = [...new Set(vars.map((v) => v.section))];
  const SECTION_LABELS: Record<string, string> = { cv_history: 'Antecedentes cardiovasculares', cv_risk_factor: 'Factores de riesgo', anthropometric: 'Antropometría', laboratory: 'Analítica', cv_event: 'Eventos cardiovasculares', demographic: 'Demográficas', sociosanitary: 'Sociosanitarias', pharmacotherapy: 'Farmacoterapia', other: 'Otras' };
  return (
    <div>
      <Notice tone="warning">Diccionario PROVISIONAL: variables del resumen del protocolo, pendientes de verificar contra el protocolo v3.0. Las variables sin dominio definido están bloqueadas. Los datos nunca se sobrescriben: una corrección crea un registro nuevo con motivo.</Notice>
      {sections.map((s) => (
        <div key={s} className="carmo-section"><h3>{SECTION_LABELS[s] ?? s}</h3>
          {vars.filter((v) => v.section === s).map((v) => (
            <VariableRow key={v.code} variable={v} visit={data.visit} patient={data.patient} current={current.filter((o) => o.variable_code === v.code)} all={visitObs} canWrite={canWrite} reload={reload} />
          ))}
        </div>
      ))}
    </div>
  );
}

function display(o: ObservationRow, v: Variable): string {
  if (o.is_missing) return `Ausente: ${label(MISSING_REASON_LABELS, o.missing_reason)}`;
  if (o.value_boolean !== null) return o.value_boolean ? 'Sí' : 'No';
  if (o.value_numeric !== null) return `${o.value_numeric} ${o.unit ?? ''}`;
  if (o.value_text !== null) return v.allowed_values?.[o.value_text] ?? o.value_text;
  return o.value_date ?? '—';
}

function VariableRow({ variable: v, visit, patient, current, all, canWrite, reload }: { variable: Variable; visit: Visit; patient: Patient; current: ObservationRow[]; all: ObservationRow[]; canWrite: boolean; reload: () => Promise<void> }) {
  const save = useSave();
  const [open, setOpen] = useState(false);
  const defaultContext = v.allowed_contexts.includes(visit.visit_code === 'BASAL' ? 'baseline' : 'follow_up') ? (visit.visit_code === 'BASAL' ? 'baseline' : 'follow_up') : v.allowed_contexts[0];
  const [f, setF] = useState({ value: '', unit: v.units?.[0] ?? '', missing: '', observed_date: visit.actual_date ?? todayIso(), data_source: 'clinical_record', temporal_context: defaultContext, correction_reason: '', supersedes: '' });
  const blocked = v.status === 'blocked';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      patient_id: patient.id, visit_id: f.temporal_context === 'history_prior_inclusion' ? null : visit.id, variable_code: v.code,
      observed_date: f.observed_date, data_source: f.data_source, temporal_context: f.temporal_context,
      is_missing: !!f.missing, missing_reason: f.missing || null,
      supersedes_id: f.supersedes || null, correction_reason: f.supersedes ? f.correction_reason : null,
    };
    if (!f.missing) {
      if (v.value_type === 'numeric' || v.value_type === 'integer') { payload.value_numeric = Number(f.value); payload.unit = f.unit; }
      else if (v.value_type === 'boolean') payload.value_boolean = f.value === 'true';
      else if (v.value_type === 'date') payload.value_date = f.value;
      else payload.value_text = f.value;
    }
    void save.run(() => carmoWrite.insert('carmo_observations', payload), async () => { setOpen(false); await reload(); });
  };

  return (
    <div className="carmo-item" style={{ gridTemplateColumns: '14rem 1fr' }}>
      <div><strong>{v.label}</strong>{blocked ? <><br /><StatusBadge tone="warning">Bloqueada</StatusBadge></> : null}<p className="carmo-hint">{v.notes}</p></div>
      <div>
        {current.length === 0 ? <span className="text-muted">Sin registrar</span> : current.map((o) => (
          <div key={o.id}>
            <strong>{display(o, v)}</strong> <span className="text-muted">· {fmtDate(o.observed_date)} · {label(DATA_SOURCE_LABELS, o.data_source)} · {label(TEMPORAL_CONTEXT_LABELS, o.temporal_context)}</span>
            {o.supersedes_id ? <details><summary className="carmo-hint">Historial de correcciones</summary><ul>{correctionChain(all, o.id).slice(1).map((p) => <li key={p.id}>{display(p, v)} · registrado {p.recorded_at.slice(0, 10)}</li>)}</ul><p className="carmo-hint">Motivo de la última corrección: {o.correction_reason}</p></details> : null}
            {canWrite && !blocked ? <button type="button" className="button-ghost button-sm" onClick={() => { setF({ ...f, supersedes: o.id }); setOpen(true); }}>Corregir</button> : null}
          </div>
        ))}
        {canWrite && !blocked && !open ? <button type="button" className="button-ghost button-sm" onClick={() => { setF({ ...f, supersedes: '' }); setOpen(true); }}>{current.length ? 'Añadir otra medición' : 'Registrar'}</button> : null}
        {open ? (
          <form className="carmo-form" onSubmit={submit}>
            <label>Dato ausente<select value={f.missing} onChange={(e) => setF({ ...f, missing: e.target.value })}><option value="">No (registrar valor)</option>{Object.entries(MISSING_REASON_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {!f.missing ? (v.value_type === 'boolean' ? (
              <label>Valor<select required value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })}><option value="">—</option><option value="true">Sí</option><option value="false">No</option></select></label>
            ) : v.value_type === 'categorical' ? (
              <label>Valor<select required value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })}><option value="">—</option>{Object.entries(v.allowed_values ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            ) : (
              <label>Valor<input required type={v.value_type === 'date' ? 'date' : v.value_type === 'text' ? 'text' : 'number'} step="any" min={v.min_value ?? undefined} max={v.max_value ?? undefined} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
            )) : null}
            {!f.missing && v.units ? <label>Unidad<select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{v.units.map((u) => <option key={u}>{u}</option>)}</select></label> : null}
            <label>Fecha de la medición / evento<input type="date" required max={todayIso()} value={f.observed_date} onChange={(e) => setF({ ...f, observed_date: e.target.value })} /></label>
            <label>Origen<select value={f.data_source} onChange={(e) => setF({ ...f, data_source: e.target.value })}>{Object.entries(DATA_SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>Contexto temporal<select value={f.temporal_context} onChange={(e) => setF({ ...f, temporal_context: e.target.value })}>{v.allowed_contexts.map((k) => <option key={k} value={k}>{label(TEMPORAL_CONTEXT_LABELS, k)}</option>)}</select></label>
            {f.supersedes ? <label className="span-all">Motivo de la corrección (obligatorio)<input required minLength={5} value={f.correction_reason} onChange={(e) => setF({ ...f, correction_reason: e.target.value })} /></label> : null}
            <div className="carmo-actions"><button className="button-link button-sm" type="submit" disabled={save.saving}>Guardar</button><button type="button" className="button-ghost button-sm" onClick={() => setOpen(false)}>Cancelar</button></div>
          </form>
        ) : null}
        <SaveStatus state={save.state} />
      </div>
    </div>
  );
}

function EvolutionSection({ data, canWrite, reload }: { data: Data; canWrite: boolean; reload: () => Promise<void> }) {
  const save = useSave();
  const e0 = data.evolution;
  const [f, setF] = useState({ clinical_evolution: e0?.clinical_evolution ?? '', pharmacotherapy_update: e0?.pharmacotherapy_update ?? '', motivational_followup: e0?.motivational_followup ?? '' });
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const values = { clinical_evolution: f.clinical_evolution || null, pharmacotherapy_update: f.pharmacotherapy_update || null, motivational_followup: f.motivational_followup || null };
    void save.run(() => (e0 ? carmoWrite.update('carmo_visit_evolutions', { ...values, revision: e0.revision }, { visit_id: data.visit.id, revision: e0.revision }) : carmoWrite.insert('carmo_visit_evolutions', { visit_id: data.visit.id, ...values })), reload);
  };
  return (
    <div>
      <Notice tone="warning">Texto libre: no escriba nombres, NHC, teléfonos, fechas de nacimiento ni otros identificadores. Los cambios de medicación se registran en «Medicación» (CIMA), no aquí.</Notice>
      <form className="carmo-form" onSubmit={submit}>
        <label className="span-all">Evolución clínica<textarea disabled={!canWrite} maxLength={4000} value={f.clinical_evolution} onChange={(e) => setF({ ...f, clinical_evolution: e.target.value })} /></label>
        <label className="span-all">Actualización farmacoterapéutica<textarea disabled={!canWrite} maxLength={4000} value={f.pharmacotherapy_update} onChange={(e) => setF({ ...f, pharmacotherapy_update: e.target.value })} /></label>
        <label className="span-all">Seguimiento motivacional<textarea disabled={!canWrite} maxLength={4000} value={f.motivational_followup} onChange={(e) => setF({ ...f, motivational_followup: e.target.value })} /></label>
        {canWrite ? <div><button className="button-link" type="submit" disabled={save.saving}>Guardar evolución</button></div> : null}
      </form>
      <SaveStatus state={save.state} />
    </div>
  );
}
