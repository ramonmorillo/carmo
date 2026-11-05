import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { PROJECT_INSTITUTIONAL_REFERENCE as R } from '../constants/institutional';

declare const __APP_VERSION__: string;

export function ProjectPage() {
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Proyecto" title="CARMO" description={R.projectTitle} />
      <section className="card">
        <dl className="carmo-dl">
          <dt>Código</dt><dd>{R.protocolCode}</dd>
          <dt>Promotor</dt><dd>{R.sponsor}</dd>
          <dt>Protocolo</dt><dd>{R.protocolVersion}</dd>
          <dt>Comité de ética</dt><dd>{R.ethicsDecision} · {R.ethicsCommittee} · registro {R.ethicsApprovalCode} · reunión 24/07/2025</dd>
          <dt>Consentimiento</dt><dd>{R.informedConsentVersion}</dd>
          <dt>Nota documental</dt><dd>{R.approvedDocumentVersionNote}</dd>
          <dt>Coordinación científica de la herramienta</dt><dd>{R.toolScientificCoordination}</dd>
          <dt>Diseño</dt><dd>Observacional prospectivo multicéntrico, antes-después, 12 meses de seguimiento. Tamaño muestral objetivo: 135 (122 + 10 % de pérdidas). Poblaciones: por intención de tratar y por protocolo; casos completos sin imputación.</dd>
          <dt>Versión de la herramienta</dt><dd>{typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '—'}</dd>
        </dl>
      </section>
      <Notice tone="warning" title="Estado regulatorio">
        El protocolo prevé REDCap como CRDe. El dictamen aprueba la v2.0 con dos centros. El uso de CARMO como eCRD, los centros y la coordinación de la v3.0 y el cambio de coordinación están pendientes de validación con el promotor y el CEIm-G. El dictamen favorable no ampara automáticamente estos cambios.
      </Notice>
      <section className="card"><h2>Privacidad</h2>
        <p>CARMO solo almacena datos seudonimizados (código de paciente del protocolo: centro de 3 cifras + 2 cifras de inclusión). Nombre, NHC, DNI, teléfono, dirección y fecha de nacimiento no tienen cabida en el sistema. La correspondencia código-paciente se custodia en el registro de selección de cada centro (anexo 3 del protocolo: NHC, nombre, fecha de nacimiento y código), bajo custodia del IP. Los datos seudonimizados siguen siendo datos personales (RGPD).</p>
      </section>
      <section className="card"><h2>Limitaciones y uso profesional</h2>
        <ul>
          <li>Herramienta de investigación en fase de validación; no es un producto sanitario ni sustituye el juicio clínico.</li>
          <li>Estratificación con el modelo CMO cardiovascular de MAPEX-SEFH (CMO-CV-SEFH-2024): sujeta a validación profesional en cada paciente; el guardado se activa cuando la coordinación valida el modelo.</li>
          <li>EQ-5D, EVASAF y Morisky-Green pendientes de versión, licencia y reglas de puntuación.</li>
          <li>Los indicadores del panel son descriptivos y no constituyen el análisis estadístico final.</li>
        </ul>
      </section>
    </div>
  );
}
