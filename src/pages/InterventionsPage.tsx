import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { SaveStatus } from '../components/ui/SaveStatus';
import { catalogForPriority } from '../domain/cmoEngine';
import { ACCEPTANCE_LABELS, DOMAIN_LABELS, effectivePriority, PRIORITY_LABELS, RECIPIENT_LABELS } from '../domain/cmoLabels';
import { patientCode, ROLE_CAN, VISIT_LABELS } from '../domain/study';
import { fmtDate, label, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { useSave } from '../lib/useSave';
import { carmo, carmoWrite, type Intervention, type InterventionCatalogItem, type Patient, type Stratification, type Visit } from '../services/carmoData';

export function InterventionsPage() {
  const session = useCarmoSession();
  const save = useSave();
  const [d, setD] = useState<{ catalog: InterventionCatalogItem[]; items: Intervention[]; patients: Patient[]; visits: Visit[]; strats: Stratification[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [f, setF] = useState({ patient_id: '', visit_id: '', catalog_code: '', intervention_date: todayIso(), is_scheduled: 'true', modality: 'in_person', recipient: 'patient', acceptance: 'accepted', reason: '', action_taken: '', outcome: '', followup_status: 'open' });
  const load = useCallback(async () => {
    try {
      const [catalog, items, patients, visits, strats] = await Promise.all([carmo.interventionCatalog(), carmo.interventions(), carmo.patients(), carmo.visits(), carmo.stratifications()]);
      setD({ catalog: catalog.filter((c) => c.status === 'validated'), items, patients, visits, strats });
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const currentStrat = useMemo(() => (d && f.patient_id ? d.strats.find((s) => s.patient_id === f.patient_id && !d.strats.some((n) => n.supersedes_id === s.id)) : undefined), [d, f.patient_id]);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState label="Cargando…" />;
  const priority = currentStrat ? (effectivePriority(currentStrat) as 1 | 2 | 3) : null;
  const options = priority && !showAll ? catalogForPriority(d.catalog, priority) : d.catalog;
  const included = d.patients.filter((p) => p.status === 'included');
  const code = (pid: string) => { const p = d.patients.find((x) => x.id === pid); return p ? patientCode(p) : '—'; };
  const cat = (c: string) => d.catalog.find((x) => x.code === c);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(() => carmoWrite.insert('carmo_interventions', {
      patient_id: f.patient_id, visit_id: f.visit_id || null, catalog_code: f.catalog_code, intervention_date: f.intervention_date,
      is_scheduled: f.is_scheduled === 'true', modality: f.modality, recipient: f.recipient, acceptance: f.acceptance,
      reason: f.reason || null, action_taken: f.action_taken || null, outcome: f.outcome || null, followup_status: f.followup_status,
      stratification_id: currentStrat?.id ?? null,
    }), load);
  };

  // Recuentos por categoría (objetivo secundario del protocolo: número y tipo de intervenciones).
  const byCategory = Object.entries(d.items.reduce<Record<string, number>>((acc, i) => { const c = cat(i.catalog_code)?.category ?? i.catalog_code; acc[c] = (acc[c] ?? 0) + 1; return acc; }, {}));

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Intervenciones" title="Actuaciones de Atención Farmacéutica" description="Catálogo del modelo CMO cardiovascular (Tablas 5-7, acumulativas por prioridad) más la entrevista motivacional y el seguimiento a distancia. Programadas o no programadas; presenciales o telemáticas." />
      {ROLE_CAN.writeClinical(session.role) ? (
        <section className="card"><h2>Registrar intervención</h2>
          <form className="carmo-form" onSubmit={submit}>
            <label>Paciente<select required value={f.patient_id} onChange={(e) => setF({ ...f, patient_id: e.target.value, visit_id: '', catalog_code: '' })}><option value="">—</option>{included.map((p) => <option key={p.id} value={p.id}>{patientCode(p)}</option>)}</select></label>
            <label>Visita (opcional)<select value={f.visit_id} onChange={(e) => setF({ ...f, visit_id: e.target.value })}><option value="">Sin visita</option>{d.visits.filter((v) => v.patient_id === f.patient_id && v.status !== 'cancelled' && v.record_state !== 'closed').map((v) => <option key={v.id} value={v.id}>{label(VISIT_LABELS, v.visit_code)} · {fmtDate(v.actual_date ?? v.planned_date)}</option>)}</select></label>
            <label className="span-all">Actuación {priority ? `(recomendadas para ${PRIORITY_LABELS[priority]})` : '(paciente sin estratificación vigente: catálogo completo)'}
              <select required value={f.catalog_code} onChange={(e) => setF({ ...f, catalog_code: e.target.value })}><option value="">—</option>
                {options.map((c) => <option key={c.code} value={c.code}>{c.code} · {DOMAIN_LABELS[c.cmo_domain]} · {c.category} · {c.label}</option>)}</select></label>
            {priority ? <label><span><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Mostrar todo el catálogo</span></label> : null}
            <label>Fecha<input type="date" required max={todayIso()} value={f.intervention_date} onChange={(e) => setF({ ...f, intervention_date: e.target.value })} /></label>
            <label>Tipo<select value={f.is_scheduled} onChange={(e) => setF({ ...f, is_scheduled: e.target.value })}><option value="true">Programada</option><option value="false">No programada</option></select></label>
            <label>Modalidad<select value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value })}><option value="in_person">Presencial</option><option value="telematic">Telemática (no presencial)</option></select></label>
            <label>Destinatario<select value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })}>{Object.entries(RECIPIENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Aceptación<select value={f.acceptance} onChange={(e) => setF({ ...f, acceptance: e.target.value })}>{Object.entries(ACCEPTANCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Seguimiento<select value={f.followup_status} onChange={(e) => setF({ ...f, followup_status: e.target.value })}><option value="open">Abierto</option><option value="closed">Cerrado</option></select></label>
            <label className="span-all">Motivo (sin datos identificativos)<input maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
            <label className="span-all">Actuación realizada<textarea maxLength={1000} value={f.action_taken} onChange={(e) => setF({ ...f, action_taken: e.target.value })} /></label>
            <label className="span-all">Resultado<textarea maxLength={1000} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} /></label>
            <div><button className="button-link" type="submit" disabled={save.saving}>Registrar intervención</button></div>
          </form>
          <SaveStatus state={save.state} />
        </section>
      ) : null}
      <section className="card"><h2>Resumen por ámbito</h2>
        {byCategory.length === 0 ? <p className="text-muted">Sin intervenciones.</p> : <ul>{byCategory.map(([c, n]) => <li key={c}>{c}: {n}</li>)}</ul>}
        <p className="carmo-hint">Programadas: {d.items.filter((i) => i.is_scheduled).length} · no programadas: {d.items.filter((i) => !i.is_scheduled).length} · presenciales: {d.items.filter((i) => i.modality === 'in_person').length} · telemáticas: {d.items.filter((i) => i.modality === 'telematic').length}</p>
      </section>
      <section className="card"><h2>Registradas ({d.items.length})</h2>
        <div className="table-wrap"><table className="carmo-table"><thead><tr><th>Fecha</th><th>Paciente</th><th>Actuación</th><th>Tipo</th><th>Modalidad</th><th>Destinatario</th><th>Aceptación</th><th>Seguimiento</th></tr></thead><tbody>
          {d.items.map((i) => <tr key={i.id}><td>{fmtDate(i.intervention_date)}</td><td><Link to={`/patients/${i.patient_id}`}>{code(i.patient_id)}</Link></td>
            <td>{i.catalog_code} · {cat(i.catalog_code)?.label ?? ''}</td><td>{i.is_scheduled ? 'Programada' : 'No programada'}</td><td>{i.modality === 'in_person' ? 'Presencial' : 'Telemática'}</td>
            <td>{label(RECIPIENT_LABELS, i.recipient)}</td><td>{label(ACCEPTANCE_LABELS, i.acceptance)}</td><td>{i.followup_status === 'open' ? 'Abierto' : 'Cerrado'}</td></tr>)}
        </tbody></table></div>
      </section>
    </div>
  );
}
