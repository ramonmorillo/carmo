// Panel de inicio con la organización de DERMAPEX: cohorte, seguimiento, evolución CMO, actividad
// farmacéutica, próximas/últimas visitas, intervenciones recientes y calidad de datos; más los resultados
// del estudio (IEXPAC, EQ-5D-3L, Morisky-Green, LDL-c) y el reclutamiento. Indicadores descriptivos con
// su denominador; lectura completa paginada y conciliada (sin el corte de 1000 filas de la API).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { PRIORITY_META } from '../components/ui/CmoLevelBadge';
import { DistributionBar } from '../components/ui/DistributionBar';
import { LoadingState } from '../components/ui/LoadingState';
import { MetricCard, MetricGrid } from '../components/ui/MetricCard';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { computeDashboard, computePanel, type Stat } from '../domain/dashboard';
import { ROLE_CAN, VISIT_LABELS } from '../domain/study';
import { fmtDate, fmtNum, label, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { readWholeTable, supabaseDataSource } from '../services/researchExport/reader';

type Dash = ReturnType<typeof computeDashboard>;
type Panel = ReturnType<typeof computePanel>;

const stat = (s: Stat, digits = 1) => (s.n === 0 ? '—' : fmtNum(s.mean, digits));
const statHint = (s: Stat, unit = '') => (s.n === 0 ? 'Sin datos' : `mediana ${fmtNum(s.median)}${unit} · n = ${s.n}`);

export function HomePage() {
  const session = useCarmoSession();
  const clinical = ROLE_CAN.readClinical(session.role);
  const [state, setState] = useState<{ dash: Dash; panel: Panel; codes: Map<string, string>; catalog: Map<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || session.role === 'tech_admin') return;
    const src = supabaseDataSource(supabase);
    const read = <T,>(table: string, columns: string, orderBy = 'id') => readWholeTable<T>(src, { table, columns, orderBy }).then((r) => r.rows);
    const none = () => Promise.resolve([] as never[]);
    Promise.all([
      read<{ id: string; center_id: string; status: string; inclusion_date: string | null; study_code: string | null; screening_code: string }>('carmo_patients', 'id,center_id,status,inclusion_date,study_code,screening_code'),
      read<{ id: string; patient_id: string; visit_code: string; status: string; planned_date: string | null; actual_date: string | null; record_state: string }>('carmo_visits', 'id,patient_id,visit_code,status,planned_date,actual_date,record_state'),
      read<{ id: string; visit_id: string; patient_id: string; instrument_code: string; status: string; scores: { global?: number | null; valid?: boolean; vas?: number | null; adherent?: boolean | null } | null }>('carmo_questionnaire_administrations', 'id,visit_id,patient_id,instrument_code,status,scores'),
      clinical ? read<{ id: string; supersedes_id: string | null; patient_id: string; visit_id: string | null; variable_code: string; value_numeric: number | null; value_text: string | null; unit: string | null; is_missing: boolean }>('carmo_observations', 'id,supersedes_id,patient_id,visit_id,variable_code,value_numeric,value_text,unit,is_missing') : none(),
      clinical ? read<{ id: string; patient_id: string; visit_id: string | null; catalog_code: string; intervention_date: string; is_scheduled: boolean; modality: string }>('carmo_interventions', 'id,patient_id,visit_id,catalog_code,intervention_date,is_scheduled,modality') : none(),
      clinical ? read<{ id: string; patient_id: string; visit_id: string; supersedes_id: string | null; final_priority: number | null; calculated_priority: number; total_score: number | null; validation_status: string; calculated_at: string }>('carmo_stratifications', 'id,patient_id,visit_id,supersedes_id,final_priority,calculated_priority,total_score,validation_status,calculated_at') : none(),
      clinical ? read<{ code: string; cmo_domain: string; label: string }>('carmo_intervention_catalog', 'code,cmo_domain,label', 'code') : none(),
      clinical ? read<{ visit_id: string }>('carmo_visit_medication_reviews', 'visit_id', 'visit_id') : none(),
    ]).then(([patients, visits, administrations, observations, interventions, strats, catalog, reviews]) => {
      const today = todayIso();
      const superseded = new Set(observations.map((o) => o.supersedes_id).filter(Boolean));
      const obsCurrent = observations.filter((o) => !superseded.has(o.id));
      setState({
        dash: computeDashboard({ patients, visits, administrations, observations, interventions: interventions.length, strats, today }),
        panel: computePanel({ patients, visits, strats, interventions, catalogDomain: Object.fromEntries(catalog.map((c) => [c.code, c.cmo_domain])),
          demographics: obsCurrent.filter((o) => o.variable_code === 'sex' || o.variable_code === 'age_years'), reviewedVisitIds: reviews.map((r) => r.visit_id), today }),
        codes: new Map(patients.map((p) => [p.id, p.study_code ?? p.screening_code])),
        catalog: new Map(catalog.map((c) => [c.code, c.label])),
      });
    }).catch((e: Error) => setError(e.message));
  }, [session.role, clinical]);

  if (session.role === 'tech_admin') {
    return <div className="page-stack"><PageHeader eyebrow="CARMO · Panel" title="Administración técnica" description="Su rol gestiona centros y cuentas; no tiene acceso a datos de pacientes." actions={<Link className="button-link" to="/admin">Administración</Link>} /></div>;
  }
  if (error) return <ErrorState title="No se pudo cargar el panel" message={error} />;
  if (!state) return <LoadingState label="Calculando indicadores…" />;
  const { dash, panel, codes, catalog } = state;
  const target = session.targetSampleSize;
  const c = panel.cohort;
  const ev = panel.evolution;
  const evaluable = ev.improved + ev.stable + ev.worsened;
  const maxStage = Math.max(1, ...panel.followup.stages.map((s) => s.done));
  const domainRows = [['capacity', 'Capacidad'], ['motivation', 'Motivación'], ['opportunity', 'Oportunidad']] as const;
  const maxDomain = Math.max(1, ...domainRows.map(([k]) => panel.activity.byDomain[k]));
  const maxMonth = Math.max(1, ...dash.byMonth.map(([, n]) => n));
  const centerCode = (id: string) => session.centers.find((x) => x.id === id)?.code ?? '—';
  const code = (pid: string) => codes.get(pid) ?? 'Paciente';
  const q = panel.quality;
  const fmtPct = (n: number | null) => (n === null ? '—' : fmtNum(n, 1));

  return (
    <div className="page-stack">
      <PageHeader eyebrow="CARMO · Panel" title="Panel del estudio"
        description={`Indicadores descriptivos de su ámbito (${session.role === 'coordinator' ? 'todos los centros' : 'sus centros'}). Cada cifra indica su denominador.`}
        actions={clinical ? <Link className="button-link button-secondary" to="/export" title="Paquete verificado: tablas completas, análisis, diccionario, CSV + sintaxis SPSS, Excel, JSON y manifiesto.">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Exportar datos</Link> : null} />

      <Notice tone="info">Panel exploratorio: no sustituye al análisis estadístico final. En un diseño antes-después sin grupo control, la comparación basal-final no demuestra eficacia causal.</Notice>

      <section className="card" aria-labelledby="dash-cohort">
        <SectionHeader id="dash-cohort" title="Cohorte" description="Prioridad CMO actual = última estratificación registrada de cada paciente incluido." />
        <MetricGrid columns={4}>
          <MetricCard size="lg" label="Pacientes incluidos" value={c.included} hint={`objetivo ${target} · ${fmtNum((c.included / target) * 100, 1)} %`} />
          <MetricCard size="lg" label="En seguimiento" value={c.active} hint={`${dash.completed} finalizados · ${dash.withdrawn + dash.lost} retiradas o pérdidas`} />
          <MetricCard size="lg" label="Edad media" value={stat(c.age)} unit="años" hint={statHint(c.age, ' años')} />
          <MetricCard size="lg" label="Mujeres" value={fmtPct(c.womenPct)} unit="%" hint={`sobre ${c.sexN} con sexo registrado`} />
        </MetricGrid>
        {clinical ? (
          <div className="section-block dashboard-subsection">
            <h3>Distribución por prioridad CMO</h3>
            <DistributionBar total={c.included} ariaLabel={`Prioridad 1: ${c.byPriority[1]}, Prioridad 2: ${c.byPriority[2]}, Prioridad 3: ${c.byPriority[3]}, sin estratificar: ${c.byPriority.none}`}
              segments={[
                { key: 'p1', label: PRIORITY_META[1].label, value: c.byPriority[1], className: 'seg-cmo-1' },
                { key: 'p2', label: PRIORITY_META[2].label, value: c.byPriority[2], className: 'seg-cmo-2' },
                { key: 'p3', label: PRIORITY_META[3].label, value: c.byPriority[3], className: 'seg-cmo-3' },
                ...(c.byPriority.none > 0 ? [{ key: 'none', label: 'Sin estratificar', value: c.byPriority.none, className: 'seg-none' }] : []),
              ]} />
            <p className="help-text dashboard-footnote">Porcentajes sobre el total de pacientes incluidos. Prioridad 1 = mayor complejidad (≥ 23 puntos o embarazo).</p>
          </div>
        ) : null}
      </section>

      <div className="split-grid">
        <section className="card" aria-labelledby="dash-followup">
          <SectionHeader id="dash-followup" title="Seguimiento" description="Visitas realizadas por punto temporal del protocolo." />
          <ul className="bar-list">
            {panel.followup.stages.map((s) => (
              <li key={s.code}><span className="bar-list-label">{label(VISIT_LABELS, s.code)}</span>
                <span className="bar-list-track"><span className="bar-list-fill" style={{ width: `${(s.done / maxStage) * 100}%` }} /></span>
                <span className="bar-list-value">{s.done}</span></li>
            ))}
          </ul>
          <dl className="inline-facts">
            <div><dt>Contactos extraordinarios</dt><dd>{panel.followup.extra}</dd></div>
            <div><dt>Visitas previstas vencidas</dt><dd>{panel.followup.overdue > 0 ? <Link to="/agenda?status=overdue"><StatusBadge tone="warning" dot>{panel.followup.overdue}</StatusBadge></Link> : <span className="text-muted">0</span>}</dd></div>
            <div><dt>Sin seguimiento &gt; 90 días</dt><dd>{panel.followup.without90 > 0 ? <StatusBadge tone="warning" dot>{panel.followup.without90} {panel.followup.without90 === 1 ? 'paciente' : 'pacientes'}</StatusBadge> : <span className="text-muted">0 · sin pendientes</span>}</dd></div>
          </dl>
        </section>

        <section className="card" aria-labelledby="dash-evolution">
          <SectionHeader id="dash-evolution" title="Evolución CMO" description="Cambio de prioridad entre la primera estratificación y la vigente." />
          {!clinical ? <p className="empty-inline">Disponible para roles con acceso clínico.</p> : evaluable === 0 ? (
            <p className="empty-inline">Aún no hay pacientes reestratificados para comparar.</p>
          ) : (
            <DistributionBar total={evaluable} ariaLabel={`Menor complejidad: ${ev.improved}, estables: ${ev.stable}, mayor complejidad: ${ev.worsened}`}
              segments={[
                { key: 'improved', label: 'Pasan a menor complejidad', value: ev.improved, className: 'seg-improved' },
                { key: 'stable', label: 'Estables', value: ev.stable, className: 'seg-stable' },
                { key: 'worsened', label: 'Pasan a mayor complejidad', value: ev.worsened, className: 'seg-worsened' },
              ]} />
          )}
          {clinical ? (
            <dl className="inline-facts">
              <div><dt>Puntuación media inicial</dt><dd className="numeric">{stat(ev.firstScore)}</dd></div>
              <div><dt>Puntuación media vigente</dt><dd className="numeric">{stat(ev.lastScore)}</dd></div>
              <div><dt>Pacientes evaluables</dt><dd className="numeric">{evaluable}</dd></div>
            </dl>
          ) : null}
          <p className="help-text dashboard-footnote">Solo pacientes con al menos dos estratificaciones. Descriptivo, sin inferencia causal.</p>
        </section>
      </div>

      <section className="card" aria-labelledby="dash-results">
        <SectionHeader id="dash-results" title="Resultados del estudio" description="Medias sobre pacientes con medición válida (n indicado); la diferencia IEXPAC es pareada." />
        <MetricGrid columns={4}>
          <MetricCard label="IEXPAC basal (0-10)" value={stat(dash.iexpacBaseline, 2)} hint={statHint(dash.iexpacBaseline)} />
          <MetricCard label="IEXPAC final (0-10)" value={stat(dash.iexpacFinal, 2)} hint={statHint(dash.iexpacFinal)} />
          <MetricCard label="Diferencia pareada IEXPAC" value={stat(dash.iexpacDiff, 2)} hint={statHint(dash.iexpacDiff)} />
          <MetricCard label="IEXPAC basal sin puntuación" value={dash.iexpacBaselineMissing.n} hint={`de ${dash.iexpacBaselineMissing.of} visitas iniciales realizadas`} tone={dash.iexpacBaselineMissing.n > 0 ? 'warning' : 'default'} />
          <MetricCard label="EQ-5D-3L EVA basal" value={stat(dash.eqVasBaseline)} hint={statHint(dash.eqVasBaseline)} />
          <MetricCard label="EQ-5D-3L EVA final" value={stat(dash.eqVasFinal)} hint={statHint(dash.eqVasFinal)} />
          <MetricCard label="Morisky-Green adherentes" value={`${dash.moriskyBaseline.adherent}/${dash.moriskyBaseline.n} → ${dash.moriskyFinal.adherent}/${dash.moriskyFinal.n}`} hint="basal → final, cuestionarios completos" />
          {clinical ? <MetricCard label="LDL-c basal → final (mg/dL)" value={`${stat(dash.ldlBaselineMgdl, 0)} → ${stat(dash.ldlFinalMgdl, 0)}`} hint={`n = ${dash.ldlBaselineMgdl.n} / ${dash.ldlFinalMgdl.n}; mmol/L no se agrega`} /> : null}
        </MetricGrid>
      </section>

      {clinical ? (
        <section className="card" aria-labelledby="dash-activity">
          <SectionHeader id="dash-activity" title="Actividad farmacéutica" />
          <div className="split-grid">
            <MetricGrid>
              <MetricCard label="Intervenciones totales" value={panel.activity.total} hint={`${panel.activity.scheduled} programadas · ${panel.activity.telematic} telemáticas`} />
              <MetricCard label="Media por paciente incluido" value={fmtNum(panel.activity.perPatient, 1)} />
            </MetricGrid>
            <div>
              <h3>Por dimensión CMO</h3>
              <ul className="bar-list">
                {domainRows.map(([k, l]) => (
                  <li key={k}><span className="bar-list-label">{l}</span>
                    <span className="bar-list-track"><span className="bar-list-fill" style={{ width: `${(panel.activity.byDomain[k] / maxDomain) * 100}%` }} /></span>
                    <span className="bar-list-value">{panel.activity.byDomain[k]}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <div className="split-grid split-grid-3">
        <section className="card" aria-labelledby="dash-upcoming">
          <SectionHeader id="dash-upcoming" title="Próximas visitas previstas" actions={<Link to="/agenda">Agenda</Link>} />
          {panel.upcoming.length === 0 ? <p className="empty-inline">No hay visitas previstas a partir de hoy.</p> : (
            <ul className="activity-list">{panel.upcoming.map((v) => <li key={v.id}><span className="activity-date">{fmtDate(v.planned_date)}</span><span className="activity-main">{label(VISIT_LABELS, v.visit_code)}</span><Link to={`/visits/${v.id}`}>{code(v.patient_id)}</Link></li>)}</ul>
          )}
        </section>
        <section className="card" aria-labelledby="dash-recent">
          <SectionHeader id="dash-recent" title="Últimas visitas realizadas" />
          {panel.recent.length === 0 ? <p className="empty-inline">Aún no hay visitas realizadas.</p> : (
            <ul className="activity-list">{panel.recent.map((v) => <li key={v.id}><span className="activity-date">{fmtDate(v.actual_date)}</span><span className="activity-main">{label(VISIT_LABELS, v.visit_code)}</span><Link to={`/visits/${v.id}`}>{code(v.patient_id)}</Link></li>)}</ul>
          )}
        </section>
        <section className="card" aria-labelledby="dash-interventions">
          <SectionHeader id="dash-interventions" title="Intervenciones recientes" />
          {!clinical || panel.recentInterventions.length === 0 ? <p className="empty-inline">Registre intervenciones desde la ficha de visita.</p> : (
            <ul className="activity-list">{panel.recentInterventions.map((i) => <li key={i.id}><span className="activity-date">{fmtDate(i.intervention_date)}</span><span className="activity-main" title={catalog.get(i.catalog_code)}>{catalog.get(i.catalog_code) ?? i.catalog_code}</span><Link to={`/patients/${i.patient_id}`}>{code(i.patient_id)}</Link></li>)}</ul>
          )}
        </section>
      </div>

      {clinical ? (
        <section className="card" aria-labelledby="dash-quality">
          <SectionHeader id="dash-quality" title="Calidad de datos" description="Completitud del registro. Se resaltan solo cuando requieren acción." actions={<Link to="/quality">Ver detalle por centro y paciente</Link>} />
          <MetricGrid columns={4}>
            <MetricCard label="Visitas iniciales sin estratificar" value={q.basalWithoutStrat} tone={q.basalWithoutStrat ? 'warning' : 'default'} />
            <MetricCard label="Estratificaciones sin validar" value={q.pendingValidation} tone={q.pendingValidation ? 'warning' : 'default'} />
            <MetricCard label="Visitas realizadas sin cerrar" value={q.doneNotClosed} tone={q.doneNotClosed ? 'warning' : 'default'} />
            <MetricCard label="Visitas con medicación sin revisar" value={q.medicationNotReviewed} tone={q.medicationNotReviewed ? 'warning' : 'default'} />
          </MetricGrid>
        </section>
      ) : null}

      <div className="split-grid">
        <section className="card" aria-labelledby="dash-centers">
          <SectionHeader id="dash-centers" title="Reclutamiento por centro" description={`${dash.screened} candidatos cribados · ${dash.notIncluded} no incluidos`} />
          {dash.byCenter.size === 0 ? <p className="empty-inline">Sin pacientes incluidos.</p> : (
            <ul className="bar-list">{[...dash.byCenter.entries()].map(([id, n]) => <li key={id}><span className="bar-list-label">{centerCode(id)}</span><span className="bar-list-track"><span className="bar-list-fill" style={{ width: `${(n / Math.max(1, ...dash.byCenter.values())) * 100}%` }} /></span><span className="bar-list-value">{n}</span></li>)}</ul>
          )}
        </section>
        <section className="card" aria-labelledby="dash-months">
          <SectionHeader id="dash-months" title="Reclutamiento mensual" />
          {dash.byMonth.length === 0 ? <p className="empty-inline">Sin inclusiones.</p> : (
            <ul className="bar-list">{dash.byMonth.map(([m, n]) => <li key={m}><span className="bar-list-label">{m}</span><span className="bar-list-track"><span className="bar-list-fill" style={{ width: `${(n / maxMonth) * 100}%` }} /></span><span className="bar-list-value">{n}</span></li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
