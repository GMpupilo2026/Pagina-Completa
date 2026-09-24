-- 150 políticas de RLS llamaban a auth.uid() tal cual, y Postgres la evalúa
-- UNA VEZ POR FILA (el aviso auth_rls_initplan de Supabase). Envuelta como
-- (select auth.uid()) se evalúa una vez por consulta (initPlan): el mismo
-- valor, sin el costo por fila. Es la misma lección que tumbó el informe con
-- 7000 filas (ver «La RLS de las tablas de actividad arma el conjunto UNA
-- vez»), en su versión más barata.
--
-- No se reescribe ninguna política a mano: el bloque lee cada definición de
-- pg_policies y solo cambia `auth.uid()` por `(select auth.uid())`, dejando
-- como están las que ya venían envueltas. Después se comprueba a sí mismo:
-- desenvolviendo la versión nueva tiene que quedar EXACTAMENTE la vieja; si
-- una sola no cuadra, se lanza un error y no se aplica ninguna.
--
-- Queda fuera storage.objects: esa tabla es de Supabase (su dueño es
-- supabase_storage_admin) y sus políticas no se pueden alterar desde acá.
do $$
declare
  r record;
  envuelta constant text := '( SELECT auth.uid() AS uid)';
  nq text; nw text; ahora record; n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (replace(coalesce(qual, ''), envuelta, '') || replace(coalesce(with_check, ''), envuelta, '')) like '%auth.uid()%'
  loop
    nq := replace(replace(replace(r.qual, envuelta, chr(1)), 'auth.uid()', '(select auth.uid())'), chr(1), envuelta);
    nw := replace(replace(replace(r.with_check, envuelta, chr(1)), 'auth.uid()', '(select auth.uid())'), chr(1), envuelta);
    execute format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
         || coalesce(' using (' || nq || ')', '')
         || coalesce(' with check (' || nw || ')', '');

    select qual, with_check into ahora from pg_policies
     where schemaname = r.schemaname and tablename = r.tablename and policyname = r.policyname;
    if replace(coalesce(ahora.qual, ''), envuelta, 'auth.uid()') is distinct from replace(coalesce(r.qual, ''), envuelta, 'auth.uid()')
       or replace(coalesce(ahora.with_check, ''), envuelta, 'auth.uid()') is distinct from replace(coalesce(r.with_check, ''), envuelta, 'auth.uid()')
       or (coalesce(ahora.qual, '') || coalesce(ahora.with_check, '')) ~ '(?<!SELECT )auth\.uid\(\)' then
      raise exception 'La política % de % cambió algo más que auth.uid(): antes «%» / «%», ahora «%» / «%»',
        r.policyname, r.tablename, r.qual, r.with_check, ahora.qual, ahora.with_check;
    end if;
    n := n + 1;
  end loop;
  raise notice 'políticas envueltas: %', n;
end $$;