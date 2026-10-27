-- «Torneos en Pareo Integral»: buscar a un jugador desde la portada, el
-- medallero de colegios y clubes, las aperturas del año y las cifras para
-- quien administra. Lo pidió el dueño del sitio.
--
-- Todo sale de lo que ya está publicado (public.pareo_publicados, de lectura
-- pública) y de public.pareo_resultados(), que dice quién es quién: la
-- huella del ID FIDE si la hay, el nombre si no. Las cuentas se hacen acá y
-- no en el navegador: la portada no se baja todos los torneos para sumar.
--
-- Ver «Torneos en Pareo Integral: buscar a un jugador, el medallero, las
-- aperturas y las cifras» en docs/decisiones/juegos-y-torneos.md.

-- ---- buscar a un jugador ----
-- Cada palabra escrita tiene que estar al comienzo de alguna palabra de su
-- nombre, sin tildes ni mayúsculas («jose mora» encuentra a «José Pablo
-- Mora Solís»). Una fila por persona. «homonimos» dice cuántas personas
-- distintas llevan ese mismo nombre: la página lo avisa en vez de juntarlas.
create or replace function public.pareo_buscar_jugador(p_texto text)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with q as (
    select array(select w from regexp_split_to_table(public.pareo_clave(p_texto), '[^A-Z0-9]+') w where w <> '') as palabras
  ),
  todo as (select * from public.pareo_resultados()),
  hallados as (
    select r.* from todo r, q
     where cardinality(q.palabras) > 0 and char_length(array_to_string(q.palabras, '')) >= 3
       and not exists (select 1 from unnest(q.palabras) b
                        where not exists (select 1 from regexp_split_to_table(r.clave, '[^A-Z0-9]+') w where w like b || '%'))
  ),
  por_persona as (
    select persona,
           (array_agg(nombre order by fecha desc nulls last))[1] as nombre,
           (array_agg(ident order by fecha desc nulls last) filter (where ident is not null))[1] as ident,
           (array_agg(institucion order by fecha desc nulls last) filter (where institucion <> ''))[1] as institucion,
           (array_agg(clave order by fecha desc nulls last))[1] as clave,
           count(distinct torneo) as torneos, max(fecha) as ultimo,
           count(*) filter (where puesto <= 3) as podios
      from hallados group by persona
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.torneos desc, x.ultimo desc nulls last, x.nombre), '[]'::jsonb) from (
    select p.persona, p.nombre, p.ident, coalesce(p.institucion, '') as institucion, p.torneos, p.ultimo, p.podios,
           (select count(distinct t.persona) from todo t where t.clave = p.clave) as homonimos
      from por_persona p
     order by p.torneos desc, p.ultimo desc nulls last, p.nombre
     limit 20) x;
$$;
revoke all on function public.pareo_buscar_jugador(text) from public;
grant execute on function public.pareo_buscar_jugador(text) to anon, authenticated;

-- ---- el medallero de colegios y clubes ----
-- Oro, plata y bronce son los tres primeros puestos de cada torneo
-- individual, contados por la institución que el jugador llevaba en ESE
-- torneo. Un colegio es su nombre sin tildes ni mayúsculas (pareo_clave), y
-- se muestra como lo escribieron más veces. Sin institución no cuenta.
create or replace function public.pareo_medallero(p_anio integer default 0)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with todo as (select * from public.pareo_resultados() where institucion <> '' and public.pareo_clave(institucion) <> ''),
  del_anio as (select * from todo where coalesce(p_anio, 0) = 0 or extract(year from fecha) = p_anio),
  cuentas as (
    select public.pareo_clave(institucion) as clave, mode() within group (order by institucion) as institucion,
           count(*) filter (where puesto = 1) as oro, count(*) filter (where puesto = 2) as plata,
           count(*) filter (where puesto = 3) as bronce, count(distinct persona) as jugadores, count(distinct torneo) as torneos
      from del_anio group by 1
  )
  select jsonb_build_object(
    'filas', coalesce((select jsonb_agg(to_jsonb(c) - 'clave' order by c.oro desc, c.plata desc, c.bronce desc, c.jugadores desc, c.institucion)
                         from (select * from cuentas where oro + plata + bronce > 0
                                order by oro desc, plata desc, bronce desc, jugadores desc, institucion limit 100) c), '[]'::jsonb),
    'anios', coalesce((select jsonb_agg(a order by a desc) from (select distinct extract(year from fecha)::integer as a from todo where fecha is not null) x), '[]'::jsonb));
$$;
revoke all on function public.pareo_medallero(integer) from public;
grant execute on function public.pareo_medallero(integer) to anon, authenticated;

-- ---- las partidas del año, para contar sus aperturas ----
-- Solo el comienzo de cada partida (sus primeros 400 caracteres de jugadas,
-- sin los encabezados ni los comentarios) y el resultado: la página reconoce
-- la apertura con sus jugadas y cuenta cómo le fue a cada color. Sin nombres:
-- no hacen falta. Con tope, para no bajarse años enteros.
create or replace function public.pareo_partidas_del_anio(p_anio integer)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select t.id as torneo, m->>'r' as r,
           left(btrim(regexp_replace(regexp_replace(regexp_replace(m->>'pgn', '\[[^\]]*\]', '', 'g'), '\{[^}]*\}', '', 'g'), '\s+', ' ', 'g')), 400) as jugadas
      from public.pareo_publicados t
      cross join lateral jsonb_array_elements(coalesce(t.datos->'rondas', '[]'::jsonb)) ro
      cross join lateral jsonb_array_elements(coalesce(ro->'mesas', '[]'::jsonb)) m
     where extract(year from t.fecha) = p_anio and coalesce(t.datos->>'tipo', '') <> 'equipos'
       and coalesce(m->>'pgn', '') <> '' and m->>'n' is not null
     order by t.fecha desc, t.id
     limit 5000) x;
$$;
revoke all on function public.pareo_partidas_del_anio(integer) from public;
grant execute on function public.pareo_partidas_del_anio(integer) to anon, authenticated;

-- ---- las cifras, para quien administra ----
-- Lo de afuera (torneos, organizadores, jugadores) lo puede contar cualquiera;
-- lo que no (cuántos siguen a alguien por correo, los reportes y los sellos
-- pendientes) lo lee esta función con sus permisos, y solo para
-- administración. Nunca da un correo: solo números.
create or replace function public.pareo_cifras()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración ve las cifras de Pareo Integral' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'torneos', (select count(*) from public.pareo_publicados where not oculto),
    'ocultos', (select count(*) from public.pareo_publicados where oculto),
    'por_mes', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'torneos', n, 'jugadores', j) order by mes) from (
        select to_char(date_trunc('month', coalesce(fecha, (creado at time zone 'America/Costa_Rica')::date)), 'YYYY-MM') as mes,
               count(*) as n, sum(jugadores) as j
          from public.pareo_publicados
         where not oculto and coalesce(fecha, (creado at time zone 'America/Costa_Rica')::date)
               >= (date_trunc('month', now() at time zone 'America/Costa_Rica') - interval '11 months')::date
         group by 1) m), '[]'::jsonb),
    'organizadores', (select count(*) from public.pareo_organizadores where not oculto),
    'organizadores_activos', (select count(distinct organizador_id) from public.pareo_publicados
                               where organizador_id is not null and not oculto and actualizado >= now() - interval '90 days'),
    'verificados', (select count(*) from public.pareo_organizadores where verificado and not oculto),
    'jugadores', (select count(distinct persona) from public.pareo_resultados()),
    'suscripciones', (select count(*) from public.pareo_suscripciones where confirmada),
    'suscripciones_sin_confirmar', (select count(*) from public.pareo_suscripciones where not confirmada),
    'seguidores', (select count(distinct correo) from public.pareo_suscripciones where confirmada),
    'avisos_30_dias', (select count(*) from public.pareo_avisos_enviados where cuando >= now() - interval '30 days'),
    'reportes_nuevos', (select count(*) from public.pareo_reportes where estado = 'nuevo'),
    'sellos_pendientes', (select count(*) from public.pareo_solicitudes_sello where estado = 'nueva'),
    'externos', (select jsonb_object_agg(fuente, n) from (select fuente, count(*) as n from public.torneos_externos group by fuente) e)
  ) into v;
  return v;
end;
$$;
revoke all on function public.pareo_cifras() from public, anon;
grant execute on function public.pareo_cifras() to authenticated;
