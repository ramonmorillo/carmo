# CARMO · Diccionario de datos del eCRD

**Versión del diccionario: 0.2-provisional · 05/11/2026**

**Fuente:** protocolo **v3.0** de 12/09/2025, aportado por el IP. La versión aprobada por el CEIm-G es la **v2.0** (RG-01): cada variable sigue en estado `provisional` en `carmo_variables` hasta que la coordinación la concilie con la v2.0 y la valide (`status = 'validated'`; `definition_version` + 1 si cambia).

Las páginas son las del **índice** del protocolo (el `.docx` no tiene paginación fija). Las secciones son:

- «Criterios» (p. 9 y p. 17);
- «Valoración de los objetivos» (VO, p. 14);
- «Procedimiento del estudio» / «Esquema de procedimientos» (EP, p. 12-13);
- «Inclusión y asignación del código» (p. 18).

Estados de cada variable:

- **IMPL**: implementada y pendiente de validar;
- **BLOQ**: existe, pero no admite datos;
- **NO-IMPL**: no implementada, con el motivo;
- **EXT-TÉC**: extensión técnica de la plataforma.

Ninguna variable se omite en silencio.

## 1. Selección, inclusión y estado del sujeto

| Variable | Fuente | Tabla.columna | Tipo / dominio | Oblig. | Estado |
|---|---|---|---|---|---|
| Código de selección | EXT-TÉC | `carmo_patients.screening_code` | `SEL-CCC-NNN` (BD) | Sí | EXT-TÉC |
| **Código de paciente** | p. 18 | `carmo_patients.study_code` | `CCC-PP`: centro 3 cifras + 2 cifras consecutivas por orden de inclusión (BD, al incluir) | Al incluir | IMPL (RG-35) |
| Centro | p. 6 / 15 | `center_id` | Centro autorizado y activo (RG-31) | Sí | IMPL |
| Fecha de selección | EXT-TÉC | `screening_date` | ≤ hoy | Sí | IMPL |
| Criterios de inclusión INC01-INC04 y exclusión EXC01-EXC02 | p. 9 y 17 | `carmo_eligibility_*` (`CARMO-SEL-P3.0`) | Sí/no por criterio; versionado | Todos | **BLOQ** hasta activar el borrador (RG-06) |
| Constancia en la historia clínica | p. 17 | `verified_in_source` | Booleano | — | IMPL |
| Consentimiento firmado | p. 12 y 17 | `carmo_consents` | Versión de la HIP/CI, fecha, investigador | Sí | IMPL |
| **Destino de los datos al terminar** (CI) | HIP/CI v3.0 | `future_use_choice` | Eliminados / conservados seudonimizados | Sí (si consta) | IMPL |
| Fecha de inclusión | p. 9 («día de inclusión» = visita inicial) | `inclusion_date` | La fija la BD | Sí | IMPL |
| No inclusión y motivo | — | `status`, `status_reason` | Lista provisional (RG-12) | — | IMPL |
| Retirada del consentimiento y salida | HIP/CI | `carmo_consents.withdrawal_*`, `carmo_patients.status` | — | — | IMPL (RG-10) |
| Población por intención de tratar y por protocolo | p. 20 | Derivadas en la exportación (`pob_itt`, `pob_pp`) | — | — | IMPL |

## 2. Visitas (calendario `CARMO-CAL-0.2`, EP)

| Visita | Momento (desde la inclusión) | Ventana | Procedimientos del protocolo |
|---|---|---|---|
| BASAL: visita inicial | Día 0 (S 1-4) | 0-27 d | Consentimiento; historia farmacoterapéutica; parámetros clínicos y analíticos; estratificación; IEXPAC; EVASAF; adherencia; EQ-5D |
| S12 (V1), S36 (V3) | 84 y 252 d | No definida | Teleconsultas o consultas programadas; intervenciones según prioridad |
| S24 (V2) | 168 d | No definida | Lo anterior + **valoración de la adherencia** |
| FINAL: fin de estudio | 365 d | ±28 d | Historia farmacoterapéutica; parámetros; IEXPAC (evaluador externo); EVASAF; adherencia; EQ-5D |
| EXTRA | Cuando se necesite | — | Teleconsultas o consultas **no programadas** |

Por cada visita se registran: fecha prevista y efectiva, estado, modalidad (presencial o telefónica), profesional responsable, estado del registro (EXT-TÉC), evolución clínica, actualización farmacoterapéutica, seguimiento motivacional, PRM, incidencias y desviaciones. RG-05: S48 frente a 12 meses.

## 3. Variables clínicas (`carmo_variables` → `carmo_observations`, fuente VO salvo indicación)

Cada observación lleva: valor tipado, unidad, `observed_date`, `data_source`, `temporal_context` (antecedente previo a la inclusión, basal, seguimiento o evento incidente), ausencia explícita con motivo y corrección por sustitución con motivo.

| Código | Variable (protocolo) | Tipo | Unidad / dominio | Visitas | Estado |
|---|---|---|---|---|---|
| `age_years` | Edad | Entero | Años, 18-120 | BASAL | IMPL (RG-38) |
| `sex` | Sexo | Categórica | M / F / desconocido | BASAL | IMPL |
| `weight` | Peso | Numérica | kg, 20-350 | BASAL, FINAL | IMPL |
| `height` | Altura | Numérica | cm, 100-230 | BASAL, FINAL | IMPL |
| (derivada) | Índice de masa corporal | Numérica | kg/m² = peso / (altura/100)² | — | IMPL (exportación) |
| `education_level` | Nivel de estudios | Categórica | Sin estudios / primaria / secundaria / superiores | BASAL | IMPL |
| `occupation` | Profesión | Texto libre | — | BASAL | IMPL (aviso de no identificar) |
| `familial_hypercholesterolemia`, `secondary_prevention` | Patología (HCF y/o prevención secundaria) | 2 × sí/no | — | BASAL | IMPL (RG-39) |
| `family_support` | Soporte familiar disponible | Sí/no | — | BASAL, FINAL | IMPL |
| `tobacco_use` | Hábito tabáquico: consumo de tabaco | Sí/no | — | BASAL, FINAL | IMPL |
| `cigarettes_per_day` | Número de cigarrillos diarios | Entero | cig/día, 0-200 | BASAL, FINAL | IMPL |
| `smoking_years` | Años fumando | Entero | años, 0-90 | BASAL, FINAL | IMPL |
| `years_since_quitting` | Años sin fumar | Entero | años, 0-90 | BASAL, FINAL | IMPL |
| `diabetes` | Diabetes | Sí/no | — | BASAL, FINAL | IMPL |
| `hypertension` | Hipertensión | Sí/no | — | BASAL, FINAL | IMPL |
| `ldl_c` | LDL-c | Numérica | mg/dL o mmol/L (sin conversión) | BASAL, FINAL | IMPL (método y unidad: RG-23) |
| `non_hdl_c` | Colesterol no-HDL | Numérica | mg/dL o mmol/L | BASAL, FINAL | IMPL |
| `acs` | Síndrome coronario agudo | Sí/no + fecha | Antecedente / incidente | Todas | IMPL |
| `ami` | IAM | Sí/no + fecha | Ídem | Todas | IMPL |
| `unstable_angina` | Angina inestable | Sí/no + fecha | Ídem | Todas | IMPL |
| `chronic_coronary_disease` | Enfermedad coronaria crónica | Sí/no + fecha | Ídem | Todas | IMPL |
| `ischemic_stroke` | Ictus isquémico | Sí/no + fecha | Ídem | Todas | IMPL |
| `tia` | AIT | Sí/no + fecha | Ídem | Todas | IMPL |
| `coronary_revascularization` | Revascularización coronaria | Sí/no + fecha | Ídem | Todas | IMPL |
| `other_arterial_revascularization` | Revascularización de otras arterias | Sí/no + fecha | Ídem | Todas | IMPL |
| `peripheral_artery_disease` | Enfermedad arterial periférica | Sí/no + fecha | Ídem | Todas | IMPL |
| `naive_patient` | Paciente naïve (variable exploratoria; «Diseño», p. 8) | Sí/no | — | BASAL | IMPL, **definición pendiente** (RG-39) |
| — | Variables del modelo CMO (tablas 1-4: demográficas, clínicas, farmacoterapéuticas, sociosanitarias) | — | — | BASAL (+ reestratificación) | **NO-IMPL**: pendiente del documento CMO (RG-21) |

## 4. Tratamiento farmacológico

| Variable | Tabla.columna | Estado |
|---|---|---|
| Medicamento de uso hospitalario del estudio (alirocumab, evolocumab, inclisirán, evinacumab) o concomitante | `carmo_treatments.active_ingredient`, `is_study_lipid_therapy` | IMPL |
| Presentación, posología, vía, inicio, fin, estado | Columnas homónimas (actualizadas por eventos) | IMPL |
| Modificaciones, motivo, incidencias, RAM | `carmo_treatment_events` | IMPL |
| Revisión de la historia farmacoterapéutica (BASAL, FINAL) | Evolución de la visita (`pharmacotherapy_update`) | IMPL |
| Registro de dispensaciones | `carmo_dispensations` | IMPL |
| Adherencia por dispensación (tratamiento hospitalario y no hospitalario) | — | **NO-IMPL** (RG-20) |

## 5. Cuestionarios

| Instrumento | Definición del protocolo | Visitas | Estado |
|---|---|---|---|
| IEXPAC | 11 ítems; Siempre = 5 … Nunca = 1; global = 10 × (Σ − 11) / 44 (0-10); final por evaluador externo | BASAL, FINAL | IMPL (condicional: NO-IMPL, RG-19; evaluador: RG-32) |
| EuroQoL-5D | 5 dimensiones (movilidad, cuidado personal, actividades cotidianas, dolor/malestar, ansiedad/depresión) + EVA 0-100 | BASAL, FINAL | **BLOQ** (3L o 5L, RG-16) |
| EVASAF | Farm Hosp 2015;39(3), «ADJUNTO» | BASAL, FINAL | **BLOQ** (RG-17) |
| Morisky-Green | «(%)» de adherencia | BASAL, S24, FINAL | **BLOQ** (RG-40) |

Metadatos (EXT-TÉC): estado, motivo de no realización, modalidad, soporte, fecha, evaluador, rol, **conformidad del evaluador**, versión, revisión, motivo de corrección. Un solo registro por instrumento y visita.

## 6. CMO e intervenciones

**BLOQ** hasta recibir el documento «Adaptación del Modelo de AF CMO al paciente con patología cardiovascular» (apartados II-V del módulo de capacidad: tablas 1-4 de estratificación y tablas 5-7 de actuaciones por prioridad; módulos de motivación y oportunidad).

Intervenciones previstas por el protocolo: número y tipo; programadas o no programadas; presencial o no presencial (telefónica); taxonomía del modelo.

## 7. Datos ausentes (protocolo, p. 20)

- Análisis de casos completos, **sin imputación**.
- Se cuantifican los perdidos en cada descripción.
- Exportación: celda vacía = no registrado; `is_missing` + `missing_reason` = ausencia explícita.
