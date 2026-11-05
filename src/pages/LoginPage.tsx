import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { PublicFooter } from '../components/public/PublicFooter';
import { BrandMark } from '../components/ui/BrandMark';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PROJECT_IDENTITY, PROJECT_INSTITUTIONAL_REFERENCE } from '../constants/institutional';
import { consumePendingAuthLink, getAuthRedirectUrl } from '../lib/authLinks';
import { getCurrentSession, requestPasswordReset, signInWithPassword, subscribeToAuthChanges } from '../services/authService';

// Portada: solo información del encargo/protocolo comunicada por el IP. Sin cifras ni afirmaciones sin fuente.
export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    const link = consumePendingAuthLink();
    return link?.kind === 'error' ? `El enlace del correo no es válido o ha caducado (${link.description}). Solicita uno nuevo.` : null;
  });
  const [resetMode, setResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void getCurrentSession().then(({ session, error }) => {
      if (!mounted) return;
      if (error) setErrorMessage(error.message);
      if (session) navigate('/dashboard', { replace: true });
      else setCheckingSession(false);
    });
    const sub = subscribeToAuthChanges((event, session) => {
      if (mounted && event === 'SIGNED_IN' && session) navigate('/dashboard', { replace: true });
    });
    return () => { mounted = false; sub?.unsubscribe(); };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrorMessage(null);
    const { error } = await signInWithPassword(email, password);
    if (error) { setErrorMessage(error.message); setLoading(false); return; }
    navigate('/dashboard', { replace: true });
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    const { error } = await requestPasswordReset(email, getAuthRedirectUrl());
    setLoading(false);
    if (error) { setErrorMessage(error.message); return; }
    setResetMessage('Si el email corresponde a una cuenta del estudio, recibirás un enlace para crear una nueva contraseña.');
  };

  const ref = PROJECT_INSTITUTIONAL_REFERENCE;
  if (checkingSession) return <div className="app-shell"><main className="main-content"><LoadingState label="Comprobando sesión..." /></main></div>;

  return (
    <div className="public-page">
      <header className="public-header public-header-compact">
        <div className="public-container public-nav">
          <span className="public-brand"><BrandMark size={36} /><span><strong>{PROJECT_IDENTITY.name}</strong><small>Modelo CMO · riesgo cardiovascular</small></span></span>
        </div>
      </header>
      <main id="contenido">
        <section className="public-section">
          <div className="public-container access-grid">
            <div>
              <p className="iris-eyebrow">{ref.protocolCode} · Estudio observacional prospectivo multicéntrico</p>
              <h1>{PROJECT_IDENTITY.name}</h1>
              <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--iris-text)" }}>{ref.projectTitle}.</p>
              <p>Diseño antes-después con seguimiento de 12 meses. Variable principal: experiencia del paciente (IEXPAC) en la evaluación inicial y en la visita final.</p>
              <p className="text-muted">Promotor: {ref.sponsor}. {ref.ethicsDecision} del {ref.ethicsCommittee} (registro {ref.ethicsApprovalCode}).</p>
              <Notice tone="warning" title="Herramienta en validación">
                Esta plataforma no está habilitada para datos reales de pacientes hasta completar la validación técnica, documental, regulatoria y de protección de datos.
              </Notice>
            </div>
            <section className="auth-card" aria-labelledby="login-title">
              <div className="auth-card-header"><h2 id="login-title">{resetMode ? 'Recuperar contraseña' : 'Acceso profesional'}</h2></div>
              {errorMessage ? <ErrorState title="No se pudo continuar" message={errorMessage} /> : null}
              {resetMessage ? <Notice tone="success">{resetMessage}</Notice> : null}
              <form className="form-grid" onSubmit={resetMode ? handleReset : handleSubmit}>
                <label>Correo electrónico<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                {!resetMode ? <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label> : null}
                <button type="submit" className="button-link button-block" disabled={loading}>{loading ? 'Procesando…' : resetMode ? 'Enviar enlace' : 'Entrar'}</button>
              </form>
              <button type="button" className="button-ghost" onClick={() => { setResetMode(!resetMode); setResetMessage(null); }}>
                {resetMode ? 'Volver al acceso' : '¿Has olvidado la contraseña?'}
              </button>
              <p className="auth-note">Acceso restringido a profesionales autorizados del estudio. Las cuentas las crea la coordinación.</p>
            </section>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
