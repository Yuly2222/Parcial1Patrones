# Fase 1 — Modelado de Dominio y Base de Datos

Implementa el punto 4.3 y la Fase 1 del enunciado: diagrama entidad-relación en Supabase
con soporte geoespacial, políticas RLS y migraciones reproducibles.

## Decisiones de diseño

- **Un esquema de Postgres por microservicio** (`intake`, `dispatch`, `geospatial`,
  `notification`) en vez de una única tabla `public` gigante. Esto es lo que el enunciado
  pide como "esquemas desacoplados... para respetar el principio de autonomía de
  microservicios": aunque los 4 servicios comparten una sola instancia física de Supabase
  (una base de datos gratis por equipo), cada Lambda se conecta en producción con
  credenciales propias (leídas desde Secrets Manager, Fase 2) que solo tienen privilegios
  sobre su propio esquema — la separación lógica es real, no solo cosmética.
- **`core`** guarda lo que todos los servicios necesitan leer: el catálogo de las 4 ciudades
  y el rol de cada usuario autenticado (`ciudadano` / `operador` / `admin`).
- **`intake.solicitudes` es una sola tabla para las 4 tipologías** (USAR/Médica, Albergue,
  Suministros, Daños Estructurales) con un discriminador `tipo` y los campos específicos de
  cada tipo en `datos_criticos jsonb`, validados por trigger (`intake.aplicar_reglas_triage`).
  Alternativa considerada: 4 tablas separadas — se descartó porque el 90% de las columnas
  (ubicación, prioridad, estado, ciudad, solicitante) son idénticas entre tipos, y una tabla
  única simplifica el clustering geoespacial del Service 3 (una sola fuente para las 4
  tipologías a la vez).
- **PostGIS (`geography(Point,4326)`)** en `ubicacion`/`ubicacion_actual`/`centro` para
  soportar cálculos de radio y proximidad (`ST_DWithin`, `ST_Distance`) que pide el punto 4.3.
- **Deduplicación suave**: el trigger de `intake.solicitudes` calcula una huella
  (solicitante + tipo + ciudad + ubicación redondeada a ~11 m) y, si encuentra una solicitud
  viva con la misma huella en los últimos 30 minutos, marca la nueva como `duplicada` en vez
  de rechazarla. Esto ataca directamente el problema descrito en el enunciado ("solicitudes
  duplicadas" durante picos de tráfico) sin perder el registro para auditoría.
- **Append-only en `intake.solicitudes` y `geospatial.clusters_calientes`**: no hay política
  de `DELETE`. Las solicitudes se cancelan cambiando `estado`, nunca se borran — es un
  registro de auditoría de una emergencia real.

## Diagrama entidad-relación

```mermaid
erDiagram
    auth_users ||--|| core_profiles : extiende
    core_ciudades ||--o{ core_profiles : asigna
    auth_users ||--o{ intake_solicitudes : reporta
    core_ciudades ||--o{ intake_solicitudes : ubica
    intake_solicitudes ||--o{ intake_solicitudes : duplica_de
    intake_solicitudes ||--o| dispatch_despachos : genera
    dispatch_cuadrillas ||--o{ dispatch_despachos : atiende
    core_ciudades ||--o{ dispatch_cuadrillas : ubica
    intake_solicitudes ||--o{ notification_eventos : dispara
    core_ciudades ||--o{ geospatial_clusters_calientes : agrupa
    core_ciudades ||--o{ geospatial_zonas_aisladas : contiene

    core_ciudades {
        text nombre PK
        text departamento
        boolean activa
    }
    core_profiles {
        uuid id PK_FK
        text rol
        text ciudad_asignada FK
        text organismo
    }
    intake_solicitudes {
        uuid id PK
        enum tipo
        enum prioridad
        enum estado
        text ciudad FK
        geography ubicacion
        uuid solicitante_id FK
        jsonb datos_criticos
        text hash_deduplicacion
        uuid duplicado_de FK
    }
    dispatch_cuadrillas {
        uuid id PK
        text organismo
        text ciudad FK
        geography ubicacion_actual
        enum estado
    }
    dispatch_despachos {
        uuid id PK
        uuid solicitud_id FK
        uuid cuadrilla_id FK
        enum estado
    }
    geospatial_clusters_calientes {
        uuid id PK
        text ciudad FK
        geography centro
        int cantidad_solicitudes
    }
    geospatial_zonas_aisladas {
        uuid id PK
        text ciudad FK
        geography area
    }
    notification_eventos {
        uuid id PK
        uuid solicitud_id FK
        text tipo_evento
        enum estado
    }
```

## Modelo de acceso (RLS)

| Rol | `intake.solicitudes` | `dispatch.*` | `geospatial.*` / `notification.*` |
|---|---|---|---|
| `anon` (sin login) | sin acceso | sin acceso | sin acceso |
| `ciudadano` | solo sus propias solicitudes (select/insert) | sin acceso | sin acceso |
| `operador` | solo las de su `ciudad_asignada` (select/update) | solo su ciudad | lectura de las 4 ciudades (mapa de comando) |
| `admin` | todas | todas | todas |
| `service_role` (Lambda) | bypassa RLS — único rol que escribe en `geospatial.*`/`notification.*` | bypassa RLS | bypassa RLS |

La `service_role` key **nunca** se usa desde el frontend: vive solo en el backend (Lambda),
leída en runtime desde Secrets Manager (Fase 2 del taller, punto 4.5 del enunciado). Desde
Vercel, el frontend solo usa la `anon` key pública + el JWT de sesión del usuario, así que
todo lo que un ciudadano u operador ve pasa siempre por estas policies.

## Cómo ejecutar y verificar

Requiere [Docker Desktop](https://www.docker.com/products/docker-desktop/) corriendo (el
CLI de Supabase levanta Postgres+PostGIS+Auth+Realtime en contenedores locales).

```bash
npx supabase start
```

Esto aplica todas las migraciones de `supabase/migrations/` y el `seed.sql` sobre una base
local. Studio queda disponible en `http://localhost:54323` para inspeccionar tablas, RLS y
correr queries de prueba.

Para reaplicar migraciones desde cero (útil tras editar un archivo):

```bash
npx supabase db reset
```

Para verificar RLS manualmente en el SQL editor de Studio, usa `set role authenticated;` +
`set request.jwt.claims = '{"sub":"<uuid>"}';` simulando cada rol, o crea usuarios reales
vía Auth y prueba con la `anon` key desde un cliente (`@supabase/supabase-js`).

### Contra el proyecto real de Supabase (una vez creado en supabase.com)

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

`db push` es idempotente y reproducible: aplica solo las migraciones que el proyecto remoto
aún no tiene, en orden. **`seed.sql` no se ejecuta con `db push`** (solo aplica local); los
datos de ciudades ya quedan sembrados por estar dentro de una migración (`...0001...sql`).

## Pendiente para fases siguientes (no es parte de la Fase 1)

- Los 4 microservicios (Lambda) deben conectarse con un rol de Postgres propio y acotado a
  su esquema (hoy los GRANTs están sobre `authenticated`/`anon`, que son los roles que usa
  PostgREST para el tráfico del frontend; la conexión directa de cada Lambda a Postgres para
  lógica interna pesada, si aplica, se resuelve en la Fase 2 con su propio usuario de DB).
- El cálculo real de triage/clustering (el trigger de aquí solo pone una prioridad *por
  defecto* determinística; el algoritmo de negocio más sofisticado vive en el Service 1/3).
