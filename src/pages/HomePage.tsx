import { useEffect, useState } from 'react';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { computeDashboard, type Stat } from '../domain/dashboard';
import { ROLE_CAN } from '../domain/study';
import { fmtNum, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { readWholeTable, supabaseDataSource } from '../services/researchExport/reader';

type Dash = ReturnType<typeof computeDashboard>;

function StatCell({ s, unit = '' }: { s: Stat; unit?: string }) {
  return <>{s.n === 0 ? 'Sin datos' : `media ${fmtNum(s.mean)}${unit} · mediana ${fmtNum(s.median)}${unit}`} <span className="text-muted">(n = {s.n})</span></>;
}

export function HomePage() {
  const session = useCarmoSession();
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clinical = ROLE_CAN.readClinical(session.role);

  useEffect(() => {
    if (!supabase || session.role === 'tech_admin') return;
    const src = supabaseDataSource(supabase);
    // Lectura completa paginada y conciliada (sin el corte silencioso de 1000 filas de la API).
    const read = <T,>(table: string, columns: string, orderBy = 'id') => readWholeTable<T>(src, { table, columns, orderBy }).then((r) => r.rows);
    Promise.all([
      read<{ id: string; center_id: string; status: string; inclusion_date: string | null }>('carmo_patients', 'id,center_id,status,inclusion_date'),
      read<{ id: string; patient_id: string; visit_code: string; status: string; planned_date: string | null }>('carmo_visits', 'id,patient_id,visit_code,status,planned_date'),
      read<{ id: string; visit_id: string; patient_id: string; instrument_code: string; status: string; scores: { global?: number | null; valid?: boolean; vas?: number | null; adherent?: boolean | null } | null }>('carmo_questionnaire_administrations', 'id,visit_id,patient_id,instrument_code,status,scores'),
      clinical ? read<{ id: string; supersedes_id: string | null; patient_id: string; visit_id: string | null; variable_code: string; value_numeric: number | null; unit: string | null; is_missing: boolean }>('carmo_observations', 'id,supersedes_id,patient_id,visit_id,variable_code,value_numeric,unit,is_missing') : Promise.resolve([]),
      clinical ? read<{ id: string }>('carmo_interventions', 'id') : Promise.resolve([]),
    ]).then(([patients, visits, administrations, observations, interventions]) =>
      setDash(computeDashboard({ patients, visits, administrations, observations, interventions: interventions.length, today: todayIso() })))
      .catch((e: Error) => setError(e.message));
  }, [session.role, clinical]);

  if (session.role === 'tech_admin') {
    return <div className="page-stack"><PageHeader eyebrow="Inicio" title="Administración técnica" description="Su rol gestiona centros y cuentas; no tiene acceso a datos de pacientes." /></div>;
  }
  if (error) return <ErrorState message={error} />;
  if (!dash) return <LoadingState label="Calculando indicadores…" />;
  const target = session.targetSampleSize;
  const centerName = (id: string) => session.centers.find((c) => c.id === id)?.code ?? id.slice(0, 8);
  const maxMonth = Math.max(1, ...dash.byMonth.map(([, n]) => n));

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Inicio" title="Panel científico" description={`Indicadores descriptivos de su ámbito de acceso (${session.role === 'coordinator' ? 'todos los centros' : 'sus centros'}). Cada cifra indica su denominador.`} />
      <Notice tone="info">Panel exploratorio: no sustituye al análisis estadístico final. La comparación basal-final de un diseño antes-después sin grupo control no demuestra eficacia causal.</Notice>
      <section className="carmo-kpis">
        <div className="carmo-kpi"><span>Incluidos / objetivo</span><strong>{dash.included} / {target}</strong><div className="carmo-bar"><span style={{ width: `${Math.min(100, (dash.included / target) * 100)}%` }} /></div><small>{fmtNum((dash.included / target) * 100, 1)} % del tamaño muestral</small></div>
        <div className="carmo-kpi"><span>En seguimiento</span><strong>{dash.active}</strong><small>de {dash.included} incluidos</small></div>
        <div className="carmo-kpi"><span>Seguimiento finalizado</span><strong>{dash.completed}</strong><small>tasa {dash.included ? fmtNum((dash.completed / dash.included) * 100, 1) : '—'} % de incluidos</small></div>
        <div className="carmo-kpi"><span>Retiradas · pérdidas</span><strong>{dash.withdrawn} · {dash.lost}</strong><small>de {dash.included} incluidos</small></div>
        <div className="carmo-kpi"><span>Candidatos cribados</span><strong>{dash.screened}</strong><small>{dash.notIncluded} no incluidos</small></div>
        <div className="carmo-kpi"><span>Visitas previstas vencidas</span><strong>{dash.overdueVisits}</strong></div>
      </section>
      <section className="grid-2">
        <div className="card"><h2>Distribución por centro</h2>
          <table className="carmo-table"><thead><tr><th>Centro</th><th className="numeric">Incluidos</th></tr></thead><tbody>
            {[...dash.byCenter.entries()].map(([c, n]) => <tr key={c}><td>{centerName(c)}</td><td className="numeric">{n}</td></tr>)}
            {dash.byCenter.size === 0 ? <tr><td colSpan={2} className="text-muted">Sin pacientes incluidos</td></tr> : null}
          </tbody></table></div>
        <div className="card"><h2>Reclutamiento mensual</h2>
          {dash.byMonth.length === 0 ? <p className="text-muted">Sin inclusiones.</p> : dash.byMonth.map(([m, n]) => (
            <div key={m} style={{ display: 'grid', gridTemplateColumns: '5rem 1fr 2rem', gap: '0.5rem', alignItems: 'center' }}><span>{m}</span><div className="carmo-bar"><span style={{ width: `${(n / maxMonth) * 100}%` }} /></div><span className="numeric">{n}</span></div>
          ))}</div>
      </section>
      <section className="card"><h2>Resultados (descriptivos)</h2>
        <table className="carmo-table"><tbody>
          <tr><th>IEXPAC basal (0-10)</th><td><StatCell s={dash.iexpacBaseline} /></td></tr>
          <tr><th>IEXPAC final (0-10)</th><td><StatCell s={dash.iexpacFinal} /></td></tr>
          <tr><th>Diferencia pareada final − basal</th><td><StatCell s={dash.iexpacDiff} /> <span className="text-muted">solo pacientes con ambas mediciones válidas</span></td></tr>
          <tr><th>IEXPAC basal sin puntuación válida</th><td>{dash.iexpacBaselineMissing.n} de {dash.iexpacBaselineMissing.of} evaluaciones iniciales realizadas</td></tr>
          {clinical ? <>
            <tr><th>LDL-c basal (mg/dL)</th><td><StatCell s={dash.ldlBaselineMgdl} /></td></tr>
            <tr><th>LDL-c final (mg/dL)</th><td><StatCell s={dash.ldlFinalMgdl} /> <span className="text-muted">valores en mmol/L no se agregan aquí (sin conversión automática)</span></td></tr>
            <tr><th>Intervenciones registradas</th><td>{dash.interventions}</td></tr>
          </> : null}
          <tr><th>Prioridades CMO</th><td>No disponibles: modelo CMO cardiovascular no validado.</td></tr>
          <tr><th>EQ-5D-3L EVA basal / final</th><td><StatCell s={dash.eqVasBaseline} /> · <StatCell s={dash.eqVasFinal} /></td></tr>
          <tr><th>Morisky-Green: adherentes basal / final</th><td>{dash.moriskyBaseline.adherent} de {dash.moriskyBaseline.n} · {dash.moriskyFinal.adherent} de {dash.moriskyFinal.n} <span className="text-muted">(solo cuestionarios completos)</span></td></tr>
          <tr><th>EVASAF</th><td>Resultado por ítem en la exportación (sin total definido).</td></tr>
        </tbody></table>
      </section>
    </div>
  );
}
