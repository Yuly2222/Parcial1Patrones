-- =========================================================================
-- Fase 1 · Migración 6/6
-- Row Level Security: separación estricta Ciudadano vs. Operador vs. Admin.
--
-- Modelo de acceso:
--   - anon           -> solo puede leer core.ciudades (para poblar el
--                        formulario público antes de autenticarse).
--   - authenticated
--       rol=ciudadano -> solo ve/crea SUS PROPIAS solicitudes.
--       rol=operador  -> ve/gestiona solicitudes, cuadrillas y despachos
--                        de SU ciudad asignada; lectura agregada de mapa
--                        (geospatial/notification) en las 4 ciudades.
--       rol=admin     -> coordinación nacional, ve todo.
--   - service_role    -> usado únicamente por los microservicios en Lambda
--                        (clave leída desde Secrets Manager en runtime,
--                        nunca en el frontend). Bypassa RLS por diseño de
--                        Supabase; es la única vía de escritura para
--                        geospatial.* y notification.*.
-- =========================================================================

-- ---------------------------------------------------------------------
-- Funciones auxiliares. SECURITY DEFINER para poder leer core.profiles
-- sin recursión aunque esa tabla también tenga RLS habilitado.
-- ---------------------------------------------------------------------
create or replace function core.rol_actual()
returns text
language sql
security definer
stable
set search_path = core, pg_temp
as $$
  select rol from core.profiles where id = auth.uid();
$$;

create or replace function core.ciudad_actual()
returns text
language sql
security definer
stable
set search_path = core, pg_temp
as $$
  select ciudad_asignada from core.profiles where id = auth.uid();
$$;

-- ============ core.profiles ============
alter table core.profiles enable row level security;

create policy profiles_select on core.profiles
  for select using (id = auth.uid() or core.rol_actual() = 'admin');

create policy profiles_insert_propio on core.profiles
  for insert with check (id = auth.uid());

create policy profiles_update_propio on core.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ============ core.ciudades (catálogo público) ============
alter table core.ciudades enable row level security;

create policy ciudades_select_publico on core.ciudades
  for select using (true);

-- ============ intake.solicitudes ============
alter table intake.solicitudes enable row level security;

create policy solicitudes_insert_propia on intake.solicitudes
  for insert with check (solicitante_id = auth.uid());

create policy solicitudes_select on intake.solicitudes
  for select using (
    solicitante_id = auth.uid()
    or core.rol_actual() = 'admin'
    or (core.rol_actual() = 'operador' and ciudad = core.ciudad_actual())
  );

create policy solicitudes_update_operador on intake.solicitudes
  for update using (
    core.rol_actual() = 'admin'
    or (core.rol_actual() = 'operador' and ciudad = core.ciudad_actual())
  )
  with check (
    core.rol_actual() = 'admin'
    or (core.rol_actual() = 'operador' and ciudad = core.ciudad_actual())
  );

-- Sin policy de DELETE: las solicitudes son append-only (se cancelan
-- cambiando `estado`, nunca se borran) para preservar el registro de auditoría.

-- ============ dispatch.cuadrillas / dispatch.despachos ============
alter table dispatch.cuadrillas enable row level security;
alter table dispatch.despachos enable row level security;

create policy cuadrillas_operador on dispatch.cuadrillas
  for all using (
    core.rol_actual() = 'admin'
    or (core.rol_actual() = 'operador' and ciudad = core.ciudad_actual())
  )
  with check (
    core.rol_actual() = 'admin'
    or (core.rol_actual() = 'operador' and ciudad = core.ciudad_actual())
  );

create policy despachos_operador on dispatch.despachos
  for all using (
    core.rol_actual() = 'admin'
    or (
      core.rol_actual() = 'operador'
      and exists (
        select 1 from intake.solicitudes s
        where s.id = despachos.solicitud_id
          and s.ciudad = core.ciudad_actual()
      )
    )
  )
  with check (
    core.rol_actual() = 'admin'
    or (
      core.rol_actual() = 'operador'
      and exists (
        select 1 from intake.solicitudes s
        where s.id = despachos.solicitud_id
          and s.ciudad = core.ciudad_actual()
      )
    )
  );

-- ============ geospatial.* (lectura agregada, escritura solo service_role) ============
alter table geospatial.clusters_calientes enable row level security;
alter table geospatial.zonas_aisladas enable row level security;

create policy clusters_lectura_operador on geospatial.clusters_calientes
  for select using (core.rol_actual() in ('operador', 'admin'));

create policy zonas_aisladas_lectura_operador on geospatial.zonas_aisladas
  for select using (core.rol_actual() in ('operador', 'admin'));

-- ============ notification.* (lectura operador/admin, escritura solo service_role) ============
alter table notification.suscripciones enable row level security;
alter table notification.eventos enable row level security;

create policy suscripciones_operador on notification.suscripciones
  for select using (core.rol_actual() in ('operador', 'admin'));

create policy eventos_operador on notification.eventos
  for select using (core.rol_actual() in ('operador', 'admin'));

-- =========================================================================
-- GRANTs a nivel de esquema/tabla (RLS solo filtra FILAS; sin estos GRANTs
-- los roles de la API no pueden tocar la tabla en absoluto).
-- =========================================================================
grant usage on schema core to anon, authenticated;
grant usage on schema intake, dispatch, geospatial, notification to authenticated;

grant select on core.ciudades to anon, authenticated;
grant select, insert, update on core.profiles to authenticated;

grant select, insert, update on intake.solicitudes to authenticated;

grant select, insert, update, delete on dispatch.cuadrillas to authenticated;
grant select, insert, update, delete on dispatch.despachos to authenticated;

grant select on geospatial.clusters_calientes to authenticated;
grant select on geospatial.zonas_aisladas to authenticated;

grant select on notification.suscripciones to authenticated;
grant select on notification.eventos to authenticated;
