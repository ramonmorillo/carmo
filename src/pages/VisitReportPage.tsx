// Informe imprimible de una visita (como en IRIS), para imprimir o guardar en PDF desde el navegador e
// incorporarlo a la historia clínica. Seudonimizado: solo el código de paciente; el centro lo vincula a su
// paciente con su tabla de correspondencias. No modifica nada: solo lee lo registrado.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PROJECT_IDENTITY, PROJECT_INSTITUTIONAL_REFERENCE } from '../constants/institutional';
import { ACCEPTANCE_LABELS, PRIORITY_LABELS, RECIPIENT_LABELS, VALIDATION_LABELS } from '../domain/cmoLabels';
import { currentObservations } from '../domain/observations';
import { storedScoreLabel } from '../domain/questionnaires';
import { doseAtDate, medicationAtDate, REVIEW_OUTCOME_LABELS, ROUTE_LABELS, TREATMENT_EVENT_LABELS } from '../domain/medication';
import {
  DATA_SOURCE_LABELS, MISSING_REASON_LABELS, MODALITY_LABELS, RECORD_STATE_LABELS, ROLE_CAN, TEMPORAL_CONTEXT_LABELS, VISIT_LABELS, VISIT_STATUS_LABELS, patientCode,
} from '../domain/study';
import { REQ_STATUS_LABELS, visitRequirements } from '../domain/visitRequirements';
import { fmtDate, label, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import {
  carmo, type Administration, type CmoModel, type Evolution, type Instrument, type Intervention, type InterventionCatalogItem, type MedicationReview,
  type ObservationRow, type Patient, type Profile, type Stratification, type Treatment, type TreatmentEvent, type Variable, type Visit,
} from '../services/carmoData';

type Data = {
  visit: Visit; patient: Patient; variables: Variable[]; observations: ObservationRow[]; evolution: Evolution | null; instruments: Instrument[];
  administrations: Administration[]; profiles: Profile[]; treatments: Treatment[]; events: TreatmentEvent[]; review: MedicationReview | null;
  strats: Stratification[]; interventions: Intervention[]; catalog: InterventionCatalogItem[]; models: CmoModel[];
};

const SECTION_LABELS: Record<string, string> = {
  demographic: 'Demográficas', cv_history: 'Antecedentes cardiovasculares', cv_risk_factor: 'Factores de riesgo', anthropometric: 'Antropometría',
  laboratory: 'Analítica', cv_event: 'Eventos cardiovasculares', sociosanitary: 'Sociosanitarias', pharmacotherapy: 'Farmacoterapia', other: 'Otras',
};

export function VisitReportPage() {
  const { visitId = '' } = useParams();
  const session = useCarmoSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (!ROLE_CAN.readClinical(session.role)) { setError('Su rol no tiene acceso a los datos clínicos de la visita.'); return; }
      const visit = await carmo.visit(visitId);
      if (!visit) { setError('Visita no encontrada o fuera de su ámbito.'); return; }
      const pid = visit.patient_id;
      const [patient, variables, observations, evolution, instruments, administrations, profiles, treatments, events, reviews, strats, interventions, catalog, models] = await Promise.all([
        carmo.patient(pid), carmo.variables(), carmo.observations(pid), carmo.evolution(visit.id), carmo.instruments(), carmo.administrations(pid), carmo.profiles(),
        carmo.treatments(pid), carmo.treatmentEvents(pid), carmo.medicationReviews(pid), carmo.stratifications(pid), carmo.interventions(pid),
        carmo.interventionCatalog(), carmo.cmoModels(),
      ]);
      if (!patient) { setError('Paciente no accesible.'); return; }
      setData({ visit, patient, variables, observations, evolution, instruments, administrations, profiles, treatments, events,
        review: reviews.find((r) => r.visit_id === visit.id) ?? null, strats, interventions, catalog, models });
    } catch (e) { setError((e as Error).message); }
  }, [visitId, session.role]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Preparando el informe…" />;

  const { visit, patient } = data;
  const ref = PROJECT_INSTITUTIONAL_REFERENCE;
  const center = session.centers.find((c) => c.id === patient.center_id);
  const date = visit.actual_date ?? visit.planned_date ?? todayIso();
  const responsible = data.profiles.find((p) => p.id === visit.responsible_id)?.full_name ?? '—';
  const validated = data.models.find((m) => m.status === 'validated');
  const def = data.models.find((m) => m.status === 'validated')?.definition;
  const reqs = visitRequirements(visit, {
    variables: data.variables, observations: data.observations, administrations: data.administrations, instruments: data.instruments,
    stratifications: data.strats, interventionCount: data.interventions.filter((i) => i.visit_id === visit.id).length, review: data.review,
    followUp: (validated?.definition.followUp as Record<string, { restratifyMonths: number | null }> | undefined) ?? null, today: todayIso(), cmoAvailable: Boolean(validated),
  });

  // Variables: las observaciones vigentes de la visita (y, en la visita inicial, los antecedentes previos a la inclusión).
  const visitObs = currentObservations(data.observations.filter((o) => o.visit_id === visit.id
    || (o.visit_id === null && visit.visit_code === 'BASAL' && o.temporal_context === 'history_prior_inclusion')));
  const varOf = (code: string) => data.variables.find((v) => v.code === code);
  const obsRows = [...visitObs].sort((a, b) => (varOf(a.variable_code)?.section ?? '').localeCompare(varOf(b.variable_code)?.section ?? '') || (varOf(a.variable_code)?.label ?? '').localeCompare(varOf(b.variable_code)?.label ?? '', 'es'));
  const value = (o: ObservationRow) => {
    const v = varOf(o.variable_code);
    if (o.is_missing) return `Ausente: ${label(MISSING_REASON_LABELS, o.missing_reason)}`;
    if (o.value_boolean !== null) return o.value_boolean ? 'Sí' : 'No';
    if (o.value_numeric !== null) return `${o.value_numeric} ${o.unit ?? ''}`.trim();
    if (o.value_text !== null) return v?.allowed_values?.[o.value_text] ?? o.value_text;
    return fmtDate(o.value_date);
  };

  // Medicación vigente en la fecha de la visita y cambios registrados en ella.
  const meds = medicationAtDate(data.treatments, data.events, date).sort((a, b) => Number(b.is_study_lipid_therapy) - Number(a.is_study_lipid_therapy) || a.active_ingredient.localeCompare(b.active_ingredient, 'es'));
  const doseOf = (t: Treatment) => doseAtDate(t, data.events, date);
  const visitEvents = data.events.filter((e) => e.visit_id === visit.id).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const trtName = (id: string) => { const t = data.treatments.find((x) => x.id === id); return t?.cima_name ?? t?.active_ingredient ?? '—'; };

  // Estratificación CMO de la visita (la vigente, no sustituida) y factores que puntúan.
  const strat = data.strats.filter((s) => s.visit_id === visit.id && !data.strats.some((n) => n.supersedes_id === s.id))
    .sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))[0];
  const stratDef = data.models.find((m) => m.version === strat?.model_version)?.definition ?? def;
  const factors = strat && stratDef ? stratDef.variables.map((v) => {
    const opt = v.options.find((o) => o.value === strat.inputs[v.code]);
    return opt && opt.points > 0 ? { block: v.block, label: v.group ?? v.label, answer: opt.label, points: opt.points } : null;
  }).filter((x): x is { block: string; label: string; answer: string; points: number } => x !== null) : [];

  const interventions = data.interventions.filter((i) => i.visit_id === visit.id);
  const catalogLabel = (code: string) => data.catalog.find((c) => c.code === code)?.label ?? '';
  const instruments = data.instruments.filter((i) => i.status !== 'retired' && (i.allowed_visits.includes(visit.visit_code) || data.administrations.some((a) => a.visit_id === visit.id && a.instrument_code === i.code)));
  const evo = data.evolution;
  const generated = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="page-stack">
      <div className="carmo-actions no-print">
        <Link to={`/visits/${visit.id}`}>← Volver a la visita</Link>
        <button type="button" className="button-link" onClick={() => window.print()}>Imprimir o guardar en PDF</button>
      </div>
      {visit.record_state !== 'closed' ? (
        <Notice className="no-print" tone="warning" title="Visita sin cerrar">El informe refleja los datos actuales, que aún pueden cambiar. Para incorporarlo a la historia clínica, emítalo tras cerrar la visita.</Notice>
      ) : null}

      <article className="carmo-report" aria-label="Informe de la visita">
        <header>
          <div>
            <h1>Informe de visita · {label(VISIT_LABELS, visit.visit_code)}</h1>
            <div>{PROJECT_IDENTITY.name} · {ref.protocolCode} · {PROJECT_IDENTITY.subtitle}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div><strong>Paciente {patientCode(patient)}</strong></div>
            <div>Centro {center?.code ?? '—'}{center ? ` · ${center.name}` : ''}</div>
            {visit.record_state !== 'closed' ? <div><strong>BORRADOR · visita sin cerrar</strong></div> : null}
            {session.dataMode === 'validation' || patient.is_synthetic ? <div><strong>DATOS SINTÉTICOS · FASE DE VALIDACIÓN</strong></div> : null}
          </div>
        </header>

        <section>
          <dl className="carmo-report-facts">
            <div><dt>Fecha de la visita</dt><dd>{fmtDate(visit.actual_date)}{visit.actual_date ? '' : ` (prevista ${fmtDate(visit.planned_date)})`}</dd></div>
            <div><dt>Estado</dt><dd>{label(VISIT_STATUS_LABELS, visit.status)}</dd></div>
            <div><dt>Modalidad</dt><dd>{label(MODALITY_LABELS, visit.modality)}</dd></div>
            <div><dt>Profesional responsable</dt><dd>{responsible}</dd></div>
            <div><dt>Registro</dt><dd>{label(RECORD_STATE_LABELS, visit.record_state)}</dd></div>
            <div><dt>Inclusión en el estudio</dt><dd>{fmtDate(patient.inclusion_date)}</dd></div>
          </dl>
        </section>

        <section>
          <h2>Completitud de la visita</h2>
          <table><tbody>{reqs.map((r) => <tr key={r.key}><td style={{ width: '12rem' }}><strong>{r.label}</strong></td><td style={{ width: '7rem' }}>{REQ_STATUS_LABELS[r.status]}</td><td>{r.detail}</td></tr>)}</tbody></table>
        </section>

        <section>
          <h2>Variables clínicas</h2>
          {obsRows.length === 0 ? <p className="carmo-report-text">Sin variables registradas en esta visita.</p> : (
            <table><thead><tr><th>Bloque</th><th>Variable</th><th>Valor</th><th>Fecha</th><th>Origen</th><th>Contexto</th></tr></thead><tbody>
              {obsRows.map((o) => <tr key={o.id}><td>{SECTION_LABELS[varOf(o.variable_code)?.section ?? ''] ?? ''}</td><td>{varOf(o.variable_code)?.label ?? o.variable_code}{o.supersedes_id ? ' (corregido)' : ''}</td>
                <td><strong>{value(o)}</strong></td><td>{fmtDate(o.observed_date)}</td><td>{label(DATA_SOURCE_LABELS, o.data_source)}</td><td>{label(TEMPORAL_CONTEXT_LABELS, o.temporal_context)}</td></tr>)}
            </tbody></table>
          )}
        </section>

        <section>
          <h2>Medicación vigente en la fecha de la visita</h2>
          <p className="carmo-report-text">Revisión de la medicación en la visita: <strong>{data.review ? REVIEW_OUTCOME_LABELS[data.review.outcome] : 'no registrada'}</strong>. Medicamentos seleccionados en CIMA (AEMPS).</p>
          {meds.length === 0 ? <p className="carmo-report-text">Sin medicación registrada vigente en esa fecha.</p> : (
            <table><thead><tr><th>Medicamento</th><th>Principio activo · ATC</th><th>Dosis y pauta</th><th>Vía</th><th>Inicio</th><th>Situación</th></tr></thead><tbody>
              {meds.map((t) => <tr key={t.id}>
                <td>{t.cima_name ?? t.presentation ?? t.active_ingredient}{t.is_study_lipid_therapy ? ' · tratamiento principal del estudio' : ''}{t.cima_nregistro ? <><br />N.º registro {t.cima_nregistro}{t.cima_cn ? ` · CN ${t.cima_cn}` : ''}</> : null}</td>
                <td>{t.active_ingredient}{t.atc_code ? ` · ${t.atc_code}` : ''}</td>
                {(() => { const d = doseOf(t); return <td>{d.amount ?? '—'} {d.unit ?? ''} · {d.frequency ?? '—'}{d.exact ? null : <><br /><em>Dosis actual: la dosis inicial no consta (registro anterior al 06/11/2026) y hubo cambios posteriores a la visita</em></>}</td>; })()}
                <td>{label(ROUTE_LABELS, t.route)}</td><td>{fmtDate(t.start_date)}</td><td>{t.suspendedAtDate ? 'Suspendido' : 'Activo'}</td>
              </tr>)}
            </tbody></table>
          )}
          {visitEvents.length > 0 ? (
            <>
              <p className="carmo-report-text"><strong>Cambios registrados en esta visita</strong></p>
              <table><thead><tr><th>Fecha</th><th>Medicamento</th><th>Cambio</th><th>Detalle</th><th>Motivo</th></tr></thead><tbody>
                {visitEvents.map((e) => <tr key={e.id}><td>{fmtDate(e.event_date)}</td><td>{trtName(e.treatment_id)}</td><td>{TREATMENT_EVENT_LABELS[e.event_type] ?? e.event_type}</td>
                  <td>{e.new_dose_amount ? `${e.new_dose_amount} ${e.new_dose_unit ?? ''}` : ''}{e.new_frequency ? ` · ${e.new_frequency}` : ''}{e.adverse_reaction_description ? `RAM: ${e.adverse_reaction_description}` : ''}</td><td>{e.reason ?? ''}</td></tr>)}
              </tbody></table>
            </>
          ) : null}
        </section>

        <section>
          <h2>Estratificación CMO</h2>
          {!strat ? <p className="carmo-report-text">Sin estratificación registrada en esta visita.</p> : (
            <>
              <dl className="carmo-report-facts">
                <div><dt>Modelo</dt><dd>{strat.model_version}</dd></div>
                <div><dt>Puntuación</dt><dd>{strat.total_score ?? '—'}{stratDef ? ` / ${stratDef.maxScore}` : ''}</dd></div>
                <div><dt>Prioridad calculada</dt><dd>{PRIORITY_LABELS[strat.calculated_priority]}</dd></div>
                <div><dt>Prioridad final</dt><dd>{PRIORITY_LABELS[strat.final_priority ?? strat.calculated_priority]}</dd></div>
                <div><dt>Validación</dt><dd>{VALIDATION_LABELS[strat.validation_status] ?? strat.validation_status}</dd></div>
                {stratDef ? stratDef.blocks.map((b) => <div key={b.code}><dt>{b.label}</dt><dd>{strat.item_results?.blocks?.[b.code] ?? '—'} / {b.max}</dd></div>) : null}
              </dl>
              {strat.validation_reason ? <p className="carmo-report-text">Motivo de la elevación: {strat.validation_reason}</p> : null}
              {strat.item_results?.applied_exceptions?.length ? <p className="carmo-report-text">Excepciones aplicadas: {strat.item_results.applied_exceptions.join(', ')}</p> : null}
              {factors.length > 0 ? (
                <table><thead><tr><th>Factor que puntúa</th><th>Respuesta</th><th>Puntos</th></tr></thead><tbody>
                  {factors.map((f) => <tr key={f.label}><td>{f.label}</td><td>{f.answer}</td><td>{f.points}</td></tr>)}
                </tbody></table>
              ) : null}
            </>
          )}
        </section>

        <section>
          <h2>Intervenciones farmacéuticas</h2>
          {interventions.length === 0 ? <p className="carmo-report-text">Sin intervenciones registradas en esta visita.</p> : (
            <table><thead><tr><th>Fecha</th><th>Actuación</th><th>Tipo · modalidad</th><th>Destinatario</th><th>Aceptación</th><th>Actuación realizada / resultado</th></tr></thead><tbody>
              {interventions.map((i) => <tr key={i.id}><td>{fmtDate(i.intervention_date)}</td><td>{i.catalog_code} · {catalogLabel(i.catalog_code)}</td>
                <td>{i.is_scheduled ? 'Programada' : 'No programada'} · {i.modality === 'in_person' ? 'presencial' : 'telemática'}</td><td>{label(RECIPIENT_LABELS, i.recipient)}</td>
                <td>{label(ACCEPTANCE_LABELS, i.acceptance)}</td><td>{[i.action_taken, i.outcome].filter(Boolean).join(' · ')}</td></tr>)}
            </tbody></table>
          )}
        </section>

        <section>
          <h2>Cuestionarios</h2>
          {instruments.length === 0 ? <p className="carmo-report-text">El protocolo no prevé cuestionarios en esta visita.</p> : (
            <table><thead><tr><th>Instrumento</th><th>Estado</th><th>Resultado</th><th>Fecha</th></tr></thead><tbody>
              {instruments.map((i) => {
                const a = data.administrations.find((x) => x.visit_id === visit.id && x.instrument_code === i.code);
                return <tr key={i.code}><td>{i.code} ({i.version})</td>
                  <td>{a ? (a.status === 'completed' ? 'Completado' : a.status === 'not_done' ? `No realizado${a.not_done_reason ? `: ${a.not_done_reason}` : ''}` : 'En curso') : 'Pendiente'}</td>
                  <td>{a?.status === 'completed' ? storedScoreLabel(i.code, a.scores) : '—'}</td><td>{fmtDate(a?.administration_date)}</td></tr>;
              })}
            </tbody></table>
          )}
        </section>

        {evo && (evo.clinical_evolution || evo.pharmacotherapy_update || evo.motivational_followup) ? (
          <section>
            <h2>Evolución y seguimiento farmacéutico</h2>
            {evo.clinical_evolution ? <><p className="carmo-report-text"><strong>Evolución clínica</strong></p><p className="carmo-report-text">{evo.clinical_evolution}</p></> : null}
            {evo.pharmacotherapy_update ? <><p className="carmo-report-text"><strong>Actualización farmacoterapéutica</strong></p><p className="carmo-report-text">{evo.pharmacotherapy_update}</p></> : null}
            {evo.motivational_followup ? <><p className="carmo-report-text"><strong>Seguimiento motivacional</strong></p><p className="carmo-report-text">{evo.motivational_followup}</p></> : null}
          </section>
        ) : null}

        <div className="carmo-report-sign"><div>Farmacéutico/a responsable</div><div>Fecha y firma</div></div>
        <footer className="carmo-report-foot">
          <span>Documento seudonimizado: no contiene nombre, NHC ni otros identificadores directos. El centro lo vincula a su paciente mediante su tabla de correspondencias.</span>
          <span>Generado el {generated} por {session.fullName ?? 'usuario de CARMO'} · {PROJECT_IDENTITY.name} · {ref.protocolCode} · Promotor: {ref.sponsor} · {ref.ethicsCommittee} nº {ref.ethicsApprovalCode}</span>
        </footer>
      </article>
    </div>
  );
}
