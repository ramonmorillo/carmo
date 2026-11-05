-- CARMO · 06 · Estratificación CMO cardiovascular (estructura) e intervenciones farmacéuticas.
--
-- ⚠ CÁLCULO CLÍNICO DESACTIVADO. El documento oficial de adaptación del modelo CMO a pacientes con
--   patología cardiovascular (MAPEX-SEFH) no se ha localizado (búsqueda 05/11/2026). No se extrapolan
--   variables, puntos ni umbrales de DERMAPEX, COAMO ni de ningún otro modelo CMO.
--   · carmo_cmo_models admite versiones 'draft'; solo una versión 'validated' (con referencia
--     documental y validador) permite registrar estratificaciones. No se siembra ninguna.
--   · Cada estratificación conserva entradas, desglose, puntuación, prioridad calculada, versión del
--     algoritmo, autor y fecha; la validación profesional confirma o modifica (con motivo) la
--     prioridad. Una reestratificación es una fila nueva: nunca se pierde el resultado original.
--   · Intervenciones: solo con una categoría del catálogo oficial VALIDADO (vacío hasta transcribir la
--     taxonomía CMO cardiovascular). No se introducen categorías no aprobadas.

create table public.carmo_cmo_models (
  version text primary key,
  status text not null default 'draft' check (status in ('draft', 'validated', 'retired')),
  source_reference text not null,
  definition jsonb not null,
  definition_sha256 text not null,
  validated_by text,
  validated_at date,
  created_at timestamptz not null default timezone('utc', now()),
  constraint carmo_cmo_validated check (status <> 'validated' or (validated_by is not null and validated_at is not null))
);
comment on table public.carmo_cmo_models is
  'Definición versionada del modelo CMO cardiovascular (variables, puntos, umbrales, reglas excepcionales, actuaciones por prioridad). Solo SQL administrativo. Ninguna versión validada en esta migración.';

create table public.carmo_stratifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  visit_id uuid not null references public.carmo_visits(id) on delete restrict,
  model_version text not null references public.carmo_cmo_models(version) on delete restrict,
  engine_version text not null check (length(engine_version) between 3 and 40),
  inputs jsonb not null,
  item_results jsonb not null,
  total_score numeric,
  calculated_priority integer not null check (calculated_priority between 1 and 3),
  justification text not null,
  calculated_by uuid references public.carmo_profiles(id) on delete set null,
  calculated_at timestamptz not null default timezone('utc', now()),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'confirmed', 'modified')),
  final_priority integer check (final_priority between 1 and 3),
  validation_reason text,
  validated_by uuid references public.carmo_profiles(id) on delete set null,
  validated_at timestamptz,
  supersedes_id uuid references public.carmo_stratifications(id) on delete restrict,
  constraint carmo_strat_validation check (
    (validation_status = 'pending' and final_priority is null)
    or (validation_status = 'confirmed' and final_priority = calculated_priority)
    or (validation_status = 'modified' and final_priority is not null and final_priority <> calculated_priority and validation_reason is not null)
  )
);
create unique index uq_carmo_strat_supersedes on public.carmo_stratifications(supersedes_id) where supersedes_id is not null;
create index idx_carmo_strat_patient on public.carmo_stratifications(patient_id, calculated_at);

create table public.carmo_intervention_catalog (
  code text primary key check (code ~ '^[A-Z0-9_.-]{2,30}$'),
  catalog_version text not null,
  cmo_domain text not null check (cmo_domain in ('capacity', 'motivation', 'opportunity')),
  category text not null,
  subcategory text,
  label text not null,
  priority_levels integer[] not null default array[1, 2, 3],
  status text not null default 'draft' check (status in ('draft', 'validated', 'retired')),
  source_reference text not null
);
comment on table public.carmo_intervention_catalog is 'Taxonomía oficial CMO cardiovascular (vacía hasta su transcripción y validación). Solo SQL administrativo.';

create table public.carmo_interventions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  visit_id uuid references public.carmo_visits(id) on delete restrict,
  catalog_code text not null references public.carmo_intervention_catalog(code) on delete restrict,
  intervention_date date not null,
  is_scheduled boolean not null,
  modality text not null check (modality in ('in_person', 'telematic')),
  reason text check (reason is null or length(reason) <= 500),
  action_taken text check (action_taken is null or length(action_taken) <= 1000),
  recipient text check (recipient in ('patient', 'caregiver', 'physician', 'nurse', 'pharmacist', 'other')),
  acceptance text check (acceptance in ('accepted', 'not_accepted', 'pending', 'not_applicable')),
  outcome text check (outcome is null or length(outcome) <= 1000),
  followup_status text not null default 'open' check (followup_status in ('open', 'closed')),
  stratification_id uuid references public.carmo_stratifications(id) on delete restrict,
  responsible_id uuid references public.carmo_profiles(id) on delete set null,
  revision integer not null default 1,
  correction_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index idx_carmo_int_patient on public.carmo_interventions(patient_id, intervention_date);

create or replace function carmo_private.enforce_stratification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.carmo_visits%rowtype;
  v_prev public.carmo_stratifications%rowtype;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.carmo_cmo_models m where m.version = new.model_version and m.status = 'validated') then
      raise exception 'Modelo CMO % no validado: el cálculo clínico está desactivado hasta disponer de la fuente oficial validada.', new.model_version;
    end if;
    select * into v_visit from public.carmo_visits where id = new.visit_id;
    if v_visit.patient_id <> new.patient_id then raise exception 'La visita no pertenece al paciente.'; end if;
    perform carmo_private.assert_visit_open(new.visit_id);
    if new.supersedes_id is not null then
      select * into v_prev from public.carmo_stratifications where id = new.supersedes_id;
      if v_prev.patient_id <> new.patient_id then raise exception 'La reestratificación debe ser del mismo paciente.'; end if;
    end if;
    new.calculated_by := auth.uid();
    new.calculated_at := timezone('utc', now());
    new.validation_status := 'pending';
    new.final_priority := null;
    new.validated_by := null;
    new.validated_at := null;
    return new;
  end if;

  -- UPDATE: solo la validación profesional, una vez.
  if (new.patient_id, new.visit_id, new.model_version, new.engine_version, new.inputs, new.item_results, new.total_score,
      new.calculated_priority, new.justification, new.calculated_by, new.calculated_at, new.supersedes_id)
     is distinct from
     (old.patient_id, old.visit_id, old.model_version, old.engine_version, old.inputs, old.item_results, old.total_score,
      old.calculated_priority, old.justification, old.calculated_by, old.calculated_at, old.supersedes_id) then
    raise exception 'El resultado de una estratificación es inmutable: reestratifique (fila nueva).';
  end if;
  if old.validation_status <> 'pending' then raise exception 'La estratificación ya fue validada.'; end if;
  if not carmo_private.can_write_clinical(carmo_private.patient_center(new.patient_id)) then
    raise exception 'Sin permiso para validar.';
  end if;
  new.validated_by := auth.uid();
  new.validated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function carmo_private.enforce_intervention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.carmo_intervention_catalog c where c.code = new.catalog_code and c.status = 'validated') then
    raise exception 'La categoría % no pertenece al catálogo CMO cardiovascular validado.', new.catalog_code;
  end if;
  if new.visit_id is not null then
    if not exists (select 1 from public.carmo_visits v where v.id = new.visit_id and v.patient_id = new.patient_id) then
      raise exception 'La visita no pertenece al paciente.';
    end if;
    perform carmo_private.assert_visit_open(new.visit_id);
  end if;
  if new.intervention_date > current_date then raise exception 'Fecha futura no admitida.'; end if;
  if tg_op = 'UPDATE' then
    if new.patient_id <> old.patient_id then raise exception 'No se puede cambiar el paciente.'; end if;
    if new.revision <> old.revision then raise exception 'Conflicto de edición: otra persona guardó antes. Recargue.'; end if;
    if coalesce(trim(new.correction_reason), '') = '' and (new.catalog_code, new.intervention_date, new.action_taken) is distinct from (old.catalog_code, old.intervention_date, old.action_taken) then
      raise exception 'Indique el motivo para corregir la categoría, la fecha o la actuación.';
    end if;
    new.revision := old.revision + 1;
    new.responsible_id := old.responsible_id;
  else
    new.revision := 1;
    new.responsible_id := coalesce(auth.uid(), new.responsible_id);
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_carmo_strat_rules before insert or update on public.carmo_stratifications
for each row execute function carmo_private.enforce_stratification();
create trigger trg_carmo_int_rules before insert or update on public.carmo_interventions
for each row execute function carmo_private.enforce_intervention();
create trigger trg_carmo_strat_audit after insert or update or delete on public.carmo_stratifications
for each row execute function carmo_private.write_audit_log();
create trigger trg_carmo_int_audit after insert or update or delete on public.carmo_interventions
for each row execute function carmo_private.write_audit_log();
create trigger trg_carmo_models_audit after insert or update or delete on public.carmo_cmo_models
for each row execute function carmo_private.write_audit_log();
create trigger trg_carmo_icat_audit after insert or update or delete on public.carmo_intervention_catalog
for each row execute function carmo_private.write_audit_log();

alter table public.carmo_cmo_models enable row level security;
alter table public.carmo_stratifications enable row level security;
alter table public.carmo_intervention_catalog enable row level security;
alter table public.carmo_interventions enable row level security;
revoke all on public.carmo_cmo_models, public.carmo_stratifications, public.carmo_intervention_catalog, public.carmo_interventions
  from public, anon, authenticated;
revoke all on function carmo_private.enforce_stratification(), carmo_private.enforce_intervention() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['carmo_cmo_models', 'carmo_stratifications', 'carmo_intervention_catalog', 'carmo_interventions'] loop
    execute format(
      'create policy carmo_app_gate on public.%I as restrictive for all to authenticated
         using (app_private.has_app_access(''carmo'')) with check (app_private.has_app_access(''carmo''))', v_table);
  end loop;
end
$$;

create policy carmo_models_select on public.carmo_cmo_models for select to authenticated using (carmo_private.is_active_user());
create policy carmo_icat_select on public.carmo_intervention_catalog for select to authenticated using (carmo_private.is_active_user());
create policy carmo_strat_select on public.carmo_stratifications for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_strat_insert on public.carmo_stratifications for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_strat_update on public.carmo_stratifications for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)))
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_int_select on public.carmo_interventions for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_int_insert on public.carmo_interventions for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_int_update on public.carmo_interventions for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)))
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));

grant select on public.carmo_cmo_models, public.carmo_stratifications, public.carmo_intervention_catalog, public.carmo_interventions to authenticated;
grant insert (patient_id, visit_id, model_version, engine_version, inputs, item_results, total_score, calculated_priority, justification, supersedes_id),
      update (validation_status, final_priority, validation_reason)
  on public.carmo_stratifications to authenticated;
grant insert (patient_id, visit_id, catalog_code, intervention_date, is_scheduled, modality, reason, action_taken, recipient, acceptance,
              outcome, followup_status, stratification_id),
      update (catalog_code, intervention_date, is_scheduled, modality, reason, action_taken, recipient, acceptance, outcome,
              followup_status, revision, correction_reason)
  on public.carmo_interventions to authenticated;
