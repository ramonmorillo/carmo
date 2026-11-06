// Agenda con la misma organización que DERMAPEX: filtros en la URL, calendario mensual con recuento por
// día, panel del día con alta de citas y listado de seguimiento imprimible. Las visitas del protocolo
// (inicial, S12, S24, S36, final) reciben su fecha prevista del calendario versionado; desde aquí se crean
// contactos extraordinarios en el día elegido y se programan las visitas del protocolo que falten.
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  AGENDA_STATUS_LABELS, AGENDA_STATUS_TONES, STATUS_ORDER, addDays, agendaDate, buildMonthGrid, dayTone, filterAgendaVisits, formatLongDate,
  formatMonthLabel, getAgendaStatus, groupByDate, monthKey, shiftMonth, summarizeAgenda, toIsoDate, type AgendaStatus, type AgendaVisit,
} from '../domain/agenda';
import { WINDOW_STATUS_LABELS, type WindowStatus } from '../domain/schedule';
import { PROGRAMMED_VISITS, RECORD_STATE_LABELS, ROLE_CAN, VISIT_LABELS, patientCode } from '../domain/study';
import { fmtDate, label } from '../lib/format';
import { useCarmoSession } from '../lib/session';
import { carmo, carmoWrite, type Patient, type VisitWindow } from '../services/carmoData';

const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
type Period = 'month' | 'all';

function parseStatuses(raw: string | null): AgendaStatus[] {
  return raw ? raw.split(',').filter((s): s is AgendaStatus => (STATUS_ORDER as string[]).includes(s)) : [];
}

export function AgendaPage() {
  const session = useCarmoSession();
  const today = toIsoDate(new Date());
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? (params.get('month') as string) : monthKey(today);
  const patientFilter = params.get('patient') || null;
  const period: Period = params.get('period') === 'all' ? 'all' : 'month';
  const statusParam = params.get('status');
  const statuses = useMemo(() => parseStatuses(statusParam), [statusParam]);

  const [visits, setVisits] = useState<AgendaVisit[] | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [windows, setWindows] = useState<VisitWindow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [newPatientId, setNewPatientId] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const canWrite = ROLE_CAN.writeClinical(session.role);

  const load = useCallback(async () => {
    try {
      const [vs, ps, ws] = await Promise.all([carmo.visits(), carmo.patients(), carmo.windows()]);
      const codeOf = new Map(ps.map((p) => [p.id, patientCode(p)]));
      setVisits(vs.map((v) => ({ id: v.id, patient_id: v.patient_id, code: codeOf.get(v.patient_id) ?? '—', visit_code: v.visit_code, planned_date: v.planned_date, actual_date: v.actual_date, status: v.status, record_state: v.record_state })));
      setPatients([...ps].sort((a, b) => patientCode(a).localeCompare(patientCode(b))));
      setWindows(ws);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (patientFilter) setNewPatientId(patientFilter); }, [patientFilter]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };
  const calendarVisits = useMemo(() => filterAgendaVisits(visits ?? [], { month: null, patientId: patientFilter, statuses }, today), [visits, patientFilter, statuses, today]);
  const byDate = useMemo(() => groupByDate(calendarVisits), [calendarVisits]);
  const grid = useMemo(() => buildMonthGrid(month), [month]);

  if (error) return <ErrorState title="No se pudo cargar la agenda" message={error} />;
  if (!visits) return <LoadingState label="Cargando agenda…" />;

  const dayVisits = byDate.get(selectedDate) ?? [];
  const listVisits = calendarVisits.filter((v) => period === 'all' || monthKey(agendaDate(v) ?? '') === month);
  const summary = summarizeAgenda(listVisits, today);
  const undated = period === 'all' ? listVisits.filter((v) => !agendaDate(v)).length : 0;
  const included = patients.filter((p) => p.status === 'included');
  const patientLabel = patientFilter ? (patients.find((p) => p.id === patientFilter) ? patientCode(patients.find((p) => p.id === patientFilter)!) : 'Paciente') : 'Todos los pacientes';
  const win = (id: string) => windows.find((w) => w.visit_id === id);
  const newPatientMissing = newPatientId
    ? PROGRAMMED_VISITS.filter((c) => !visits.some((v) => v.patient_id === newPatientId && v.visit_code === c && v.status !== 'cancelled'))
    : [];

  const selectDate = (iso: string) => { setSelectedDate(iso); setMessage(null); if (monthKey(iso) !== month) update({ month: monthKey(iso) }); };
  const toggleStatus = (s: AgendaStatus) => {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    update({ status: next.length ? STATUS_ORDER.filter((x) => next.includes(x)).join(',') : null });
  };
  const run = async (op: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setCreating(true); setMessage(null);
    const { error: err } = await op();
    setCreating(false);
    if (err) { setMessage({ tone: 'danger', text: err.message }); return; }
    setMessage({ tone: 'success', text: ok });
    await load();
  };
  const createExtra = (e: FormEvent) => {
    e.preventDefault();
    if (!newPatientId) return;
    const code = patientCode(patients.find((p) => p.id === newPatientId)!);
    void run(() => carmoWrite.insert('carmo_visits', { patient_id: newPatientId, visit_code: 'EXTRA', status: 'planned', planned_date: selectedDate }),
      `Contacto extraordinario creado: ${code} · ${fmtDate(selectedDate)}.`);
  };
  const scheduleProtocol = () => {
    const code = patientCode(patients.find((p) => p.id === newPatientId)!);
    void run(() => carmoWrite.insert('carmo_visits', newPatientMissing.map((c) => ({ patient_id: newPatientId, visit_code: c }))),
      `Visitas del protocolo programadas para ${code}: ${newPatientMissing.map((c) => VISIT_LABELS[c]).join(', ')} (fechas del calendario del estudio).`);
  };

  return (
    <div className="page-stack agenda-page">
      <PageHeader eyebrow="CARMO · Agenda" title="Agenda"
        description="Visitas previstas y realizadas por día. Las visitas del protocolo toman su fecha del calendario del estudio; las citas nuevas se crean como contactos extraordinarios."
        actions={<button type="button" className="button-secondary no-print" onClick={() => window.print()}>Imprimir listado</button>} />

      <section className="card agenda-filters no-print" aria-label="Filtros de la agenda">
        <div className="agenda-filter-row">
          <label>Paciente
            <select value={patientFilter ?? ''} onChange={(e) => update({ patient: e.target.value || null })}>
              <option value="">Todos los pacientes</option>
              {patients.filter((p) => p.study_code).map((p) => <option key={p.id} value={p.id}>{patientCode(p)}</option>)}
            </select>
          </label>
          <label>Periodo del listado
            <select value={period} onChange={(e) => update({ period: e.target.value === 'all' ? 'all' : null })}>
              <option value="month">Mes visible ({formatMonthLabel(month)})</option>
              <option value="all">Todo el seguimiento</option>
            </select>
          </label>
          <fieldset className="agenda-status-filter"><legend>Estado</legend>
            {STATUS_ORDER.map((s) => <label key={s} className="agenda-check"><input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />{AGENDA_STATUS_LABELS[s]}</label>)}
          </fieldset>
          {patientFilter || statuses.length || period === 'all' ? <button type="button" className="button-ghost" onClick={() => update({ patient: null, status: null, period: null })}>Limpiar filtros</button> : null}
        </div>
      </section>

      <div className="agenda-layout no-print">
        <section className="card agenda-calendar" aria-label="Calendario mensual">
          <div className="agenda-calendar-head">
            <button type="button" className="button-ghost agenda-nav" aria-label="Mes anterior" onClick={() => update({ month: shiftMonth(month, -1) })}>‹</button>
            <h2>{formatMonthLabel(month)}</h2>
            <button type="button" className="button-ghost agenda-nav" aria-label="Mes siguiente" onClick={() => update({ month: shiftMonth(month, 1) })}>›</button>
          </div>
          <div className="agenda-grid" role="grid">
            {WEEKDAY_HEADERS.map((d) => <span key={d} className="agenda-weekday" role="columnheader">{d}</span>)}
            {grid.map((day) => {
              const entries = byDate.get(day.iso) ?? [];
              const tone = entries.length ? dayTone(entries.map((v) => getAgendaStatus(v, today))) : null;
              const cls = ['agenda-day', day.inMonth ? '' : 'is-outside', day.iso === today ? 'is-today' : '', day.iso === selectedDate ? 'is-selected' : ''].filter(Boolean).join(' ');
              return (
                <button key={day.iso} type="button" className={cls} onClick={() => selectDate(day.iso)} aria-pressed={day.iso === selectedDate}
                  aria-label={`${formatLongDate(day.iso)}${entries.length ? `, ${entries.length} ${entries.length === 1 ? 'visita' : 'visitas'}` : ''}`}>
                  {Number(day.iso.slice(8, 10))}
                  {tone ? <span className={`agenda-count agenda-count-${tone}`}>{entries.length}</span> : null}
                </button>
              );
            })}
          </div>
          <ul className="agenda-legend" aria-label="Leyenda">
            {STATUS_ORDER.map((s) => <li key={s}><span className={`agenda-legend-dot agenda-count-${s}`} aria-hidden="true" />{AGENDA_STATUS_LABELS[s]}</li>)}
          </ul>
        </section>

        <section className="card agenda-day-panel" aria-label="Visitas del día">
          <div className="agenda-day-head">
            <button type="button" className="button-ghost agenda-nav" aria-label="Día anterior" onClick={() => selectDate(addDays(selectedDate, -1))}>‹</button>
            <button type="button" className="button-secondary" onClick={() => selectDate(today)}>Hoy</button>
            <button type="button" className="button-ghost agenda-nav" aria-label="Día siguiente" onClick={() => selectDate(addDays(selectedDate, 1))}>›</button>
            <h2>{formatLongDate(selectedDate)}</h2>
          </div>
          {dayVisits.length === 0 ? <p className="help-text">No hay visitas este día{patientFilter || statuses.length ? ' con los filtros aplicados' : ''}.</p> : (
            <ul className="agenda-day-list">
              {dayVisits.map((v) => {
                const s = getAgendaStatus(v, today);
                return (
                  <li key={v.id}>
                    <div><Link to={`/patients/${v.patient_id}`} className="agenda-day-code">{v.code}</Link><span className="cell-muted"> · {label(VISIT_LABELS, v.visit_code)}</span></div>
                    <div className="agenda-day-actions"><StatusBadge tone={AGENDA_STATUS_TONES[s]} dot>{AGENDA_STATUS_LABELS[s]}</StatusBadge><Link to={`/visits/${v.id}`}>Abrir visita</Link></div>
                  </li>
                );
              })}
            </ul>
          )}
          {canWrite ? (
            <form className="agenda-create" onSubmit={createExtra}>
              <h3>Crear cita para este día</h3>
              <div className="agenda-create-row">
                <label><span className="visually-hidden">Paciente</span>
                  <select value={newPatientId} onChange={(e) => { setNewPatientId(e.target.value); setMessage(null); }}>
                    <option value="">Seleccionar paciente incluido</option>
                    {included.map((p) => <option key={p.id} value={p.id}>{patientCode(p)}</option>)}
                  </select>
                </label>
                <span className="cell-muted">Contacto extraordinario</span>
                <button type="submit" disabled={!newPatientId || creating}>{creating ? 'Creando…' : 'Crear cita'}</button>
              </div>
              {newPatientId && newPatientMissing.length > 0 ? (
                <Notice tone="info">
                  A este paciente le faltan visitas del protocolo ({newPatientMissing.map((c) => VISIT_LABELS[c]).join(', ')}).{' '}
                  <button type="button" className="button-ghost button-sm" disabled={creating} onClick={scheduleProtocol}>Programarlas con las fechas del calendario</button>
                </Notice>
              ) : null}
              {newPatientId && selectedDate < today ? <p className="help-text">La fecha elegida es anterior a hoy: la cita figurará como vencida hasta registrar su realización.</p> : null}
              {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            </form>
          ) : null}
        </section>
      </div>

      <section className="card agenda-print-area" aria-label="Listado de seguimiento">
        <div className="print-only agenda-print-header"><strong>CARMO · Listado de seguimiento</strong><span>Impreso el {fmtDate(today)}</span></div>
        <div className="section-heading">
          <div>
            <h2>Listado de seguimiento</h2>
            <p className="section-description">{patientLabel} · {period === 'all' ? 'Todo el seguimiento' : formatMonthLabel(month)} · {statuses.length ? statuses.map((s) => AGENDA_STATUS_LABELS[s]).join(', ') : 'Todos los estados'}</p>
          </div>
          <div className="agenda-summary">
            <span><strong>{summary.total}</strong> visitas</span>
            {STATUS_ORDER.map((s) => <StatusBadge key={s} tone={AGENDA_STATUS_TONES[s]}>{AGENDA_STATUS_LABELS[s]}: {summary[s]}</StatusBadge>)}
          </div>
        </div>
        {listVisits.length === 0 ? <p className="help-text">No hay visitas con los filtros aplicados.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Fecha agenda</th><th>Paciente</th><th>Visita</th><th>Estado</th><th>Prevista</th><th>Ventana</th><th>Realizada</th><th>Registro</th><th className="no-print"><span className="visually-hidden">Acciones</span></th></tr></thead>
            <tbody>{listVisits.map((v) => {
              const s = getAgendaStatus(v, today);
              const w = win(v.id);
              return (
                <tr key={v.id}>
                  <td className="numeric">{agendaDate(v) ? fmtDate(agendaDate(v)) : 'Sin fecha'}</td>
                  <td className="strong">{v.code}</td>
                  <td>{label(VISIT_LABELS, v.visit_code)}</td>
                  <td><StatusBadge tone={AGENDA_STATUS_TONES[s]}>{AGENDA_STATUS_LABELS[s]}</StatusBadge></td>
                  <td className="numeric">{fmtDate(v.planned_date)}</td>
                  <td className="numeric">{w?.window_start && w.window_end ? `${fmtDate(w.window_start)} – ${fmtDate(w.window_end)}` : w ? WINDOW_STATUS_LABELS[w.window_status as WindowStatus] ?? '—' : '—'}</td>
                  <td className="numeric">{fmtDate(v.actual_date)}</td>
                  <td>{label(RECORD_STATE_LABELS, v.record_state)}</td>
                  <td className="no-print"><Link to={`/visits/${v.id}`}>Abrir</Link></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {undated > 0 ? <p className="help-text">{undated} {undated === 1 ? 'visita sin fecha' : 'visitas sin fecha'}: no aparecen en el calendario.</p> : null}
        <p className="help-text">«Prevista vencida»: visita prevista sin realizar cuya fecha prevista es anterior a hoy. Fecha agenda = fecha realizada o, si no consta, la prevista. Ventana = margen del calendario del protocolo.</p>
      </section>
    </div>
  );
}
