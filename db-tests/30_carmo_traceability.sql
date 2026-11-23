-- SOLO PARA PRUEBAS LOCALES. CARMO · migraciones 14-16: historial del consentimiento, baja del paciente,
-- eventos de estado de la visita y precarga de la visita final. Usa los helpers, usuarios y centros de
-- 10_carmo_security_integrity.sql (inv.a = ...003 investigador de CA; pi.a = ...002; mon.a = ...006;
-- eval.a = ...005; inv.b = ...004 investigador de CB; coord = ...001).

\set ON_ERROR_STOP on
\set QUIET on

create function carmo_test.newest_patient() returns uuid language sql security definer as $$
  select id from public.carmo_patients order by created_at desc, screening_seq desc limit 1 $$;
create function carmo_test.visit_of(p_patient uuid, p_code text) returns uuid language sql security definer as $$
  select id from public.carmo_visits where patient_id = p_patient and visit_code = p_code and status <> 'cancelled' order by created_at desc limit 1 $$;
grant execute on function carmo_test.newest_patient(), carmo_test.visit_of(uuid, text) to anon, authenticated;

-- ── Paciente A incluido (consentimiento + criterios) ────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_patients (center_id, responsible_investigator_id)
  select id, 'ca000000-0000-4000-8000-000000000003' from public.carmo_centers where code = 'CA';
insert into public.carmo_eligibility_answers (patient_id, criterion_id, is_met, verified_in_source)
  select p.id, c.id, c.kind = 'inclusion', true from public.carmo_patients p join public.carmo_eligibility_criteria c on c.set_id = p.eligibility_set_id
   where p.id = carmo_test.newest_patient();
insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id, future_use_choice)
  values (carmo_test.newest_patient(), 'HIP/CI test v1', current_date, 'ca000000-0000-4000-8000-000000000003', 'delete');
update public.carmo_patients set status = 'included' where id = carmo_test.newest_patient();
select carmo_test.expect((select count(*) = 1 and min(event_type) = 'recorded' from public.carmo_consent_events where patient_id = carmo_test.newest_patient()),
  'consentimiento: el alta queda en el historial');
commit;

-- ── Rectificación y retirada del consentimiento ─────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$update public.carmo_consents set signed_date = current_date - 1 where patient_id = carmo_test.newest_patient()$$,
  'rectificar sin motivo rechazado');
select carmo_test.expect_fail($$update public.carmo_consents set signed_date = current_date - 1, correction_reason = 'x' where patient_id = carmo_test.newest_patient()$$,
  'rectificar con un motivo demasiado breve rechazado');
update public.carmo_consents set signed_date = current_date - 1, correction_reason = 'Fecha transcrita mal desde el documento firmado' where patient_id = carmo_test.newest_patient();
select carmo_test.expect_fail($$update public.carmo_consents set document_version = 'HIP/CI test v1.1' where patient_id = carmo_test.newest_patient()$$,
  'una segunda rectificación no arrastra el motivo anterior');
update public.carmo_consents set document_version = 'HIP/CI test v1.1', correction_reason = 'Versión documental transcrita incorrectamente' where patient_id = carmo_test.newest_patient();
select carmo_test.expect((select count(*) = 3 and count(*) filter (where event_type = 'rectified') = 2 from public.carmo_consent_events where patient_id = carmo_test.newest_patient()),
  'historial: alta + 2 rectificaciones');
select carmo_test.expect((select changes -> 'signed_date' ->> 'to' = (current_date - 1)::text and reason = 'Fecha transcrita mal desde el documento firmado' and actor_id = 'ca000000-0000-4000-8000-000000000003'
  from public.carmo_consent_events where patient_id = carmo_test.newest_patient() and changes ? 'signed_date' and event_type = 'rectified'),
  'historial: cambio de fecha, motivo y autor');
select carmo_test.expect_fail($$update public.carmo_consents set status = 'withdrawn', withdrawal_date = current_date, signed_date = current_date - 2, withdrawal_reason = 'Retirada por el participante', correction_reason = 'Mezcla de acciones' where patient_id = carmo_test.newest_patient()$$,
  'retirada y rectificación no se mezclan');
select carmo_test.expect_fail($$update public.carmo_consents set status = 'withdrawn', withdrawal_date = current_date where patient_id = carmo_test.newest_patient()$$,
  'retirar sin motivo rechazado');
select carmo_test.expect_fail($$delete from public.carmo_consent_events$$, 'el historial no se borra desde la API');
select carmo_test.expect_fail($$update public.carmo_consent_events set reason = 'x'$$, 'el historial no se modifica desde la API');
select carmo_test.expect_fail($$insert into public.carmo_consent_events (consent_id, patient_id, event_type) select id, patient_id, 'recorded' from public.carmo_consents$$, 'el historial no se escribe desde la API');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
update public.carmo_consents set status = 'withdrawn', withdrawal_date = current_date, withdrawal_scope = 'stop_followup_data_pending_decision',
  withdrawal_reason = 'El participante retira su consentimiento' where patient_id = carmo_test.newest_patient();
select carmo_test.expect((select event_type = 'withdrawn' and reason = 'El participante retira su consentimiento' and changes ? 'status'
  from public.carmo_consent_events where patient_id = carmo_test.newest_patient() order by id desc limit 1), 'historial: retirada con motivo');
select carmo_test.expect_fail($$update public.carmo_consents set status = 'signed', withdrawal_date = null where patient_id = carmo_test.newest_patient()$$, 'una retirada no se revierte');
select carmo_test.expect((select status = 'included' from public.carmo_patients where id = carmo_test.newest_patient()),
  'la retirada del consentimiento no cambia por sí sola el estado del paciente (lo hace la acción de salida)');
commit;

-- Visibilidad del historial
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000006');
select carmo_test.expect((select count(*) from public.carmo_consent_events) >= 4, 'el monitor del centro lee el historial del consentimiento'); commit;
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000001');
select carmo_test.expect((select count(*) from public.carmo_consent_events) >= 4, 'la coordinación lee el historial del consentimiento'); commit;
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000005');
select carmo_test.expect((select count(*) from public.carmo_consent_events) = 0, 'el evaluador externo no lee el historial'); commit;
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000004');
select carmo_test.expect((select count(*) from public.carmo_consent_events where patient_id = carmo_test.newest_patient()) = 0, 'G4: un investigador de otro centro no lee el historial de un paciente ajeno'); commit;
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000006');
select carmo_test.expect(carmo_test.affected($$update public.carmo_consents set correction_reason = 'intento del monitor'$$) = 0, 'el monitor no rectifica consentimientos'); commit;

-- ── Baja del paciente (incluido por error / inelegible) ─────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_patients (center_id, responsible_investigator_id)
  select id, 'ca000000-0000-4000-8000-000000000003' from public.carmo_centers where code = 'CA';
insert into public.carmo_eligibility_answers (patient_id, criterion_id, is_met, verified_in_source)
  select p.id, c.id, c.kind = 'inclusion', true from public.carmo_patients p join public.carmo_eligibility_criteria c on c.set_id = p.eligibility_set_id
   where p.id = carmo_test.newest_patient();
insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id)
  values (carmo_test.newest_patient(), 'HIP/CI test v1', current_date, 'ca000000-0000-4000-8000-000000000003');
update public.carmo_patients set status = 'included' where id = carmo_test.newest_patient();
insert into public.carmo_visits (patient_id, visit_code) values (carmo_test.newest_patient(), 'S12');
select carmo_test.expect_fail($$update public.carmo_patients set status = 'withdrawn', status_reason = 'included_in_error' where id = carmo_test.newest_patient()$$,
  'baja sin motivo detallado rechazada');
select carmo_test.expect_fail($$update public.carmo_patients set status = 'lost_to_followup', status_reason = 'included_in_error', status_reason_detail = 'Incluido por error de selección' where id = carmo_test.newest_patient()$$,
  'la baja por inclusión errónea no se registra como pérdida de seguimiento');
select carmo_test.expect_fail($$update public.carmo_patients set status = 'withdrawn', status_reason = 'consent_withdrawn' where id = carmo_test.newest_patient()$$,
  'la baja no se confunde con la retirada del consentimiento (esta exige consentimiento retirado)');
update public.carmo_patients set status = 'withdrawn', status_reason = 'included_in_error', status_reason_detail = 'Incluido por error: no cumplía el criterio INC02'
 where id = carmo_test.newest_patient();
select carmo_test.expect((select status = 'withdrawn' and status_reason = 'included_in_error' and study_code is not null from public.carmo_patients where id = carmo_test.newest_patient()),
  'baja registrada; el paciente conserva su código y su expediente');
select carmo_test.expect((select count(*) = 1 from public.carmo_visits where patient_id = carmo_test.newest_patient())
  and (select count(*) = 1 from public.carmo_consent_events where patient_id = carmo_test.newest_patient() and event_type = 'recorded'),
  'la baja conserva visitas y consentimiento');
select carmo_test.expect((select (consents.status = 'signed') from public.carmo_consents consents where consents.patient_id = carmo_test.newest_patient()),
  'la baja no retira el consentimiento');
select carmo_test.expect_fail($$update public.carmo_patients set status = 'included' where id = carmo_test.newest_patient()$$, 'una baja no se revierte desde la API');
commit;

-- ── Eventos de estado de la visita (anulación, reapertura y cierre) ─────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_patients (center_id, responsible_investigator_id)
  select id, 'ca000000-0000-4000-8000-000000000003' from public.carmo_centers where code = 'CA';
insert into public.carmo_eligibility_answers (patient_id, criterion_id, is_met, verified_in_source)
  select p.id, c.id, c.kind = 'inclusion', true from public.carmo_patients p join public.carmo_eligibility_criteria c on c.set_id = p.eligibility_set_id
   where p.id = carmo_test.newest_patient();
insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id)
  values (carmo_test.newest_patient(), 'HIP/CI test v1', current_date, 'ca000000-0000-4000-8000-000000000003');
update public.carmo_patients set status = 'included' where id = carmo_test.newest_patient();
insert into public.carmo_visits (patient_id, visit_code, status, actual_date, modality, responsible_id)
  values (carmo_test.newest_patient(), 'BASAL', 'done', current_date, 'in_person', 'ca000000-0000-4000-8000-000000000003');
insert into public.carmo_visits (patient_id, visit_code) values (carmo_test.newest_patient(), 'S12');
update public.carmo_visits set status = 'cancelled', status_reason = 'El paciente no puede acudir por ingreso hospitalario' where id = carmo_test.visit_of(carmo_test.newest_patient(), 'S12');
select carmo_test.expect((select count(*) = 1 and min(reason) = 'El paciente no puede acudir por ingreso hospitalario' and min(from_state) = 'planned' and min(to_state) = 'cancelled'
  from public.carmo_visit_state_log where visit_id = (select id from public.carmo_visits where patient_id = carmo_test.newest_patient() and visit_code = 'S12') and kind = 'status'),
  'la anulación queda en el historial de la visita con su motivo');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000002');
update public.carmo_visits set record_state = 'closed' where patient_id = carmo_test.newest_patient() and visit_code = 'S12';
update public.carmo_visits set record_state = 'draft', reopen_reason = 'Se registra el motivo exacto de la anulación'
 where patient_id = carmo_test.newest_patient() and visit_code = 'S12';
update public.carmo_visits set status_reason = 'Ingreso hospitalario del paciente (corregido)' where patient_id = carmo_test.newest_patient() and visit_code = 'S12';
update public.carmo_visits set record_state = 'closed' where patient_id = carmo_test.newest_patient() and visit_code = 'S12';
select carmo_test.expect((select string_agg(kind || ':' || from_state || '>' || to_state, ' | ' order by id) =
  'status:planned>cancelled | record_state:draft>closed | record_state:closed>draft | status:cancelled>cancelled | record_state:draft>closed'
  from public.carmo_visit_state_log where visit_id = (select id from public.carmo_visits where patient_id = carmo_test.newest_patient() and visit_code = 'S12')),
  'secuencia conservada: anular, cerrar, reabrir con motivo, corregir el motivo y volver a cerrar');
select carmo_test.expect((select reason = 'Se registra el motivo exacto de la anulación' from public.carmo_visit_state_log
  where visit_id = (select id from public.carmo_visits where patient_id = carmo_test.newest_patient() and visit_code = 'S12') and to_state = 'draft'), 'motivo de la reapertura conservado');
select carmo_test.expect((select actor_role = 'site_pi' from public.carmo_visit_state_log
  where visit_id = (select id from public.carmo_visits where patient_id = carmo_test.newest_patient() and visit_code = 'S12') and to_state = 'closed' order by id desc limit 1), 'el evento guarda el rol del autor');
commit;

-- ── Precarga de la visita final ─────────────────────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_observations (patient_id, visit_id, variable_code, value_boolean, observed_date, data_source, temporal_context)
  select carmo_test.newest_patient(), carmo_test.visit_of(carmo_test.newest_patient(), 'BASAL'), v.code, v.val, current_date, 'clinical_record', 'baseline'
    from (values ('diabetes', true), ('hypertension', false), ('tobacco_use', true)) as v(code, val);
insert into public.carmo_observations (patient_id, visit_id, variable_code, value_numeric, unit, observed_date, data_source, temporal_context)
  select carmo_test.newest_patient(), carmo_test.visit_of(carmo_test.newest_patient(), 'BASAL'), v.code, v.val, v.unit, current_date, 'clinical_record', 'baseline'
    from (values ('cigarettes_per_day', 10, 'cig/día'), ('ldl_c', 150, 'mg/dL'), ('weight', 80, 'kg')) as v(code, val, unit);
insert into public.carmo_observations (patient_id, visit_id, variable_code, is_missing, missing_reason, observed_date, data_source, temporal_context)
  values (carmo_test.newest_patient(), carmo_test.visit_of(carmo_test.newest_patient(), 'BASAL'), 'family_support', true, 'not_available', current_date, 'clinical_record', 'baseline');
insert into public.carmo_visits (patient_id, visit_code) values (carmo_test.newest_patient(), 'FINAL');
select carmo_test.expect(public.carmo_preload_final_visit(carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL')) = 4,
  'precarga parcial: diabetes, hipertensión, tabaco y cigarrillos/día (el basal es fumador)');
select carmo_test.expect(public.carmo_preload_final_visit(carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL')) = 0, 'volver a pulsar no duplica la precarga');
select carmo_test.expect(not exists (select 1 from public.carmo_observation_preloads where variable_code in ('ldl_c', 'weight', 'height', 'non_hdl_c', 'family_support', 'age_years')),
  'no se precargan variables que requieren nueva medición, datos ausentes ni variables de otra visita');
select carmo_test.expect((select count(*) = 0 from public.carmo_observations where visit_id = carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL')),
  'los valores precargados no son datos finales (no hay observaciones en la visita final)');
select carmo_test.expect((select cardinality(public.carmo_visit_close_blockers(carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL'))) > 0), 'la precarga no desbloquea el cierre');
-- Datos finales ya introducidos se conservan.
insert into public.carmo_observations (patient_id, visit_id, variable_code, value_boolean, observed_date, data_source, temporal_context)
  values (carmo_test.newest_patient(), carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL'), 'hypertension', false, current_date, 'clinical_record', 'follow_up');
insert into public.carmo_observations (patient_id, visit_id, variable_code, value_boolean, observed_date, data_source, temporal_context)
  values (carmo_test.newest_patient(), carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL'), 'diabetes', false, current_date, 'clinical_record', 'follow_up');
select carmo_test.expect((select status from public.carmo_observation_preloads where variable_code = 'hypertension') = 'confirmed'
  and (select status from public.carmo_observation_preloads where variable_code = 'diabetes') = 'updated', 'mismo valor = confirmada; otro valor = actualizada');
select carmo_test.expect((select count(*) = 2 from public.carmo_observation_preloads where status = 'pending_verification'), 'quedan 2 pendientes de verificar');
select carmo_test.expect(public.carmo_preload_final_visit(carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL')) = 0, 'tras confirmar/actualizar no se vuelve a precargar');
select carmo_test.expect((select count(*) = 7 from public.carmo_observations where visit_id = carmo_test.visit_of(carmo_test.newest_patient(), 'BASAL')), 'la visita inicial queda intacta');
select carmo_test.expect_fail($$update public.carmo_observation_preloads set status = 'confirmed' where variable_code = 'tobacco_use'$$, 'la API no confirma precargas: se confirman registrando la observación');
select carmo_test.expect_fail($$insert into public.carmo_observation_preloads (patient_id, visit_id, variable_code, source_observation_id)
  select patient_id, visit_id, variable_code, source_observation_id from public.carmo_observation_preloads limit 1$$, 'la API no inserta precargas');
update public.carmo_observation_preloads set status = 'discarded' where variable_code = 'tobacco_use';
select carmo_test.expect((select status = 'discarded' and resolved_at is not null from public.carmo_observation_preloads where variable_code = 'tobacco_use'), 'descartar una precarga pendiente');
select carmo_test.expect(public.carmo_preload_final_visit(carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL')) = 1, 'tras descartar se puede volver a precargar esa variable');
commit;

begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000006');
select carmo_test.expect_fail($$select public.carmo_preload_final_visit((select id from public.carmo_visits where visit_code = 'FINAL' limit 1))$$, 'el monitor no precarga');
select carmo_test.expect((select count(*) > 0 from public.carmo_observation_preloads), 'el monitor lee las precargas de su centro'); commit;
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000004');
select carmo_test.expect_fail($$select public.carmo_preload_final_visit(carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL'))$$, 'G4: un investigador de otro centro no precarga');
select carmo_test.expect((select count(*) = 0 from public.carmo_observation_preloads), 'G4: ni lee precargas ajenas'); commit;
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$select public.carmo_preload_final_visit(carmo_test.visit_of(carmo_test.newest_patient(), 'BASAL'))$$, 'la precarga solo se ofrece en la visita final'); commit;

-- ── IEXPAC final: conformidad del evaluador (comportamiento vigente, RG-32) ─
-- La conformidad la fija quien CREA la administración. Un borrador del investigador completado después por el
-- evaluador externo conserva «not_conform»: se documenta como decisión pendiente, no se modifica en esta iteración.
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_questionnaire_administrations (visit_id, instrument_code, status)
  values (carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL'), 'IEXPAC', 'in_progress');
select carmo_test.expect((select evaluator_conformity = 'not_conform' and evaluator_role = 'site_investigator' from public.carmo_questionnaire_administrations
  where visit_id = carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL')), 'IEXPAC final registrado por un investigador: no conforme'); commit;
begin; select carmo_test.as_user('ca000000-0000-4000-8000-000000000005');
update public.carmo_questionnaire_administrations set status = 'completed', administration_mode = 'self', data_source = 'paper', administration_date = current_date,
  responses = '{"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3,"8":3,"9":3,"10":3,"11":3}'::jsonb, revision = 1
 where visit_id = carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL');
select carmo_test.expect((select evaluator_conformity = 'not_conform' and evaluator_role = 'site_investigator' and status = 'completed' from public.carmo_questionnaire_administrations
  where visit_id = carmo_test.visit_of(carmo_test.newest_patient(), 'FINAL')), 'comportamiento vigente: completarlo un evaluador externo no cambia la conformidad fijada al crear (decisión pendiente RG-32)'); commit;

\echo 'CARMO · batería 30 (trazabilidad) superada'
