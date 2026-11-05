-- SOLO PARA PRUEBAS LOCALES. CARMO · modelo CMO cardiovascular (migración 07). Usa los helpers,
-- usuarios y centros de 10_carmo_security_integrity.sql.

\set ON_ERROR_STOP on
\set QUIET on

select carmo_test.expect((select status = 'draft' and definition_sha256 = encode(sha256(convert_to(definition::text, 'UTF8')), 'hex')
  from public.carmo_cmo_models where version = 'CMO-CV-SEFH-2024'), 'modelo cargado como borrador con huella SHA-256 verificable');
select carmo_test.expect((select count(*) from public.carmo_intervention_catalog where status = 'validated' and catalog_version = 'CMO-CV-SEFH-2024') = 29,
  'catálogo de 29 actuaciones (Tablas 5-7 + motivación + oportunidad)');
select carmo_test.expect((select count(*) from public.carmo_intervention_catalog where 3 = any(priority_levels)) = 17
  and (select count(*) from public.carmo_intervention_catalog where 1 = any(priority_levels)) = 29, 'actuaciones acumulativas por prioridad');

-- Cálculo de la BD con la definición real (caso clínico 4 del documento: 18 puntos, P2).
select carmo_test.expect((select (r ->> 'total')::int = 18 and (r ->> 'priority')::int = 2 and r -> 'blocks' = '{"demographic": 2, "clinical": 6, "pharmacotherapy": 7, "sociosanitary": 3}'::jsonb
  from (select carmo_private.cmo_compute(definition, '{"age_group": "50_69", "pregnancy": "no", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "yes", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "yes", "dyslipidemia_above_target": "yes", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "yes", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "yes", "pharmacotherapy_goals_not_met": "yes", "polypharmacy": "lt_7", "adherence": "at_risk", "physical_activity": "sedentary", "tobacco": "current"}'::jsonb) r from public.carmo_cmo_models where version = 'CMO-CV-SEFH-2024') s), 'BD: caso 4 = 18 puntos, P2, subtotales del documento');
select carmo_test.expect((select (r ->> 'total')::int = 0 and (r ->> 'priority')::int = 1 and r -> 'applied_exceptions' = '["pregnancy"]'::jsonb
  from (select carmo_private.cmo_compute(definition, '{"age_group": "19_49", "pregnancy": "yes", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "no", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "no", "dyslipidemia_above_target": "no", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "no", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "no", "pharmacotherapy_goals_not_met": "no", "polypharmacy": "lt_7", "adherence": "adherent", "physical_activity": "regular", "tobacco": "no"}'::jsonb) r from public.carmo_cmo_models where version = 'CMO-CV-SEFH-2024') s), 'BD: embarazo → P1 con 0 puntos');
select carmo_test.expect_fail($$select carmo_private.cmo_compute(definition, '{"age_group": "under_18", "pregnancy": "no", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "no", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "no", "dyslipidemia_above_target": "no", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "no", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "no", "pharmacotherapy_goals_not_met": "no", "polypharmacy": "lt_7", "adherence": "adherent", "physical_activity": "regular", "tobacco": "no"}'::jsonb) from public.carmo_cmo_models where version = 'CMO-CV-SEFH-2024'$$, 'BD: menor de 18 años → modelo no aplicable');
select carmo_test.expect_fail($$select carmo_private.cmo_compute(definition, '{"age_group": "19_49", "pregnancy": "no", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "no", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "no", "dyslipidemia_above_target": "no", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "no", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "no", "pharmacotherapy_goals_not_met": "no", "polypharmacy": "lt_7", "adherence": "adherent", "physical_activity": "regular"}'::jsonb) from public.carmo_cmo_models where version = 'CMO-CV-SEFH-2024'$$, 'BD: sin imputación (falta una variable)');
select carmo_test.expect_fail($$select carmo_private.cmo_compute(definition, '{"age_group": "19_49", "pregnancy": "no", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "no", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "no", "dyslipidemia_above_target": "no", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "no", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "no", "pharmacotherapy_goals_not_met": "no", "polypharmacy": "lt_7", "adherence": "adherent", "physical_activity": "regular", "tobacco": "no", "invented_var": "yes"}'::jsonb) from public.carmo_cmo_models where version = 'CMO-CV-SEFH-2024'$$, 'BD: rechaza variables ajenas al modelo');

-- Paciente sintético incluido con visita inicial realizada.
begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_patients (center_id, responsible_investigator_id)
  select id, 'ca000000-0000-4000-8000-000000000003' from public.carmo_centers where code = 'CA';
insert into public.carmo_eligibility_answers (patient_id, criterion_id, is_met, verified_in_source)
  select p.id, c.id, c.kind = 'inclusion', true from public.carmo_patients p join public.carmo_eligibility_criteria c on c.set_id = p.eligibility_set_id
   where p.screening_code = 'SEL-001-003';
insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id)
  select id, 'HIP/CI ficticio v1', current_date, 'ca000000-0000-4000-8000-000000000003' from public.carmo_patients where screening_code = 'SEL-001-003';
update public.carmo_patients set status = 'included' where screening_code = 'SEL-001-003';
insert into public.carmo_visits (patient_id, visit_code, actual_date, status, modality, responsible_id)
  select id, 'BASAL', current_date, 'done', 'in_person', 'ca000000-0000-4000-8000-000000000003' from public.carmo_patients where screening_code = 'SEL-001-003';
select carmo_test.expect_fail($$insert into public.carmo_stratifications (patient_id, visit_id, model_version, engine_version, inputs, item_results, total_score, calculated_priority, justification)
  select v.patient_id, v.id, 'CMO-CV-SEFH-2024', 'carmo-cmo-engine-2', '{"age_group": "50_69", "pregnancy": "no", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "yes", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "yes", "dyslipidemia_above_target": "yes", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "yes", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "yes", "pharmacotherapy_goals_not_met": "yes", "polypharmacy": "lt_7", "adherence": "at_risk", "physical_activity": "sedentary", "tobacco": "current"}'::jsonb, '{}', 18, 2, 'prueba'
    from public.carmo_visits v join public.carmo_patients p on p.id = v.patient_id where p.screening_code = 'SEL-001-003'$$,
  'con el modelo en borrador no se guarda ninguna estratificación');
commit;

update public.carmo_cmo_models set status = 'validated', validated_by = 'Prueba local', validated_at = current_date where version = 'CMO-CV-SEFH-2024';

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$insert into public.carmo_stratifications (patient_id, visit_id, model_version, engine_version, inputs, item_results, total_score, calculated_priority, justification)
  select v.patient_id, v.id, 'CMO-CV-SEFH-2024', 'carmo-cmo-engine-2', '{"age_group": "50_69", "pregnancy": "no", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "yes", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "yes", "dyslipidemia_above_target": "yes", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "yes", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "yes", "pharmacotherapy_goals_not_met": "yes", "polypharmacy": "lt_7", "adherence": "at_risk", "physical_activity": "sedentary", "tobacco": "current"}'::jsonb, '{}', 23, 1, 'manipulado'
    from public.carmo_visits v join public.carmo_patients p on p.id = v.patient_id where p.screening_code = 'SEL-001-003'$$,
  'la BD rechaza una puntuación/prioridad del cliente que no coincide con su propio cálculo');
insert into public.carmo_stratifications (patient_id, visit_id, model_version, engine_version, inputs, item_results, total_score, calculated_priority, justification)
  select v.patient_id, v.id, 'CMO-CV-SEFH-2024', 'carmo-cmo-engine-2', '{"age_group": "50_69", "pregnancy": "no", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "yes", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "yes", "dyslipidemia_above_target": "yes", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "yes", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "yes", "pharmacotherapy_goals_not_met": "yes", "polypharmacy": "lt_7", "adherence": "at_risk", "physical_activity": "sedentary", "tobacco": "current"}'::jsonb, '{}', 18, 2, 'Puntuación 18/42'
    from public.carmo_visits v join public.carmo_patients p on p.id = v.patient_id where p.screening_code = 'SEL-001-003';
select carmo_test.expect((select (item_results ->> 'total')::int = 18 and calculated_by = 'ca000000-0000-4000-8000-000000000003' and validation_status = 'pending'
  from public.carmo_stratifications), 'estratificación guardada con el resultado de la BD, autor y validación pendiente');
select carmo_test.expect_fail($$update public.carmo_stratifications set total_score = 30$$, 'el resultado calculado es inmutable');
select carmo_test.expect_fail($$update public.carmo_stratifications set validation_status = 'modified', final_priority = 3, validation_reason = 'bajar'$$,
  'el profesional no puede rebajar la prioridad (el modelo solo prevé elevarla)');
select carmo_test.expect_fail($$update public.carmo_stratifications set validation_status = 'modified', final_priority = 1$$, 'elevar exige motivo');
update public.carmo_stratifications set validation_status = 'modified', final_priority = 1, validation_reason = 'Descompensación reciente: criterio profesional';
select carmo_test.expect((select final_priority = 1 and validated_by = 'ca000000-0000-4000-8000-000000000003' from public.carmo_stratifications), 'elevación a P1 con motivo y autor');
select carmo_test.expect_fail($$update public.carmo_stratifications set validation_status = 'confirmed', final_priority = 2$$, 'una validación no se rehace');
insert into public.carmo_stratifications (patient_id, visit_id, model_version, engine_version, inputs, item_results, total_score, calculated_priority, justification, supersedes_id)
  select s.patient_id, s.visit_id, s.model_version, 'carmo-cmo-engine-2', '{"age_group": "19_49", "pregnancy": "yes", "nutritional_status": "normal", "female_cv_condition": "no", "base_cv_pathology": "no", "cv_comorbidity": "no", "hf_ischemic_combination": "no", "hf_af_combination": "no", "non_cv_comorbidity": "no", "dyslipidemia_above_target": "no", "lvef_below_40": "no", "venous_thromboembolism": "no", "hypertension": "no", "admissions_emergencies": "no", "first_year_post_coronary_event": "no", "regimen_changes": "no", "regimen_complexity": "no", "high_risk_medication": "no", "pharmacotherapy_goals_not_met": "no", "polypharmacy": "lt_7", "adherence": "adherent", "physical_activity": "regular", "tobacco": "no"}'::jsonb, '{}', 0, 1, 'Reestratificación', s.id from public.carmo_stratifications s;
select carmo_test.expect((select count(*) from public.carmo_stratifications) = 2
  and exists (select 1 from public.carmo_stratifications where supersedes_id is null and total_score = 18), 'reestratificación sin pérdida del resultado original');
insert into public.carmo_interventions (patient_id, visit_id, catalog_code, intervention_date, is_scheduled, modality, recipient, acceptance)
  select v.patient_id, v.id, 'SFT02', current_date, true, 'in_person', 'patient', 'accepted'
    from public.carmo_visits v join public.carmo_patients p on p.id = v.patient_id where p.screening_code = 'SEL-001-003';
select carmo_test.expect((select count(*) from public.carmo_interventions where catalog_code = 'SFT02' and responsible_id = 'ca000000-0000-4000-8000-000000000003') = 1,
  'intervención registrada con una actuación del catálogo validado');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000005');
select carmo_test.expect((select count(*) from public.carmo_stratifications) = 0, 'el evaluador externo no ve estratificaciones');
commit;
begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000004');
select carmo_test.expect((select count(*) from public.carmo_stratifications) = 0 and (select count(*) from public.carmo_interventions) = 0, 'otro centro no ve estratificaciones ni intervenciones');
commit;

-- Migración 08: la coordinación puede ser investigador del consentimiento solo en un centro al que pertenece.
begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000001');
insert into public.carmo_patients (center_id, responsible_investigator_id)
  select id, 'ca000000-0000-4000-8000-000000000001' from public.carmo_centers where code = 'CB';
select carmo_test.expect_fail($$insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id)
  select id, 'HIP/CI ficticio v1', current_date, 'ca000000-0000-4000-8000-000000000001' from public.carmo_patients where screening_code = 'SEL-002-002'$$,
  'la coordinación sin pertenencia al centro no puede ser investigador del consentimiento');
commit;
select carmo_private.assign_center('coord@carmo.test', 'CB');
begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000001');
insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id)
  select id, 'HIP/CI ficticio v1', current_date, 'ca000000-0000-4000-8000-000000000001' from public.carmo_patients where screening_code = 'SEL-002-002';
select carmo_test.expect((select count(*) from public.carmo_consents c join public.carmo_patients p on p.id = c.patient_id where p.screening_code = 'SEL-002-002') = 1,
  'la coordinación que pertenece al centro sí puede ser investigador del consentimiento');
commit;

\echo 'CARMO · batería 20 (modelo CMO) superada'
