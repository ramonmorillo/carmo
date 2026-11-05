# CARMO · Registro de discrepancias regulatorias y decisiones pendientes

Versión del registro: 0.1 · 05/11/2026 · Estado: **abierto**. Los códigos RG-xx se citan en el código y en las migraciones.

> **Nada de lo implementado está amparado automáticamente por el dictamen favorable del CEIm de Galicia (registro 2025/330).**
> Este registro enumera lo que debe validarse con el promotor (Fundación Española de Farmacia Hospitalaria) y, cuando proceda, con el CEIm, **antes** de introducir datos reales.

## Hecho de partida que condiciona todo el registro

Los documentos `Protocolo versión 3 de investigación CARMO.docx` y `CEImG FAVORABLE.pdf` **no estaban disponibles en el entorno de desarrollo**. Los busqué en el sistema de ficheros y en Google Drive, sin resultado. Toda referencia al protocolo procede del resumen incluido en el encargo de desarrollo del 05/11/2026. En consecuencia:

- ninguna variable tiene todavía página de origen verificada (el diccionario lo marca como `pendiente`);
- los elementos cuyo dominio no consta en el resumen quedan **bloqueados**, no inventados.

## A. Documentación y gobierno del estudio

| Código | Discrepancia / decisión pendiente | Dato objetivo | Implicación | Estado en CARMO | Quién decide |
|---|---|---|---|---|---|
| RG-01 | El dictamen menciona una versión documental distinta de la v3.0 del protocolo | Encargo §2 | No consta qué versión aprobó el CEIm; la herramienta no puede presumir la v3.0 | La página «Proyecto» muestra la nota; ningún texto afirma la aprobación de la v3.0 | Promotor + CEIm |
| RG-02 | El protocolo identifica **REDCap** como eCRD; CARMO lo sustituiría | Encargo §2 | Cambio de sistema de recogida, de encargado de tratamiento y de ubicación de los datos: probablemente exige **modificación relevante** o, como mínimo, una notificación al CEIm, y la actualización de la HIP/CI si esta menciona REDCap | Modo `validation` (solo datos sintéticos) hasta resolverlo | Promotor + CEIm + DPD |
| RG-03 | Cambio en el equipo: María José Mauriz Montero no participa; Ramón Alejandro Morillo Verdugo es la referencia de coordinación científica de la herramienta | Encargo §2 | Si la Dra. Mauriz figuraba como investigadora o coordinadora en los documentos aprobados, el cambio debe comunicarse según el procedimiento del CEIm. **No se presenta como modificación aprobada** | No existe ningún usuario, centro ni contacto suyo en CARMO. Los documentos históricos no se alteran | Promotor + CEIm |
| RG-27 | El repositorio `ramonmorillo/carmo` es **público** | API de GitHub, 05/11/2026 | El protocolo, el dictamen y los textos de los instrumentos no deben publicarse | No se ha versionado ningún documento regulatorio ni ningún enunciado de instrumento. Se recomienda hacer privado el repositorio | IP |
| RG-29 | Plazo de conservación, archivo y destrucción de los datos | No consta en el resumen | Necesario para la política de datos | No implementado | Promotor |

## B. Diseño, calendario y población

| Código | Pendiente | Situación actual (provisional) |
|---|---|---|
| RG-04 | Ventanas de las visitas de las semanas 12, 24, 36 y 48 no especificadas; interpretación de «evaluación inicial, semanas 1-4» | Calendario `CARMO-CAL-0.1` (provisional, versionado): inicial = días 0-27 desde la inclusión; S12/24/36/48 = inclusión + 84/168/252/336 días **sin ventana** (se muestra «ventana no definida», nunca «fuera de ventana») |
| RG-05 | Relación entre la semana 48 y la visita final «12 meses ±28 días», y referencia temporal (inclusión o evaluación inicial) | Ambas visitas existen por separado; 12 meses ≈ 365 días desde la inclusión, ventana ±28 días. Si son la misma visita, se crea una nueva versión del calendario |
| RG-06 | Criterios de inclusión y exclusión no transcritos | Tablas versionadas `carmo_eligibility_sets/criteria` **vacías**: **la inclusión es imposible** hasta cargar y validar el conjunto (fuente, sección y página obligatorias) |
| RG-07 | La lista de centros debe contrastarse con la relación autorizada | **No se ha creado ningún centro**. Un centro solo incluye pacientes si consta `authorized` con referencia documental y está activo |
| RG-08 | Centro de la Dra. Mauriz | No se crea ni se activa por defecto (ver RG-07) |
| RG-30 | Tamaño muestral 135 | Configurable en `carmo_private.study_config` (no está en el código) |
| RG-12 | Motivos de no inclusión, retirada y pérdida | Vocabulario técnico provisional; validar |

## C. Variables e instrumentos

| Código | Pendiente | Situación actual |
|---|---|---|
| RG-23 | Variables demográficas y sociosanitarias, y antecedentes de tratamiento: no detalladas en el resumen. Dominio de tabaquismo. Método y unidad de LDL-c y colesterol no-HDL | Sin sembrar (ver diccionario §3). `smoking` **bloqueada**. LDL/no-HDL admiten mg/dL o mmol/L tal como se registren, sin conversión |
| RG-19 | IEXPAC: versión autorizada, sentido de la codificación 1-5, ítems condicionados, regla de puntuación condicional | Implementados los 11 ítems con la fórmula del encargo; sin puntuación con ítems incompletos y sin regla condicional |
| RG-16 | EQ-5D: 3L o 5L, modalidad, licencia EuroQol, tarifa de valores | Registrados `EQ5D3L` y `EQ5D5L` como *pending_specification*: no admiten datos. Sin índice de utilidad |
| RG-17 | EVASAF: versión, número de ítems, escala y resultado derivado | *pending_specification* |
| RG-18 | Morisky-Green: versión y **licencia** (algunas versiones de Morisky tienen licencia restrictiva), criterio de adherencia | *pending_license* |
| RG-20 | Adherencia por dispensación: método (PDC/MPR u otro), ventana, umbral y tratamiento de los solapamientos | Se registran dispensaciones (fecha, unidades, días de cobertura); **no se calcula** ningún indicador |
| RG-21 | **Documento oficial de adaptación del modelo CMO a la patología cardiovascular (MAPEX-SEFH) no localizado** (búsqueda web del 05/11/2026 sin resultado) | Motor genérico implementado y probado con un modelo ficticio; cálculo clínico **desactivado en la BD** (solo admite modelos `validated`) |
| RG-22 | Taxonomía oficial de intervenciones CMO cardiovascular | Catálogo vacío: el registro de intervenciones está bloqueado |
| RG-15 | Taxonomía de problemas relacionados con medicamentos | Sí/no + texto libre provisional |

## D. Protección de datos y arquitectura de tratamiento

| Código | Pendiente | Observación |
|---|---|---|
| RG-09 | **Proyecto Supabase compartido** con DERMAPEX y COAMO (Auth común, misma base de datos, región `eu-west-1`) | El aislamiento es lógico (RLS, privilegios, autorización por aplicación), está probado y documentado (CARMO_ARCHITECTURE §4), pero el responsable o encargado del tratamiento, el contrato con Supabase, la EIPD/DPIA y la información de la HIP/CI deben cubrir este uso. Residual: el trigger `trg_auth_users_create_profile` de DERMAPEX crea un perfil DERMAPEX para toda cuenta de Auth, aunque sin acceso por la barrera `app_access` |
| RG-10 | Política tras la retirada del consentimiento (¿se conservan y analizan los datos ya recogidos?) | Los datos se conservan y se marcan `stop_followup_data_pending_decision`; no se borran |
| RG-11 | Criterios para pasar de `validation` a `production` | Ver CARMO_GO_LIVE_CHECKLIST.md |
| RG-13 | Identificación de la versión de la HIP/CI aprobada | Texto libre obligatorio en cada consentimiento |
| RG-14 | Exportación de texto libre (evolución, intervenciones, desviaciones) | Excluido de la exportación por riesgo de reidentificación |

## E. Técnica con impacto en otros estudios

| Código | Pendiente | Observación |
|---|---|---|
| RG-25 | La migración `20261105100000_carmo_app_access.sql` amplía el CHECK de `app_private.app_access` (objeto **compartido**) con `'carmo'` | Es aditiva y verifica el estado previo. **Requiere aprobación explícita** antes de aplicarse en producción |
| RG-26 | La prueba `db-tests/40_app_access_isolation.sql` de DERMAPEX considera tabla DERMAPEX toda tabla de `public` sin el prefijo `coag_`: con las tablas `carmo_*` falla | No se ha modificado DERMAPEX. `scripts/test-db.sh` de CARMO ejecuta una copia que excluye `carmo_`. El cambio de una línea en DERMAPEX necesita autorización |
| RG-24 | `.sav` nativo | Se entregan CSV + sintaxis `.sps`; `.sav` pendiente |
| RG-28 | Alcance del monitor (por centro asignado) y escritura de la coordinación (puede registrar en todos los centros) | Decisiones técnicas provisionales; confirmar |
