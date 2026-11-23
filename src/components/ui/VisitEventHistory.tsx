import { ROLE_LABELS } from '../../domain/study';
import type { VisitEvent } from '../../domain/visitEvents';
import { label } from '../../lib/format';

/** Marca temporal local legible (la BD guarda UTC). */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

type Props = { events: VisitEvent[]; /** Informe imprimible: tabla sin estilos de aplicación. */ report?: boolean };

/**
 * Historial de la visita: anulaciones, no realizaciones, reaperturas y cierres con su motivo. Los motivos son los
 * guardados en su momento; si no constan (registros históricos), se indica sin inventarlos.
 */
export function VisitEventHistory({ events, report = false }: Props) {
  if (events.length === 0) return <p className={report ? 'carmo-report-text' : 'text-muted'}>Sin cambios de estado registrados en esta visita.</p>;
  const table = (
    <table className={report ? undefined : 'carmo-table'}>
      <thead><tr><th>Fecha y hora</th><th>Evento</th><th>Motivo</th><th>Autor</th></tr></thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td>{fmtDateTime(e.at)}</td>
            <td>{e.title}</td>
            <td>{e.reason ?? (e.reasonMissing ? <em>Motivo no registrado</em> : '—')}</td>
            <td>{e.actorName ?? (e.actorRole ? label(ROLE_LABELS, e.actorRole) : '—')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return report ? table : <div className="table-wrap">{table}</div>;
}
