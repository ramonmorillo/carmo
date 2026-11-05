import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { PROJECT_IDENTITY, PROJECT_SHORT_FOOTER } from '../../constants/institutional';
import { ROLE_CAN, ROLE_LABELS } from '../../domain/study';
import type { CarmoSession } from '../../lib/session';
import { getCurrentSession, getOwnAccessDecision, signOut, subscribeToAuthChanges } from '../../services/authService';
import { carmo } from '../../services/carmoData';
import { BrandMark } from '../ui/BrandMark';
import { LoadingState } from '../ui/LoadingState';

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link');
type Blocked = { title: string; message: string } | null;

export function AppShell() {
  const navigate = useNavigate();
  const [session, setSession] = useState<CarmoSession | null>(null);
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function validate() {
      const { session: auth, error } = await getCurrentSession();
      if (!mounted) return;
      if (error) { setBlocked({ title: 'Error de autenticación', message: error.message }); return; }
      if (!auth) { navigate('/login', { replace: true }); return; }
      // Una cuenta válida en el proyecto compartido (DERMAPEX/COAMO) no implica acceso a CARMO: decide la BD.
      const decision = await getOwnAccessDecision(auth.user.id);
      if (!mounted) return;
      if (decision === 'must_change_password') { navigate('/set-password?mode=first', { replace: true }); return; }
      if (decision !== 'ok') {
        setBlocked({
          no_access: { title: 'Cuenta sin acceso a CARMO', message: 'Esta cuenta no está autorizada en CARMO. Si participa en el estudio, solicite el alta a la coordinación.' },
          inactive: { title: 'Cuenta desactivada en CARMO', message: 'Su perfil CARMO está desactivado. Contacte con la coordinación.' },
          error: { title: 'No se pudo comprobar su acceso', message: 'Inténtelo de nuevo en unos minutos.' },
        }[decision]);
        return;
      }
      try {
        const [profile, centers, memberships, settings] = await Promise.all([
          carmo.ownProfile(auth.user.id), carmo.centers(), carmo.memberships(), carmo.studySettings(),
        ]);
        if (!mounted) return;
        if (!profile) { setBlocked({ title: 'Cuenta sin acceso a CARMO', message: 'No se encontró su perfil CARMO.' }); return; }
        setSession({
          userId: auth.user.id, role: profile.role, fullName: profile.full_name, centers,
          memberships: memberships.filter((m) => m.profile_id === auth.user.id && !m.ends_on),
          dataMode: settings?.data_mode ?? null, targetSampleSize: settings?.target_sample_size ?? 135,
        });
      } catch (e) {
        if (mounted) setBlocked({ title: 'No se pudo cargar la sesión', message: (e as Error).message });
      }
    }
    const sub = subscribeToAuthChanges((event, s) => { if (mounted && (event === 'SIGNED_OUT' || !s)) navigate('/login', { replace: true }); });
    void validate();
    return () => { mounted = false; sub?.unsubscribe(); };
  }, [navigate]);

  const handleSignOut = async () => {
    setSigningOut(true);
    const { error } = await signOut();
    if (error) { setBlocked({ title: 'No se pudo cerrar la sesión', message: error.message }); setSigningOut(false); return; }
    navigate('/login', { replace: true });
  };

  if (blocked) {
    return (
      <div className="app-shell"><main className="main-content">
        <section className="error-state" role="alert"><h2>{blocked.title}</h2><p>{blocked.message}</p>
          <button type="button" className="button-link" onClick={handleSignOut} disabled={signingOut}>Cerrar sesión</button></section>
      </main></div>
    );
  }
  if (!session) return <div className="app-shell"><main className="main-content"><LoadingState label="Comprobando sesión..." /></main></div>;

  const r = session.role;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      {session.dataMode !== 'production' ? (
        <div className="carmo-banner" role="status">Fase de validación: solo datos sintéticos. No introduzca datos de pacientes reales.</div>
      ) : null}
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/dashboard" aria-label={`${PROJECT_IDENTITY.name} · Ir al inicio`}>
            <BrandMark size={30} />
            <span className="brand-stack"><span className="brand-name">{PROJECT_IDENTITY.name}</span><span className="brand-subtitle">{PROJECT_IDENTITY.subtitle}</span></span>
          </Link>
          <nav className="main-nav" aria-label="Navegación principal">
            <NavLink to="/dashboard" className={navLinkClass}>Inicio</NavLink>
            {r !== 'tech_admin' ? <NavLink to="/patients" className={navLinkClass}>Pacientes</NavLink> : null}
            {r !== 'tech_admin' ? <NavLink to="/agenda" className={navLinkClass}>Visitas y agenda</NavLink> : null}
            {ROLE_CAN.writeQuestionnaire(r) || r === 'monitor' ? <NavLink to="/questionnaires" className={navLinkClass}>Cuestionarios</NavLink> : null}
            {ROLE_CAN.readClinical(r) ? <NavLink to="/stratification" className={navLinkClass}>Estratificación</NavLink> : null}
            {ROLE_CAN.readClinical(r) ? <NavLink to="/interventions" className={navLinkClass}>Intervenciones</NavLink> : null}
            {ROLE_CAN.readClinical(r) ? <NavLink to="/export" className={navLinkClass}>Exportación</NavLink> : null}
            {ROLE_CAN.admin(r) ? <NavLink to="/admin" className={navLinkClass}>Administración</NavLink> : null}
            <NavLink to="/project" className={navLinkClass}>Proyecto</NavLink>
          </nav>
          <div className="topbar-meta">
            <span className="system-status" title={session.fullName ?? ''}><span className="system-status-dot" aria-hidden="true" />{ROLE_LABELS[r]}</span>
            <button type="button" className="nav-signout" onClick={handleSignOut} disabled={signingOut}>{signingOut ? 'Saliendo...' : 'Cerrar sesión'}</button>
          </div>
        </div>
      </header>
      <main className="main-content" id="main-content"><Outlet context={session} /></main>
      <footer className="app-footer"><p className="app-footer-text">{PROJECT_SHORT_FOOTER}</p></footer>
    </div>
  );
}
