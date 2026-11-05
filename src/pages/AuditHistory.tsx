import { useEffect, useState } from 'react';

import { auditDiff } from '../domain/pending';
import { ROLE_LABELS } from '../domain/study';
import { label } from '../lib/format';
import { supabase } from '../lib/supabase';

type AuditRow = { id: number; at: string; actor_role: string | null; table_name: string; action: string; reason: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

const TABLE_LABELS: Record<string, string> = {
  carmo_patients: 'Paciente', carmo_eligibility_answers: 'Criterios', carmo_consents: 'Consentimiento', carmo_visits: 'Visita',
  carmo_observations: 'Variable clínica', carmo_visit_evolutions: 'Evolución', carmo_questionnaire_administrations: 'Cuestionario',
  carmo_treatments: 'Tratamiento', carmo_treatment_events: 'Evento de tratamiento', carmo_dispensations: 'Dispensación',
  carmo_stratifications: 'Estratificación', carmo_interventions: 'Intervención', carmo_deviations: 'Desviación',
};
const ACTION_LABELS: Record<string, string> = { INSERT: 'Alta', UPDATE: 'Modificación', DELETE: 'Borrado' };

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Historial de cambios del paciente (coordinación y monitor; la RLS limita el acceso). */
export function AuditHistory({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.from('carmo_audit_log').select('id,at,actor_role,table_name,action,reason,old_data,new_data').eq('patient_id', patientId).order('at', { ascending: false }).limit(300)
      .then(({ data, error: e }) => (e ? setError(e.message) : setRows((data ?? []) as AuditRow[])));
  }, [patientId]);
  return (
    <section className="card">
      <details>
        <summary><strong>Historial de cambios (auditoría)</strong>{rows ? ` · ${rows.length} registro(s)${rows.length === 300 ? ', se muestran los 300 más recientes' : ''}` : ''}</summary>
        {error ? <p className="text-muted">No disponible: {error}</p> : null}
        {rows && rows.length > 0 ? (
          <div className="table-wrap"><table className="carmo-table">
            <thead><tr><th>Fecha (UTC)</th><th>Registro</th><th>Acción</th><th>Rol</th><th>Motivo</th><th>Cambios</th></tr></thead>
            <tbody>{rows.map((r) => {
              const diff = auditDiff(r.old_data, r.new_data);
              return (
                <tr key={r.id}><td>{r.at.slice(0, 16).replace('T', ' ')}</td><td>{TABLE_LABELS[r.table_name] ?? r.table_name}</td><td>{ACTION_LABELS[r.action] ?? r.action}</td>
                  <td>{r.actor_role ? label(ROLE_LABELS, r.actor_role) : 'Administración (SQL)'}</td><td>{r.reason ?? '—'}</td>
                  <td>{r.action === 'UPDATE' ? (diff.length ? diff.map((d) => <div key={d.field}><code>{d.field}</code>: {show(d.before)} → {show(d.after)}</div>) : <span className="text-muted">Sin cambios de contenido</span>) : <span className="text-muted">—</span>}</td></tr>
              );
            })}</tbody>
          </table></div>
        ) : rows ? <p className="text-muted">Sin registros.</p> : null}
      </details>
    </section>
  );
}
