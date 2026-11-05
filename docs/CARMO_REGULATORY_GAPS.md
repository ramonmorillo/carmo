# CARMO · Registro de discrepancias regulatorias y decisiones pendientes

Versión del registro: **0.2 · 05/11/2026** · Estado: **abierto**. Los códigos RG-xx se citan en el código y en las migraciones.

> **Nada de lo implementado está amparado automáticamente por el dictamen favorable del CEIm-G (registro 2025/330).**
> Hay que validar con el promotor (FEFH) y, cuando proceda, con el CEIm-G **antes** de introducir datos reales.

## 0. Fuentes contrastadas

Los documentos originales no se versionan en el repositorio porque es público y el protocolo contiene una cláusula de confidencialidad.

| Documento | Datos objetivos relevantes |
|---|---|
| **Dictamen del CEIm-G**, firmado el 15/09/2025 | Reunión del **24/07/2025**. **Protocolo v2.0 de 18/08/2025**; **HIP/CI v1.0 de 17/06/2025**. Centros: **C.H.U. de A Coruña y C.H.U. de Santiago**. Investigadores: **María José Mauriz Montero (coordinadora)** y la investigadora del C.H.U. de Santiago. Tipo de estudio: «Outros». Informe favorable |
| **Protocolo v3.0**, 12/09/2025 (aportado por el IP) | Coordinación: Mauriz Montero y Morillo Verdugo. **14 centros**. HIP/CI v3.0. CRDe = **REDCap** suministrado por el promotor; código de paciente de 3+2 cifras. Reclutamiento de 10/2025 a 12/2025, seguimiento hasta 12/2026 y fin en 06/2027 |
| Documento del modelo CMO cardiovascular | **Pendiente**: el IP lo enviará en Markdown |

## A. Gobierno del estudio y documentación aprobada

| Código | Discrepancia | Dato objetivo | Implicación (interpretación) | Estado en CARMO | Decide |
|---|---|---|---|---|---|
| RG-01 | La versión aprobada no es la v3.0 | El dictamen cubre el protocolo v2.0 (18/08/2025) y la HIP/CI v1.0. El protocolo v3.0 (12/09/2025) y la HIP/CI v3.0 son posteriores. Además, la fecha de la v2.0 es posterior a la reunión (24/07/2025), lo que hace pensar en una aprobación tras aclaraciones | Hace falta el dictamen de la **modificación** que cubre la v3.0 y la HIP/CI v3.0. Sin él, los cambios de la v3.0 (centros, coordinación) no constan como aprobados | La v3.0 es la fuente técnica del eCRD, pero todo está en estado provisional o borrador hasta la conciliación | Promotor + CEIm-G |
| RG-31 | **Centros fuera del dictamen** | El dictamen solo cita CHUAC y CHUS. La v3.0 añade 12 centros, entre ellos Valme | No hay constancia de cobertura ética ni de conformidad del centro (el protocolo exige contrato o conformidad) para 12 centros | Se registran los **14 centros como «pendiente de autorización» e inactivos**, sin código. Ninguno puede incluir pacientes | Promotor + CEIm-G |
| RG-03 | Cambio de coordinación | El dictamen nombra a la Dra. Mauriz **coordinadora única**. La v3.0 añade a R. A. Morillo Verdugo. La HIP/CI v3.0 la cita como coordinadora, contacto (teléfono y correo) y destinataria de los datos seudonimizados. El IP comunica que no participará | Su salida modifica la coordinación aprobada, el contacto y el destinatario de los datos en la HIP/CI, y quizá la participación de CHUAC. **No es una modificación aprobada** | No existe ningún usuario ni contacto suyo en CARMO. CHUAC queda pendiente | Promotor + CEIm-G |
| RG-02 | **REDCap → CARMO** | El protocolo establece REDCap como CRDe, suministrado por el promotor, y que REDCap asigna el código de centro | Cambio del sistema de recogida, del responsable o encargado y de la ubicación de los datos: probablemente es una modificación relevante. Hay que revisar la HIP/CI | Modo `validation` (solo datos sintéticos) | Promotor + CEIm-G + DPD |
| RG-33 | **El calendario del protocolo ya ha vencido** | Reclutamiento previsto de 10/2025 a 12/2025; fin del seguimiento 12/2026. Hoy es 05/11/2026 | O **ya hay pacientes reclutados** (¿en REDCap?), y entonces CARMO necesita un plan de migración o de convivencia, o hay que enmendar el calendario | Sin cambios hasta saberlo | IP + Promotor |
| RG-34 | Responsable del tratamiento y destinatarios | Según la HIP/CI, el responsable es la institución donde se investiga y los datos se envían seudonimizados a los coordinadores | Una base central en Supabase (proyecto compartido con DERMAPEX y COAMO, en una cuenta personal u organizativa) necesita contrato de encargo, EIPD e información coherente en la HIP/CI | Ver RG-09 | Promotor + DPD |
| RG-37 | Confidencialidad frente a repositorio público | El protocolo prohíbe divulgar su contenido sin permiso escrito del promotor. `ramonmorillo/carmo` es público | En el repositorio solo hay un diccionario de variables genéricas y la paráfrasis de los criterios (necesarios para el eCRD), sin texto literal del protocolo ni de los instrumentos. **Requiere el visto bueno del promotor o un repositorio privado** (ver §F) | Sin documentos originales en el repositorio | IP + Promotor |
| RG-29 | Conservación | El CI recoge la elección del participante: datos eliminados o conservados seudonimizados al terminar | Plazo legal y procedimiento de borrado pendientes | `carmo_consents.future_use_choice` implementado; el borrado no está implementado | Promotor |

## B. Diseño, calendario y población

| Código | Pendiente | Situación en CARMO (calendario `CARMO-CAL-0.2`, provisional) |
|---|---|---|
| RG-05 | **Visita final: S48 o 12 meses ±28 días.** La tabla del protocolo pone la visita final en S48 (día 336) y el análisis habla de «48 semanas», mientras que el texto, la HIP y el procedimiento dicen 12 meses ±28 días (días 337-393). **S48 cae un día fuera de esa ventana** | Se adopta el texto: FINAL = inclusión + 365 ±28. S48 no se programa |
| RG-04 | Ventanas de S12, S24 y S36 no definidas. El seguimiento depende de la prioridad CMO | Sin ventana («no definida»). Se revisará con el documento CMO (RG-21) |
| RG-06 | Criterios de selección | **Transcritos (paráfrasis) del protocolo v3.0**: 4 de inclusión y 2 de exclusión (`CARMO-SEL-P3.0`), en **BORRADOR**. Activación tras confirmar que coinciden con la v2.0 aprobada (SQL en CARMO_GO_LIVE_CHECKLIST) |
| RG-38 | «Mayores de 18 años»: ¿>18 o ≥18? | Edad admitida a partir de 18; confirmar |
| RG-35 | Código de paciente | Implementado según el protocolo: `<CCC>-<PP>` (centro de 3 cifras + 2 cifras consecutivas por orden de inclusión, máximo 99 por centro). El código de centro lo fijaba REDCap: **si ya existen códigos REDCap, reutilizarlos**. Los candidatos llevan un código de selección `SEL-CCC-NNN` (técnico) |
| RG-36 | «Solo un investigador principal por centro» | Aplicado en la BD |
| RG-07/08 | Centros | Ver RG-31 |
| RG-12 | Motivos de no inclusión, retirada y pérdida | Vocabulario técnico provisional |
| RG-30 | Tamaño muestral 135 (122 + 10 % de pérdidas) | Configurable |

## C. Variables e instrumentos

| Código | Pendiente | Situación |
|---|---|---|
| RG-23 | Variables transcritas de «Valoración de los objetivos» | Sembradas en estado provisional (ver diccionario). Siguen abiertos: el método y la unidad del LDL-c y del colesterol no-HDL; el tipo de diabetes; el criterio diagnóstico de HCF |
| RG-39 | «Patología» y «pacientes naïve» (variable exploratoria) | Patología = 2 indicadores (HCF; prevención secundaria). `naive_patient` es provisional: **falta la definición operativa** |
| RG-19 | IEXPAC | Codificación confirmada por el protocolo (Siempre = 5 … Nunca = 1) y fórmula global implementada. La **puntuación condicional** se cita pero no se especifica: no está implementada |
| RG-32 | **Quién cumplimenta el IEXPAC** | El protocolo se contradice. Un pasaje dice que el inicial se hace con el farmacéutico que incluye y el final con un evaluador externo; otro dice que el IEXPAC y la satisfacción de las semanas 0 y 48 los hace el equipo externo. Implementado: se registra el rol del evaluador y la conformidad en el IEXPAC final (externo = conforme). **No bloquea** |
| RG-16 | EQ-5D: 3L o 5L, licencia, tarifa | El protocolo no lo precisa. Sigue bloqueado |
| RG-17 | EVASAF | El protocolo la cita como «ADJUNTO», pero el adjunto no se ha aportado. Tampoco se pudo consultar la publicación de Farm Hosp 2015 (dominio scielo.isciii.es no permitido en este entorno). Bloqueado |
| RG-40 | Morisky-Green «(%)» en las visitas inicial, S24 y final | Versión (¿4 ítems, Morisky-Green-Levine?), licencia y criterio de adherente pendientes. Bloqueado |
| RG-20 | Adherencia por dispensaciones | Método, ventana y umbral no especificados. Se registran las dispensaciones; no se calcula nada |
| RG-21 | Modelo CMO cardiovascular (tablas 1-7 del documento de adaptación) | **Pendiente de recibir.** Cálculo desactivado |
| RG-22 | Taxonomía de intervenciones (3 ámbitos: seguimiento farmacoterapéutico, formación y educación, coordinación con el equipo; tablas 5-7) | Pendiente del documento CMO |
| RG-15 | Problemas relacionados con medicamentos | No los define el protocolo |

## D. Protección de datos

| Código | Pendiente |
|---|---|
| RG-09 | Proyecto Supabase compartido (Auth común, eu-west-1). Aislamiento lógico probado. Necesita EIPD, contrato de encargo y coherencia con la HIP/CI (RG-34). Riesgo residual: el trigger de DERMAPEX crea perfiles DERMAPEX sin acceso |
| RG-10 | Uso de los datos tras la retirada del consentimiento. La HIP/CI permite retirarse, pero no dice qué pasa con lo ya recogido. CARMO conserva y marca |
| RG-13 | Versión de la HIP/CI en cada consentimiento (texto obligatorio). Aprobada: v1.0; protocolo: v3.0 |
| RG-14 | Texto libre excluido de la exportación |
| RG-42 | El protocolo habla de «total disociación» gracias al código, pero son datos **seudonimizados** (la HIP/CI lo expresa bien) y siguen siendo datos personales |

## E. Técnica con impacto en otros estudios

| Código | Pendiente |
|---|---|
| RG-25 | Ampliar el CHECK de `app_private.app_access` con `'carmo'` (objeto compartido): **requiere aprobación** |
| RG-26 | Cambio de una línea en `dermapex/db-tests/40_*` para excluir `carmo_` |
| RG-24 | `.sav` nativo: el análisis previsto usa IBM SPSS 29. Hoy se entregan CSV + sintaxis `.sps` |
| RG-43 | «Revisión y aprobación del CRDe mediante su firma»: en CARMO equivale al cierre por el IP con trazabilidad. **No es firma electrónica cualificada** |
| RG-28 | El alcance del monitor (por centro) y la escritura de la coordinación son decisiones técnicas que hay que confirmar |

## F. Repositorio privado y coste

Hacer privado el **repositorio de GitHub** no depende de Supabase ni exige Supabase Pro: la base de datos es la misma en ambos casos. El coste aparece porque **GitHub Pages** solo publica desde repositorios privados con un plan de pago de GitHub. Alternativas sin coste, a valorar: publicar desde el repositorio privado en un hosting estático gratuito que admita repositorios privados (Cloudflare Pages, Netlify, o Vercel Hobby si el uso no comercial lo permite), o mantenerlo público con el visto bueno del promotor (RG-37).
