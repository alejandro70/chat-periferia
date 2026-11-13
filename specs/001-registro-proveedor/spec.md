# Especificación: registro como proveedor

**Identificador:** 001-registro-proveedor  
**Estado:** APROBADA por el usuario  
**Clarificación:** RESUELTA  
**Fuente:** `reto-01/PRD.md`, versión 2.0, y fixtures de `reto-01/fixtures/reto-01/`.  
**Restricciones solicitadas:** backend y herramientas en TypeScript con Node.js 20 o superior; frontend en HTML plano.

Esta especificación define el alcance inicial aprobado por el usuario, no aprueba un diseño ni modifica el PRD o los fixtures. Las decisiones de clarificación que cambian el alcance del PRD se registran explícitamente más abajo. Las prioridades aplicables se conservan del PRD; la entrega debe declarar cualquier cobertura parcial.

## Problema y valor

La analista administrativa transcribe repetidamente datos de un repositorio maestro a formularios de clientes y reúne soportes para el registro como proveedor. Se busca reducir el trabajo manual y los errores, identificar información y documentos faltantes y preparar un paquete revisable por un humano.

### Objetivos

1. Diligenciar automáticamente los campos con fuente en el maestro de los casos Excel y PDF suministrados.
2. Identificar y explicar los campos y soportes que faltan o requieren revisión, sin inventar valores.
3. Preparar el paquete para revisión y firma humana.
4. Permitir probar el flujo mediante chat y ejecutar las herramientas sin modelo.

### Fuera de alcance

- Firma, envío real o simulado, integración con correo, SharePoint o firma electrónica.
- Procesamiento del caso de portal, generación de valores copiables, paquete para portal e interacción real con portales.
- Autenticación, roles, multiusuario y persistencia en base de datos como funcionalidades obligatorias.
- Modificación de los fixtures de entrada.

## Actores y escenarios

- **Analista administrativa:** solicita procesar un caso, revisa resultados y confirma o rechaza acciones.
- **Recepción:** deposita la solicitud en los fixtures; no interactúa con el agente.
- **Representante legal:** recibe el paquete para su revisión y firma fuera del sistema.
- **Cliente:** origina la solicitud y permanece fuera del sistema.

Escenario principal: la analista solicita un caso Excel o PDF; el agente lee la solicitud y plantilla, cruza los campos con el maestro, solicita en el chat la validación manual de campos pendientes, genera el formulario, identifica soportes y comunica los resultados y el estado del paquete. La analista puede confirmar o corregir los campos y actualizar el formulario.

Escenarios alternativos: un campo no tiene fuente o es ambiguo; un soporte falta; el formato es portal y queda fuera de alcance; la entrada es inválida; una herramienta o el proveedor del modelo falla. Estos escenarios no autorizan inventar valores ni realizar acciones externas.

## Requisitos funcionales

- **FR-001 — Lectura de solicitud:** para un caso Excel o PDF, leer la solicitud normalizada, la plantilla correspondiente y los soportes exigidos; devolver país, cliente, formato (`xlsx` o `pdf`), campos solicitados y soportes. P0.
- **FR-002 — Mapeo:** clasificar cada campo solicitado en exactamente uno de `lleno`, `faltante` o `requiere_confirmacion`; indicar la ruta del maestro para valores con fuente y aplicar los sinónimos del glosario. P0.
- **FR-003 — Reporte:** presentar los campos llenos, faltantes y pendientes de confirmación, con su fuente o motivo, sin atribuirles valores sin fuente. El reporte debe seguir disponible cuando sea posible continuar tras un error.
- **FR-004 — Excel:** generar `out/<caso>/formulario.xlsx`, con cada etiqueta y los valores disponibles y confirmados en la hoja y celdas indicadas por `plantilla-celdas.json`; dejar vacíos los valores pendientes o faltantes. P0.
- **FR-005 — PDF:** generar `out/<caso>/formulario.pdf` reproduciendo todas las etiquetas y los valores disponibles y confirmados en el orden de `plantilla-campos.json`; dejar vacíos los valores pendientes o faltantes. No se exige rellenar un AcroForm. P1.
- **FR-006 — Portal:** excluido del alcance inicial por decisión del usuario; no procesar el caso de portal ni generar valores copiables.
- **FR-007 — Paquete:** crear `out/<caso>/paquete/` con el formulario generado, copias de los soportes exigidos disponibles, `checklist.md` y `borrador-correo.md`; el checklist identifica soportes presentes y ausentes, y campos faltantes. P0.
- **FR-008 — Estado para firma:** comunicar `listo_para_firma` y las razones que lo afectan según BR-004 y BR-005.
- **FR-009 — Validación manual:** solicitar en el chat la confirmación manual de los campos que la requieren; no escribir valores pendientes en el formulario. Permitir correcciones manuales de campos pendientes o faltantes mediante el chat; actualizar el formulario con el valor confirmado o corregido sin modificar el maestro. El envío, incluida su simulación, está fuera del alcance inicial.
- **FR-010 — Chat:** ofrecer historial, entrada de mensaje e indicador de espera; mostrar cada llamada a herramienta con nombre, argumentos y resultado resumido y resaltar la solicitud de confirmación.
- **FR-011 — Sesión y ciclo:** mantener el historial durante la sesión, ejecutar el ciclo conversacional con herramientas y un modelo, limitar las iteraciones por turno y, al alcanzar el límite, responder con lo obtenido y lo pendiente.
- **FR-012 — Errores:** comunicar en lenguaje claro errores de caso, plantilla, herramienta y proveedor, sin traza cruda; conservar la sesión y continuar lo que sea posible. Un caso fallido no impide procesar el siguiente.
- **FR-013 — Herramientas:** ofrecer herramientas independientes del servidor e invocables sin modelo, con argumentos descritos y validados mediante `zod`, y respuesta serializada `{ ok: true, data }` o `{ ok: false, error }`; ninguna excepción se propaga al agente.
- **FR-014 — Contrato mínimo:** ofrecer `proveedor_leer_solicitud` con `{ caso }` → `{ pais, cliente, formato, campos[], soportes[] }`; `proveedor_mapear_campos` con `{ caso, campos[] }` → `{ llenos[], faltantes[], requiere_confirmacion[] }`; `proveedor_generar_formulario` con `{ caso, mapeo }` → `{ ruta, formato }`; y `proveedor_armar_paquete` con `{ caso }` → `{ ruta, listo_para_firma, checklist }`. Las salidas indicadas son el contenido de `data`. `proveedor_simular_envio` queda excluida del alcance inicial.
- **FR-015 — Trazabilidad de ejecución:** registrar llamadas en el historial visible y `out/log.jsonl`; cada ejecución deja además `out/<caso>/log.jsonl` con `{ ts, herramienta, ok, resumen }`. Los dos archivos de auditoría omiten o redactan datos sensibles en argumentos y resúmenes; el chat y el historial de sesión consultable pueden mostrar completos los datos bancarios solicitados.
- **FR-016 — Demo:** incluir `demo.ts` que ejecute directamente las herramientas sobre los tres casos Excel y PDF suministrados, imprima un resumen por caso y no requiera clave de modelo; el caso portal está excluido.
- **FR-017 — Integración conversacional:** exponer una API de chat, consulta de historial y estado de salud, documentada en el README; la respuesta de salud identifica proveedor y modelo sin revelar claves. El contrato concreto puede diferir del ejemplo del PRD si está documentado.
- **FR-018 — Separación requerida:** mantener el comportamiento del agente en `agent/prompt.md`, el conocimiento del proceso separado de la ejecución y las herramientas separadas del servidor; integrar el proveedor del modelo mediante una interfaz propia que permita cambiarlo sin modificar el ciclo.
- **FR-019 — Documentación y entrega:** incluir README con arranque, variables, demo y enlace de prueba; y `SOLUCION.md` con problema, arquitectura, ciclo, modelo y costo estimado por caso, al menos tres decisiones con alternativas, supuestos, cobertura por historia, uso de IA y riesgos de producción. Entregar repositorio con historial o ZIP sin `node_modules/`, `out/` ni `.env`.
- **FR-020 — Diseño de portal:** excluido del alcance inicial junto con el caso de portal.
- **FR-021 — Acceso de prueba:** proporcionar una URL pública sin autenticación, activa durante la defensa; si no es posible el despliegue, se acepta ejecución local durante la defensa con penalización de 10 puntos.
- **FR-022 — Datos bancarios en chat:** mostrar completos los datos bancarios solicitados al presentar dichos valores en el chat, sin alterar los valores del maestro; los archivos de auditoría no contienen datos sensibles.

El módulo reutilizable de la sección 9.4 del PRD es **opcional** y constituye un bonus; no condiciona la funcionalidad obligatoria.

## Reglas de negocio

- **BR-001 — Fuente:** no inventar valores: los valores del maestro se obtienen mediante herramientas; el usuario puede corregir manualmente campos pendientes o faltantes en el chat. Identificar las correcciones como manuales durante la sesión, sin modificar el maestro. El valor corregido puede aparecer en el formulario y paquete; la información de su procedencia se conserva solo durante la sesión. Un campo sin fuente identificada ni valor manual no recibe un valor.
- **BR-002 — Identificador tributario:** CO usa NIT; EC, PE y PA usan RUC; HN usa RTN. Para países distintos de CO, usar el NIT colombiano disponible y marcar `requiere_confirmacion` con la nota `identificador extranjero`. Una etiqueta ambigua también requiere confirmación y propuesta del equivalente del país.
- **BR-003 — Banco:** incluir datos bancarios solo cuando la plantilla los solicite explícitamente; nunca incluirlos en el borrador de correo.
- **BR-004 — Soportes:** un soporte exigido ausente bloquea `listo_para_firma`; un campo `faltante` por sí solo no lo bloquea, pero aparece en el checklist. Ignorar los vencimientos de soportes; cuando se requiera una fecha, usar la zona horaria de Colombia.
- **BR-005 — Validación de mapeo:** un campo fuera del glosario sin valor ni fuente identificada se clasifica `faltante` y se solicita el dato al usuario. Los demás campos fuera del glosario quedan pendientes de validación manual; un mapeo con confianza menor que 0,8 y las reglas de país aplicables también requieren confirmación. Un campo en `requiere_confirmacion` bloquea `listo_para_firma` y no se escribe antes de confirmarse. Una confirmación del candidato o corrección manual resuelve el campo y permite escribir el valor, sin bloquear por ese campo la firma.
- **BR-006 — Intervención humana:** el sistema no ejecuta firma ni envío real o simulado, ni opera portales.
- **BR-007 — Fidelidad:** los datos del maestro que se muestren deben conservarse exactamente como constan en el archivo maestro; esta regla no autoriza inventar valores ni incluir datos bancarios no solicitados.

## Requisitos no funcionales y restricciones

- **NFR-001 — Tecnología:** backend y herramientas en TypeScript, ejecutados con Node.js 20 o superior; frontend en HTML plano.
- **NFR-002 — Arranque:** levantar frontend y backend con un comando en menos de dos minutos en máquina limpia con las variables documentadas.
- **NFR-003 — Seguridad y privacidad:** clave del modelo exclusivamente en variables de entorno del backend; nunca en repositorio, frontend, logs ni respuestas de API. Sin credenciales ni datos personales reales. Validar entradas externas; no ejecutar comandos de shell desde herramientas. No registrar credenciales, tokens ni datos sensibles.
- **NFR-004 — Costos:** configurar límites de iteraciones por turno y de tokens por sesión para evitar consumo ilimitado.
- **NFR-005 — Robustez:** aplicar timeout al proveedor del modelo, informar errores claramente y mantener disponible la sesión.
- **NFR-006 — Determinismo de demo:** ejecuciones consecutivas producen el mismo resultado salvo timestamps; limpiar `out/` al inicio de la demo, dentro del directorio de salida del proyecto.
- **NFR-007 — Mantenibilidad:** TypeScript sin `any`, nombres consistentes y funciones legibles; justificar dependencias en `SOLUCION.md`.
- **NFR-008 — Datos:** tratar fixtures como solo lectura y generar resultados en `out/`; resolver rutas desde la raíz del proyecto y no depender de rutas absolutas codificadas.
- **NFR-009 — Fuentes maestras:** usar únicamente fuentes de datos maestros locales; no consultar fuentes de datos externas ni de Internet. Se permite acceder a un modelo de lenguaje.

## Casos límite

- **EC-001:** caso inexistente o plantilla ausente o corrupta: error claro, sin traza cruda. Si falta o está corrupta la plantilla, informar los metadatos disponibles sin inferir campos ni generar formulario o paquete; continuar con otros casos.
- **EC-002:** etiqueta desconocida o sin valor en el maestro: no inventar; clasificar e informar según BR-001 y BR-005.
- **EC-003:** identificación tributaria extranjera o etiqueta ambigua: indicar valor con fuente y confirmación requerida según BR-002.
- **EC-004:** soporte exigido no indexado o archivo ausente: informar y bloquear la preparación para firma conforme a BR-004; no evaluar vencimientos.
- **EC-005:** solicitud de portal: caso fuera del alcance inicial; no generar valores copiables ni operar el portal.
- **EC-006:** campo pendiente de validación manual: solicitar confirmación en el chat, dejar su valor vacío en el formulario y bloquear `listo_para_firma` hasta su resolución.
- **EC-007:** fallo o timeout del proveedor, error de herramienta o límite de iteraciones: informar el problema o límite y conservar la sesión.
- **EC-008:** campos bancarios no solicitados: no agregarlos al formulario ni al borrador.

## Criterios de aceptación

- **AC-001 — Lectura y mapeo** (FR-001, FR-002, FR-003, BR-001, BR-002, BR-005, BR-007): al procesar cada fixture Excel o PDF se obtiene país, cliente, formato, campos y soportes; cada campo aparece una sola vez en el estado aplicable, con fuente cuando exista. Los sinónimos del glosario se resuelven; un campo fuera del glosario sin fuente ni valor se marca faltante y se solicita al usuario. No se inventan valores. Los datos del maestro mostrados conservan su contenido exacto.
- **AC-002 — Formularios** (FR-004, FR-005, BR-003): los casos `co-industrias-delta` y `hn-agroexport-sula` generan XLSX con etiquetas y valores disponibles y confirmados en las celdas y hojas indicadas; `ec-corp-andina` genera PDF con todas las etiquetas y valores disponibles y confirmados en el orden indicado. Los pendientes y faltantes quedan vacíos. Los datos bancarios solo aparecen si son solicitados.
- **AC-003 — Identificador** (FR-002, BR-002): para EC o HN el identificador con fuente NIT se señala como `requiere_confirmacion` y `identificador extranjero`; una etiqueta ambigua muestra el equivalente del país. El valor no se escribe en el formulario antes de confirmarse.
- **AC-004 — Paquete y soportes** (FR-007, FR-008, BR-003, BR-004): el paquete de un caso con formulario contiene sus elementos requeridos; el checklist distingue soportes presentes y ausentes e informa campos faltantes. Un soporte exigido ausente impide `listo_para_firma`; un campo faltante por sí solo no lo impide. La fecha de vencimiento no afecta el resultado. El borrador no contiene datos bancarios.
- **AC-005 — Portal** (FR-006, FR-020): `pa-logistica-istmo` no se procesa en el alcance inicial; no se generan valores copiables ni se accede al portal.
- **AC-006 — Confirmación** (FR-009, BR-001, BR-005, BR-006): un campo pendiente aparece vacío y bloquea `listo_para_firma`; tras confirmar su candidato o ingresar una corrección en el chat, se escribe el valor y ese campo deja de bloquear el estado. Una corrección de un faltante también se escribe. La procedencia manual se identifica durante la sesión, el valor puede quedar en el formulario y paquete, y el maestro permanece sin cambios. No se realiza envío real o simulado ni firma.
- **AC-007 — Chat y fallos** (FR-010, FR-011, FR-012, NFR-004, NFR-005): el chat muestra historial, espera, llamadas y confirmación resaltada; ante timeout, fallo de herramienta o límite de iteraciones muestra información clara y permite seguir usando la sesión.
- **AC-008 — Contrato de herramientas** (FR-013, FR-014): llamadas válidas retornan el JSON y formas establecidos; argumentos inválidos y errores retornan `{ ok: false, error }`, sin excepciones hacia el agente.
- **AC-009 — Auditoría** (FR-015, NFR-003): las llamadas aparecen en el historial y ambos registros exigidos; el registro por caso tiene las cuatro claves indicadas. El chat y el historial consultable muestran completos los datos bancarios solicitados, pero los dos archivos de auditoría no exponen secretos ni datos sensibles en argumentos o resúmenes.
- **AC-010 — Demo y aislamiento** (FR-016, NFR-006, NFR-008): la demo sin clave procesa los tres casos Excel y PDF, continúa tras un caso fallido y produce resultados repetibles salvo timestamps; no modifica fixtures y limpia únicamente la salida indicada.
- **AC-011 — Entrega** (FR-017 a FR-021, NFR-001, NFR-002, NFR-007): se verifica la tecnología solicitada, arranque en el tiempo indicado, API documentada, separación requerida, documentación completa y entrega sin archivos excluidos; el enlace funciona durante la defensa o se declara el uso local con penalización.
- **AC-012 — Manejo de entrada inválida** (FR-012, FR-013, NFR-003): un caso inexistente y una plantilla ausente o corrupta producen errores legibles y no muestran trazas. Para una plantilla ausente o corrupta se informan metadatos disponibles, sin inferir campos ni generar formulario o paquete; otro caso puede procesarse después, sin leer ni escribir fuera de las áreas permitidas.
- **AC-013 — Datos bancarios y fuentes** (FR-022, BR-003, BR-007, NFR-009): los datos bancarios solicitados se muestran completos y exactamente como están en el maestro; no se consultan fuentes externas de datos maestros. La conexión al modelo de lenguaje está permitida.

## Supuestos

- Los fixtures suministrados representan los casos del reto y el maestro contiene datos ficticios.
- El maestro se considera actualizado, según el PRD; esto no garantiza su vigencia en producción.
- La zona horaria de Colombia se usa cuando se requiera una fecha; los vencimientos de soportes se ignoran en el alcance inicial.
- La selección del proveedor y modelo, y el detalle de la API dentro de lo permitido por el PRD, quedan para el diseño; no son decisiones tomadas en esta especificación.

## Preguntas abiertas para clarificación

No quedan preguntas bloqueantes identificadas. El usuario aprobó la especificación el 13 de noviembre de 2026.

### Decisiones registradas

| ID | Decisión del usuario y efecto frente al PRD |
|---|---|
| **OQ-001** | Ignorar vencimientos y usar zona horaria de Colombia; sustituye la regla del PRD que bloquea soportes vencidos. |
| **OQ-002** | Un campo que requiere confirmación bloquea la firma y queda vacío hasta que se confirme o corrija. Un campo fuera del glosario sin fuente ni valor es `faltante`. La corrección manual resuelve el campo, actualiza el formulario sin modificar el maestro y registra su procedencia solo en sesión; el valor puede permanecer en el formulario y paquete. |
| **OQ-003** | El envío simulado queda fuera del alcance inicial; sustituye el requisito del PRD de implementarlo. La validación manual de campos continúa en alcance. |
| **OQ-004** | El caso de portal queda fuera de alcance y no se implementa; sustituye el tratamiento de portal previsto en el PRD. |
| **OQ-005** | El chat y el historial de sesión consultable pueden mostrar datos bancarios completos; los dos archivos de auditoría omiten o redactan datos sensibles. |
| **OQ-006** | Los campos fuera del glosario requieren validación manual; cuando no existe fuente ni valor se clasifican `faltante` conforme a OQ-002. No se requiere calcular una puntuación para esa decisión. |
| **OQ-007** | Con plantilla ausente o corrupta se informa el error y los metadatos disponibles, sin inferir campos ni generar formulario o paquete; se continúa con otros casos. |
| **OQ-008** | No usar la plantilla del portal; el caso completo queda fuera de alcance. |
| **OQ-009** | La restricción de fuentes externas aplica a las fuentes de datos maestros; la solución debe contemplar acceso a un modelo de lenguaje. |
| **OQ-010** | El enlace de prueba será público, sin autenticación ni clave que documentar. |

Las restricciones de TypeScript con Node.js 20+ y HTML plano fueron solicitadas expresamente por el usuario y restringen las opciones más amplias que permite el PRD.

La posible integración futura de firma electrónica permanece fuera del alcance de este reto y no bloquea esta especificación.
