-- CARMO · 10 · Bloqueo del cierre de visita con bloques obligatorios pendientes.
--
-- Decisión del IP (06/11/2026): una visita no se cierra si falta algo de lo necesario. Las reglas son las
-- mismas que la lista «Lo necesario en esta visita» de la aplicación (src/domain/visitRequirements.ts):
--   · datos: realizada con fecha efectiva, modalidad y responsable (no realizada / anulada: nada más);
--   · variables del esquema de procedimientos (valor o motivo de ausencia), salvo eventos CV y condicionales
--     de tabaco no aplicables;
--   · revisión de la medicación (salvo contactos extraordinarios);
--   · estratificación CMO: obligatoria en la visita inicial y cuando la reestratificación ha vencido; si
--     existe en la visita, debe estar validada. Sin modelo validado, no se exige (no se podría cumplir);
--   · cuestionarios activos previstos en la visita: completados con resultado o «no realizado» con motivo.
-- Las intervenciones (recomendadas) y la evolución (opcional) no bloquean.
--
-- Además corrige la revisión de medicación (migración 09): cada modificación exige un motivo NUEVO; antes
-- el motivo de la corrección anterior se arrastraba y permitía modificar sin justificar.
--
-- No destructiva: trigger nuevo que solo actúa al pasar a «cerrada». No afecta a visitas ya cerradas
-- (si se reabren, para volver a cerrarlas deberán estar completas). Revisar sigue permitido.

create or replace function carmo_private.visit_close_blockers(
  p_visit_id uuid, p_visit_code text, p_status text, p_actual_date date, p_planned_date date, p_modality text, p_responsible_id uuid, p_patient_id uuid
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blockers text[] := '{}';
  v_data text[] := '{}';
  v_tobacco boolean;
  v_missing text[];
  v_def jsonb;
  v_own public.carmo_stratifications%rowtype;
  v_prev public.carmo_stratifications%rowtype;
  v_ref date := coalesce(p_actual_date, p_planned_date, current_date);
  v_priority integer;
  v_months integer;
  v_due date;
  v_pending_q text[];
begin
  if p_status in ('cancelled', 'not_done') then
    return v_blockers;
  end if;

  -- 1. Datos de la visita
  if p_status <> 'done' then v_data := v_data || 'estado «realizada»'::text; end if;
  if p_status = 'done' and p_actual_date is null then v_data := v_data || 'fecha efectiva'::text; end if;
  if p_status = 'done' and p_modality is null then v_data := v_data || 'modalidad'::text; end if;
  if p_responsible_id is null then v_data := v_data || 'profesional responsable'::text; end if;
  if cardinality(v_data) > 0 then
    v_blockers := v_blockers || ('Datos de la visita: falta ' || array_to_string(v_data, ', '));
  end if;

  -- 2. Variables clínicas (observaciones vigentes de la visita)
  select o.value_boolean into v_tobacco
    from public.carmo_observations o
   where o.visit_id = p_visit_id and o.variable_code = 'tobacco_use' and not o.is_missing
     and not exists (select 1 from public.carmo_observations n where n.supersedes_id = o.id)
   limit 1;
  select array_agg(v.label order by v.label) into v_missing
    from public.carmo_variables v
   where v.status not in ('blocked', 'retired') and v.section <> 'cv_event' and p_visit_code = any(v.allowed_visits)
     and v.code <> 'years_since_quitting'
     and (v.code not in ('cigarettes_per_day', 'smoking_years') or v_tobacco is true)
     and not exists (
       select 1 from public.carmo_observations o
        where o.visit_id = p_visit_id and o.variable_code = v.code
          and not exists (select 1 from public.carmo_observations n where n.supersedes_id = o.id));
  if cardinality(v_missing) > 0 then
    v_blockers := v_blockers || ('Variables clínicas sin registrar: ' || array_to_string(v_missing, ', '));
  end if;

  -- 3. Medicación
  if p_visit_code <> 'EXTRA' and not exists (select 1 from public.carmo_visit_medication_reviews r where r.visit_id = p_visit_id) then
    v_blockers := v_blockers || 'Medicación: falta registrar la revisión de la medicación'::text;
  end if;

  -- 4. Estratificación CMO (solo con modelo validado)
  select m.definition into v_def from public.carmo_cmo_models m where m.status = 'validated' order by m.validated_at desc nulls last limit 1;
  if v_def is not null then
    select s.* into v_own from public.carmo_stratifications s
     where s.visit_id = p_visit_id and not exists (select 1 from public.carmo_stratifications n where n.supersedes_id = s.id)
     order by s.calculated_at desc limit 1;
    if v_own.id is not null then
      if v_own.validation_status = 'pending' then
        v_blockers := v_blockers || 'Estratificación CMO pendiente de validación profesional'::text;
      end if;
    elsif p_visit_code = 'BASAL' then
      v_blockers := v_blockers || 'Estratificación CMO de la visita inicial'::text;
    else
      select s.* into v_prev from public.carmo_stratifications s
       where s.patient_id = p_patient_id and (s.calculated_at at time zone 'UTC')::date <= v_ref
         and not exists (select 1 from public.carmo_stratifications n where n.supersedes_id = s.id)
       order by s.calculated_at desc limit 1;
      if v_prev.id is null then
        v_blockers := v_blockers || 'Estratificación CMO: el paciente no tiene estratificación previa'::text;
      else
        v_priority := coalesce(v_prev.final_priority, v_prev.calculated_priority);
        v_months := nullif(v_def -> 'followUp' -> (v_priority::text) ->> 'restratifyMonths', '')::integer;
        if v_months is not null then
          v_due := ((coalesce(v_prev.validated_at, v_prev.calculated_at) at time zone 'UTC')::date + make_interval(months => v_months))::date;
          if v_due <= v_ref then
            v_blockers := v_blockers || ('Estratificación CMO: reestratificación vencida (Prioridad ' || v_priority || ', vencía el ' || to_char(v_due, 'DD/MM/YYYY') || ')');
          end if;
        end if;
      end if;
    end if;
  end if;

  -- 5. Cuestionarios activos previstos en la visita
  select array_agg(i.code order by i.code) into v_pending_q
    from public.carmo_instruments i
   where i.status = 'active' and p_visit_code = any(i.allowed_visits)
     and not exists (
       select 1 from public.carmo_questionnaire_administrations a
        where a.visit_id = p_visit_id and a.instrument_code = i.code
          and (a.status = 'not_done' or (a.status = 'completed' and (a.scores ->> 'valid') is distinct from 'false')));
  if cardinality(v_pending_q) > 0 then
    v_blockers := v_blockers || ('Cuestionarios pendientes: ' || array_to_string(v_pending_q, ', '));
  end if;

  return v_blockers;
end;
$$;

create or replace function carmo_private.enforce_visit_close_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blockers text[];
begin
  if new.record_state = 'closed' and old.record_state is distinct from 'closed' then
    v_blockers := carmo_private.visit_close_blockers(new.id, new.visit_code, new.status, new.actual_date, new.planned_date,
                                                     new.modality, new.responsible_id, new.patient_id);
    if cardinality(v_blockers) > 0 then
      raise exception 'No se puede cerrar la visita: hay bloques obligatorios pendientes. %', array_to_string(v_blockers, ' · ');
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_carmo_visits_close_gate before update of record_state on public.carmo_visits
for each row execute function carmo_private.enforce_visit_close_gate();

-- Consulta para la aplicación (misma regla que el trigger): bloques que impiden cerrar una visita visible.
create or replace function public.carmo_visit_close_blockers(p_visit_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.carmo_visits%rowtype;
begin
  select * into v from public.carmo_visits where id = p_visit_id;
  if v.id is null or not app_private.has_app_access('carmo')
     or not carmo_private.can_read_clinical(carmo_private.patient_center(v.patient_id)) then
    return null;
  end if;
  return carmo_private.visit_close_blockers(v.id, v.visit_code, v.status, v.actual_date, v.planned_date, v.modality, v.responsible_id, v.patient_id);
end;
$$;

revoke all on function carmo_private.visit_close_blockers(uuid, text, text, date, date, text, uuid, uuid),
  carmo_private.enforce_visit_close_gate() from public, anon, authenticated;
revoke all on function public.carmo_visit_close_blockers(uuid) from public, anon;
grant execute on function public.carmo_visit_close_blockers(uuid) to authenticated;

create or replace function carmo_private.enforce_medication_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.carmo_visits%rowtype;
  v_active integer;
begin
  select * into v_visit from public.carmo_visits where id = new.visit_id;
  if v_visit.id is null then raise exception 'Visita no encontrada.'; end if;
  if v_visit.status = 'cancelled' then raise exception 'La visita está anulada.'; end if;
  perform carmo_private.assert_visit_open(new.visit_id);
  new.patient_id := v_visit.patient_id;
  select count(*) into v_active from public.carmo_treatments t where t.patient_id = v_visit.patient_id and t.status in ('active', 'suspended');
  if new.outcome = 'no_medication' and v_active > 0 then
    raise exception 'El paciente tiene medicación activa registrada: no puede marcarse «sin medicación».';
  end if;
  if new.outcome <> 'no_medication' and v_active = 0 then
    raise exception 'No hay medicación activa registrada: añádala desde CIMA o marque «sin medicación».';
  end if;
  new.active_medication_count := v_active;
  if tg_op = 'UPDATE' then
    if new.visit_id <> old.visit_id then raise exception 'No se puede cambiar la visita.'; end if;
    if new.revision <> old.revision then raise exception 'Conflicto de edición: otra persona guardó antes. Recargue.'; end if;
    if new.correction_reason is null or new.correction_reason is not distinct from old.correction_reason then
      raise exception 'Indique el motivo para modificar la revisión.';
    end if;
    new.revision := old.revision + 1;
  else
    new.revision := 1;
    new.correction_reason := null;
  end if;
  if auth.uid() is not null then new.reviewed_by := auth.uid(); end if;
  new.reviewed_at := timezone('utc', now());
  return new;
end;
$$;
revoke all on function carmo_private.enforce_medication_review() from public, anon, authenticated;
