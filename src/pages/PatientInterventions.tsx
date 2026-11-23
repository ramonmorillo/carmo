import { Link } from 'react-router-dom';

import { StatusBadge } from '../components/ui/StatusBadge';
import { ACCEPTANCE_LABELS, RECIPIENT_LABELS } from '../domain/cmoLabels';
import { VISIT_LABELS } from '../domain/study';
import { fmtDate, label } from '../lib/format';
import type { Intervention, InterventionCatalogItem, Visit } from '../services/carmoData';

type Props = { patientId: string; interventions: Intervention[]; visits: Visit[]; catalog: InterventionCatalogItem[]; canWrite: boolean };

/** Visita a la que pertenece una intervención: la de la visita, o «Sin visita» (visit_id nulo, sin visita ficticia). */
export function interventionVisitLabel(i: Pick<Intervention, 'visit_id'>, visits: Pick<Visit, 'id' | 'visit_code'>[]): string {
  if (!i.visit_id) return 'Sin visita';
  const v = visits.find((x) => x.id === i.visit_id);
  return v ? label(VISIT_LABELS, v.visit_code) : 'Visita no accesible';
}

/**
 * Historial de intervenciones del paciente: TODAS las del paciente, con o sin visita. Cada intervención aparece una
 * sola vez; las registradas «Sin visita» se etiquetan como tal (no se asignan a ninguna visita).
 */
export function PatientInterventions({ patientId, interventions, visits, catalog, canWrite }: Props) {
  const items = [...interventions].sort((a, b) => b.intervention_date.localeCompare(a.intervention_date));
  const withoutVisit = items.filter((i) => !i.visit_id).length;
  const cat = (code: string) => catalog.find((c) => c.code === code)?.label ?? '';
  return (
    <section className="card" aria-label="Intervenciones del paciente">
      <h2>Intervenciones del paciente <StatusBadge tone="neutral">{items.length}</StatusBadge></h2>
      <p className="carmo-hint">Todas las actuaciones de Atención Farmacéutica registradas, con o sin visita{withoutVisit > 0 ? ` (${withoutVisit} sin visita)` : ''}. Cada intervención se cuenta una sola vez.</p>
      {items.length === 0 ? <p className="text-muted">Sin intervenciones registradas.</p> : (
        <div className="table-wrap"><table className="carmo-table">
          <thead><tr><th>Fecha</th><th>Visita</th><th>Actuación</th><th>Tipo</th><th>Modalidad</th><th>Destinatario</th><th>Aceptación</th><th>Seguimiento</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id}>
              <td>{fmtDate(i.intervention_date)}</td>
              <td>{i.visit_id ? <Link to={`/visits/${i.visit_id}?seccion=intervenciones`}>{interventionVisitLabel(i, visits)}</Link> : <StatusBadge tone="info">Sin visita</StatusBadge>}</td>
              <td>{i.catalog_code} · {cat(i.catalog_code)}</td>
              <td>{i.is_scheduled ? 'Programada' : 'No programada'}</td>
              <td>{i.modality === 'in_person' ? 'Presencial' : 'Telemática'}</td>
              <td>{label(RECIPIENT_LABELS, i.recipient)}</td>
              <td>{label(ACCEPTANCE_LABELS, i.acceptance)}</td>
              <td>{i.followup_status === 'open' ? 'Abierto' : 'Cerrado'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {canWrite ? <p><Link className="button-link" to={`/interventions?patient=${patientId}`}>Registrar intervención</Link></p> : null}
    </section>
  );
}
