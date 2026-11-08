-- CARMO · 12 · Índices de claves foráneas y políticas RLS sin reevaluación por fila.
--
-- Asesor de rendimiento de Supabase (08/11/2026):
--   · claves foráneas sin índice en las columnas por las que filtran la aplicación, la RLS y los triggers
--     (paciente, visita, tratamiento…). Se omiten las de autoría (*_by): los perfiles nunca se borran;
--   · tres políticas reevaluaban auth.uid() por fila; se envuelve en (select auth.uid()), que Postgres
--     evalúa una sola vez por consulta. La condición es la misma.
-- No destructiva: solo crea índices y reescribe políticas con idéntica lógica.

create index if not exists idx_carmo_qadm_patient on public.carmo_questionnaire_administrations(patient_id);
create index if not exists idx_carmo_strat_visit on public.carmo_stratifications(visit_id);
create index if not exists idx_carmo_int_visit on public.carmo_interventions(visit_id);
create index if not exists idx_carmo_int_catalog on public.carmo_interventions(catalog_code);
create index if not exists idx_carmo_trt_visit on public.carmo_treatments(visit_id);
create index if not exists idx_carmo_trt_evt_patient on public.carmo_treatment_events(patient_id);
create index if not exists idx_carmo_trt_evt_visit on public.carmo_treatment_events(visit_id);
create index if not exists idx_carmo_disp_treatment on public.carmo_dispensations(treatment_id);
create index if not exists idx_carmo_disp_patient on public.carmo_dispensations(patient_id);
create index if not exists idx_carmo_dev_patient on public.carmo_deviations(patient_id);
create index if not exists idx_carmo_dev_visit on public.carmo_deviations(visit_id);
create index if not exists idx_carmo_medrev_patient on public.carmo_visit_medication_reviews(patient_id);
create index if not exists idx_carmo_evo_patient on public.carmo_visit_evolutions(patient_id);
create index if not exists idx_carmo_state_log_visit on public.carmo_visit_state_log(visit_id);
create index if not exists idx_carmo_obs_variable on public.carmo_observations(variable_code);
create index if not exists idx_carmo_elig_criterion on public.carmo_eligibility_answers(criterion_id);
create index if not exists idx_carmo_consent_investigator on public.carmo_consents(investigator_id);
create index if not exists idx_carmo_visits_responsible on public.carmo_visits(responsible_id);

alter policy carmo_profiles_select on public.carmo_profiles
  using (id = (select auth.uid()) or carmo_private.is_admin());
alter policy carmo_profiles_update on public.carmo_profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy carmo_memberships_select on public.carmo_center_memberships
  using (profile_id = (select auth.uid()) or carmo_private.is_admin());
