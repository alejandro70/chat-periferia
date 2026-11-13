# Plan técnico: registro como proveedor

**Identificador:** 001-registro-proveedor  
**Estado:** aprobado por el usuario para iniciar la implementación  
**Entrada:** [especificación aprobada](./spec.md), constitución y contrato compartido.  
**Etapa siguiente:** implementar las tareas de `tasks.md` en orden de dependencias.

## Contexto y alcance

El directorio `reto-01/` contiene el PRD y los fixtures, pero todavía no contiene aplicación, manifiesto de dependencias ni pruebas. La solución se creará allí, sin modificar los fixtures. El alcance comprende Excel, PDF, chat, validación manual y paquete para firma; excluye procesamiento de portales, envío real o simulado, firma y evaluación de vencimientos.

Las decisiones de clarificación de la especificación prevalecen para este alcance frente a las secciones divergentes del PRD. En particular, los valores pendientes no se escriben; los soportes ausentes y las confirmaciones pendientes bloquean la firma, pero los campos faltantes por sí solos no la bloquean.

## Arquitectura

```text
HTML plano + JavaScript
        │ HTTP, mismo origen
        ▼
Servidor Node.js / TypeScript
        ├── sesión en memoria + historial + validaciones del usuario
        ├── ciclo limitado ── adaptador LLM ── proveedor configurado
        ├── herramientas tipadas y validadas
        │     ├── dominio: lectura, mapeo, estado y reglas
        │     └── infraestructura: XLSX, PDF, paquete y auditoría
        └── fixtures locales (lectura) ── out/ (escritura)
```

La lógica de dominio no dependerá del servidor ni del SDK del proveedor. El ciclo conversacional recibe las herramientas y el adaptador mediante dependencias explícitas. `demo.ts` usa las mismas herramientas con un contexto independiente y sin cargar credenciales ni llamar al modelo.

## Decisiones técnicas

| ID | Decisión y justificación | Requisitos |
|---|---|---|
| **PD-001** | Proyecto Node.js 20+ en TypeScript estricto, con frontend HTML, CSS y JavaScript nativos servido desde el mismo proceso. Usar `npm` y un único comando de desarrollo; evita un framework de frontend y un segundo servidor. | FR-010, FR-017, NFR-001, NFR-002, NFR-007 |
| **PD-002** | Separar dominio, casos de aplicación, adaptadores de archivos, herramientas, servidor y adaptador LLM. Conservar prompt y conocimiento en archivos separados; las herramientas son importables por la demo. | FR-013, FR-014, FR-016, FR-018 |
| **PD-003** | Validar con `zod` solicitudes HTTP, fixtures, argumentos de herramientas y salidas estructuradas pertinentes. Las herramientas serializan el resultado discriminado `{ ok: true, data }` o `{ ok: false, error }`; sus límites capturan y clasifican errores, sin exponer trazas ni aparentar éxito. | FR-001, FR-012 a FR-014, NFR-003, NFR-005 |
| **PD-004** | Mapear determinísticamente con el glosario y rutas del maestro; conservar estado, origen, candidato y motivo por campo. No pedir al LLM que fabrique puntuaciones ni valores. Un campo sin mapeo ni fuente es faltante; los casos identificados por BR-002 y BR-005 exigen confirmación. | FR-002, FR-003, FR-009, BR-001, BR-002, BR-005, BR-007 |
| **PD-005** | Mantener por sesión y caso el mapeo, los candidatos y las correcciones manuales en memoria. Una decisión explícita de la analista resuelve el campo, regenera formulario y copia del paquete, y recalcula el checklist y el estado. La procedencia manual desaparece al cerrar la sesión; el valor puede permanecer en los artefactos. | FR-007 a FR-009, BR-001, BR-004, BR-005 |
| **PD-006** | Generar XLSX desde el descriptor de hojas y celdas y PDF desde el descriptor ordenado; escribir únicamente valores resueltos, sin modificar los fixtures. Crear el paquete con copias locales, checklist y borrador sin datos bancarios. | FR-004, FR-005, FR-007, BR-003, NFR-008 |
| **PD-007** | Usar un adaptador LLM propio y una implementación inicial de OpenAI, con modelo configurado por entorno; no acoplar SDK, herramientas ni servidor a un modelo concreto. El proveedor solo recibe los datos ficticios necesarios para el turno. Una implementación de prueba sustituible permite verificar el ciclo sin red. | FR-011, FR-018, NFR-005, NFR-009 |
| **PD-008** | Mantener el historial completo en memoria para el chat, pero producir ambos JSONL con un esquema de auditoría por lista permitida, sin argumentos, valores, secretos ni cuerpos de error sensibles. El log por caso contiene exactamente las claves exigidas; su resumen describe operación y resultado sin datos. | FR-010, FR-015, FR-022, NFR-003 |
| **PD-009** | Limitar iteraciones, tokens y tiempo del proveedor mediante configuración; controlar el presupuesto antes de cada llamada y contabilizar su uso. Como el enlace es público, añadir límites operativos del proceso para solicitudes, concurrencia y consumo global, además del límite por sesión. Al agotarlos se informa el motivo sin destruir la sesión. | FR-011, FR-012, FR-021, NFR-004, NFR-005 |
| **PD-010** | Registrar errores con códigos y mensajes seguros; mantener la sesión ante errores y aislar cada caso de la demo. Si la plantilla falta o es inválida, informar metadatos disponibles sin inferir campos ni generar formulario o paquete. | FR-012, FR-016, EC-001, EC-007, NFR-005 |
| **PD-011** | Publicar una única aplicación HTTP sin autenticación para la defensa, con datos ficticios y almacenamiento local escribible. Documentar la caducidad de sesiones al reiniciar y que una instancia efímera puede perder archivos; si no se obtiene URL pública, documentar la ejecución local y su penalización. | FR-019, FR-021, NFR-002, NFR-003 |

### Dependencias previstas

Seleccionar versiones compatibles con Node.js 20 al implementar y fijarlas mediante el archivo de bloqueo:

- `zod`: validación y descripción obligatoria de argumentos.
- `express`: API y entrega del frontend desde un único proceso.
- `exceljs` y `pdf-lib`: generación de XLSX y PDF; `exceljs` también permite inspeccionar los libros generados.
- SDK oficial de OpenAI: implementación inicial del adaptador; la clave permanece en el backend.
- `typescript`, `tsx`, tipos de Node/Express, `vitest` y `pdfjs-dist`: compilación, ejecución de desarrollo, pruebas y extracción independiente de texto PDF.

Se documentarán las dependencias, alternativas y justificaciones en `SOLUCION.md`. No se añade base de datos, framework de frontend ni biblioteca para automatizar portales.

## Diseño del dominio y flujo

1. Validar identificador de caso y cargar solicitud, descriptor de plantilla y soportes exigidos. Solo se aceptan `xlsx` y `pdf`; un portal produce una respuesta explícita de fuera de alcance sin generar artefactos.
2. Construir un registro por campo con identificador estable dentro del caso, etiqueta, ubicación u orden, estado, ruta de origen cuando corresponda, candidato y motivo. Resolver rutas anidadas del glosario sin convertir cadenas identificadoras en números. Si la ruta existe pero no tiene dato, clasificar como faltante.
3. Aplicar las reglas de país e identificación ambigua antes de resolver automáticamente. El valor candidato que requiere confirmación se muestra como tal, pero no se escribe. Para campos fuera del glosario sin fuente, solicitar el dato manualmente y marcarlos `faltante`.
4. Generar el formulario con todas las etiquetas y solo los valores resueltos. Crear la lista de soportes a partir del índice y existencia de archivos; ignorar `vigencia_hasta`. El paquete contiene copias de soportes disponibles, checklist de presentes, ausentes y campos faltantes, más borrador sin datos bancarios.
5. Calcular `listo_para_firma` como falso ante cualquier soporte exigido ausente o campo `requiere_confirmacion`. Un campo `faltante` por sí solo no bloquea. Exponer causas separadas y nunca inferir firma o envío.
6. La analista confirma un candidato o introduce una corrección explícita en el chat. La aplicación vincula la decisión a sesión, caso y campo; conserva su procedencia solo en memoria, actualiza el registro y regenera el formulario y el paquete. No aceptar decisiones inventadas por el modelo como si fueran instrucciones de la analista.
7. El agente informa los resultados respaldados por el estado y las herramientas. Los valores que aparecen en la respuesta se ensamblan desde datos verificados, no desde texto libre del modelo. La interfaz muestra llamadas, estado de espera y solicitudes de confirmación.

El mapeo enviado a `proveedor_generar_formulario` se valida contra el estado autorizado del caso; no se confía en valores arbitrarios o confirmaciones construidas por el LLM. La demo suministra su propio contexto de ejecución y no confirma automáticamente los campos pendientes.

## Componentes y organización prevista

```text
reto-01/
├── agent/prompt.md
├── src/
│   ├── domain/             # campos, reglas y estado para firma
│   ├── application/        # procesamiento y validación manual
│   ├── infrastructure/     # fixtures, documentos, paquete y auditoría
│   ├── tools/proveedor.ts  # contrato de herramientas
│   ├── llm/                # interfaz y proveedor
│   ├── knowledge/          # conocimiento separado del comportamiento
│   └── server.ts           # HTTP, sesiones y ciclo
├── web/                    # HTML, CSS y JavaScript
├── tests/
├── demo.ts
├── .env.example
├── package.json
├── README.md
└── SOLUCION.md
```

Los nombres son organización prevista, no interfaces adicionales obligatorias. `fixtures/` permanece sin modificaciones y `out/` no se incluye en la entrega.

## API y contratos

La API será JSON, sin streaming en la primera versión, y estará documentada en el README:

| Operación | Contrato previsto |
|---|---|
| `POST /api/chat` | Recibe `{ sessionId?, message }`; crea sesión si no se proporciona y devuelve `{ sessionId, reply, toolCalls, needsConfirmation }`. El historial registra llamadas y resultados resumidos para el chat. |
| `GET /api/sessions/:id` | Devuelve el historial disponible de la sesión; identificador desconocido produce error explícito. |
| `GET /api/health` | Devuelve `{ ok: true, provider, model }`, sin clave ni configuración sensible. |

Las confirmaciones y correcciones se originan en la interacción explícita de la analista dentro del chat y se vinculan al campo concreto; el diseño de transporte puede agregar datos estructurados a `POST /api/chat` siempre que preserve el mensaje y documente el contrato. Identificadores de sesión impredecibles reducen la exposición accidental del historial, pero no sustituyen autenticación.

Se mantienen las cuatro herramientas y sus entradas y salidas definidas en FR-014. El servidor valida argumentos antes de ejecutarlas; `execute` también devuelve errores tipados si se invoca directamente. El contexto incluye raíz del proyecto y sesión, con dependencias explícitas para aislar el estado en la demo y en pruebas.

## Datos, seguridad y operación

- **Rutas:** resolver entradas desde la raíz de `reto-01/`, validar identificadores y rutas normalizadas y rechazar recorrido de directorios, rutas absolutas y enlaces que salgan de los directorios permitidos. No ejecutar shell desde herramientas.
- **Estado y archivos:** sesiones y procedencia manual en memoria; maestro y fixtures de solo lectura; documentos y logs en `out/`. Preparar los archivos antes de reemplazarlos y comunicar errores si falla la actualización; no declarar un paquete actualizado cuando formulario y copia no coincidan. Serializar actualizaciones concurrentes del mismo caso.
- **Demo:** limpiar exclusivamente el directorio `out/` resuelto dentro del proyecto, ejecutar los tres casos permitidos y continuar ante fallos. Controlar metadatos variables de XLSX/PDF para cumplir el determinismo, salvo timestamps; verificar el resultado efectivo y no solo el resumen.
- **Privacidad:** el navegador puede mostrar datos bancarios completos solicitados y el historial de sesión puede recuperarlos. Los archivos JSONL usan exclusivamente metadatos y resúmenes sin datos sensibles; no registrar prompts, respuestas completas, argumentos ni excepciones crudas. El borrador de correo no incluye datos bancarios.
- **Secretos:** `.env.example` contiene nombres, no valores; la clave se lee solo en el backend. No incluir claves en API, frontend, logs, repositorio ni documentación. Limitar tamaño de peticiones y escapar texto en HTML.
- **Proveedor:** aplicar timeout y límites de tokens de entrada/salida de forma que el presupuesto restante de sesión y global no pueda excederse. La contabilidad, concurrencia y límites deben cubrir errores y solicitudes simultáneas; los límites en memoria se reinician al reiniciar el proceso, limitación explícita de la demo pública.
- **Configuración prevista:** puerto, proveedor y modelo, clave, timeout, máximos de iteraciones, tokens por sesión y límites operativos globales. Validar al inicio las variables necesarias y emitir errores seguros; la demo no requiere variables del modelo.
- **Migraciones:** no hay esquema persistente ni migraciones. Las sesiones y correcciones sin persistir se pierden al reiniciar, conforme al alcance de sesión.

## Estrategia de verificación

| Evidencia prevista | Criterios |
|---|---|
| Pruebas de lectura y mapeo de los tres fixtures; sinónimos, fuente anidada, campos desconocidos y valores exactos. | AC-001, AC-003, AC-013 |
| Abrir XLSX generados y verificar hoja, coordenadas y contenido; extraer texto del PDF y verificar etiquetas, orden y valores, con pendientes vacíos. Incluir la cuenta como cadena. | AC-002, AC-003 |
| Verificar copias y checklist con soporte ausente, soporte con fecha pasada ignorada y faltante que no bloquea; confirmar ausencia de datos bancarios en el borrador. | AC-004 |
| Solicitar el caso de portal y comprobar que no se genera salida ni se accede al portal. | AC-005 |
| Flujo de sesión: candidato pendiente bloquea; confirmación y corrección manual actualizan formulario y paquete, sin cambiar maestro; corrección de faltante; procedencia solo en memoria. | AC-006 |
| Pruebas de API/chat con adaptador simulado: historial, llamadas, indicadores, timeout, error y límite de iteraciones/tokens; conservar sesión y controlar concurrencia. | AC-007, AC-008 |
| Comprobar chat e historial con datos bancarios completos y ambos JSONL sin secretos ni datos sensibles, incluidos errores y argumentos. | AC-009, AC-013 |
| Ejecutar dos veces la demo sin clave en directorio de prueba; comparar resultados y contenidos de artefactos, controlar timestamps, comprobar integridad de fixtures y continuación tras fallo. | AC-010 |
| Medir en entorno limpio el arranque con un comando y verificar Node 20+, frontend, API, documentación, exclusiones de entrega y disponibilidad del enlace durante defensa, o registrar fallback local. | AC-011 |
| Casos inexistentes, plantillas ausentes/corruptas, datos inválidos y rutas de escape: errores claros sin trazas; no generar formulario ni paquete para plantilla inválida. | AC-012 |

Además, se ejecutarán compilación TypeScript y pruebas automatizadas; la integración real con el proveedor y la URL pública se verificarán cuando existan credenciales y despliegue. Los resultados no comprobados se marcarán como tales, no como aprobados.

## Secuencia de trabajo

1. Preparar proyecto, configuración, límites de entrada y contratos, sin alterar fixtures.
2. Implementar dominio, lectura, mapeo, herramientas y demo; validar reglas y errores sin modelo.
3. Implementar generación de documentos y paquete, actualización por validación manual y auditoría; verificar artefactos.
4. Incorporar adaptador LLM, ciclo con presupuestos, API y frontend; verificar sesión, errores y datos visibles.
5. Completar documentación y despliegue de prueba; medir arranque, ejecutar pruebas y registrar cobertura y riesgos.
6. Ejecutar convergencia contra la especificación y corregir discrepancias mediante el flujo de remediación correspondiente.

Esta secuencia no sustituye la fase de tareas: `tasks.md` deberá descomponerla, definir dependencias reales y vincular cada FR, BR y NFR relevante a tareas y cada AC a evidencia.

## Trazabilidad de decisiones y validación

| Alcance | Decisiones | Evidencia |
|---|---|---|
| FR-001 a FR-003; BR-001, BR-002, BR-005, BR-007 | PD-003, PD-004, PD-005 | AC-001, AC-003, AC-006, AC-012 |
| FR-004 a FR-008; BR-003, BR-004 | PD-004 a PD-006 | AC-002 a AC-005, AC-006 |
| FR-009 a FR-012; BR-006 | PD-005, PD-007, PD-009, PD-010 | AC-005 a AC-007, AC-012 |
| FR-013 a FR-018 | PD-002, PD-003, PD-007 a PD-010 | AC-007 a AC-010, AC-012 |
| FR-019 a FR-022 | PD-001, PD-008, PD-011 | AC-009, AC-011, AC-013 |
| NFR-001, NFR-002, NFR-007 | PD-001, PD-002, PD-011 | AC-011, compilación |
| NFR-003 a NFR-005 | PD-003, PD-008 a PD-010 | AC-007 a AC-009, AC-012 |
| NFR-006, NFR-008, NFR-009 | PD-004, PD-006, PD-007, PD-010 | AC-010, AC-012, AC-013 |

## Riesgos y compensaciones

- **Enlace público:** historial y datos ficticios quedan disponibles a quien obtenga el identificador de sesión; usar identificadores impredecibles y límites, y declarar que no es una solución de producción ni ofrece control de acceso.
- **Consumo del modelo:** los límites en memoria no sobreviven reinicios ni coordinan varias instancias. Mantener una sola instancia para la defensa y documentar el riesgo y medidas de producción.
- **Modelo generativo:** puede intentar inventar datos o confirmar por cuenta del usuario; validar herramientas y decisiones, mantener estado canónico y construir respuestas con datos verificados.
- **Persistencia local:** un despliegue efímero puede perder artefactos y sesiones. Elegir un entorno con almacenamiento escribible durante la defensa y documentar el comportamiento.
- **Interpretación de documentos:** XLSX y PDF se generan a partir de descriptores, no de archivos originales; verificar exactamente las celdas y el orden requeridos, así como soporte para caracteres de los fixtures.
- **Cambios de alcance respecto al PRD:** documentar claramente exclusión del portal y envío, y omisión de vencimientos en la tabla de cobertura de `SOLUCION.md`.
