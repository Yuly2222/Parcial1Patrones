# Parcial1Patrones

Arquitectura de Microservicios Serverless Resiliente para Gestión de Emergencias —
Patrones Arquitectónicos Avanzados.

Sistema para procesar, clasificar, enrutar y responder solicitudes de auxilio (Búsqueda y
Rescate, Albergue, Suministros, Evaluación de Daños) en Chocó, Pereira, Cali y Manizales,
sobre microservicios contenerizados en AWS Lambda, API Gateway, Supabase (Postgres +
PostGIS + RLS + Realtime) y frontend en Vercel.

## Empieza por aquí

👉 [docs/resumen-general.md](docs/resumen-general.md) — qué se construyó, por qué, cómo se
conecta con la rúbrica, y qué falta (Fase 4). Léelo antes de tocar cualquier archivo.

## Estado del proyecto

- [x] **Fase 1 — Modelado de Dominio y Base de Datos** ([docs/fase1-modelado-dominio.md](docs/fase1-modelado-dominio.md))
- [x] **Fase 2 — Dockerización y Microservicios Serverless** ([docs/fase2-dockerizacion-lambda.md](docs/fase2-dockerizacion-lambda.md))
- [x] **Fase 3 — API Gateway, Enrutamiento y Frontend en Vercel** ([docs/fase3-gateway-frontend.md](docs/fase3-gateway-frontend.md))
- [x] **Fase 4 — Despliegue Progresivo (Canary) y Gobernanza de Costos** ([docs/fase4-canary-costos.md](docs/fase4-canary-costos.md))

## Estructura

```
supabase/
  migrations/   Esquema de base de datos (SQL, reproducible)
  seed.sql      Datos de demostración para desarrollo local
services/
  _shared/      Infraestructura común (secretos, cliente Supabase, auth, HTTP, logger)
  intake-triage/  dispatch/  geospatial/  notification/   Los 4 microservicios (Docker + Lambda)
frontend/       App Vite + React + TS (roles ciudadano/operador, PWA offline-first, mapa)
infra/
  template.yaml Definición SAM del API Gateway (rutas, CORS, throttling, WAF, Canary + alarmas)
  budget.yaml   AWS Budgets (presupuesto mensual + 2 alertas por correo)
  iam/          Policies de mínimo privilegio por función Lambda
  scripts/      Bootstrap de configuración/secretos (SSM + Secrets Manager)
docs/           Documentación técnica por fase (diagramas, decisiones de diseño)
```

## Requisitos

- [Node.js](https://nodejs.org/) 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Supabase local + build de imágenes Lambda)
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
