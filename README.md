# Parcial1Patrones

Arquitectura de Microservicios Serverless Resiliente para Gestión de Emergencias —
Patrones Arquitectónicos Avanzados.

Sistema para procesar, clasificar, enrutar y responder solicitudes de auxilio (Búsqueda y
Rescate, Albergue, Suministros, Evaluación de Daños) en Chocó, Pereira, Cali y Manizales,
sobre microservicios contenerizados en AWS Lambda, API Gateway, Supabase (Postgres +
PostGIS + RLS + Realtime) y frontend en Vercel.

## Estado del proyecto

- [x] **Fase 1 — Modelado de Dominio y Base de Datos** ([docs/fase1-modelado-dominio.md](docs/fase1-modelado-dominio.md))
- [x] **Fase 2 — Dockerización y Microservicios Serverless** ([docs/fase2-dockerizacion-lambda.md](docs/fase2-dockerizacion-lambda.md))
- [ ] Fase 3 — API Gateway, enrutamiento y Frontend en Vercel
- [ ] Fase 4 — Despliegue progresivo (Canary / Feature Flags) + Gobernanza de costos

## Estructura

```
supabase/
  migrations/   Esquema de base de datos (SQL, reproducible)
  seed.sql      Datos de demostración para desarrollo local
services/
  _shared/      Infraestructura común (secretos, cliente Supabase, HTTP, logger)
  intake-triage/  dispatch/  geospatial/  notification/   Los 4 microservicios (Docker + Lambda)
infra/
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
