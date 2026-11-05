import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CMO_ENGINE_VERSION } from '../domain/cmoEngine';
import { effectivePriority, PRIORITY_LABELS, VALIDATION_LABELS } from '../domain/cmoLabels';
import { patientCode } from '../domain/study';
import { fmtDate } from '../lib/format';
import { carmo, type CmoModel, type Patient, type Stratification } from '../services/carmoData';

export function StratificationPage() {
  const [d, setD] = useState<{ models: CmoModel[]; strats: Stratification[]; patients: Patient[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([carmo.cmoModels(), carmo.stratifications(), carmo.patients()]).then(([models, strats, patients]) => setD({ models, strats, patients })).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState label="Cargando…" />;
  const validated = d.models.find((m) => m.status === 'validated');
  const included = d.patients.filter((p) => p.status !== 'screening' && p.status !== 'not_included');
  const current = (pid: string) => d.strats.find((s) => s.patient_id === pid && !d.strats.some((n) => n.supersedes_id === s.id));
  const dist = [1, 2, 3].map((p) => included.filter((x) => { const c = current(x.id); return c && effectivePriority(c) === p; }).length);
  const without = included.filter((x) => !current(x.id)).length;
  const pending = d.strats.filter((s) => s.validation_status === 'pending' && !d.strats.some((n) => n.supersedes_id === s.id)).length;
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Estratificación" title="Modelo CMO cardiovascular (MAPEX-SEFH)" description={`Motor ${CMO_ENGINE_VERSION}. La base de datos recalcula cada estratificación con la definición versionada y rechaza discrepancias. Toda clasificación requiere validación profesional.`} />
      {!validated ? <Notice tone="warning" title="Modelo en borrador">El modelo está cargado pero pendiente de validación por la coordinación: se puede previsualizar el cálculo, no guardarlo.</Notice> : null}
      <section className="carmo-kpis">
        {dist.map((n, i) => <div className="carmo-kpi" key={i}><span>{PRIORITY_LABELS[i + 1]}</span><strong>{n}</strong><small>de {included.length} incluidos</small></div>)}
        <div className="carmo-kpi"><span>Sin estratificar</span><strong>{without}</strong></div>
        <div className="carmo-kpi"><span>Pendientes de validar</span><strong>{pending}</strong></div>
      </section>
      <section className="card"><h2>Versiones del modelo</h2>
        <table className="carmo-table"><thead><tr><th>Versión</th><th>Estado</th><th>Validado por</th><th>Fuente</th></tr></thead><tbody>
          {d.models.map((m) => <tr key={m.version}><td>{m.version}</td><td>{m.status === 'validated' ? <StatusBadge tone="positive">Validado</StatusBadge> : <StatusBadge tone="warning">{m.status}</StatusBadge>}</td><td>{m.validated_by ? `${m.validated_by} (${fmtDate(m.validated_at)})` : '—'}</td><td className="text-muted">{m.source_reference}</td></tr>)}
        </tbody></table>
      </section>
      <section className="card"><h2>Pacientes</h2>
        <div className="table-wrap"><table className="carmo-table"><thead><tr><th>Paciente</th><th>Prioridad vigente</th><th className="numeric">Puntos</th><th>Validación</th><th>Fecha</th></tr></thead><tbody>
          {included.map((p) => { const c = current(p.id); return (
            <tr key={p.id}><td><Link to={`/patients/${p.id}/stratification`}>{patientCode(p)}</Link></td>
              <td>{c ? PRIORITY_LABELS[effectivePriority(c)] : <span className="text-muted">Sin estratificar</span>}</td><td className="numeric">{c?.total_score ?? '—'}</td>
              <td>{c ? VALIDATION_LABELS[c.validation_status] : '—'}</td><td>{c ? fmtDate(c.calculated_at) : '—'}</td></tr>
          ); })}
        </tbody></table></div>
        {included.length === 0 ? <p className="text-muted">Sin pacientes incluidos.</p> : null}
      </section>
    </div>
  );
}
