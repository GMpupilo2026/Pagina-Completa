-- Los planes que otros profesores comparten conmigo, CON el nombre de quien los
-- escribió. Hace falta una función porque la RLS de profiles no le deja a un
-- profesor ver a sus colegas: la lista saldría con planes sin autor, que es
-- justo el dato que dice si vale la pena abrirlo.
--
-- Es SECURITY DEFINER, así que el permiso va ESCRITO acá adentro y repite lo que
-- dice la política de planes_clase: compartido con todo el equipo docente (y yo
-- soy del equipo), o compartido conmigo en particular.
create or replace function public.planes_compartidos_conmigo()
returns table (
    id uuid,
    profesor_id uuid,
    autor text,
    titulo text,
    notas text,
    compartido_todos boolean,
    created_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select p.id,
           p.profesor_id,
           coalesce(nullif(trim(a.full_name), ''), a.email) as autor,
           p.titulo,
           p.notas,
           p.compartido_todos,
           p.created_at,
           p.updated_at
    from public.planes_clase p
    join public.profiles a on a.id = p.profesor_id
    where p.profesor_id <> auth.uid()
      and public.es_del_equipo_docente(auth.uid())
      and (
          p.compartido_todos
          or exists (
              select 1 from public.plan_compartidos c
              where c.plan_id = p.id and c.profesor_id = auth.uid()
          )
      )
    order by p.updated_at desc;
$$;

revoke all on function public.planes_compartidos_conmigo() from anon;
grant execute on function public.planes_compartidos_conmigo() to authenticated;