# Solución: registro como proveedor

## Problema

La analista administrativa necesita preparar registros como proveedor sin retranscribir información existente ni inventar datos.

## Arquitectura

HTML/JavaScript → API Node/TypeScript → ciclo del agente → adaptador del modelo y herramientas → maestro y fixtures locales → `out/`. El comportamiento está en `agent/prompt.md`, el conocimiento en `src/knowledge/` y la ejecución en `src/tools/`, `src/domain/` e `src/infrastructure/`.

## Ciclo y confirmación

El adaptador del modelo propone llamadas a herramientas. Los argumentos se validan y el estado del caso es la fuente de las respuestas; las confirmaciones y correcciones se reciben por acciones explícitas del chat, no del modelo. Hay límites configurables de iteraciones, tokens de sesión y globales, concurrencia, solicitudes y timeout. Los límites y sesiones se mantienen en memoria y se reinician con el proceso.

## Modelo y costo

El adaptador implementado usa OpenAI y un modelo configurado por `OPENAI_MODEL`; la clave se lee solo de variables del backend. Se verificó localmente con `gpt-4o-mini`: el caso de Colombia ejecutó las cuatro herramientas y permitió descargar el formulario. Una primera sesión informó agotamiento del presupuesto; tras aumentar el límite predeterminado de sesión a 200.000 y reiniciar, una nueva sesión completó el caso y una consulta posterior sin ese aviso. No se verificaron los demás casos con el proveedor real.

El costo estimado por caso depende del modelo y de los tokens utilizados: `(tokens de entrada × tarifa de entrada + tokens de salida × tarifa de salida) / 1.000.000`. No hay un importe confiable sin consultar las tarifas del modelo utilizado y medir su consumo real.

Como referencia hipotética, `gpt-5.4-mini` cobra [USD 0,75 por millón de tokens de entrada y USD 4,50 por millón de salida](https://developers.openai.com/api/docs/models/gpt-5.4-mini), según la tarifa publicada consultada el 13 de noviembre de 2026. Si un caso consumiera 10.000 tokens de entrada y 2.000 de salida, costaría aproximadamente **USD 0,0165**, sin caché ni otros cargos. Estas cantidades son supuestos, no mediciones; el modelo real se configura por entorno y las tarifas pueden cambiar.

## Decisiones y alternativas

1. **Estado en memoria:** evita base de datos para el reto; se descarta persistencia de sesiones, que sería necesaria en producción.
2. **Herramientas deterministas:** el glosario y el maestro determinan valores; se descarta permitir al modelo completar datos ausentes.
3. **JSONL con metadatos:** protege datos sensibles; se descarta registrar argumentos y resultados completos en disco, aunque el chat los muestra.
4. **Pruebas con `node:test`:** se usa el ejecutor integrado en lugar de Vitest previsto en el plan, porque las versiones compatibles con Node 20 reportaron vulnerabilidades críticas en sus dependencias. Se mantienen `tsx` y `pdfjs-dist` para ejecutar TypeScript y comprobar PDFs.

Dependencias principales: `zod` valida entradas, `express` expone HTTP, `exceljs` y `pdf-lib` generan documentos y el SDK de OpenAI implementa el adaptador. TypeScript, tipos de Node/Express, `tsx` y `pdfjs-dist` apoyan desarrollo y pruebas.

## Supuestos y cobertura

Los datos suministrados son ficticios y el maestro está actualizado. El usuario aprobó excluir portal, firma y envío real o simulado, e ignorar vencimientos.

| Historia | Estado | Pendiente |
|---|---|---|
| Lectura y mapeo | Parcialmente verificado | Ampliar pruebas de errores y variantes. |
| Formulario y paquete | Parcialmente verificado | Completar pruebas de todos los artefactos y fallos de escritura. |
| Chat y confirmación | Parcialmente verificado | El flujo visual se probó con proveedor simulado; el proveedor real se verificó para Colombia, sin probar confirmaciones. |
| Errores y límites | Parcialmente verificado | Ampliar pruebas de concurrencia, timeout y presupuestos. |
| Enlace público | No implementado | Alternativa local con penalización de 10 puntos; no hay URL pública verificada. |

## Uso de IA

Se usó GitHub Copilot para planificación, implementación y pruebas. Se descartó la dependencia de pruebas inicialmente prevista por las vulnerabilidades reportadas en su árbol compatible con Node 20. Los resultados generados requieren revisión y validación humana.

## Riesgos de producción

El enlace sin autenticación no protege datos reales; no debe usarse con información sensible real. El almacenamiento local puede perderse en entornos efímeros y los límites en memoria no sobreviven reinicios ni coordinan varias instancias. En producción se requieren controles de acceso, almacenamiento seguro, límites distribuidos, protección de datos, observabilidad adecuada y revisión de seguridad.
