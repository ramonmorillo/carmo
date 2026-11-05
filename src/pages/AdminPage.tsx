import { useEffect, useState } from 'react';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { ROLE_LABELS } from '../domain/study';
import { fmtDate, label } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { carmo, type Membership, type Profile } from '../services/carmoData';

export function AdminPage() {
  const session = useCarmoSession();
  const [d, setD] = useState<{ profiles: Profile[]; memberships: Membership[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([carmo.profiles(), carmo.memberships()]).then(([profiles, memberships]) => setD({ profiles, memberships })).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState label="Cargando…" />;
  const center = (id: string) => session.centers.find((c) => c.id === id)?.code ?? '—';
  const STATUS: Record<string, string> = { pending_authorization: 'Pendiente de autorización', authorized: 'Autorizado', closed: 'Cerrado' };
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Administración" title="Centros, profesionales y roles" description="Alta de cuentas y asignación de centros por SQL administrativo (carmo_private.provision_user / assign_center), nunca desde el navegador." />
      <Notice tone="info">Ningún centro se activa por defecto: la relación de centros debe contrastarse con la autorización efectiva para participar (RG-07). Modo de datos actual: <strong>{session.dataMode ?? '—'}</strong>.</Notice>
      <section className="card"><h2>Centros</h2>
        {session.centers.length === 0 ? <p className="text-muted">Ningún centro registrado.</p> : (
          <table className="carmo-table"><thead><tr><th>Código</th><th>Nombre</th><th>Nº</th><th>Participación</th><th>Referencia</th><th>Activo</th></tr></thead><tbody>
            {session.centers.map((c) => <tr key={c.id}><td>{c.code}</td><td>{c.name}</td><td>{c.study_number ?? '—'}</td><td>{STATUS[c.participation_status] ?? c.participation_status}</td><td>{c.authorization_reference ?? '—'}</td><td>{c.is_active ? 'Sí' : 'No'}</td></tr>)}
          </tbody></table>
        )}
      </section>
      <section className="card"><h2>Profesionales</h2>
        <table className="carmo-table"><thead><tr><th>Nombre</th><th>Rol</th><th>Activo</th><th>Centros (alta – baja)</th></tr></thead><tbody>
          {d.profiles.map((p) => <tr key={p.id}><td>{p.full_name ?? '—'}</td><td>{label(ROLE_LABELS, p.role)}</td><td>{p.is_active ? 'Sí' : 'No'}</td>
            <td>{d.memberships.filter((m) => m.profile_id === p.id).map((m) => `${center(m.center_id)} (${fmtDate(m.starts_on)} – ${m.ends_on ? fmtDate(m.ends_on) : 'vigente'})`).join('; ') || '—'}</td></tr>)}
        </tbody></table>
      </section>
    </div>
  );
}
