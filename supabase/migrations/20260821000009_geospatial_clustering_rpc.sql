-- =========================================================================
-- Fase 2 · Service 3 (Geospatial & Zone Aggregation)
-- Clustering geoespacial (ST_ClusterDBSCAN) de solicitudes activas, por
-- ciudad, para detectar puntos calientes de colapso.
--
-- NOTA de precisión: ST_ClusterDBSCAN opera sobre `geometry`, no `geography`,
-- así que `eps` está en las unidades del SRID de la geometría (grados, para
-- SRID 4326). Se aproxima 1° ≈ 111.32 km (válido cerca del ecuador). Para
-- precisión métrica exacta en producción, se debería reproyectar a un SRID
-- planar local (ej. EPSG:3116 para Colombia) antes de clusterizar — se deja
-- fuera de alcance de este entregable por simplicidad.
-- =========================================================================

create or replace function geospatial.recalcular_clusters(
  p_ciudad text default null,
  p_radio_metros numeric default 500,
  p_min_puntos int default 3
)
returns setof geospatial.clusters_calientes
language plpgsql
set search_path = geospatial, intake, core, pg_temp
as $$
declare
  v_ciudad record;
begin
  for v_ciudad in
    select nombre from core.ciudades where p_ciudad is null or nombre = p_ciudad
  loop
    return query
    insert into geospatial.clusters_calientes (ciudad, centro, radio_metros, cantidad_solicitudes, prioridad_dominante)
    select
      v_ciudad.nombre,
      st_centroid(st_collect(puntos.ubicacion_geom))::geography as centro,
      p_radio_metros,
      count(*)::int as cantidad_solicitudes,
      mode() within group (order by puntos.prioridad) as prioridad_dominante
    from (
      select
        s.ubicacion::geometry as ubicacion_geom,
        s.prioridad,
        st_clusterdbscan(s.ubicacion::geometry, eps := p_radio_metros / 111320.0, minpoints := p_min_puntos)
          over () as cluster_id
      from intake.solicitudes s
      where s.ciudad = v_ciudad.nombre
        and s.estado not in ('resuelta', 'cancelada', 'duplicada')
    ) puntos
    where puntos.cluster_id is not null
    group by puntos.cluster_id
    returning *;
  end loop;
end;
$$;

comment on function geospatial.recalcular_clusters(text, numeric, int) is
  'Recalcula puntos calientes (DBSCAN) sobre intake.solicitudes activas, por ciudad. '
  'Append-only: cada corrida inserta una nueva foto en vez de actualizar en el lugar.';

grant execute on function geospatial.recalcular_clusters(text, numeric, int) to service_role;
