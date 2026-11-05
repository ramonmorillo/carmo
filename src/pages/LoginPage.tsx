import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { PublicFooter } from '../components/public/PublicFooter';
import { BrandMark } from '../components/ui/BrandMark';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PROJECT_IDENTITY, PROJECT_INSTITUTIONAL_REFERENCE, getEthicsApprovalDateLabel } from '../constants/institutional';
import { consumePendingAuthLink, getAuthRedirectUrl } from '../lib/authLinks';
import { getCurrentSession, requestPasswordReset, signInWithPassword, subscribeToAuthChanges } from '../services/authService';

// Portada pública con la misma composición que DERMAPEX y COAMO. Contenido: solo lo que consta en el protocolo
// v3.0 (criterios INC/EXC, calendario de visitas), en el dictamen del CEIm-G, en el modelo CMO cardiovascular
// validado (docs/CARMO_CMO_MODEL.md) y en la configuración de instrumentos de la BD. Sin cifras ni afirmaciones
// sin fuente. Mientras la herramienta esté en validación, el aviso de «no apta para datos reales» es obligatorio.

const STUDY_PILLARS = [
  ['01', 'Población', 'Adultos con hipercolesterolemia familiar y/o en prevención secundaria de enfermedad cardiovascular, seguidos en la consulta externa de Farmacia Hospitalaria con medicamentos de uso hospitalario para esta patología.'],
  ['02', 'Diseño', 'Estudio observacional, prospectivo y multicéntrico, antes-después, con evaluación inicial, visitas en las semanas 12, 24 y 36 y visita final a los 12 meses (±28 días).'],
  ['03', 'Variable principal', 'Experiencia del paciente con la atención recibida, medida con el cuestionario IEXPAC en la evaluación inicial y en la visita final.'],
] as const;

const FEATURES = [
  ['Cribado e inclusión seudonimizados', 'Registro del candidato sin datos identificativos, criterios de inclusión y exclusión del protocolo, consentimiento informado y código de paciente asignado por la base de datos al incluir.'],
  ['Visitas y agenda', 'Calendario del protocolo con ventanas de visita, contactos extraordinarios, revisión y cierre de cada visita.'],
  ['Variables cardiovasculares', 'Variables clínicas con fecha, unidad, origen y contexto. Las correcciones se registran como nuevas mediciones y no sobrescriben la anterior.'],
  ['Tratamiento hipolipemiante', 'Historial de tratamientos (alirocumab, evolocumab, inclisirán y evinacumab) y dispensaciones, con motivo en cada cambio.'],
  ['Estratificación CMO', 'Cálculo de la prioridad con la adaptación del modelo CMO al paciente con patologías cardiovasculares; la base de datos repite el cálculo y rechaza cualquier discrepancia.'],
  ['Calidad y exportación', 'Datos pendientes por paciente y por centro, historial de cambios auditado y paquete de exportación conciliado con la base de datos (CSV, XLSX y sintaxis SPSS).'],
] as const;

const PROCESS = ['Cribar e incluir', 'Evaluación inicial', 'Estratificar', 'Seguir e intervenir', 'Medir en la visita final'] as const;

const INSTRUMENTS = [
  ['IEXPAC', 'Experiencia del paciente con la atención (PREM). Variable principal. Evaluación inicial y visita final.'],
  ['EQ-5D-3L', 'Calidad de vida relacionada con la salud (PROM): perfil de salud y escala visual. Evaluación inicial y visita final.'],
  ['EVASAF', 'Satisfacción con la atención farmacéutica. Evaluación inicial y visita final.'],
  ['Morisky-Green', 'Adherencia al tratamiento. Evaluación inicial, semana 24 y visita final.'],
] as const;

// Puntos de corte y periodicidad: docs/CARMO_CMO_MODEL.md §2 y §4.7 (modelo CMO-CV-SEFH-2024, validado).
const PRIORITIES = [
  ['Prioridad 1', '≥ 23 puntos o embarazo', 'Reestratificación cada 3-6 meses'],
  ['Prioridad 2', '17 – 22 puntos', 'Reestratificación anual'],
  ['Prioridad 3', '< 17 puntos', 'Según necesidad'],
] as const;

// Calendario del protocolo v3.0 (src/domain/study.ts: PROGRAMMED_VISITS).
const TIMELINE = [[45, 'Inicial'], [152, 'S12'], [260, 'S24'], [367, 'S36'], [475, 'Final · 12 m']] as const;

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
    if (loading) return;
    setLoading(true);
    setErrorMessage(null);
    setResetMessage(null);
    const { error } = await requestPasswordReset(email, getAuthRedirectUrl());
    setLoading(false);
    if (error) { setErrorMessage(error.message); return; }
    setResetMessage('Si el email corresponde a una cuenta del estudio, recibirás un enlace para crear una nueva contraseña.');
  };

  const ref = PROJECT_INSTITUTIONAL_REFERENCE;
  const sessionDate = getEthicsApprovalDateLabel();

  return (
    <div className="public-page">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <header className="public-header">
        <div className="public-container public-nav">
          <a className="public-brand" href="#inicio" aria-label={`${PROJECT_IDENTITY.name} · Inicio`}>
            <BrandMark size={36} />
            <span><strong>{PROJECT_IDENTITY.name}</strong><small>Modelo CMO · riesgo cardiovascular</small></span>
          </a>
          <nav aria-label="Navegación pública">
            <a href="#estudio">El estudio</a>
            <a href="#modelo-cmo">Modelo CMO</a>
            <a href="#investigacion">Investigación</a>
            <a className="public-access-link" href="#acceso">Acceso profesional</a>
          </nav>
        </div>
      </header>

      <main id="contenido">
        <section className="public-hero" id="inicio" aria-labelledby="hero-title">
          <div className="public-container hero-grid">
            <div className="hero-copy">
              <p className="iris-eyebrow">{ref.protocolCode} · Estudio observacional prospectivo multicéntrico</p>
              <h1 id="hero-title">Experiencia del paciente.<br />Estratificación. Seguimiento.</h1>
              <p className="hero-lead">Herramienta digital del estudio {PROJECT_IDENTITY.name} para la atención farmacéutica según el modelo CMO en pacientes con riesgo cardiovascular.</p>
              <p className="hero-support">Reúne en un único entorno el cribado y la inclusión seudonimizados, las visitas del estudio, las variables cardiovasculares y el tratamiento, la estratificación CMO, los cuestionarios de resultados reportados por el paciente y la exportación para el análisis.</p>
              <div className="hero-actions">
                <a className="button-link" href="#acceso">Acceso profesional</a>
                <a className="button-secondary" href="#estudio">Conocer el estudio</a>
              </div>
              <p className="hero-reference">Promotor: {ref.sponsor} · {ref.ethicsDecision} del {ref.ethicsCommittee} · nº de registro {ref.ethicsApprovalCode}</p>
            </div>
            <div className="longitudinal-card" aria-label="Seguimiento desde la evaluación inicial hasta la visita final a los doce meses">
              <div className="longitudinal-heading"><span>Seguimiento del estudio</span><strong>12 meses</strong></div>
              <svg viewBox="0 0 520 210" role="img" aria-labelledby="timeline-title timeline-desc">
                <title id="timeline-title">Calendario de visitas del estudio</title>
                <desc id="timeline-desc">Evaluación inicial, visitas en las semanas 12, 24 y 36 y visita final a los doce meses.</desc>
                <path className="timeline-grid" d="M35 160H485 M35 60H485" />
                {/* Línea temporal neutra: el estudio no ha medido aún ningún resultado, no se dibuja tendencia. */}
                <path className="timeline-line" d="M45 110H475" />
                {TIMELINE.map(([x, label], index) => (
                  <g key={label} className={`timeline-point timeline-point-${index + 1}`}>
                    <circle cx={x} cy={110} r="7" /><text x={x} y="190" textAnchor="middle">{label}</text>
                  </g>
                ))}
              </svg>
              <div className="longitudinal-meta"><span>Intensidad según la prioridad CMO</span><span>IEXPAC al inicio y al final</span></div>
            </div>
          </div>
        </section>

        <section className="public-section" id="estudio" aria-labelledby="study-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">El estudio</p><h2 id="study-title">Atención farmacéutica CMO en el paciente con riesgo cardiovascular</h2><p>{PROJECT_IDENTITY.name} evalúa la experiencia del paciente con riesgo cardiovascular seguido con el Modelo de Atención Farmacéutica Capacidad-Motivación-Oportunidad.</p></div>
            <div className="value-grid">
              {STUDY_PILLARS.map(([number, title, copy]) => <article className="value-card" key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
            </div>
          </div>
        </section>

        <section className="public-section public-section-muted" aria-labelledby="features-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">Funcionalidades</p><h2 id="features-title">Un entorno integrado para el estudio</h2><p>Cada módulo guía el registro con las reglas del protocolo, y la base de datos aplica esas mismas reglas al guardar.</p></div>
            <div className="feature-grid">
              {FEATURES.map(([title, copy], index) => <article className="feature-card" key={title}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="process-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">Cómo funciona</p><h2 id="process-title">Del cribado a la medición de resultados</h2><p>El recorrido de cada paciente en el estudio, desde la evaluación inicial hasta la visita final.</p></div>
            <ol className="process-list">{PROCESS.map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}</ol>
          </div>
        </section>

        <section className="public-section cmo-section" id="modelo-cmo" aria-labelledby="cmo-title">
          <div className="public-container cmo-grid">
            <div>
              <p className="iris-eyebrow">Metodología CMO</p>
              <h2 id="cmo-title">Seguimiento adaptado a las necesidades de cada paciente</h2>
              <p>La estratificación aplica la adaptación del modelo CMO de la SEFH al paciente con patologías cardiovasculares: 20 variables en cuatro bloques (demográficas, clínicas, farmacoterapéuticas y sociosanitarias) que asignan una prioridad y, con ella, la intensidad del seguimiento y las actuaciones farmacéuticas.</p>
              <p>La herramienta propone el nivel; el farmacéutico lo confirma y puede situar al paciente en un nivel superior justificándolo.</p>
            </div>
            <div>
              <div className="cmo-pillars" aria-label="Dimensiones de la metodología CMO"><span><strong>C</strong>Capacidad</span><span><strong>M</strong>Motivación</span><span><strong>O</strong>Oportunidad</span></div>
              <dl className="carmo-priority-list" aria-label="Niveles de prioridad del modelo">
                {PRIORITIES.map(([level, criterion, frequency]) => <div key={level}><dt>{level}</dt><dd>{criterion}</dd><dd>{frequency}</dd></div>)}
              </dl>
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="instruments-title">
          <div className="public-container product-grid">
            <div className="section-heading">
              <p className="iris-eyebrow">Resultados reportados por el paciente</p>
              <h2 id="instruments-title">Cuestionarios del estudio</h2>
              <p>Cada cuestionario se registra en su visita, con revisión antes del cierre. La puntuación la calcula la base de datos, y un cuestionario con ítems sin responder queda sin resultado.</p>
            </div>
            <dl className="research-data">
              {INSTRUMENTS.map(([name, copy]) => <div key={name}><dt>{name}</dt><dd>{copy}</dd></div>)}
            </dl>
          </div>
        </section>

        <section className="public-section public-section-muted" id="investigacion" aria-labelledby="research-title">
          <div className="public-container research-grid">
            <div><p className="iris-eyebrow">Proyecto de investigación</p><h2 id="research-title">Del modelo asistencial a la práctica real.</h2><p className="research-title">{ref.projectTitle}</p></div>
            <dl className="research-data">
              <div><dt>Promotor</dt><dd>{ref.sponsor}</dd></div>
              <div><dt>Coordinación científica de la herramienta</dt><dd>{ref.toolScientificCoordination}</dd></div>
              <div><dt>Comité de ética</dt><dd>{ref.ethicsCommittee}{sessionDate ? <><br /><span className="cell-muted">{ref.ethicsDecision} · reunión de {sessionDate}</span></> : null}</dd></div>
              <div><dt>Nº de registro</dt><dd className="numeric">{ref.ethicsApprovalCode}</dd></div>
              <div><dt>Documentos de referencia</dt><dd>{ref.protocolVersion}<br /><span className="cell-muted">{ref.informedConsentVersion}</span></dd></div>
            </dl>
          </div>
        </section>

        <aside className="research-notice"><div className="public-container"><strong>Herramienta vinculada al estudio</strong><p>{PROJECT_IDENTITY.name} es la herramienta digital de recogida de datos del estudio. Los pacientes se registran seudonimizados y cada investigador accede solo a los de su centro. El acceso está restringido a profesionales autorizados.</p></div></aside>

        <section className="access-section" id="acceso" aria-labelledby="auth-title">
          <div className="public-container access-grid">
            <div className="access-context">
              <p className="iris-eyebrow">Entorno profesional seguro</p>
              <h2>Acceso restringido al estudio</h2>
              <p>Accede al entorno de trabajo con las credenciales facilitadas para tu participación. Las cuentas las crea la coordinación.</p>
              <Notice tone="warning" title="Herramienta en validación">
                Esta plataforma no está habilitada para datos reales de pacientes hasta completar la validación técnica, documental, regulatoria y de protección de datos. Solo admite pacientes de prueba.
              </Notice>
              <div className="responsible-note"><strong>Uso responsable</strong><p>{PROJECT_IDENTITY.name} apoya el registro estructurado y el seguimiento en el marco del estudio. Sus resultados deben ser interpretados por profesionales sanitarios cualificados y no sustituyen el juicio clínico individual.</p></div>
            </div>
            <section className="auth-card" aria-labelledby="auth-title">
              <header className="auth-card-header"><p className="iris-eyebrow">{PROJECT_IDENTITY.name} · Área restringida</p><h2 id="auth-title">{resetMode ? 'Recuperar contraseña' : 'Acceso profesional'}</h2><p className="auth-supporting-copy">Acceso exclusivo para profesionales autorizados participantes en el estudio.</p></header>
              {checkingSession ? (
                <LoadingState label="Comprobando sesión activa..." />
              ) : resetMode ? (
                <form onSubmit={handleReset} className="form-grid">
                  <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="profesional@centro.es" /></label>
                  <button type="submit" className="button-block" disabled={loading}>{loading ? 'Enviando...' : 'Enviar enlace de recuperación'}</button>
                  <button type="button" className="button-secondary" onClick={() => { setResetMode(false); setResetMessage(null); setErrorMessage(null); }}>Volver al acceso</button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="form-grid">
                  <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" placeholder="profesional@centro.es" /></label>
                  <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
                  <button type="submit" className="button-block" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
                  <button type="button" className="button-secondary" onClick={() => { setResetMode(true); setErrorMessage(null); }}>¿Has olvidado tu contraseña?</button>
                </form>
              )}
              {resetMessage ? <Notice tone="success">{resetMessage}</Notice> : null}
              {errorMessage ? <ErrorState title="No se pudo iniciar sesión" message={errorMessage} /> : null}
              <p className="auth-note"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" /></svg>Entorno profesional seguro</p>
            </section>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
