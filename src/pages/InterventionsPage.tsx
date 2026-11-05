import { useEffect, useState } from 'react';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { fmtDate } from '../lib/format';
import { carmo, type Intervention, type InterventionCatalogItem } from '../services/carmoData';

export function InterventionsPage() {
  const [d, setD] = useState<{ catalog: InterventionCatalogItem[]; items: Intervention[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([carmo.interventionCatalog(), carmo.interventions()]).then(([catalog, items]) => setD({ catalog, items })).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState label="Cargando…" />;
  const validated = d.catalog.filter((c) => c.status === 'validated');
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Intervenciones" title="Intervenciones farmacéuticas" description="Programadas y no programadas, presenciales y telemáticas; categoría, dominio CMO, motivo, actuación, destinatario, aceptación, resultado y seguimiento." />
      {validated.length === 0 ? (
        <Notice tone="warning" title="Registro bloqueado">La taxonomía oficial de intervenciones del modelo CMO cardiovascular no se ha transcrito ni validado. No se introducen categorías no aprobadas en el protocolo (RG-22).</Notice>
      ) : null}
      <section className="card"><h2>Catálogo</h2>
        {d.catalog.length === 0 ? <p className="text-muted">Catálogo vacío.</p> : (
          <table className="carmo-table"><thead><tr><th>Código</th><th>Dominio</th><th>Categoría</th><th>Estado</th></tr></thead><tbody>{d.catalog.map((c) => <tr key={c.code}><td>{c.code}</td><td>{c.cmo_domain}</td><td>{c.category}{c.subcategory ? ` · ${c.subcategory}` : ''}</td><td>{c.status}</td></tr>)}</tbody></table>
        )}
      </section>
      <section className="card"><h2>Registradas ({d.items.length})</h2>
        {d.items.length === 0 ? <p className="text-muted">Sin intervenciones.</p> : (
          <table className="carmo-table"><thead><tr><th>Fecha</th><th>Categoría</th><th>Modalidad</th><th>Aceptación</th><th>Seguimiento</th></tr></thead><tbody>{d.items.map((i) => <tr key={i.id}><td>{fmtDate(i.intervention_date)}</td><td>{i.catalog_code}</td><td>{i.modality}</td><td>{i.acceptance ?? '—'}</td><td>{i.followup_status}</td></tr>)}</tbody></table>
        )}
      </section>
    </div>
  );
}
