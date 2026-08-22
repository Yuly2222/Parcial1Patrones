-- =========================================================================
-- Fase 1 · Migración 3/6
-- Service 2: Dispatch & Resource Assignment.
-- =========================================================================

create type dispatch.estado_cuadrilla as enum (
  'disponible', 'en_ruta', 'ocupada', 'fuera_de_servicio'
);

create type dispatch.estado_despacho as enum (
  'asignado', 'en_camino', 'en_sitio', 'completado', 'cancelado'
);

create table dispatch.cuadrillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  organismo text not null check (organismo in ('Cruz Roja', 'Bomberos', 'Defensa Civil', 'UNGRD')),
  ciudad text not null references core.ciudades (nombre),
  ubicacion_actual geography(point, 4326),
  estado dispatch.estado_cuadrilla not null default 'disponible',
  capacidad_personas int not null default 1 check (capacidad_personas > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table dispatch.cuadrillas is 'Unidades de rescate/cuadrillas disponibles por ciudad y organismo.';

create index cuadrillas_ciudad_idx on dispatch.cuadrillas (ciudad);
create index cuadrillas_estado_idx on dispatch.cuadrillas (estado);
create index cuadrillas_ubicacion_gix on dispatch.cuadrillas using gist (ubicacion_actual);

create trigger set_updated_at
  before update on dispatch.cuadrillas
  for each row execute function core.set_updated_at();

create table dispatch.despachos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references intake.solicitudes (id),
  cuadrilla_id uuid references dispatch.cuadrillas (id),
  estado dispatch.estado_despacho not null default 'asignado',
  distancia_km numeric,
  asignado_en timestamptz not null default now(),
  completado_en timestamptz,
  notas text,
  constraint completado_tiene_fecha check (
    estado <> 'completado' or completado_en is not null
  )
);

comment on table dispatch.despachos is
  'Propiedad del Service 2. Referencia intake.solicitudes solo en lectura: '
  'este servicio nunca debe escribir en el esquema intake.';

create index despachos_solicitud_idx on dispatch.despachos (solicitud_id);
create index despachos_cuadrilla_idx on dispatch.despachos (cuadrilla_id);

-- Invariante: una solicitud solo puede tener un despacho activo a la vez
-- (evita doble asignación de cuadrillas sobre la misma emergencia).
create unique index despachos_solicitud_activo_uidx on dispatch.despachos (solicitud_id)
  where estado not in ('completado', 'cancelado');
