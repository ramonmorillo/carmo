import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { SaveStatus } from '../components/ui/SaveStatus';
import { StatusBadge } from '../components/ui/StatusBadge';
import { assertModelUsable, catalogForPriority, CMO_ENGINE_VERSION, computeCmo, type CmoModelDefinition } from '../domain/cmoEngine';
import { effectivePriority, PRIORITY_LABELS, VALIDATION_LABELS } from '../domain/cmoLabels';
import { chronicActiveIngredients } from '../domain/medication';
import { suggestAgeGroup, suggestNutritionalStatus, suggestPolypharmacy, suggestTobacco, suggestYes, type Suggestion } from '../domain/cmoSuggestions';
import { currentObservations, deriveBmi } from '../domain/observations';
import { patientCode, ROLE_CAN, VISIT_LABELS } from '../domain/study';
import { addDaysIso } from '../domain/schedule';
import { fmtDate, label } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { useSave } from '../lib/useSave';
import {
  carmo, carmoWrite, type CmoModel, type InterventionCatalogItem, type ObservationRow, type Patient, type Stratification, type Treatment, type Visit,
} from '../services/carmoData';

type Data = { patient: Patient; visits: Visit[]; model: CmoModel | null; strats: Stratification[]; obs: ObservationRow[]; treatments: Treatment[]; catalog: InterventionCatalogItem[] };

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

export function PatientStratificationPage() {
  const { id = '' } = useParams();
  const session = useCarmoSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const patient = await carmo.patient(id);
      if (!patient) { setError('Paciente no accesible.'); return; }
      const [visits, models, strats, obs, treatments, catalog] = await Promise.all([
        carmo.visits(id), carmo.cmoModels(), carmo.stratifications(id), carmo.observations(id), carmo.treatments(id), carmo.interventionCatalog(),
      ]);
      const model = models.find((m) => m.status === 'validated') ?? models.find((m) => m.version === 'CMO-CV-SEFH-2024') ?? null;
      setData({ patient, visits, model, strats, obs, treatments, catalog });
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Cargando estratificación…" />;
  if (!data.model) return <Notice tone="warning">No hay ningún modelo CMO cargado.</Notice>;
  const def = data.model.definition;
  const usable = assertModelUsable({ version: data.model.version, status: data.model.status as 'draft', definition: def });
  const current = data.strats.find((s) => !data.strats.some((n) => n.supersedes_id === s.id));

  return (
    <div className="page-stack">
      <PageHeader eyebrow={<Link to={`/patients/${data.patient.id}`}>{patientCode(data.patient)}</Link>} title="Estratificación CMO cardiovascular"
        description={`${def.title ?? def.version} · versión ${def.version} · motor ${CMO_ENGINE_VERSION}. Puntos de corte: P1 ≥ ${def.thresholds.priority1Min}, P2 ≥ ${def.thresholds.priority2Min}; máximo ${def.maxScore}.`} />
      {!usable.usable ? (
        <Notice tone="warning" title="Modelo en borrador: solo vista previa">
          {usable.reason} El cálculo se puede previsualizar, pero la base de datos no guardará estratificaciones hasta que la coordinación valide el modelo (docs/CARMO_CMO_MODEL.md).
        </Notice>
      ) : null}
      {current ? <CurrentSummary s={current} def={def} catalog={data.catalog} /> : null}
      {ROLE_CAN.writeClinical(session.role) && data.patient.status === 'included'
        ? <StratificationForm data={data} def={def} canSave={usable.usable} previous={current ?? null} reload={load} /> : null}
      <History data={data} def={def} canValidate={ROLE_CAN.writeClinical(session.role)} reload={load} />
    </div>
  );
}

function CurrentSummary({ s, def, catalog }: { s: Stratification; def: CmoModelDefinition; catalog: InterventionCatalogItem[] }) {
  const p = effectivePriority(s) as 1 | 2 | 3;
  const fu = def.followUp?.[String(p) as '1' | '2' | '3'];
  const base = s.validated_at ?? s.calculated_at;
  const actions = catalogForPriority(catalog.filter((c) => c.status === 'validated'), p);
  return (
    <section className="card">
      <h2>Situación actual: {PRIORITY_LABELS[p]} <StatusBadge tone={s.validation_status === 'pending' ? 'warning' : 'positive'}>{VALIDATION_LABELS[s.validation_status]}</StatusBadge></h2>
      <p>{s.total_score} puntos · calculada el {fmtDate(s.calculated_at)}{s.validation_reason ? ` · motivo de elevación: ${s.validation_reason}` : ''}</p>
      {fu ? <p className="carmo-hint">Periodicidad del modelo: {fu.label}.{fu.firstFollowUpDays ? ` Seguimiento antes del ${fmtDate(addDaysIso(base.slice(0, 10), fu.firstFollowUpDays))}.` : ''}{fu.restratifyMonths ? ` Reestratificar antes del ${fmtDate(addMonthsIso(base, fu.restratifyMonths))}.` : ''}</p> : null}
      <details><summary>Actuaciones de Atención Farmacéutica para {PRIORITY_LABELS[p]} ({actions.length}, acumulativas)</summary>
        {['Seguimiento farmacoterapéutico', 'Educación, formación y seguimiento del paciente', 'Coordinación con el equipo asistencial', 'Entrevista motivacional', 'Seguimiento a distancia'].map((cat) => {
          const items = actions.filter((a) => a.category === cat);
          return items.length ? <div key={cat}><h3>{cat}</h3><ul>{items.map((a) => <li key={a.code}><strong>{a.code}</strong> · {a.label}</li>)}</ul></div> : null;
        })}
      </details>
      <p className="carmo-hint"><Link to="/interventions">Registrar intervenciones</Link></p>
    </section>
  );
}

function StratificationForm({ data, def, canSave, previous, reload }: { data: Data; def: CmoModelDefinition; canSave: boolean; previous: Stratification | null; reload: () => Promise<void> }) {
  const save = useSave();
  const openVisits = data.visits.filter((v) => v.status !== 'cancelled' && v.record_state !== 'closed');
  // Desde la ficha de visita se llega con ?visit=… y la estratificación se vincula a esa visita.
  const [params] = useSearchParams();
  const requested = openVisits.find((v) => v.id === params.get('visit'))?.id;
  const [visitId, setVisitId] = useState(requested ?? openVisits.find((v) => v.visit_code === 'BASAL')?.id ?? openVisits[0]?.id ?? '');
  const [inputs, setInputs] = useState<Record<string, string>>(() => ({ ...(previous?.inputs ?? {}) }));

  const suggestions = useMemo(() => {
    const cur = currentObservations(data.obs).filter((o) => !o.is_missing);
    const latest = (code: string) => cur.filter((o) => o.variable_code === code).sort((a, b) => b.observed_date.localeCompare(a.observed_date))[0];
    const w = latest('weight'); const h = latest('height');
    const bmi = deriveBmi(w ? { value: w.value_numeric, unit: w.unit } : undefined, h ? { value: h.value_numeric, unit: h.unit } : undefined);
    const ingredients = chronicActiveIngredients(data.treatments);
    const out: Record<string, Suggestion | null> = {
      age_group: suggestAgeGroup(latest('age_years')?.value_numeric ?? null),
      nutritional_status: suggestNutritionalStatus(bmi),
      polypharmacy: data.treatments.length ? suggestPolypharmacy(ingredients.length) : null,
      tobacco: suggestTobacco(latest('tobacco_use')?.value_boolean ?? null, latest('years_since_quitting')?.value_numeric ?? null),
      hypertension: suggestYes(latest('hypertension')?.value_boolean, 'Hipertensión registrada en el eCRD'),
      base_cv_pathology: suggestYes(latest('secondary_prevention')?.value_boolean, 'Prevención secundaria registrada en el eCRD'),
      non_cv_comorbidity: suggestYes(latest('diabetes')?.value_boolean, 'Diabetes registrada en el eCRD'),
    };
    const sex = latest('sex')?.value_text;
    if (sex === 'M') out.pregnancy = { value: 'no', basis: 'Sexo masculino' };
    if (sex === 'M') out.female_cv_condition = { value: 'no', basis: 'Sexo masculino' };
    return out;
  }, [data.obs, data.treatments]);

  const result = useMemo(() => {
    try { return computeCmo(def, Object.fromEntries(def.variables.map((v) => [v.code, inputs[v.code] ?? null]))); } catch (e) { return e as Error; }
  }, [def, inputs]);

  const submit = () => {
    if (result instanceof Error || result.priority === null || result.totalScore === null) return;
    void save.run(() => carmoWrite.insert('carmo_stratifications', {
      patient_id: data.patient.id, visit_id: visitId, model_version: def.version, engine_version: CMO_ENGINE_VERSION,
      inputs: Object.fromEntries(def.variables.map((v) => [v.code, inputs[v.code]])), item_results: {},
      total_score: result.totalScore, calculated_priority: result.priority, justification: result.justification,
      supersedes_id: previous?.id ?? null,
    }), reload);
  };

  return (
    <section className="card">
      <h2>{previous ? 'Reestratificar (el resultado anterior se conserva)' : 'Nueva estratificación'}</h2>
      <label className="carmo-form"><span>Visita<select value={visitId} onChange={(e) => setVisitId(e.target.value)}>
        {openVisits.map((v) => <option key={v.id} value={v.id}>{label(VISIT_LABELS, v.visit_code)} · {fmtDate(v.actual_date ?? v.planned_date)}</option>)}
      </select></span></label>
      {openVisits.length === 0 ? <Notice tone="warning">No hay visitas abiertas: programe o reabra una visita.</Notice> : null}
      {def.blocks.map((b) => (
        <div key={b.code} className="carmo-section">
          <h3>{b.label} <span className="text-muted">({result instanceof Error ? '—' : result.blocks[b.code]}/{b.max})</span></h3>
          {def.variables.filter((v) => v.block === b.code).map((v) => {
            const sug = suggestions[v.code];
            return (
              <div className="carmo-item" key={v.code} style={{ gridTemplateColumns: '18rem 1fr' }}>
                <div><strong>{v.group}</strong><p className="carmo-hint">{v.label}</p>
                  {sug ? <p className="carmo-hint">Dato disponible: {sug.basis}{sug.value ? <> · <button type="button" className="button-ghost button-sm" onClick={() => setInputs({ ...inputs, [v.code]: sug.value! })}>Usar sugerencia</button></> : null}</p> : null}
                </div>
                <fieldset aria-label={v.group}>
                  {v.options.map((o) => (
                    <label key={o.value}><input type="radio" name={v.code} checked={inputs[v.code] === o.value} onChange={() => setInputs({ ...inputs, [v.code]: o.value })} />
                      {o.label} <span className="text-muted">({o.forcePriority ? `P${o.forcePriority}` : o.excludes ? 'no aplicable' : `${o.points} p`})</span></label>
                  ))}
                </fieldset>
              </div>
            );
          })}
        </div>
      ))}
      {result instanceof Error ? <Notice tone="danger">{result.message}</Notice> : (
        <Notice tone={result.priority ? 'info' : 'warning'} title={result.priority ? `Resultado: ${result.totalScore}/${def.maxScore} puntos · ${PRIORITY_LABELS[result.priority]}` : 'Sin prioridad'}>
          {result.justification}
        </Notice>
      )}
      <div className="carmo-actions">
        <button type="button" className="button-link" disabled={!canSave || save.saving || result instanceof Error || !result.priority || !visitId} onClick={submit}>Guardar estratificación</button>
        {!canSave ? <span className="text-muted">Guardado desactivado: modelo en borrador.</span> : null}
      </div>
      <p className="carmo-hint">La base de datos rehace el cálculo con la misma definición y rechaza cualquier discrepancia. Toda clasificación queda pendiente de validación profesional.</p>
      <SaveStatus state={save.state} />
    </section>
  );
}

function History({ data, def, canValidate, reload }: { data: Data; def: CmoModelDefinition; canValidate: boolean; reload: () => Promise<void> }) {
  const save = useSave();
  const [reason, setReason] = useState('');
  const [raiseTo, setRaiseTo] = useState<number>(1);
  const sorted = [...data.strats].sort((a, b) => a.calculated_at.localeCompare(b.calculated_at));
  const visitLabel = (id: string) => { const v = data.visits.find((x) => x.id === id); return v ? label(VISIT_LABELS, v.visit_code) : '—'; };
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  return (
    <section className="card">
      <h2>Histórico de estratificaciones</h2>
      {sorted.length === 0 ? <p className="text-muted">Sin estratificaciones.</p> : (
        <div className="table-wrap"><table className="carmo-table">
          <thead><tr><th>Fecha</th><th>Visita</th><th>Modelo</th>{def.blocks.map((b) => <th key={b.code} className="numeric">{b.code.slice(0, 5)}.</th>)}<th className="numeric">Total</th><th>Calculada</th><th>Validación</th><th>Vigente</th></tr></thead>
          <tbody>{sorted.map((s) => (
            <tr key={s.id}><td>{fmtDate(s.calculated_at)}</td><td>{visitLabel(s.visit_id)}</td><td>{s.model_version}</td>
              {def.blocks.map((b) => <td key={b.code} className="numeric">{s.item_results?.blocks?.[b.code] ?? '—'}</td>)}
              <td className="numeric">{s.total_score}</td><td>P{s.calculated_priority}</td>
              <td>{VALIDATION_LABELS[s.validation_status]}{s.final_priority && s.final_priority !== s.calculated_priority ? ` → P${s.final_priority}` : ''}</td>
              <td>{data.strats.some((n) => n.supersedes_id === s.id) ? 'Sustituida' : 'Sí'}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {last && prev ? (
        <details><summary>Comparación con la estratificación anterior</summary>
          <table className="carmo-table"><thead><tr><th>Variable</th><th>Anterior</th><th>Actual</th></tr></thead><tbody>
            {def.variables.filter((v) => prev.inputs[v.code] !== last.inputs[v.code]).map((v) => (
              <tr key={v.code}><td>{v.group}</td><td>{v.options.find((o) => o.value === prev.inputs[v.code])?.label ?? '—'}</td><td>{v.options.find((o) => o.value === last.inputs[v.code])?.label ?? '—'}</td></tr>
            ))}
          </tbody></table>
        </details>
      ) : null}
      {canValidate && last && last.validation_status === 'pending' ? (
        <div className="carmo-section">
          <h3>Validación profesional</h3>
          <div className="carmo-actions">
            <button type="button" className="button-link" disabled={save.saving} onClick={() => void save.run(() => carmoWrite.update('carmo_stratifications', { validation_status: 'confirmed', final_priority: last.calculated_priority }, { id: last.id }), reload)}>Confirmar P{last.calculated_priority}</button>
            {last.calculated_priority > 1 ? <>
              <select aria-label="Elevar a" value={raiseTo} onChange={(e) => setRaiseTo(Number(e.target.value))}>{[1, 2].filter((p) => p < last.calculated_priority).map((p) => <option key={p} value={p}>Elevar a P{p}</option>)}</select>
              <input aria-label="Motivo de la elevación" placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="button-secondary" disabled={save.saving || reason.trim().length < 5 || raiseTo >= last.calculated_priority}
                onClick={() => void save.run(() => carmoWrite.update('carmo_stratifications', { validation_status: 'modified', final_priority: raiseTo, validation_reason: reason }, { id: last.id }), reload)}>Elevar prioridad</button>
            </> : null}
          </div>
          <p className="carmo-hint">El modelo permite elevar la prioridad por criterio profesional; no prevé rebajarla.</p>
          <SaveStatus state={save.state} />
        </div>
      ) : null}
    </section>
  );
}
