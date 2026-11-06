// Medicación del paciente vinculada a CIMA (sin texto libre) y revisión de la medicación en cada visita.
// Sustituye al antiguo panel de tratamientos. Las reglas las aplica la BD (migración 09): medicamento de
// CIMA obligatorio, unidad y pauta de listas cerradas, historial por eventos y revisión por visita.
import { FormEvent, useEffect, useRef, useState } from 'react';

import { Notice } from '../components/ui/Notice';
import { SaveStatus } from '../components/ui/SaveStatus';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  currentTreatments, DOSE_UNITS, EVENT_REASONS, FREQUENCY_LABELS, isStudyDrug, REVIEW_OUTCOME_LABELS, ROUTE_LABELS, routeOptions,
  TREATMENT_EVENT_LABELS, TREATMENT_STATUS_LABELS, treatmentPayload, type CimaDto,
} from '../domain/medication';
import { fmtDate, label, todayIso } from '../lib/format';
import { useSave } from '../lib/useSave';
import { carmoWrite, type Dispensation, type MedicationReview, type Patient, type Treatment, type TreatmentEvent, type Visit } from '../services/carmoData';
import { searchCima } from '../services/cimaSearch';

type Props = {
  patient: Patient; treatments: Treatment[]; events: TreatmentEvent[]; dispensations: Dispensation[]; canWrite: boolean; reload: () => Promise<void>;
  /** Contexto de visita: los registros nuevos se vinculan a ella y se muestra la revisión de la visita. */
  visit?: Visit | null; review?: MedicationReview | null;
};

export function MedicationPanel({ patient, treatments, events, dispensations, canWrite, reload, visit = null, review = null }: Props) {
  const current = currentTreatments(treatments).sort((a, b) => Number(isMain(b)) - Number(isMain(a)) || a.active_ingredient.localeCompare(b.active_ingredient, 'es'));
  const finished = treatments.filter((t) => t.status === 'finished');
  const Wrapper = visit ? 'div' : 'section';
  return (
    <Wrapper className={visit ? undefined : 'card'}>
      {visit ? null : <h2>Medicación del paciente</h2>}
      <p className="carmo-hint">Cada medicamento se selecciona en CIMA (AEMPS): no se escribe texto libre. Los cambios se registran como eventos con fecha y motivo; nada se borra.</p>
      {visit ? <ReviewBlock visit={visit} review={review} activeCount={current.length} canWrite={canWrite} reload={reload} /> : null}
      <h3>Medicación vigente ({current.length})</h3>
      {current.length === 0 ? <p className="text-muted">Sin medicación vigente registrada.</p> : (
        <div className="table-wrap"><table className="carmo-table">
          <thead><tr><th>Medicamento (CIMA)</th><th>Principio activo · ATC</th><th>Dosis y pauta</th><th>Vía</th><th>Inicio</th><th>Estado</th></tr></thead>
          <tbody>{current.map((t) => (
            <tr key={t.id}>
              <td><strong>{t.cima_name ?? t.presentation ?? t.active_ingredient}</strong>{isMain(t) ? <> <StatusBadge tone="info">Principal del estudio</StatusBadge></> : null}
                {!t.cima_nregistro ? <><br /><StatusBadge tone="warning">Registro previo sin CIMA</StatusBadge></> : <><br /><span className="carmo-hint">N.º registro {t.cima_nregistro}{t.cima_cn ? ` · CN ${t.cima_cn}` : ''}</span></>}</td>
              <td>{t.active_ingredient}{t.atc_code ? <><br /><span className="carmo-hint">{t.atc_code}</span></> : null}</td>
              <td>{t.dose_amount ?? '—'} {t.dose_unit ?? ''} · {t.frequency ?? '—'}</td>
              <td>{label(ROUTE_LABELS, t.route)}</td>
              <td>{fmtDate(t.start_date)}{t.started_before_inclusion ? <><br /><span className="carmo-hint">previo a la inclusión</span></> : null}</td>
              <td><StatusBadge tone={t.status === 'active' ? 'positive' : 'warning'}>{TREATMENT_STATUS_LABELS[t.status]}</StatusBadge></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {canWrite ? <AddFromCima patient={patient} visit={visit} reload={reload} /> : null}
      {canWrite && current.length > 0 ? <EventForm patient={patient} treatments={current} visit={visit} reload={reload} /> : null}
      <details className="carmo-section"><summary><strong>Historial de la medicación</strong> ({events.length} eventos{finished.length ? ` · ${finished.length} finalizado(s)` : ''})</summary>
        <ul>{[...events].sort((a, b) => b.event_date.localeCompare(a.event_date)).map((e) => {
          const t = treatments.find((x) => x.id === e.treatment_id);
          return <li key={e.id}>{fmtDate(e.event_date)} · <strong>{t?.cima_name ?? t?.active_ingredient ?? '—'}</strong> · {TREATMENT_EVENT_LABELS[e.event_type] ?? e.event_type}
            {e.new_dose_amount ? ` → ${e.new_dose_amount} ${e.new_dose_unit ?? ''}` : ''}{e.new_frequency ? ` (${e.new_frequency})` : ''}{e.reason ? ` · ${e.reason}` : ''}
            {e.adverse_reaction_description ? ` · RAM: ${e.adverse_reaction_description}` : ''}{visit && e.visit_id === visit.id ? <> <StatusBadge tone="info">esta visita</StatusBadge></> : null}</li>;
        })}</ul>
      </details>
      {canWrite ? <DispensationForm patient={patient} treatments={treatments.filter(isMain)} dispensations={dispensations} reload={reload} /> : null}
    </Wrapper>
  );
}

function isMain(t: Treatment) { return t.is_study_lipid_therapy; }

function ReviewBlock({ visit, review, activeCount, canWrite, reload }: { visit: Visit; review: MedicationReview | null; activeCount: number; canWrite: boolean; reload: () => Promise<void> }) {
  const save = useSave();
  const [reason, setReason] = useState('');
  const options = activeCount > 0 ? ['no_changes', 'changes_recorded'] : ['no_medication'];
  const record = (outcome: string) => void save.run(() => (review
    ? carmoWrite.update('carmo_visit_medication_reviews', { outcome, revision: review.revision, correction_reason: reason }, { visit_id: visit.id, revision: review.revision })
    : carmoWrite.insert('carmo_visit_medication_reviews', { visit_id: visit.id, outcome })), reload);
  return (
    <div className="carmo-section">
      <h3>Revisión de la medicación en la visita</h3>
      {review ? <Notice tone="success" title={REVIEW_OUTCOME_LABELS[review.outcome]}>Registrada el {fmtDate(review.reviewed_at)} con {review.active_medication_count} medicamento(s) vigente(s).</Notice>
        : <Notice tone="warning" title="Pendiente">Revise la medicación vigente con el paciente: añada lo que falte desde CIMA, registre cambios o suspensiones y, al terminar, confirme la revisión.</Notice>}
      {canWrite ? (
        <div className="carmo-actions">
          {review ? <input aria-label="Motivo para modificar la revisión" placeholder="Motivo para modificar la revisión" value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
          {options.map((o) => <button key={o} type="button" className={review?.outcome === o ? 'button-link' : 'button-secondary'} disabled={save.saving || (review !== null && reason.trim().length < 5)} onClick={() => record(o)}>{REVIEW_OUTCOME_LABELS[o]}</button>)}
        </div>
      ) : null}
      <SaveStatus state={save.state} />
    </div>
  );
}

function AddFromCima({ patient, visit, reload }: { patient: Patient; visit: Visit | null; reload: () => Promise<void> }) {
  const save = useSave();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CimaDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<CimaDto | null>(null);
  const [form, setForm] = useState({ dose_amount: '', dose_unit: 'mg', frequency_code: '', route: '', start_date: visit?.actual_date ?? todayIso() });
  const seq = useRef(0);

  useEffect(() => {
    if (picked || query.trim().length < 3) { setResults([]); setSearchError(null); return; }
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      setSearching(true);
      searchCima(query).then((items) => { if (mine === seq.current) { setResults(items); setSearchError(null); } })
        .catch((e: Error) => { if (mine === seq.current) { setResults([]); setSearchError(e.message); } })
        .finally(() => { if (mine === seq.current) setSearching(false); });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, picked]);

  const pick = (dto: CimaDto) => {
    const routes = routeOptions(dto);
    setPicked(dto);
    setForm((f) => ({ ...f, route: routes[0], dose_unit: f.dose_unit || 'mg' }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    let payload: Record<string, unknown>;
    try { payload = treatmentPayload(picked, form, patient.id, visit?.id ?? null); } catch (err) {
      void save.run(async () => ({ data: null, error: { message: (err as Error).message } }));
      return;
    }
    void save.run(() => carmoWrite.insert('carmo_treatments', payload), async () => { setPicked(null); setQuery(''); setForm({ ...form, dose_amount: '', frequency_code: '' }); await reload(); });
  };

  return (
    <div className="carmo-section">
      <h3>Añadir medicamento desde CIMA</h3>
      {!picked ? (
        <>
          <label className="carmo-form"><span>Buscar por nombre comercial, principio activo o código nacional (mín. 3 caracteres)
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="p. ej., Repatha, atorvastatina, 709551" autoComplete="off" /></span></label>
          {searching ? <p className="carmo-hint">Consultando CIMA…</p> : null}
          {searchError ? <Notice tone="danger" title="No se pudo consultar CIMA">{searchError}</Notice> : null}
          {!searching && !searchError && query.trim().length >= 3 && results.length === 0 ? <p className="text-muted">Sin resultados autorizados y comercializados en CIMA.</p> : null}
          {results.length > 0 ? (
            <ul className="carmo-cima-results">{results.map((r) => (
              <li key={r.id}><button type="button" className="carmo-cima-option" onClick={() => pick(r)}>
                <strong>{r.cima_name}</strong>{isStudyDrug(r) ? <> <StatusBadge tone="info">Principal del estudio</StatusBadge></> : null}
                <span>{r.ingredient_names.join(' + ') || '—'}{r.atc_codes[0] ? ` · ATC ${r.atc_codes[0]}` : ''}{r.labtitular ? ` · ${r.labtitular}` : ''}</span>
                <span className="carmo-hint">{r.pharmaceutical_form ?? ''}{r.routes.length ? ` · ${r.routes.join(', ')}` : ''} · n.º registro {r.cima_nregistro ?? '—'}{r.commercialized === false ? ' · no comercializado' : ''}</span>
              </button></li>
            ))}</ul>
          ) : null}
        </>
      ) : (
        <form className="carmo-form" onSubmit={submit}>
          <div className="span-all"><strong>{picked.cima_name}</strong> <span className="text-muted">· {picked.ingredient_names.join(' + ')}{picked.atc_codes[0] ? ` · ATC ${picked.atc_codes[0]}` : ''} · n.º registro {picked.cima_nregistro}</span>
            {' '}<button type="button" className="button-ghost button-sm" onClick={() => setPicked(null)}>Cambiar medicamento</button></div>
          <label>Dosis por toma<input type="number" min="0" step="any" value={form.dose_amount} onChange={(e) => setForm({ ...form, dose_amount: e.target.value })} /></label>
          <label>Unidad<select value={form.dose_unit} onChange={(e) => setForm({ ...form, dose_unit: e.target.value })}>{DOSE_UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label>Pauta<select required value={form.frequency_code} onChange={(e) => setForm({ ...form, frequency_code: e.target.value })}><option value="">—</option>{Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Vía (autorizadas en CIMA)<select value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>{routeOptions(picked).map((r) => <option key={r} value={r}>{ROUTE_LABELS[r]}</option>)}</select></label>
          <label>Fecha de inicio<input type="date" required max={todayIso()} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <div className="carmo-actions"><button className="button-link" type="submit" disabled={save.saving}>Añadir a la medicación</button></div>
        </form>
      )}
      <SaveStatus state={save.state} />
    </div>
  );
}

function EventForm({ patient, treatments, visit, reload }: { patient: Patient; treatments: Treatment[]; visit: Visit | null; reload: () => Promise<void> }) {
  const save = useSave();
  const [evt, setEvt] = useState({ treatment_id: '', event_type: 'dose_change', event_date: visit?.actual_date ?? todayIso(), new_dose_amount: '', new_dose_unit: 'mg', new_frequency_code: '', reason: '', adverse_reaction_description: '' });
  const needsReason = ['dose_change', 'suspension', 'restart', 'end'].includes(evt.event_type);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(() => carmoWrite.insert('carmo_treatment_events', {
      treatment_id: evt.treatment_id, patient_id: patient.id, visit_id: visit?.id ?? null, event_type: evt.event_type, event_date: evt.event_date,
      new_dose_amount: evt.event_type === 'dose_change' && evt.new_dose_amount ? Number(evt.new_dose_amount) : null,
      new_dose_unit: evt.event_type === 'dose_change' && evt.new_dose_amount ? evt.new_dose_unit : null,
      new_frequency_code: evt.event_type === 'dose_change' && evt.new_frequency_code ? evt.new_frequency_code : null,
      reason: evt.reason || null, adverse_reaction_description: evt.event_type === 'adverse_reaction' ? evt.adverse_reaction_description : null,
    }), async () => { setEvt({ ...evt, treatment_id: '', new_dose_amount: '', new_frequency_code: '', reason: '', adverse_reaction_description: '' }); await reload(); });
  };
  return (
    <div className="carmo-section">
      <h3>Registrar cambio, suspensión, fin o reacción adversa</h3>
      <form className="carmo-form" onSubmit={submit}>
        <label>Medicamento<select required value={evt.treatment_id} onChange={(e) => setEvt({ ...evt, treatment_id: e.target.value })}><option value="">—</option>
          {treatments.map((t) => <option key={t.id} value={t.id}>{t.cima_name ?? t.active_ingredient} ({TREATMENT_STATUS_LABELS[t.status]})</option>)}</select></label>
        <label>Tipo<select value={evt.event_type} onChange={(e) => setEvt({ ...evt, event_type: e.target.value })}>{Object.entries(TREATMENT_EVENT_LABELS).filter(([k]) => k !== 'start').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Fecha<input type="date" required max={todayIso()} value={evt.event_date} onChange={(e) => setEvt({ ...evt, event_date: e.target.value })} /></label>
        {evt.event_type === 'dose_change' ? <>
          <label>Nueva dosis<input type="number" min="0" step="any" required value={evt.new_dose_amount} onChange={(e) => setEvt({ ...evt, new_dose_amount: e.target.value })} /></label>
          <label>Unidad<select value={evt.new_dose_unit} onChange={(e) => setEvt({ ...evt, new_dose_unit: e.target.value })}>{DOSE_UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label>Nueva pauta<select value={evt.new_frequency_code} onChange={(e) => setEvt({ ...evt, new_frequency_code: e.target.value })}><option value="">Sin cambio de pauta</option>{Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </> : null}
        <label>Motivo{needsReason ? ' (obligatorio)' : ''}<select required={needsReason} value={evt.reason} onChange={(e) => setEvt({ ...evt, reason: e.target.value })}><option value="">—</option>{EVENT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
        {evt.event_type === 'adverse_reaction' ? <label className="span-all">Descripción de la reacción adversa (sin datos identificativos)<textarea required maxLength={1000} value={evt.adverse_reaction_description} onChange={(e) => setEvt({ ...evt, adverse_reaction_description: e.target.value })} /></label> : null}
        <div><button className="button-secondary" type="submit" disabled={save.saving}>Registrar</button></div>
      </form>
      <SaveStatus state={save.state} />
    </div>
  );
}

function DispensationForm({ patient, treatments, dispensations, reload }: { patient: Patient; treatments: Treatment[]; dispensations: Dispensation[]; reload: () => Promise<void> }) {
  const save = useSave();
  const [disp, setDisp] = useState({ treatment_id: '', dispensed_date: todayIso(), units_dispensed: '', days_supply: '' });
  if (treatments.length === 0) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(() => carmoWrite.insert('carmo_dispensations', {
      treatment_id: disp.treatment_id, patient_id: patient.id, dispensed_date: disp.dispensed_date,
      units_dispensed: Number(disp.units_dispensed), days_supply: disp.days_supply ? Number(disp.days_supply) : null,
    }), reload);
  };
  return (
    <details className="carmo-section"><summary><strong>Dispensaciones del tratamiento principal</strong> ({dispensations.length})</summary>
      <ul>{[...dispensations].sort((a, b) => b.dispensed_date.localeCompare(a.dispensed_date)).map((d) => <li key={d.id}>{fmtDate(d.dispensed_date)} · {treatments.find((t) => t.id === d.treatment_id)?.cima_name ?? '—'} · {d.units_dispensed} unidades{d.days_supply ? ` · ${d.days_supply} días` : ''}</li>)}</ul>
      <form className="carmo-form" onSubmit={submit}>
        <label>Tratamiento<select required value={disp.treatment_id} onChange={(e) => setDisp({ ...disp, treatment_id: e.target.value })}><option value="">—</option>{treatments.map((t) => <option key={t.id} value={t.id}>{t.cima_name ?? t.active_ingredient}</option>)}</select></label>
        <label>Fecha<input type="date" required max={todayIso()} value={disp.dispensed_date} onChange={(e) => setDisp({ ...disp, dispensed_date: e.target.value })} /></label>
        <label>Unidades dispensadas<input type="number" min="0" step="any" required value={disp.units_dispensed} onChange={(e) => setDisp({ ...disp, units_dispensed: e.target.value })} /></label>
        <label>Días de cobertura<input type="number" min="1" value={disp.days_supply} onChange={(e) => setDisp({ ...disp, days_supply: e.target.value })} /></label>
        <div><button className="button-secondary" type="submit" disabled={save.saving}>Registrar dispensación</button></div>
      </form>
      <p className="carmo-hint">La adherencia por dispensación no se calcula hasta definir método, ventana y umbral (RG-20).</p>
      <SaveStatus state={save.state} />
    </details>
  );
}
