-- CARMO · 01 · Base de control: configuración del estudio, perfiles y roles, centros,
-- pertenencias, auditoría y decisiones de acceso.
--
-- Diseño: docs/CARMO_ARCHITECTURE.md (§2.1 decisión, §3 roles, §4 aislamiento). Patrón heredado de COAMO
-- (ramonmorillo/dermapex: 20261007150000_coag_foundation.sql), sin compartir con DERMAPEX ni COAMO
-- ninguna tabla, FK, helper, catálogo, log ni trigger. Solo se comparten Auth y
-- app_private.app_access (código 'carmo', migración 00).
--
-- Principios:
--   · Autorización = identidad + acceso 'carmo' activo + perfil CARMO activo + rol + centro.
--   · Los privilegios por defecto de public lo conceden todo a anon/authenticated: cada tabla se
--     crea con RLS y se revoca todo en esta misma migración antes de conceder lo mínimo.
--   · Sin borrado desde la API en ninguna tabla clínica (se anula o se corrige con trazabilidad).
--   · Ningún usuario se da de alta aquí. Los 14 centros del protocolo v3.0 se registran como
--     PENDIENTES DE AUTORIZACIÓN e INACTIVOS: el dictamen del CEIm-G aportado solo cita C.H.U. de
--     A Coruña y C.H.U. de Santiago (RG-07, RG-08, RG-31). Sin número de estudio hasta su autorización.

create schema if not exists carmo_private;
revoke all on schema carmo_private from public;
grant usage on schema carmo_private to authenticated;

-- ── Utilidades ──────────────────────────────────────────────────────────────

create or replace function carmo_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ── Configuración del estudio (fila única; solo SQL administrativo) ─────────

create table carmo_private.study_config (
  id boolean primary key default true check (id),
  data_mode text not null default 'validation' check (data_mode in ('validation', 'production')),
  target_sample_size integer not null default 135 check (target_sample_size > 0),
  changed_at timestamptz not null default timezone('utc', now()),
  change_reason text
);
comment on table carmo_private.study_config is
  'Modo de datos: validation = solo datos sintéticos (todo paciente creado queda marcado is_synthetic). production solo tras completar docs/CARMO_GO_LIVE_CHECKLIST.md.';
insert into carmo_private.study_config (id) values (true) on conflict do nothing;
alter table carmo_private.study_config enable row level security;
revoke all on carmo_private.study_config from public, anon, authenticated;

-- ── Perfiles y roles ────────────────────────────────────────────────────────

create table public.carmo_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in (
    'tech_admin',             -- administración técnica: cuentas/centros; SIN acceso a datos clínicos
    'coordinator',            -- coordinación científica: todos los centros CARMO
    'site_pi',                -- investigador principal de centro
    'site_investigator',      -- investigador colaborador
    'external_evaluator',     -- evaluador externo de cuestionarios (solo cuestionarios)
    'monitor'                 -- monitor/auditor: solo lectura en sus centros
  )),
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
comment on table public.carmo_profiles is
  'Perfil profesional CARMO, independiente de public.profiles (DERMAPEX) y public.coag_profiles (COAMO). Alta solo administrativa: carmo_private.provision_user(email, rol).';

create table public.carmo_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{2,20}$'),
  name text not null check (length(trim(name)) >= 2),
  study_number integer unique check (study_number between 1 and 999),
  participation_status text not null default 'pending_authorization'
    check (participation_status in ('pending_authorization', 'authorized', 'closed')),
  authorization_reference text check (authorization_reference is null or length(trim(authorization_reference)) between 2 and 200),
  is_active boolean not null default false,
  activated_at date,
  deactivated_at date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint carmo_centers_authorized_ref check (participation_status <> 'authorized' or authorization_reference is not null),
  constraint carmo_centers_active_needs_authorization check (not is_active or participation_status = 'authorized')
);
comment on table public.carmo_centers is
  'Centros CARMO. Un centro solo incluye pacientes si está authorized (con referencia documental) y activo. Ninguno se crea por defecto.';

create table public.carmo_center_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.carmo_profiles(id) on delete restrict,
  center_id uuid not null references public.carmo_centers(id) on delete restrict,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default timezone('utc', now()),
  constraint carmo_memberships_dates check (ends_on is null or ends_on >= starts_on)
);
create unique index uq_carmo_memberships_open on public.carmo_center_memberships(profile_id, center_id) where ends_on is null;
create index idx_carmo_memberships_center on public.carmo_center_memberships(center_id);
comment on table public.carmo_center_memberships is
  'Altas y bajas de profesionales en centros. Una baja se registra con ends_on (no se borra): queda el historial.';

-- Sin claves foráneas a propósito: el registro debe sobrevivir a lo auditado.
create table public.carmo_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default timezone('utc', now()),
  actor_id uuid,
  actor_role text,
  center_id uuid,
  patient_id uuid,
  visit_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  reason text,
  old_data jsonb,
  new_data jsonb
);
create index idx_carmo_audit_at on public.carmo_audit_log(at desc);
create index idx_carmo_audit_row on public.carmo_audit_log(table_name, row_id);
create index idx_carmo_audit_patient on public.carmo_audit_log(patient_id) where patient_id is not null;

alter table public.carmo_profiles enable row level security;
alter table public.carmo_centers enable row level security;
alter table public.carmo_center_memberships enable row level security;
alter table public.carmo_audit_log enable row level security;
revoke all on public.carmo_profiles, public.carmo_centers, public.carmo_center_memberships, public.carmo_audit_log
  from public, anon, authenticated;

create trigger trg_carmo_profiles_updated_at before update on public.carmo_profiles
for each row execute function carmo_private.set_updated_at();
create trigger trg_carmo_centers_updated_at before update on public.carmo_centers
for each row execute function carmo_private.set_updated_at();

-- ── Decisiones de acceso (solo tablas CARMO) ────────────────────────────────

create or replace function carmo_private.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.carmo_profiles p
   where p.id = auth.uid() and p.is_active and app_private.has_app_access('carmo');
$$;

create or replace function carmo_private.is_active_user()
returns boolean language sql stable security definer set search_path = ''
as $$ select carmo_private.my_role() is not null; $$;

create or replace function carmo_private.is_coordinator()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(carmo_private.my_role() = 'coordinator', false); $$;

create or replace function carmo_private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(carmo_private.my_role() in ('tech_admin', 'coordinator'), false); $$;

-- ¿Pertenencia vigente del usuario al centro?
create or replace function carmo_private.is_member(p_center_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.carmo_center_memberships m
     where m.profile_id = auth.uid() and m.center_id = p_center_id
       and m.starts_on <= current_date and (m.ends_on is null or m.ends_on >= current_date)
  );
$$;

-- Ver que el paciente existe (código, estado, visitas): todos los roles con datos, en su ámbito.
create or replace function carmo_private.can_see_center(p_center_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select carmo_private.is_coordinator()
      or (carmo_private.my_role() in ('site_pi', 'site_investigator', 'monitor', 'external_evaluator')
          and carmo_private.is_member(p_center_id));
$$;

-- Leer datos clínicos (variables, tratamiento, intervenciones, CMO). El evaluador externo no.
create or replace function carmo_private.can_read_clinical(p_center_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select carmo_private.is_coordinator()
      or (carmo_private.my_role() in ('site_pi', 'site_investigator', 'monitor') and carmo_private.is_member(p_center_id));
$$;

-- Registrar datos clínicos.
create or replace function carmo_private.can_write_clinical(p_center_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select carmo_private.is_coordinator()
      or (carmo_private.my_role() in ('site_pi', 'site_investigator') and carmo_private.is_member(p_center_id));
$$;

-- Registrar cuestionarios (incluye evaluador externo).
create or replace function carmo_private.can_write_questionnaire(p_center_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select carmo_private.can_write_clinical(p_center_id)
      or (carmo_private.my_role() = 'external_evaluator' and carmo_private.is_member(p_center_id));
$$;

-- Revisar, cerrar y reabrir registros.
create or replace function carmo_private.can_close(p_center_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select carmo_private.is_coordinator()
      or (carmo_private.my_role() = 'site_pi' and carmo_private.is_member(p_center_id));
$$;

-- ── Auditoría (genérica para todas las tablas CARMO) ────────────────────────

create or replace function carmo_private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_patient uuid;
  v_visit uuid;
  v_center uuid;
  v_reason text;
begin
  v_patient := case when tg_table_name = 'carmo_patients' then (v_row ->> 'id')::uuid else (v_row ->> 'patient_id')::uuid end;
  v_visit := case when tg_table_name = 'carmo_visits' then (v_row ->> 'id')::uuid else (v_row ->> 'visit_id')::uuid end;
  v_center := case when tg_table_name = 'carmo_centers' then (v_row ->> 'id')::uuid else (v_row ->> 'center_id')::uuid end;
  if v_center is null and v_patient is not null and to_regclass('public.carmo_patients') is not null then
    execute 'select center_id from public.carmo_patients where id = $1' into v_center using v_patient;
  end if;
  v_reason := coalesce(v_new ->> 'correction_reason', v_new ->> 'reopen_reason', v_new ->> 'change_reason');

  insert into public.carmo_audit_log (actor_id, actor_role, center_id, patient_id, visit_id, table_name, row_id, action, reason, old_data, new_data)
  values (
    auth.uid(), carmo_private.my_role(), v_center, v_patient, v_visit, tg_table_name,
    coalesce((v_row ->> 'id')::uuid, (v_row ->> 'visit_id')::uuid, (v_row ->> 'patient_id')::uuid),
    tg_op, v_reason, v_old, v_new
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_carmo_profiles_audit after insert or update or delete on public.carmo_profiles
for each row execute function carmo_private.write_audit_log();
create trigger trg_carmo_centers_audit after insert or update or delete on public.carmo_centers
for each row execute function carmo_private.write_audit_log();
-- Protocolo v3.0 (Recogida de datos): «Solo se incluirá a un investigador principal por centro».
create or replace function carmo_private.enforce_single_site_pi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ends_on is null
     and (select p.role from public.carmo_profiles p where p.id = new.profile_id) = 'site_pi'
     and exists (
       select 1 from public.carmo_center_memberships m join public.carmo_profiles p on p.id = m.profile_id
        where m.center_id = new.center_id and m.ends_on is null and p.role = 'site_pi' and m.id <> new.id
     ) then
    raise exception 'El centro ya tiene un investigador principal vigente (protocolo: un IP por centro). Registre antes su baja.';
  end if;
  return new;
end;
$$;
create trigger trg_carmo_memberships_single_pi before insert or update on public.carmo_center_memberships
for each row execute function carmo_private.enforce_single_site_pi();

-- Centros enumerados en el protocolo v3.0 (Investigadores y centros participantes). Estado pendiente:
-- su participación efectiva y su cobertura por el dictamen deben acreditarse antes de activarlos.
insert into public.carmo_centers (code, name, participation_status, is_active) values
  ('CHUAC', 'Complexo Hospitalario Universitario de A Coruña', 'pending_authorization', false),
  ('VALME', 'Hospital Universitario Virgen de Valme (Sevilla)', 'pending_authorization', false),
  ('CHUS', 'Complexo Hospitalario Universitario de Santiago de Compostela', 'pending_authorization', false),
  ('HUNSC', 'Hospital Universitario Nuestra Señora de Candelaria (Santa Cruz de Tenerife)', 'pending_authorization', false),
  ('HUPRINCESA', 'Hospital Universitario de la Princesa (Madrid)', 'pending_authorization', false),
  ('HUVV', 'Hospital Universitario Virgen de la Victoria (Málaga)', 'pending_authorization', false),
  ('HRUM', 'Hospital Regional Universitario de Málaga (Carlos Haya)', 'pending_authorization', false),
  ('HCLINIC', 'Hospital Clínic de Barcelona', 'pending_authorization', false),
  ('HUMV', 'Hospital Universitario Marqués de Valdecilla (Santander)', 'pending_authorization', false),
  ('HUJ23', 'Hospital Universitari de Tarragona Joan XXIII', 'pending_authorization', false),
  ('HCUVA', 'Hospital Clínico Universitario Virgen de la Arrixaca (Murcia)', 'pending_authorization', false),
  ('HUJT', 'Hospital Universitari Dr. Josep Trueta (Girona)', 'pending_authorization', false),
  ('HGUGM', 'Hospital General Universitario Gregorio Marañón (Madrid)', 'pending_authorization', false),
  ('CAULE', 'Complejo Asistencial Universitario de León', 'pending_authorization', false);

create trigger trg_carmo_memberships_audit after insert or update or delete on public.carmo_center_memberships
for each row execute function carmo_private.write_audit_log();

-- ── Alta administrativa (SQL Editor; sin EXECUTE para la API) ───────────────

create or replace function carmo_private.provision_user(p_email text, p_role text, p_full_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception 'No existe ninguna cuenta de Auth con el correo %', p_email;
  end if;
  insert into app_private.app_access (user_id, app_code, is_active)
  values (v_user_id, 'carmo', true)
  on conflict (user_id, app_code) do update set is_active = true;
  insert into public.carmo_profiles (id, full_name, role)
  values (v_user_id, nullif(trim(coalesce(p_full_name, '')), ''), p_role)
  on conflict (id) do update
    set role = excluded.role, is_active = true,
        full_name = coalesce(excluded.full_name, public.carmo_profiles.full_name);
end;
$$;

create or replace function carmo_private.assign_center(p_email text, p_center_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_center uuid;
begin
  select p.id into v_profile from public.carmo_profiles p join auth.users u on u.id = p.id
   where lower(u.email) = lower(trim(p_email));
  if v_profile is null then
    raise exception 'La cuenta % no tiene perfil CARMO: ejecute antes carmo_private.provision_user.', p_email;
  end if;
  select c.id into v_center from public.carmo_centers c where c.code = upper(trim(p_center_code));
  if v_center is null then
    raise exception 'No existe ningún centro CARMO con código %', p_center_code;
  end if;
  insert into public.carmo_center_memberships (profile_id, center_id) values (v_profile, v_center)
  on conflict do nothing;
end;
$$;

-- Modo del estudio visible para la interfaz (aviso «datos sintéticos»).
create or replace function public.carmo_study_settings()
returns table (data_mode text, target_sample_size integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.data_mode, c.target_sample_size from carmo_private.study_config c
   where carmo_private.is_active_user();
$$;

create or replace function public.carmo_mark_password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.carmo_profiles set must_change_password = false
   where id = auth.uid() and app_private.has_app_access('carmo');
$$;

revoke all on all functions in schema carmo_private from public, anon, authenticated;
revoke all on function public.carmo_study_settings(), public.carmo_mark_password_changed() from public, anon, authenticated;
grant execute on function
  carmo_private.my_role(), carmo_private.is_active_user(), carmo_private.is_coordinator(), carmo_private.is_admin(),
  carmo_private.is_member(uuid), carmo_private.can_see_center(uuid), carmo_private.can_read_clinical(uuid),
  carmo_private.can_write_clinical(uuid), carmo_private.can_write_questionnaire(uuid), carmo_private.can_close(uuid)
to authenticated;
grant execute on function public.carmo_study_settings(), public.carmo_mark_password_changed() to authenticated;

-- ── Políticas ───────────────────────────────────────────────────────────────

do $$
declare
  v_table text;
begin
  foreach v_table in array array['carmo_profiles', 'carmo_centers', 'carmo_center_memberships', 'carmo_audit_log'] loop
    execute format(
      'create policy carmo_app_gate on public.%I as restrictive for all to authenticated
         using (app_private.has_app_access(''carmo'')) with check (app_private.has_app_access(''carmo''))', v_table);
  end loop;
end
$$;

create policy carmo_profiles_select on public.carmo_profiles for select to authenticated
  using (id = auth.uid() or carmo_private.is_admin());
create policy carmo_profiles_update on public.carmo_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy carmo_centers_select on public.carmo_centers for select to authenticated
  using (carmo_private.is_admin() or carmo_private.can_see_center(id));
create policy carmo_centers_insert on public.carmo_centers for insert to authenticated
  with check (carmo_private.is_admin());
create policy carmo_centers_update on public.carmo_centers for update to authenticated
  using (carmo_private.is_admin()) with check (carmo_private.is_admin());

create policy carmo_memberships_select on public.carmo_center_memberships for select to authenticated
  using (profile_id = auth.uid() or carmo_private.is_admin());
create policy carmo_memberships_insert on public.carmo_center_memberships for insert to authenticated
  with check (carmo_private.is_admin());
create policy carmo_memberships_update on public.carmo_center_memberships for update to authenticated
  using (carmo_private.is_admin()) with check (carmo_private.is_admin());

-- Auditoría: coordinación (todo) y monitor (sus centros), solo lectura.
create policy carmo_audit_select on public.carmo_audit_log for select to authenticated
  using (carmo_private.is_coordinator()
         or (carmo_private.my_role() = 'monitor' and center_id is not null and carmo_private.is_member(center_id)));

grant select on public.carmo_profiles, public.carmo_centers, public.carmo_center_memberships, public.carmo_audit_log to authenticated;
grant update (full_name) on public.carmo_profiles to authenticated;
grant insert (code, name, study_number, participation_status, authorization_reference, is_active, activated_at, deactivated_at),
      update (name, participation_status, authorization_reference, is_active, activated_at, deactivated_at)
  on public.carmo_centers to authenticated;
grant insert (profile_id, center_id, starts_on, ends_on), update (ends_on) on public.carmo_center_memberships to authenticated;
