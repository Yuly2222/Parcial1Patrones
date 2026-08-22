-- =========================================================================
-- Datos de demostración para desarrollo local (`supabase db reset`).
-- NO se ejecuta contra el proyecto hosteado en `supabase db push`.
-- core.ciudades ya se siembra en la migración 20260821000001, aquí solo
-- se agregan cuadrillas de ejemplo para poder probar dispatch/geospatial.
-- =========================================================================

insert into dispatch.cuadrillas (nombre, organismo, ciudad, ubicacion_actual, estado, capacidad_personas) values
  ('Cuadrilla Bomberos Quibdó 1',  'Bomberos',      'Chocó',     st_setsrid(st_makepoint(-76.6413, 5.6947), 4326)::geography, 'disponible', 4),
  ('Cruz Roja Chocó Rural',        'Cruz Roja',     'Chocó',     st_setsrid(st_makepoint(-76.6580, 5.7020), 4326)::geography, 'disponible', 6),
  ('Bomberos Pereira Centro',      'Bomberos',      'Pereira',   st_setsrid(st_makepoint(-75.6961, 4.8133), 4326)::geography, 'disponible', 4),
  ('Defensa Civil Pereira',        'Defensa Civil', 'Pereira',   st_setsrid(st_makepoint(-75.6900, 4.8090), 4326)::geography, 'disponible', 5),
  ('Bomberos Cali Norte',          'Bomberos',      'Cali',      st_setsrid(st_makepoint(-76.5320, 3.4700), 4326)::geography, 'disponible', 4),
  ('UNGRD Cali',                   'UNGRD',         'Cali',      st_setsrid(st_makepoint(-76.5225, 3.4372), 4326)::geography, 'disponible', 8),
  ('Bomberos Manizales Centro',    'Bomberos',      'Manizales', st_setsrid(st_makepoint(-75.5138, 5.0689), 4326)::geography, 'disponible', 4),
  ('Cruz Roja Manizales',          'Cruz Roja',     'Manizales', st_setsrid(st_makepoint(-75.5200, 5.0700), 4326)::geography, 'disponible', 6);

-- ---------------------------------------------------------------------
-- Perfiles de prueba (SOLO entorno local con `supabase start`): crea
-- primero los usuarios de Auth y luego enlaza el rol en core.profiles.
-- No se puede insertar directo en auth.users en un proyecto hosteado.
-- ---------------------------------------------------------------------
-- select id into strict... (ejemplo, requiere crear los usuarios vía
-- `supabase auth` o el Studio local en http://localhost:54323 primero)
--
-- insert into core.profiles (id, rol, ciudad_asignada, organismo, nombre)
-- values ('<uuid-del-usuario-operador-pereira>', 'operador', 'Pereira', 'Bomberos', 'Operador Demo Pereira');
