-- =========================================================================
-- Fase 2 · Service 2 (Dispatch)
-- Asignación atómica de la cuadrilla disponible más cercana.
--
-- Se modela como función SQL (no como lógica en el Lambda) por dos razones:
--   1) El ranking por distancia (ST_Distance/ST_DWithin) es responsabilidad
--      natural de Postgres/PostGIS, no de traer todas las cuadrillas al
--      Lambda para ordenarlas en memoria.
--   2) "FOR UPDATE SKIP LOCKED" hace la selección+reserva de cuadrilla
--      atómica: bajo picos de tráfico concurrente (el escenario del
--      enunciado), dos solicitudes de despacho en paralelo nunca pueden
--      terminar asignando la misma cuadrilla dos veces.
-- =========================================================================

create or replace function dispatch.asignar_cuadrilla_cercana(
  p_solicitud_id uuid,
  p_radio_km numeric default 50
)
returns dispatch.despachos
language plpgsql
set search_path = dispatch, intake, public, pg_temp
as $$
declare
  v_solicitud intake.solicitudes%rowtype;
  v_cuadrilla dispatch.cuadrillas%rowtype;
  v_despacho dispatch.despachos%rowtype;
begin
  select * into v_solicitud from intake.solicitudes where id = p_solicitud_id;
  if not found then
    raise exception 'Solicitud % no existe', p_solicitud_id using errcode = 'P0002';
  end if;

  if exists (
    select 1 from dispatch.despachos
    where solicitud_id = p_solicitud_id and estado not in ('completado', 'cancelado')
  ) then
    raise exception 'La solicitud % ya tiene un despacho activo', p_solicitud_id using errcode = '23505';
  end if;

  select * into v_cuadrilla
  from dispatch.cuadrillas
  where ciudad = v_solicitud.ciudad
    and estado = 'disponible'
    and st_dwithin(ubicacion_actual, v_solicitud.ubicacion, (p_radio_km * 1000)::double precision)
  order by st_distance(ubicacion_actual, v_solicitud.ubicacion)
  limit 1
  for update skip locked;

  if not found then
    raise exception 'No hay cuadrillas disponibles en % dentro de % km', v_solicitud.ciudad, p_radio_km
      using errcode = 'P0003';
  end if;

  update dispatch.cuadrillas set estado = 'en_ruta' where id = v_cuadrilla.id;

  insert into dispatch.despachos (solicitud_id, cuadrilla_id, estado, distancia_km)
  values (
    p_solicitud_id,
    v_cuadrilla.id,
    'asignado',
    round((st_distance(v_cuadrilla.ubicacion_actual, v_solicitud.ubicacion) / 1000)::numeric, 2)
  )
  returning * into v_despacho;

  update intake.solicitudes set estado = 'despachada' where id = p_solicitud_id;

  return v_despacho;
end;
$$;

comment on function dispatch.asignar_cuadrilla_cercana(uuid, numeric) is
  'Asigna atómicamente la cuadrilla disponible más cercana (misma ciudad, dentro de p_radio_km) '
  'a una solicitud, evitando doble-asignación bajo concurrencia (FOR UPDATE SKIP LOCKED).';

grant execute on function dispatch.asignar_cuadrilla_cercana(uuid, numeric) to service_role;
