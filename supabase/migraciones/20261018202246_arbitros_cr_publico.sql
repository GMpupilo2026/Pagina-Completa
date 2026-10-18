-- La lista pública de árbitros (arbitros.html): quiénes están en la lista de la
-- Federación Costarricense de Ajedrez, con su título de FIDE, su categoría
-- nacional, si FIDE los tiene activos y la fecha de su último torneo en Costa
-- Rica válido para Elo como principal, adjunto o árbitro. Sirve para que un
-- organizador vea a quién puede contratar para su torneo (ver «La lista
-- pública de árbitros» en docs/decisiones/juegos-y-torneos.md).
--
-- Todo eso ya es público (la lista de la Federación, la de FIDE y chess-results);
-- de los cursos, que no lo son, sale solo si lleva 20 horas de actualización
-- en los últimos dos años (art. 19), sin horas, notas ni fechas. Por eso es
-- SECURITY DEFINER y se le da execute a anon a propósito, como a
-- cifras_academia(): las tablas siguen cerradas a quien no tiene la licencia.

create or replace function public.arbitros_cr_publico()
returns table (fide_id integer, nombre text, titulo text, categoria text, activo_fide boolean,
               ultimo_torneo date, curso_al_dia boolean, lista date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with hoy as (select (now() at time zone 'America/Costa_Rica')::date d),
  lista as (select f.* from public.arbitros_cr_fide f
             where f.fca_leida = (select max(fca_leida) from public.arbitros_cr_fide)),
  torneos as (
    select c.fide_id, t.inicio::date inicio
      from public.arbitros_cr_cargos c join public.arbitros_cr_torneos t on t.id = c.torneo_id
     where t.pais = 'Costa Rica' and c.cargo in ('Chief', 'Dep. Chief', 'Arbiter')
    union all
    select cc.fide_id, r.inicio::date
      from public.arbitros_cr_cr_cargos cc join public.arbitros_cr_cr r on r.clave = cc.clave
     where coalesce(r.pais, 'CRC') = 'CRC' and r.rondas > 0 and r.jugadores > 0 and cc.rol in ('ap', 'adj', 'arb')
       and (r.fide_torneo is not null
            or exists (select 1 from public.arbitros_cr_cr_elo e
                        where e.clave = r.clave and e.calculo in ('nacional', 'internacional', 'ambos')))
  ),
  ultimo as (select t.fide_id, max(t.inicio) inicio from torneos t group by t.fide_id),
  curso as (select fo.fide_id, sum(fo.horas) horas from public.arbitros_cr_formacion fo, hoy
             where fo.tipo = 'actualizacion' and fo.fecha >= (hoy.d - interval '2 years')::date
               and (fo.nota is null or fo.nota >= 80)
             group by fo.fide_id)
  select l.fide_id, coalesce(a.nombre, l.nombre), case l.titulo when 'NA' then 'AN' else l.titulo end,
         l.categoria_nacional, not l.inactivo, u.inicio, coalesce(cu.horas, 0) >= 20, l.fca_leida
    from lista l
    left join public.arbitros_cr a on a.fide_id = l.fide_id
    left join ultimo u on u.fide_id = l.fide_id
    left join curso cu on cu.fide_id = l.fide_id
   order by 2;
$$;

revoke execute on function public.arbitros_cr_publico() from public;
grant execute on function public.arbitros_cr_publico() to anon, authenticated;
