# CARMO · Modelo de estratificación CMO cardiovascular

Versión del modelo en CARMO: **CMO-CV-SEFH-2024** · migración `20261105200000_carmo_cmo_cardio_model.sql` · estado inicial: **borrador** (draft).

**Fuente:** «Adaptación del Modelo de Atención Farmacéutica CMO en el Paciente con Patologías Cardiovasculares» (MAPEX-SEFH), versión Markdown aportada por el IP el 05/11/2026. Apartados utilizados:

- III. Tablas 1-4: 20 variables, pesos de 1 a 4.
- IV. Puntos de corte y excepciones.
- V. Tablas 5-7 y periodicidad.

## 1. Implementación

| Elemento | Dónde |
|---|---|
| Definición única: variables, opciones, puntos, bloques, máximos, umbrales y excepciones | `src/domain/cmoCardioModel.json` (la misma, incrustada en la migración 07; una prueba verifica que son idénticas) |
| Cálculo en la aplicación | `src/domain/cmoEngine.ts` (`computeCmo`) |
| Cálculo en la base de datos | `carmo_private.cmo_compute(definición, entradas)`. Al guardar, la BD recalcula y **rechaza** cualquier diferencia de puntuación o prioridad con la aplicación |
| Huella | `carmo_cmo_models.definition_sha256` = SHA-256 de la definición almacenada |
| Validación profesional | Confirmar, o **elevar** con motivo. El modelo no prevé rebajar la prioridad y la BD lo impide |
| Reestratificación | Registro nuevo con `supersedes_id`. El resultado original no se modifica nunca |
| Actuaciones | `src/domain/cmoCardioActions.json` → `carmo_intervention_catalog` (29 actuaciones, acumulativas: P3 = 17, P2 = 21, P1 = 29) |
| Sugerencias a partir del eCRD | `src/domain/cmoSuggestions.ts`: edad, IMC, polimedicación, tabaco, HTA, prevención secundaria, diabetes. Son ayudas: el farmacéutico confirma cada respuesta |

## 2. Variables y puntos (Tablas 1-4)

| Bloque (máx.) | Variable (código) | Puntos |
|---|---|---|
| Demográficas (7) | Edad (`age_group`) | < 18: no aplicable · 19-49: 0 · 50-69: 2 · ≥ 70: 3 |
| | Embarazo (`pregnancy`) | Sí → **Prioridad 1** con independencia de la puntuación |
| | Peso/estado nutricional (`nutritional_status`) | IMC < 18,4: 1 · 18,5-24,9: 0 · 25-30: 1 · > 30 y < 40: 2 · > 40: 3 |
| | Sexo (`female_cv_condition`) | Mujer con FA, HTP (< 45 años / edad fértil) o cardiopatía isquémica: 1 |
| Clínicas (20) | Patología CV de base de mayor riesgo (`base_cv_pathology`) | 1 |
| | Comorbilidad CV (`cv_comorbidity`) | 2 |
| | IC + cardiopatía isquémica (`hf_ischemic_combination`) | 3 |
| | IC + FA (`hf_af_combination`) | 3 |
| | Comorbilidad no CV (`non_cv_comorbidity`) | 1 |
| | Dislipemia por encima del objetivo (`dyslipidemia_above_target`) | 2 |
| | FEVI < 40 % (`lvef_below_40`) | 1 |
| | Tromboembolismo venoso (`venous_thromboembolism`) | 1 |
| | Hipertensión arterial (`hypertension`) | 2 |
| | Ingresos/urgencias en el último año (`admissions_emergencies`) | 2 |
| | Primer año tras un evento coronario (`first_year_post_coronary_event`) | 2 |
| Farmacoterapéuticas (12) | Cambios en el régimen (`regimen_changes`) | 1 |
| | Complejidad (`regimen_complexity`) | 1 |
| | Medicamentos de alto riesgo ISMP (`high_risk_medication`) | 4 |
| | Objetivos farmacoterapéuticos no alcanzados (`pharmacotherapy_goals_not_met`) | 2 |
| | Polimedicación (`polypharmacy`) | 7-10: 1 · ≥ 10: 2 |
| | Adherencia (`adherence`) | Adherente 0 · riesgo 1 · falta de adherencia 2 |
| Sociosanitarias (3) | Actividad física (`physical_activity`) | Sedentario 1 · actividad intensa 1 |
| | Tabaco (`tobacco`) | Exfumador en los últimos 5 años 1 · fumador activo 2 |

Puntos de corte: **P1 ≥ 23 · P2 ≥ 17 · P3 < 17**; máximo **42**.

## 3. Validación frente a los casos clínicos del documento

| Caso | Documento | CARMO | Uso |
|---|---|---|---|
| 4 | 18 puntos (2 + 6 + 7 + 3), P2 | 18 (2 + 6 + 7 + 3), P2 | **Prueba automática** en la aplicación y en la BD |
| 5 | 17 puntos (3 + 4 + 8 + 2), P2 | 17 (3 + 4 + 8 + 2), P2 | **Prueba automática**; confirma que 17 es P2 (límite incluido) |
| 1 | 36 puntos, P1; farmacoterapéuticas 13 «de un máximo de 16» | — | **No utilizable**: 13 supera el máximo de 12 de la Tabla 3 |
| 2 | 19 puntos, **«Prioridad 3»**; habla de un máximo clínico de 27 y puntúa deterioro cognitivo y estado depresivo | — | **No utilizable**: 19 ≥ 17 debería ser P2 según el apartado IV; los máximos y las variables no coinciden con las Tablas 2 y 4 |
| 3 | 12 puntos, P3 (preestratificación) | — | Sin desglose suficiente; además, el tabaquismo se describe de forma contradictoria («menos de 2 años» frente a «más de 5 años») |

Interpretación: los casos 1 y 2 parecen corresponder a una versión anterior del modelo. Conviene comunicarlo a MAPEX-SEFH.

## 4. Decisiones de interpretación: requieren confirmación del IP antes de validar el modelo

1. **Las filas de la Tabla 2 suman por separado**: comorbilidad CV (2), IC + cardiopatía isquémica (3) e IC + FA (3); también FEVI < 40 % (1) y TEV (1). Es la única lectura compatible con el máximo clínico de 20 declarado y con el máximo total de 42.
2. **Puntos de corte inclusivos**: 17 → P2 y 23 → P1, como confirma el caso 5.
3. **Huecos de las tablas**: CARMO no sugiere y exige elegir a mano:
   - edad de 18 años (entre «< 18» y «19-49»);
   - IMC entre 18,4 y 18,5, entre 24,9 y 25, y exactamente 40;
   - polimedicación de exactamente 10 principios activos (incluida en «7-10» y en «≥ 10»);
   - exfumador de exactamente 5 años.
4. **Hipercolesterolemia familiar en prevención primaria no está en la lista de «patología de base de mayor riesgo»**, así que puntúa 0 en esa variable. En CARMO afecta a los pacientes con solo HCF, que puntúan menos que los de prevención secundaria.
5. **Embarazo → P1**. **Menores de 18 años → modelo no aplicable** (en CARMO no deberían incluirse).
6. **Validación profesional solo al alza**: «si se considera elevar a un paciente a un nivel superior… es conveniente realizarlo». Rebajar no está previsto y la BD lo impide.
7. **Periodicidad**: P1 reestratificación cada 3-6 meses (CARMO avisa a los 6) y seguimiento como máximo a los 45 días; P2 anual; P3 según necesidad. Es independiente del calendario de visitas del protocolo (S12, S24, S36, final).
8. **Catálogo**:
   - Las Tablas 5-7 se han transcrito de forma resumida, eliminando una actuación duplicada en la Tabla 6.
   - Se añaden dos entradas que no están en esas tablas, pero sí en el protocolo y en los módulos del modelo: MOT01 (entrevista motivacional) y OPO01 (seguimiento a distancia / teleconsulta).

## 5. Activación (tras confirmar §4)

```sql
update public.carmo_cmo_models
   set status = 'validated', validated_by = 'Nombre del IP / coordinación', validated_at = current_date
 where version = 'CMO-CV-SEFH-2024';
```

Hasta entonces la aplicación previsualiza el cálculo, pero no guarda estratificaciones. Cualquier cambio posterior del modelo será una **versión nueva** (otra fila en `carmo_cmo_models`); las estratificaciones guardadas conservan su versión.
