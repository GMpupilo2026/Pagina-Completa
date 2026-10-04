-- «Agregar a mi calendario» en el panel del alumno.
--
-- Es mi_proxima_clase() con más de una fila: las clases del alumno de los
-- próximos p_dias días (de 1 a 90), con la MISMA regla de qué clase es suya
-- (su subgrupo, o un grupo igual al suyo, de uno de SUS profesores). El
-- horario del profe sigue sin abrírsele: solo sale lo suyo.
create or replace function public.mis_clases_proximas(p_dias integer default 28)
returns table (horario_id uuid, inicio timestamptz, fin timestamptz, titulo text, modalidad text, profesor text)
language sql stable security definer
set search_path to 'public'
as $$
  with yo as (
    select p.id, translate(lower(btrim(coalesce(p.grupo, ''))), 'áéíóúüñ', 'aeiouun') as g
      from public.profiles p
     where p.id = (select auth.uid())
  ),
  mios as (
    select h.id, h.profesor_id, h.titulo
      from public.horario_clases h, yo
     where h.profesor_id in (select interno.profesores_de(yo.id))
       and ((h.subgrupo_id is not null
             and exists (select 1 from public.subgrupo_alumnos sa
                          where sa.subgrupo_id = h.subgrupo_id and sa.alumno_id = yo.id))
         or (h.subgrupo_id is null and h.grupo is not null and yo.g <> ''
             and translate(lower(btrim(h.grupo)), 'áéíóúüñ', 'aeiouun') = yo.g))
  )
  select m.id, o.inicio, o.fin, nullif(btrim(m.titulo), ''), o.modalidad,
         nullif(btrim(pr.full_name), '')
    from mios m
    cross join lateral public.ocurrencias_horario(
      m.profesor_id,
      (now() at time zone 'America/Costa_Rica')::date,
      (now() at time zone 'America/Costa_Rica')::date + least(greatest(coalesce(p_dias, 28), 1), 90)) o
    join public.profiles pr on pr.id = m.profesor_id
   where o.horario_id = m.id
     and o.fin > now()
   order by o.inicio
   limit 200;
$$;
revoke execute on function public.mis_clases_proximas(integer) from public, anon;
grant execute on function public.mis_clases_proximas(integer) to authenticated;
