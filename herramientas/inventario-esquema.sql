-- El retrato del esquema de la Academia: supabase/esquema/inventario-academia.txt.
--
-- No restaura nada. Sirve para comprobar, DESPUÉS de restaurar desde las
-- migraciones, que no falte ninguna tabla, política, función o permiso: si
-- falta una política nadie se entera hasta que a alguien se le abre algo que
-- no debía, o se le cierra algo que sí.
--
-- Se corre en el proyecto de la Academia (el SQL editor de Supabase o
-- execute_sql) y lo que devuelve, línea por línea, va al archivo debajo de su
-- cabecera. La cabecera dice con qué migración está al día, y
-- verificar-punto-restauracion.js falla si hay migraciones más nuevas:
-- un retrato viejo es peor que ninguno, porque se le cree.
--
-- `public` va sin prefijo; `interno` (donde viven alumnos_de() y compañía)
-- con el suyo.
with obj as (
  select 1 o, 'tabla' t,
         (case when n.nspname = 'public' then '' else n.nspname || '.' end) || c.relname || '  rls=' || c.relrowsecurity l
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'interno') and c.relkind in ('r', 'p')
  union all
  select 2, 'columna',
         (case when n.nspname = 'public' then '' else n.nspname || '.' end) || c.relname || '.' || a.attname || '  ' || format_type(a.atttypid, a.atttypmod)
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'interno') and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  union all
  select 3, 'vista', (case when n.nspname = 'public' then '' else n.nspname || '.' end) || c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'interno') and c.relkind in ('v', 'm')
  union all
  select 4, 'funcion',
         (case when n.nspname = 'public' then '' else n.nspname || '.' end) || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')  '
         || case when p.prosecdef then 'definer' else 'invoker' end
         || '  anon=' || has_function_privilege('anon', p.oid, 'execute')
         || '  auth=' || has_function_privilege('authenticated', p.oid, 'execute')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'interno') and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 5, 'politica',
         (case when schemaname = 'public' then '' else schemaname || '.' end) || tablename || '  ' || policyname || '  ' || cmd
         || case when permissive = 'RESTRICTIVE' then '  restrictiva' else '' end
    from pg_policies where schemaname in ('public', 'interno')
  union all
  select 6, 'trigger', (case when n.nspname = 'public' then '' else n.nspname || '.' end) || c.relname || '  ' || tg.tgname
    from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'interno') and not tg.tgisinternal
  union all
  select 7, 'indice', (case when schemaname = 'public' then '' else schemaname || '.' end) || tablename || '  ' || indexname
    from pg_indexes where schemaname in ('public', 'interno')
  union all
  select 8, 'extension', extname || '  ' || extversion
    from pg_extension where extname <> 'plpgsql'
  union all
  select 9, 'realtime', tablename
    from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  union all
  select 10, 'cron', jobname || '  ' || schedule from cron.job
  union all
  select 11, 'grant',
         (case when table_schema = 'public' then '' else table_schema || '.' end) || table_name || '  ' || grantee || '  ' || privilege_type
    from information_schema.role_table_grants
   where table_schema in ('public', 'interno') and grantee in ('anon', 'authenticated')
)
select t || '  ' || l as linea from obj order by o, l collate "C";
