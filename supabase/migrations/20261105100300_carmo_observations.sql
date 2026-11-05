-- CARMO · 03 · Variables del eCRD (catálogo versionado) y observaciones de solo-adición, más la
-- evolución farmacéutica por visita.
--
-- Por qué un catálogo + observaciones (modelo entidad-atributo-valor tipado, como REDCap):
--   · El protocolo v3.0 aún no está transcrito: dominios, unidades y visitas de cada variable deben
--     poder fijarse y versionarse SIN migraciones destructivas y sin inventarlos ahora.
--   · Cada medición conserva fecha, valor, unidad, origen y contexto temporal (antecedente previo
--     frente a evento incidente durante el estudio).
--   · Nunca se sobrescribe: una corrección es una fila nueva que «sustituye» (supersedes_id) a la
--     anterior con motivo obligatorio. La vista carmo_observations_current muestra el valor vigente.
--   · Variables con estado 'blocked' (dominio no definido en la fuente) no admiten datos.

create table public.carmo_variables (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  section text not null check (section in (
    'demographic', 'sociosanitary', 'cv_history', 'cv_risk_factor', 'anthropometric', 'laboratory', 'cv_event', 'pharmacotherapy', 'other')),
  label text not null,
  value_type text not null check (value_type in ('numeric', 'integer', 'boolean', 'categorical', 'date', 'text')),
  units text[] check (units is null or cardinality(units) > 0),
  allowed_values jsonb,
  min_value numeric,
  max_value numeric,
  allowed_visits text[] not null default array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'],
  allowed_contexts text[] not null default array['history_prior_inclusion', 'baseline', 'follow_up', 'incident_event'],
  status text not null default 'provisional' check (status in ('provisional', 'validated', 'blocked', 'retired')),
  definition_version integer not null default 1,
  source_reference text not null,
  notes text,
  constraint carmo_var_numeric_units check (value_type not in ('numeric', 'integer') or units is not null or status = 'blocked'),
  constraint carmo_var_categorical_values check (value_type <> 'categorical' or allowed_values is not null or status = 'blocked')
);
comment on table public.carmo_variables is
  'Diccionario de variables del eCRD (docs/CARMO_DATA_DICTIONARY.md). provisional = definida con la información disponible y pendiente de verificar contra el protocolo (página); validated = verificada; blocked = sin dominio definido, no admite datos.';

-- Siembra transcrita del protocolo v3.0 (apartado «Valoración de los objetivos», índice p. 14, y
-- «Esquema de procedimientos»: parámetros clínicos y analíticos en visita inicial y final). Estado
-- 'provisional' hasta que la coordinación concilie con la versión aprobada (v2.0) y valide.
insert into public.carmo_variables (code, section, label, value_type, units, allowed_values, min_value, max_value, allowed_visits, allowed_contexts, status, source_reference, notes) values
  ('age_years', 'demographic', 'Edad', 'integer', array['años'], null, 18, 120, array['BASAL'], array['baseline'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Edad en años a la inclusión. Sin fecha de nacimiento (identificador).'),
  ('sex', 'demographic', 'Sexo', 'categorical', null, '{"M": "Masculino", "F": "Femenino", "unknown": "Desconocido"}'::jsonb, null, null, array['BASAL'], array['baseline'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Dominio del protocolo: M/F/desconocido.'),
  ('weight', 'anthropometric', 'Peso', 'numeric', array['kg'], null, 20, 350, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('height', 'anthropometric', 'Altura', 'numeric', array['cm'], null, 100, 230, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'IMC derivado (no almacenado): peso / (altura/100)^2, kg/m2.'),
  ('education_level', 'sociosanitary', 'Nivel de estudios', 'categorical', null, '{"none": "Sin estudios", "primary": "Primaria", "secondary": "Secundaria", "higher": "Estudios superiores"}'::jsonb, null, null, array['BASAL'], array['baseline'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('occupation', 'sociosanitary', 'Profesión', 'text', null, null, null, null, array['BASAL'], array['baseline'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Texto libre según el protocolo: no incluir el centro de trabajo ni datos que identifiquen.'),
  ('family_support', 'sociosanitary', 'Soporte familiar disponible', 'boolean', null, null, null, null, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('familial_hypercholesterolemia', 'cv_history', 'Patología: hipercolesterolemia familiar', 'boolean', null, null, null, null, array['BASAL'], array['history_prior_inclusion', 'baseline'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', '«Patología» del protocolo (HCF y/o prevención secundaria). Criterio diagnóstico no especificado.'),
  ('secondary_prevention', 'cv_history', 'Patología: prevención secundaria cardiovascular', 'boolean', null, null, null, null, array['BASAL'], array['history_prior_inclusion', 'baseline'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', '«Patología» del protocolo. Definición operativa no especificada.'),
  ('naive_patient', 'pharmacotherapy', 'Paciente naïve: nuevo a tratamiento (variable exploratoria)', 'boolean', null, null, null, null, array['BASAL'], array['baseline'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Protocolo: «como variable exploratoria se valorará el modelo CMO en pacientes naïve». Definición del IP (05/11/2026): paciente nuevo a tratamiento, es decir, que inicia el medicamento de uso hospitalario del estudio (alirocumab, evolocumab, inclisirán o evinacumab) en el momento de la inclusión. Se contrasta con el registro de tratamientos.'),
  ('tobacco_use', 'cv_risk_factor', 'Hábito tabáquico: consumo de tabaco', 'boolean', null, null, null, null, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('cigarettes_per_day', 'cv_risk_factor', 'Hábito tabáquico: cigarrillos diarios', 'integer', array['cig/día'], null, 0, 200, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('smoking_years', 'cv_risk_factor', 'Hábito tabáquico: años fumando', 'integer', array['años'], null, 0, 90, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('years_since_quitting', 'cv_risk_factor', 'Hábito tabáquico: años sin fumar', 'integer', array['años'], null, 0, 90, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('diabetes', 'cv_risk_factor', 'Diabetes', 'boolean', null, null, null, null, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Tipo no especificado.'),
  ('hypertension', 'cv_risk_factor', 'Hipertensión', 'boolean', null, null, null, null, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('ldl_c', 'laboratory', 'LDL-c', 'numeric', array['mg/dL', 'mmol/L'], null, 0, 1000, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Perfil lipídico. Unidad no especificada: se guarda la registrada, sin conversión. Método no especificado.'),
  ('non_hdl_c', 'laboratory', 'Colesterol no-HDL', 'numeric', array['mg/dL', 'mmol/L'], null, 0, 1500, array['BASAL', 'FINAL'], array['baseline', 'follow_up'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Medido o derivado (CT − HDL): no especificado.'),
  ('acs', 'cv_event', 'Síndrome coronario agudo', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Incluye IAM y angina inestable según el protocolo. Antecedente vs evento incidente.'),
  ('ami', 'cv_event', 'Infarto agudo de miocardio', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('unstable_angina', 'cv_event', 'Angina inestable', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('chronic_coronary_disease', 'cv_event', 'Enfermedad coronaria crónica', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('ischemic_stroke', 'cv_event', 'Ictus isquémico', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('tia', 'cv_event', 'Ataque isquémico transitorio', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('coronary_revascularization', 'cv_event', 'Revascularización coronaria', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null),
  ('other_arterial_revascularization', 'cv_event', 'Revascularización de otras arterias', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', 'Territorio no especificado.'),
  ('peripheral_artery_disease', 'cv_event', 'Enfermedad arterial periférica', 'boolean', null, null, null, null, array['BASAL', 'S12', 'S24', 'S36', 'S48', 'FINAL', 'EXTRA'], array['history_prior_inclusion', 'incident_event'], 'provisional', 'Protocolo v3.0, Valoración de los objetivos (índice p. 14)', null);

create table public.carmo_observations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  visit_id uuid references public.carmo_visits(id) on delete restrict,
  variable_code text not null references public.carmo_variables(code) on delete restrict,
  variable_definition_version integer not null,
  value_numeric numeric,
  value_boolean boolean,
  value_text text check (value_text is null or length(value_text) <= 500),
  value_date date,
  unit text,
  is_missing boolean not null default false,
  missing_reason text check (missing_reason is null or missing_reason in ('not_done', 'not_available', 'not_applicable', 'unknown', 'patient_declined')),
  observed_date date not null,
  data_source text not null check (data_source in ('clinical_record', 'patient_interview', 'lab_report', 'dispensing_record', 'other')),
  temporal_context text not null check (temporal_context in ('history_prior_inclusion', 'baseline', 'follow_up', 'incident_event')),
  supersedes_id uuid references public.carmo_observations(id) on delete restrict,
  correction_reason text,
  recorded_by uuid references public.carmo_profiles(id) on delete set null,
  recorded_at timestamptz not null default timezone('utc', now()),
  constraint carmo_obs_missing check (
    (is_missing and missing_reason is not null and value_numeric is null and value_boolean is null and value_text is null and value_date is null)
    or (not is_missing and missing_reason is null and num_nonnulls(value_numeric, value_boolean, value_text, value_date) = 1)
  ),
  constraint carmo_obs_correction check ((supersedes_id is null) = (correction_reason is null))
);
create unique index uq_carmo_obs_supersedes on public.carmo_observations(supersedes_id) where supersedes_id is not null;
create index idx_carmo_obs_patient on public.carmo_observations(patient_id, variable_code, observed_date);
create index idx_carmo_obs_visit on public.carmo_observations(visit_id);
comment on table public.carmo_observations is 'Observaciones de solo-adición. Ninguna fila se modifica ni se borra desde la API: una corrección es una fila nueva con supersedes_id y motivo.';

create or replace function carmo_private.enforce_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_var public.carmo_variables%rowtype;
  v_visit public.carmo_visits%rowtype;
  v_prev public.carmo_observations%rowtype;
  v_patient public.carmo_patients%rowtype;
begin
  select * into v_var from public.carmo_variables where code = new.variable_code;
  if v_var.status in ('blocked', 'retired') then
    raise exception 'La variable % no admite datos (estado %): dominio no definido o retirada.', new.variable_code, v_var.status;
  end if;
  select * into v_patient from public.carmo_patients where id = new.patient_id;
  if v_patient.status not in ('included', 'withdrawn', 'lost_to_followup', 'completed') then
    raise exception 'Solo se registran datos de pacientes incluidos.';
  end if;
  new.variable_definition_version := v_var.definition_version;

  if new.visit_id is not null then
    select * into v_visit from public.carmo_visits where id = new.visit_id;
    if v_visit.patient_id <> new.patient_id then raise exception 'La visita no pertenece al paciente.'; end if;
    if v_visit.status = 'cancelled' then raise exception 'No se registran datos en una visita anulada.'; end if;
    perform carmo_private.assert_visit_open(new.visit_id);
    if not (v_visit.visit_code = any (v_var.allowed_visits)) then
      raise exception 'La variable % no se recoge en la visita %.', new.variable_code, v_visit.visit_code;
    end if;
  end if;
  if not (new.temporal_context = any (v_var.allowed_contexts)) then
    raise exception 'Contexto temporal % no admitido para %.', new.temporal_context, new.variable_code;
  end if;
  if new.temporal_context = 'incident_event' and new.observed_date < v_patient.inclusion_date then
    raise exception 'Un evento incidente no puede ser anterior a la inclusión (%): regístrelo como antecedente.', v_patient.inclusion_date;
  end if;
  if new.temporal_context = 'history_prior_inclusion' and new.observed_date > v_patient.inclusion_date then
    raise exception 'Un antecedente no puede ser posterior a la inclusión: regístrelo como evento incidente.';
  end if;
  if new.observed_date > current_date then raise exception 'La fecha de la observación no puede ser futura.'; end if;

  if not new.is_missing then
    case v_var.value_type
      when 'numeric', 'integer' then
        if new.value_numeric is null then raise exception 'La variable % es numérica.', new.variable_code; end if;
        if v_var.value_type = 'integer' and new.value_numeric <> trunc(new.value_numeric) then raise exception 'La variable % es entera.', new.variable_code; end if;
        if (v_var.min_value is not null and new.value_numeric < v_var.min_value) or (v_var.max_value is not null and new.value_numeric > v_var.max_value) then
          raise exception 'Valor de % fuera del rango admitido [%, %].', new.variable_code, v_var.min_value, v_var.max_value;
        end if;
        if new.unit is null or not (new.unit = any (v_var.units)) then
          raise exception 'Unidad no admitida para % (admitidas: %).', new.variable_code, array_to_string(v_var.units, ', ');
        end if;
      when 'boolean' then
        if new.value_boolean is null then raise exception 'La variable % es sí/no.', new.variable_code; end if;
      when 'categorical' then
        if new.value_text is null or not (v_var.allowed_values ? new.value_text) then raise exception 'Categoría no admitida para %.', new.variable_code; end if;
      when 'date' then
        if new.value_date is null then raise exception 'La variable % es una fecha.', new.variable_code; end if;
      when 'text' then
        if new.value_text is null then raise exception 'La variable % es texto.', new.variable_code; end if;
    end case;
    if v_var.value_type not in ('numeric', 'integer') and new.unit is not null then
      raise exception 'La variable % no lleva unidad.', new.variable_code;
    end if;
  elsif new.unit is not null then
    raise exception 'Un dato ausente no lleva unidad.';
  end if;

  if new.supersedes_id is not null then
    select * into v_prev from public.carmo_observations where id = new.supersedes_id;
    if v_prev.patient_id <> new.patient_id or v_prev.variable_code <> new.variable_code
       or v_prev.visit_id is distinct from new.visit_id then
      raise exception 'Una corrección debe referirse al mismo paciente, variable y visita.';
    end if;
    if length(trim(new.correction_reason)) < 5 then raise exception 'Motivo de corrección demasiado breve.'; end if;
  end if;

  if auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  new.recorded_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_carmo_obs_rules before insert on public.carmo_observations
for each row execute function carmo_private.enforce_observation();
create trigger trg_carmo_obs_audit after insert or update or delete on public.carmo_observations
for each row execute function carmo_private.write_audit_log();
create trigger trg_carmo_variables_audit after insert or update or delete on public.carmo_variables
for each row execute function carmo_private.write_audit_log();

create view public.carmo_observations_current with (security_invoker = true) as
select o.* from public.carmo_observations o
 where not exists (select 1 from public.carmo_observations n where n.supersedes_id = o.id);

-- ── Evolución farmacéutica por visita ───────────────────────────────────────

create table public.carmo_visit_evolutions (
  visit_id uuid primary key references public.carmo_visits(id) on delete restrict,
  patient_id uuid not null references public.carmo_patients(id) on delete restrict,
  clinical_evolution text check (clinical_evolution is null or length(clinical_evolution) <= 4000),
  pharmacotherapy_update text check (pharmacotherapy_update is null or length(pharmacotherapy_update) <= 4000),
  motivational_followup text check (motivational_followup is null or length(motivational_followup) <= 4000),
  drp_identified boolean,
  drp_description text check (drp_description is null or length(drp_description) <= 2000),
  revision integer not null default 1,
  correction_reason text,
  updated_by uuid references public.carmo_profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint carmo_evo_drp check (drp_identified is true or drp_description is null)
);
comment on table public.carmo_visit_evolutions is
  'Texto libre: NO introducir nombres, NHC, teléfonos ni otros identificadores. PRM sin taxonomía oficial transcrita (RG-15).';

create or replace function carmo_private.enforce_evolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.patient_id := (select v.patient_id from public.carmo_visits v where v.id = new.visit_id);
  perform carmo_private.assert_visit_open(new.visit_id);
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
create trigger trg_carmo_evo_rules before insert or update on public.carmo_visit_evolutions
for each row execute function carmo_private.enforce_evolution();
create trigger trg_carmo_evo_audit after insert or update or delete on public.carmo_visit_evolutions
for each row execute function carmo_private.write_audit_log();

-- ── RLS y privilegios ───────────────────────────────────────────────────────

alter table public.carmo_variables enable row level security;
alter table public.carmo_observations enable row level security;
alter table public.carmo_visit_evolutions enable row level security;
revoke all on public.carmo_variables, public.carmo_observations, public.carmo_visit_evolutions, public.carmo_observations_current
  from public, anon, authenticated;
revoke all on function carmo_private.enforce_observation(), carmo_private.enforce_evolution() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['carmo_variables', 'carmo_observations', 'carmo_visit_evolutions'] loop
    execute format(
      'create policy carmo_app_gate on public.%I as restrictive for all to authenticated
         using (app_private.has_app_access(''carmo'')) with check (app_private.has_app_access(''carmo''))', v_table);
  end loop;
end
$$;

create policy carmo_variables_select on public.carmo_variables for select to authenticated using (carmo_private.is_active_user());
create policy carmo_obs_select on public.carmo_observations for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_obs_insert on public.carmo_observations for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.patient_center(patient_id)));
create policy carmo_evo_select on public.carmo_visit_evolutions for select to authenticated
  using (carmo_private.can_read_clinical(carmo_private.visit_center(visit_id)));
create policy carmo_evo_insert on public.carmo_visit_evolutions for insert to authenticated
  with check (carmo_private.can_write_clinical(carmo_private.visit_center(visit_id)));
create policy carmo_evo_update on public.carmo_visit_evolutions for update to authenticated
  using (carmo_private.can_write_clinical(carmo_private.visit_center(visit_id)))
  with check (carmo_private.can_write_clinical(carmo_private.visit_center(visit_id)));

grant select on public.carmo_variables, public.carmo_observations, public.carmo_visit_evolutions, public.carmo_observations_current to authenticated;
grant insert (patient_id, visit_id, variable_code, value_numeric, value_boolean, value_text, value_date, unit, is_missing, missing_reason,
              observed_date, data_source, temporal_context, supersedes_id, correction_reason)
  on public.carmo_observations to authenticated;
grant insert (visit_id, clinical_evolution, pharmacotherapy_update, motivational_followup, drp_identified, drp_description),
      update (clinical_evolution, pharmacotherapy_update, motivational_followup, drp_identified, drp_description, revision, correction_reason)
  on public.carmo_visit_evolutions to authenticated;
