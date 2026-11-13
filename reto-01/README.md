# Registro como proveedor

Aplicación de demostración en Node.js 20+ y HTML plano. Procesa los casos Excel y PDF de `fixtures/`, prepara soportes y permite confirmar o corregir campos en el chat. No firma, no envía y no opera portales.

## Inicio local

Instale dependencias con `npm ci`. Configure variables de entorno en el proceso que ejecutará la aplicación. Por ejemplo, en PowerShell:

```powershell
$env:OPENAI_API_KEY = '<clave del proveedor>'
$env:OPENAI_MODEL = '<modelo compatible con herramientas>'
npm run dev
```

Abra `http://localhost:3000`. Las demás variables están en `.env.example`; se leen del entorno, no automáticamente desde un archivo `.env`. No incluya claves en el repositorio ni las escriba en el chat.

Para instalar y arrancar en una sola instrucción, después de configurar las variables: `npm ci && npm run dev`.

## Demo y pruebas

```powershell
npm run demo
npm run build
npm test
```

La demo no necesita modelo ni clave y **elimina el contenido de `out/` antes de ejecutarse**. Los resultados incluyen formularios y paquetes en `out/<caso>/`; los fixtures no se modifican. Las sesiones y la procedencia de correcciones manuales viven solo en memoria.

## API

- `POST /api/chat`: `{ "sessionId"?: "...", "message": "..." }`; devuelve `{ sessionId, reply, toolCalls, needsConfirmation }`.
- Para confirmar o corregir un campo, el mismo endpoint acepta además `decision`: `{ caso, id, confirm: true }` o `{ caso, id, value }`. La decisión debe provenir de la analista.
- `GET /api/sessions/:id`: historial y campos de la sesión.
- `GET /api/sessions/:id/cases/:caso/files` y `GET /api/sessions/:id/cases/:caso/files/:file`: lista y descarga de archivos del paquete generado en esa sesión.
- `GET /api/health`: estado, proveedor y modelo, sin claves.

Los archivos de auditoría no contienen argumentos ni valores sensibles; el chat y su historial muestran completos los datos bancarios solicitados. El enlace público de prueba aún no está disponible. Se puede ejecutar localmente durante la defensa, con la penalización indicada en el PRD.
