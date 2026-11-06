-- CARMO · 09 · Medicación vinculada a CIMA, revisión de la medicación por visita y retirada del PRM.
--
-- Decisiones del IP (06/11/2026):
--   · La medicación se registra seleccionando el medicamento en CIMA (AEMPS), sin texto libre: dosis con
--     unidad de una lista cerrada, pauta codificada y vía tomada de las vías autorizadas en CIMA.
--   · Cada visita registra que la medicación se ha revisado (sin cambios / con cambios / sin medicación),
--     como en IRIS, para que ninguna visita quede sin conciliar.
--   · El apartado «Problema relacionado con medicamentos» se elimina de la herramienta.
--
-- No destructiva: se amplía carmo_treatments (un único registro de medicación, con su historial de eventos
-- y dispensaciones). Las filas previas (solo datos sintéticos de validación) se conservan tal cual; las
-- reglas nuevas se aplican a las inserciones y a los eventos posteriores. Las columnas del PRM no se
-- eliminan (retirarlas sería destructivo): se revoca su escritura y una restricción impide valores nuevos.

-- ── 1. Medicación desde CIMA ───────────────────────────────────────────────────
alter table public.carmo_treatments
  add column cima_nregistro text check (cima_nregistro is null or cima_nregistro ~ '^[0-9A-Za-z/-]{1,20}$'),
  add column cima_cn text check (cima_cn is null or cima_cn ~ '^[0-9]{6,7}$'),
  add column cima_name text check (cima_name is null or length(cima_name) between 2 and 300),
  add column atc_code text check (atc_code is null or atc_code ~ '^[A-Z][0-9]{2}[A-Z]{0,2}[0-9]{0,2}$'),
  add column pharmaceutical_form text check (pharmaceutical_form is null or length(pharmaceutical_form) <= 200),
  add column cima_snapshot jsonb,
  add column frequency_code text,
  add column visit_id uuid references public.carmo_visits(id) on delete restrict;

alter table public.carmo_treatment_events
  add column new_frequency_code text;

alter table public.carmo_treatments drop constraint carmo_treatments_route_check;
alter table public.carmo_treatments add constraint carmo_treatments_route_check
  check (route in ('oral', 'subcutaneous', 'intravenous', 'intramuscular', 'sublingual', 'inhalation', 'transdermal', 'topical', 'other'));

comment on column public.carmo_treatments.cima_nregistro is 'Número de registro del medicamento en CIMA (AEMPS). Obligatorio en los registros nuevos.';
comment on column public.carmo_treatments.cima_snapshot is 'Copia de los datos de CIMA en el momento de la selección (trazabilidad si CIMA cambia).';
comment on column public.carmo_treatments.frequency_code is 'Pauta codificada (carmo_private.frequency_label). frequency guarda su etiqueta para compatibilidad.';

create or replace function carmo_private.frequency_label(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'q24h' then 'Cada 24 horas' when 'q12h' then 'Cada 12 horas' when 'q8h' then 'Cada 8 horas'
    when 'q6h' then 'Cada 6 horas' when 'q48h' then 'Cada 48 horas' when 'weekly' then 'Semanal'
    when 'q2w' then 'Cada 2 semanas' when 'q4w' then 'Cada 4 semanas' when 'monthly' then 'Mensual'
    when 'q3m' then 'Cada 3 meses' when 'q6m' then 'Cada 6 meses' when 'prn' then 'A demanda'
    when 'single' then 'Dosis única' when 'other' then 'Otra pauta'
    else null end;
$$;

create or replace function carmo_private.dose_unit_allowed(p_unit text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_unit in ('mg', 'g', 'mcg', 'UI', 'ml', 'comprimido', 'cápsula', 'sobre', 'pluma/jeringa', 'vial', 'inhalación', 'gota', 'parche', 'unidad');
$$;

create or replace function carmo_private.enforce_treatment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient public.carmo_patients%rowtype;
begin
  select * into v_patient from public.carmo_patients where id = new.patient_id;
  if tg_op = 'INSERT' then
    if v_patient.status <> 'included' then raise exception 'Solo se registran tratamientos de pacientes incluidos.'; end if;
    if new.start_date > current_date then raise exception 'La fecha de inicio no puede ser futura.'; end if;
    -- Desde la migración 09: medicamento seleccionado en CIMA y pauta codificada (sin texto libre).
    if new.cima_nregistro is null or new.cima_name is null then
      raise exception 'Seleccione el medicamento en CIMA: no se admite texto libre.';
    end if;
    if new.frequency_code is null or carmo_private.frequency_label(new.frequency_code) is null then
      raise exception 'Seleccione la pauta de la lista.';
    end if;
    if new.dose_unit is not null and not carmo_private.dose_unit_allowed(new.dose_unit) then
      raise exception 'Unidad de dosis no admitida.';
    end if;
    if new.dose_amount is not null and new.dose_unit is null then raise exception 'Indique la unidad de la dosis.'; end if;
    if new.visit_id is not null then
      if not exists (select 1 from public.carmo_visits v where v.id = new.visit_id and v.patient_id = new.patient_id and v.status <> 'cancelled') then
        raise exception 'La visita no pertenece al paciente.';
      end if;
      perform carmo_private.assert_visit_open(new.visit_id);
    end if;
    new.frequency := carmo_private.frequency_label(new.frequency_code);
    new.presentation := new.cima_name;
    new.started_before_inclusion := new.start_date < v_patient.inclusion_date;
    new.status := 'active';
    new.end_date := null;
    if auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  elsif current_setting('carmo.treatment_event', true) is distinct from 'on' then
    raise exception 'Un tratamiento se modifica registrando un evento (cambio de dosis, suspensión, fin...), nunca editándolo.';
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function carmo_private.create_start_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.carmo_treatment_events (treatment_id, patient_id, visit_id, event_type, event_date)
  values (new.id, new.patient_id, new.visit_id, 'start', new.start_date);
  return new;
end;
$$;

create or replace function carmo_private.apply_treatment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trt public.carmo_treatments%rowtype;
begin
  select * into v_trt from public.carmo_treatments where id = new.treatment_id for update;
  new.patient_id := v_trt.patient_id;
  if new.event_date > current_date then raise exception 'Fecha futura no admitida.'; end if;
  if new.event_date < v_trt.start_date then raise exception 'El evento no puede ser anterior al inicio del tratamiento.'; end if;
  if new.visit_id is not null then
    if not exists (select 1 from public.carmo_visits v where v.id = new.visit_id and v.patient_id = v_trt.patient_id) then
      raise exception 'La visita no pertenece al paciente.';
    end if;
    perform carmo_private.assert_visit_open(new.visit_id);
  end if;
  if new.event_type = 'start' and exists (select 1 from public.carmo_treatment_events e where e.treatment_id = new.treatment_id and e.event_type = 'start') then
    raise exception 'El tratamiento ya tiene evento de inicio.';
  end if;
  if v_trt.status = 'finished' and new.event_type not in ('adverse_reaction', 'incident') then
    raise exception 'Tratamiento finalizado: registre un tratamiento nuevo.';
  end if;
  if new.new_frequency_code is not null then
    if carmo_private.frequency_label(new.new_frequency_code) is null then raise exception 'Seleccione la pauta de la lista.'; end if;
    new.new_frequency := carmo_private.frequency_label(new.new_frequency_code);
  end if;
  if new.new_dose_unit is not null and not carmo_private.dose_unit_allowed(new.new_dose_unit) then
    raise exception 'Unidad de dosis no admitida.';
  end if;

  perform set_config('carmo.treatment_event', 'on', true);
  case new.event_type
    when 'dose_change' then
      update public.carmo_treatments set dose_amount = new.new_dose_amount,
        dose_unit = coalesce(new.new_dose_unit, dose_unit), frequency = coalesce(new.new_frequency, frequency),
        frequency_code = coalesce(new.new_frequency_code, frequency_code) where id = v_trt.id;
    when 'suspension' then
      if v_trt.status <> 'active' then raise exception 'Solo se suspende un tratamiento activo.'; end if;
      update public.carmo_treatments set status = 'suspended' where id = v_trt.id;
    when 'restart' then
      if v_trt.status <> 'suspended' then raise exception 'Solo se reinicia un tratamiento suspendido.'; end if;
      update public.carmo_treatments set status = 'active' where id = v_trt.id;
    when 'end' then
      update public.carmo_treatments set status = 'finished', end_date = new.event_date where id = v_trt.id;
    else
      null;
  end case;
  perform set_config('carmo.treatment_event', 'off', true);

  if auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  new.recorded_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function carmo_private.frequency_label(text), carmo_private.dose_unit_allowed(text) from public, anon, authenticated;

grant insert (cima_nregistro, cima_cn, cima_name, atc_code, pharmaceutical_form, cima_snapshot, frequency_code, visit_id)
  on public.carmo_treatments to authenticated;
grant insert (new_frequency_code) on public.carmo_treatment_events to authenticated;

-- ── 2. Revisión de la medicación en cada visita ───────────────────────────────
create table public.carmo_visit_medication_reviews (
  visit_id uuid primary key references public.carmo_visits(id) on delete restrict,
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  outcome text not null check (outcome in ('no_changes', 'changes_recorded', 'no_medication')),
  active_medication_count integer not null default 0,
  revision integer not null default 1,
  correction_reason text check (correction_reason is null or length(trim(correction_reason)) between 5 and 500),
  reviewed_by uuid references public.carmo_profiles(id) on delete set null,
  reviewed_at timestamptz not null default timezone('utc', now())
);
comment on table public.carmo_visit_medication_reviews is
  'Constancia de que la medicación se revisó en la visita (como en IRIS). active_medication_count: tratamientos activos o suspendidos en el momento de la revisión, calculado por la BD.';

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
    if new.correction_reason is null then raise exception 'Indique el motivo para modificar la revisión.'; end if;
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

create trigger trg_carmo_medrev_rules before insert or update on public.carmo_visit_medication_reviews
for each row execute function carmo_private.enforce_medication_review();
create trigger trg_carmo_medrev_audit after insert or update or delete on public.carmo_visit_medication_reviews
for each row execute function carmo_private.write_audit_log();

alter table public.carmo_visit_medication_reviews enable row level security;
revoke all on public.carmo_visit_medication_reviews from public, anon, authenticated;
revoke all on function carmo_private.enforce_medication_review() from public, anon, authenticated;
create policy carmo_app_gate on public.carmo_visit_medication_reviews as restrictive for all to authenticated
  using (app_private.has_app_access('carmo')) with check (app_private.has_app_access('carmo'));
create policy carmo_medrev_select on public.carmo_visit_medication_reviews for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.visit_center(visit_id)));
create policy carmo_medrev_insert on public.carmo_visit_medication_reviews for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.visit_center(visit_id)));
create policy carmo_medrev_update on public.carmo_visit_medication_reviews for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.visit_center(visit_id)))
  with check (carmo_private.can_write_clinical(carmo_private.visit_center(visit_id)));
grant select on public.carmo_visit_medication_reviews to authenticated;
grant insert (visit_id, outcome) on public.carmo_visit_medication_reviews to authenticated;
grant update (outcome, revision, correction_reason) on public.carmo_visit_medication_reviews to authenticated;

-- ── 3. Retirada del «Problema relacionado con medicamentos» ───────────────────
revoke insert (drp_identified, drp_description), update (drp_identified, drp_description)
  on public.carmo_visit_evolutions from authenticated;
-- Cualquier guardado posterior de la evolución deja el PRM vacío (si no, una fila previa con PRM quedaría
-- bloqueada por la restricción y sin forma de corregirse).
create or replace function carmo_private.enforce_evolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.patient_id := (select v.patient_id from public.carmo_visits v where v.id = new.visit_id);
  perform carmo_private.assert_visit_open(new.visit_id);
  new.drp_identified := null;
  new.drp_description := null;
  if tg_op = 'UPDATE' then
    if new.visit_id <> old.visit_id then raise exception 'No se puede cambiar la visita.'; end if;
    if new.revision <> old.revision then raise exception 'Conflicto de edición: otra persona guardó antes. Recargue.'; end if;
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;
alter table public.carmo_visit_evolutions add constraint carmo_evo_drp_retired
  check (drp_identified is null and drp_description is null) not valid;
comment on column public.carmo_visit_evolutions.drp_identified is 'RETIRADA (decisión del IP, 06/11/2026). Sin escritura; se conserva solo por no ser destructivos.';
comment on column public.carmo_visit_evolutions.drp_description is 'RETIRADA (decisión del IP, 06/11/2026). Sin escritura; se conserva solo por no ser destructivos.';
