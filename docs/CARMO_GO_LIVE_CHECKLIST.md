# CARMO · Verificaciones previas al uso con datos reales

Ningún punto se da por cumplido sin evidencia (documento, acta o resultado de prueba). Mientras quede alguno abierto, `carmo_private.study_config.data_mode = 'validation'`.

## A. Regulatorio y documental (CARMO_REGULATORY_GAPS)

- [ ] RG-01 Dictamen de la modificación que cubre el protocolo v3.0 y la HIP/CI v3.0 (el dictamen aportado cubre la v2.0 y la HIP/CI v1.0).
- [ ] RG-31 Cobertura ética y conformidad o contrato de cada centro, antes de autorizarlo.
- [ ] RG-33 Situación del reclutamiento: ¿hay pacientes ya incluidos en REDCap? Plan de migración o enmienda del calendario.
- [ ] RG-02 Sustitución de REDCap por CARMO valorada por el promotor; modificación o notificación al CEIm resuelta; HIP/CI coherente.
- [ ] RG-03 Cambio en el equipo comunicado según el procedimiento.
- [ ] RG-09 EIPD, base jurídica, contrato de encargo con Supabase e informe del DPD que cubran el proyecto compartido.
- [ ] RG-10 Política de datos tras la retirada del consentimiento.
- [ ] RG-27 Repositorio privado o confirmación de que no contiene material confidencial.

## B. Contenido científico

- [ ] Protocolo transcrito: diccionario con página de origen en cada variable; `carmo_variables.status = 'validated'`.
- [ ] Criterios de selección `CARMO-SEL-P3.0` (borrador) confirmados frente a la versión aprobada y activados:
  ```sql
  update public.carmo_eligibility_sets set status = 'active', validated_by = 'Nombre (coordinación)', validated_at = current_date
   where version = 'CARMO-SEL-P3.0';
  ```
- [ ] Cada centro autorizado (código de 3 cifras; reutilizar el de REDCap si existe):
  ```sql
  update public.carmo_centers set study_number = 1, participation_status = 'authorized',
         authorization_reference = 'Dictamen CEIm-G 2025/330 …; conformidad del centro …', is_active = true, activated_at = current_date
   where code = 'CHUS';
  ```
- [ ] Calendario `validated` (ventanas S12-S48; relación S48/FINAL).
- [ ] Instrumentos: versión, licencia y puntuación de EQ-5D, EVASAF y Morisky-Green; textos autorizados para administración electrónica, si procede.
- [ ] Modelo CMO cardiovascular oficial cargado, con pruebas de equivalencia frente a casos de referencia del documento, y `validated`.
- [ ] Taxonomía de intervenciones cargada y `validated`.
- [ ] Centros autorizados cargados con su referencia documental; investigadores dados de alta y asignados.

## C. Técnico

- [ ] Aprobación explícita para aplicar las migraciones en producción (RG-25).
- [ ] Copia de seguridad del proyecto antes de aplicarlas.
- [ ] Aplicar en orden `supabase/migrations/2026110510*.sql`. Comprobar `get_advisors` (seguridad) y repetir la batería en una rama o copia.
- [ ] Cambio de una línea en `dermapex/db-tests/40_*` aprobado y fusionado (RG-26).
- [ ] Prueba E2E en navegador contra un stack local (login, alta, inclusión, visita, IEXPAC, cierre, exportación) por cada rol.
- [ ] Validación de la importación SPSS con PSPP (`scripts/validate-export-spss.py`).
- [ ] Prueba de recuperación de una copia de seguridad.
- [ ] Formación de los usuarios y procedimiento de incidencias.
- [ ] Pacientes sintéticos: decisión documentada (se conservan marcados o se eliminan por SQL administrativo con acta) antes de cambiar a `production`.
- [ ] `update carmo_private.study_config set data_mode = 'production', change_reason = '…'` ejecutado por la coordinación, con acta.

## D. Procedimiento de alta (SQL administrativo)

```sql
-- 1) La cuenta de Auth la crea el administrador (invitación). 2) Autorización y rol:
select carmo_private.provision_user('persona@hospital.es', 'site_investigator', 'Nombre Apellido');
-- 3) Centro (debe existir, autorizado y activo):
select carmo_private.assign_center('persona@hospital.es', 'CODIGO');
```

## Reversión de las migraciones (solo antes de introducir datos)

Orden inverso: eliminar las tablas `public.carmo_*`, las vistas y el esquema `carmo_private`. Solo si no existe ninguna fila `app_code = 'carmo'`, restaurar el CHECK de `app_access` a `('dermapex','coag')`. No afecta a DERMAPEX ni COAMO, porque no hay dependencias cruzadas.
