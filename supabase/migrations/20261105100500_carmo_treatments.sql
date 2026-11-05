-- CARMO · 05 · Tratamiento farmacológico longitudinal y dispensaciones.
--
--   · Tratamientos principales del estudio (encargo §8): alirocumab, evolocumab, inclisirán,
--     evinacumab. Concomitantes con principio activo libre.
--   · Ningún tratamiento se borra; los cambios (dosis, suspensión, reinicio, fin, RAM, incidencias)
--     son eventos de solo-adición que actualizan el estado del tratamiento (historial completo).
--   · Dispensaciones: fecha y cantidad. El cálculo de adherencia NO se implementa en BD hasta que
--     se definan método, ventana y umbral (RG-20). Adherencia por dispensación ≠ autorreferida.

create table public.carmo_treatments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  active_ingredient text not null check (length(trim(active_ingredient)) between 2 and 120),
  is_study_lipid_therapy boolean generated always as (lower(trim(active_ingredient)) in ('alirocumab', 'evolocumab', 'inclisiran', 'inclisirán', 'evinacumab')) stored,
  presentation text check (presentation is null or length(presentation) <= 200),
  dose_amount numeric check (dose_amount > 0),
  dose_unit text check (dose_unit is null or length(dose_unit) <= 30),
  frequency text check (frequency is null or length(frequency) <= 120),
  route text check (route in ('subcutaneous', 'intravenous', 'oral', 'other')),
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'suspended', 'finished')),
  started_before_inclusion boolean not null default false,
  recorded_by uuid references public.carmo_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint carmo_trt_dates check (end_date is null or end_date >= start_date),
  constraint carmo_trt_finished check ((status = 'finished') = (end_date is not null))
);
create index idx_carmo_trt_patient on public.carmo_treatments(patient_id);

create table public.carmo_treatment_events (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.carmo_treatments(id) on delete restrict,
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  visit_id uuid references public.carmo_visits(id) on delete restrict,
  event_type text not null check (event_type in ('start', 'dose_change', 'suspension', 'restart', 'end', 'adverse_reaction', 'incident')),
  event_date date not null,
  new_dose_amount numeric check (new_dose_amount > 0),
  new_dose_unit text,
  new_frequency text,
  reason text check (reason is null or length(reason) <= 500),
  adverse_reaction_description text check (adverse_reaction_description is null or length(adverse_reaction_description) <= 1000),
  recorded_by uuid references public.carmo_profiles(id) on delete set null,
  recorded_at timestamptz not null default timezone('utc', now()),
  constraint carmo_trt_evt_reason check (event_type not in ('dose_change', 'suspension', 'end', 'restart') or reason is not null),
  constraint carmo_trt_evt_dose check (event_type <> 'dose_change' or new_dose_amount is not null),
  constraint carmo_trt_evt_ram check (event_type <> 'adverse_reaction' or adverse_reaction_description is not null)
);
create index idx_carmo_trt_evt on public.carmo_treatment_events(treatment_id, event_date);

create table public.carmo_dispensations (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.carmo_treatments(id) on delete restrict,
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  dispensed_date date not null,
  units_dispensed numeric not null check (units_dispensed > 0),
  days_supply integer check (days_supply > 0),
  supersedes_id uuid references public.carmo_dispensations(id) on delete restrict,
  correction_reason text,
  recorded_by uuid references public.carmo_profiles(id) on delete set null,
  recorded_at timestamptz not null default timezone('utc', now()),
  constraint carmo_disp_correction check ((supersedes_id is null) = (correction_reason is null))
);
create unique index uq_carmo_disp_supersedes on public.carmo_dispensations(supersedes_id) where supersedes_id is not null;

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
  insert into public.carmo_treatment_events (treatment_id, patient_id, event_type, event_date)
  values (new.id, new.patient_id, 'start', new.start_date);
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

  perform set_config('carmo.treatment_event', 'on', true);
  case new.event_type
    when 'dose_change' then
      update public.carmo_treatments set dose_amount = new.new_dose_amount,
        dose_unit = coalesce(new.new_dose_unit, dose_unit), frequency = coalesce(new.new_frequency, frequency) where id = v_trt.id;
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

create or replace function carmo_private.enforce_dispensation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev public.carmo_dispensations%rowtype;
begin
  new.patient_id := (select t.patient_id from public.carmo_treatments t where t.id = new.treatment_id);
  if new.dispensed_date > current_date then raise exception 'Fecha futura no admitida.'; end if;
  if new.supersedes_id is not null then
    select * into v_prev from public.carmo_dispensations where id = new.supersedes_id;
    if v_prev.treatment_id <> new.treatment_id then raise exception 'La corrección debe referirse al mismo tratamiento.'; end if;
  end if;
  if auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  new.recorded_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_carmo_trt_rules before insert or update on public.carmo_treatments
for each row execute function carmo_private.enforce_treatment();
create trigger trg_carmo_trt_start after insert on public.carmo_treatments
for each row execute function carmo_private.create_start_event();
create trigger trg_carmo_trt_evt_rules before insert on public.carmo_treatment_events
for each row execute function carmo_private.apply_treatment_event();
create trigger trg_carmo_disp_rules before insert on public.carmo_dispensations
for each row execute function carmo_private.enforce_dispensation();
create trigger trg_carmo_trt_audit after insert or update or delete on public.carmo_treatments
for each row execute function carmo_private.write_audit_log();
create trigger trg_carmo_trt_evt_audit after insert or update or delete on public.carmo_treatment_events
for each row execute function carmo_private.write_audit_log();
create trigger trg_carmo_disp_audit after insert or update or delete on public.carmo_dispensations
for each row execute function carmo_private.write_audit_log();

create view public.carmo_dispensations_current with (security_invoker = true) as
select d.* from public.carmo_dispensations d
 where not exists (select 1 from public.carmo_dispensations n where n.supersedes_id = d.id);

alter table public.carmo_treatments enable row level security;
alter table public.carmo_treatment_events enable row level security;
alter table public.carmo_dispensations enable row level security;
revoke all on public.carmo_treatments, public.carmo_treatment_events, public.carmo_dispensations, public.carmo_dispensations_current
  from public, anon, authenticated;
revoke all on function carmo_private.enforce_treatment(), carmo_private.create_start_event(), carmo_private.apply_treatment_event(),
  carmo_private.enforce_dispensation() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['carmo_treatments', 'carmo_treatment_events', 'carmo_dispensations'] loop
    execute format(
      'create policy carmo_app_gate on public.%I as restrictive for all to authenticated
         using (app_private.has_app_access(''carmo'')) with check (app_private.has_app_access(''carmo''))', v_table);
    execute format(
      'create policy %s_select on public.%I for select to authenticated using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)))',
      v_table, v_table);
  end loop;
end
$$;
create policy carmo_trt_insert on public.carmo_treatments for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_trt_evt_insert on public.carmo_treatment_events for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center((select t.patient_id from public.carmo_treatments t where t.id = treatment_id))));
create policy carmo_disp_insert on public.carmo_dispensations for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center((select t.patient_id from public.carmo_treatments t where t.id = treatment_id))));

grant select on public.carmo_treatments, public.carmo_treatment_events, public.carmo_dispensations, public.carmo_dispensations_current to authenticated;
grant insert (patient_id, active_ingredient, presentation, dose_amount, dose_unit, frequency, route, start_date) on public.carmo_treatments to authenticated;
grant insert (treatment_id, patient_id, visit_id, event_type, event_date, new_dose_amount, new_dose_unit, new_frequency, reason, adverse_reaction_description)
  on public.carmo_treatment_events to authenticated;
grant insert (treatment_id, patient_id, dispensed_date, units_dispensed, days_supply, supersedes_id, correction_reason)
  on public.carmo_dispensations to authenticated;
