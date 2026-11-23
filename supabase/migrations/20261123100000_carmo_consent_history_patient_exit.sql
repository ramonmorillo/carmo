-- CARMO · 14 · Consentimiento informado: rectificación y retirada como acciones distintas, con historial
-- autorizado; y baja del paciente incluido por error o inelegible.
--
-- Incidencias de la coordinación (documento CARMO_LETRAN):
--   1. «Una vez guardado el consentimiento no encuentro la opción de modificarlo ni de retirarlo, pero
--      manteniendo un historial de cambios.»
--   2. «¿Hay alguna opción para eliminar o dar de baja a pacientes ya incluidos (error / inelegible)?»
--
-- Qué hace (sin borrar ni reescribir nada existente; migraciones anteriores inmutables):
--   · carmo_consents.withdrawal_reason: motivo de la retirada (columna nueva, nula en filas históricas).
--   · carmo_consent_events: historial append-only (alta, rectificación, retirada) con fecha, autor, motivo y
--     cambio campo a campo. Lo escribe un trigger; la API solo lo lee (coordinación, IP, colaboradores y
--     monitor del centro). Se rellena con el historial YA auditado en carmo_audit_log (hechos reales: no se
--     inventan motivos; los que no constan quedan nulos).
--   · enforce_consent: rectificar (fecha de firma, investigador, versión documental, destino de los datos,
--     fecha de retirada) exige un motivo NUEVO; retirar exige motivo y no puede mezclarse con una
--     rectificación; una retirada sigue sin revertirse. La versión documental pasa a ser rectificable (con
--     motivo): era el error de transcripción más probable y antes obligaba a SQL administrativo.
--   · Baja del paciente: la baja por «incluido por error» o «no cumple criterios» reutiliza el estado
--     existente «withdrawn» (Retirado) con motivo obligatorio y detalle. No añade estados: así las
--     exportaciones, el panel y las poblaciones de análisis conservan su semántica actual. El tratamiento
--     analítico de estas bajas (ITT / por protocolo) queda como decisión pendiente (docs/CARMO_REGULATORY_GAPS.md).
--     La baja se distingue de la retirada del consentimiento por status_reason: consent_withdrawn exige la
--     retirada registrada; included_in_error / not_eligible no la exigen ni la crean.
--
-- Compatibilidad: las exportaciones leen columnas explícitas (src/services/researchExport/datasets.ts);
-- las columnas y la tabla nuevas no alteran ningún conjunto exportado.

-- ── Consentimiento ──────────────────────────────────────────────────────────

alter table public.carmo_consents
  add column if not exists withdrawal_reason text
  check (withdrawal_reason is null or length(trim(withdrawal_reason)) between 5 and 300);
comment on column public.carmo_consents.withdrawal_reason is
  'Motivo de la retirada del consentimiento (obligatorio al registrarla desde esta versión; nulo en retiradas históricas).';

create table public.carmo_consent_events (
  id bigint generated always as identity primary key,
  consent_id uuid not null references public.carmo_consents(id) on delete restrict,
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  event_type text not null check (event_type in ('recorded', 'rectified', 'withdrawn')),
  -- {campo: {from, to}} solo con los campos que cambian.
  changes jsonb not null default '{}'::jsonb,
  reason text,
  actor_id uuid,
  actor_role text,
  -- Nombre del profesional en el momento del evento: un colaborador no puede leer los perfiles de otros.
  actor_name text,
  at timestamptz not null default timezone('utc', now())
);
comment on table public.carmo_consent_events is
  'Historial append-only del consentimiento: alta, rectificación y retirada, con autor, fecha, motivo y cambio. Lo escribe el trigger log_consent_event; ningún rol de la API lo modifica.';
create index idx_carmo_consent_events_patient on public.carmo_consent_events(patient_id, at);
create index idx_carmo_consent_events_consent on public.carmo_consent_events(consent_id);

create or replace function carmo_private.fill_actor_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_name is null and new.actor_id is not null then
    select p.full_name into new.actor_name from public.carmo_profiles p where p.id = new.actor_id;
  end if;
  return new;
end;
$$;

create or replace function carmo_private.consent_changes(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', p_old -> k, 'to', p_new -> k)), '{}'::jsonb)
    from unnest(array['document_version', 'signed_date', 'investigator_id', 'future_use_choice', 'status',
                      'withdrawal_date', 'withdrawal_scope', 'withdrawal_reason']) as k
   where coalesce(p_old -> k, 'null'::jsonb) is distinct from coalesce(p_new -> k, 'null'::jsonb);
$$;

create or replace function carmo_private.log_consent_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.carmo_consent_events (consent_id, patient_id, event_type, changes, reason, actor_id, actor_role)
    values (new.id, new.patient_id, 'recorded', carmo_private.consent_changes('{}'::jsonb, to_jsonb(new)), null, auth.uid(), carmo_private.my_role());
    return new;
  end if;
  v_changes := carmo_private.consent_changes(to_jsonb(old), to_jsonb(new));
  if v_changes = '{}'::jsonb then return new; end if;
  insert into public.carmo_consent_events (consent_id, patient_id, event_type, changes, reason, actor_id, actor_role)
  values (new.id, new.patient_id,
          case when old.status = 'signed' and new.status = 'withdrawn' then 'withdrawn' else 'rectified' end,
          v_changes,
          case when old.status = 'signed' and new.status = 'withdrawn' then new.withdrawal_reason else new.correction_reason end,
          auth.uid(), carmo_private.my_role());
  return new;
end;
$$;

-- Hechos ya auditados → historial (sin inventar motivos: solo los que consten en la auditoría).
create trigger trg_carmo_consent_events_actor before insert on public.carmo_consent_events
for each row execute function carmo_private.fill_actor_name();

insert into public.carmo_consent_events (consent_id, patient_id, event_type, changes, reason, actor_id, actor_role, at)
select a.row_id, a.patient_id,
       case when a.action = 'INSERT' then 'recorded'
            when a.old_data ->> 'status' = 'signed' and a.new_data ->> 'status' = 'withdrawn' then 'withdrawn'
            else 'rectified' end,
       carmo_private.consent_changes(coalesce(a.old_data, '{}'::jsonb), a.new_data),
       case when a.action = 'INSERT' then null
            when a.old_data ->> 'status' = 'signed' and a.new_data ->> 'status' = 'withdrawn' then null
            else nullif(trim(a.new_data ->> 'correction_reason'), '') end,
       a.actor_id, a.actor_role, a.at
  from public.carmo_audit_log a
 where a.table_name = 'carmo_consents' and a.action in ('INSERT', 'UPDATE') and a.new_data is not null
   and exists (select 1 from public.carmo_consents c where c.id = a.row_id)
   and (a.action = 'INSERT' or carmo_private.consent_changes(a.old_data, a.new_data) <> '{}'::jsonb)
 order by a.id;

-- Consentimientos sin ningún evento (p. ej. cargados sin auditoría): se deja constancia del alta con la fila actual.
insert into public.carmo_consent_events (consent_id, patient_id, event_type, changes, reason, actor_id, at)
select c.id, c.patient_id, 'recorded', carmo_private.consent_changes('{}'::jsonb, to_jsonb(c)), null, c.recorded_by, c.created_at
  from public.carmo_consents c
 where not exists (select 1 from public.carmo_consent_events e where e.consent_id = c.id);

create trigger trg_carmo_consents_event after insert or update on public.carmo_consents
for each row execute function carmo_private.log_consent_event();

alter table public.carmo_consent_events enable row level security;
revoke all on public.carmo_consent_events from public, anon, authenticated;
revoke all on function carmo_private.consent_changes(jsonb, jsonb), carmo_private.log_consent_event(), carmo_private.fill_actor_name() from public, anon, authenticated;
create policy carmo_app_gate on public.carmo_consent_events as restrictive for all to authenticated
  using (app_private.has_app_access('carmo')) with check (app_private.has_app_access('carmo'));
create policy carmo_consent_events_select on public.carmo_consent_events for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)));
grant select on public.carmo_consent_events to authenticated;

-- La versión documental y el motivo de retirada pasan a poder actualizarse (las reglas están en el trigger).
grant update (document_version, withdrawal_reason) on public.carmo_consents to authenticated;

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
       and p.role in ('site_pi', 'site_investigator', 'coordinator')
  ) then
    raise exception 'El investigador responsable del consentimiento debe ser investigador vigente del centro del paciente (o la coordinación, si pertenece a ese centro).';
  end if;
  if tg_op = 'UPDATE' then
    if new.patient_id <> old.patient_id then
      raise exception 'No se puede cambiar el paciente de un consentimiento.';
    end if;
    if old.status = 'withdrawn' and new.status = 'signed' then
      raise exception 'Una retirada de consentimiento no se revierte: registre un nuevo consentimiento.';
    end if;
    if old.status = 'signed' and new.status = 'withdrawn' then
      -- Retirada: acción distinta de la rectificación.
      if (new.signed_date, new.investigator_id, new.document_version, new.future_use_choice)
         is distinct from (old.signed_date, old.investigator_id, old.document_version, old.future_use_choice) then
        raise exception 'La retirada y la rectificación son acciones distintas: registre la rectificación por separado.';
      end if;
      if length(trim(coalesce(new.withdrawal_reason, ''))) < 5 then
        raise exception 'Indique el motivo de la retirada del consentimiento (mínimo 5 caracteres).';
      end if;
    elsif (new.signed_date, new.investigator_id, new.document_version, new.future_use_choice, new.withdrawal_date, new.withdrawal_scope, new.withdrawal_reason)
          is distinct from
          (old.signed_date, old.investigator_id, old.document_version, old.future_use_choice, old.withdrawal_date, old.withdrawal_scope, old.withdrawal_reason) then
      -- Rectificación: motivo nuevo (el anterior no se arrastra).
      if length(trim(coalesce(new.correction_reason, ''))) < 5 or new.correction_reason is not distinct from old.correction_reason then
        raise exception 'Indique el motivo de la rectificación del consentimiento (mínimo 5 caracteres, distinto del anterior).';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ── Baja del paciente ───────────────────────────────────────────────────────

alter table public.carmo_patients drop constraint if exists carmo_patients_status_reason_check;
alter table public.carmo_patients add constraint carmo_patients_status_reason_check check (status_reason is null or status_reason in (
  'not_eligible', 'declined_consent', 'consent_withdrawn', 'investigator_decision', 'transfer', 'death', 'other', 'included_in_error'));
comment on column public.carmo_patients.status_reason is
  'Vocabulario TÉCNICO PROVISIONAL (no definido en el protocolo v3.0): validar con coordinación (CARMO_REGULATORY_GAPS RG-12). included_in_error y not_eligible (con estado withdrawn) = baja del paciente incluido por error o inelegible.';

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
    -- Baja por inclusión errónea o inelegibilidad: estado «retirado» con motivo y detalle obligatorios.
    if new.status_reason in ('included_in_error', 'not_eligible') then
      if new.status <> 'withdrawn' then
        raise exception 'La baja por inclusión errónea o inelegibilidad se registra como paciente retirado (no como pérdida de seguimiento).';
      end if;
      if length(trim(coalesce(new.status_reason_detail, ''))) < 5 then
        raise exception 'Indique el motivo de la baja (mínimo 5 caracteres, sin datos identificativos).';
      end if;
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
