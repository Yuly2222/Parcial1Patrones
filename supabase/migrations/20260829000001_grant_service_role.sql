-- Fix: los schemas custom (core, intake, dispatch, geospatial, notification)
-- nunca recibieron GRANT explícito para service_role. BYPASSRLS (que sí tiene
-- service_role) evita las políticas de RLS, pero no reemplaza el GRANT de
-- acceso a nivel de schema/tabla — son mecanismos independientes en Postgres.
-- Sin esto, los microservicios en Lambda (que usan la Service Role Key)
-- reciben "permission denied" al leer/escribir estas tablas.

grant usage on schema core, intake, dispatch, geospatial, notification to service_role;

grant select, insert, update, delete on all tables in schema core to service_role;
grant select, insert, update, delete on all tables in schema intake to service_role;
grant select, insert, update, delete on all tables in schema dispatch to service_role;
grant select, insert, update, delete on all tables in schema geospatial to service_role;
grant select, insert, update, delete on all tables in schema notification to service_role;

-- Para que las tablas que se creen más adelante en estos schemas también
-- queden accesibles a service_role sin tener que repetir este GRANT a mano.
alter default privileges in schema core grant select, insert, update, delete on tables to service_role;
alter default privileges in schema intake grant select, insert, update, delete on tables to service_role;
alter default privileges in schema dispatch grant select, insert, update, delete on tables to service_role;
alter default privileges in schema geospatial grant select, insert, update, delete on tables to service_role;
alter default privileges in schema notification grant select, insert, update, delete on tables to service_role;
