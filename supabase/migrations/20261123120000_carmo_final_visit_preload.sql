-- CARMO · 16 · Precarga de variables clínicas de la visita inicial en la visita final (acción explícita).
--
-- Incidencia 5 (CARMO_LETRAN): «En la visita final hay que volver a rellenar todas las variables
-- clínicas; ¿se pueden volcar los valores de la visita inicial y modificarlos si hay cambios?»
--
-- Diseño (no sobrescribe ni mezcla datos):
--   · Los valores precargados NO son observaciones: viven en carmo_observation_preloads con estado
--     «pendiente de verificar». Por eso no cuentan como dato final, no completan el bloque de variables,
--     no desbloquean el cierre de la visita y no aparecen en las exportaciones ni en el comparativo
--     basal-final hasta que alguien los confirma.
--   · Confirmar («sin cambios») o actualizar es siempre un registro nuevo en carmo_observations (solo-adición,
--     con fecha de medición, origen y contexto elegidos por quien verifica). Un disparador marca la
--     precarga como confirmed (mismo valor) o updated (otro valor o dato ausente).
--   · La visita inicial no se toca.
--
-- Campos precargables (decisión PROVISIONAL, pendiente de validar por la coordinación; el protocolo v3.0 no
-- fija por variable cuáles deben volver a medirse): solo antecedentes y situación declarativa susceptibles
-- de revisión — diabetes, hipertensión, soporte familiar, consumo de tabaco y, si el basal es fumador,
-- cigarrillos/día y años fumando. NO se precargan las que requieren nueva medición (peso, altura, LDL-c,
-- colesterol no-HDL), ni fechas de medición, identificadores, valores calculados (IMC), eventos CV, datos
-- ausentes ni variables bloqueadas o retiradas.

create table public.carmo_observation_preloads (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  visit_id uuid not null references public.carmo_visits(id) on delete restrict,
  variable_code text not null references public.carmo_variables(code) on delete restrict,
  source_observation_id uuid not null references public.carmo_observations(id) on delete restrict,
  value_numeric numeric,
  value_boolean boolean,
  value_text text,
  value_date date,
  unit text,
  status text not null default 'pending_verification' check (status in ('pending_verification', 'confirmed', 'updated', 'discarded')),
  resolved_observation_id uuid references public.carmo_observations(id) on delete restrict,
  created_by uuid references public.carmo_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_by uuid references public.carmo_profiles(id) on delete set null,
  resolved_at timestamptz,
  constraint carmo_preload_resolved check ((status = 'pending_verification') = (resolved_at is null))
);
comment on table public.carmo_observation_preloads is
  'Valores de la visita inicial copiados a la visita final pendientes de verificar. No son datos finales hasta que se confirman o actualizan (carmo_observations).';
create unique index uq_carmo_preload_pending on public.carmo_observation_preloads(visit_id, variable_code) where status = 'pending_verification';
create index idx_carmo_preload_visit on public.carmo_observation_preloads(visit_id);
create index idx_carmo_preload_patient on public.carmo_observation_preloads(patient_id);

-- Precarga en bloque (única vía de alta: la API no puede insertar en la tabla).
create or replace function public.carmo_preload_final_visit(p_visit_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.carmo_visits%rowtype;
  v_basal public.carmo_visits%rowtype;
  v_codes constant text[] := array['family_support', 'tobacco_use', 'cigarettes_per_day', 'smoking_years', 'diabetes', 'hypertension'];
  v_smoker boolean;
  v_n integer;
begin
  select * into v_visit from public.carmo_visits where id = p_visit_id;
  if not found or not carmo_private.can_write_clinical(carmo_private.patient_center(v_visit.patient_id)) then
    raise exception 'Visita no accesible o sin permiso de escritura.';
  end if;
  if v_visit.visit_code <> 'FINAL' then raise exception 'La precarga solo se ofrece en la visita final.'; end if;
  if v_visit.status in ('cancelled', 'not_done') then raise exception 'La visita final está anulada o no realizada.'; end if;
  if v_visit.record_state = 'closed' then raise exception 'La visita está cerrada: reábrala con motivo para registrar datos.'; end if;

  select * into v_basal from public.carmo_visits
   where patient_id = v_visit.patient_id and visit_code = 'BASAL' and status = 'done' and actual_date is not null
   order by actual_date limit 1;
  if not found then raise exception 'No hay una visita inicial realizada con fecha efectiva de la que copiar valores.'; end if;

  select o.value_boolean into v_smoker
    from public.carmo_observations o
   where o.visit_id = v_basal.id and o.variable_code = 'tobacco_use' and not o.is_missing
     and not exists (select 1 from public.carmo_observations n where n.supersedes_id = o.id);

  insert into public.carmo_observation_preloads
    (patient_id, visit_id, variable_code, source_observation_id, value_numeric, value_boolean, value_text, value_date, unit, created_by)
  select v_visit.patient_id, v_visit.id, o.variable_code, o.id, o.value_numeric, o.value_boolean, o.value_text, o.value_date, o.unit, auth.uid()
    from public.carmo_observations o
    join public.carmo_variables va on va.code = o.variable_code
   where o.visit_id = v_basal.id
     and o.variable_code = any (v_codes)
     and not o.is_missing
     and va.status not in ('blocked', 'retired')
     and 'FINAL' = any (va.allowed_visits)
     and (o.variable_code not in ('cigarettes_per_day', 'smoking_years') or v_smoker is true)
     and not exists (select 1 from public.carmo_observations n where n.supersedes_id = o.id)
     -- Conserva lo ya introducido en la final (incluso si se vuelve a pulsar).
     and not exists (
       select 1 from public.carmo_observations f
        where f.visit_id = v_visit.id and f.variable_code = o.variable_code
          and not exists (select 1 from public.carmo_observations n2 where n2.supersedes_id = f.id))
     and not exists (
       select 1 from public.carmo_observation_preloads p
        where p.visit_id = v_visit.id and p.variable_code = o.variable_code and p.status = 'pending_verification');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.carmo_preload_final_visit(uuid) from public, anon, authenticated;
grant execute on function public.carmo_preload_final_visit(uuid) to authenticated;

-- Una observación nueva en la visita final resuelve la precarga pendiente de esa variable.
create or replace function carmo_private.resolve_preload_on_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visit_id is null then return new; end if;
  update public.carmo_observation_preloads p
     set status = case when not new.is_missing
                        and p.value_numeric is not distinct from new.value_numeric
                        and p.value_boolean is not distinct from new.value_boolean
                        and p.value_text is not distinct from new.value_text
                        and p.value_date is not distinct from new.value_date
                        and p.unit is not distinct from new.unit then 'confirmed' else 'updated' end,
         resolved_observation_id = new.id, resolved_by = auth.uid(), resolved_at = timezone('utc', now())
   where p.visit_id = new.visit_id and p.variable_code = new.variable_code and p.status = 'pending_verification';
  return new;
end;
$$;
create trigger trg_carmo_obs_resolve_preload after insert on public.carmo_observations
for each row execute function carmo_private.resolve_preload_on_observation();

-- Único cambio permitido por la API: descartar una precarga pendiente.
create or replace function carmo_private.enforce_preload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SQL administrativo (sin sesión) y resolución interna desde el disparador de observaciones (profundidad > 1).
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;
  if (new.patient_id, new.visit_id, new.variable_code, new.source_observation_id, new.value_numeric, new.value_boolean, new.value_text, new.value_date, new.unit, new.resolved_observation_id)
     is distinct from
     (old.patient_id, old.visit_id, old.variable_code, old.source_observation_id, old.value_numeric, old.value_boolean, old.value_text, old.value_date, old.unit, old.resolved_observation_id) then
    raise exception 'Una precarga no se modifica: confirme o actualice el valor registrando la observación.';
  end if;
  if old.status <> 'pending_verification' or new.status <> 'discarded' then
    raise exception 'Solo se puede descartar una precarga pendiente de verificar.';
  end if;
  perform carmo_private.assert_visit_open(new.visit_id);
  new.resolved_by := auth.uid();
  new.resolved_at := timezone('utc', now());
  return new;
end;
$$;
create trigger trg_carmo_preload_rules before update on public.carmo_observation_preloads
for each row execute function carmo_private.enforce_preload();
create trigger trg_carmo_preload_audit after insert or update or delete on public.carmo_observation_preloads
for each row execute function carmo_private.write_audit_log();

alter table public.carmo_observation_preloads enable row level security;
revoke all on public.carmo_observation_preloads from public, anon, authenticated;
revoke all on function carmo_private.resolve_preload_on_observation(), carmo_private.enforce_preload() from public, anon, authenticated;
create policy carmo_app_gate on public.carmo_observation_preloads as restrictive for all to authenticated
  using (app_private.has_app_access('carmo')) with check (app_private.has_app_access('carmo'));
create policy carmo_preload_select on public.carmo_observation_preloads for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_preload_update on public.carmo_observation_preloads for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)))
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
grant select on public.carmo_observation_preloads to authenticated;
grant update (status) on public.carmo_observation_preloads to authenticated;
