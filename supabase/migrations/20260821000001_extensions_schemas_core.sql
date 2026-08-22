-- =========================================================================
-- Fase 1 · Migración 1/6
-- Extensiones, esquemas por microservicio y datos de referencia compartidos.
--
-- Cada microservicio del taller es dueño de su propio esquema de Postgres
-- (intake, dispatch, geospatial, notification). Esto respeta el principio
-- de autonomía de microservicios pedido en el enunciado (4.3) sin necesidad
-- de 4 bases de datos físicas separadas: en producción, cada Lambda se
-- conecta con credenciales (leídas desde Secrets Manager) que solo tienen
-- privilegios sobre su propio esquema (ver GRANTs en la migración 6).
-- =========================================================================

create extension if not exists postgis;

create schema if not exists core;         -- Datos de referencia compartidos (ciudades, perfiles/roles)
create schema if not exists intake;       -- Service 1: Intake & Triage
create schema if not exists dispatch;     -- Service 2: Dispatch & Resource Assignment
create schema if not exists geospatial;   -- Service 3: Geospatial & Zone Aggregation
create schema if not exists notification; -- Service 4: Notification & Status Broadcast

comment on schema core is 'Datos de referencia compartidos entre los 4 microservicios (solo lectura para los servicios, salvo profiles).';
comment on schema intake is 'Propiedad exclusiva del Service 1 (Intake & Triage). Los demás servicios solo deben leer, nunca escribir aquí.';
comment on schema dispatch is 'Propiedad exclusiva del Service 2 (Dispatch & Resource Assignment).';
comment on schema geospatial is 'Propiedad exclusiva del Service 3 (Geospatial & Zone Aggregation).';
comment on schema notification is 'Propiedad exclusiva del Service 4 (Notification & Status Broadcast).';

-- Trigger genérico de "updated_at", reutilizado por todos los esquemas.
create or replace function core.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- core.ciudades: catálogo de los 4 nodos geográficos afectados.
-- ---------------------------------------------------------------------
create table core.ciudades (
  nombre text primary key,
  departamento text not null,
  activa boolean not null default true
);

comment on table core.ciudades is 'Catálogo de los 4 nodos geográficos afectados por la emergencia.';

insert into core.ciudades (nombre, departamento) values
  ('Chocó', 'Chocó'),
  ('Pereira', 'Risaralda'),
  ('Cali', 'Valle del Cauca'),
  ('Manizales', 'Caldas')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- core.profiles: extiende auth.users con el rol de negocio.
-- ---------------------------------------------------------------------
create table core.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  rol text not null check (rol in ('ciudadano', 'operador', 'admin')),
  ciudad_asignada text references core.ciudades (nombre),
  organismo text check (organismo in ('Cruz Roja', 'Bomberos', 'Defensa Civil', 'UNGRD')),
  nombre text,
  telefono text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operador_requiere_contexto check (
    rol <> 'operador' or ciudad_asignada is not null or organismo is not null
  )
);

comment on table core.profiles is
  'Rol de cada usuario autenticado: ciudadano (reporta emergencias) u operador '
  '(gestiona una ciudad/organismo). rol=admin ve todas las ciudades (coordinación nacional).';

create trigger set_updated_at
  before update on core.profiles
  for each row execute function core.set_updated_at();
