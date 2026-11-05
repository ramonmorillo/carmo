-- CARMO · 02 · Pacientes seudonimizados, elegibilidad versionada, consentimiento, calendario
-- versionado, visitas (previstas/realizadas/extraordinarias), cierre de registros y desviaciones.
--
-- Reglas aplicadas en la base de datos (no solo en la interfaz):
--   · Sin identificadores directos: no existen columnas para nombre, NHC, DNI, teléfono, correo,
--     dirección ni fecha de nacimiento. El registro de selección identificativo queda en el centro.
--   · Dos códigos asignados por la BD e inmutables (protocolo v3.0, «Inclusión y asignación del
--     código de paciente»): código de SELECCIÓN SEL-<CCC>-<NNN> al registrar al candidato, y código
--     de PACIENTE <CCC>-<PP> (3 cifras de centro + 2 cifras consecutivas en orden de INCLUSIÓN) solo al
--     incluirlo. Los no incluidos no consumen código de paciente.
--   · Inclusión imposible sin: conjunto de criterios ACTIVO (transcrito del protocolo y validado),
--     todos los criterios respondidos en el sentido exigido, consentimiento firmado con versión,
--     fecha e investigador responsable. Mientras no haya criterios activos, nadie puede incluirse.
--   · Las visitas solo se registran en pacientes incluidos; ninguna visita puede modificar otra.
--   · Estados de registro draft → reviewed → closed; un registro cerrado no se edita: se reabre con
--     motivo (IP de centro o coordinación) y queda en carmo_visit_state_log.
--   · Ninguna tabla admite DELETE desde la API.

-- ── Pacientes ───────────────────────────────────────────────────────────────

create table public.carmo_patients (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.carmo_centers(id) on delete restrict,
  screening_seq integer not null,
  screening_code text not null unique,
  inclusion_seq integer,
  study_code text unique,
  eligibility_set_id uuid,
  status text not null default 'screening'
    check (status in ('screening', 'included', 'not_included', 'withdrawn', 'lost_to_followup', 'completed')),
  status_reason text check (status_reason is null or status_reason in (
    'not_eligible', 'declined_consent', 'consent_withdrawn', 'investigator_decision', 'transfer', 'death', 'other')),
  status_reason_detail text check (status_reason_detail is null or length(trim(status_reason_detail)) between 2 and 300),
  screening_date date not null default current_date,
  inclusion_date date,
  status_changed_at timestamptz,
  responsible_investigator_id uuid references public.carmo_profiles(id) on delete restrict,
  is_synthetic boolean not null default true,
  created_by uuid references public.carmo_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (center_id, screening_seq),
  unique (center_id, inclusion_seq),
  constraint carmo_patients_code_on_inclusion check ((study_code is null) = (inclusion_seq is null))
);
comment on table public.carmo_patients is
  'Sujeto CARMO seudonimizado (datos personales seudonimizados: siguen siendo datos personales). Sin identificadores directos. is_synthetic lo fija la BD según el modo del estudio.';
comment on column public.carmo_patients.status_reason is
  'Vocabulario TÉCNICO PROVISIONAL (el protocolo disponible no se ha transcrito): validar con coordinación (CARMO_REGULATORY_GAPS RG-12).';
create index idx_carmo_patients_center on public.carmo_patients(center_id);

create table carmo_private.patient_code_counters (
  center_id uuid primary key references public.carmo_centers(id) on delete restrict,
  last_screening_seq integer not null default 0,
  last_inclusion_seq integer not null default 0
);
alter table carmo_private.patient_code_counters enable row level security;
revoke all on carmo_private.patient_code_counters from public, anon, authenticated;

-- ── Elegibilidad versionada ─────────────────────────────────────────────────

create table public.carmo_eligibility_sets (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  source_reference text not null check (length(trim(source_reference)) >= 5),
  validated_by text,
  validated_at date,
  created_at timestamptz not null default timezone('utc', now()),
  constraint carmo_elig_active_validated check (status <> 'active' or (validated_by is not null and validated_at is not null))
);
create unique index uq_carmo_elig_one_active on public.carmo_eligibility_sets((true)) where status = 'active';
comment on table public.carmo_eligibility_sets is
  'Versiones de los criterios de selección. Se cargan por SQL administrativo a partir del protocolo aprobado (sección y página en source_reference). Sin conjunto activo no hay inclusión.';

create table public.carmo_eligibility_criteria (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.carmo_eligibility_sets(id) on delete restrict,
  code text not null check (code ~ '^(INC|EXC)[0-9]{2}$'),
  kind text not null check (kind in ('inclusion', 'exclusion')),
  ordinal integer not null,
  criterion_text text not null,
  source_reference text not null,
  unique (set_id, code),
  constraint carmo_crit_kind_code check ((kind = 'inclusion') = (code like 'INC%'))
);

create table public.carmo_eligibility_answers (
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  criterion_id uuid not null references public.carmo_eligibility_criteria(id) on delete restrict,
  is_met boolean not null,
  verified_in_source boolean not null default false,
  assessed_by uuid references public.carmo_profiles(id) on delete set null,
  assessed_at timestamptz not null default timezone('utc', now()),
  correction_reason text,
  primary key (patient_id, criterion_id)
);

-- ── Consentimiento informado ────────────────────────────────────────────────

create table public.carmo_consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  document_version text not null check (length(trim(document_version)) between 1 and 80),
  signed_date date not null,
  investigator_id uuid not null references public.carmo_profiles(id) on delete restrict,
  status text not null default 'signed' check (status in ('signed', 'withdrawn')),
  withdrawal_date date,
  withdrawal_scope text check (withdrawal_scope is null or withdrawal_scope in ('stop_followup_keep_data', 'stop_followup_data_pending_decision')),
  future_use_choice text check (future_use_choice in ('delete', 'keep_pseudonymized')),
  correction_reason text,
  recorded_by uuid references public.carmo_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (patient_id, document_version),
  constraint carmo_consent_withdrawal check ((status = 'withdrawn') = (withdrawal_date is not null)),
  constraint carmo_consent_withdrawal_after check (withdrawal_date is null or withdrawal_date >= signed_date)
);
comment on table public.carmo_consents is
  'Constancia del consentimiento firmado (el documento físico se custodia en el centro; aquí no se almacena). future_use_choice: elección del participante en la HIP/CI v3.0 sobre sus datos al terminar el estudio (eliminados / conservados seudonimizados para usos futuros). withdrawal_scope: política tras la retirada PENDIENTE (RG-10).';

-- ── Calendario de visitas versionado ────────────────────────────────────────

create table public.carmo_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'provisional' check (status in ('provisional', 'validated', 'retired')),
  source_reference text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.carmo_schedule_visits (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.carmo_schedule_versions(id) on delete restrict,
  visit_code text not null check (visit_code in ('BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL')),
  ordinal integer not null,
  label text not null,
  anchor text not null default 'inclusion' check (anchor in ('inclusion')),
  target_day integer not null check (target_day >= 0),
  window_before_days integer check (window_before_days >= 0),
  window_after_days integer check (window_after_days >= 0),
  notes text,
  unique (schedule_id, visit_code)
);
comment on column public.carmo_schedule_visits.window_before_days is 'NULL = ventana no definida en la fuente: la visita se señala «ventana pendiente», nunca «fuera de ventana».';

-- Calendario provisional transcrito del protocolo v3.0 («Visitas del estudio» y «Esquema de
-- procedimientos»): visita inicial = día de la inclusión (columna S 1-4); monitorización programada
-- S12, S24 y S36; visita fin de estudio a los 12 meses de la inclusión ±28 días. La tabla del
-- protocolo sitúa la visita final en S48 (día 336, fuera de 12 meses ±28 = días 337-393): se adopta
-- el texto (12 meses ±28 días, también en la HIP/CI) y queda pendiente de confirmar (RG-05).
-- La periodicidad del seguimiento según prioridad CMO depende del documento del modelo (RG-21).
with s as (
  insert into public.carmo_schedule_versions (version, status, source_reference)
  values ('CARMO-CAL-0.2', 'provisional',
          'Protocolo v3.0 (12/09/2025): Visitas del estudio; Esquema de procedimientos. Versión aprobada por el CEIm-G: v2.0 (no disponible).')
  returning id
)
insert into public.carmo_schedule_visits (schedule_id, visit_code, ordinal, label, target_day, window_before_days, window_after_days, notes)
select s.id, v.code, v.ord, v.label, v.day, v.before, v.after, v.notes
  from s, (values
    ('BASAL', 1, 'Visita inicial (día de la inclusión; S 1-4)', 0, 0, 27, 'Protocolo: «corresponde al día de inclusión». Ventana días 0-27 = interpretación de la columna S 1-4.'),
    ('S12', 2, 'Semana 12 (V1)', 84, null::integer, null::integer, 'Monitorización programada; ventana no especificada.'),
    ('S24', 3, 'Semana 24 (V2) · valoración de adherencia', 168, null, null, 'Ventana no especificada. Esquema: valoración de la adherencia.'),
    ('S36', 4, 'Semana 36 (V3)', 252, null, null, 'Ventana no especificada.'),
    ('FINAL', 5, 'Visita fin de estudio (12 meses ±28 días)', 365, 28, 28, '12 meses ≈ 365 días desde la inclusión. Ver RG-05 (S48 en la tabla del protocolo).')
  ) as v(code, ord, label, day, before, after, notes);

-- Criterios de selección transcritos (paráfrasis) del protocolo v3.0, «Criterios de inclusión /
-- exclusión» y «Verificación de criterios». BORRADOR: la coordinación debe confirmar que coinciden con
-- la versión aprobada (v2.0) y activarlo (validated_by/validated_at + status = 'active'). Sin
-- conjunto activo no se puede incluir a nadie.
with s as (
  insert into public.carmo_eligibility_sets (version, status, source_reference)
  values ('CARMO-SEL-P3.0', 'draft', 'Protocolo v3.0 (12/09/2025), apartados «Criterios de inclusión» y «Criterios de exclusión» (índice p. 9) y «Verificación de criterios» (índice p. 17)')
  returning id
)
insert into public.carmo_eligibility_criteria (set_id, code, kind, ordinal, criterion_text, source_reference)
select s.id, c.code, c.kind, c.ord, c.txt, c.src from s, (values
  ('INC01', 'inclusion', 1, 'Mayor de 18 años con diagnóstico de hipercolesterolemia familiar y/o en prevención secundaria de enfermedad cardiovascular', 'Protocolo v3.0, criterio de inclusión 1'),
  ('INC02', 'inclusion', 2, 'En seguimiento en consulta externa de Farmacia Hospitalaria con medicamentos de uso hospitalario para esta patología', 'Protocolo v3.0, criterio de inclusión 2'),
  ('INC03', 'inclusion', 3, 'Ha otorgado el consentimiento informado de participación por escrito', 'Protocolo v3.0, criterio de inclusión 3'),
  ('INC04', 'inclusion', 4, 'Ausencia de enfermedad o condición que limite los procedimientos del estudio', 'Protocolo v3.0, criterio de inclusión 4'),
  ('EXC01', 'exclusion', 5, 'Discapacidad o estado que le impide rellenar por sí mismo los cuestionarios, o incapacidad para completar las visitas a juicio del investigador', 'Protocolo v3.0, criterio de exclusión 1'),
  ('EXC02', 'exclusion', 6, 'Participa en otro ensayo clínico', 'Protocolo v3.0, criterio de exclusión 2')
) as c(code, kind, ord, txt, src);

-- ── Visitas ─────────────────────────────────────────────────────────────────

create table public.carmo_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  visit_code text not null check (visit_code in ('BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA')),
  schedule_visit_id uuid references public.carmo_schedule_visits(id) on delete restrict,
  planned_date date,
  actual_date date,
  status text not null default 'planned' check (status in ('planned', 'done', 'not_done', 'cancelled')),
  status_reason text check (status_reason is null or length(trim(status_reason)) between 2 and 300),
  modality text check (modality in ('in_person', 'phone')),
  responsible_id uuid references public.carmo_profiles(id) on delete restrict,
  record_state text not null default 'draft' check (record_state in ('draft', 'reviewed', 'closed')),
  reviewed_by uuid references public.carmo_profiles(id) on delete set null,
  reviewed_at timestamptz,
  closed_by uuid references public.carmo_profiles(id) on delete set null,
  closed_at timestamptz,
  reopen_reason text,
  revision integer not null default 1,
  created_by uuid references public.carmo_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint carmo_visit_done_fields check (status <> 'done' or (actual_date is not null and modality is not null and responsible_id is not null)),
  constraint carmo_visit_reason check (status not in ('not_done', 'cancelled') or status_reason is not null),
  constraint carmo_visit_extra_unscheduled check ((visit_code = 'EXTRA') = (schedule_visit_id is null))
);
create index idx_carmo_visits_patient on public.carmo_visits(patient_id, coalesce(actual_date, planned_date));
create unique index uq_carmo_visits_programmed on public.carmo_visits(patient_id, visit_code)
  where visit_code <> 'EXTRA' and status <> 'cancelled';
comment on table public.carmo_visits is
  'Visitas previstas (planned_date), realizadas (actual_date + done) y extraordinarias (EXTRA, no programadas). Una visita programada por código y paciente.';

create table public.carmo_visit_state_log (
  id bigint generated always as identity primary key,
  visit_id uuid not null references public.carmo_visits(id) on delete restrict,
  from_state text not null,
  to_state text not null,
  reason text,
  actor_id uuid,
  at timestamptz not null default timezone('utc', now())
);

-- ── Incidencias y desviaciones ──────────────────────────────────────────────

create table public.carmo_deviations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  visit_id uuid references public.carmo_visits(id) on delete restrict,
  category text not null check (category in ('visit_out_of_window', 'missed_visit', 'eligibility', 'consent', 'questionnaire', 'data_entry', 'other')),
  description text not null check (length(trim(description)) between 5 and 1000),
  detected_date date not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text,
  reported_by uuid references public.carmo_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint carmo_dev_resolution check (status <> 'resolved' or resolution is not null)
);
comment on column public.carmo_deviations.category is 'Clasificación TÉCNICA provisional (no definida en el protocolo transcrito).';

-- ── Funciones de reglas ─────────────────────────────────────────────────────

create or replace function carmo_private.patient_center(p_patient_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select center_id from public.carmo_patients where id = p_patient_id; $$;

create or replace function carmo_private.visit_center(p_visit_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select p.center_id from public.carmo_visits v join public.carmo_patients p on p.id = v.patient_id where v.id = p_visit_id; $$;

create or replace function carmo_private.assign_patient_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.carmo_centers%rowtype;
  v_seq integer;
begin
  if tg_op = 'UPDATE' then
    if new.center_id is distinct from old.center_id or new.screening_code is distinct from old.screening_code
       or new.screening_seq is distinct from old.screening_seq or new.is_synthetic is distinct from old.is_synthetic
       or new.eligibility_set_id is distinct from old.eligibility_set_id or new.created_by is distinct from old.created_by
       or new.screening_date is distinct from old.screening_date
       or (old.study_code is not null and (new.study_code is distinct from old.study_code or new.inclusion_seq is distinct from old.inclusion_seq)) then
      raise exception 'El centro, los códigos, el carácter sintético, la versión de criterios y la fecha de selección de un paciente no se pueden modificar.';
    end if;
    return new;
  end if;

  select * into v_center from public.carmo_centers c where c.id = new.center_id;
  if not found then raise exception 'Centro CARMO inexistente.'; end if;
  if not v_center.is_active or v_center.participation_status <> 'authorized' then
    raise exception 'El centro % no está autorizado y activo para incluir pacientes.', v_center.name;
  end if;
  if v_center.study_number is null then
    raise exception 'El centro % no tiene código de centro (3 cifras) asignado.', v_center.name;
  end if;

  insert into carmo_private.patient_code_counters as pc (center_id, last_screening_seq) values (new.center_id, 1)
  on conflict (center_id) do update set last_screening_seq = pc.last_screening_seq + 1
  returning last_screening_seq into v_seq;

  new.screening_seq := v_seq;
  new.screening_code := 'SEL-' || lpad(v_center.study_number::text, 3, '0') || '-' || lpad(v_seq::text, 3, '0');
  new.inclusion_seq := null;
  new.study_code := null;
  new.is_synthetic := (select c.data_mode = 'validation' from carmo_private.study_config c);
  new.eligibility_set_id := (select s.id from public.carmo_eligibility_sets s where s.status = 'active');
  new.status := 'screening';
  new.status_reason := null;
  new.inclusion_date := null;
  if new.screening_date > current_date then raise exception 'La fecha de selección no puede ser futura.'; end if;
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end;
$$;

-- Código de paciente del protocolo: <CCC>-<PP>, consecutivo por centro en orden de inclusión.
create or replace function carmo_private.assign_inclusion_code(p_center_id uuid)
returns table (seq integer, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
  v_number integer;
begin
  select c.study_number into v_number from public.carmo_centers c where c.id = p_center_id;
  update carmo_private.patient_code_counters set last_inclusion_seq = last_inclusion_seq + 1
   where center_id = p_center_id returning last_inclusion_seq into v_seq;
  if v_seq > 99 then
    raise exception 'El código de paciente del protocolo admite 2 cifras (máximo 99 por centro).';
  end if;
  return query select v_seq, lpad(v_number::text, 3, '0') || '-' || lpad(v_seq::text, 2, '0');
end;
$$;

-- ¿Se cumplen TODOS los requisitos de inclusión? Devuelve la lista de requisitos pendientes (vacía = listo).
create or replace function carmo_private.inclusion_blockers(p_patient_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patient public.carmo_patients%rowtype;
  v_blockers text[] := '{}';
  v_total integer;
  v_ok integer;
begin
  select * into v_patient from public.carmo_patients where id = p_patient_id;
  if not found then return array['patient_not_found']; end if;

  if v_patient.eligibility_set_id is null then
    v_blockers := v_blockers || 'no_active_eligibility_set'::text;
  else
    select count(*) into v_total from public.carmo_eligibility_criteria where set_id = v_patient.eligibility_set_id;
    select count(*) into v_ok
      from public.carmo_eligibility_criteria c
      join public.carmo_eligibility_answers a on a.criterion_id = c.id and a.patient_id = p_patient_id
     where c.set_id = v_patient.eligibility_set_id
       and ((c.kind = 'inclusion' and a.is_met) or (c.kind = 'exclusion' and not a.is_met));
    if v_total = 0 then v_blockers := v_blockers || 'eligibility_set_empty'::text;
    elsif v_ok < v_total then v_blockers := v_blockers || 'eligibility_not_satisfied'::text;
    end if;
  end if;

  if not exists (
    select 1 from public.carmo_consents c
     where c.patient_id = p_patient_id and c.status = 'signed' and c.signed_date <= current_date
  ) then
    v_blockers := v_blockers || 'no_signed_consent'::text;
  end if;
  if v_patient.responsible_investigator_id is null then
    v_blockers := v_blockers || 'no_responsible_investigator'::text;
  end if;
  return v_blockers;
end;
$$;

create or replace function carmo_private.enforce_patient_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blockers text[];
begin
  if new.status is not distinct from old.status then
    if new.inclusion_date is distinct from old.inclusion_date then
      raise exception 'La fecha de inclusión la fija la base de datos al incluir al paciente.';
    end if;
    return new;
  end if;

  if not carmo_private.can_write_clinical(new.center_id) and auth.uid() is not null then
    raise exception 'Sin permiso para cambiar el estado del paciente.';
  end if;

  if old.status = 'screening' and new.status = 'included' then
    v_blockers := carmo_private.inclusion_blockers(new.id);
    if cardinality(v_blockers) > 0 then
      raise exception 'No se puede incluir: requisitos pendientes [%].', array_to_string(v_blockers, ', ');
    end if;
    new.inclusion_date := current_date;
    new.status_reason := null;
    select a.seq, a.code into new.inclusion_seq, new.study_code from carmo_private.assign_inclusion_code(new.center_id) a;
  elsif old.status = 'screening' and new.status = 'not_included' then
    if new.status_reason is null then raise exception 'Indique el motivo de no inclusión.'; end if;
  elsif old.status = 'included' and new.status in ('withdrawn', 'lost_to_followup') then
    if new.status_reason is null then raise exception 'Indique el motivo de la salida del estudio.'; end if;
    if new.status = 'withdrawn' and new.status_reason = 'consent_withdrawn' and not exists (
      select 1 from public.carmo_consents c where c.patient_id = new.id and c.status = 'withdrawn'
    ) then
      raise exception 'Registre antes la retirada del consentimiento (fecha) en el consentimiento.';
    end if;
  elsif old.status = 'included' and new.status = 'completed' then
    if not exists (select 1 from public.carmo_visits v where v.patient_id = new.id and v.visit_code = 'FINAL' and v.status = 'done') then
      raise exception 'Para cerrar el seguimiento debe existir la visita final realizada.';
    end if;
    new.status_reason := null;
  else
    raise exception 'Cambio de estado no permitido (% → %). Las correcciones se hacen por SQL administrativo con motivo.', old.status, new.status;
  end if;
  new.status_changed_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function carmo_private.enforce_eligibility_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient public.carmo_patients%rowtype;
begin
  select * into v_patient from public.carmo_patients where id = new.patient_id;
  if v_patient.status <> 'screening' then
    raise exception 'Los criterios solo se registran durante el cribado (estado actual: %).', v_patient.status;
  end if;
  if not exists (select 1 from public.carmo_eligibility_criteria c where c.id = new.criterion_id and c.set_id = v_patient.eligibility_set_id) then
    raise exception 'El criterio no pertenece a la versión de criterios asignada al paciente.';
  end if;
  if tg_op = 'UPDATE' then
    if new.patient_id <> old.patient_id or new.criterion_id <> old.criterion_id then
      raise exception 'No se puede cambiar el paciente o el criterio de una respuesta.';
    end if;
    if new.is_met is distinct from old.is_met and coalesce(trim(new.correction_reason), '') = '' then
      raise exception 'Indique el motivo para modificar una respuesta ya registrada.';
    end if;
  end if;
  if auth.uid() is not null then new.assessed_by := auth.uid(); end if;
  new.assessed_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function carmo_private.enforce_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.signed_date > current_date then raise exception 'La fecha de firma no puede ser futura.'; end if;
  if new.withdrawal_date > current_date then raise exception 'La fecha de retirada no puede ser futura.'; end if;
  if not exists (
    select 1 from public.carmo_center_memberships m join public.carmo_profiles p on p.id = m.profile_id
     where m.profile_id = new.investigator_id and m.ends_on is null
       and m.center_id = carmo_private.patient_center(new.patient_id)
       and p.role in ('site_pi', 'site_investigator')
  ) then
    raise exception 'El investigador responsable del consentimiento debe ser investigador vigente del centro del paciente.';
  end if;
  if tg_op = 'UPDATE' then
    if new.patient_id <> old.patient_id or new.document_version <> old.document_version then
      raise exception 'No se puede cambiar el paciente ni la versión documental de un consentimiento.';
    end if;
    if (new.signed_date is distinct from old.signed_date or new.investigator_id is distinct from old.investigator_id)
       and coalesce(trim(new.correction_reason), '') = '' then
      raise exception 'Indique el motivo para corregir la fecha o el investigador del consentimiento.';
    end if;
    if old.status = 'withdrawn' and new.status = 'signed' then
      raise exception 'Una retirada de consentimiento no se revierte: registre un nuevo consentimiento.';
    end if;
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function carmo_private.enforce_visit_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient public.carmo_patients%rowtype;
  v_sched public.carmo_schedule_visits%rowtype;
  v_center uuid;
begin
  select * into v_patient from public.carmo_patients where id = new.patient_id;
  v_center := v_patient.center_id;

  if tg_op = 'UPDATE' then
    if new.patient_id <> old.patient_id or new.visit_code <> old.visit_code
       or new.schedule_visit_id is distinct from old.schedule_visit_id or new.created_by is distinct from old.created_by then
      raise exception 'El paciente y el tipo de visita no se pueden modificar: anule la visita y regístrela de nuevo.';
    end if;
    if new.revision <> old.revision then
      raise exception 'La revisión la gestiona la base de datos.';
    end if;

    -- Transiciones del estado del registro.
    if new.record_state is distinct from old.record_state then
      if auth.uid() is not null and not carmo_private.can_close(v_center) then
        raise exception 'Solo el IP del centro o la coordinación revisan, cierran o reabren visitas.';
      end if;
      if old.record_state = 'draft' and new.record_state = 'reviewed' then
        new.reviewed_by := auth.uid(); new.reviewed_at := timezone('utc', now());
      elsif old.record_state in ('draft', 'reviewed') and new.record_state = 'closed' then
        if new.status = 'planned' then raise exception 'No se cierra una visita prevista sin realizar: márquela realizada, no realizada o anulada.'; end if;
        new.closed_by := auth.uid(); new.closed_at := timezone('utc', now());
      elsif old.record_state in ('reviewed', 'closed') and new.record_state = 'draft' then
        if coalesce(trim(new.reopen_reason), '') = '' or new.reopen_reason is not distinct from old.reopen_reason then
          raise exception 'Indique el motivo de la reapertura.';
        end if;
        new.closed_by := null; new.closed_at := null; new.reviewed_by := null; new.reviewed_at := null;
      else
        raise exception 'Transición de registro no permitida (% → %).', old.record_state, new.record_state;
      end if;
      insert into public.carmo_visit_state_log (visit_id, from_state, to_state, reason, actor_id)
      values (new.id, old.record_state, new.record_state, case when new.record_state = 'draft' then new.reopen_reason end, auth.uid());
    elsif old.record_state = 'closed' then
      raise exception 'La visita está cerrada: reábrala con motivo para modificarla.';
    end if;
    new.revision := old.revision + 1;
  else
    if v_patient.status <> 'included' then
      raise exception 'Solo se registran visitas de pacientes incluidos (estado actual: %).', v_patient.status;
    end if;
    if new.visit_code <> 'EXTRA' then
      select sv.* into v_sched from public.carmo_schedule_visits sv
        join public.carmo_schedule_versions s on s.id = sv.schedule_id
       where sv.visit_code = new.visit_code and s.status in ('provisional', 'validated')
       order by (s.status = 'validated') desc, s.created_at desc limit 1;
      if not found then raise exception 'No hay calendario vigente para la visita %.', new.visit_code; end if;
      new.schedule_visit_id := v_sched.id;
      if new.planned_date is null then new.planned_date := v_patient.inclusion_date + v_sched.target_day; end if;
    end if;
    new.record_state := 'draft';
    new.revision := 1;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;

  if new.actual_date is not null then
    if new.actual_date > current_date then raise exception 'Una visita realizada no puede tener fecha futura.'; end if;
    if new.actual_date < v_patient.inclusion_date then
      raise exception 'La visita no puede ser anterior a la inclusión (%).', v_patient.inclusion_date;
    end if;
  end if;
  if new.status <> 'done' and new.actual_date is not null and new.status <> 'not_done' then
    raise exception 'Solo una visita realizada tiene fecha efectiva.';
  end if;
  if new.responsible_id is not null and not exists (
    select 1 from public.carmo_center_memberships m where m.profile_id = new.responsible_id and m.center_id = v_center
  ) and not exists (select 1 from public.carmo_profiles p where p.id = new.responsible_id and p.role = 'coordinator') then
    raise exception 'El profesional responsable debe pertenecer al centro del paciente.';
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Bloqueo de registros dependientes de una visita cerrada (lo usan las tablas de migraciones posteriores).
create or replace function carmo_private.assert_visit_open(p_visit_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_visit_id is not null and exists (select 1 from public.carmo_visits v where v.id = p_visit_id and v.record_state = 'closed') then
    raise exception 'La visita está cerrada: reábrala con motivo para registrar o corregir datos.';
  end if;
end;
$$;

create or replace function carmo_private.enforce_deviation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visit_id is not null and not exists (select 1 from public.carmo_visits v where v.id = new.visit_id and v.patient_id = new.patient_id) then
    raise exception 'La visita no pertenece al paciente.';
  end if;
  if tg_op = 'UPDATE' and (new.patient_id <> old.patient_id or new.visit_id is distinct from old.visit_id) then
    raise exception 'No se puede cambiar el paciente o la visita de una desviación.';
  end if;
  if new.detected_date > current_date then raise exception 'La fecha no puede ser futura.'; end if;
  if tg_op = 'INSERT' and auth.uid() is not null then new.reported_by := auth.uid(); end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger trg_carmo_patients_a_code before insert or update on public.carmo_patients
for each row execute function carmo_private.assign_patient_code();
create trigger trg_carmo_patients_b_status before update on public.carmo_patients
for each row execute function carmo_private.enforce_patient_status();
create trigger trg_carmo_patients_updated_at before update on public.carmo_patients
for each row execute function carmo_private.set_updated_at();
create trigger trg_carmo_elig_answers_rules before insert or update on public.carmo_eligibility_answers
for each row execute function carmo_private.enforce_eligibility_answer();
create trigger trg_carmo_consents_rules before insert or update on public.carmo_consents
for each row execute function carmo_private.enforce_consent();
create trigger trg_carmo_visits_rules before insert or update on public.carmo_visits
for each row execute function carmo_private.enforce_visit_rules();
create trigger trg_carmo_deviations_rules before insert or update on public.carmo_deviations
for each row execute function carmo_private.enforce_deviation();

do $$
declare
  v_table text;
begin
  foreach v_table in array array['carmo_patients', 'carmo_eligibility_answers', 'carmo_consents', 'carmo_visits', 'carmo_deviations',
                                 'carmo_eligibility_sets', 'carmo_eligibility_criteria', 'carmo_schedule_versions', 'carmo_schedule_visits'] loop
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I for each row execute function carmo_private.write_audit_log()', v_table, v_table);
  end loop;
end
$$;

-- ── Vista de calendario (security_invoker: aplica la RLS de quien consulta) ─

create view public.carmo_visit_windows with (security_invoker = true) as
select
  v.id as visit_id,
  v.patient_id,
  v.visit_code,
  v.planned_date,
  v.actual_date,
  v.status,
  sv.window_before_days,
  sv.window_after_days,
  case when sv.window_before_days is not null then v.planned_date - sv.window_before_days end as window_start,
  case when sv.window_after_days is not null then v.planned_date + sv.window_after_days end as window_end,
  case
    when v.visit_code = 'EXTRA' then 'not_applicable'
    when v.actual_date is null then 'not_done_yet'
    when sv.window_before_days is null or sv.window_after_days is null then 'window_undefined'
    when v.actual_date between v.planned_date - sv.window_before_days and v.planned_date + sv.window_after_days then 'in_window'
    else 'out_of_window'
  end as window_status,
  case when v.actual_date is not null and v.planned_date is not null then v.actual_date - v.planned_date end as deviation_days
from public.carmo_visits v
left join public.carmo_schedule_visits sv on sv.id = v.schedule_visit_id;

-- ── RLS y privilegios ───────────────────────────────────────────────────────

alter table public.carmo_patients enable row level security;
alter table public.carmo_eligibility_sets enable row level security;
alter table public.carmo_eligibility_criteria enable row level security;
alter table public.carmo_eligibility_answers enable row level security;
alter table public.carmo_consents enable row level security;
alter table public.carmo_schedule_versions enable row level security;
alter table public.carmo_schedule_visits enable row level security;
alter table public.carmo_visits enable row level security;
alter table public.carmo_visit_state_log enable row level security;
alter table public.carmo_deviations enable row level security;

revoke all on public.carmo_patients, public.carmo_eligibility_sets, public.carmo_eligibility_criteria, public.carmo_eligibility_answers,
  public.carmo_consents, public.carmo_schedule_versions, public.carmo_schedule_visits, public.carmo_visits,
  public.carmo_visit_state_log, public.carmo_deviations, public.carmo_visit_windows
  from public, anon, authenticated;
revoke all on all functions in schema carmo_private from public, anon, authenticated;
grant execute on function
  carmo_private.my_role(), carmo_private.is_active_user(), carmo_private.is_coordinator(), carmo_private.is_admin(),
  carmo_private.is_member(uuid), carmo_private.can_see_center(uuid), carmo_private.can_read_clinical(uuid),
  carmo_private.can_write_clinical(uuid), carmo_private.can_write_questionnaire(uuid), carmo_private.can_close(uuid),
  carmo_private.patient_center(uuid), carmo_private.visit_center(uuid)
to authenticated;

create or replace function public.carmo_inclusion_blockers(p_patient_id uuid)
returns text[] language sql stable security definer set search_path = ''
as $$ select case when carmo_private.can_see_center(carmo_private.patient_center(p_patient_id)) then carmo_private.inclusion_blockers(p_patient_id) end; $$;
revoke all on function public.carmo_inclusion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.carmo_inclusion_blockers(uuid) to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['carmo_patients', 'carmo_eligibility_sets', 'carmo_eligibility_criteria', 'carmo_eligibility_answers',
                                 'carmo_consents', 'carmo_schedule_versions', 'carmo_schedule_visits', 'carmo_visits',
                                 'carmo_visit_state_log', 'carmo_deviations'] loop
    execute format(
      'create policy carmo_app_gate on public.%I as restrictive for all to authenticated
         using (app_private.has_app_access(''carmo'')) with check (app_private.has_app_access(''carmo''))', v_table);
  end loop;
end
$$;

-- Catálogos de referencia: lectura para cualquier usuario CARMO activo; escritura solo SQL administrativo.
create policy carmo_elig_sets_select on public.carmo_eligibility_sets for select to authenticated using (carmo_private.is_active_user());
create policy carmo_elig_criteria_select on public.carmo_eligibility_criteria for select to authenticated using (carmo_private.is_active_user());
create policy carmo_sched_versions_select on public.carmo_schedule_versions for select to authenticated using (carmo_private.is_active_user());
create policy carmo_sched_visits_select on public.carmo_schedule_visits for select to authenticated using (carmo_private.is_active_user());

create policy carmo_patients_select on public.carmo_patients for select to authenticated
  using (carmo_private.can_see_center(center_id));
create policy carmo_patients_insert on public.carmo_patients for insert to authenticated
  with check (carmo_private.can_write_clinical(center_id));
create policy carmo_patients_update on public.carmo_patients for update to authenticated
  using (carmo_private.can_write_clinical(center_id)) with check (carmo_private.can_write_clinical(center_id));

create policy carmo_elig_answers_select on public.carmo_eligibility_answers for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_elig_answers_insert on public.carmo_eligibility_answers for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_elig_answers_update on public.carmo_eligibility_answers for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)))
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));

create policy carmo_consents_select on public.carmo_consents for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_consents_insert on public.carmo_consents for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_consents_update on public.carmo_consents for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)))
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));

create policy carmo_visits_select on public.carmo_visits for select to authenticated
  using (carmo_private.can_see_center(carmo_private.patient_center(patient_id)));
create policy carmo_visits_insert on public.carmo_visits for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_visits_update on public.carmo_visits for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)))
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));

create policy carmo_visit_state_log_select on public.carmo_visit_state_log for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.visit_center(visit_id)));

create policy carmo_deviations_select on public.carmo_deviations for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_deviations_insert on public.carmo_deviations for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_deviations_update on public.carmo_deviations for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)))
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));

grant select on public.carmo_patients, public.carmo_eligibility_sets, public.carmo_eligibility_criteria, public.carmo_eligibility_answers,
  public.carmo_consents, public.carmo_schedule_versions, public.carmo_schedule_visits, public.carmo_visits,
  public.carmo_visit_state_log, public.carmo_deviations, public.carmo_visit_windows to authenticated;
grant insert (center_id, screening_date, responsible_investigator_id) on public.carmo_patients to authenticated;
grant update (status, status_reason, status_reason_detail, responsible_investigator_id) on public.carmo_patients to authenticated;
grant insert (patient_id, criterion_id, is_met, verified_in_source), update (is_met, verified_in_source, correction_reason)
  on public.carmo_eligibility_answers to authenticated;
grant insert (patient_id, document_version, signed_date, investigator_id, future_use_choice),
      update (signed_date, investigator_id, status, withdrawal_date, withdrawal_scope, future_use_choice, correction_reason)
  on public.carmo_consents to authenticated;
grant insert (patient_id, visit_code, planned_date, actual_date, status, status_reason, modality, responsible_id),
      update (planned_date, actual_date, status, status_reason, modality, responsible_id, record_state, reopen_reason)
  on public.carmo_visits to authenticated;
grant insert (patient_id, visit_id, category, description, detected_date),
      update (category, description, status, resolution) on public.carmo_deviations to authenticated;
