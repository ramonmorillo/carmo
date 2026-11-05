-- CARMO · 07 · Modelo de estratificación CMO cardiovascular (MAPEX-SEFH) y catálogo de actuaciones.
--
-- Fuente: «Adaptación del Modelo de Atención Farmacéutica CMO en el Paciente con Patologías
-- Cardiovasculares» (MAPEX-SEFH), aportado por el IP el 05/11/2026: Tablas 1-4 (20 variables, pesos 1-4),
-- apartado IV (puntos de corte P2 ≥ 17, P1 ≥ 23; máximo 42; embarazo → P1; < 18 años → modelo
-- pediátrico) y apartado V (Tablas 5-7, actuaciones acumulativas; periodicidad).
--
-- · La definición incrustada es EXACTAMENTE src/domain/cmoCardioModel.json (prueba automática).
-- · La BD rehace el cálculo (carmo_private.cmo_compute) y rechaza cualquier discrepancia con el cliente.
-- · El modelo se carga como BORRADOR: decisiones de interpretación pendientes de confirmar por el IP
--   (docs/CARMO_CMO_MODEL.md §4). Se activa con un UPDATE administrativo (status = 'validated').
-- · Validación profesional: confirmar o ELEVAR la prioridad con motivo (el modelo no prevé rebajarla).
-- · Catálogo de actuaciones (Tablas 5-7 + entrevista motivacional y telefarmacia): transcripción literal
--   resumida, cargado como validado.
-- Migración nueva (las 00-06 ya están aplicadas y son inmutables).

create or replace function carmo_private.cmo_compute(p_definition jsonb, p_inputs jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_var jsonb;
  v_opt jsonb;
  v_code text;
  v_block text;
  v_value text;
  v_points integer;
  v_total integer := 0;
  v_blocks jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_forced integer := 3;
  v_applied jsonb := '[]'::jsonb;
  v_score_priority integer;
  v_n integer := 0;
begin
  if jsonb_typeof(p_inputs) <> 'object' then raise exception 'Entradas del modelo CMO no válidas.'; end if;
  for v_var in select * from jsonb_array_elements(p_definition -> 'variables') loop
    v_code := v_var ->> 'code';
    v_block := v_var ->> 'block';
    v_value := p_inputs ->> v_code;
    if v_value is null then
      raise exception 'Falta la variable % del modelo CMO: no se asigna prioridad sin todas las variables.', v_code;
    end if;
    select o into v_opt from jsonb_array_elements(v_var -> 'options') o where o ->> 'value' = v_value;
    if v_opt is null then raise exception 'Valor % no admitido para la variable % del modelo CMO.', v_value, v_code; end if;
    if v_opt ? 'excludes' then raise exception 'Modelo CMO no aplicable: %.', v_opt ->> 'excludes'; end if;
    v_points := (v_opt ->> 'points')::integer;
    v_total := v_total + v_points;
    v_blocks := jsonb_set(v_blocks, array[v_block], to_jsonb(coalesce((v_blocks ->> v_block)::integer, 0) + v_points));
    v_items := v_items || jsonb_build_array(jsonb_build_object('code', v_code, 'block', v_block, 'value', v_value, 'points', v_points));
    if v_opt ? 'forcePriority' then
      v_forced := least(v_forced, (v_opt ->> 'forcePriority')::integer);
      v_applied := v_applied || to_jsonb(v_code);
    end if;
    v_n := v_n + 1;
  end loop;
  if (select count(*) from jsonb_object_keys(p_inputs)) <> v_n then
    raise exception 'Las entradas contienen variables que no pertenecen al modelo CMO.';
  end if;
  v_score_priority := case
    when v_total >= (p_definition #>> '{thresholds,priority1Min}')::integer then 1
    when v_total >= (p_definition #>> '{thresholds,priority2Min}')::integer then 2
    else 3 end;
  return jsonb_build_object('total', v_total, 'blocks', v_blocks, 'items', v_items,
    'score_priority', v_score_priority, 'priority', least(v_score_priority, v_forced), 'applied_exceptions', v_applied);
end;
$$;

create or replace function carmo_private.enforce_stratification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.carmo_visits%rowtype;
  v_prev public.carmo_stratifications%rowtype;
  v_def jsonb;
  v_result jsonb;
begin
  if tg_op = 'INSERT' then
    select m.definition into v_def from public.carmo_cmo_models m where m.version = new.model_version and m.status = 'validated';
    if v_def is null then
      raise exception 'Modelo CMO % no validado: la estratificación se activa cuando la coordinación valida el modelo.', new.model_version;
    end if;
    select * into v_visit from public.carmo_visits where id = new.visit_id;
    if v_visit.patient_id <> new.patient_id then raise exception 'La visita no pertenece al paciente.'; end if;
    if v_visit.status = 'cancelled' then raise exception 'Visita anulada.'; end if;
    perform carmo_private.assert_visit_open(new.visit_id);
    v_result := carmo_private.cmo_compute(v_def, new.inputs);
    if new.total_score is distinct from (v_result ->> 'total')::numeric
       or new.calculated_priority is distinct from (v_result ->> 'priority')::integer then
      raise exception 'Discrepancia entre el cálculo de la aplicación (% puntos, P%) y el de la base de datos (% puntos, P%). No se guarda.',
        new.total_score, new.calculated_priority, v_result ->> 'total', v_result ->> 'priority';
    end if;
    new.item_results := v_result;
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
  if (new.patient_id, new.visit_id, new.model_version, new.engine_version, new.inputs, new.item_results, new.total_score,
      new.calculated_priority, new.justification, new.calculated_by, new.calculated_at, new.supersedes_id)
     is distinct from
     (old.patient_id, old.visit_id, old.model_version, old.engine_version, old.inputs, old.item_results, old.total_score,
      old.calculated_priority, old.justification, old.calculated_by, old.calculated_at, old.supersedes_id) then
    raise exception 'El resultado de una estratificación es inmutable: reestratifique (registro nuevo).';
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
revoke all on function carmo_private.cmo_compute(jsonb, jsonb), carmo_private.enforce_stratification() from public, anon, authenticated;

-- El modelo permite ELEVAR la prioridad por criterio profesional (apartado V); no prevé rebajarla.
alter table public.carmo_stratifications drop constraint carmo_strat_validation;
alter table public.carmo_stratifications add constraint carmo_strat_validation check (
  (validation_status = 'pending' and final_priority is null)
  or (validation_status = 'confirmed' and final_priority = calculated_priority)
  or (validation_status = 'modified' and final_priority is not null and final_priority < calculated_priority and validation_reason is not null)
);
comment on column public.carmo_stratifications.item_results is 'Resultado calculado por la BD (carmo_private.cmo_compute): total, bloques, ítems y prioridad.';

insert into public.carmo_cmo_models (version, status, source_reference, definition, definition_sha256)
select d ->> 'version', 'draft', d ->> 'source', d, encode(sha256(convert_to(d::text, 'UTF8')), 'hex')
  from (select $cmo_definition${
  "version": "CMO-CV-SEFH-2024",
  "title": "Adaptación del Modelo de Atención Farmacéutica CMO en el Paciente con Patologías Cardiovasculares (MAPEX-SEFH)",
  "source": "Documento oficial MAPEX-SEFH aportado por el IP el 05/11/2026: apartados III (Tablas 1-4), IV (puntos de corte, excepciones) y V (actuaciones y periodicidad)",
  "blocks": [
    { "code": "demographic", "label": "Variables demográficas (Tabla 1)", "max": 7 },
    { "code": "clinical", "label": "Variables clínicas (Tabla 2)", "max": 20 },
    { "code": "pharmacotherapy", "label": "Variables farmacoterapéuticas (Tabla 3)", "max": 12 },
    { "code": "sociosanitary", "label": "Variables sociosanitarias (Tabla 4)", "max": 3 }
  ],
  "maxScore": 42,
  "thresholds": { "priority1Min": 23, "priority2Min": 17 },
  "variables": [
    { "code": "age_group", "block": "demographic", "group": "Edad", "label": "Edad", "options": [
      { "value": "under_18", "label": "Menor de 18 años", "points": 0, "excludes": "Paciente pediátrico: aplicar el modelo CMO de paciente crónico pediátrico, no este modelo" },
      { "value": "19_49", "label": "Entre 19 y 49 años", "points": 0 },
      { "value": "50_69", "label": "Entre 50 y 69 años", "points": 2 },
      { "value": "70_plus", "label": "70 años o más", "points": 3 }
    ] },
    { "code": "pregnancy", "block": "demographic", "group": "Embarazo", "label": "Paciente embarazada", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí (Prioridad 1 con independencia de la puntuación)", "points": 0, "forcePriority": 1 }
    ] },
    { "code": "nutritional_status", "block": "demographic", "group": "Peso / estado nutricional", "label": "Peso / estado nutricional (IMC)", "options": [
      { "value": "undernutrition", "label": "Desnutrición (IMC < 18,4)", "points": 1 },
      { "value": "normal", "label": "Peso normal (IMC 18,5-24,9)", "points": 0 },
      { "value": "overweight", "label": "Sobrepeso (IMC 25-30)", "points": 1 },
      { "value": "obesity", "label": "Obesidad (IMC > 30 y < 40)", "points": 2 },
      { "value": "severe_obesity", "label": "Obesidad grave (IMC > 40)", "points": 3 }
    ] },
    { "code": "female_cv_condition", "block": "demographic", "group": "Sexo", "label": "Mujer con fibrilación auricular, hipertensión pulmonar (< 45 años / edad fértil) o cardiopatía isquémica", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 1 }
    ] },
    { "code": "base_cv_pathology", "block": "clinical", "group": "Patología cardiovascular de base", "label": "Patología CV de base de mayor riesgo: FA, hipertensión pulmonar, insuficiencia cardiaca, prevención secundaria en ECV aterosclerótica (cardiopatía isquémica crónica, EAP, cerebrovascular), síndrome coronario agudo o trasplante cardiaco", "options": [
      { "value": "no", "label": "No (p. ej., solo hipercolesterolemia familiar en prevención primaria)", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 1 }
    ] },
    { "code": "cv_comorbidity", "block": "clinical", "group": "Comorbilidad cardiovascular", "label": "Al menos una patología CV además de la de base (amiloidosis cardiaca, cardiopatía isquémica/EAC/IAM previo, valvulopatía, EAP, FA, hipertensión pulmonar, ictus, insuficiencia cardiaca)", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 2 }
    ] },
    { "code": "hf_ischemic_combination", "block": "clinical", "group": "Comorbilidad cardiovascular", "label": "Combinación de insuficiencia cardiaca y cardiopatía isquémica", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 3 }
    ] },
    { "code": "hf_af_combination", "block": "clinical", "group": "Comorbilidad cardiovascular", "label": "Combinación de insuficiencia cardiaca y fibrilación auricular", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 3 }
    ] },
    { "code": "non_cv_comorbidity", "block": "clinical", "group": "Comorbilidad no cardiovascular", "label": "Al menos una: anemia, apnea obstructiva del sueño, enfermedad inflamatoria (linfopenia), EPOC, VIH, cáncer activo, ERC (TFGe < 60), diabetes mellitus tipo 1 o 2", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 1 }
    ] },
    { "code": "dyslipidemia_above_target", "block": "clinical", "group": "Dislipemia", "label": "cLDL por encima del objetivo (< 40 mg/dl tras segundo evento en 2 años; < 55 mg/dl prevención secundaria de riesgo muy alto / IC de riesgo muy elevado; < 70 mg/dl riesgo alto)", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 2 }
    ] },
    { "code": "lvef_below_40", "block": "clinical", "group": "Gravedad de la afectación", "label": "Fracción de eyección del ventrículo izquierdo < 40 %", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 1 }
    ] },
    { "code": "venous_thromboembolism", "block": "clinical", "group": "Gravedad de la afectación", "label": "Tromboembolismo venoso", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 1 }
    ] },
    { "code": "hypertension", "block": "clinical", "group": "Hipertensión arterial", "label": "PAS ≥ 140 / PAD ≥ 90 mmHg, o tratamiento antihipertensivo con indicación de HTA si se desconocen los valores", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 2 }
    ] },
    { "code": "admissions_emergencies", "block": "clinical", "group": "Ingresos / urgencias en el último año", "label": "≥ 2 hospitalizaciones en 12 meses y/o ≥ 3 visitas a urgencias en el último año relacionadas con mal control de la patología o del tratamiento", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 2 }
    ] },
    { "code": "first_year_post_coronary_event", "block": "clinical", "group": "Primer año tras un evento coronario", "label": "Síndrome coronario o revascularización en los 12 meses previos", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 2 }
    ] },
    { "code": "regimen_changes", "block": "pharmacotherapy", "group": "Cambios en el régimen de la medicación", "label": "Cambios significativos en el régimen desde la última visita de AF (a valorar por el profesional)", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 1 }
    ] },
    { "code": "regimen_complexity", "block": "pharmacotherapy", "group": "Complejidad del régimen", "label": "Al menos un medicamento con pautas complejas de administración (valorar con MRCI)", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 1 }
    ] },
    { "code": "high_risk_medication", "block": "pharmacotherapy", "group": "Medicamentos de alto riesgo", "label": "Algún medicamento del listado ISMP-España de medicamentos de alto riesgo", "options": [
      { "value": "no", "label": "No", "points": 0 },
      { "value": "yes", "label": "Sí", "points": 4 }
    ] },
    { "code": "pharmacotherapy_goals_not_met", "block": "pharmacotherapy", "group": "Objetivos farmacoterapéuticos", "label": "Objetivos farmacoterapéuticos NO alcanzados (incluye comorbilidades; también si acaba de iniciar tratamiento sin objetivos previos)", "options": [
      { "value": "no", "label": "No: objetivos alcanzados", "points": 0 },
      { "value": "yes", "label": "Sí: objetivos no alcanzados o inicio de tratamiento", "points": 2 }
    ] },
    { "code": "polypharmacy", "block": "pharmacotherapy", "group": "Polimedicación", "label": "Principios activos concurrentes y crónicos", "options": [
      { "value": "lt_7", "label": "Menos de 7", "points": 0 },
      { "value": "7_10", "label": "7-10", "points": 1 },
      { "value": "10_plus", "label": "≥ 10", "points": 2 }
    ] },
    { "code": "adherence", "block": "pharmacotherapy", "group": "Sospecha o falta de adherencia", "label": "Adherencia (Morisky-Green-Levine + registro de dispensación / HCE)", "options": [
      { "value": "adherent", "label": "Adherente", "points": 0 },
      { "value": "at_risk", "label": "Riesgo de falta de adherencia y/o persistencia subóptima", "points": 1 },
      { "value": "non_adherent", "label": "Falta de adherencia", "points": 2 }
    ] },
    { "code": "physical_activity", "block": "sociosanitary", "group": "Actividad física", "label": "Actividad física", "options": [
      { "value": "regular", "label": "Ni sedentario ni actividad intensa", "points": 0 },
      { "value": "sedentary", "label": "Estilo de vida sedentario", "points": 1 },
      { "value": "intense", "label": "Actividad física intensa (p. ej., deportista de élite)", "points": 1 }
    ] },
    { "code": "tobacco", "block": "sociosanitary", "group": "Tabaco", "label": "Tabaco", "options": [
      { "value": "no", "label": "No fumador / exfumador hace más de 5 años", "points": 0 },
      { "value": "former_5y", "label": "Exfumador en los últimos 5 años", "points": 1 },
      { "value": "current", "label": "Fumador activo", "points": 2 }
    ] }
  ],
  "followUp": {
    "1": { "label": "Reestratificar cada 3-6 meses; seguimiento como máximo a los 45 días de aplicar el modelo", "restratifyMonths": 6, "firstFollowUpDays": 45 },
    "2": { "label": "Reestratificación anual, o antes por decisión profesional o cambio del tratamiento CV", "restratifyMonths": 12, "firstFollowUpDays": null },
    "3": { "label": "Reestratificar si se detecta la necesidad (decisión profesional o cambio del tratamiento CV)", "restratifyMonths": null, "firstFollowUpDays": null }
  }
}$cmo_definition$::jsonb as d) s;

insert into public.carmo_intervention_catalog (code, catalog_version, cmo_domain, category, subcategory, label, priority_levels, status, source_reference)
select x ->> 'code', 'CMO-CV-SEFH-2024', x ->> 'cmo_domain', x ->> 'category', x ->> 'subcategory', x ->> 'label',
       array(select jsonb_array_elements_text(x -> 'priority_levels')::integer), 'validated', x ->> 'source_reference'
  from jsonb_array_elements($cmo_actions$[
 {
  "code": "SFT01",
  "cmo_domain": "capacity",
  "category": "Seguimiento farmacoterapéutico",
  "subcategory": null,
  "label": "Revisar y validar el tratamiento cardiovascular (adecuación, seguridad, efectividad según guías); registrar y comunicar RAM",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "SFT02",
  "cmo_domain": "capacity",
  "category": "Seguimiento farmacoterapéutico",
  "subcategory": null,
  "label": "Monitorizar la adherencia y aplicar estrategias de mejora (educación, apoyo conductual, cuidado colaborativo, gestión de casos)",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "SFT03",
  "cmo_domain": "capacity",
  "category": "Seguimiento farmacoterapéutico",
  "subcategory": null,
  "label": "Contacto adicional entre visitas mediante teleasistencia y planificación de la próxima visita con el equipo asistencial",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "SFT04",
  "cmo_domain": "capacity",
  "category": "Seguimiento farmacoterapéutico",
  "subcategory": null,
  "label": "Conciliar y revisar la medicación concomitante (interacciones; alternativas terapéuticas)",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "SFT05",
  "cmo_domain": "capacity",
  "category": "Seguimiento farmacoterapéutico",
  "subcategory": null,
  "label": "Monitorizar y decidir de forma multidisciplinar según los PROMs y PREMs",
  "priority_levels": [
   1,
   2
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "SFT06",
  "cmo_domain": "capacity",
  "category": "Seguimiento farmacoterapéutico",
  "subcategory": null,
  "label": "Conciliación del tratamiento en las transiciones asistenciales (ingreso, alta, urgencias)",
  "priority_levels": [
   1,
   2
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "SFT07",
  "cmo_domain": "capacity",
  "category": "Seguimiento farmacoterapéutico",
  "subcategory": null,
  "label": "Involucrar al paciente en el Plan Farmacoterapéutico: compartir la evolución de objetivos y acordar acciones",
  "priority_levels": [
   1
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "SFT08",
  "cmo_domain": "capacity",
  "category": "Seguimiento farmacoterapéutico",
  "subcategory": null,
  "label": "Programas estructurados de detección, prevención o control de factores de riesgo (HTA, dislipemia, diabetes) con telemedicina",
  "priority_levels": [
   1
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "EDU01",
  "cmo_domain": "capacity",
  "category": "Educación, formación y seguimiento del paciente",
  "subcategory": null,
  "label": "Fomentar un paciente activo e informado, corresponsable del resultado del tratamiento",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "EDU02",
  "cmo_domain": "capacity",
  "category": "Educación, formación y seguimiento del paciente",
  "subcategory": null,
  "label": "Proporcionar información (tratamientos, patología CV, cumplimiento) y resolver dudas",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "EDU03",
  "cmo_domain": "capacity",
  "category": "Educación, formación y seguimiento del paciente",
  "subcategory": null,
  "label": "Educación sanitaria general (hábitos cardiosaludables, factores de riesgo, uso correcto de medicamentos, adherencia)",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "EDU04",
  "cmo_domain": "capacity",
  "category": "Educación, formación y seguimiento del paciente",
  "subcategory": null,
  "label": "Promover herramientas de autogestión (recursos web, apps) y confirmar cambios de hábitos",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "EDU05",
  "cmo_domain": "capacity",
  "category": "Educación, formación y seguimiento del paciente",
  "subcategory": null,
  "label": "Educación sobre prevención y adherencia: riesgo CV asociado a la falta de adherencia",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "EDU06",
  "cmo_domain": "capacity",
  "category": "Educación, formación y seguimiento del paciente",
  "subcategory": null,
  "label": "Formación y educación a familiares y cuidadores",
  "priority_levels": [
   1,
   2
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "EDU07",
  "cmo_domain": "capacity",
  "category": "Educación, formación y seguimiento del paciente",
  "subcategory": null,
  "label": "Material personalizado para paciente y/o cuidador (hoja de medicación, diario, etc.)",
  "priority_levels": [
   1
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO01",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Integrar la información e intervenciones en la historia clínica electrónica",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO02",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Colaborar en políticas y directrices de uso seguro y efectivo de medicamentos (guías de FRCV)",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO03",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Unificar criterios y mensajes entre profesionales y niveles asistenciales",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO04",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Desarrollar programas orientados a cumplir objetivos farmacoterapéuticos",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO05",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Colaborar en el informe de alta con información de atención farmacéutica",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO06",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Ante desigualdades sociales que afectan a la salud, coordinarse con otras especialidades",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO07",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Procedimientos de trabajo conjuntos para potenciar la autonomía del paciente",
  "priority_levels": [
   1,
   2
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO08",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Coordinación con asociaciones de pacientes",
  "priority_levels": [
   1
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO09",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Coordinar servicios intrahospitalarios y recomendar SPD con la farmacia comunitaria",
  "priority_levels": [
   1
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO10",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Informes periódicos al equipo multidisciplinar sobre pacientes prioritarios",
  "priority_levels": [
   1
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO11",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Participar en equipos de gestión de casos",
  "priority_levels": [
   1
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "COO12",
  "cmo_domain": "capacity",
  "category": "Coordinación con el equipo asistencial",
  "subcategory": null,
  "label": "Plan de acción entre niveles asistenciales para reacciones adversas (vías rápidas de comunicación)",
  "priority_levels": [
   1
  ],
  "source_reference": "Modelo CMO cardiovascular (MAPEX-SEFH), apartado V, Tablas 5-7"
 },
 {
  "code": "MOT01",
  "cmo_domain": "motivation",
  "category": "Entrevista motivacional",
  "subcategory": null,
  "label": "Entrevista motivacional (módulo Motivación del modelo)",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Protocolo CARMO v3.0 (Procedimiento) y módulo Motivación del modelo CMO cardiovascular"
 },
 {
  "code": "OPO01",
  "cmo_domain": "opportunity",
  "category": "Seguimiento a distancia",
  "subcategory": null,
  "label": "Teleconsulta / seguimiento farmacoterapéutico a distancia (módulo Oportunidad, telefarmacia)",
  "priority_levels": [
   1,
   2,
   3
  ],
  "source_reference": "Protocolo CARMO v3.0 (Procedimiento, teleconsultas) y módulo Oportunidad del modelo CMO cardiovascular"
 }
]$cmo_actions$::jsonb) x;
