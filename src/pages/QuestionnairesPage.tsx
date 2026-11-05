import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { pairIexpac } from '../domain/iexpac';
import { fmtNum } from '../lib/format';
import { patientCode } from '../domain/study';
import { carmo, type Administration, type Instrument, type Patient, type Visit } from '../services/carmoData';

export function QuestionnairesPage() {
  const [d, setD] = useState<{ patients: Patient[]; visits: Visit[]; admins: Administration[]; instruments: Instrument[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([carmo.patients(), carmo.visits(), carmo.administrations(), carmo.instruments()]).then(([patients, visits, admins, instruments]) => setD({ patients, visits, admins, instruments })).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState label="Cargando cuestionarios…" />;
  const visitOf = (pid: string, code: string) => d.visits.find((v) => v.patient_id === pid && v.visit_code === code && v.status !== 'cancelled');
  const adminAt = (v?: Visit) => (v ? d.admins.find((a) => a.visit_id === v.id && a.instrument_code === 'IEXPAC') : undefined);
  const cell = (v?: Visit) => {
    if (!v) return <span className="text-muted">Visita no programada</span>;
    const a = adminAt(v);
    const body = !a ? <StatusBadge tone="warning">Pendiente</StatusBadge> : a.status === 'completed' ? (a.scores?.valid ? <StatusBadge tone="positive">{fmtNum(a.scores.global)}</StatusBadge> : <StatusBadge tone="warning">Incompleto</StatusBadge>) : a.status === 'not_done' ? <StatusBadge>No realizado</StatusBadge> : <StatusBadge tone="info">En curso</StatusBadge>;
    return <Link to={`/visits/${v.id}/questionnaires/IEXPAC`}>{body}</Link>;
  };
  const included = d.patients.filter((p) => p.status !== 'screening' && p.status !== 'not_included');
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Cuestionarios" title="Resultados reportados por pacientes" description="IEXPAC (variable principal) en evaluación inicial y visita final. Diferencia individual solo con ambas puntuaciones válidas." />
      <section className="card"><h2>Instrumentos</h2>
        <table className="carmo-table"><thead><tr><th>Código</th><th>Versión</th><th>Estado</th><th>Notas</th></tr></thead><tbody>
          {d.instruments.map((i) => <tr key={i.code}><td>{i.code}</td><td>{i.version}</td><td>{i.status === 'active' ? <StatusBadge tone="positive">Habilitado</StatusBadge> : <StatusBadge tone="warning">{i.status === 'pending_license' ? 'Pendiente de licencia' : 'Pendiente de especificación'}</StatusBadge>}</td><td className="text-muted">{i.notes}</td></tr>)}
        </tbody></table></section>
      <section className="card"><h2>IEXPAC por paciente</h2>
        <div className="table-wrap"><table className="carmo-table"><thead><tr><th>Paciente</th><th>Basal</th><th>Final</th><th className="numeric">Diferencia</th></tr></thead><tbody>
          {included.map((p) => {
            const b = adminAt(visitOf(p.id, 'BASAL')); const f = adminAt(visitOf(p.id, 'FINAL'));
            const pair = pairIexpac(b?.status === 'completed' ? b.scores?.global : null, f?.status === 'completed' ? f.scores?.global : null);
            return <tr key={p.id}><td><Link to={`/patients/${p.id}`}>{patientCode(p)}</Link></td><td>{cell(visitOf(p.id, 'BASAL'))}</td><td>{cell(visitOf(p.id, 'FINAL'))}</td><td className="numeric">{pair.paired ? fmtNum(pair.difference) : '—'}</td></tr>;
          })}
        </tbody></table></div>
        {included.length === 0 ? <p className="text-muted">Sin pacientes incluidos.</p> : null}
      </section>
    </div>
  );
}
