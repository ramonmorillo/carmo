# CARMO · Diccionario de datos del eCRD

**Versión del diccionario: 0.1-provisional · 05/11/2026**

**Fuente: resumen del protocolo incluido en el encargo de desarrollo.** El protocolo v3.0 no estaba disponible (RG-01, RG-23), así que la columna «Página» queda como `pendiente` en todas las filas. Al recibir el protocolo, cada fila se verifica y pasa de `provisional` a `validated` en `carmo_variables` (con `definition_version` + 1 si cambia la definición).

Regla del encargo: ninguna variable se omite en silencio. Cada variable mencionada en el encargo aparece aquí con uno de estos estados:

- **IMPL**: implementada, pendiente de verificación;
- **BLOQ**: existe, pero no admite datos (falta el dominio);
- **NO-IMPL**: no implementada; se indica el motivo;
- **EXT-TÉC**: extensión técnica de la plataforma, no es variable del protocolo.

## 1. Selección, inclusión y estado del sujeto

| Variable | Tabla.columna | Tipo / dominio | Oblig. | Momento | Estado | Notas |
|---|---|---|---|---|---|---|
| Código seudonimizado | `carmo_patients.study_code` | `CARMO-NN-NNNN` (asignado por la BD) | Sí | Cribado | IMPL | Inmutable |
| Centro | `carmo_patients.center_id` | FK, centro autorizado y activo | Sí | Cribado | IMPL | Inmutable |
| Fecha de cribado | `carmo_patients.screening_date` | fecha ≤ hoy | Sí | Cribado | IMPL | |
| Resultado del cribado | `carmo_patients.status` | screening / included / not_included | Sí | Cribado | IMPL | |
| Motivo de no inclusión | `carmo_patients.status_reason` | lista provisional (RG-12) | Si no incluido | Cribado | IMPL | |
| Criterios de inclusión y exclusión | `carmo_eligibility_criteria` + `carmo_eligibility_answers.is_met` | sí/no por criterio, versionado | Todos | Cribado | **BLOQ** | Sin conjunto activo, la inclusión es imposible (RG-06) |
| Verificación en la fuente | `carmo_eligibility_answers.verified_in_source` | booleano | — | Cribado | EXT-TÉC | |
| Consentimiento firmado | `carmo_consents` (status `signed`) | registro | Sí | Antes de incluir | IMPL | El documento físico se queda en el centro |
| Versión documental del consentimiento | `carmo_consents.document_version` | texto ≤ 80 | Sí | — | IMPL | RG-13 |
| Fecha de consentimiento | `carmo_consents.signed_date` | fecha ≤ hoy | Sí | — | IMPL | |
| Investigador responsable | `carmo_consents.investigator_id`, `carmo_patients.responsible_investigator_id` | profesional vigente del centro | Sí | — | IMPL | |
| Fecha de inclusión | `carmo_patients.inclusion_date` | la fija la BD al incluir | Sí | Inclusión | IMPL | |
| Retirada del consentimiento | `carmo_consents.withdrawal_date`, `withdrawal_scope` | fecha; alcance pendiente (RG-10) | Si procede | — | IMPL | |
| Salida del estudio | `carmo_patients.status` withdrawn / lost_to_followup / completed + motivo | — | Si procede | — | IMPL | `completed` exige visita final realizada |
| Datos sintéticos | `carmo_patients.is_synthetic` | lo fija la BD | — | — | EXT-TÉC | |

## 2. Visitas

| Variable | Tabla.columna | Dominio | Estado |
|---|---|---|---|
| Tipo de visita | `carmo_visits.visit_code` | BASAL, S12, S24, S36, S48, FINAL, EXTRA | IMPL (RG-04/05) |
| Fecha prevista | `planned_date` | calendario versionado | IMPL |
| Fecha efectiva | `actual_date` | ≤ hoy, ≥ inclusión | IMPL |
| Estado | `status` | prevista / realizada / no realizada / anulada | IMPL |
| Modalidad | `modality` | presencial / telefónica | IMPL |
| Profesional responsable | `responsible_id` | profesional del centro | IMPL |
| Estado del registro | `record_state` | borrador / revisada / cerrada | EXT-TÉC |
| Ventana | vista `carmo_visit_windows` | en ventana / fuera / no definida | IMPL (derivada) |
| Evolución clínica | `carmo_visit_evolutions.clinical_evolution` | texto ≤ 4000 | IMPL |
| Actualización farmacoterapéutica | `pharmacotherapy_update` | texto | IMPL |
| Seguimiento motivacional | `motivational_followup` | texto | IMPL |
| Problemas relacionados con medicamentos | `drp_identified`, `drp_description` | sí/no + texto | IMPL (RG-15) |
| Incidencias y desviaciones | `carmo_deviations` | categoría técnica + texto | IMPL |
| Reestratificaciones | `carmo_stratifications` (`supersedes_id`) | — | **BLOQ** (RG-21) |

## 3. Variables clínicas (`carmo_variables` → `carmo_observations`)

Cada observación lleva: valor tipado, unidad, `observed_date`, `data_source` (origen) y `temporal_context` (antecedente previo a la inclusión, basal, seguimiento o evento incidente). Además, `is_missing` + `missing_reason`. Las correcciones se registran con `supersedes_id` + `correction_reason`.

| Código | Variable | Sección | Tipo | Unidad | Rango | Contextos admitidos | Estado |
|---|---|---|---|---|---|---|---|
| `familial_hypercholesterolemia` | Hipercolesterolemia familiar | Antecedentes CV | sí/no | — | — | antecedente, basal | IMPL (criterio diagnóstico no especificado) |
| `secondary_prevention` | Prevención secundaria CV | Antecedentes CV | sí/no | — | — | basal, seguimiento | IMPL (definición operativa pendiente) |
| `weight` | Peso | Antropometría | numérico | kg | 20-350 | basal, seguimiento | IMPL |
| `height` | Talla | Antropometría | numérico | cm | 100-230 | basal, seguimiento | IMPL |
| (derivada) | IMC | Antropometría | numérico | kg/m² | — | — | IMPL, se calcula y no se almacena: peso / (talla/100)² |
| `smoking` | Tabaquismo | Factores de riesgo | categórica | — | **dominio no definido** | basal, seguimiento | **BLOQ** (RG-23) |
| `diabetes` | Diabetes | Factores de riesgo | sí/no | — | — | basal, seguimiento | IMPL (tipo no especificado) |
| `hypertension` | Hipertensión | Factores de riesgo | sí/no | — | — | basal, seguimiento | IMPL |
| `ldl_c` | LDL-c | Analítica | numérico | mg/dL o mmol/L | 0-1000 | basal, seguimiento | IMPL (método no especificado; sin conversión) |
| `non_hdl_c` | Colesterol no-HDL | Analítica | numérico | mg/dL o mmol/L | 0-1500 | basal, seguimiento | IMPL (medido o derivado: pendiente) |
| `acs` | Síndrome coronario agudo | Eventos CV | sí/no + fecha | — | — | antecedente, evento incidente | IMPL |
| `ami` | Infarto agudo de miocardio | Eventos CV | sí/no + fecha | — | — | antecedente, evento incidente | IMPL |
| `unstable_angina` | Angina inestable | Eventos CV | sí/no + fecha | — | — | antecedente, evento incidente | IMPL |
| `chronic_coronary_disease` | Enfermedad coronaria crónica | Antecedentes CV | sí/no | — | — | antecedente, basal | IMPL |
| `ischemic_stroke` | Ictus isquémico | Eventos CV | sí/no + fecha | — | — | antecedente, evento incidente | IMPL |
| `tia` | Accidente isquémico transitorio | Eventos CV | sí/no + fecha | — | — | antecedente, evento incidente | IMPL |
| `coronary_revascularization` | Revascularización coronaria | Eventos CV | sí/no + fecha | — | — | antecedente, evento incidente | IMPL |
| `other_arterial_revascularization` | Revascularización de otras arterias | Eventos CV | sí/no + fecha | — | — | antecedente, evento incidente | IMPL (territorio no especificado) |
| `peripheral_artery_disease` | Enfermedad arterial periférica | Antecedentes CV | sí/no | — | — | antecedente, basal | IMPL |
| — | Datos demográficos (edad, sexo…) | Demográfica | — | — | — | — | **NO-IMPL**: el encargo no los detalla (RG-23) |
| — | Datos sociosanitarios | Sociosanitaria | — | — | — | — | **NO-IMPL** (RG-23) |
| — | Otros parámetros clínicos y analíticos del protocolo | — | — | — | — | — | **NO-IMPL**: pendientes de transcribir |

Reglas de la BD: no se admiten fechas futuras; un evento incidente no puede ser anterior a la inclusión y un antecedente no puede ser posterior. Unidad y rango obligatorios en las variables numéricas. Solo se admite el tipo declarado. No se escribe en visitas cerradas ni anuladas.

## 4. Tratamiento farmacológico

| Variable | Tabla.columna | Estado |
|---|---|---|
| Principio activo (alirocumab, evolocumab, inclisirán, evinacumab, o concomitante libre) | `carmo_treatments.active_ingredient`; `is_study_lipid_therapy` (derivada) | IMPL |
| Presentación, dosis, unidad, posología, vía | `presentation`, `dose_amount`, `dose_unit`, `frequency`, `route` | IMPL |
| Inicio y fin; activo/suspendido/finalizado | `start_date`, `end_date`, `status` (actualizados solo por eventos) | IMPL |
| Iniciado antes de la inclusión | `started_before_inclusion` (derivada) | EXT-TÉC |
| Modificaciones, motivo, incidencias, reacciones adversas | `carmo_treatment_events` (solo-adición) | IMPL |
| Dispensaciones (fecha, unidades, días de cobertura) | `carmo_dispensations` | IMPL |
| Adherencia por dispensación | — | **NO-IMPL** (RG-20) |
| Adherencia autorreferida (Morisky-Green) | `carmo_questionnaire_administrations` | **BLOQ** (RG-18) |

## 5. Cuestionarios

| Instrumento | Ítems / dominio | Resultado | Visitas | Estado |
|---|---|---|---|---|
| IEXPAC | 11 ítems, códigos 1-5 | `scores.sum` (11-55) y `scores.global` = 10 × (Σ − 11) / 44, solo con 11 ítems | BASAL, FINAL | IMPL (RG-19) |
| EQ-5D-3L / 5L | 5 dimensiones + EVA 0-100 | Perfil; **sin índice** | BASAL, FINAL | **BLOQ** (RG-16) |
| EVASAF | pendiente | pendiente | BASAL, FINAL | **BLOQ** (RG-17) |
| Morisky-Green | pendiente | pendiente | todas | **BLOQ** (RG-18) |

Metadatos de cada administración (EXT-TÉC): estado, motivo de no realización, modalidad, soporte, fecha, evaluador y rol (fijados por la BD), versión, revisión, motivo de corrección. Se impiden los duplicados con `unique(visit_id, instrument_code)`.

## 6. Estratificación CMO e intervenciones

Estado: **BLOQ** (RG-21, RG-22). Estructura: `carmo_cmo_models` (definición versionada con huella SHA-256), `carmo_stratifications` (entradas, desglose, puntuación, prioridad, justificación, autor, fecha, versión del motor y del modelo, validación profesional, reestratificación), `carmo_intervention_catalog` y `carmo_interventions` (fecha, programada, modalidad, categoría, dominio CMO, motivo, actuación, destinatario, aceptación, resultado, seguimiento, responsable).

## 7. Codificación de datos ausentes

- La celda vacía en la exportación significa «no registrado».
- La ausencia explícita en el eCRD se registra con `is_missing = true` + `missing_reason`: no_realizado, no_disponible, no_aplica, desconocido o rechazado.
- No se imputa nunca.
