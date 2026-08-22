# Fase 2 — Dockerización y Microservicios Serverless

Implementa el punto 4.1 (los 4 microservicios), 4.5 (secretos dinámicos) y la Fase 2 del
enunciado: Dockerfiles multi-stage optimizados, publicación en ECR y despliegue a Lambda.

## Estructura

```
services/
  _shared/                 Código de infraestructura común (NO lógica de negocio):
                            cliente de secretos (SSM/Secrets Manager), cliente Supabase,
                            helpers HTTP de API Gateway, logger estructurado, tipos.
  intake-triage/            Service 1 — POST /v1/emergencias, GET /v1/emergencias/zona/{ciudad}
  dispatch/                 Service 2 — POST /v1/despachos, PATCH /v1/despachos/{id}
  geospatial/                Service 3 — recálculo de clusters (HTTP o EventBridge Scheduler)
  notification/              Service 4 — recibe Database Webhooks de Supabase y reenvía firmado
  sync-shared.js            Copia _shared/ -> <service>/src/shared/ para desarrollo local
  build-and-push.sh         Build + push de las 4 imágenes a Amazon ECR
  .dockerignore
infra/
  iam/                      Trust policy + policy de mínimo privilegio por función Lambda
  scripts/bootstrap-config.sh  Crea los parámetros/secretos en SSM y Secrets Manager
```

## Por qué `_shared/` no rompe la autonomía de los microservicios

`_shared` solo contiene **glue de infraestructura** (leer secretos, crear el cliente de
Supabase, formatear respuestas HTTP, loggear) — cero lógica de negocio. Cada `Dockerfile`
copia ese código fuente dentro de su propia imagen en tiempo de build
(`COPY _shared ./src/shared`) y lo compila junto con su handler en un solo `tsc`. El
resultado: **4 imágenes completamente independientes** — ninguna depende de un paquete
publicado compartido, ninguna se redespliega porque otra cambió, cada una tiene su propio
`package.json`/lockfile/ciclo de CI-CD. La única forma de invocar a otro servicio es HTTP
(API Gateway) o eventos (Database Webhooks) — igual que en un sistema de microservicios real.

`services/sync-shared.js` es solo una comodidad para poder correr `npm run build`/tener
autocompletado en el editor fuera de Docker; el build de Docker **no depende de él**, hace su
propio `COPY` directo desde `_shared/`.

## Gestión de secretos (sin `.env`)

Cada Lambda, en `_shared/config.ts`, lee **únicamente punteros no sensibles** desde variables
de entorno (con defaults ya sensatos, así que ni siquiera hace falta configurarlas):

- `CONFIG_PATH` → ruta de SSM (default `/emergencias/prod/common`)
- `SUPABASE_SECRET_ID` → nombre del secreto en Secrets Manager (default `emergencias/prod/supabase`)

El **valor real** (URL de Supabase, Service Role Key) se resuelve en cold-start contra SSM
Parameter Store / Secrets Manager y se cachea 5 minutos en memoria del contenedor para no
pagar esa latencia en cada invocación "warm". Esto es la diferencia clave con un `.env`:
nada sensible viaja en el código ni en la configuración de la función, y rotar una credencial
no requiere redeploy — solo actualizar el secreto (el próximo cold-start, o en máximo 5 min,
toma el valor nuevo).

Para crear esos parámetros/secretos en tu cuenta AWS:

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="ey..."                 # Project Settings > API > service_role
export WEBHOOK_SIGNING_SECRET="$(openssl rand -hex 32)"
export INBOUND_WEBHOOK_SECRET="$(openssl rand -hex 32)"
AWS_REGION=us-east-1 ./infra/scripts/bootstrap-config.sh
```

`INBOUND_WEBHOOK_SECRET` es el valor que luego configuras como header `x-supabase-webhook-secret`
en el Database Webhook de Supabase (Fase 3) — así el Service 4 verifica que la solicitud
entrante de verdad viene de Supabase y no de un tercero que adivinó la URL pública.

## IAM de mínimo privilegio

`infra/iam/` trae la trust policy (`lambda.amazonaws.com` puede asumir el rol) y una policy
por servicio: cada Lambda solo puede leer **su propio** log group, los parámetros bajo
`/emergencias/prod/common/*` (+ `geospatial/*` solo para ese servicio), y el/los secretos que
realmente necesita (`notification` es el único que además lee `emergencias/prod/notification-*`).
Sustituye `{{REGION}}`/`{{ACCOUNT_ID}}` y crea el rol, por ejemplo para intake-triage:

```bash
aws iam create-role --role-name emergencias-intake-triage-role \
  --assume-role-policy-document file://infra/iam/trust-policy-lambda.json

aws iam put-role-policy --role-name emergencias-intake-triage-role \
  --policy-name least-privilege \
  --policy-document file://infra/iam/intake-triage-policy.json   # ya con los placeholders reemplazados
```

Repite para `dispatch`, `geospatial` y `notification` con su policy respectiva.

## Construir y publicar las imágenes

Requiere Docker Desktop corriendo y AWS CLI configurado (`aws configure`).

```bash
# las 4 imágenes
AWS_REGION=us-east-1 ./services/build-and-push.sh

# o una sola
./services/build-and-push.sh intake-triage
```

El script crea el repositorio ECR si no existe (`emergencias/<servicio>`, con escaneo de
vulnerabilidades al push activado), construye con el `Dockerfile` de cada servicio
(**contexto = `services/`**, no la carpeta del servicio — así el `COPY _shared` funciona) y
publica dos tags: el commit corto de git y `latest`.

### Probar una imagen localmente antes de publicar (Lambda Runtime Interface Emulator)

La imagen base `public.ecr.aws/lambda/nodejs:20` ya incluye el emulador de Lambda:

```bash
docker build -f services/intake-triage/Dockerfile -t intake-triage services/
docker run -p 9000:8080 intake-triage

# en otra terminal:
curl "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{
  "requestContext": {"http": {"method": "POST"}},
  "body": "{\"tipo\":\"albergue\",\"ciudad\":\"Pereira\",\"latitud\":4.81,\"longitud\":-75.69,\"solicitante_id\":\"00000000-0000-0000-0000-000000000000\",\"datos_criticos\":{\"conteo_damnificados\":{\"adultos\":2},\"estado_habitabilidad\":\"no_habitable\"}}"
}'
```

(Esto invoca el handler pero **no** llega a Supabase de verdad a menos que las variables de
AWS/región tengan credenciales válidas y los parámetros/secretos ya existan — sirve para
validar que el contenedor arranca y el handler no truena antes de gastar tiempo en un push.)

### Desplegar a Lambda (imagen de contenedor)

```bash
aws lambda create-function \
  --function-name emergencias-intake-triage \
  --package-type Image \
  --code ImageUri=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/emergencias/intake-triage:latest \
  --role arn:aws:iam::<ACCOUNT_ID>:role/emergencias-intake-triage-role \
  --timeout 10 --memory-size 256 \
  --region us-east-1
```

Repite para los otros 3 servicios (ajustando `--role` a su policy respectiva). El
enrutamiento HTTP (API Gateway) y el `AutoPublishAlias`/Canary sobre estas funciones se
configuran en la Fase 3 y 4.

## Validación realizada sin Docker

Este entorno no tenía Docker Desktop disponible, así que **no se pudo construir/correr las
imágenes**. Lo que sí se validó:

- `npm install` + `npm run typecheck` (`tsc --noEmit`) en los 4 servicios: compilan sin errores.
- `npm run build` en `intake-triage`: confirma que `dist/handler.js` queda en la raíz de
  `dist/` (coincide con el `CMD ["handler.handler"]` del Dockerfile) y `dist/shared/*.js`
  junto a él.

Pendiente para cuando tengas Docker: construir las 4 imágenes, correrlas con el RIE local, y
hacer el primer `build-and-push.sh` real contra tu cuenta AWS.
