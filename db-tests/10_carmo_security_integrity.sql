-- SOLO PARA PRUEBAS LOCALES. Batería de seguridad, aislamiento e integridad de CARMO.
-- Impersona usuarios como PostgREST (rol authenticated + claims JWT). Cualquier fallo aborta.
-- Garantías cubiertas (encargo §12): G1 guardado íntegro · G2 corrección sin destruir · G3 una visita
-- no modifica otra · G4 aislamiento por centro · G6 cálculo reproducible · G8 borrado impedido.
-- Además: aislamiento frente a DERMAPEX y COAMO, roles, inclusión, cierre de visitas.

\set ON_ERROR_STOP on
\set QUIET on

create schema carmo_test;
grant usage on schema carmo_test to anon, authenticated;

create function carmo_test.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function carmo_test.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;
create function carmo_test.expect(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FALLO: %', p_msg; end if;
  raise notice 'OK  %', p_msg;
end $$;
create function carmo_test.expect_fail(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK  % (rechazado: %)', p_msg, sqlerrm;
    return;
  end;
  raise exception 'FALLO: % (se esperaba rechazo y se aceptó)', p_msg;
end $$;
create function carmo_test.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
-- Identificadores reales (como haría un atacante que conoce un UUID): evita falsos «rechazos» por
-- INSERT … SELECT que no devuelve filas al no ver el centro/paciente.
create function carmo_test.center_id(p_code text) returns uuid language sql security definer as $$
  select id from public.carmo_centers where code = p_code $$;
create function carmo_test.patient_id(p_code text) returns uuid language sql security definer as $$
  select id from public.carmo_patients where screening_code = p_code $$;
grant execute on all functions in schema carmo_test to anon, authenticated;

-- ── Inventario de seguridad (protege también tablas carmo_* futuras) ────────

select carmo_test.expect(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'carmo\_%'
     and (not c.relrowsecurity or not exists (
       select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
          and p.policyname = 'carmo_app_gate' and p.permissive = 'RESTRICTIVE'))),
  'toda tabla carmo_* tiene RLS y la barrera restrictiva carmo_app_gate');
select carmo_test.expect(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname like 'carmo\_%'
     and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))),
  'anon no tiene ningún privilegio sobre carmo_*');
select carmo_test.expect(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'carmo\_%'
     and (has_table_privilege('authenticated', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))),
  'G8: authenticated no puede borrar ni vaciar ninguna tabla carmo_*');
select carmo_test.expect(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'carmo_private' and c.relkind = 'r'
     and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'UPDATE'))),
  'las tablas de carmo_private no son accesibles desde la API');
select carmo_test.expect(not has_function_privilege('authenticated', 'carmo_private.provision_user(text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'carmo_private.assign_center(text,text)', 'EXECUTE'),
  'el alta de usuarios y centros no es invocable desde la API');
select carmo_test.expect(not exists (
  select 1 from pg_views where schemaname = 'public' and viewname like 'carmo\_%'
     and not exists (select 1 from pg_class c where c.relname = viewname and 'security_invoker=true' = any (c.reloptions))),
  'todas las vistas carmo_* son security_invoker');
select carmo_test.expect((select pg_get_constraintdef(oid) from pg_constraint where conname = 'app_access_app_code_check')
  like '%dermapex%coag%carmo%', 'app_access admite dermapex, coag y carmo (filas existentes intactas)');

-- ── Datos de partida (administrador de BD) ──────────────────────────────────

insert into auth.users (id, email) values
  ('ca000000-0000-4000-8000-000000000001', 'coord@carmo.test'),
  ('ca000000-0000-4000-8000-000000000002', 'pi.a@carmo.test'),
  ('ca000000-0000-4000-8000-000000000003', 'inv.a@carmo.test'),
  ('ca000000-0000-4000-8000-000000000004', 'inv.b@carmo.test'),
  ('ca000000-0000-4000-8000-000000000005', 'eval.a@carmo.test'),
  ('ca000000-0000-4000-8000-000000000006', 'mon.a@carmo.test'),
  ('ca000000-0000-4000-8000-000000000007', 'admin@carmo.test'),
  ('ca000000-0000-4000-8000-000000000008', 'revoked@carmo.test'),
  ('ca000000-0000-4000-8000-000000000009', 'dermapex.only@test');

select carmo_private.provision_user('coord@carmo.test', 'coordinator', 'Coordinación científica');
select carmo_private.provision_user('pi.a@carmo.test', 'site_pi');
select carmo_private.provision_user('inv.a@carmo.test', 'site_investigator');
select carmo_private.provision_user('inv.b@carmo.test', 'site_investigator');
select carmo_private.provision_user('eval.a@carmo.test', 'external_evaluator');
select carmo_private.provision_user('mon.a@carmo.test', 'monitor');
select carmo_private.provision_user('admin@carmo.test', 'tech_admin');
select carmo_private.provision_user('revoked@carmo.test', 'site_investigator');
select app_private.set_app_access('revoked@carmo.test', 'carmo', false);
select app_private.set_app_access('dermapex.only@test', 'dermapex', true);

select carmo_test.expect_fail($$select carmo_private.provision_user('coord@carmo.test', 'superuser')$$, 'rol inexistente rechazado');

insert into public.carmo_centers (code, name, study_number, participation_status, authorization_reference, is_active) values
  ('CA', 'Centro A (ficticio)', 1, 'authorized', 'Prueba: autorización ficticia A', true),
  ('CB', 'Centro B (ficticio)', 2, 'authorized', 'Prueba: autorización ficticia B', true),
  ('CP', 'Centro pendiente (ficticio)', 3, 'pending_authorization', null, false);
select carmo_test.expect_fail($$update public.carmo_centers set is_active = true where code = 'CP'$$, 'un centro no autorizado no puede activarse');

select carmo_private.assign_center('pi.a@carmo.test', 'CA');
select carmo_private.assign_center('inv.a@carmo.test', 'CA');
select carmo_private.assign_center('eval.a@carmo.test', 'CA');
select carmo_private.assign_center('mon.a@carmo.test', 'CA');
select carmo_private.assign_center('revoked@carmo.test', 'CA');
select carmo_private.assign_center('inv.b@carmo.test', 'CB');
select carmo_private.assign_center('inv.b@carmo.test', 'CP');
insert into auth.users (id, email) values ('ca000000-0000-4000-8000-000000000010', 'pi2.a@carmo.test');
select carmo_private.provision_user('pi2.a@carmo.test', 'site_pi');
select carmo_test.expect_fail($$select carmo_private.assign_center('pi2.a@carmo.test', 'CA')$$, 'un solo investigador principal vigente por centro (protocolo)');
select carmo_test.expect((select count(*) from public.carmo_centers where code not in ('CA', 'CB', 'CP') and participation_status = 'pending_authorization' and not is_active and study_number is null) = 14,
  'los 14 centros del protocolo quedan pendientes de autorización e inactivos');
select carmo_test.expect((select status = 'draft' and (select count(*) from public.carmo_eligibility_criteria c where c.set_id = s.id) = 6
  from public.carmo_eligibility_sets s where version = 'CARMO-SEL-P3.0'), 'criterios del protocolo v3.0 cargados en BORRADOR (4 de inclusión, 2 de exclusión)');

-- Paciente creado antes de existir criterios activos: nunca podrá incluirse con esta configuración.
begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_patients (center_id, responsible_investigator_id)
  select id, 'ca000000-0000-4000-8000-000000000003' from public.carmo_centers where code = 'CA';
commit;
begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$update public.carmo_patients set status = 'included' where screening_code = 'SEL-001-001'$$,
  'sin criterios de selección activos no se puede incluir a nadie');
commit;

-- Criterios ficticios (estructura; NO son los del protocolo).
with s as (insert into public.carmo_eligibility_sets (version, status, source_reference, validated_by, validated_at)
           values ('TEST-1', 'active', 'Prueba: criterios ficticios', 'test', current_date) returning id)
insert into public.carmo_eligibility_criteria (set_id, code, kind, ordinal, criterion_text, source_reference)
select s.id, c.code, c.kind, c.ord, c.txt, 'Prueba' from s, (values
  ('INC01', 'inclusion', 1, 'Criterio de inclusión ficticio 1'),
  ('INC02', 'inclusion', 2, 'Criterio de inclusión ficticio 2'),
  ('EXC01', 'exclusion', 3, 'Criterio de exclusión ficticio 1')) as c(code, kind, ord, txt);

-- ── Alta y centro ───────────────────────────────────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_patients (center_id, responsible_investigator_id)
  select id, 'ca000000-0000-4000-8000-000000000003' from public.carmo_centers where code = 'CA';
select carmo_test.expect((select count(*) from public.carmo_patients) = 2, 'el investigador de A ve sus 2 pacientes');
select carmo_test.expect((select screening_code = 'SEL-001-002' and study_code is null from public.carmo_patients order by screening_seq desc limit 1),
  'código de selección SEL-001-002 asignado por la BD; sin código de paciente antes de la inclusión');
select carmo_test.expect((select bool_and(is_synthetic) from public.carmo_patients), 'modo validación: todo paciente queda marcado sintético');
select carmo_test.expect_fail($$insert into public.carmo_patients (center_id) values (carmo_test.center_id('CB'))$$, 'G4: no se dan de alta pacientes en otro centro (UUID conocido)');
select carmo_test.expect_fail($$update public.carmo_patients set is_synthetic = false$$, 'el carácter sintético no es modificable desde la API');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000004');
select carmo_test.expect_fail($$insert into public.carmo_patients (center_id) select id from public.carmo_centers where code = 'CP'$$, 'un centro pendiente de autorización no incluye pacientes');
insert into public.carmo_patients (center_id, responsible_investigator_id)
  select id, 'ca000000-0000-4000-8000-000000000004' from public.carmo_centers where code = 'CB';
select carmo_test.expect((select count(*) from public.carmo_patients) = 1, 'G4: el investigador de B solo ve su paciente');
select carmo_test.expect(carmo_test.affected($$update public.carmo_patients set responsible_investigator_id = null where screening_code like 'SEL-001-%'$$) = 0,
  'G4: una actualización manipulada sobre pacientes de A no afecta a ninguna fila');
select carmo_test.expect_fail($$update public.carmo_patients set center_id = (select id from public.carmo_centers where code = 'CA')$$, 'G4: no se puede mover un paciente a otro centro');
commit;

-- ── Inclusión ───────────────────────────────────────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect(public.carmo_inclusion_blockers((select id from public.carmo_patients where screening_code = 'SEL-001-002'))
  @> array['eligibility_not_satisfied', 'no_signed_consent'], 'requisitos pendientes informados');
insert into public.carmo_eligibility_answers (patient_id, criterion_id, is_met, verified_in_source)
  select p.id, c.id, c.code <> 'INC02', true from public.carmo_patients p, public.carmo_eligibility_criteria c
   where p.screening_code = 'SEL-001-002' and c.set_id = p.eligibility_set_id;
select carmo_test.expect_fail($$insert into public.carmo_eligibility_answers (patient_id, criterion_id, is_met)
  select p.id, c.id, true from public.carmo_patients p join public.carmo_eligibility_criteria c on c.code = 'INC04'
    join public.carmo_eligibility_sets s on s.id = c.set_id and s.version = 'CARMO-SEL-P3.0' where p.screening_code = 'SEL-001-002'$$,
  'no se responden criterios de una versión distinta de la asignada al paciente');
select carmo_test.expect_fail($$insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id)
  select id, 'HIP/CI ficticio v1', current_date + 1, 'ca000000-0000-4000-8000-000000000003' from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'consentimiento con fecha futura rechazado');
select carmo_test.expect_fail($$insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id)
  select id, 'HIP/CI ficticio v1', current_date, 'ca000000-0000-4000-8000-000000000004' from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'el investigador del consentimiento debe ser del centro del paciente');
insert into public.carmo_consents (patient_id, document_version, signed_date, investigator_id, future_use_choice)
  select id, 'HIP/CI ficticio v1', current_date, 'ca000000-0000-4000-8000-000000000003', 'keep_pseudonymized' from public.carmo_patients where screening_code = 'SEL-001-002';
select carmo_test.expect_fail($$update public.carmo_patients set status = 'included' where screening_code = 'SEL-001-002'$$,
  'no se incluye con un criterio de inclusión no cumplido (y EXC01 cumplido)');
select carmo_test.expect_fail($$update public.carmo_eligibility_answers set is_met = true$$, 'modificar respuestas exige motivo');
update public.carmo_eligibility_answers a set is_met = (c.kind = 'inclusion'), correction_reason = 'Verificado de nuevo en la historia clínica'
  from public.carmo_eligibility_criteria c where c.id = a.criterion_id and c.code in ('INC02', 'EXC01');
update public.carmo_patients set status = 'included' where screening_code = 'SEL-001-002';
select carmo_test.expect((select inclusion_date = current_date and study_code = '001-01' and inclusion_seq = 1 from public.carmo_patients where screening_code = 'SEL-001-002'),
  'inclusión: fecha y código de paciente del protocolo (001-01, consecutivo por orden de inclusión) fijados por la BD');
select carmo_test.expect_fail($$update public.carmo_patients set status = 'screening' where screening_code = 'SEL-001-002'$$, 'el código de paciente no se puede revertir');
select carmo_test.expect_fail($$update public.carmo_eligibility_answers set is_met = false, correction_reason = 'x'$$, 'los criterios se congelan tras el cribado');
commit;

-- ── Visitas ─────────────────────────────────────────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$insert into public.carmo_visits (patient_id, visit_code) select id, 'BASAL' from public.carmo_patients where screening_code = 'SEL-001-001'$$,
  'no se registran visitas de pacientes no incluidos');
insert into public.carmo_visits (patient_id, visit_code, actual_date, status, modality, responsible_id)
  select id, 'BASAL', current_date, 'done', 'in_person', 'ca000000-0000-4000-8000-000000000003' from public.carmo_patients where screening_code = 'SEL-001-002';
insert into public.carmo_visits (patient_id, visit_code) select id, 'S12' from public.carmo_patients where screening_code = 'SEL-001-002';
insert into public.carmo_visits (patient_id, visit_code) select id, 'FINAL' from public.carmo_patients where screening_code = 'SEL-001-002';
select carmo_test.expect((select planned_date = current_date + 84 from public.carmo_visits where visit_code = 'S12'), 'fecha prevista S12 = inclusión + 84 días (calendario versionado)');
select carmo_test.expect((select window_status from public.carmo_visit_windows where visit_code = 'S12') = 'not_done_yet', 'ventana S12: aún no realizada');
select carmo_test.expect((select window_status from public.carmo_visit_windows where visit_code = 'BASAL') = 'in_window', 'ventana basal calculada');
select carmo_test.expect_fail($$insert into public.carmo_visits (patient_id, visit_code) select id, 'BASAL' from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'una sola visita basal por paciente');
select carmo_test.expect_fail($$update public.carmo_visits set actual_date = current_date + 3, status = 'done', modality = 'phone', responsible_id = 'ca000000-0000-4000-8000-000000000003' where visit_code = 'S12'$$,
  'una visita realizada no tiene fecha futura');
update public.carmo_visits set status = 'done', actual_date = current_date, modality = 'phone', responsible_id = 'ca000000-0000-4000-8000-000000000003' where visit_code = 'S12';
select carmo_test.expect((select status = 'planned' and actual_date is null and revision = 1 from public.carmo_visits where visit_code = 'FINAL'),
  'G3: modificar S12 no altera otra visita');
insert into public.carmo_visits (patient_id, visit_code, actual_date, status, modality, responsible_id)
  select id, 'EXTRA', current_date, 'done', 'phone', 'ca000000-0000-4000-8000-000000000003' from public.carmo_patients where screening_code = 'SEL-001-002';
select carmo_test.expect((select count(*) from public.carmo_visits where visit_code = 'EXTRA' and schedule_visit_id is null) = 1, 'contacto extraordinario sin calendario');
commit;

-- ── Observaciones: guardado íntegro, validación y corrección sin destrucción ─

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
insert into public.carmo_observations (patient_id, visit_id, variable_code, value_numeric, unit, observed_date, data_source, temporal_context)
  select p.id, v.id, 'ldl_c', 132.5, 'mg/dL', current_date, 'lab_report', 'baseline'
    from public.carmo_patients p join public.carmo_visits v on v.patient_id = p.id and v.visit_code = 'BASAL';
select carmo_test.expect((select value_numeric = 132.5 and unit = 'mg/dL' and data_source = 'lab_report' and temporal_context = 'baseline'
  and recorded_by = 'ca000000-0000-4000-8000-000000000003' and variable_definition_version = 1 from public.carmo_observations),
  'G1: el guardado persiste valor, unidad, origen, contexto, autor y versión de definición');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, visit_id, variable_code, value_text, observed_date, data_source, temporal_context)
  select p.id, v.id, 'smoking', 'yes', current_date, 'patient_interview', 'baseline' from public.carmo_patients p join public.carmo_visits v on v.patient_id = p.id and v.visit_code = 'BASAL'$$,
  'variable bloqueada (dominio no definido) no admite datos');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, visit_id, variable_code, value_numeric, unit, observed_date, data_source, temporal_context)
  select p.id, v.id, 'ldl_c', 130, 'g/L', current_date, 'lab_report', 'baseline' from public.carmo_patients p join public.carmo_visits v on v.patient_id = p.id and v.visit_code = 'BASAL'$$,
  'unidad no admitida rechazada');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, visit_id, variable_code, value_numeric, unit, observed_date, data_source, temporal_context)
  select p.id, v.id, 'weight', 5, 'kg', current_date, 'clinical_record', 'baseline' from public.carmo_patients p join public.carmo_visits v on v.patient_id = p.id and v.visit_code = 'BASAL'$$,
  'valor fuera de rango rechazado');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, variable_code, value_boolean, observed_date, data_source, temporal_context)
  select id, 'ami', true, current_date - 400, 'clinical_record', 'incident_event' from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'un evento previo a la inclusión no se registra como incidente');
insert into public.carmo_observations (patient_id, variable_code, value_boolean, observed_date, data_source, temporal_context)
  select id, 'ami', true, current_date - 400, 'clinical_record', 'history_prior_inclusion' from public.carmo_patients where screening_code = 'SEL-001-002';
insert into public.carmo_observations (patient_id, visit_id, variable_code, is_missing, missing_reason, observed_date, data_source, temporal_context)
  select p.id, v.id, 'non_hdl_c', true, 'not_done', current_date, 'lab_report', 'baseline' from public.carmo_patients p join public.carmo_visits v on v.patient_id = p.id and v.visit_code = 'BASAL';
select carmo_test.expect_fail($$update public.carmo_observations set value_numeric = 99$$, 'G2: una observación no se edita (sin privilegio UPDATE)');
select carmo_test.expect_fail($$delete from public.carmo_observations$$, 'G8: una observación no se borra');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, visit_id, variable_code, value_numeric, unit, observed_date, data_source, temporal_context, supersedes_id)
  select patient_id, visit_id, 'ldl_c', 123.5, 'mg/dL', observed_date, 'lab_report', 'baseline', id from public.carmo_observations where variable_code = 'ldl_c'$$,
  'una corrección sin motivo se rechaza');
insert into public.carmo_observations (patient_id, visit_id, variable_code, value_numeric, unit, observed_date, data_source, temporal_context, supersedes_id, correction_reason)
  select patient_id, visit_id, 'ldl_c', 123.5, 'mg/dL', observed_date, 'lab_report', 'baseline', id, 'Error de transcripción del informe'
    from public.carmo_observations where variable_code = 'ldl_c';
select carmo_test.expect((select count(*) from public.carmo_observations where variable_code = 'ldl_c') = 2
  and (select value_numeric from public.carmo_observations_current where variable_code = 'ldl_c') = 123.5
  and exists (select 1 from public.carmo_observations where variable_code = 'ldl_c' and value_numeric = 132.5),
  'G2: la corrección conserva el valor original y la vista vigente muestra el nuevo');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, visit_id, variable_code, value_numeric, unit, observed_date, data_source, temporal_context, supersedes_id, correction_reason)
  select patient_id, visit_id, 'ldl_c', 120, 'mg/dL', observed_date, 'lab_report', 'baseline', o.id, 'Segunda corrección del mismo original'
    from public.carmo_observations o where variable_code = 'ldl_c' and value_numeric = 132.5$$,
  'no se puede corregir dos veces el mismo registro (cadena lineal)');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000004');
select carmo_test.expect((select count(*) from public.carmo_observations) = 0, 'G4: el investigador de B no ve observaciones de A');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, variable_code, value_boolean, observed_date, data_source, temporal_context)
  values (carmo_test.patient_id('SEL-001-002'), 'diabetes', true, current_date, 'clinical_record', 'baseline')$$, 'G4: no escribe en pacientes de A (UUID conocido)');
select carmo_test.expect_fail($$insert into public.carmo_visits (patient_id, visit_code) values (carmo_test.patient_id('SEL-001-002'), 'S24')$$, 'G4: no crea visitas en pacientes de A');
commit;

-- ── Cuestionarios (IEXPAC) ──────────────────────────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000005');  -- evaluador externo
insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, administration_mode, data_source, administration_date, responses)
  select v.id, v.patient_id, 'IEXPAC', 'completed', 'self', 'paper', current_date, '{"1":5,"2":5,"3":5,"4":5,"5":5,"6":5,"7":5,"8":5,"9":5,"10":5}'::jsonb
    from public.carmo_visits v where v.visit_code = 'BASAL';
select carmo_test.expect((select scores ->> 'global' is null and (scores ->> 'valid')::boolean = false and items_answered = 10
  from public.carmo_questionnaire_administrations), 'IEXPAC con 10/11 ítems: sin puntuación global');
select carmo_test.expect((select evaluator_id = 'ca000000-0000-4000-8000-000000000005' and evaluator_role = 'external_evaluator' and instrument_version = 'IEXPAC-11' and evaluator_conformity = 'not_applicable'
  from public.carmo_questionnaire_administrations), 'evaluador, rol y versión fijados por la BD');
select carmo_test.expect_fail($$update public.carmo_questionnaire_administrations set responses = responses || '{"11":5}'$$,
  'modificar un cuestionario completado exige motivo');
select carmo_test.expect_fail($$update public.carmo_questionnaire_administrations set responses = responses || '{"11":5}', correction_reason = 'Ítem omitido', revision = 7$$,
  'control de concurrencia por revisión');
update public.carmo_questionnaire_administrations set responses = responses || '{"11":5}', correction_reason = 'Ítem 11 omitido al transcribir', revision = 1;
select carmo_test.expect((select (scores ->> 'global')::numeric = 10 and (scores ->> 'sum')::integer = 55 and revision = 2
  from public.carmo_questionnaire_administrations), 'G6: IEXPAC 11 × 5 = 10,0 (suma 55)');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status) select id, patient_id, 'IEXPAC', 'in_progress' from public.carmo_visits where visit_code = 'BASAL'$$,
  'no se duplica un cuestionario en la misma visita');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status) select id, patient_id, 'IEXPAC', 'in_progress' from public.carmo_visits where visit_code = 'S12'$$,
  'IEXPAC solo en basal y final');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status) select id, patient_id, 'EQ5D5L', 'in_progress' from public.carmo_visits where visit_code = 'BASAL'$$,
  'EQ-5D-5L retirado (se usa 3L): no admite datos');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, responses) select id, patient_id, 'IEXPAC', 'in_progress', '{"1":6}' from public.carmo_visits where visit_code = 'FINAL'$$,
  'respuesta fuera de rango rechazada');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, responses) select id, patient_id, 'IEXPAC', 'in_progress', '{"12":3}' from public.carmo_visits where visit_code = 'FINAL'$$,
  'ítem inexistente rechazado');
insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, administration_mode, data_source, administration_date, responses, vas_value)
  select id, patient_id, 'EQ5D3L', 'completed', 'self', 'paper', current_date, '{"1":1,"2":1,"3":2,"4":1,"5":3}'::jsonb, 70 from public.carmo_visits where visit_code = 'BASAL';
select carmo_test.expect((select instrument_version = 'EQ-5D-3L-ES-ES-v2.0-self' and scores ->> 'profile' = '11213' and (scores ->> 'vas')::integer = 70
  from public.carmo_questionnaire_administrations where instrument_code = 'EQ5D3L'), 'EQ-5D-3L: versión por modalidad, perfil 11213 y EVA 70 (sin índice)');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, administration_mode, data_source, administration_date, responses)
  select id, patient_id, 'EQ5D3L', 'completed', 'assisted', 'paper', current_date, '{"1":1}'::jsonb from public.carmo_visits where visit_code = 'FINAL'$$, 'EQ-5D-3L no admite la modalidad «con ayuda»');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, responses)
  select id, patient_id, 'EQ5D3L', 'in_progress', '{"1":4}'::jsonb from public.carmo_visits where visit_code = 'FINAL'$$, 'EQ-5D-3L: nivel 4 fuera de rango');
insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, administration_mode, data_source, administration_date, responses)
  select id, patient_id, 'EVASAF', 'completed', 'self', 'paper', current_date, '{"1":5,"2":4,"3":5,"4":3,"5":4,"6":5,"7":5,"8":4,"9":5,"10":5}'::jsonb from public.carmo_visits where visit_code = 'BASAL';
select carmo_test.expect((select (scores ->> 'complete')::boolean and scores ->> 'total' is null from public.carmo_questionnaire_administrations where instrument_code = 'EVASAF'),
  'EVASAF: 10 ítems completos, sin total inventado');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, responses)
  select id, patient_id, 'EVASAF', 'in_progress', '{"11":3}'::jsonb from public.carmo_visits where visit_code = 'FINAL'$$, 'EVASAF: ítem 11 inexistente');
insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status, administration_mode, data_source, administration_date, responses)
  select id, patient_id, 'MORISKY_GREEN', 'completed', 'interviewer', 'paper', current_date, '{"1":0,"2":1,"3":0,"4":0}'::jsonb from public.carmo_visits where visit_code = 'BASAL';
select carmo_test.expect((select (scores ->> 'adherent')::boolean from public.carmo_questionnaire_administrations where instrument_code = 'MORISKY_GREEN'), 'Morisky-Green: No-Sí-No-No = adherente');
select carmo_test.expect_fail($$insert into public.carmo_questionnaire_administrations (visit_id, patient_id, instrument_code, status) select id, patient_id, 'MORISKY_GREEN', 'in_progress' from public.carmo_visits where visit_code = 'S12'$$,
  'Morisky-Green solo en visita inicial, S24 y final');
select carmo_test.expect((select count(*) from public.carmo_observations) = 0, 'el evaluador externo no ve datos clínicos');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, variable_code, value_boolean, observed_date, data_source, temporal_context)
  values (carmo_test.patient_id('SEL-001-002'), 'diabetes', true, current_date, 'clinical_record', 'baseline')$$, 'el evaluador externo no registra datos clínicos');
commit;

select carmo_test.expect((carmo_private.questionnaire_scores('MORISKY_GREEN', '{"1":1,"2":1,"3":0,"4":0}', null) ->> 'adherent')::boolean = false
  and carmo_private.questionnaire_scores('MORISKY_GREEN', '{"1":0,"2":1,"3":0}', null) ->> 'adherent' is null, 'Morisky-Green: no adherente con un fallo; sin resultado con 3/4 ítems');
select carmo_test.expect((carmo_private.iexpac_score('{"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1,"8":1,"9":1,"10":1,"11":1}') ->> 'global')::numeric = 0, 'G6: IEXPAC 11 × 1 = 0');
select carmo_test.expect((carmo_private.iexpac_score('{"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3,"8":3,"9":3,"10":3,"11":4}') ->> 'global')::numeric = 5.2273, 'G6: IEXPAC suma 34 = 5,2273');

-- ── Cierre, bloqueo y reapertura ────────────────────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$update public.carmo_visits set record_state = 'reviewed' where visit_code = 'BASAL'$$, 'un investigador colaborador no revisa ni cierra');
commit;
begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000002');
update public.carmo_visits set record_state = 'reviewed' where visit_code = 'BASAL';
select carmo_test.expect_fail($$update public.carmo_visits set record_state = 'closed' where visit_code = 'BASAL'$$, 'cierre bloqueado con variables y revisión de medicación pendientes');
select carmo_test.expect((select cardinality(public.carmo_visit_close_blockers(id)) = 2 from public.carmo_visits where visit_code = 'BASAL'),
  'la consulta de bloqueos devuelve los bloques pendientes (variables y medicación)');
-- Se completan los bloques: variables restantes como ausentes con motivo y revisión «sin medicación».
insert into public.carmo_observations (patient_id, visit_id, variable_code, is_missing, missing_reason, observed_date, data_source, temporal_context)
  select vi.patient_id, vi.id, va.code, true, 'not_available', vi.actual_date, 'clinical_record', 'baseline'
    from public.carmo_visits vi cross join public.carmo_variables va
   where vi.visit_code = 'BASAL' and va.status not in ('blocked', 'retired') and va.section <> 'cv_event' and 'BASAL' = any(va.allowed_visits)
     and va.code not in ('years_since_quitting', 'cigarettes_per_day', 'smoking_years')
     and not exists (select 1 from public.carmo_observations o where o.visit_id = vi.id and o.variable_code = va.code);
insert into public.carmo_visit_medication_reviews (visit_id, outcome) select id, 'no_medication' from public.carmo_visits where visit_code = 'BASAL';
select carmo_test.expect((select cardinality(public.carmo_visit_close_blockers(id)) = 0 from public.carmo_visits where visit_code = 'BASAL'), 'sin bloques pendientes');
update public.carmo_visits set record_state = 'closed' where visit_code = 'BASAL';
select carmo_test.expect_fail($$update public.carmo_visits set modality = 'phone' where visit_code = 'BASAL'$$, 'una visita cerrada no se edita');
select carmo_test.expect_fail($$insert into public.carmo_observations (patient_id, visit_id, variable_code, value_boolean, observed_date, data_source, temporal_context)
  select patient_id, id, 'diabetes', true, current_date, 'clinical_record', 'baseline' from public.carmo_visits where visit_code = 'BASAL'$$, 'no se añaden datos a una visita cerrada');
select carmo_test.expect_fail($$update public.carmo_questionnaire_administrations set administration_mode = 'interviewer', correction_reason = 'x', revision = 2 where instrument_code = 'IEXPAC'$$, 'no se corrige un cuestionario de una visita cerrada');
select carmo_test.expect_fail($$update public.carmo_visits set record_state = 'draft' where visit_code = 'BASAL'$$, 'reabrir exige motivo');
update public.carmo_visits set record_state = 'draft', reopen_reason = 'Corrección de la modalidad solicitada por monitorización' where visit_code = 'BASAL';
select carmo_test.expect((select count(*) from public.carmo_visit_state_log) = 3, 'historial de estados: revisada, cerrada, reabierta');
commit;

-- ── Tratamientos ────────────────────────────────────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$insert into public.carmo_treatments (patient_id, active_ingredient, dose_amount, dose_unit, frequency, route, start_date)
  select id, 'Atorvastatina', 40, 'mg', 'cada 24 horas', 'oral', current_date - 30 from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'medicación en texto libre (sin CIMA) rechazada');
select carmo_test.expect_fail($$insert into public.carmo_treatments (patient_id, active_ingredient, cima_nregistro, cima_name, dose_amount, dose_unit, frequency_code, route, start_date)
  select id, 'Evolocumab', '115016001', 'Repatha 140 mg solución inyectable en pluma precargada', 140, 'miligramos', 'q2w', 'subcutaneous', current_date - 30 from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'unidad de dosis fuera de la lista rechazada');
select carmo_test.expect_fail($$insert into public.carmo_treatments (patient_id, active_ingredient, cima_nregistro, cima_name, dose_amount, dose_unit, frequency_code, route, start_date)
  select id, 'Evolocumab', '115016001', 'Repatha 140 mg solución inyectable en pluma precargada', 140, 'mg', 'cada quince días', 'subcutaneous', current_date - 30 from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'pauta fuera de la lista rechazada');
select carmo_test.expect((select count(*) from public.carmo_visit_medication_reviews) = 1, 'solo la revisión «sin medicación» de la visita inicial');
select carmo_test.expect_fail($$insert into public.carmo_visit_medication_reviews (visit_id, outcome) select id, 'no_changes' from public.carmo_visits where visit_code = 'S12'$$,
  'revisión «sin cambios» rechazada si no hay medicación registrada');
insert into public.carmo_treatments (patient_id, active_ingredient, cima_nregistro, cima_name, atc_code, dose_amount, dose_unit, frequency_code, route, start_date, visit_id)
  select p.id, 'Evolocumab', '115016001', 'Repatha 140 mg solución inyectable en pluma precargada', 'C10AX13', 140, 'mg', 'q2w', 'subcutaneous', current_date - 30, v.id
    from public.carmo_patients p join public.carmo_visits v on v.patient_id = p.id and v.visit_code = 'BASAL' where p.screening_code = 'SEL-001-002';
select carmo_test.expect((select frequency = 'Cada 2 semanas' and presentation = cima_name from public.carmo_treatments), 'la BD rellena la etiqueta de la pauta y la presentación desde CIMA');
select carmo_test.expect((select visit_id is not null from public.carmo_treatment_events where event_type = 'start'), 'el inicio queda vinculado a la visita');
select carmo_test.expect_fail($$insert into public.carmo_visit_medication_reviews (visit_id, outcome) select id, 'no_medication' from public.carmo_visits where visit_code = 'S12'$$,
  'no se marca «sin medicación» con medicación activa');
insert into public.carmo_visit_medication_reviews (visit_id, outcome) select id, 'no_changes' from public.carmo_visits where visit_code = 'S12';
select carmo_test.expect((select r.active_medication_count = 1 and r.revision = 1 and r.reviewed_by is not null from public.carmo_visit_medication_reviews r join public.carmo_visits v on v.id = r.visit_id where v.visit_code = 'S12'), 'revisión de la visita con recuento calculado por la BD');
select carmo_test.expect_fail($$update public.carmo_visit_medication_reviews r set outcome = 'changes_recorded', revision = 1 from public.carmo_visits v where v.id = r.visit_id and v.visit_code = 'S12'$$, 'modificar la revisión exige motivo');
update public.carmo_visit_medication_reviews r set outcome = 'changes_recorded', revision = 1, correction_reason = 'Se registra el cambio de pauta' from public.carmo_visits v where v.id = r.visit_id and v.visit_code = 'S12';
select carmo_test.expect((select r.revision = 2 from public.carmo_visit_medication_reviews r join public.carmo_visits v on v.id = r.visit_id where v.visit_code = 'S12'), 'revisión corregida con motivo (revisión 2)');
select carmo_test.expect_fail($$update public.carmo_visit_medication_reviews r set outcome = 'no_changes', revision = 2 from public.carmo_visits v where v.id = r.visit_id and v.visit_code = 'S12'$$, 'una nueva modificación exige un motivo nuevo (no reutiliza el anterior)');
select carmo_test.expect_fail($$update public.carmo_visit_medication_reviews r set outcome = 'no_changes', revision = 1, correction_reason = 'Conflicto simulado' from public.carmo_visits v where v.id = r.visit_id and v.visit_code = 'S12'$$, 'concurrencia: revisión obsoleta rechazada');
select carmo_test.expect_fail($$delete from public.carmo_visit_medication_reviews$$, 'una revisión de medicación no se borra');
select carmo_test.expect((select is_study_lipid_therapy and started_before_inclusion from public.carmo_treatments), 'evolocumab reconocido como tratamiento principal iniciado antes de la inclusión');
select carmo_test.expect((select count(*) from public.carmo_treatment_events where event_type = 'start') = 1, 'evento de inicio creado automáticamente');
select carmo_test.expect_fail($$update public.carmo_treatments set dose_amount = 420$$, 'un tratamiento no se edita directamente');
select carmo_test.expect_fail($$insert into public.carmo_treatment_events (treatment_id, event_type, event_date, new_dose_amount) select id, 'dose_change', current_date, 420 from public.carmo_treatments$$, 'cambio de dosis sin motivo rechazado');
select carmo_test.expect_fail($$insert into public.carmo_treatment_events (treatment_id, event_type, event_date, new_dose_amount, new_frequency_code, reason)
  select id, 'dose_change', current_date, 420, 'quincenal', 'Cambio de pauta' from public.carmo_treatments$$, 'cambio a una pauta fuera de la lista rechazado');
insert into public.carmo_treatment_events (treatment_id, event_type, event_date, new_dose_amount, new_frequency_code, reason)
  select id, 'dose_change', current_date, 420, 'monthly', 'Cambio de pauta por preferencia del paciente' from public.carmo_treatments;
select carmo_test.expect((select frequency_code = 'monthly' and frequency = 'Mensual' from public.carmo_treatments), 'el cambio de pauta actualiza código y etiqueta');
insert into public.carmo_treatment_events (treatment_id, event_type, event_date, reason) select id, 'suspension', current_date, 'Reacción local' from public.carmo_treatments;
select carmo_test.expect((select status = 'suspended' and dose_amount = 420 from public.carmo_treatments), 'eventos aplicados: dosis 420 mg y suspendido');
insert into public.carmo_treatment_events (treatment_id, event_type, event_date, reason) select id, 'end', current_date, 'Fin por decisión clínica' from public.carmo_treatments;
select carmo_test.expect((select status = 'finished' and end_date = current_date from public.carmo_treatments) and (select count(*) from public.carmo_treatment_events) = 4,
  'tratamiento finalizado conserva todo su historial (4 eventos)');
select carmo_test.expect_fail($$insert into public.carmo_visit_evolutions (visit_id, clinical_evolution, drp_identified) select id, 'Evolución', true from public.carmo_visits where visit_code = 'BASAL'$$,
  'el PRM se ha retirado: no admite escritura');
select carmo_test.expect_fail($$delete from public.carmo_treatments$$, 'G8: un tratamiento no se borra');
commit;

-- ── CMO e intervenciones: desactivados sin fuente validada ──────────────────

insert into public.carmo_cmo_models (version, status, source_reference, definition, definition_sha256)
values ('TEST-DRAFT', 'draft', 'Prueba', '{}', 'test');
begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$insert into public.carmo_stratifications (patient_id, visit_id, model_version, engine_version, inputs, item_results, total_score, calculated_priority, justification)
  select patient_id, id, 'TEST-DRAFT', 'engine-0.1', '{}', '[]', 0, 3, 'x' from public.carmo_visits where visit_code = 'BASAL'$$,
  'estratificación rechazada con un modelo no validado');
select carmo_test.expect_fail($$insert into public.carmo_interventions (patient_id, catalog_code, intervention_date, is_scheduled, modality)
  select id, 'NOPE', current_date, true, 'in_person' from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'intervención rechazada sin categoría del catálogo validado');
commit;

-- ── Monitor, administración técnica, coordinación y cuentas sin acceso ──────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000006');
select carmo_test.expect((select count(*) from public.carmo_patients) = 2 and (select count(*) from public.carmo_observations) > 0, 'el monitor lee los datos de su centro');
select carmo_test.expect_fail($$insert into public.carmo_patients (center_id) select id from public.carmo_centers where code = 'CA'$$, 'el monitor no da de alta');
select carmo_test.expect(carmo_test.affected($$update public.carmo_visits set status_reason = 'x'$$) = 0, 'el monitor no modifica visitas');
select carmo_test.expect((select count(*) from public.carmo_audit_log) > 0, 'el monitor consulta la auditoría de su centro');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000007');
select carmo_test.expect((select count(*) from public.carmo_centers) = 17 and (select count(*) from public.carmo_patients) = 0,
  'la administración técnica gestiona centros sin ver pacientes');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000001');
select carmo_test.expect((select count(*) from public.carmo_patients) = 3, 'la coordinación ve todos los centros CARMO');
select carmo_test.expect((select count(*) from public.carmo_audit_log where table_name = 'carmo_observations' and action = 'INSERT') >= 4,
  'auditoría de cada observación');
select carmo_test.expect(exists (select 1 from public.carmo_audit_log where table_name = 'carmo_questionnaire_administrations' and action = 'UPDATE'
  and reason = 'Ítem 11 omitido al transcribir' and old_data -> 'responses' is distinct from new_data -> 'responses'),
  'auditoría: valor anterior, nuevo y motivo de la corrección');
select carmo_test.expect((select count(*) from public.coag_patients) = 0 and (select count(*) from public.patients) = 0,
  'aislamiento: la coordinación CARMO no ve pacientes de COAMO ni de DERMAPEX');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000008');
select carmo_test.expect((select count(*) from public.carmo_patients) = 0 and (select count(*) from public.carmo_profiles) = 0,
  'cuenta con perfil pero sin acceso carmo activo: cero filas');
select carmo_test.expect_fail($$insert into public.carmo_patients (center_id) values (carmo_test.center_id('CA'))$$, 'cuenta revocada no escribe');
commit;

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000009');
select carmo_test.expect((select count(*) from public.carmo_patients) = 0 and (select count(*) from public.carmo_centers) = 0
  and (select count(*) from public.carmo_variables) = 0, 'aislamiento: una cuenta DERMAPEX no ve nada de CARMO');
select carmo_test.expect(public.carmo_study_settings() is null, 'la configuración del estudio no se revela a cuentas ajenas');
commit;

begin;
select carmo_test.as_anon();
select carmo_test.expect_fail($$select * from public.carmo_patients$$, 'anon no lee pacientes');
commit;

-- ── Salida del estudio ──────────────────────────────────────────────────────

begin;
select carmo_test.as_user('ca000000-0000-4000-8000-000000000003');
select carmo_test.expect_fail($$update public.carmo_patients set status = 'completed' where screening_code = 'SEL-001-002'$$, 'no se cierra el seguimiento sin visita final realizada');
select carmo_test.expect_fail($$update public.carmo_patients set status = 'withdrawn', status_reason = 'consent_withdrawn' where screening_code = 'SEL-001-002'$$,
  'retirada por consentimiento exige registrar la retirada del consentimiento');
update public.carmo_consents set status = 'withdrawn', withdrawal_date = current_date, withdrawal_scope = 'stop_followup_data_pending_decision';
update public.carmo_patients set status = 'withdrawn', status_reason = 'consent_withdrawn' where screening_code = 'SEL-001-002';
select carmo_test.expect((select count(*) from public.carmo_observations o join public.carmo_patients p on p.id = o.patient_id where p.status = 'withdrawn') > 0,
  'los datos previos a la retirada se conservan (política de uso pendiente RG-10)');
select carmo_test.expect_fail($$insert into public.carmo_visits (patient_id, visit_code) select id, 'S24' from public.carmo_patients where screening_code = 'SEL-001-002'$$,
  'no se programan visitas tras la retirada');
commit;

\echo 'CARMO · batería 10 superada'
