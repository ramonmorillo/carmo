import type { ReactNode } from 'react';

import { CmoLevelBadge } from './CmoLevelBadge';
import { StatusBadge, type StatusTone } from './StatusBadge';

// Cabecera de identificación del paciente (misma composición que DERMAPEX): el usuario debe saber siempre
// a quién está revisando. Solo datos seudonimizados.
export function PatientHeader({ eyebrow, code, demographics, priority, score, priorityPending, lastVisitDate, followup, details = [], actions }: {
  eyebrow: string; code: string; demographics: string[]; priority: number | null; score: number | null; priorityPending?: boolean;
  lastVisitDate: string | null; followup: { tone: StatusTone; label: string } | null; details?: Array<{ label: string; value: ReactNode }>; actions?: ReactNode;
}) {
  return (
    <header className="patient-header" aria-label={`Paciente ${code}`}>
      <div className="patient-header-identity">
        <p className="iris-eyebrow">{eyebrow}</p>
        <div className="patient-header-title">
          <h1 className="patient-code">{code}</h1>
          {demographics.length > 0 ? <span className="patient-demographics">{demographics.join(' · ')}</span> : null}
        </div>
      </div>
      <dl className="patient-header-facts">
        <div><dt>Prioridad CMO actual</dt><dd>{priority ? <CmoLevelBadge level={priority} score={score} pending={priorityPending} /> : <span className="text-muted">Sin estratificar</span>}</dd></div>
        <div><dt>Última visita</dt><dd className="numeric">{lastVisitDate ?? '—'}</dd></div>
        {followup ? <div><dt>Seguimiento</dt><dd><StatusBadge tone={followup.tone} dot>{followup.label}</StatusBadge></dd></div> : null}
        {details.map((d) => <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>)}
      </dl>
      {actions ? <div className="patient-header-actions">{actions}</div> : null}
    </header>
  );
}
