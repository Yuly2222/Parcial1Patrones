-- =========================================================================
-- Fase 1 · Migración 2/6
-- Service 1: Intake & Triage — tabla maestra de solicitudes de emergencia.
--
-- Las 4 tipologías del enunciado (USAR/Médica, Albergue, Suministros,
-- Evaluación de Daños) comparten esta tabla: la ubicación y los campos
-- comunes son columnas propias, y los campos específicos de cada tipo
-- viven en `datos_criticos` (jsonb), validados por trigger.
-- =========================================================================

create type intake.tipo_solicitud as enum (
  'usar_rescate',      -- Búsqueda y Rescate Urbano (USAR) / Emergencia Médica
  'albergue',           -- Albergue y Refugio Temporal
  'suministros',        -- Suministros Básicos y Asistencia Humanitaria
  'evaluacion_danos'    -- Evaluación de Daños Estructurales
);

create type intake.prioridad as enum ('P1', 'P2', 'P3', 'P4');

create type intake.estado_solicitud as enum (
  'recibida',
  'en_triage',
  'despachada',
  'en_atencion',
  'resuelta',
  'cancelada',
  'duplicada'
);

create table intake.solicitudes (
  id uuid primary key default gen_random_uuid(),
  tipo intake.tipo_solicitud not null,
  prioridad intake.prioridad,
  estado intake.estado_solicitud not null default 'recibida',
  ciudad text not null references core.ciudades (nombre),
  ubicacion geography(point, 4326) not null,
  solicitante_id uuid not null references auth.users (id),
  descripcion text,
  datos_criticos jsonb not null default '{}'::jsonb,
  hash_deduplicacion text,
  duplicado_de uuid references intake.solicitudes (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table intake.solicitudes is
  'Tabla maestra del Service 1. Los otros servicios (dispatch, geospatial, '
  'notification) solo la referencian en modo lectura por FK/consulta, nunca escriben en ella.';
comment on column intake.solicitudes.datos_criticos is
  'Campos específicos por tipo (ver required-keys en intake.aplicar_reglas_triage()). '
  'Ej. usar_rescate: {personas_afectadas, condiciones_riesgo}; '
  'albergue: {conteo_damnificados, estado_habitabilidad}; '
  'suministros: {categoria_insumo}; '
  'evaluacion_danos: {tipo_edificacion, nivel_agrietamiento}.';
comment on column intake.solicitudes.hash_deduplicacion is
  'Huella (solicitante+tipo+ciudad+ubicación redondeada) calculada por trigger para '
  'detectar solicitudes duplicadas durante picos de tráfico concurrente.';

create index solicitudes_ciudad_idx on intake.solicitudes (ciudad);
create index solicitudes_estado_idx on intake.solicitudes (estado);
create index solicitudes_prioridad_idx on intake.solicitudes (prioridad);
create index solicitudes_solicitante_idx on intake.solicitudes (solicitante_id);
create index solicitudes_ubicacion_gix on intake.solicitudes using gist (ubicacion);
create index solicitudes_dedup_idx on intake.solicitudes (hash_deduplicacion, created_at);

create trigger set_updated_at
  before update on intake.solicitudes
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------
-- Reglas de negocio determinísticas del Service 1:
--   1) Prioridad por defecto según tipo (si el cliente no la envía explícita).
--   2) Validación de integridad del payload (claves obligatorias por tipo).
--   3) Deduplicación suave contra picos de tráfico duplicado.
-- ---------------------------------------------------------------------
create or replace function intake.aplicar_reglas_triage()
returns trigger
language plpgsql
as $$
declare
  claves_requeridas text[];
  clave text;
  id_existente uuid;
begin
  if new.prioridad is null then
    new.prioridad := case new.tipo
      when 'usar_rescate'      then 'P1'
      when 'albergue'          then 'P2'
      when 'suministros'       then 'P3'
      when 'evaluacion_danos'  then 'P4'
    end;
  end if;

  claves_requeridas := case new.tipo
    when 'usar_rescate'     then array['personas_afectadas', 'condiciones_riesgo']
    when 'albergue'         then array['conteo_damnificados', 'estado_habitabilidad']
    when 'suministros'      then array['categoria_insumo']
    when 'evaluacion_danos' then array['tipo_edificacion', 'nivel_agrietamiento']
  end;

  foreach clave in array claves_requeridas loop
    if not (new.datos_criticos ? clave) then
      raise exception 'datos_criticos incompleto para tipo "%": falta la clave "%"', new.tipo, clave
        using errcode = '23514';
    end if;
  end loop;

  new.hash_deduplicacion := md5(
    new.tipo::text || '|' || new.ciudad || '|' || new.solicitante_id::text || '|' ||
    round(st_x(new.ubicacion::geometry)::numeric, 4)::text || '|' ||
    round(st_y(new.ubicacion::geometry)::numeric, 4)::text
  );

  if tg_op = 'INSERT' then
    select id into id_existente
    from intake.solicitudes
    where hash_deduplicacion = new.hash_deduplicacion
      and estado not in ('cancelada', 'duplicada')
      and created_at > now() - interval '30 minutes'
    limit 1;

    if id_existente is not null then
      new.estado := 'duplicada';
      new.duplicado_de := id_existente;
    end if;
  end if;

  return new;
end;
$$;

comment on function intake.aplicar_reglas_triage() is
  'Cálculo determinístico de severidad por defecto + validación de payload + '
  'deduplicación suave (marca como duplicada en vez de rechazar, para trazabilidad).';

create trigger aplicar_reglas_triage
  before insert or update of tipo, datos_criticos, ubicacion, ciudad, solicitante_id
  on intake.solicitudes
  for each row execute function intake.aplicar_reglas_triage();
