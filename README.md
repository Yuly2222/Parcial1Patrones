# Parcial1Patrones

Arquitectura de Microservicios Serverless Resiliente para Gestión de Emergencias —
Patrones Arquitectónicos Avanzados.

Sistema para procesar, clasificar, enrutar y responder solicitudes de auxilio (Búsqueda y
Rescate, Albergue, Suministros, Evaluación de Daños) en Chocó, Pereira, Cali y Manizales,
sobre microservicios contenerizados en AWS Lambda, API Gateway, Supabase (Postgres +
PostGIS + RLS + Realtime) y frontend en Vercel.

## Empieza por aquí

👉 [docs/resumen-general.md](docs/resumen-general.md) — qué se construyó, por qué, cómo se
conecta con la rúbrica, y qué falta. Léelo antes de tocar cualquier archivo.

## Estado del proyecto

- [x] **Fase 1 — Modelado de Dominio y Base de Datos** ([docs/fase1-modelado-dominio.md](docs/fase1-modelado-dominio.md))
- [x] **Fase 2 — Dockerización y Microservicios Serverless** ([docs/fase2-dockerizacion-lambda.md](docs/fase2-dockerizacion-lambda.md))
- [x] **Fase 3 — API Gateway, Enrutamiento y Frontend en Vercel** ([docs/fase3-gateway-frontend.md](docs/fase3-gateway-frontend.md))
- [x] **Fase 4 — Despliegue Progresivo (Canary) y Gobernanza de Costos** ([docs/fase4-canary-costos.md](docs/fase4-canary-costos.md))
- [x] **CI** — GitHub Actions valida (typecheck + build) frontend y los 4 microservicios en cada Pull Request hacia `main`
- [x] **CD** — GitHub Actions despliega backend automáticamente en cada push a `main`
- [x] **Rollback automático demostrado** — ver `evidencia-rollback-canary.log`

## Despliegue en producción

- **API Gateway (stage `prod`)**: `https://dswkbisvd5.execute-api.us-east-1.amazonaws.com/prod`
- **Frontend (Vercel)**: `https://parcial1-patrones.vercel.app`
- **Stack CloudFormation**: `emergencias-api` (backend) y `emergencias-budget` (AWS Budgets), región `us-east-1`
- **CI**: `.github/workflows/ci.yml` — en cada Pull Request hacia `main`, corre `typecheck`
  y `build` del frontend y de los 4 microservicios en paralelo (matrix); no toca AWS, no
  requiere secretos. Con branch protection activado en `main` (ver Quick start), un PR con
  algún job en rojo no se puede mergear
- **CD**: `.github/workflows/deploy-backend.yml` — en cada push a `main` que toque
  `services/` o `infra/template.yaml`, reconstruye y publica las 4 imágenes a ECR y corre
  `sam deploy` (Canary + alarmas se aplican automáticamente en cada despliegue)

### Limitación conocida: WAF y HTTP API v2

`infra/template.yaml` define un `AWS::WAFv2::WebACL` con una regla de rate-limiting por IP,
pero **no está asociado** al API Gateway. AWS WAFv2 solo soporta asociarse a REST API
(API Gateway v1), Application Load Balancer, AppSync, Cognito y App Runner — no a HTTP API
(API Gateway v2), que es lo que usa este proyecto por su throttling nativo y menor costo/latencia.
El rate-limiting agregado del stage (`ThrottlingRateLimit`/`ThrottlingBurstLimit`, ver
`infra/template.yaml`) sigue activo y protege contra picos de tráfico; el rate-limiting
específico *por IP* vía WAF quedaría disponible migrando a REST API Gateway, fuera del
alcance de este entregable.

### Evidencia del rollback automático del Canary

`evidencia-rollback-canary.log` contiene la salida real de un `sam deploy` con
`ChaosErrorRatePercent=50` sobre `intake-triage`: CodeDeploy inicia el despliegue
(`d-FWT4DH7EL`), la alarma `emergencias-intake-triage-latency` se activa durante la ventana
del 10% de tráfico, y CodeDeploy revierte automáticamente el alias `prod` a la versión
anterior (`CodeDeploy rollback deployment started: d-SO3RUB8EL` → `UPDATE_ROLLBACK_COMPLETE`),
sin intervención manual. Nota técnica importante para quien reproduzca esta prueba: con
`PackageType: Image`, `AutoPublishAlias` de SAM solo detecta cambios en `ImageUri` — cambiar
únicamente `ChaosErrorRatePercent` (una variable de entorno) no publica una versión nueva ni
dispara el canary. Por eso la imagen de `intake-triage` se retagueó (`:chaos-demo`) antes de
esta prueba.

## Estructura
supabase/
migrations/ Esquema de base de datos (SQL, reproducible)
seed.sql Datos de demostración para desarrollo local
services/
_shared/ Infraestructura común (secretos, cliente Supabase, auth, HTTP, logger, chaos)
intake-triage/ dispatch/ geospatial/ notification/ Los 4 microservicios (Docker + Lambda)
frontend/ App Vite + React + TS (roles ciudadano/operador, PWA offline-first, mapa)
infra/
template.yaml Definición SAM del API Gateway (rutas, CORS, throttling, WAF, Canary + alarmas)
budget.yaml AWS Budgets (presupuesto mensual + 2 alertas por correo)
iam/ Policies de mínimo privilegio por función Lambda
scripts/ Bootstrap de configuración/secretos (SSM + Secrets Manager) y creación de roles IAM
.github/
workflows/ ci.yml (validación en PRs) y deploy-backend.yml (build + push a ECR y sam deploy en push a main)
docs/ Documentación técnica por fase (diagramas, decisiones de diseño)


## Requisitos

- [Node.js](https://nodejs.org/) 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Supabase local + build de imágenes Lambda)
- [AWS CLI](https://aws.amazon.com/cli/) y [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) configurados con un usuario IAM (no root)
- Cuenta en [Supabase](https://supabase.com/) y en AWS (Free Tier) para el proyecto remoto

## Quick start (base de datos)

```bash
npx supabase start   # levanta Postgres+PostGIS+Auth+Realtime local y aplica las migraciones
```

Studio local: `http://localhost:54323`. Detalle completo del modelo de dominio, RLS y cómo
enlazar con el proyecto remoto en [docs/fase1-modelado-dominio.md](docs/fase1-modelado-dominio.md).

## Quick start (microservicios)

```bash
node services/sync-shared.js          # sincroniza services/_shared en cada servicio (dev local)
cd services/intake-triage && npm install && npm run typecheck
```

Cómo construir/publicar las 4 imágenes a ECR y desplegarlas a Lambda con secretos dinámicos
(sin `.env`) en [docs/fase2-dockerizacion-lambda.md](docs/fase2-dockerizacion-lambda.md).

## Quick start (frontend)

```bash
cd frontend
cp .env.example .env.local   # completar con tus valores (nunca la service_role key)
npm install
npm run dev
```

Cómo desplegar el API Gateway (`infra/template.yaml`), conectar el Database Webhook de
Supabase y publicar en Vercel en [docs/fase3-gateway-frontend.md](docs/fase3-gateway-frontend.md).

## Quick start (despliegue progresivo y costos)

Cómo demostrar el rollback automático del Canary (con el interruptor `ChaosErrorRatePercent`)
y cómo desplegar el presupuesto de AWS Budgets en
[docs/fase4-canary-costos.md](docs/fase4-canary-costos.md).

## Quick start (CI/CD)

Cada Pull Request hacia `main` dispara `.github/workflows/ci.yml`: typecheck + build del
frontend y de los 4 microservicios en paralelo. No requiere secretos. Para que un PR con un
job en rojo no se pueda mergear, hay que activarlo como check obligatorio en
**Settings → Branches → Add branch protection rule** (`main` → *Require status checks to
pass before merging*); las opciones solo aparecen en el buscador después de la primera
corrida del workflow (por ejemplo, abriendo un PR o disparándolo manualmente).

El backend se despliega solo en cada push a `main` vía GitHub Actions
(`.github/workflows/deploy-backend.yml`). Requiere dos secretos configurados en
**Settings → Secrets and variables → Actions**: `AWS_ACCESS_KEY_ID` y
`AWS_SECRET_ACCESS_KEY`, del usuario IAM de despliegue. Para forzar una corrida manual sin
hacer push: pestaña **Actions** → *Deploy backend (ECR + SAM)* → **Run workflow**.
