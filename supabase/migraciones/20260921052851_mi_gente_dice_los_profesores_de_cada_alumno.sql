-- La ficha de coordinación necesita repartir alumnos entre sus profesores, y
-- para eso tiene que saber quiénes son los de cada alumno. Viene en la misma
-- consulta y no en una segunda: bajarse `profile_teachers` para cruzarla en el
-- navegador es la piedra de siempre —PostgREST corta sin avisar— y acá la
-- lista nace pensando en miles.
--
-- Van TODOS sus profesores, no solo los que quien mira coordina: que a un
-- alumno lo lleve además otra profesora es información que hace falta antes de
-- tocarle nada. Cuál de esos se puede quitar lo decide la pantalla, y quién
-- puede de verdad, la Edge Function.
--
-- Cambia la forma de la fila, así que hay que soltarla antes: `create or
-- replace` no puede mover el tipo de retorno.
drop function if exists public.mi_gente(text, text, integer, integer);

create function public.mi_gente(
  p_busqueda text default null,
  p_rol text default null,
  p_limite integer default 50,
  p_desde integer default 0
)
returns table (
  id uuid, full_name text, email text, role text, grupo text,
  es_coordinador boolean, is_admin boolean,
  invitaciones_max integer, invitaciones_usadas integer,
  alumnos integer, subgrupos integer, profesores jsonb, total bigint
)
language sql stable set search_path to ''
as $function$
  with pelado as (
    -- Sin tildes: quien escribe "ramirez" tiene que encontrar a "Ramírez".
    select nullif(lower(translate(coalesce(p_busqueda, ''),
             'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '') as q
  ),
  gente as (
    select p.*
    from public.profiles p, pelado
    where p.id in (select public.gente_de_mi_coordinacion())
      and (p_rol is null or p.role = p_rol)
      and (pelado.q is null
           or lower(translate(coalesce(p.full_name, '') || ' ' || coalesce(p.email, '') || ' ' || coalesce(p.grupo, ''),
                              'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) like '%' || pelado.q || '%')
  )
  select g.id, g.full_name, g.email, g.role, g.grupo,
         g.es_coordinador, g.is_admin, g.invitaciones_max, g.invitaciones_usadas,
         (select count(*)::integer from public.alumnos_de(g.id)) as alumnos,
         (select count(*)::integer from public.subgrupos s where s.profesor_id = g.id) as subgrupos,
         case when g.role = 'alumno' then coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', pr.id,
                    'nombre', coalesce(nullif(btrim(pr.full_name), ''), pr.email))
                  order by coalesce(pr.full_name, pr.email))
           from public.profesores_de(g.id) t
           join public.profiles pr on pr.id = t
         ), '[]'::jsonb) else '[]'::jsonb end as profesores,
         count(*) over () as total
  from gente g
  -- Los profesores primero: son pocos y son por donde se entra a lo demás.
  order by case when g.role = 'profesor' then 0 else 1 end,
           coalesce(g.full_name, g.email)
  limit greatest(1, least(coalesce(p_limite, 50), 200))
  offset greatest(0, coalesce(p_desde, 0));
$function$;