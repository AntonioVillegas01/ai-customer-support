# Guía POC — Uso end-to-end (español)

Cómo probar la plataforma completa como **cliente final** y como **agente de soporte**, y cómo embeber el bot en cualquier sitio para un POC.

## 1. Arrancar todo

```bash
# prerequisitos: Node >= 22, pnpm >= 9, Docker
./scripts/setup.sh   # solo la primera vez: deps, infra, migraciones, seed
pnpm compose:up      # postgres, redis, minio
pnpm dev             # web :3000, api :3001, widget :3002, worker
```

Verifica que todo esté arriba:

| Servicio | URL |
|---|---|
| Dashboard (staff) | http://localhost:3000 |
| API (OpenAPI en `/docs`) | http://localhost:3001/docs |
| Widget (iframe del bot) | http://localhost:3002 |
| Worker health | http://localhost:3003/health/live |

## 2. Credenciales seed

Contraseña para todos: `Password123!Password`

| Usuario | Rol | Organización |
|---|---|---|
| `owner@acme.test` | owner | Acme |
| `agent@acme.test` | agent | Acme |
| `owner@globex.test` | owner | Globex |
| `agent@globex.test` | agent | Globex |

Widget keys seed: `wgt_acme_local_demo_key` (Acme) y `wgt_globex_local_demo_key` (Globex).

## 3. Como cliente final (el bot)

Abre el widget directamente:

```
http://localhost:3002/#key=wgt_acme_local_demo_key&host=http://localhost:3002
```

Escribe una pregunta. El flujo interno es:

1. El widget pide un token firmado (`POST /v1/widget/token`) — el API valida el `Origin` contra la allowlist del tenant.
2. El mensaje se acepta con 202 y se encola en BullMQ.
3. El worker genera la respuesta AI con RAG sobre la base de conocimiento del tenant, con citas verificables.
4. La respuesta llega en vivo por SSE. Si el proveedor AI falla, el cliente recibe una oferta de escalación a humano.

## 4. Como agente/staff

1. Entra a http://localhost:3000/login con `owner@acme.test`.
2. **Inbox** — ve la conversación que creaste como cliente: responde como humano, cambia el estado (handoff/escalación), agrega notas internas.
3. **Knowledge** — sube FAQs, URLs o archivos; el worker los ingesta y el bot los usa para responder con citas.
4. **Analytics** — métricas de conversaciones y uso.
5. **Settings** — API keys, configuración del widget (branding, origins permitidos), audit log.

Multi-tenant: repite lo mismo con Globex y verifica que los datos nunca se cruzan entre organizaciones.

## 5. Cómo "aprende" el bot (RAG) y cómo entrenarlo en otros temas

El LLM **no se reentrena** con tus datos: usa **RAG** (Retrieval-Augmented Generation). El conocimiento vive en tu base de datos, por organización:

1. **Ingesta** — subes un documento; el worker lo trocea en chunks (~1200 caracteres, overlap 150), genera un embedding por chunk y los guarda en Postgres/pgvector (`apps/worker/src/ingestion/`).
2. **Recuperación** — cada pregunta del cliente se embebe y se buscan los chunks más parecidos (búsqueda híbrida: vectorial + texto).
3. **Generación** — esos chunks van en el prompt como evidencia; el bot responde **con citas** y se **abstiene o escala** si no hay evidencia válida (nunca inventa).

### Agregar un tema nuevo (flujo completo)

No hay entrenamiento: solo agrega documentos y el bot responde sobre ese tema al instante.

**Opción A — Dashboard:** entra como `owner@acme.test` → **Knowledge** → crea una FAQ, URL o sube un archivo. Espera a que el estado sea `ready`.

**Opción B — API:**

```bash
# 1. Login (guarda cookies de sesión)
curl -s -c /tmp/acs.jar -X POST http://localhost:3001/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@acme.test","password":"Password123!Password"}'

# 2. Crear una FAQ sobre un tema nuevo (usa el orgId de tu sesión)
curl -s -b /tmp/acs.jar -X POST \
  http://localhost:3001/v1/orgs/<ORG_ID>/knowledge/sources/faq \
  -H 'Content-Type: application/json' -H "x-csrf-token: <ACS_CSRF>" \
  -d '{"question":"¿Cuál es el horario de atención?","answer":"Lunes a viernes de 9:00 a 18:00, sábados de 10:00 a 14:00."}'

# 3. Verificar que quedó indexado (debe aparecer el chunk nuevo)
curl -s -b /tmp/acs.jar \
  "http://localhost:3001/v1/orgs/<ORG_ID>/knowledge/search?q=horario%20de%20atencion"
```

Endpoints disponibles: `sources/faq`, `sources/url`, `sources/file` (multipart), `sources/:id/reprocess`, `GET search`.

**4. Probar:** abre el widget y pregunta "¿a qué hora abren?" — el bot responde citando la nueva fuente. Si preguntas algo fuera del conocimiento, se abstiene y ofrece escalar a un humano (eso es lo esperado).

**Para conductas nuevas** (acciones, no conocimiento): habilita tools por organización en `tool_definitions` (p. ej. `lookup_order`, `create_return`) — ver seed como referencia.

## 6. Embeber el bot en tu sitio (POC)

Una sola línea en cualquier página HTML:

```html
<script
  src="http://localhost:3002/embed.js"
  data-widget-key="wgt_acme_local_demo_key"
  async
></script>
```

El loader inyecta un iframe aislado (sandbox, origin separado) con un botón flotante. La página host nunca ve el contenido de los mensajes.

**Requisito clave:** el origin de tu página debe estar en la allowlist del widget (Settings → Widget). El seed ya incluye `http://localhost:3002`; agrega el tuyo (p. ej. `http://localhost:8080`) o el API rechazará el token con 403.

Prueba rápida con una página host local:

```bash
mkdir -p /tmp/poc && cat > /tmp/poc/index.html <<'HTML'
<!doctype html>
<html><body>
  <h1>Mi sitio de prueba</h1>
  <script src="http://localhost:3002/embed.js" data-widget-key="wgt_acme_local_demo_key" async></script>
</body></html>
HTML
npx serve /tmp/poc -l 8080   # y registra http://localhost:8080 en Settings → Widget
```

En producción: cambia la URL del script por tu dominio del widget y crea el widget key desde Settings.

## 7. Proveedor AI

En `.env`:

- `AI_PROVIDER=fake` — corre 100% offline con respuestas determinísticas (ideal para demo sin API keys).
- `AI_PROVIDER=gemini` / `openrouter` — respuestas reales (requiere la API key correspondiente).

## Referencias

- Integración del widget: [`docs/widget-integration.md`](./widget-integration.md)
- Arquitectura: [`docs/architecture.md`](./architecture.md)
- Limitaciones conocidas: [`docs/KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md)
