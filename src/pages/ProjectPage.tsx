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
          <dt>Comité de ética</dt><dd>{R.ethicsDecision} · {R.ethicsCommittee} · registro {R.ethicsApprovalCode}</dd>
          <dt>Nota documental</dt><dd>{R.approvedDocumentVersionNote}</dd>
          <dt>Coordinación científica de la herramienta</dt><dd>{R.toolScientificCoordination}</dd>
          <dt>Diseño</dt><dd>Observacional prospectivo multicéntrico, antes-después, 12 meses de seguimiento. Tamaño muestral objetivo: 135.</dd>
          <dt>Versión de la herramienta</dt><dd>{typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '—'}</dd>
        </dl>
      </section>
      <Notice tone="warning" title="Estado regulatorio">
        El protocolo prevé REDCap como cuaderno de recogida de datos. El uso de CARMO como eCRD, el cambio de la coordinación y la conciliación de versiones documentales están pendientes de validación con el promotor y el CEIm. El dictamen favorable no ampara automáticamente estos cambios.
      </Notice>
      <section className="card"><h2>Privacidad</h2>
        <p>CARMO solo almacena datos seudonimizados (código CARMO-NN-NNNN). Nombre, NHC, DNI, teléfono, dirección y fecha de nacimiento no tienen cabida en el sistema. La correspondencia código-paciente se custodia en el registro de selección de cada centro. Los datos seudonimizados siguen siendo datos personales (RGPD).</p>
      </section>
      <section className="card"><h2>Limitaciones y uso profesional</h2>
        <ul>
          <li>Herramienta de investigación en fase de validación; no es un producto sanitario ni sustituye el juicio clínico.</li>
          <li>Estratificación CMO cardiovascular desactivada hasta disponer del modelo oficial validado.</li>
          <li>EQ-5D, EVASAF y Morisky-Green pendientes de versión, licencia y reglas de puntuación.</li>
          <li>Los indicadores del panel son descriptivos y no constituyen el análisis estadístico final.</li>
        </ul>
      </section>
    </div>
  );
}
