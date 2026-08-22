-- =========================================================================
-- Fase 1 · Migración 4/6
-- Service 3: Geospatial & Zone Aggregation.
--
-- Tablas de solo-agregación (append-only): el microservicio recalcula
-- periódicamente clusters y zonas aisladas a partir de intake.solicitudes
-- y las inserta aquí usando la Service Role Key (bypassa RLS). El frontend
-- las consume en solo-lectura para el mapa de comando.
-- =========================================================================

create table geospatial.clusters_calientes (
  id uuid primary key default gen_random_uuid(),
  ciudad text not null references core.ciudades (nombre),
  centro geography(point, 4326) not null,
  radio_metros numeric not null check (radio_metros > 0),
  cantidad_solicitudes int not null check (cantidad_solicitudes > 0),
  prioridad_dominante intake.prioridad,
  calculado_en timestamptz not null default now()
);

comment on table geospatial.clusters_calientes is
  'Resultado del clustering periódico (puntos calientes de colapso). Append-only: '
  'cada corrida inserta una nueva foto en vez de actualizar en el lugar, para '
  'conservar histórico de evolución de la emergencia.';

create index clusters_ciudad_idx on geospatial.clusters_calientes (ciudad);
create index clusters_centro_gix on geospatial.clusters_calientes using gist (centro);

create table geospatial.zonas_aisladas (
  id uuid primary key default gen_random_uuid(),
  ciudad text not null references core.ciudades (nombre),
  area geography(polygon, 4326) not null,
  motivo text not null,
  detectado_en timestamptz not null default now(),
  resuelto_en timestamptz
);

comment on table geospatial.zonas_aisladas is 'Zonas detectadas como aisladas/sin cobertura de respuesta.';

create index zonas_aisladas_ciudad_idx on geospatial.zonas_aisladas (ciudad);
create index zonas_aisladas_area_gix on geospatial.zonas_aisladas using gist (area);
