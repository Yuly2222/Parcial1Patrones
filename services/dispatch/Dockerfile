# syntax=docker/dockerfile:1
#
# Contexto de build = services/ (no esta carpeta):
#   docker build -f services/dispatch/Dockerfile -t dispatch services/

# ---------- Etapa 1: compilar TypeScript ----------
FROM node:20-alpine AS build
WORKDIR /build
COPY dispatch/package.json dispatch/package-lock.json* ./
RUN npm ci
COPY _shared ./src/shared
COPY dispatch/src ./src
COPY dispatch/tsconfig.json ./
RUN npm run build

# ---------- Etapa 2: dependencias de producción únicamente (sin devDeps/TS) ----------
FROM node:20-alpine AS deps
WORKDIR /build
COPY dispatch/package.json dispatch/package-lock.json* ./
RUN npm ci --omit=dev

# ---------- Etapa 3: imagen final de Lambda (mínima) ----------
FROM public.ecr.aws/lambda/nodejs:20
COPY --from=deps /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=build /build/dist/ ${LAMBDA_TASK_ROOT}/
CMD ["handler.handler"]
