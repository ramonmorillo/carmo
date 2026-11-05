// Acceso a datos CARMO (Supabase). La autorización real la aplica la base de datos (RLS + triggers):
// aquí solo se leen/escriben las tablas carmo_* y se devuelven los errores sin maquillarlos.

import { supabase } from '../lib/supabase';
import type { CarmoRole } from '../domain/study';
import type { DbResponse } from '../domain/saveGuard';

export type Center = { id: string; code: string; name: string; study_number: number | null; participation_status: string; authorization_reference: string | null; is_active: boolean };
export type Profile = { id: string; full_name: string | null; role: CarmoRole; is_active: boolean };
export type Membership = { id: string; profile_id: string; center_id: string; starts_on: string; ends_on: string | null };
export type Patient = {
  id: string; center_id: string; screening_code: string; study_code: string | null; inclusion_seq: number | null; status: string; status_reason: string | null; status_reason_detail: string | null;
  screening_date: string; inclusion_date: string | null; responsible_investigator_id: string | null; is_synthetic: boolean; eligibility_set_id: string | null; created_at: string;
};
export type Visit = {
  id: string; patient_id: string; visit_code: string; planned_date: string | null; actual_date: string | null; status: string; status_reason: string | null;
  modality: string | null; responsible_id: string | null; record_state: string; revision: number; reopen_reason: string | null;
};
export type VisitWindow = { visit_id: string; window_start: string | null; window_end: string | null; window_status: string; deviation_days: number | null };
export type Variable = {
  code: string; section: string; label: string; value_type: string; units: string[] | null; allowed_values: Record<string, string> | null;
  min_value: number | null; max_value: number | null; allowed_visits: string[]; allowed_contexts: string[]; status: string; source_reference: string; notes: string | null;
};
export type ObservationRow = {
  id: string; patient_id: string; visit_id: string | null; variable_code: string; value_numeric: number | null; value_boolean: boolean | null; value_text: string | null;
  value_date: string | null; unit: string | null; is_missing: boolean; missing_reason: string | null; observed_date: string; data_source: string; temporal_context: string;
  supersedes_id: string | null; correction_reason: string | null; recorded_at: string; recorded_by: string | null;
};
export type EligibilityCriterion = { id: string; set_id: string; code: string; kind: 'inclusion' | 'exclusion'; ordinal: number; criterion_text: string; source_reference: string };
export type EligibilityAnswer = { patient_id: string; criterion_id: string; is_met: boolean; verified_in_source: boolean };
export type Consent = { id: string; patient_id: string; document_version: string; signed_date: string; investigator_id: string; status: string; withdrawal_date: string | null; withdrawal_scope: string | null; future_use_choice: string | null };
export type Instrument = { code: string; version: string; status: string; item_count: number; item_min: number; item_max: number; allowed_visits: string[]; notes: string | null };
export type Administration = {
  id: string; visit_id: string; patient_id: string; instrument_code: string; instrument_version: string; status: string; not_done_reason: string | null;
  administration_mode: string | null; data_source: string | null; administration_date: string | null; responses: Record<string, number>; vas_value: number | null; items_answered: number;
  scores: StoredScores | null; evaluator_role: string | null; evaluator_conformity: string | null; revision: number;
};
export type StoredScores = {
  global?: number | null; sum?: number | null; valid?: boolean; profile?: string | null; vas?: number | null;
  adherent?: boolean | null; complete?: boolean; items_answered?: number;
};
export type Treatment = {
  id: string; patient_id: string; active_ingredient: string; is_study_lipid_therapy: boolean; presentation: string | null; dose_amount: number | null; dose_unit: string | null;
  frequency: string | null; route: string | null; start_date: string; end_date: string | null; status: string; started_before_inclusion: boolean;
};
export type TreatmentEvent = { id: string; treatment_id: string; event_type: string; event_date: string; new_dose_amount: number | null; new_dose_unit: string | null; new_frequency: string | null; reason: string | null; adverse_reaction_description: string | null };
export type Dispensation = { id: string; treatment_id: string; dispensed_date: string; units_dispensed: number; days_supply: number | null; supersedes_id: string | null };
export type Evolution = { visit_id: string; clinical_evolution: string | null; pharmacotherapy_update: string | null; motivational_followup: string | null; drp_identified: boolean | null; drp_description: string | null; revision: number };
export type Deviation = { id: string; patient_id: string; visit_id: string | null; category: string; description: string; detected_date: string; status: string };
export type CmoModel = { version: string; status: string; source_reference: string; definition: import('../domain/cmoEngine').CmoModelDefinition; validated_by: string | null; validated_at: string | null };
export type Stratification = {
  id: string; patient_id: string; visit_id: string; model_version: string; engine_version: string; inputs: Record<string, string>;
  item_results: { total: number; blocks: Record<string, number>; priority: number; score_priority: number; applied_exceptions: string[] } | null;
  total_score: number | null; calculated_priority: 1 | 2 | 3; final_priority: 1 | 2 | 3 | null; validation_status: string; validation_reason: string | null;
  justification: string; calculated_at: string; calculated_by: string | null; validated_at: string | null; supersedes_id: string | null;
};
export type InterventionCatalogItem = { code: string; cmo_domain: string; category: string; subcategory: string | null; label: string; status: string; priority_levels: number[] };
export type Intervention = {
  id: string; patient_id: string; visit_id: string | null; catalog_code: string; intervention_date: string; is_scheduled: boolean; modality: string;
  reason: string | null; action_taken: string | null; recipient: string | null; acceptance: string | null; outcome: string | null; followup_status: string;
  stratification_id: string | null; revision: number;
};

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;
async function list<T>(table: string, build?: (q: Query) => Query): Promise<T[]> {
  const base = client().from(table).select('*');
  const query = (build ? build(base) : base) as PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const carmo = {
  async ownProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await client().from('carmo_profiles').select('id,full_name,role,is_active').eq('id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Profile | null) ?? null;
  },
  async studySettings(): Promise<{ data_mode: string; target_sample_size: number } | null> {
    const { data, error } = await client().rpc('carmo_study_settings');
    if (error) throw new Error(error.message);
    return (data as Array<{ data_mode: string; target_sample_size: number }> | null)?.[0] ?? null;
  },
  centers: () => list<Center>('carmo_centers', (q) => q.order('code')),
  profiles: () => list<Profile>('carmo_profiles'),
  memberships: () => list<Membership>('carmo_center_memberships'),
  patients: () => list<Patient>('carmo_patients', (q) => q.order('screening_code')),
  async patient(id: string): Promise<Patient | null> {
    const { data, error } = await client().from('carmo_patients').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Patient | null;
  },
  visits: (patientId?: string) => list<Visit>('carmo_visits', (q) => (patientId ? q.eq('patient_id', patientId) : q)),
  async visit(id: string): Promise<Visit | null> {
    const { data, error } = await client().from('carmo_visits').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Visit | null;
  },
  windows: () => list<VisitWindow>('carmo_visit_windows'),
  variables: () => list<Variable>('carmo_variables'),
  observations: (patientId: string) => list<ObservationRow>('carmo_observations', (q) => q.eq('patient_id', patientId)),
  allCurrentObservations: () => list<ObservationRow>('carmo_observations_current'),
  criteria: () => list<EligibilityCriterion>('carmo_eligibility_criteria'),
  answers: (patientId: string) => list<EligibilityAnswer>('carmo_eligibility_answers', (q) => q.eq('patient_id', patientId)),
  consents: (patientId: string) => list<Consent>('carmo_consents', (q) => q.eq('patient_id', patientId)),
  instruments: () => list<Instrument>('carmo_instruments'),
  administrations: (patientId?: string) => list<Administration>('carmo_questionnaire_administrations', (q) => (patientId ? q.eq('patient_id', patientId) : q)),
  treatments: (patientId: string) => list<Treatment>('carmo_treatments', (q) => q.eq('patient_id', patientId)),
  treatmentEvents: (patientId: string) => list<TreatmentEvent>('carmo_treatment_events', (q) => q.eq('patient_id', patientId)),
  dispensations: (patientId: string) => list<Dispensation>('carmo_dispensations_current', (q) => q.eq('patient_id', patientId)),
  async evolution(visitId: string): Promise<Evolution | null> {
    const { data, error } = await client().from('carmo_visit_evolutions').select('*').eq('visit_id', visitId).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Evolution | null;
  },
  deviations: (patientId: string) => list<Deviation>('carmo_deviations', (q) => q.eq('patient_id', patientId)),
  cmoModels: () => list<CmoModel>('carmo_cmo_models'),
  stratifications: (patientId?: string) => list<Stratification>('carmo_stratifications', (q) => (patientId ? q.eq('patient_id', patientId) : q).order('calculated_at', { ascending: false })),
  interventionCatalog: () => list<InterventionCatalogItem>('carmo_intervention_catalog'),
  interventions: (patientId?: string) => list<Intervention>('carmo_interventions', (q) => (patientId ? q.eq('patient_id', patientId) : q).order('intervention_date', { ascending: false })),
  async inclusionBlockers(patientId: string): Promise<string[]> {
    const { data, error } = await client().rpc('carmo_inclusion_blockers', { p_patient_id: patientId });
    if (error) throw new Error(error.message);
    return (data as string[] | null) ?? [];
  },
};

/** Escrituras: siempre devuelven la(s) fila(s) confirmadas por el servidor (select tras insert/update). */
export const carmoWrite = {
  insert<T = unknown>(table: string, values: Record<string, unknown> | Record<string, unknown>[]): Promise<DbResponse<T[]>> {
    return client().from(table).insert(values).select() as unknown as Promise<DbResponse<T[]>>;
  },
  update<T = unknown>(table: string, values: Record<string, unknown>, match: Record<string, string | number>): Promise<DbResponse<T[]>> {
    return client().from(table).update(values).match(match).select() as unknown as Promise<DbResponse<T[]>>;
  },
};
