import { useState } from 'react';

import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { useCarmoSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { runResearchExport, type ExportManifest } from '../services/researchExport/bundle';
import { SPANISH_EXCEL_DIALECT, STANDARD_DIALECT } from '../services/researchExport/csv';
import { supabaseDataSource } from '../services/researchExport/reader';

declare const __APP_VERSION__: string;

export function ExportPage() {
  const session = useCarmoSession();
  const [dialect, setDialect] = useState<'standard' | 'spanish'>('standard');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ExportManifest | null>(null);

  const run = async () => {
    if (!supabase || busy) return;
    setBusy(true); setError(null); setManifest(null);
    try {
      const bundle = await runResearchExport(supabaseDataSource(supabase), {
        dialect: dialect === 'standard' ? STANDARD_DIALECT : SPANISH_EXCEL_DIALECT, bom: dialect === 'spanish',
        appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'desconocida', userId: session.userId,
      }, setProgress);
      const url = URL.createObjectURL(new Blob([bundle.zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = bundle.fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setManifest(bundle.manifest);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); setProgress(''); }
  };

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Exportación" title="Exportación para investigación" description="Paquete ZIP verificado: tablas originales, conjuntos de análisis (pacientes, longitudinal pareado, ítems), diccionario, sintaxis SPSS (.sps), Excel, JSON y manifiesto con recuentos y huellas SHA-256." />
      <Notice tone="warning">Datos seudonimizados = datos personales. Descargue solo en equipos autorizados y custodie el fichero conforme al protocolo. Alcance: lo que su rol puede ver (RLS).</Notice>
      <section className="card">
        <div className="carmo-form">
          <label>Formato CSV<select value={dialect} onChange={(e) => setDialect(e.target.value as typeof dialect)}><option value="standard">Estándar (coma, punto decimal) · R, Stata, SPSS</option><option value="spanish">Excel en español (punto y coma, coma decimal)</option></select></label>
          <div><button type="button" className="button-link" disabled={busy} onClick={run}>{busy ? 'Exportando…' : 'Generar y verificar exportación'}</button></div>
        </div>
        {progress ? <p className="carmo-hint" role="status">{progress}</p> : null}
        {error ? <Notice tone="danger" title="Exportación abortada (no se ha entregado ningún fichero)">{error}</Notice> : null}
        {manifest ? (
          <Notice tone="success" title="Exportación verificada y descargada">
            {manifest.scope.patients} pacientes · {manifest.scope.visits} visitas · {manifest.files.length} ficheros. Recuentos BD = exportados en {manifest.source_tables.length} tablas.
            {manifest.integrity.errors + manifest.integrity.to_review > 0 ? ` Incidencias: ${manifest.integrity.errors} errores, ${manifest.integrity.to_review} a revisar (ver analisis/incidencias_integridad.csv).` : ''}
          </Notice>
        ) : null}
        <p className="carmo-hint">SPSS: se entrega CSV + sintaxis .sps (ruta validada con GNU PSPP en el repositorio de referencia). La generación nativa de .sav en el navegador no está implementada (RG-24).</p>
      </section>
    </div>
  );
}
