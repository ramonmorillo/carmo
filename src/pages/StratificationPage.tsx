import { useEffect, useState } from 'react';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { CMO_ENGINE_VERSION } from '../domain/cmoEngine';
import { fmtDate } from '../lib/format';
import { carmo, type CmoModel, type Stratification } from '../services/carmoData';

export function StratificationPage() {
  const [d, setD] = useState<{ models: CmoModel[]; strats: Stratification[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([carmo.cmoModels(), carmo.stratifications()]).then(([models, strats]) => setD({ models, strats })).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState label="Cargando…" />;
  const validated = d.models.filter((m) => m.status === 'validated');
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Estratificación" title="Modelo CMO cardiovascular" description={`Motor genérico ${CMO_ENGINE_VERSION}: cálculo reproducible, desglose, justificación, versión, autor y fecha; reestratificación sin pérdida del resultado original; validación profesional obligatoria.`} />
      {validated.length === 0 ? (
        <Notice tone="warning" title="Cálculo clínico desactivado">
          No se dispone del documento oficial de adaptación del modelo CMO a pacientes con patología cardiovascular (MAPEX-SEFH). No se extrapolan variables, puntos ni umbrales de otros modelos CMO.
          La base de datos rechaza cualquier estratificación hasta cargar y validar una versión del modelo (RG-21).
        </Notice>
      ) : null}
      <section className="card"><h2>Versiones del modelo</h2>
        {d.models.length === 0 ? <p className="text-muted">Ninguna versión cargada.</p> : (
          <table className="carmo-table"><thead><tr><th>Versión</th><th>Estado</th><th>Fuente</th></tr></thead><tbody>{d.models.map((m) => <tr key={m.version}><td>{m.version}</td><td>{m.status}</td><td>{m.source_reference}</td></tr>)}</tbody></table>
        )}
      </section>
      <section className="card"><h2>Histórico de estratificaciones</h2>
        {d.strats.length === 0 ? <p className="text-muted">Sin estratificaciones.</p> : (
          <table className="carmo-table"><thead><tr><th>Fecha</th><th>Modelo</th><th className="numeric">Puntuación</th><th>Calculada</th><th>Validación</th><th>Final</th></tr></thead><tbody>
            {d.strats.map((s) => <tr key={s.id}><td>{fmtDate(s.calculated_at)}</td><td>{s.model_version}</td><td className="numeric">{s.total_score ?? '—'}</td><td>P{s.calculated_priority}</td><td>{s.validation_status}</td><td>{s.final_priority ? `P${s.final_priority}` : '—'}</td></tr>)}
          </tbody></table>
        )}
      </section>
    </div>
  );
}
