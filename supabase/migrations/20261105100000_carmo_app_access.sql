-- CARMO · 00 · Habilita el código de aplicación 'carmo' en la autorización compartida.
--
-- ⚠ ÚNICO CAMBIO SOBRE UN OBJETO COMPARTIDO con DERMAPEX y COAMO (app_private.app_access).
--   Requiere aprobación explícita antes de aplicarse en el proyecto Supabase real.
--   Estado comprobado en producción (solo lectura, 05/11/2026):
--     CHECK app_access_app_code_check = app_code IN ('dermapex','coag').
--
-- Qué hace: amplía el dominio del CHECK con 'carmo'. No toca filas, políticas, helpers ni datos de
-- DERMAPEX/COAMO. Las filas existentes ('dermapex', 'coag') siguen siendo válidas.
-- Reversión: docs/CARMO_GO_LIVE_CHECKLIST.md §Reversión (solo si no existe ninguna fila 'carmo').

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'app_private.app_access'::regclass and c.conname = 'app_access_app_code_check';

  if v_def is null then
    raise exception 'No existe app_access_app_code_check: el estado de la BD no es el auditado. Abortado sin cambios.';
  end if;

  if v_def like '%carmo%' then
    raise notice 'app_access ya admite carmo: sin cambios.';
    return;
  end if;

  if v_def <> 'CHECK ((app_code = ANY (ARRAY[''dermapex''::text, ''coag''::text])))' then
    raise exception 'El CHECK de app_access difiere del auditado (%). Revisar a mano. Abortado sin cambios.', v_def;
  end if;

  alter table app_private.app_access drop constraint app_access_app_code_check;
  alter table app_private.app_access add constraint app_access_app_code_check
    check (app_code in ('dermapex', 'coag', 'carmo'));
end
$$;
