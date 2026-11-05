-- CARMO · 08 · La coordinación científica que además investiga en un centro puede figurar como
-- investigador responsable del consentimiento en ESE centro.
--
-- Motivo: el protocolo v3.0 nombra al coordinador científico (R. A. Morillo Verdugo) investigador en
-- el H. U. Virgen de Valme. En CARMO cada perfil tiene un único rol: con la regla anterior, un
-- coordinador no podía ser el investigador del consentimiento en su propio centro. Se exige una
-- pertenencia vigente al centro del paciente; no basta el rol de coordinación.

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
    if new.patient_id <> old.patient_id or new.document_version <> old.document_version then
      raise exception 'No se puede cambiar el paciente ni la versión documental de un consentimiento.';
    end if;
    if (new.signed_date is distinct from old.signed_date or new.investigator_id is distinct from old.investigator_id)
       and coalesce(trim(new.correction_reason), '') = '' then
      raise exception 'Indique el motivo para corregir la fecha o el investigador del consentimiento.';
    end if;
    if old.status = 'withdrawn' and new.status = 'signed' then
      raise exception 'Una retirada de consentimiento no se revierte: registre un nuevo consentimiento.';
    end if;
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;
