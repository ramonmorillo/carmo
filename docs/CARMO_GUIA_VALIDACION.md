# CARMO · Guía de revisión para investigadores (fase de validación)

**Aplicación:** https://ramonmorillo.github.io/carmo/
**Fase:** validación, **solo con pacientes ficticios**. No introduzcas nunca nombre, NHC, DNI, teléfono ni fecha de nacimiento, ni siquiera inventados con apariencia real.

| Revisor/a | Rol en CARMO | Centro de prueba | Código de centro |
|---|---|---|---|
| R. A. Morillo Verdugo | Coordinación científica (también investigador del centro) | H. U. Virgen de Valme | 999 |
| P. Sempere Serrano | Investigadora principal de centro | C. H. U. de Santiago | 998 |

Cada revisor/a solo ve los pacientes de su centro. La coordinación los ve todos.

## 0. Primer acceso

1. Entra con tu correo y tu contraseña. Si es temporal, la aplicación te pedirá cambiarla.
2. Comprueba que arriba aparece el aviso naranja «Fase de validación: solo datos sintéticos» y tu rol.

## 1. Casos de prueba

Marca cada caso como ✅ (se comporta como se espera), ❌ (no) o ⚠️ (funciona, pero es confuso o mejorable).

| Nº | Qué hacer | Qué debe pasar |
|---|---|---|
| 1 | **Pacientes → Registrar candidato** | Aparece con un código de selección `SEL-<centro>-001` y estado «En cribado» |
| 2 | En la ficha, intenta **Incluir** sin responder nada | El botón está desactivado y aparecen los requisitos pendientes (criterios, consentimiento) |
| 3 | Responde los 6 criterios: los 4 de inclusión «Se cumple» y los 2 de exclusión «No se cumple» | Quedan registrados |
| 4 | Cambia una respuesta ya dada | Exige un motivo de corrección |
| 5 | Registra el consentimiento (versión, fecha, investigador, destino de los datos) e **incluye** al paciente | Recibe el código del protocolo `<centro>-01` y la fecha de inclusión de hoy |
| 6 | Crea otro candidato y márcalo como **no incluido** (con motivo) | No consume código de paciente: el siguiente incluido será `-02` |
| 7 | **Programar visitas previstas** | Se crean la inicial, S12, S24, S36 y la final, con sus fechas previstas |
| 8 | Abre la **visita inicial** y márcala realizada (fecha, modalidad, responsable) | Se guarda y aparece «Guardado y confirmado por el servidor» |
| 9 | Registra variables: edad, sexo, peso, altura, LDL-c, tabaco, HTA, diabetes y un antecedente CV | Se guardan con fecha, unidad y origen |
| 10 | Corrige el LDL-c | Pide motivo; el valor anterior sigue visible en «Historial de correcciones» |
| 11 | Intenta un LDL-c con unidad inadecuada o un peso de 5 kg | La aplicación lo rechaza con un mensaje claro |
| 12 | Cumplimenta **IEXPAC** con los 11 ítems | Muestra la puntuación de 0 a 10 |
| 13 | Cumplimenta IEXPAC con 10 ítems y guárdalo como completado | Se guarda **sin** puntuación global (no se imputan ítems) |
| 14 | Cumplimenta **EQ-5D-3L** (5 dimensiones + EVA), **EVASAF** y **Morisky-Green** | EQ-5D: perfil de 5 dígitos y EVA. Morisky: «adherente» solo con No-Sí-No-No |
| 15 | Modifica un cuestionario ya completado | Exige motivo |
| 16 | Añade un tratamiento (p. ej., alirocumab), cámbiale la dosis y suspéndelo | Queda el historial completo de eventos; no se edita ni se borra |
| 17 | **Estratificación** (desde la ficha): usa las sugerencias, completa las 23 respuestas y guarda | Puntuación, prioridad y justificación; queda «pendiente de validación» |
| 18 | Valida la estratificación: confirma, o **eleva** la prioridad con motivo | Se guarda. Rebajarla no está permitido |
| 19 | **Reestratifica** cambiando alguna respuesta | La anterior queda en el histórico y se puede comparar |
| 20 | **Intervenciones**: registra una actuación del catálogo recomendado | Aparece en el listado y en el resumen por ámbito |
| 21 | Visita inicial → **Marcar revisada** y **Cerrar** | Después ya no se pueden añadir ni corregir datos de esa visita |
| 22 | **Reabre** la visita indicando el motivo | Vuelve a ser editable; la reapertura queda registrada |
| 23 | **Inicio** | Los indicadores muestran numerador y denominador; coinciden con lo que has registrado |
| 24 | **Exportación → Generar** | Se descarga un ZIP con el aviso «exportación verificada» |
| 25 | (Opcional) Abre la aplicación en una tableta o el móvil | Se puede usar sin desplazamiento horizontal molesto |

## 2. Qué mirar además de «si funciona»

- **Fidelidad al protocolo**: ¿falta alguna variable? ¿Sobra alguna, o tiene un dominio o una unidad incorrectos?
- **Flujo de consulta real**: ¿el orden de las pantallas encaja con cómo trabajáis? ¿Hay pasos innecesarios?
- **Lenguaje**: textos confusos, términos que no usaríais o mensajes de error poco claros.
- **Modelo CMO**: con pacientes ficticios que conozcas bien, ¿la prioridad resultante te parece razonable?

## 3. Cómo comunicar incidencias

Una línea por incidencia, por correo a la coordinación:

| Caso nº | Pantalla | Qué hiciste | Qué esperabas | Qué pasó (texto del mensaje o captura) | Gravedad (bloquea / molesta / sugerencia) |
|---|---|---|---|---|---|

Indica siempre el **código del paciente ficticio** (p. ej., `998-01`), nunca datos de pacientes reales.

## 4. Al terminar la fase de validación

Los pacientes ficticios quedan marcados como sintéticos y la exportación los señala. Antes de pasar a datos reales, la coordinación decidirá si se conservan marcados o se eliminan, y lo dejará documentado (CARMO_GO_LIVE_CHECKLIST).
