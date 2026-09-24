-- 54 claves foráneas de public no tenían índice (el aviso unindexed_foreign_keys
-- de Supabase). Sin índice, borrar una cuenta obliga a recorrer ENTERA cada
-- tabla que la nombra (created_by, creado_por, student_id…) para ver si hay
-- que cascadear o poner null, y los filtros por esa columna también la
-- recorren. Hoy todas son chicas (menos de 200 filas), así que cuesta casi
-- nada; es para que no se note el día que crezcan.
--
-- No se escribe la lista a mano: el bloque busca en el catálogo las claves
-- foráneas cuyas columnas no encabezan ningún índice y le crea uno a cada una,
-- con nombre <tabla>_<columnas>_fk (recortado a 63). Corrido otra vez no hace
-- nada.
do $$
declare
  r record; nombre text; n int := 0;
begin
  for r in
    select c.conrelid, t.relname as tabla,
           array_agg(a.attname order by k.ord) as cols
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace ns on ns.oid = t.relnamespace
      cross join lateral unnest(c.conkey) with ordinality k(num, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num
     where c.contype = 'f' and ns.nspname = 'public'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
            and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)
     group by c.oid, c.conrelid, t.relname
  loop
    nombre := left(r.tabla || '_' || array_to_string(r.cols, '_') || '_fk', 63);
    execute format('create index if not exists %I on public.%I (%s)', nombre, r.tabla,
                   (select string_agg(format('%I', x), ', ') from unnest(r.cols) x));
    n := n + 1;
  end loop;
  raise notice 'índices creados: %', n;
end $$;