// «Lo necesario en esta visita» (organización por visita inspirada en IRIS). Para cada visita calcula qué
// bloques exige el protocolo v3.0 (esquema de procedimientos), el modelo CMO y el registro de medicación,
// y en qué estado está cada uno. Lógica pura: la usan la ficha de visita (lista de comprobación y
// pestañas) y la ficha del paciente (tabla longitudinal). No sustituye a las reglas de la BD.
import { currentObservations } from './observations';
import { expectedVariables } from './pending';

export type SectionKey = 'datos' | 'variables' | 'medicacion' | 'cmo' | 'intervenciones' | 'cuestionarios' | 'evolucion' | 'cierre';
export type ReqStatus = 'done' | 'pending' | 'recommended' | 'optional' | 'not_applicable';
export type Requirement = { key: SectionKey; label: string; status: ReqStatus; detail: string };

export const SECTION_LABELS: Record<SectionKey, string> = {
  datos: 'Datos de la visita', variables: 'Variables clínicas', medicacion: 'Medicación', cmo: 'Estratificación CMO',
  intervenciones: 'Intervenciones', cuestionarios: 'Cuestionarios', evolucion: 'Evolución', cierre: 'Revisión y cierre',
};
export const SECTION_ORDER: SectionKey[] = ['datos', 'variables', 'medicacion', 'cmo', 'intervenciones', 'cuestionarios', 'evolucion', 'cierre'];

export const REQ_STATUS_LABELS: Record<ReqStatus, string> = {
  done: 'Completo', pending: 'Pendiente', recommended: 'Recomendado', optional: 'Opcional', not_applicable: 'No procede',
};

type Visit = { id: string; visit_code: string; status: string; actual_date: string | null; planned_date: string | null; modality: string | null; responsible_id: string | null; record_state: string };
type Variable = { code: string; label: string; section: string; allowed_visits: string[]; status: string };
type Obs = { id: string; supersedes_id: string | null; visit_id: string | null; variable_code: string; value_boolean: boolean | null; is_missing: boolean };
type Admin = { visit_id: string; instrument_code: string; status: string; scores: { valid?: boolean; complete?: boolean } | null };
type Instrument = { code: string; status: string; allowed_visits: string[] };
type Strat = { id: string; visit_id: string; supersedes_id: string | null; validation_status: string; calculated_priority: number; final_priority: number | null; total_score: number | null; calculated_at: string; validated_at: string | null };
type Review = { visit_id: string; outcome: string };
type FollowUp = Record<string, { restratifyMonths: number | null }>;

export type VisitContext = {
  variables: Variable[]; observations: Obs[]; administrations: Admin[]; instruments: Instrument[]; stratifications: Strat[];
  interventionCount: number; review: Review | null; followUp: FollowUp | null; today: string;
};

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

/** Estratificación vigente en una fecha: la última no sustituida calculada hasta ese día. */
export function stratAt<T extends Strat>(strats: T[], date: string): T | null {
  return strats
    .filter((s) => !strats.some((n) => n.supersedes_id === s.id) && s.calculated_at.slice(0, 10) <= date)
    .sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))[0] ?? null;
}

export function visitRequirements(visit: Visit, ctx: VisitContext): Requirement[] {
  const req: Requirement[] = [];
  const done = visit.status === 'done';
  const cancelled = visit.status === 'cancelled' || visit.status === 'not_done';
  const extra = visit.visit_code === 'EXTRA';
  const na = (key: SectionKey, detail: string) => req.push({ key, label: SECTION_LABELS[key], status: 'not_applicable', detail });

  // 1. Datos de la visita
  const missingData = [!done && !cancelled ? 'estado «realizada»' : null, done && !visit.actual_date ? 'fecha efectiva' : null,
    done && !visit.modality ? 'modalidad' : null, !visit.responsible_id ? 'profesional responsable' : null].filter(Boolean) as string[];
  req.push({ key: 'datos', label: SECTION_LABELS.datos, status: cancelled || missingData.length === 0 ? 'done' : 'pending',
    detail: cancelled ? 'Visita no realizada o anulada (con motivo).' : missingData.length ? `Falta: ${missingData.join(', ')}.` : 'Estado, fecha, modalidad y responsable registrados.' });

  if (cancelled) {
    for (const k of ['variables', 'medicacion', 'cmo', 'intervenciones', 'cuestionarios', 'evolucion'] as SectionKey[]) na(k, 'La visita no se ha realizado.');
  } else {
    // 2. Variables clínicas (esquema de procedimientos del protocolo)
    const current = currentObservations(ctx.observations).filter((o) => o.visit_id === visit.id);
    const tobacco = current.find((o) => o.variable_code === 'tobacco_use' && !o.is_missing)?.value_boolean ?? null;
    const expected = expectedVariables(ctx.variables, visit.visit_code, tobacco);
    const recorded = new Set(current.map((o) => o.variable_code));
    const missing = expected.filter((v) => !recorded.has(v.code));
    if (expected.length === 0) na('variables', 'El protocolo no prevé variables en esta visita.');
    else req.push({ key: 'variables', label: SECTION_LABELS.variables, status: missing.length === 0 ? 'done' : 'pending',
      detail: missing.length === 0 ? `${expected.length}/${expected.length} registradas (valor o motivo de ausencia).` : `${expected.length - missing.length}/${expected.length} registradas. Faltan: ${missing.map((m) => m.label).join(', ')}.` });

    // 3. Medicación: revisión en cada visita programada (en contactos extraordinarios, si hubo cambios)
    req.push({ key: 'medicacion', label: SECTION_LABELS.medicacion,
      status: ctx.review ? 'done' : extra ? 'optional' : 'pending',
      detail: ctx.review ? `Revisión registrada (${ctx.review.outcome === 'no_changes' ? 'sin cambios' : ctx.review.outcome === 'no_medication' ? 'sin medicación' : 'con cambios'}).` : 'Revisar la medicación activa y registrar la revisión (seleccionando los medicamentos en CIMA).' });

    // 4. Estratificación CMO
    const own = ctx.stratifications.filter((s) => s.visit_id === visit.id && !ctx.stratifications.some((n) => n.supersedes_id === s.id));
    const ownLast = own.sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))[0];
    if (ownLast) {
      req.push({ key: 'cmo', label: SECTION_LABELS.cmo, status: ownLast.validation_status === 'pending' ? 'pending' : 'done',
        detail: `${ownLast.total_score ?? '—'} puntos · Prioridad ${ownLast.final_priority ?? ownLast.calculated_priority}${ownLast.validation_status === 'pending' ? ' · pendiente de validación profesional' : ' · validada'}.` });
    } else if (visit.visit_code === 'BASAL') {
      req.push({ key: 'cmo', label: SECTION_LABELS.cmo, status: 'pending', detail: 'El protocolo exige la estratificación CMO en la visita inicial.' });
    } else {
      const ref = visit.actual_date ?? visit.planned_date ?? ctx.today;
      const prev = stratAt(ctx.stratifications, ref);
      if (!prev) req.push({ key: 'cmo', label: SECTION_LABELS.cmo, status: 'pending', detail: 'El paciente no tiene estratificación previa.' });
      else {
        const p = prev.final_priority ?? prev.calculated_priority;
        const months = ctx.followUp?.[String(p)]?.restratifyMonths ?? null;
        const due = months ? addMonthsIso(prev.validated_at ?? prev.calculated_at, months) : null;
        if (due && due <= ref) req.push({ key: 'cmo', label: SECTION_LABELS.cmo, status: 'pending', detail: `Reestratificación vencida (Prioridad ${p}: cada ${months} meses; vencía el ${due}).` });
        else req.push({ key: 'cmo', label: SECTION_LABELS.cmo, status: 'not_applicable', detail: `Vigente: Prioridad ${p}${due ? `, reestratificar antes del ${due}` : ''}. Puede reestratificarse si cambia la situación clínica.` });
      }
    }

    // 5. Intervenciones (actuaciones del catálogo según la prioridad)
    req.push({ key: 'intervenciones', label: SECTION_LABELS.intervenciones,
      status: ctx.interventionCount > 0 ? 'done' : done ? 'recommended' : 'optional',
      detail: ctx.interventionCount > 0 ? `${ctx.interventionCount} registrada(s) en esta visita.` : 'Registrar las actuaciones realizadas según la prioridad CMO (catálogo del modelo).' });

    // 6. Cuestionarios del protocolo en esta visita
    const applicable = ctx.instruments.filter((i) => i.status === 'active' && i.allowed_visits.includes(visit.visit_code));
    if (applicable.length === 0) na('cuestionarios', 'El protocolo no prevé cuestionarios en esta visita.');
    else {
      const state = applicable.map((i) => {
        const a = ctx.administrations.find((x) => x.visit_id === visit.id && x.instrument_code === i.code);
        const ok = a && ((a.status === 'completed' && a.scores?.valid !== false) || a.status === 'not_done');
        return { code: i.code, ok: Boolean(ok), draft: a?.status === 'in_progress' };
      });
      const pend = state.filter((s) => !s.ok);
      req.push({ key: 'cuestionarios', label: SECTION_LABELS.cuestionarios, status: pend.length === 0 ? 'done' : 'pending',
        detail: pend.length === 0 ? `${applicable.length}/${applicable.length} completados.` : `Pendientes: ${pend.map((s) => `${s.code}${s.draft ? ' (borrador)' : ''}`).join(', ')}.` });
    }

    // 7. Evolución (texto libre opcional)
    req.push({ key: 'evolucion', label: SECTION_LABELS.evolucion, status: 'optional', detail: 'Notas de evolución y seguimiento farmacéutico (opcional).' });
  }

  // 8. Revisión y cierre
  req.push({ key: 'cierre', label: SECTION_LABELS.cierre, status: visit.record_state === 'closed' ? 'done' : 'pending',
    detail: visit.record_state === 'closed' ? 'Visita cerrada: datos bloqueados.' : visit.record_state === 'reviewed' ? 'Revisada; pendiente de cierre por el IP o la coordinación.' : 'Pendiente de revisión y cierre.' });
  return req;
}

/** Requisitos obligatorios aún pendientes antes de cerrar (sin contar el propio cierre). */
export function blockingBeforeClose(reqs: Requirement[]): Requirement[] {
  return reqs.filter((r) => r.status === 'pending' && r.key !== 'cierre');
}

/** Resumen x/y de bloques obligatorios completos (para la tabla longitudinal). */
export function completeness(reqs: Requirement[]): { done: number; required: number } {
  const required = reqs.filter((r) => r.status === 'done' || r.status === 'pending');
  return { done: required.filter((r) => r.status === 'done').length, required: required.length };
}
