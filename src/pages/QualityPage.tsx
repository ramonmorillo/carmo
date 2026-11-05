import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { computePending, PENDING_KIND_LABELS, type PendingItem, type PendingKind } from '../domain/pending';
import { patientCode, PATIENT_STATUS_LABELS } from '../domain/study';
import { fmtNum, label, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { carmo, type Administration, type CmoModel, type Deviation, type Instrument, type ObservationRow, type Patient, type Stratification, type Variable, type Visit } from '../services/carmoData';
import { readWholeTable, supabaseDataSource } from '../services/researchExport/reader';

type Row = { patient: Patient; items: PendingItem[] };
const KINDS: PendingKind[] = ['missing_data', 'questionnaire', 'stratification', 'overdue', 'to_close', 'deviation'];

export function QualityPage() {
  const session = useCarmoSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    const src = supabaseDataSource(supabase);
    const all = <T,>(table: string, orderBy = 'id') => readWholeTable<T>(src, { table, columns: '*', orderBy }).then((r) => r.rows);
    Promise.all([
      all<Patient>('carmo_patients'), all<Visit>('carmo_visits'), all<ObservationRow>('carmo_observations'), all<Administration>('carmo_questionnaire_administrations'),
      all<Stratification>('carmo_stratifications'), all<Deviation>('carmo_deviations'), carmo.variables(), carmo.instruments(), carmo.cmoModels(),
    ]).then(([patients, visits, obs, admins, strats, devs, variables, instruments, models]: [Patient[], Visit[], ObservationRow[], Administration[], Stratification[], Deviation[], Variable[], Instrument[], CmoModel[]]) => {
      const followUp = (models.find((m) => m.status === 'validated')?.definition.followUp as Record<string, { restratifyMonths: number | null }> | undefined) ?? null;
      const today = todayIso();
      setRows(patients.map((p) => ({ patient: p, items: computePending({
        patientStatus: p.status, visits: visits.filter((v) => v.patient_id === p.id), variables, observations: obs.filter((o) => o.patient_id === p.id),
        administrations: admins.filter((a) => a.patient_id === p.id), instruments, stratifications: strats.filter((s) => s.patient_id === p.id),
        deviations: devs.filter((d) => d.patient_id === p.id), followUp, today,
      }) })));
    }).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState label="Calculando la calidad de los datos…" />;
  const INCL = ['included', 'completed', 'withdrawn', 'lost_to_followup'];
  const centers = session.centers.filter((c) => rows.some((r) => r.patient.center_id === c.id));
  const count = (rs: Row[], k: PendingKind) => rs.reduce((a, r) => a + r.items.filter((i) => i.kind === k).length, 0);
  const shown = rows.filter((r) => INCL.includes(r.patient.status) && (!onlyPending || r.items.length > 0));

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Calidad de datos" title="Datos pendientes y seguimiento"
        description="Reglas del protocolo v3.0 (procedimientos por visita) y del modelo CMO (periodicidad). Solo incluye los pacientes de su ámbito. Es un control de calidad: no sustituye la monitorización frente a la fuente." />
      <section className="card"><h2>Por centro</h2>
        <div className="table-wrap"><table className="carmo-table">
          <thead><tr><th>Centro</th><th className="numeric">Incluidos</th><th className="numeric">Finalizados</th><th className="numeric">Tasa de finalización</th><th className="numeric">Retiradas / pérdidas</th><th className="numeric">Pacientes con pendientes</th>{KINDS.map((k) => <th key={k} className="numeric">{PENDING_KIND_LABELS[k]}</th>)}</tr></thead>
          <tbody>{centers.map((c) => {
            const rs = rows.filter((r) => r.patient.center_id === c.id && INCL.includes(r.patient.status));
            const done = rs.filter((r) => r.patient.status === 'completed').length;
            const out = rs.filter((r) => r.patient.status === 'withdrawn' || r.patient.status === 'lost_to_followup').length;
            return (
              <tr key={c.id}><td>{c.code}</td><td className="numeric">{rs.length}</td><td className="numeric">{done}</td>
                <td className="numeric">{rs.length ? `${fmtNum((done / rs.length) * 100, 1)} %` : '—'}</td><td className="numeric">{out}</td>
                <td className="numeric">{rs.filter((r) => r.items.length > 0).length} / {rs.length}</td>
                {KINDS.map((k) => <td key={k} className="numeric">{count(rs, k)}</td>)}</tr>
            );
          })}</tbody>
        </table></div>
        <p className="carmo-hint">La tasa de finalización usa como denominador los incluidos (por intención de tratar). Las cifras de cada tipo son número de incidencias, no de pacientes.</p>
      </section>
      <section className="card"><h2>Por paciente</h2>
        <label className="carmo-hint"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Mostrar solo pacientes con pendientes</label>
        {shown.length === 0 ? <Notice tone="success">Sin datos pendientes en los pacientes de su ámbito.</Notice> : (
          <div className="table-wrap"><table className="carmo-table">
            <thead><tr><th>Paciente</th><th>Centro</th><th>Estado</th><th>Pendientes</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.patient.id}><td><Link to={`/patients/${r.patient.id}`}>{patientCode(r.patient)}</Link></td>
                <td>{session.centers.find((c) => c.id === r.patient.center_id)?.code ?? '—'}</td><td>{label(PATIENT_STATUS_LABELS, r.patient.status)}</td>
                <td>{r.items.length === 0 ? 'Al día' : <ul>{r.items.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
