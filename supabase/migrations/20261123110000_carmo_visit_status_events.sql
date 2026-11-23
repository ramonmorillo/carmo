-- CARMO · 15 · Motivos de anulación / no realización y reapertura de visita: trazabilidad completa.
--
-- Incidencia 3 (CARMO_LETRAN): «Cuando anulo o reabro una visita la herramienta me pide el motivo, pero
-- después no aparece en el informe de visita.»
--
-- Causa comprobada: los motivos SÍ se guardaban (carmo_visits.status_reason y reopen_reason; las
-- reaperturas, además, en carmo_visit_state_log), pero (a) el informe y la ficha no los leían y (b) solo
-- los cambios del estado del REGISTRO (borrador/revisada/cerrada) tenían historial propio: el motivo de
-- una anulación se perdía de la fila en cuanto la visita cambiaba de estado, y solo quedaba en la
-- auditoría general (no legible por los investigadores).
--
-- Qué hace (aditivo; no modifica enforce_visit_rules ni ninguna fila existente):
--   · carmo_visit_state_log.kind: 'record_state' (borrador/revisada/cerrada; valor por defecto, todas las
--     filas existentes) o 'status' (planificada/realizada/no realizada/anulada).
--   · Trigger AFTER INSERT/UPDATE en carmo_visits: registra cada cambio de estado de la visita (y de su
--     motivo mientras esté no realizada/anulada) con autor, fecha y motivo.
--   · actor_name / actor_role: nombre y rol del profesional en el momento del evento (un colaborador no
--     puede leer los perfiles de otros).
--   · Relleno histórico desde carmo_audit_log: solo hechos reales (cambio de estado y su motivo guardado en
--     ese momento). NO se generan motivos retroactivos: si no constaba, queda nulo y el informe lo indica.

alter table public.carmo_visit_state_log
  add column if not exists kind text not null default 'record_state' check (kind in ('record_state', 'status')),
  add column if not exists actor_role text,
  add column if not exists actor_name text;
comment on column public.carmo_visit_state_log.kind is
  'record_state: borrador/revisada/cerrada (reason = motivo de reapertura). status: planned/done/not_done/cancelled (reason = motivo de la no realización o anulación).';

create or replace function carmo_private.fill_visit_log_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_role is null and new.actor_id is not null and new.actor_id = auth.uid() then
    new.actor_role := carmo_private.my_role();
  end if;
  if new.actor_name is null and new.actor_id is not null then
    select p.full_name into new.actor_name from public.carmo_profiles p where p.id = new.actor_id;
  end if;
  return new;
end;
$$;
create trigger trg_carmo_state_log_actor before insert on public.carmo_visit_state_log
for each row execute function carmo_private.fill_visit_log_actor();

create or replace function carmo_private.log_visit_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'planned' then
      insert into public.carmo_visit_state_log (visit_id, kind, from_state, to_state, reason, actor_id)
      values (new.id, 'status', 'none', new.status, case when new.status in ('not_done', 'cancelled') then new.status_reason end, auth.uid());
    end if;
    return new;
  end if;
  if new.status is distinct from old.status
     or (new.status in ('not_done', 'cancelled') and new.status_reason is distinct from old.status_reason) then
    insert into public.carmo_visit_state_log (visit_id, kind, from_state, to_state, reason, actor_id)
    values (new.id, 'status', old.status, new.status, case when new.status in ('not_done', 'cancelled') then new.status_reason end, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_carmo_visits_status_log after insert or update on public.carmo_visits
for each row execute function carmo_private.log_visit_status_event();

-- Relleno histórico desde la auditoría (solo cambios reales; el motivo es el que constaba en ese momento).
insert into public.carmo_visit_state_log (visit_id, kind, from_state, to_state, reason, actor_id, actor_role, at)
select a.row_id, 'status', coalesce(a.old_data ->> 'status', 'none'), a.new_data ->> 'status',
       case when a.new_data ->> 'status' in ('not_done', 'cancelled') then nullif(trim(a.new_data ->> 'status_reason'), '') end,
       a.actor_id, a.actor_role, a.at
  from public.carmo_audit_log a
 where a.table_name = 'carmo_visits' and a.action in ('INSERT', 'UPDATE')
   and exists (select 1 from public.carmo_visits v where v.id = a.row_id)
   and ((a.action = 'INSERT' and a.new_data ->> 'status' <> 'planned')
        or (a.action = 'UPDATE' and (a.old_data ->> 'status' is distinct from a.new_data ->> 'status'
            or (a.new_data ->> 'status' in ('not_done', 'cancelled') and a.old_data ->> 'status_reason' is distinct from a.new_data ->> 'status_reason'))))
 order by a.id;

-- Nombre del autor de los eventos ya existentes (reaperturas y cierres anteriores): dato real del perfil.
update public.carmo_visit_state_log l set actor_name = p.full_name
  from public.carmo_profiles p where p.id = l.actor_id and l.actor_name is null;

revoke all on function carmo_private.fill_visit_log_actor(), carmo_private.log_visit_status_event() from public, anon, authenticated;
