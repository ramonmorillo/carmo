# CARMO · Matriz de trazabilidad entre protocolo, formulario, BD, validación, exportación y prueba

Versión 0.2 · 05/11/2026. «§» remite al encargo de desarrollo; «Protocolo» remite al protocolo v3.0 (índice de páginas). La versión aprobada es la v2.0 (RG-01). Las pruebas citadas son:

- `db-tests/10_carmo_security_integrity.sql` (**DB**): PostgreSQL real con RLS;
- `tests/*.test.ts` (**UT**): Vitest.

| Requisito (encargo) | Formulario / pantalla | Tabla.columna | Validación (BD) | Exportación | Prueba |
|---|---|---|---|---|---|
| §4 Registro de candidatos y cribado | Pacientes → Registrar candidato | `carmo_patients.screening_code` | Centro autorizado y activo; código asignado por la BD; inmutabilidad | raw/carmo_patients, analisis/pacientes | DB «código de selección SEL-001-002», «centro pendiente…» |
| Protocolo p. 18: código de paciente de 3+2 cifras, consecutivo por orden de inclusión | Ficha → Incluir | `carmo_patients.study_code`, `inclusion_seq` | Se asigna solo al incluir; irreversible; máximo 99 por centro | raw + analisis | DB «001-01», «no se puede revertir» |
| Protocolo: un IP por centro | — (SQL administrativo) | `carmo_center_memberships` | `enforce_single_site_pi` | — | DB «un solo investigador principal» |
| Protocolo p. 20: poblaciones por intención de tratar y por protocolo | — | derivada | — | `pob_itt`, `pob_pp` | UT export |
| Protocolo: IEXPAC final por evaluador externo | Formulario IEXPAC (aviso) | `evaluator_conformity` | Fijada por la BD | raw/cuestionarios | DB (no_aplica en basal) |
| HIP/CI: destino de los datos al terminar | Consentimiento | `carmo_consents.future_use_choice` | Dominio | raw/carmo_consents | DB inclusión |
| Protocolo p. 9 y 17: criterios INC01-04 y EXC01-02 | Ficha → Selección e inclusión | `carmo_eligibility_*` (`CARMO-SEL-P3.0`, borrador) | Solo durante el cribado; versión del paciente; motivo obligatorio para cambiar | — | DB «criterios en BORRADOR», «sin criterios activos…», «criterio no cumplido…», «versión distinta…», «se congelan…» |
| §4 Consentimiento (versión, fecha, investigador) | Ficha → Consentimiento | `carmo_consents` | Fecha ≤ hoy; investigador vigente del centro; retirada no reversible | raw/carmo_consents | DB «fecha futura», «investigador del centro» |
| §4 No incluir sin requisitos | Botón «Incluir» + lista de requisitos | `carmo_private.inclusion_blockers` | Trigger `enforce_patient_status` | — | DB inclusión |
| §4 Visitas previstas, realizadas y extraordinarias | Ficha → Visitas; Visita; Agenda | `carmo_visits`, `carmo_schedule_*`, `carmo_visit_windows` | Solo pacientes incluidos; una por código; sin fechas futuras; ≥ inclusión | raw/carmo_visits, raw/carmo_visit_windows | DB visitas; UT calendario |
| §4 Ventanas configurables y versionadas | — (SQL administrativo) | `carmo_schedule_versions/visits` | Ventana nula = «no definida» | raw/carmo_visit_windows | DB «S12 = inclusión + 84»; UT `windowStatus` |
| §4 No sobrescribir mediciones | Visita → Variables → Corregir | `carmo_observations.supersedes_id` | Sin UPDATE/DELETE; motivo; cadena lineal | raw (todas) + vista vigente en analisis | DB G2; UT `currentObservations` |
| §4 Cierre de visita, de seguimiento y retirada | Visita → Revisión y cierre; Ficha → Cierre y salida | `record_state`, `carmo_visit_state_log`, `carmo_patients.status` | Roles; motivo de reapertura; bloqueo de dependientes | raw/carmo_visits | DB cierre/reapertura y salida |
| §5 Motor CMO (estructura) | Estratificación | `carmo_cmo_models`, `carmo_stratifications` | Solo modelos `validated`; resultado inmutable; validación única | raw/carmo_stratifications | DB «modelo no validado»; UT motor |
| §6 IEXPAC 11 ítems, 0-10 | Visita → Cuestionarios → IEXPAC | `carmo_questionnaire_administrations` | Rango, ítems, duplicados, visita, revisión, motivo; puntuación en BD | raw + analisis/cuestionarios_items + longitudinal_pareado | DB IEXPAC (10/11, 11×5, 11×1, suma 34); UT `scoreIexpac` (Σ 11…55) |
| §6 Comparación basal-final IEXPAC | Cuestionarios; Ficha; Inicio | derivada | Solo con ambas válidas | `iexpac_dif`, `pob_iexpac_pareada` | UT export «pareado»; UT `pairIexpac` |
| §6 EQ-5D, EVASAF, Morisky-Green | Cuestionarios (estado) | `carmo_instruments` | Pendientes, no admiten datos | — | DB «EQ-5D pendiente» |
| §6 Evaluador externo | Rol `external_evaluator` | `evaluator_id`, `evaluator_role` | Fijados por la BD; sin acceso clínico | `evaluator_role` | DB evaluador |
| §7 Variables CV con fecha, unidad, valor, origen y contexto | Visita → Variables clínicas | `carmo_observations` | Tipo, unidad, rango, contexto, antecedente o incidente | raw/carmo_observations | DB G1, unidad, rango, incidente |
| §7 Variaciones longitudinales | — | derivada | Sin convertir unidades | `*_dif`, `imc_*` | UT `numericChange`, `deriveBmi`; UT export |
| §8 Tratamientos e historial | Ficha → Tratamiento | `carmo_treatments`, `carmo_treatment_events` | Sin edición directa; motivo; transiciones válidas | raw | DB tratamientos |
| §8 Dispensaciones | Ficha → Tratamiento | `carmo_dispensations` | Correcciones por sustitución | raw | — (pendiente RG-20) |
| §9 Intervenciones | Intervenciones | `carmo_interventions` | Solo catálogo validado | raw | DB «sin catálogo validado» |
| §10 Aislamiento de DERMAPEX/COAMO | — | `carmo_app_gate` + `app_access` | Barrera restrictiva | — | DB inventario, «cuenta DERMAPEX no ve CARMO», «coordinación CARMO no ve COAMO/DERMAPEX»; 13 baterías canónicas sin regresión |
| §10 Roles en la BD | — | `carmo_private.can_*` | RLS | — | DB investigador B, monitor, evaluador, administración técnica, revocado, anon |
| §12 Auditoría (valor anterior y nuevo, motivo) | — | `carmo_audit_log` | Trigger en todas las tablas | — | DB auditoría |
| §12 Fallo de red ≠ guardado | Todos los formularios (`useSave`) | — | — | — | UT `createSaveGuard` (G7) |
| §12 Doble envío | Todos los formularios | — | Guarda + índices únicos | — | UT «impide el doble envío» |
| §13 Exportación íntegra y reproducible | Exportación | lector paginado + conciliación | Recuento BD = exportado; CRC y SHA-256 | ZIP | UT export G5 y «lectura incompleta aborta» |
| §14 Dashboard con denominadores | Inicio | `computeDashboard` (lectura paginada conciliada) | RLS | — | UT `dashboard.test.ts` |
