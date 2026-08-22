# Fase 3 — API Gateway, Enrutamiento y Frontend en Vercel

Implementa el punto 4.2 (API Gateway), 4.4 (Frontend) y la Fase 3 del enunciado.

## API Gateway (`infra/template.yaml`)

Plantilla SAM que **no construye imágenes** (eso ya lo hace `services/build-and-push.sh` en
Fase 2) — solo define el HTTP API y conecta las 4 funciones Lambda ya publicadas en ECR.

| Ruta | Método | Servicio |
|---|---|---|
| `/v1/emergencias` | POST | intake-triage |
| `/v1/emergencias/zona/{ciudad}` | GET | intake-triage |
| `/v1/despachos` | POST | dispatch |
| `/v1/despachos/{id}` | PATCH | dispatch |
| `/v1/geospatial/recalcular` | POST | geospatial |
| `/v1/notificaciones/eventos` | POST | notification |

- **CORS**: restringido al `CorsOrigin` (el dominio de Vercel), no `*`.
- **Stage**: `prod` explícito (`StageName: prod` en el `HttpApi`).
- **Throttling agregado**: `DefaultRouteSettings` con rate/burst limit configurables.
- **Rate limiting por IP**: HTTP API (a diferencia de REST API) no soporta Usage
  Plans/API Keys nativamente, así que el patrón estándar de AWS para "por IP" es un
  **WAFv2 Web ACL** con una `RateBasedStatement` (bloquea una IP que supere
  `RateLimitPorIpCada5Min` solicitudes en 5 minutos), asociado al stage `prod`.
- **Rate limiting por Token**: fuera de alcance de este entregable — requeriría un Lambda
  Authorizer con su propio *bucket* de rate-limit por usuario (ej. usando DynamoDB o
  ElastiCache); queda documentado como extensión futura.

### Desplegar

Requiere [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
y que ya hayas hecho `services/build-and-push.sh` (Fase 2) + creado los roles IAM
(`infra/iam/*.json`).

```bash
sam deploy \
  --template-file infra/template.yaml \
  --stack-name emergencias-api \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides \
    IntakeTriageImageUri=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/emergencias/intake-triage:latest \
    DispatchImageUri=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/emergencias/dispatch:latest \
    GeospatialImageUri=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/emergencias/geospatial:latest \
    NotificationImageUri=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/emergencias/notification:latest \
    IntakeTriageRoleArn=arn:aws:iam::<ACCOUNT_ID>:role/emergencias-intake-triage-role \
    DispatchRoleArn=arn:aws:iam::<ACCOUNT_ID>:role/emergencias-dispatch-role \
    GeospatialRoleArn=arn:aws:iam::<ACCOUNT_ID>:role/emergencias-geospatial-role \
    NotificationRoleArn=arn:aws:iam::<ACCOUNT_ID>:role/emergencias-notification-role \
    CorsOrigin=https://tu-app.vercel.app
```

El output `ApiBaseUrl` es lo que va en `VITE_API_BASE_URL` del frontend, y es la URL que se
entrega como "Endpoint base de API Gateway (Stage prod)" en los requisitos de entrega.

**Usa siempre un tag inmutable** (el commit corto que ya genera `build-and-push.sh`) para
`*ImageUri`, no `:latest` — así un `sam deploy` no despliega "lo que sea que haya en latest
en ese momento" y el historial de despliegues queda trazable (importante también para la
Fase 4, donde cada Canary necesita una versión de Lambda nueva y distinguible).

## Notification: conectar el Database Webhook de Supabase

El Service 4 (`/v1/notificaciones/eventos`) espera que Supabase le avise cuando cambia una
solicitud. En el Dashboard de Supabase: **Database → Webhooks → Create a new hook**:

- Table: `intake.solicitudes` · Events: `INSERT`, `UPDATE`
- Type: HTTP Request → `POST {ApiBaseUrl}/v1/notificaciones/eventos`
- Headers: `x-supabase-webhook-secret: <INBOUND_WEBHOOK_SECRET>` (el mismo valor que
  generaste en `infra/scripts/bootstrap-config.sh` en Fase 2)

El handler verifica ese header antes de procesar nada (`services/notification/src/handler.ts`)
— sin él, responde 401. Esto evita que un tercero que adivine la URL pública dispare
notificaciones falsas.

## Autenticación/autorización de extremo a extremo

RLS (Fase 1) protege el acceso **directo** Supabase↔frontend (lectura del panel,
suscripción Realtime). Pero el tráfico **frontend→API Gateway→Lambda** no pasa por RLS
(el backend usa la Service Role Key). Por eso, en esta fase se añadió `services/_shared/auth.ts`:

- Cada Lambda expuesta por HTTP valida el JWT del header `Authorization: Bearer <token>`
  contra Supabase Auth (`supabase.auth.getUser(token)`) y lee su rol/ciudad desde `core.profiles`.
- `POST /v1/emergencias` ya **no confía en un `solicitante_id` del body**: lo toma del JWT
  verificado, así nadie puede radicar una emergencia suplantando a otro ciudadano.
- `GET /v1/emergencias/zona/{ciudad}`, `POST/PATCH /v1/despachos/*` y
  `POST /v1/geospatial/recalcular` (solo en su invocación HTTP) exigen rol `operador` de esa
  misma ciudad, o `admin`.
- `POST /v1/notificaciones/eventos` no lleva JWT de usuario (es Supabase llamando a Supabase);
  se protege con el secreto compartido descrito arriba.

## Frontend (`frontend/`)

Vite + React + TypeScript (no Next.js: para una single-page app con 2 vistas condicionales,
Vite da un bundle más liviano y un dev server más rápido — más alineado con "tiempos de
carga mínimos en redes degradadas" que un framework full-stack que aquí no se necesita).

- **Auth**: pantalla de entrada con dos caminos — "Soy ciudadano" hace
  `supabase.auth.signInAnonymously()` (sin fricción para alguien reportando una emergencia
  en medio del caos); "Soy operador" pide correo/contraseña. El rol y la ciudad asignada
  se leen de `core.profiles` (`src/hooks/useProfile.ts`), que se auto-crea para ciudadanos
  anónimos en su primer ingreso.
- **`CiudadanoForm`** (`src/components/CiudadanoForm.tsx`): formulario de radicación con
  geolocalización del navegador, campos específicos por tipo de emergencia, y **cola
  offline-first** (`src/lib/offlineQueue.ts`): si el `fetch` al API Gateway falla, el reporte
  se guarda en `localStorage` y se reintenta solo (al recuperar conexión o al recargar la app)
  — el ciudadano nunca pierde su reporte por quedarse sin señal.
- **`OperadorDashboard`** (`src/components/OperadorDashboard.tsx`): mapa interactivo
  (Leaflet/OpenStreetMap, sin API key) con marcadores coloreados por prioridad + lista
  ordenada, suscrita a **Supabase Realtime** (`postgres_changes` sobre `intake.solicitudes`
  filtrado por ciudad) para actualizarse sola sin polling, y un botón para despachar cuadrilla.
- **PWA / offline-first** (`vite-plugin-pwa`): app-shell cacheado con `NetworkFirst` + timeout
  de 3s, para que en una red lenta/caída la app siga cargando desde caché en vez de colgarse.
- **Code-splitting**: Leaflet/react-leaflet (~52 KB gzip) solo lo carga el operador — está en
  un chunk separado, cargado con `React.lazy()`, para que el ciudadano (el perfil que de
  verdad opera en redes degradadas, según el enunciado) no pague ese peso. Resultado del
  build: chunk principal ~107 KB gzip, chunk del panel de operador ~52 KB gzip aparte.
- **Secretos**: solo `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_API_BASE_URL`
  (todas públicas por diseño — la anon key está gobernada por RLS). Nunca la Service Role Key.

### Requisitos previos en Supabase (una vez, vía Dashboard)

1. **Authentication → Providers → Anonymous Sign-ins**: activarlo (lo usa el flujo de ciudadano).
2. Crear al menos un usuario operador real (Authentication → Users → Add user) y luego, en el
   SQL Editor, insertar su perfil:
   ```sql
   insert into core.profiles (id, rol, ciudad_asignada, organismo, nombre)
   values ('<uuid-del-usuario>', 'operador', 'Pereira', 'Bomberos', 'Operador Demo Pereira');
   ```

### Desplegar en Vercel

El repo es un monorepo (`frontend/`, `services/`, `supabase/`, `infra/`), así que en el
proyecto de Vercel hay que fijar:

- **Root Directory**: `frontend`
- **Framework Preset**: Vite (autodetectado)
- **Build Command** / **Output Directory**: los defaults de Vite (`npm run build` / `dist`)
- **Environment Variables** (Project Settings → Environment Variables, no en el repo):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`
- Conectado a la rama principal (`main`) para despliegue automático en cada push — cumple
  "Despliegue automatizado en la plataforma Vercel vinculado a la rama principal de producción".

### Desarrollo local

```bash
cd frontend
cp .env.example .env.local   # completar con tus valores reales
npm install
npm run dev
```

## Validación realizada sin AWS/Docker

Este entorno no tiene AWS CLI, SAM CLI ni Docker, así que **no se pudo desplegar el API
Gateway real ni correr el frontend contra un backend en vivo**. Lo que sí se validó:

- `npm install` + `npm run typecheck` en `frontend/`: sin errores.
- `npm run build` (producción, con variables de entorno de prueba): build exitoso, service
  worker generado, y confirmado el code-splitting (chunk principal 371 KB / 107 KB gzip,
  chunk del panel de operador con Leaflet separado en 163 KB / 52 KB gzip).
- `infra/template.yaml` se revisó a mano (sintaxis SAM/CloudFormation, ARN de asociación WAF↔HTTP
  API v2, `RateBasedStatement`) — no se pudo correr `sam validate` ni `cfn-lint` por falta de
  SAM CLI/Python en este entorno.

Pendiente para cuando tengas AWS: `sam deploy` real, configurar el Database Webhook de
Supabase, y probar el flujo completo ciudadano→Lambda→Supabase→Realtime→operador end-to-end.
