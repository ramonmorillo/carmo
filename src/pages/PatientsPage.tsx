// Listado de pacientes con la organización de DERMAPEX: cabecera con acción principal, buscador por código,
// tabla con sexo, edad, inclusión, prioridad CMO actual y acceso a la ficha. En CARMO no hay «Eliminar»:
// ningún registro clínico se borra (trazabilidad), y el alta es de candidatos en selección.
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { CmoLevelBadge } from '../components/ui/CmoLevelBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { SaveStatus } from '../components/ui/SaveStatus';
import { StatusBadge } from '../components/ui/StatusBadge';
import { currentPriorityByPatient, demographicsByPatient, followUpStatus, SEX_LABELS, type CurrentPriority } from '../domain/cohort';
import { PATIENT_STATUS_LABELS, ROLE_CAN, patientCode } from '../domain/study';
import { fmtDate, label, todayIso } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { useSave } from '../lib/useSave';
import { carmo, carmoWrite, type Patient, type Visit } from '../services/carmoData';

type Data = { patients: Patient[]; visits: Visit[]; demo: Map<string, { sex: string | null; age: number | null }>; prio: Map<string, CurrentPriority> };

export function PatientsPage() {
  const session = useCarmoSession();
  const navigate = useNavigate();
  const save = useSave();
  const clinical = ROLE_CAN.readClinical(session.role);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState('');
  const [showNew, setShowNew] = useState(false);
  const writableCenters = session.centers.filter((c) => c.is_active && c.participation_status === 'authorized'
    && (session.role === 'coordinator' || session.memberships.some((m) => m.center_id === c.id)));
  const [centerId, setCenterId] = useState('');
  const [screeningDate, setScreeningDate] = useState(todayIso());

  useEffect(() => {
    Promise.all([carmo.patients(), carmo.visits(), clinical ? carmo.currentObservationsOf(['sex', 'age_years']) : [], clinical ? carmo.stratifications() : []])
      .then(([patients, visits, obs, strats]) => setData({ patients, visits, demo: demographicsByPatient(obs), prio: currentPriorityByPatient(strats) }))
      .catch((e: Error) => setError(e.message));
  }, [clinical]);

  const shown = useMemo(() => {
    if (!data) return [];
    const q = applied.trim().toLowerCase();
    return data.patients
      .filter((p) => (!status || p.status === status) && (!q || patientCode(p).toLowerCase().includes(q) || p.screening_code.toLowerCase().includes(q)))
      .sort((a, b) => (b.inclusion_date ?? b.screening_date).localeCompare(a.inclusion_date ?? a.screening_date) || patientCode(a).localeCompare(patientCode(b)));
  }, [data, applied, status]);

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

  if (error) return <ErrorState title="No se pudo cargar el listado" message={error} />;
  if (!data) return <LoadingState label="Cargando pacientes…" />;
  const centerCode = (id: string) => session.centers.find((c) => c.id === id)?.code ?? '—';
  const canCreate = ROLE_CAN.writeClinical(session.role);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="CARMO · Cohorte" title="Pacientes"
        description={`${shown.length} ${shown.length === 1 ? 'paciente' : 'pacientes'} en el listado. Prioridad actual = última estratificación CMO registrada. Sin nombre ni NHC: el centro custodia la correspondencia.`}
        actions={canCreate ? <button type="button" className="button-link" onClick={() => setShowNew((x) => !x)}>{showNew ? 'Cerrar' : 'Nuevo candidato'}</button> : null} />

      {canCreate && showNew ? (
        <section className="card">
          <h2>Registrar candidato</h2>
          <Notice tone="info">No introduzca nombre, NHC, DNI, teléfono ni otro identificador directo. CARMO asigna el código de selección; anote la correspondencia en el registro de selección del centro. El código de paciente (centro + nº) se asigna al incluir.</Notice>
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
        <form className="search-row" role="search" onSubmit={(e) => { e.preventDefault(); setApplied(search); }}>
          <label className="visually-hidden" htmlFor="patient-search">Buscar por código</label>
          <input id="patient-search" type="search" placeholder="Buscar por código de paciente o de selección" value={search} onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setApplied(''); }} />
          <button type="submit" className="button-secondary">Buscar</button>
          <label className="visually-hidden" htmlFor="patient-status">Estado</label>
          <select id="patient-status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: '16rem' }}>
            <option value="">Todos los estados</option>{Object.entries(PATIENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </form>
        {data.patients.length === 0 ? <p className="text-muted">Sin pacientes en su ámbito. {canCreate ? 'Registre el primer candidato con «Nuevo candidato».' : ''}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Código</th><th>Centro</th><th>Sexo</th><th className="num">Edad</th><th>Inclusión</th><th>Situación</th><th>Prioridad actual</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={8} className="cell-muted">Sin resultados{applied ? ` para «${applied}»` : ''}.</td></tr> : null}
              {shown.map((p) => {
                const demo = data.demo.get(p.id);
                const prio = data.prio.get(p.id);
                const fu = followUpStatus(p.status, data.visits.filter((v) => v.patient_id === p.id), todayIso());
                return (
                  <tr key={p.id}>
                    <td className="strong"><Link to={`/patients/${p.id}`}>{patientCode(p)}</Link>{p.study_code ? <><br /><span className="cell-muted">{p.screening_code}</span></> : null}{p.is_synthetic ? <> <StatusBadge tone="warning">Sintético</StatusBadge></> : null}</td>
                    <td>{centerCode(p.center_id)}</td>
                    <td>{demo?.sex ? SEX_LABELS[demo.sex] ?? demo.sex : <span className="cell-muted">—</span>}</td>
                    <td className="num">{demo?.age ?? '—'}</td>
                    <td className="numeric">{p.inclusion_date ? fmtDate(p.inclusion_date) : <span className="cell-muted">cribado {fmtDate(p.screening_date)}</span>}</td>
                    <td><StatusBadge tone={fu.tone} dot>{fu.label}</StatusBadge>{p.status === 'included' ? null : <><br /><span className="cell-muted">{label(PATIENT_STATUS_LABELS, p.status)}</span></>}</td>
                    <td>{prio ? <CmoLevelBadge level={prio.priority} score={prio.score} variant="short" pending={prio.pending} /> : <span className="cell-muted">—</span>}</td>
                    <td><div className="table-actions table-actions-end"><Link to={`/patients/${p.id}`}>Abrir ficha</Link>{p.status === 'included' ? <Link to={`/agenda?patient=${p.id}`}>Agenda</Link> : null}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        <p className="help-text">* Estratificación pendiente de validación profesional. Los registros de CARMO no se eliminan: un candidato no incluido se marca como tal y queda trazado.</p>
      </section>
    </div>
  );
}
