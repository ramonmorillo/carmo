import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { SaveStatus } from '../components/ui/SaveStatus';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PATIENT_STATUS_LABELS, ROLE_CAN } from '../domain/study';
import { fmtDate, label, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { useSave } from '../lib/useSave';
import { carmo, carmoWrite, type Patient } from '../services/carmoData';

export function PatientsPage() {
  const session = useCarmoSession();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const save = useSave();
  const writableCenters = session.centers.filter((c) => c.is_active && c.participation_status === 'authorized'
    && (session.role === 'coordinator' || session.memberships.some((m) => m.center_id === c.id)));
  const [centerId, setCenterId] = useState('');
  const [screeningDate, setScreeningDate] = useState(todayIso());

  useEffect(() => { carmo.patients().then(setPatients).catch((e: Error) => setError(e.message)); }, []);
  const centerName = (id: string) => session.centers.find((c) => c.id === id)?.code ?? '—';

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const target = centerId || writableCenters[0]?.id;
    if (!target) return;
    await save.run(
      () => carmoWrite.insert<Patient>('carmo_patients', {
        center_id: target, screening_date: screeningDate,
        responsible_investigator_id: session.role === 'site_pi' || session.role === 'site_investigator'
          || (session.role === 'coordinator' && session.memberships.some((m) => m.center_id === target)) ? session.userId : null,
      }),
      (rows) => navigate(`/patients/${rows[0].id}`),
    );
  };

  if (error) return <ErrorState message={error} />;
  if (!patients) return <LoadingState label="Cargando pacientes…" />;
  const shown = patients.filter((p) => !filter || p.status === filter);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Pacientes" title="Pacientes y candidatos" description="Sujetos seudonimizados de su ámbito. Código de selección al registrar; código de paciente del protocolo (centro 3 cifras + 2 cifras consecutivas) al incluir. El registro de selección con datos identificativos (anexo 3) se custodia en cada centro, fuera de CARMO." />
      {ROLE_CAN.writeClinical(session.role) ? (
        <section className="card">
          <h2>Registrar candidato</h2>
          <Notice tone="info">No introduzca nombre, NHC, DNI, teléfono ni ningún otro identificador directo. CARMO asigna el código; anote la correspondencia en el registro de selección local del centro.</Notice>
          {writableCenters.length === 0 ? <Notice tone="warning">No tiene ningún centro autorizado y activo para incluir pacientes.</Notice> : (
            <form className="carmo-form" onSubmit={onCreate}>
              <label>Centro<select value={centerId} onChange={(e) => setCenterId(e.target.value)}>{writableCenters.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
              <label>Fecha de cribado<input type="date" required max={todayIso()} value={screeningDate} onChange={(e) => setScreeningDate(e.target.value)} /></label>
              <div><button className="button-link" type="submit" disabled={save.saving}>{save.saving ? 'Guardando…' : 'Registrar candidato'}</button></div>
            </form>
          )}
          <SaveStatus state={save.state} />
        </section>
      ) : null}
      <section className="card">
        <div className="carmo-actions">
          <label>Estado <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Todos</option>{Object.entries(PATIENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <span className="text-muted">{shown.length} de {patients.length}</span>
        </div>
        <div className="table-wrap"><table className="carmo-table">
          <thead><tr><th>Código de paciente</th><th>Código de selección</th><th>Centro</th><th>Estado</th><th>Cribado</th><th>Inclusión</th><th>Tipo de dato</th></tr></thead>
          <tbody>{shown.map((p) => (
            <tr key={p.id}>
              <td><Link to={`/patients/${p.id}`}>{p.study_code ?? '—'}</Link></td><td><Link to={`/patients/${p.id}`}>{p.screening_code}</Link></td><td>{centerName(p.center_id)}</td>
              <td>{label(PATIENT_STATUS_LABELS, p.status)}</td><td>{fmtDate(p.screening_date)}</td><td>{fmtDate(p.inclusion_date)}</td>
              <td>{p.is_synthetic ? <StatusBadge tone="warning">Sintético</StatusBadge> : <StatusBadge tone="info">Real</StatusBadge>}</td>
            </tr>))}
          </tbody></table></div>
        {patients.length === 0 ? <p className="text-muted">Sin pacientes en su ámbito.</p> : null}
      </section>
    </div>
  );
}
