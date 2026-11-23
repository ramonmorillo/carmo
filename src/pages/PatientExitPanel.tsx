import { useState } from 'react';

import { Notice } from '../components/ui/Notice';
import { SaveStatus } from '../components/ui/SaveStatus';
import { PATIENT_REMOVAL_REASONS, STATUS_REASON_LABELS } from '../domain/study';
import { useSave } from '../lib/useSave';
import { carmoWrite, type Patient } from '../services/carmoData';

type Props = { patient: Patient; reload: () => Promise<void> };

/**
 * Cierre del seguimiento, salida anticipada y BAJA del paciente incluido por error o inelegible.
 *  · Baja ≠ retirada del consentimiento: la baja es una decisión del equipo sobre la inclusión (se registra en el
 *    estado del paciente, con motivo y detalle obligatorios); la retirada del consentimiento es la decisión del
 *    participante y se registra en «Consentimiento informado».
 *  · Nada se borra: el expediente, las visitas, las intervenciones y los cuestionarios se conservan.
 */
export function PatientExitPanel({ patient, reload }: Props) {
  const save = useSave();
  const [exit, setExit] = useState<'withdrawn' | 'lost_to_followup'>('withdrawn');
  const [reason, setReason] = useState('investigator_decision');
  const [removal, setRemoval] = useState({ reason: 'included_in_error', detail: '', confirm: false });

  return (
    <section className="card" aria-label="Cierre del seguimiento y salida del estudio">
      <h2>Cierre del seguimiento, salida y baja del paciente</h2>
      <p className="carmo-hint">Diferencia entre cierre de visita (en cada visita), cierre del seguimiento (tras la visita final realizada), salida anticipada (pérdida o retirada) y baja del paciente (incluido por error o inelegible). Los datos recogidos se conservan en todos los casos.</p>
      <div className="carmo-actions">
        <button type="button" className="button-link" disabled={save.saving} onClick={() => void save.run(() => carmoWrite.update('carmo_patients', { status: 'completed' }, { id: patient.id }), reload)}>Cerrar seguimiento (visita final realizada)</button>
      </div>

      <h3>Salida anticipada del estudio</h3>
      <div className="carmo-form">
        <label>Salida<select value={exit} onChange={(e) => setExit(e.target.value as typeof exit)}><option value="withdrawn">Retirada (decisión del equipo, traslado, fallecimiento…)</option><option value="lost_to_followup">Pérdida de seguimiento</option></select></label>
        <label>Motivo<select value={reason} onChange={(e) => setReason(e.target.value)}>{(['investigator_decision', 'transfer', 'death', 'other'] as const).map((k) => <option key={k} value={k}>{STATUS_REASON_LABELS[k]}</option>)}</select></label>
        <div><button type="button" className="button-secondary" disabled={save.saving} onClick={() => void save.run(() => carmoWrite.update('carmo_patients', { status: exit, status_reason: reason }, { id: patient.id }), reload)}>Registrar salida</button></div>
      </div>
      <p className="carmo-hint">La retirada del consentimiento por el participante no se registra aquí: use «Retirar consentimiento» en el panel de consentimiento informado.</p>

      <h3>Baja del paciente (incluido por error o inelegible)</h3>
      <Notice tone="warning">
        Úsela solo si el paciente no debió incluirse (error de registro) o si después se comprueba que no cumple los criterios de selección. El paciente pasa a estado
        «Baja del paciente», conserva su código y su expediente (visitas, intervenciones, cuestionarios) y no admite nuevas visitas. No es la retirada del consentimiento. Desde la aplicación no se revierte.
      </Notice>
      <form className="carmo-form" aria-label="Baja del paciente" onSubmit={(e) => {
        e.preventDefault();
        void save.run(() => carmoWrite.update('carmo_patients', { status: 'withdrawn', status_reason: removal.reason, status_reason_detail: removal.detail.trim() }, { id: patient.id }), reload);
      }}>
        <label>Motivo de la baja<select value={removal.reason} onChange={(e) => setRemoval({ ...removal, reason: e.target.value })}>{PATIENT_REMOVAL_REASONS.map((k) => <option key={k} value={k}>{STATUS_REASON_LABELS[k]}</option>)}</select></label>
        <label className="span-all">Motivo detallado (obligatorio, mínimo 5 caracteres; sin datos identificativos)<textarea required minLength={5} maxLength={300} value={removal.detail} onChange={(e) => setRemoval({ ...removal, detail: e.target.value })} /></label>
        <label className="span-all"><span><input type="checkbox" checked={removal.confirm} onChange={(e) => setRemoval({ ...removal, confirm: e.target.checked })} /> Confirmo la baja de este paciente del estudio.</span></label>
        <div><button type="submit" className="button-secondary" disabled={save.saving || !removal.confirm || removal.detail.trim().length < 5}>Dar de baja al paciente</button></div>
      </form>
      <SaveStatus state={save.state} />
    </section>
  );
}
