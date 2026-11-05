import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { WINDOW_STATUS_LABELS, isOverdue, type WindowStatus } from '../domain/schedule';
import { RECORD_STATE_LABELS, VISIT_LABELS, VISIT_STATUS_LABELS } from '../domain/study';
import { fmtDate, label, todayIso } from '../lib/format';
import { carmo, type Patient, type Visit, type VisitWindow } from '../services/carmoData';

export function AgendaPage() {
  const [data, setData] = useState<{ visits: Visit[]; patients: Patient[]; windows: VisitWindow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  useEffect(() => {
    Promise.all([carmo.visits(), carmo.patients(), carmo.windows()]).then(([visits, patients, windows]) => setData({ visits, patients, windows })).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Cargando agenda…" />;
  const today = todayIso();
  const code = (id: string) => data.patients.find((p) => p.id === id)?.study_code ?? '—';
  const win = (id: string) => data.windows.find((w) => w.visit_id === id);
  const rows = data.visits.filter((v) => scope === 'all' || v.status === 'planned').sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''));
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Visitas" title="Visitas y agenda" description="Visitas previstas, realizadas y extraordinarias. Las ventanas proceden del calendario versionado (provisional)." />
      <div className="carmo-tabs"><button className={scope === 'pending' ? 'button-link button-sm' : 'button-secondary button-sm'} onClick={() => setScope('pending')}>Pendientes</button><button className={scope === 'all' ? 'button-link button-sm' : 'button-secondary button-sm'} onClick={() => setScope('all')}>Todas</button></div>
      <section className="card"><div className="table-wrap"><table className="carmo-table">
        <thead><tr><th>Paciente</th><th>Visita</th><th>Prevista</th><th>Ventana</th><th>Efectiva</th><th>Estado</th><th>Registro</th></tr></thead>
        <tbody>{rows.map((v) => {
          const w = win(v.id);
          return (
            <tr key={v.id}><td><Link to={`/patients/${v.patient_id}`}>{code(v.patient_id)}</Link></td><td><Link to={`/visits/${v.id}`}>{label(VISIT_LABELS, v.visit_code)}</Link></td>
              <td>{fmtDate(v.planned_date)} {isOverdue(v.planned_date, v.status, today) ? <StatusBadge tone="warning">Vencida</StatusBadge> : null}</td>
              <td>{w?.window_start && w.window_end ? `${fmtDate(w.window_start)} – ${fmtDate(w.window_end)}` : (w ? WINDOW_STATUS_LABELS[w.window_status as WindowStatus] : '—')}</td>
              <td>{fmtDate(v.actual_date)}</td><td>{label(VISIT_STATUS_LABELS, v.status)}</td><td>{label(RECORD_STATE_LABELS, v.record_state)}</td></tr>
          );
        })}</tbody></table></div>
        {rows.length === 0 ? <p className="text-muted">Sin visitas.</p> : null}
      </section>
    </div>
  );
}
