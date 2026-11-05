-- CARMO · 04 · Cuestionarios (PROM/PREM): registro de instrumentos versionado y administraciones.
--
--   · IEXPAC (variable principal): 11 ítems 1-5; puntuación = 10 × (Σ11 − 11) / 44 (0-10), SOLO con
--     los 11 ítems respondidos (fórmula indicada en el encargo, protocolo v3.0 — página por verificar).
--     Sin imputación ni regla de puntuación condicional (no especificada).
--   · EQ-5D-3L, EVASAF y Morisky-Green: definiciones REUTILIZADAS de COAMO (EQ-5D-3L, EVASAF) y
--     DERMAPEX (Morisky-Green) por decisión del IP (05/11/2026). Sin índices ni totales no definidos:
--       EQ-5D-3L: perfil de 5 dígitos (solo completo) + EVA 0-100; sin índice de utilidad.
--       EVASAF: 10 ítems 1-5; sin total (ni protocolo ni documento lo definen; RG-17).
--       Morisky-Green: 4 ítems sí(1)/no(0); adherente = P1 no, P2 sí, P3 no, P4 no (regla DERMAPEX,
--       versión española); solo con los 4 ítems. Licencia por confirmar con el promotor (RG-40).
--   · EQ-5D-5L: no utilizado (se adopta 3L).
--   · Respuestas por ítem (códigos), sin texto de los instrumentos en el repositorio público.
--   · La BD fija versión del instrumento, evaluador, rol del evaluador, puntuación y revisión.
--   · Modificar una administración completada exige motivo; todo cambio queda en la auditoría.

create table public.carmo_instruments (
  code text primary key check (code in ('IEXPAC', 'EQ5D3L', 'EQ5D5L', 'EVASAF', 'MORISKY_GREEN')),
  version text not null,
  status text not null check (status in ('active', 'pending_specification', 'pending_license', 'retired')),
  item_count integer not null check (item_count > 0),
  item_min integer not null,
  item_max integer not null,
  has_vas boolean not null default false,
  scoring_version text,
  allowed_visits text[] not null,
  source_reference text not null,
  notes text
);

insert into public.carmo_instruments (code, version, status, item_count, item_min, item_max, has_vas, scoring_version, allowed_visits, source_reference, notes) values
  ('IEXPAC', 'IEXPAC-11', 'active', 11, 1, 5, false, 'carmo-iexpac-1', array['BASAL', 'FINAL'],
   'Protocolo v3.0, Objetivo primario: Siempre=5, Casi siempre=4, A veces=3, Casi nunca=2, Nunca=1; global = 10 × (Σ11 − 11) / 44',
   'Puntuación condicional (plataforma IEXPAC) citada pero no especificada: no implementada. Final: evaluador externo al equipo investigador.'),
  ('EQ5D3L', 'EQ-5D-3L-ES-ES', 'active', 5, 1, 3, true, 'carmo-eq5d3l-1', array['BASAL', 'FINAL'],
   'Protocolo v3.0: EuroQoL-5D (5 dimensiones + EVA 0-100). Definición reutilizada de COAMO: versión España v2.0 autoadministrada / v1.0 entrevista',
   'Dimensiones 1-5: movilidad, cuidado personal, actividades cotidianas, dolor/malestar, ansiedad/depresión; niveles 1-3. Modalidad solo autoadministrada o entrevista (fija la versión). Sin índice de utilidad. Registro de uso en EuroQol para CARMO pendiente (RG-16).'),
  ('EQ5D5L', 'no utilizado', 'retired', 5, 1, 5, true, null, array['BASAL', 'FINAL'], 'Decisión del IP (05/11/2026): se adopta EQ-5D-3L', null),
  ('EVASAF', 'EVASAF-FarmHosp2015-10it', 'active', 10, 1, 5, false, 'carmo-evasaf-1', array['BASAL', 'FINAL'],
   'Protocolo v3.0: EVASAF (Farm Hosp 2015;39(3)). Definición reutilizada de COAMO: 10 ítems, 1 muy deficiente – 5 excelente',
   'Sin puntuación total (no definida): resultado por ítem. Variable resumen para la comparación basal-final pendiente de decisión (RG-17).'),
  ('MORISKY_GREEN', 'MG-4-ES', 'active', 4, 0, 1, false, 'carmo-mg-1', array['BASAL', 'S24', 'FINAL'],
   'Protocolo v3.0: test de Morisky-Green (%), visitas inicial, S24 y final. Definición reutilizada de DERMAPEX (4 ítems sí/no)',
   'P1 ¿olvida alguna vez? · P2 ¿toma la medicación a las horas indicadas? · P3 ¿deja de tomarla si se encuentra bien? · P4 ¿deja de tomarla si le sienta mal? Sí=1, No=0. Adherente: No, Sí, No, No. Verificar que el formulario en papel sigue este orden y redacción; licencia (RG-40).');

create table public.carmo_questionnaire_administrations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.carmo_visits(id) on delete restrict,
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  instrument_code text not null references public.carmo_instruments(code) on delete restrict,
  instrument_version text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'not_done')),
  not_done_reason text check (not_done_reason is null or not_done_reason in ('patient_declined', 'unable', 'not_available', 'other')),
  not_done_detail text check (not_done_detail is null or length(not_done_detail) <= 300),
  administration_mode text check (administration_mode in ('self', 'interviewer', 'assisted')),
  data_source text check (data_source in ('electronic', 'paper')),
  administration_date date,
  responses jsonb not null default '{}'::jsonb,
  vas_value integer check (vas_value between 0 and 100),
  items_answered integer not null default 0,
  scores jsonb,
  scoring_version text,
  evaluator_id uuid references public.carmo_profiles(id) on delete set null,
  evaluator_role text,
  evaluator_conformity text check (evaluator_conformity in ('conform', 'not_conform', 'not_applicable')),
  revision integer not null default 1,
  correction_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (visit_id, instrument_code),
  constraint carmo_qa_not_done check ((status = 'not_done') = (not_done_reason is not null)),
  constraint carmo_qa_completed check (status <> 'completed' or (administration_date is not null and administration_mode is not null and data_source is not null))
);
comment on table public.carmo_questionnaire_administrations is
  'Una administración por instrumento y visita (impide duplicados). responses = {"1": 1..5, ...}; clave ausente = ítem no respondido (nunca 0).';

-- Puntuaciones (reproducibles; mismas reglas que src/domain/questionnaires.ts).
create or replace function carmo_private.iexpac_score(p_responses jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sum integer := 0;
  v_n integer := 0;
  v_i integer;
begin
  for v_i in 1..11 loop
    if p_responses ? v_i::text then
      v_sum := v_sum + (p_responses ->> v_i::text)::integer;
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n < 11 then
    return jsonb_build_object('items_answered', v_n, 'sum', null, 'global', null, 'valid', false);
  end if;
  return jsonb_build_object('items_answered', 11, 'sum', v_sum, 'global', round(10.0 * (v_sum - 11) / 44.0, 4), 'valid', true);
end;
$$;

create or replace function carmo_private.questionnaire_scores(p_code text, p_responses jsonb, p_vas integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_profile text := '';
  v_i integer;
  v_n integer := 0;
begin
  case p_code
    when 'IEXPAC' then
      return carmo_private.iexpac_score(p_responses);
    when 'EQ5D3L' then
      for v_i in 1..5 loop
        if p_responses ? v_i::text then v_profile := v_profile || (p_responses ->> v_i::text); v_n := v_n + 1; end if;
      end loop;
      return jsonb_build_object('items_answered', v_n, 'profile', case when v_n = 5 then v_profile end, 'vas', p_vas, 'valid', v_n = 5);
    when 'EVASAF' then
      select count(*) into v_n from jsonb_object_keys(p_responses);
      return jsonb_build_object('items_answered', v_n, 'complete', v_n = 10);
    when 'MORISKY_GREEN' then
      select count(*) into v_n from jsonb_object_keys(p_responses);
      if v_n < 4 then
        return jsonb_build_object('items_answered', v_n, 'adherent', null, 'valid', false);
      end if;
      return jsonb_build_object('items_answered', 4, 'valid', true,
        'adherent', (p_responses ->> '1')::integer = 0 and (p_responses ->> '2')::integer = 1
                    and (p_responses ->> '3')::integer = 0 and (p_responses ->> '4')::integer = 0);
    else
      return null;
  end case;
end;
$$;

create or replace function carmo_private.enforce_questionnaire()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inst public.carmo_instruments%rowtype;
  v_visit public.carmo_visits%rowtype;
  v_key text;
  v_val jsonb;
  v_n integer := 0;
begin
  select * into v_inst from public.carmo_instruments where code = new.instrument_code;
  select * into v_visit from public.carmo_visits where id = new.visit_id;

  if tg_op = 'UPDATE' then
    if new.visit_id <> old.visit_id or new.instrument_code <> old.instrument_code then
      raise exception 'No se puede cambiar la visita ni el instrumento de una administración.';
    end if;
    if new.revision <> old.revision then raise exception 'Conflicto de edición: otra persona guardó antes. Recargue.'; end if;
    if old.status = 'completed' and coalesce(trim(new.correction_reason), '') = '' then
      raise exception 'Indique el motivo para modificar un cuestionario completado.';
    end if;
    new.revision := old.revision + 1;
    new.instrument_version := old.instrument_version;
    new.evaluator_id := old.evaluator_id;
    new.evaluator_role := old.evaluator_role;
    new.evaluator_conformity := old.evaluator_conformity;
  else
    if v_inst.status <> 'active' then
      raise exception 'El instrumento % no está habilitado (%): pendiente de versión/licencia/puntuación validadas.', new.instrument_code, v_inst.status;
    end if;
    if not (v_visit.visit_code = any (v_inst.allowed_visits)) then
      raise exception '% no se administra en la visita %.', new.instrument_code, v_visit.visit_code;
    end if;
    if v_visit.status = 'cancelled' then raise exception 'Visita anulada.'; end if;
    new.instrument_version := v_inst.version;
    new.revision := 1;
    new.evaluator_id := auth.uid();
    new.evaluator_role := carmo_private.my_role();
    -- Protocolo v3.0: el IEXPAC final lo cumplimenta un miembro de un equipo externo al equipo
    -- investigador. Se registra la conformidad, sin bloquear (texto contradictorio sobre el basal, RG-32).
    new.evaluator_conformity := case
      when new.instrument_code = 'IEXPAC' and v_visit.visit_code = 'FINAL'
        then case when new.evaluator_role = 'external_evaluator' then 'conform' else 'not_conform' end
      else 'not_applicable' end;
    new.correction_reason := null;
  end if;
  perform carmo_private.assert_visit_open(new.visit_id);
  new.patient_id := v_visit.patient_id;

  -- EQ-5D-3L: la versión depende de la modalidad (v2.0 autoadministrada / v1.0 entrevista).
  if new.instrument_code = 'EQ5D3L' then
    if new.administration_mode = 'assisted' then
      raise exception 'EQ-5D-3L: modalidad autoadministrada o entrevista (versiones distintas); «con ayuda» no está prevista.';
    end if;
    new.instrument_version := case new.administration_mode
      when 'self' then 'EQ-5D-3L-ES-ES-v2.0-self'
      when 'interviewer' then 'EQ-5D-3L-ES-ES-v1.0-interviewer'
      else 'EQ-5D-3L-ES-ES (modalidad no indicada)' end;
  end if;

  if jsonb_typeof(new.responses) <> 'object' then raise exception 'Formato de respuestas no válido.'; end if;
  for v_key, v_val in select * from jsonb_each(new.responses) loop
    if v_key !~ '^[0-9]+$' or v_key::integer < 1 or v_key::integer > v_inst.item_count then
      raise exception 'Ítem % no existe en %.', v_key, new.instrument_code;
    end if;
    if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric)
       or (v_val #>> '{}')::integer < v_inst.item_min or (v_val #>> '{}')::integer > v_inst.item_max then
      raise exception 'Respuesta fuera de rango en el ítem % (% a %).', v_key, v_inst.item_min, v_inst.item_max;
    end if;
    v_n := v_n + 1;
  end loop;
  if not v_inst.has_vas and new.vas_value is not null then raise exception 'Este instrumento no tiene escala visual.'; end if;
  if new.status = 'not_done' and (v_n > 0 or new.vas_value is not null) then
    raise exception 'Un cuestionario no realizado no lleva respuestas.';
  end if;
  if new.status = 'completed' and v_n = 0 and new.vas_value is null then raise exception 'Un cuestionario completado necesita al menos una respuesta.'; end if;
  if new.administration_date > current_date then raise exception 'Fecha futura no admitida.'; end if;

  new.items_answered := v_n;
  if new.status = 'completed' and v_inst.scoring_version is not null then
    new.scores := carmo_private.questionnaire_scores(new.instrument_code, new.responses, new.vas_value);
    new.scoring_version := v_inst.scoring_version;
  else
    new.scores := null;
    new.scoring_version := null;
  end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    new.completed_at := timezone('utc', now());
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_carmo_qa_rules before insert or update on public.carmo_questionnaire_administrations
for each row execute function carmo_private.enforce_questionnaire();
create trigger trg_carmo_qa_audit after insert or update or delete on public.carmo_questionnaire_administrations
for each row execute function carmo_private.write_audit_log();
create trigger trg_carmo_instruments_audit after insert or update or delete on public.carmo_instruments
for each row execute function carmo_private.write_audit_log();

alter table public.carmo_instruments enable row level security;
alter table public.carmo_questionnaire_administrations enable row level security;
revoke all on public.carmo_instruments, public.carmo_questionnaire_administrations from public, anon, authenticated;
revoke all on function carmo_private.iexpac_score(jsonb), carmo_private.questionnaire_scores(text, jsonb, integer), carmo_private.enforce_questionnaire() from public, anon, authenticated;

create policy carmo_app_gate on public.carmo_instruments as restrictive for all to authenticated
  using (app_private.has_app_access('carmo')) with check (app_private.has_app_access('carmo'));
create policy carmo_app_gate on public.carmo_questionnaire_administrations as restrictive for all to authenticated
  using (app_private.has_app_access('carmo')) with check (app_private.has_app_access('carmo'));

create policy carmo_instruments_select on public.carmo_instruments for select to authenticated using (carmo_private.is_active_user());
-- Lectura: quien ve datos clínicos del centro y el evaluador externo del centro.
create policy carmo_qa_select on public.carmo_questionnaire_administrations for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id))
         or carmo_private.can_write_questionnaire(carmo_private.patient_center(patient_id)));
create policy carmo_qa_insert on public.carmo_questionnaire_administrations for insert to authenticated
  with check (carmo_private.can_write_questionnaire(carmo_private.visit_center(visit_id)));
create policy carmo_qa_update on public.carmo_questionnaire_administrations for update to authenticated
  using (carmo_private.can_write_questionnaire(carmo_private.visit_center(visit_id)))
  with check (carmo_private.can_write_questionnaire(carmo_private.visit_center(visit_id)));

grant select on public.carmo_instruments, public.carmo_questionnaire_administrations to authenticated;
grant insert (visit_id, patient_id, instrument_code, status, not_done_reason, not_done_detail, administration_mode, data_source,
              administration_date, responses, vas_value),
      update (status, not_done_reason, not_done_detail, administration_mode, data_source, administration_date, responses, vas_value,
              revision, correction_reason)
  on public.carmo_questionnaire_administrations to authenticated;
