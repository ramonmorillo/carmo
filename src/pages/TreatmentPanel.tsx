import { FormEvent, useState } from 'react';

import { SaveStatus } from '../components/ui/SaveStatus';
import { StatusBadge } from '../components/ui/StatusBadge';
import { fmtDate, todayIso } from '../lib/format';
import { useSave } from '../lib/useSave';
import { carmoWrite, type Dispensation, type Patient, type Treatment, type TreatmentEvent } from '../services/carmoData';

const STUDY_DRUGS = ['Alirocumab', 'Evolocumab', 'Inclisirán', 'Evinacumab'];
const EVENT_LABELS: Record<string, string> = {
  start: 'Inicio', dose_change: 'Cambio de dosis/pauta', suspension: 'Suspensión', restart: 'Reinicio', end: 'Finalización',
  adverse_reaction: 'Reacción adversa', incident: 'Incidencia',
};
const ROUTE_LABELS: Record<string, string> = { subcutaneous: 'Subcutánea', intravenous: 'Intravenosa', oral: 'Oral', other: 'Otra' };
const STATUS_LABELS: Record<string, string> = { active: 'Activo', suspended: 'Suspendido', finished: 'Finalizado' };

type Props = { patient: Patient; treatments: Treatment[]; events: TreatmentEvent[]; dispensations: Dispensation[]; canWrite: boolean; reload: () => Promise<void> };

export function TreatmentPanel({ patient, treatments, events, dispensations, canWrite, reload }: Props) {
  const save = useSave();
  const [form, setForm] = useState({ active_ingredient: STUDY_DRUGS[0], other: '', presentation: '', dose_amount: '', dose_unit: 'mg', frequency: '', route: 'subcutaneous', start_date: todayIso() });
  const [evt, setEvt] = useState({ treatment_id: '', event_type: 'dose_change', event_date: todayIso(), new_dose_amount: '', new_frequency: '', reason: '', adverse_reaction_description: '' });
  const [disp, setDisp] = useState({ treatment_id: '', dispensed_date: todayIso(), units_dispensed: '', days_supply: '' });
  const sorted = [...treatments].sort((a, b) => Number(b.is_study_lipid_therapy) - Number(a.is_study_lipid_therapy) || a.start_date.localeCompare(b.start_date));

  const addTreatment = (e: FormEvent) => {
    e.preventDefault();
    const ingredient = form.active_ingredient === 'other' ? form.other.trim() : form.active_ingredient;
    void save.run(() => carmoWrite.insert('carmo_treatments', {
      patient_id: patient.id, active_ingredient: ingredient, presentation: form.presentation || null,
      dose_amount: form.dose_amount ? Number(form.dose_amount) : null, dose_unit: form.dose_unit || null, frequency: form.frequency || null,
      route: form.route, start_date: form.start_date,
    }), reload);
  };
  const addEvent = (e: FormEvent) => {
    e.preventDefault();
    void save.run(() => carmoWrite.insert('carmo_treatment_events', {
      treatment_id: evt.treatment_id, patient_id: patient.id, event_type: evt.event_type, event_date: evt.event_date,
      new_dose_amount: evt.new_dose_amount ? Number(evt.new_dose_amount) : null, new_frequency: evt.new_frequency || null,
      reason: evt.reason || null, adverse_reaction_description: evt.adverse_reaction_description || null,
    }), reload);
  };
  const addDispensation = (e: FormEvent) => {
    e.preventDefault();
    void save.run(() => carmoWrite.insert('carmo_dispensations', {
      treatment_id: disp.treatment_id, patient_id: patient.id, dispensed_date: disp.dispensed_date,
      units_dispensed: Number(disp.units_dispensed), days_supply: disp.days_supply ? Number(disp.days_supply) : null,
    }), reload);
  };

  return (
    <section className="card">
      <h2>Tratamiento farmacológico</h2>
      <p className="carmo-hint">Historial longitudinal: los tratamientos no se editan ni se borran; cada cambio es un evento con fecha y motivo.</p>
      {sorted.length === 0 ? <p className="text-muted">Sin tratamientos registrados.</p> : sorted.map((t) => (
        <article key={t.id} className="carmo-section">
          <h3>{t.active_ingredient} {t.is_study_lipid_therapy ? <StatusBadge tone="info">Tratamiento principal</StatusBadge> : <StatusBadge>Concomitante</StatusBadge>} <StatusBadge tone={t.status === 'active' ? 'positive' : 'neutral'}>{STATUS_LABELS[t.status]}</StatusBadge></h3>
          <p className="text-muted">{t.presentation ?? 'Presentación no registrada'} · {t.dose_amount ?? '—'} {t.dose_unit ?? ''} · {t.frequency ?? '—'} · {ROUTE_LABELS[t.route ?? ''] ?? '—'} · inicio {fmtDate(t.start_date)}{t.started_before_inclusion ? ' (previo a la inclusión)' : ''}{t.end_date ? ` · fin ${fmtDate(t.end_date)}` : ''}</p>
          <ul>{events.filter((e) => e.treatment_id === t.id).sort((a, b) => a.event_date.localeCompare(b.event_date)).map((e) => (
            <li key={e.id}>{fmtDate(e.event_date)} · {EVENT_LABELS[e.event_type] ?? e.event_type}{e.new_dose_amount ? ` → ${e.new_dose_amount} ${e.new_dose_unit ?? ''}` : ''}{e.new_frequency ? ` (${e.new_frequency})` : ''}{e.reason ? ` · ${e.reason}` : ''}{e.adverse_reaction_description ? ` · RAM: ${e.adverse_reaction_description}` : ''}</li>
          ))}</ul>
          <p className="carmo-hint">Dispensaciones registradas: {dispensations.filter((d) => d.treatment_id === t.id).length}. La adherencia por dispensación no se calcula hasta definir método, ventana y umbral (RG-20).</p>
        </article>
      ))}
      {canWrite ? (
        <>
          <h3>Añadir tratamiento</h3>
          <form className="carmo-form" onSubmit={addTreatment}>
            <label>Principio activo<select value={form.active_ingredient} onChange={(e) => setForm({ ...form, active_ingredient: e.target.value })}>
              {STUDY_DRUGS.map((d) => <option key={d}>{d}</option>)}<option value="other">Otro (concomitante)…</option></select></label>
            {form.active_ingredient === 'other' ? <label>Principio activo concomitante<input required minLength={2} value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })} /></label> : null}
            <label>Presentación<input value={form.presentation} onChange={(e) => setForm({ ...form, presentation: e.target.value })} /></label>
            <label>Dosis<input type="number" min="0" step="any" value={form.dose_amount} onChange={(e) => setForm({ ...form, dose_amount: e.target.value })} /></label>
            <label>Unidad<input value={form.dose_unit} onChange={(e) => setForm({ ...form, dose_unit: e.target.value })} /></label>
            <label>Posología / frecuencia<input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} /></label>
            <label>Vía<select value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>{Object.entries(ROUTE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Fecha de inicio<input type="date" required max={todayIso()} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
            <div><button className="button-link" type="submit" disabled={save.saving}>Añadir tratamiento</button></div>
          </form>
          {treatments.length > 0 ? (
            <>
              <h3>Registrar cambio o incidencia</h3>
              <form className="carmo-form" onSubmit={addEvent}>
                <label>Tratamiento<select required value={evt.treatment_id} onChange={(e) => setEvt({ ...evt, treatment_id: e.target.value })}><option value="">—</option>{treatments.map((t) => <option key={t.id} value={t.id}>{t.active_ingredient} ({STATUS_LABELS[t.status]})</option>)}</select></label>
                <label>Tipo<select value={evt.event_type} onChange={(e) => setEvt({ ...evt, event_type: e.target.value })}>{Object.entries(EVENT_LABELS).filter(([k]) => k !== 'start').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Fecha<input type="date" required max={todayIso()} value={evt.event_date} onChange={(e) => setEvt({ ...evt, event_date: e.target.value })} /></label>
                {evt.event_type === 'dose_change' ? <>
                  <label>Nueva dosis<input type="number" min="0" step="any" required value={evt.new_dose_amount} onChange={(e) => setEvt({ ...evt, new_dose_amount: e.target.value })} /></label>
                  <label>Nueva frecuencia<input value={evt.new_frequency} onChange={(e) => setEvt({ ...evt, new_frequency: e.target.value })} /></label>
                </> : null}
                {evt.event_type === 'adverse_reaction' ? <label className="span-all">Descripción de la reacción adversa<textarea required value={evt.adverse_reaction_description} onChange={(e) => setEvt({ ...evt, adverse_reaction_description: e.target.value })} /></label> : null}
                <label className="span-all">Motivo{['dose_change', 'suspension', 'restart', 'end'].includes(evt.event_type) ? ' (obligatorio)' : ''}<input value={evt.reason} onChange={(e) => setEvt({ ...evt, reason: e.target.value })} /></label>
                <div><button className="button-secondary" type="submit" disabled={save.saving}>Registrar evento</button></div>
              </form>
              <h3>Registrar dispensación</h3>
              <form className="carmo-form" onSubmit={addDispensation}>
                <label>Tratamiento<select required value={disp.treatment_id} onChange={(e) => setDisp({ ...disp, treatment_id: e.target.value })}><option value="">—</option>{treatments.map((t) => <option key={t.id} value={t.id}>{t.active_ingredient}</option>)}</select></label>
                <label>Fecha<input type="date" required max={todayIso()} value={disp.dispensed_date} onChange={(e) => setDisp({ ...disp, dispensed_date: e.target.value })} /></label>
                <label>Unidades dispensadas<input type="number" min="0" step="any" required value={disp.units_dispensed} onChange={(e) => setDisp({ ...disp, units_dispensed: e.target.value })} /></label>
                <label>Días de cobertura<input type="number" min="1" value={disp.days_supply} onChange={(e) => setDisp({ ...disp, days_supply: e.target.value })} /></label>
                <div><button className="button-secondary" type="submit" disabled={save.saving}>Registrar dispensación</button></div>
              </form>
            </>
          ) : null}
        </>
      ) : null}
      <SaveStatus state={save.state} />
    </section>
  );
}
