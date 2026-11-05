# CARMO · Auditoría de partida, arquitectura y decisiones

Versión 0.1 · 05/11/2026 · Fases 0-1 completas; fases 2-6 parcialmente completas (ver §8).

## 1. Auditoría (Fase 0)

### 1.1 Fuentes inspeccionadas (solo lectura)

| Fuente | Estado observado |
|---|---|
| `ramonmorillo/dermapex` @ `15082e5` | React 18.3 + TS 5.9 + Vite 5.4 + React Router 6.30 (hash) + supabase-js 2.53 + xlsx 0.18.5 + Vitest 2.1.9. **Es el historial canónico de migraciones del proyecto Supabase compartido**: contiene también las de COAMO (`coag_*`) y las baterías SQL de RLS (`db-tests/`) |
| `ramonmorillo/COAMO` @ `1e5334c` | Segunda aplicación sobre el mismo proyecto. Su frontend es el patrón más cercano a CARMO: barrera de acceso por aplicación, perfiles propios, exportación de investigación verificada (ZIP + manifiesto + SPSS), cuestionarios con revisión y motivo |
| Proyecto Supabase `efjpjponblmdjlhmmiet` («dermapex», eu-west-1, PG 17), consultado solo con `SELECT` | 31 migraciones aplicadas, idénticas en nombre a las del repositorio DERMAPEX. Esquemas propios: `public` (DERMAPEX sin prefijo; COAMO con `coag_*`), `app_private`, `coag_private`. **Ningún objeto `carmo`**. `app_access`: 7 cuentas `dermapex` y 7 `coag`. CHECK `app_code IN ('dermapex','coag')`. Trigger `trg_auth_users_create_profile` en `auth.users` |
| Protocolo CARMO v3.0 y dictamen del CEIm-G | Aportados el 05/11/2026 (fuera del repositorio). El dictamen cubre la v2.0 y 2 centros (RG-01, RG-31) |
| Modelo CMO cardiovascular (MAPEX-SEFH) | **No localizado** (RG-21) |

### 1.2 Matriz de reutilización

| Componente | Origen | Decisión | Motivo |
|---|---|---|---|
| Configuración Vite/TS, CI, despliegue en Pages | COAMO | Reutilizado (renombrado) | Mismo stack y las mismas restricciones de Pages |
| `lib/supabase.ts`, `lib/authLinks.ts`, `authService`, `accessDecision` | COAMO | Reutilizado | Clave de sesión propia (`carmo-auth`); barrera por perfil propio |
| Login, cambio de contraseña, confirmación por enlace | COAMO | Adaptado (portada reescrita) | Sin contenido clínico ajeno |
| Sistema de diseño (`main.css`) y componentes UI | DERMAPEX→COAMO | Reutilizado + `carmo.css` (marca azul) | Identidad CMO común; marca diferenciada |
| Exportación (`csv`, `spec`, `spss`, `zip`, `reader`, `bundle`) | COAMO | Reutilizado; `datasets.ts` reescrito | Motor maduro y verificado (conciliación de recuentos, CRC, SHA-256, PSPP); los conjuntos son propios de CARMO |
| Patrón SQL: esquema privado, `app_gate` restrictivo, helpers `SECURITY DEFINER`, auditoría por trigger, alta por SQL | COAMO (`coag_foundation`) | Reutilizado conceptualmente; **ningún objeto compartido** | Probado en producción |
| Stubs SQL y baterías canónicas | DERMAPEX `db-tests/` | Se usan en las pruebas como **no regresión** | Demuestran que CARMO no rompe DERMAPEX/COAMO |
| Variables, cuestionarios, modelos CMO e intervenciones de DERMAPEX/COAMO | — | **No copiados** | Prohibido por el encargo; no extrapolables |
| Motor CMO | DERMAPEX (concepto) | Reescrito como motor genérico basado en definición | Sin reglas clínicas |

## 2. Arquitectura

- **Frontend**: SPA estática (GitHub Pages, `createHashRouter`), solo con la clave pública. Sin APIs de pago ni IA externa.
- **Backend**: el proyecto Supabase existente. Toda regla de negocio crítica (inclusión, ventanas, inmutabilidad, puntuación IEXPAC, bloqueo por cierre, roles) se aplica **en la BD** (RLS + triggers), y la interfaz solo la refleja.
- **Modelo de datos**: prefijo `public.carmo_*` + esquema `carmo_private` (funciones, contadores, configuración); 7 migraciones aditivas en `supabase/migrations/`.

### 2.1 Por qué `public.carmo_*` y no un esquema `carmo` expuesto

1. Exponer un esquema nuevo en la Data API es una **configuración global del proyecto** compartido. Tocarla afectaría a DERMAPEX y COAMO y no se puede versionar en una migración.
2. COAMO ya resolvió el mismo problema con `public.coag_*` + `coag_private`, con pruebas y en producción. Repetir el patrón reduce el riesgo.
3. El aislamiento **no** depende del nombre. Depende de: RLS en todas las tablas; política **restrictiva** `carmo_app_gate`, que exige `app_access('carmo')`; revocación de los privilegios por defecto (`anon` sin nada, `authenticated` sin DELETE ni TRUNCATE); concesiones por columna; funciones `SECURITY DEFINER` con `search_path=''`; y ausencia de FK, helpers o logs compartidos con DERMAPEX o COAMO. Las pruebas de inventario lo verifican también para las tablas `carmo_*` futuras.

## 3. Roles (aplicados en la BD)

| Rol | Pacientes / visitas | Datos clínicos | Cuestionarios | Cerrar / reabrir | Centros / cuentas | Auditoría |
|---|---|---|---|---|---|---|
| `tech_admin` | — | — | — | — | Lectura y gestión de centros y pertenencias | — |
| `coordinator` | Todos los centros | L/E | L/E | Sí | Sí | Todo |
| `site_pi` | Sus centros | L/E | L/E | Sí | — | — |
| `site_investigator` | Sus centros | L/E | L/E | No | — | — |
| `external_evaluator` | Sus centros (código y visitas) | **No** | L/E | No | — | — |
| `monitor` | Sus centros | Solo lectura | Solo lectura | No | — | Sus centros |

Ningún rol puede borrar datos clínicos. Las cuentas y los centros se dan de alta solo por SQL administrativo (`carmo_private.provision_user`, `assign_center`).

## 4. Aislamiento y no regresión (verificado)

`scripts/test-db.sh` ejecuta, en un PostgreSQL 16 local y desechable:

1. los stubs de Supabase y las **31 migraciones canónicas** (estado equivalente a producción);
2. las 7 migraciones de CARMO;
3. las **13 baterías canónicas de DERMAPEX/COAMO**, con CARMO ya presente (no regresión): todas superadas;
4. la batería CARMO (`db-tests/10_*`, ~90 aserciones): inventario de seguridad, aislamiento por centro con UUID conocidos, cuentas DERMAPEX y revocadas, anon, roles, inclusión, visitas, cierre, observaciones, IEXPAC, tratamientos, auditoría y retirada.

### 4.4 Única adaptación de las pruebas canónicas

`40_app_access_isolation.sql` (DERMAPEX) trata como tabla DERMAPEX cualquier tabla de `public` sin el prefijo `coag_`. El script trabaja sobre una **copia temporal** que añade la exclusión de `carmo_`; el repositorio DERMAPEX no se toca. Cuando CARMO se aplique en producción, esa prueba fallará en el repositorio DERMAPEX hasta que se apruebe allí el cambio de una línea (RG-26).

## 5. Integridad de datos (garantías del encargo §12)

| Garantía | Mecanismo | Prueba |
|---|---|---|
| G1 Guardado íntegro | Escritura con `select()` de confirmación; la BD sella autor y fecha | DB G1 |
| G2 Actualización trazable | Observaciones y eventos de tratamiento de solo-adición; resto con `revision`, motivo y auditoría con valor anterior y nuevo | DB G2, auditoría |
| G3 Una visita no altera otra | Triggers por fila; inmutabilidad de paciente y tipo de visita | DB G3 |
| G4 Aislamiento entre centros | RLS + helpers; pruebas con UUID conocidos | DB G4 (×4) |
| G5 La exportación no omite registros | Lectura paginada + recuento antes y después + rechazo de duplicados | UT export |
| G6 Derivadas reproducibles | IEXPAC en la BD = TS (Σ 11…55); IMC y diferencias puras | DB + UT |
| G7 Un fallo de red no es «guardado» | `createSaveGuard` + `SaveStatus` | UT |
| G8 Borrado impedido | Sin privilegio DELETE en ninguna tabla `carmo_*` | DB inventario |

Además: estados borrador/revisado/cerrado con bloqueo de dependientes; reapertura con motivo (`carmo_visit_state_log`); control de concurrencia por `revision`; aviso de cambios sin guardar en los cuestionarios; `is_synthetic` fijado por la BD en modo `validation`.

## 6. Protección de datos (evaluación preliminar; no sustituye la EIPD)

- **Minimización**: no existe ninguna columna para identificadores directos. El registro de selección identificativo queda en el centro. Los textos libres llevan aviso y se excluyen de la exportación.
- **Seudonimización**: el código lo asigna la BD. Los datos seudonimizados **siguen siendo datos personales** (RGPD, cons. 26).
- **Ubicación y encargado**: Supabase (AWS eu-west-1), en el **mismo proyecto** que otros dos estudios. Es necesario: base jurídica, contrato de encargo, EIPD actualizada e información en la HIP/CI (RG-02, RG-09).
- **Trazabilidad**: auditoría por trigger en todas las tablas; registro administrativo de altas y bajas de acceso (`app_private.admin_log`, heredado).
- **Riesgos residuales**: Auth compartido (una cuenta puede existir en varios estudios; la autorización es independiente por aplicación); el trigger de DERMAPEX crea un perfil DERMAPEX inerte para cada cuenta nueva; las copias de seguridad del proyecto son comunes.

## 7. Despliegue

- `ci.yml`: typecheck, pruebas y build en cada PR, y la batería SQL completa contra PostgreSQL 16 con el historial canónico de DERMAPEX (misma rama si existe; si no, `main`).
- `deploy-pages.yml`: **solo manual** (`workflow_dispatch`) hasta completar CARMO_GO_LIVE_CHECKLIST. Secretos: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (nunca la service-role).
- Migraciones: **no aplicadas** en Supabase. Se aplican en orden, tras la aprobación explícita (RG-25), con el procedimiento de la lista de verificación.

## 8. Estado por fases

| Fase | Estado |
|---|---|
| 0 Auditoría | Completa |
| 1 Infraestructura | Completa (migraciones no aplicadas en producción) |
| 2 eCRD | Variables, criterios (borrador), calendario y código de paciente transcritos del protocolo v3.0; pendientes de conciliar con la v2.0 aprobada |
| 3 Modelo CMO | Motor genérico + estructura; **cálculo desactivado** (RG-21, RG-22) |
| 4 Cuestionarios | IEXPAC completo; EQ-5D/EVASAF/Morisky bloqueados |
| 5 Gestión científica | Panel, agenda, exportación verificada; informes PDF individuales no implementados |
| 6 Validación | Pruebas DB y UT superadas; E2E con navegador y backend local no ejecutado (PostgREST no disponible en el entorno) |
| 7 Entrega | Documentación y lista de verificación; **no apto para datos reales** |
