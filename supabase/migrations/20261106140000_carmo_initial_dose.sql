-- CARMO · 11 · Dosis y pauta iniciales en el evento de inicio de cada medicamento.
--
-- Decisión del IP (06/11/2026): el informe de visita debe mostrar la dosis exacta vigente en la fecha de la
-- visita. carmo_treatments solo guarda la dosis ACTUAL (los cambios la actualizan); a partir de ahora el
-- evento «start» guarda la dosis, unidad y pauta iniciales, y la dosis de cualquier fecha se reconstruye
-- aplicando en orden los «dose_change» (src/domain/medication.ts · doseAtDate).
--
-- Relleno de los registros existentes: solo cuando el tratamiento NO tiene cambios de dosis (la dosis
-- actual es, por tanto, la inicial). Con cambios previos la dosis inicial no se puede conocer y se deja
-- vacía; el informe lo indica. No destructiva: solo completa campos vacíos del evento de inicio.

create or replace function carmo_private.create_start_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.carmo_treatment_events (treatment_id, patient_id, visit_id, event_type, event_date,
                                             new_dose_amount, new_dose_unit, new_frequency, new_frequency_code)
  values (new.id, new.patient_id, new.visit_id, 'start', new.start_date,
          new.dose_amount, new.dose_unit, new.frequency, new.frequency_code);
  return new;
end;
$$;
revoke all on function carmo_private.create_start_event() from public, anon, authenticated;

update public.carmo_treatment_events e
   set new_dose_amount = t.dose_amount, new_dose_unit = t.dose_unit, new_frequency = t.frequency, new_frequency_code = t.frequency_code
  from public.carmo_treatments t
 where e.treatment_id = t.id and e.event_type = 'start'
   and e.new_dose_amount is null and e.new_dose_unit is null and e.new_frequency is null and e.new_frequency_code is null
   and not exists (select 1 from public.carmo_treatment_events c where c.treatment_id = t.id and c.event_type = 'dose_change');

comment on column public.carmo_treatment_events.new_dose_amount is
  'Evento «start»: dosis inicial (desde la migración 11). Evento «dose_change»: nueva dosis.';
