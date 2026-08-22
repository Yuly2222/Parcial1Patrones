-- =========================================================================
-- Realtime: el dashboard de operadores se suscribe a estas tablas para
-- refrescarse solo, sin polling (requisito 4.3 del enunciado).
-- =========================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'intake' and tablename = 'solicitudes'
  ) then
    alter publication supabase_realtime add table intake.solicitudes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'dispatch' and tablename = 'despachos'
  ) then
    alter publication supabase_realtime add table dispatch.despachos;
  end if;
end $$;
