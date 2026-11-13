# Tareas de implementación: registro como proveedor

**Identificador:** 001-registro-proveedor  
**Entradas:** [especificación aprobada](./spec.md) y [plan técnico](./plan.md).  
**Estado:** implementación en curso. Una casilla sin marcar indica que falta implementación o validación completa.

**Desviación técnica:** se usa `node:test` en lugar de Vitest, por vulnerabilidades reportadas en las versiones compatibles con Node 20; la justificación está en `reto-01/SOLUCION.md`.

Las rutas de destino son relativas a `reto-01/`. Cada tarea incluye sus dependencias directas; las dependencias transitivas no se repiten. No modificar fixtures ni implementar portal, firma, envío o validación de vencimientos. No crear migraciones ni base de datos. El módulo reutilizable es opcional y no forma parte de estas tareas.

## Preparación y dominio

- [x] **T001 — Preparar proyecto y herramientas**
  - **Destino:** `package.json`, archivo de bloqueo, `tsconfig.json`, configuración de pruebas y exclusiones de entrega.
  - **Referencias:** NFR-001, NFR-002, NFR-007; PD-001, PD-002.
  - **Dependencias:** ninguna.
  - **Resultado:** proyecto Node 20+ en TypeScript estricto, scripts de desarrollo, comprobación de tipos y pruebas, y dependencias del plan con versiones compatibles. Mantener `fixtures/` intacto; excluir `node_modules/`, `out/` y `.env` de la entrega.
  - **Validación:** instalación reproducible con el archivo de bloqueo; los scripts de tipos y pruebas arrancan en Node 20+ y no requieren una clave LLM.

- [x] **T002 — Validar configuración y errores**
  - **Destino:** `src/` de configuración y errores, `.env.example`.
  - **Referencias:** FR-012, FR-013, NFR-003 a NFR-005; PD-003, PD-009, PD-010.
  - **Dependencias:** T001.
  - **Resultado:** esquemas de configuración y errores tipados, mensajes seguros y variables para puerto, proveedor, modelo, clave, timeout y límites. No exigir credenciales al importar herramientas ni al ejecutar la demo.
  - **Validación:** pruebas de configuración válida e inválida, falta de clave en ejecución del servidor y acceso sin clave desde herramientas; errores sin secretos ni trazas crudas.

- [x] **T003 — Restringir acceso a archivos**
  - **Destino:** `src/infrastructure/` para rutas y operaciones locales.
  - **Referencias:** FR-012, NFR-003, NFR-008, NFR-009; PD-003, PD-006, PD-010.
  - **Dependencias:** T002.
  - **Resultado:** resolver rutas desde la raíz inyectada, leer solo fuentes locales, escribir en `out/` y rechazar identificadores, rutas absolutas, recorridos y enlaces que escapen a los directorios permitidos; no usar shell.
  - **Validación:** pruebas con caso válido, `..`, ruta absoluta y enlace de escape; errores explícitos y ninguna modificación de fixtures.

- [x] **T004 — Leer y validar casos**
  - **Destino:** `src/infrastructure/` y `src/application/` de lectura de solicitudes.
  - **Referencias:** FR-001, FR-006, FR-012, FR-020, EC-001, EC-005; PD-003, PD-010.
  - **Dependencias:** T003.
  - **Resultado:** validar solicitud, plantilla XLSX/PDF y soportes exigidos; devolver país, cliente, formato, campos y soportes. Rechazar portal sin crear artefactos. Ante plantilla ausente o corrupta, informar metadatos disponibles sin inferir campos ni generar formulario o paquete.
  - **Validación:** probar los tres casos soportados, el portal, caso inexistente y plantillas ausente y corrupta; verificar mensajes claros y ausencia de salidas indebidas. **AC-005, AC-012.**

- [x] **T005 — Mapear campos y reglas de negocio**
  - **Destino:** `src/domain/` y `src/application/` de mapeo.
  - **Referencias:** FR-002, FR-003, BR-001, BR-002, BR-005, BR-007, EC-002, EC-003; PD-004.
  - **Dependencias:** T004.
  - **Resultado:** mapeo determinista desde glosario y maestro con ID estable, etiqueta, estado exclusivo, origen, candidato y motivo; preservar cadenas y rutas anidadas. Aplicar identificador por país, confirmación por ambigüedad o confianza inferior a 0,8 cuando exista, y `faltante` para campo fuera del glosario sin fuente.
  - **Validación:** pruebas de sinónimos, campo faltante, ruta anidada, identificación ambigua y NIT extranjero EC/HN; sin inventar datos ni convertir la cuenta bancaria a número. **AC-001, AC-003, AC-013.**

## Artefactos y herramientas

- [x] **T006 — Generar formularios XLSX y PDF**
  - **Destino:** `src/infrastructure/` de documentos.
  - **Referencias:** FR-004, FR-005, BR-003, BR-005, NFR-008; PD-006.
  - **Dependencias:** T005.
  - **Resultado:** generar `out/<caso>/formulario.xlsx` según hoja y celdas, o `formulario.pdf` según orden de etiquetas; escribir solo valores resueltos, dejar pendientes y faltantes vacíos y soportar caracteres de los fixtures.
  - **Validación:** abrir los XLSX de CO y HN y verificar hoja, coordenadas y contenido; extraer texto del PDF de EC y verificar orden y valores, incluidos vacíos. Confirmar que no se agregan datos bancarios no solicitados. **AC-002, AC-003.**

- [x] **T007 — Construir paquete y estado para firma**
  - **Destino:** `src/domain/` y `src/infrastructure/` de soportes y paquete.
  - **Referencias:** FR-007, FR-008, BR-003, BR-004, BR-005, EC-004, EC-008; PD-005, PD-006.
  - **Dependencias:** T006.
  - **Resultado:** copiar formulario y soportes exigidos existentes, generar checklist de presentes, ausentes y campos faltantes, y borrador sin datos bancarios. Calcular estado falso por soporte ausente o confirmación pendiente; no bloquear solo por faltante ni evaluar vencimientos.
  - **Validación:** comprobar contenido y copias, soporte ausente, soporte con fecha pasada ignorada, faltante sin otros bloqueos y confirmación pendiente. **AC-004, AC-006.**

- [x] **T008 — Gestionar sesiones y validación manual**
  - **Destino:** `src/application/` y `src/domain/` de sesiones y decisiones.
  - **Referencias:** FR-008, FR-009, FR-011, BR-001, BR-005, BR-006, EC-006; PD-004, PD-005.
  - **Dependencias:** T007.
  - **Resultado:** mantener por sesión y caso estados, candidatos y procedencia manual en memoria; vincular confirmación o corrección explícita de la analista al campo, actualizar formulario y paquete y recalcular estado sin modificar el maestro. Serializar actualizaciones del mismo caso y no informar éxito si fallan o las copias divergen.
  - **Validación:** probar confirmación, corrección de pendiente y faltante, aislamiento entre sesiones, cambio de estado, procedencia en sesión y maestro inalterado; simular error de escritura y actualización concurrente. **AC-006.**

- [x] **T009 — Registrar auditoría sin datos sensibles**
  - **Destino:** `src/infrastructure/` de auditoría.
  - **Referencias:** FR-015, FR-022, NFR-003; PD-008.
  - **Dependencias:** T003.
  - **Resultado:** escribir `out/log.jsonl` y `out/<caso>/log.jsonl` mediante lista permitida de metadatos; el registro por caso incluye `{ ts, herramienta, ok, resumen }`. No incluir argumentos, valores, claves ni errores crudos; mantener el historial completo en memoria para el chat.
  - **Validación:** probar operaciones exitosas y fallidas con datos bancarios y secreto ficticio; verificar ambos JSONL, sus claves exigidas y ausencia de valores sensibles. **AC-009.**

- [x] **T010 — Exponer el contrato de herramientas**
  - **Destino:** `src/tools/proveedor.ts` y adaptadores de ejecución.
  - **Referencias:** FR-013 a FR-015, NFR-003, NFR-005; PD-002, PD-003, PD-008, PD-010.
  - **Dependencias:** T008, T009.
  - **Resultado:** implementar las cuatro herramientas de FR-014, con `description`, argumentos `zod` descritos y `execute(args, ctx)` importable que devuelve JSON `{ ok: true, data }` o `{ ok: false, error }`. Validar mapeo contra estado autorizado; no exponer excepciones, firma ni envío. Registrar cada ejecución.
  - **Validación:** llamadas directas válidas e inválidas para cada herramienta, errores tipados, forma exacta del contrato, mapeo manipulado rechazado y auditoría sin datos sensibles. **AC-008, AC-009.**

- [x] **T011 — Ejecutar demo determinista**
  - **Destino:** `demo.ts` y script npm correspondiente.
  - **Referencias:** FR-016, NFR-006, NFR-008, EC-001; PD-002, PD-010.
  - **Dependencias:** T010.
  - **Resultado:** limpiar únicamente `out/` del proyecto, ejecutar directamente los tres casos Excel/PDF sin modelo ni clave, imprimir resumen por caso, no confirmar pendientes automáticamente y continuar tras un caso fallido.
  - **Validación:** ejecutar dos veces sin credenciales en entorno aislado; comparar resultados y contenidos de artefactos salvo timestamps, comprobar fixtures sin cambios, exclusión del portal y continuación ante error. **AC-010.**

## Agente y experiencia de chat

- [x] **T012 — Separar prompt y conocimiento**
  - **Destino:** `agent/prompt.md`, `src/knowledge/`.
  - **Referencias:** FR-018, BR-001, BR-003, BR-006, NFR-009; PD-002, PD-007.
  - **Dependencias:** T001.
  - **Resultado:** prompt independiente con reglas de fuentes, confirmación, límites y exclusiones; conocimiento del proceso separado, sin claves ni credenciales.
  - **Validación:** revisar que prompt y conocimiento se cargan desde archivos, prohíben valores inventados y no describen portal, firma o envío como acciones disponibles.

- [x] **T013 — Implementar adaptador de modelo**
  - **Destino:** `src/llm/`.
  - **Referencias:** FR-011, FR-012, FR-018, NFR-003, NFR-005, NFR-009; PD-007, PD-010.
  - **Dependencias:** T002.
  - **Resultado:** interfaz independiente del proveedor, implementación OpenAI con modelo configurado, timeout y errores seguros, e implementación simulada inyectable para pruebas sin red. No usar fuentes maestras externas.
  - **Validación:** pruebas con proveedor simulado de respuesta, timeout y fallo; comprobar que la interfaz permite sustitución y que no se exponen claves ni errores crudos. **AC-007, AC-013.**

- [x] **T014 — Implementar ciclo del agente y presupuestos**
  - **Destino:** `src/application/` de agente y `src/llm/`.
  - **Referencias:** FR-003, FR-011, FR-012, FR-013, FR-018, BR-001, BR-006, NFR-004, NFR-005; PD-007, PD-009, PD-010.
  - **Dependencias:** T010, T012, T013.
  - **Resultado:** ciclo modelo-herramienta con topes de iteraciones, tokens de sesión y globales, timeout, límites de concurrencia y solicitudes, y respuesta parcial segura al agotar límites. Reservar y contabilizar presupuesto ante llamadas simultáneas y errores; respuestas con valores construidas desde estado verificado, no afirmaciones libres del modelo.
  - **Validación:** proveedor simulado que solicita herramientas, falla, agota iteraciones o tokens e intenta inventar valores o confirmar sin usuaria; pruebas de concurrencia que impiden superar presupuestos y conservan la sesión. **AC-007, AC-008.**

- [x] **T015 — Exponer API y sesiones**
  - **Destino:** `src/server.ts` y rutas HTTP.
  - **Referencias:** FR-010 a FR-012, FR-017, FR-022, NFR-003 a NFR-005; PD-001, PD-003, PD-008, PD-009, PD-011.
  - **Dependencias:** T014.
  - **Resultado:** `POST /api/chat`, `GET /api/sessions/:id` y `GET /api/health`; validar entradas y tamaño de petición, usar IDs de sesión impredecibles y permitir decisiones explícitas ligadas a campo y caso. Servir frontend desde mismo origen.
  - **Validación:** pruebas HTTP de creación e historial de sesión, argumentos inválidos, sesión desconocida, salud sin claves, límites y errores recuperables; comprobar datos bancarios completos en historial y su ausencia en logs. **AC-007 a AC-009, AC-013.**

- [x] **T016 — Implementar frontend HTML plano**
  - **Destino:** `web/`.
  - **Referencias:** FR-009 a FR-012, FR-022, NFR-001, NFR-003; PD-001, PD-005, PD-008.
  - **Dependencias:** T015.
  - **Resultado:** chat con historial, entrada, indicador de espera, llamadas a herramientas con argumentos y resumen, y confirmaciones resaltadas; permitir confirmar candidato o corregir campo explícitamente y mostrar datos bancarios solicitados completos. Escapar texto presentado.
  - **Validación:** probar flujo visible con adaptador simulado, actualización de formulario tras decisión, indicación de error y espera, historial, protección frente a HTML inyectado y visualización completa de datos bancarios. **AC-006, AC-007, AC-009, AC-013.**

## Integración y entrega

- [x] **T017 — Verificar integración y aislamiento**
  - **Destino:** `tests/`.
  - **Referencias:** FR-001 a FR-018, FR-020, FR-022, BR-001 a BR-007, NFR-003 a NFR-006, NFR-008, NFR-009; PD-003 a PD-010.
  - **Dependencias:** T011, T016.
  - **Resultado:** pruebas integradas de los tres casos, herramientas y API con modelo simulado, artefactos, errores, seguridad y privacidad, sin acceso a fuentes maestras externas.
  - **Validación:** ejecutar pruebas que cubran **AC-001 a AC-010, AC-012 y AC-013**, incluido rechazo de portal, plantilla inválida sin artefactos, datos bancarios completos en chat y redactados en ambos JSONL, sesión conservada y repetibilidad de demo.

- [x] **T018 — Documentar uso y solución**
  - **Destino:** `README.md`, `SOLUCION.md`, `.env.example`.
  - **Referencias:** FR-017 a FR-021, NFR-002, NFR-003, NFR-007; PD-001, PD-002, PD-007, PD-011.
  - **Dependencias:** T011, T016.
  - **Resultado:** documentar comando único de arranque, Node 20+, variables sin valores, demo, API, enlace o alternativa local; arquitectura, ciclo, modelo y costo estimado por caso, al menos tres decisiones y alternativas, supuestos, cobertura por historia, uso de IA, riesgos y justificación de dependencias. Declarar diferencias aprobadas frente al PRD.
  - **Validación:** cotejar cada sección con FR-019; verificar que README y ejemplos no contienen claves ni datos reales y que no se exige acceso autenticado. **AC-011.**

- [x] **T019 — Preparar y comprobar despliegue**
  - **Destino:** configuración de despliegue, `README.md`, `SOLUCION.md`.
  - **Referencias:** FR-019, FR-021, NFR-002 a NFR-004; PD-009, PD-011.
  - **Dependencias:** T017, T018.
  - **Resultado:** una instancia pública sin autenticación, con almacenamiento escribible, configuración por entorno y límites; URL documentada y disponible durante la defensa. Si no es posible publicar, registrar explícitamente ejecución local y penalización de 10 puntos.
  - **Validación:** comprobar salud y un flujo de chat sin exponer claves, límites configurados, escritura de artefactos y disponibilidad real de la URL; si faltan credenciales o infraestructura, registrar la URL y el flujo real como no verificados y probar la alternativa local. La tarea puede cerrarse con esa alternativa documentada para no bloquear el resto de la verificación. **AC-011.**

- [x] **T020 — Ejecutar verificación final y entregar evidencia**
  - **Destino:** scripts de `package.json`, resultados de pruebas y documentación de entrega.
  - **Referencias:** FR-001 a FR-022, BR-001 a BR-007, NFR-001 a NFR-009; PD-001 a PD-011.
  - **Dependencias:** T019.
  - **Resultado:** comprobación de tipos, pruebas y demo; medir desde un entorno limpio el comando documentado que levanta frontend y backend en menos de dos minutos, con variables documentadas. Preparar entrega sin `node_modules/`, `out/` ni `.env`, y registrar resultados y limitaciones para convergencia.
  - **Validación:** asociar evidencia real a **AC-001 a AC-013**, anotar errores o verificaciones pendientes sin marcarlas como aprobadas y comprobar que la entrega preserva los fixtures. Dejar la auditoría de convergencia para la etapa correspondiente.

## Matriz de trazabilidad

| Requisito | Tareas |
|---|---|
| FR-001, FR-002, FR-003 | T004, T005, T014, T017 |
| FR-004, FR-005 | T006, T017 |
| FR-006, FR-020 | T004, T017, T018 |
| FR-007, FR-008 | T007, T008, T017 |
| FR-009 | T008, T016, T017 |
| FR-010, FR-011, FR-012 | T002, T004, T008, T013 a T017 |
| FR-013, FR-014, FR-015 | T009, T010, T014, T017 |
| FR-016 | T011, T017 |
| FR-017, FR-018 | T010, T012 a T015, T018 |
| FR-019, FR-021 | T018 a T020 |
| FR-022 | T009, T015 a T017 |
| BR-001, BR-002, BR-005, BR-007 | T005, T008, T014, T017 |
| BR-003, BR-004 | T006, T007, T017 |
| BR-006 | T008, T012, T014, T017 |
| NFR-001, NFR-002, NFR-007 | T001, T016, T018, T020 |
| NFR-003, NFR-005 | T002, T003, T009, T010, T013 a T017, T019 |
| NFR-004 | T002, T014, T015, T017, T019 |
| NFR-006, NFR-008 | T003, T006, T011, T017 |
| NFR-009 | T003, T012, T013, T017 |

| Criterio | Evidencia prevista |
|---|---|
| AC-001, AC-003 | T005, T006, T017 |
| AC-002 | T006, T017 |
| AC-004 | T007, T017 |
| AC-005 | T004, T017 |
| AC-006 | T007, T008, T016, T017 |
| AC-007 | T013 a T017 |
| AC-008 | T010, T014, T015, T017 |
| AC-009 | T009, T010, T015 a T017 |
| AC-010 | T011, T017 |
| AC-011 | T018 a T020 |
| AC-012 | T004, T017 |
| AC-013 | T005, T013, T015 a T017 |

Las tareas T017 y T020 reúnen evidencia transversal; su existencia no sustituye las pruebas focalizadas descritas en cada tarea. Los estados de requisitos y convergencia se determinan tras la ejecución y auditoría, no al crear este archivo.

## Evidencia parcial de implementación

- `npm ci`: instalación reproducible; auditoría de npm sin vulnerabilidades reportadas.
- Node 20.20.2: comprobación de tipos y 21 pruebas automatizadas aprobadas con adaptadores simulados.
- La demo ejecutó los tres casos sin clave; dos ejecuciones produjeron el mismo contenido en 23 artefactos, al excluir los metadatos de tiempo de los ZIP XLSX y los logs.
- Se comprobó localmente el flujo visual con un proveedor simulado: procesamiento, confirmación, corrección, enlaces de descarga y presentación literal de HTML inyectado.
- Se verificó localmente OpenAI con `gpt-4o-mini`: Colombia ejecutó las cuatro herramientas, generó el paquete y permitió descargar el XLSX; también se rechazó el caso de portal. Tras generar el paquete, la respuesta informó agotamiento del presupuesto de tokens. No se verificaron otros casos ni confirmaciones con el proveedor real.
- En una nueva sesión de Colombia, el modelo leyó la solicitud y el primer mapeo falló al enviar una lista vacía. Una segunda consulta con una instrucción correctiva completó el mapeo de 17 campos. Una tercera consulta informó agotamiento del presupuesto; la sesión conservó los campos, pero no se generó un paquete en ella.
- Tras incrementar el límite predeterminado de sesión a 200.000 y reiniciar el servidor, otra sesión de Colombia ejecutó las cuatro herramientas correctamente, generó el paquete y permitió descargar el XLSX. Una consulta posterior en la misma sesión respondió sin aviso de presupuesto y conservó el estado `listo_para_firma`.
- No existe una URL pública verificada; se documentó la alternativa local y la penalización de 10 puntos.

## Evidencia de verificación final

- En una copia aislada, Node 24.15.0: `npm ci && npm run dev` respondió a salud antes de 72 segundos desde el inicio, con variables de arranque ficticias; la conexión real se comprobó por separado. La instalación reportó cero vulnerabilidades.
- En esa copia, `npm run build`, las 21 pruebas y `npm run demo` finalizaron correctamente. La ejecución previa también verificó tipos y pruebas con Node 20.20.2.
- Se preparó un ZIP de entrega sin `node_modules/`, `out/` ni `.env`; incluye `.env.example`. Los 21 archivos de fixtures de la copia coincidieron por hash con los originales.
- La evidencia siguiente identifica las pruebas relevantes; no sustituye la auditoría de convergencia ni declara completo cada criterio.

| Criterio | Evidencia y limitaciones |
|---|---|
| AC-001 | `cases.test.ts`: mapeo de tres casos, unicidad y faltantes; demo de los tres casos. |
| AC-002 | `documents.test.ts`: celdas y hojas CO/HN, etiquetas y valores del PDF EC. |
| AC-003 | `cases.test.ts` y `documents.test.ts`: identificadores pendientes y valores no escritos. |
| AC-004 | `documents.test.ts`: soportes, faltantes, bloqueo y borrador sin cuenta. |
| AC-005 | `cases.test.ts` y `tools.test.ts`; rechazo también observado con OpenAI real. |
| AC-006 | `documents.test.ts` y `api.test.ts`: confirmación y corrección; flujo visual con modelo simulado. Falta comprobar confirmación con modelo real. |
| AC-007 | `api.test.ts`, `agent.test.ts` y `adapter.test.ts`; flujo visual simulado. La sesión real inicial agotó su presupuesto. Tras aumentar el límite y reiniciar, una sesión nueva procesó Colombia y atendió una consulta posterior sin aviso de presupuesto. |
| AC-008 | `tools.test.ts`: herramientas válidas, argumentos inválidos y mapeo manipulado. |
| AC-009 | `api.test.ts` y `tools.test.ts`: historial y auditoría sin valores sensibles de prueba. |
| AC-010 | `demo.test.ts`: continuación ante fallo, repetibilidad y preservación de fixtures. |
| AC-011 | Arranque aislado, documentación y ZIP comprobados; no hay URL pública. |
| AC-012 | `cases.test.ts`, `tools.test.ts` y `security.test.ts`: caso inexistente, plantilla inválida o ausente y restricciones de rutas. |
| AC-013 | `cases.test.ts` y `api.test.ts`: cuenta completa en mapeo e historial; fuentes locales. |
