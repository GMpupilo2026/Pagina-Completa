-- Metropolitano: camas, parqueo y la lista pública de asistentes contaban toda
-- inscripción con pago_estado <> 'rechazado', o sea también 'pendiente',
-- 'por_revisar' y 'no_aplica'. Un anónimo podía inscribir 80 personas por
-- llamada declarándose «GM» (monto 0, sin comprobante, pago_estado no_aplica) y
-- agotar camas/parqueo y aparecer en la lista pública al instante, sin que nadie
-- verificara el pago. Decisión del dueño: solo cuenta el pago VERIFICADO.
--
-- Administración marca 'verificado' con metropolitano_revisar (acepta cualquier
-- inscripción, también un titulado exonerado), así que ningún inscrito legítimo
-- queda fuera: cuenta cuando administración lo verifica. Hoy la tabla está
-- vacía (0 inscripciones), así que el cambio no perturba datos reales.

-- Camas: el hospedaje Y los titulados (que antes contaban sin mirar el pago).
create or replace function interno.metropolitano_noches()
returns table (noche date, personas int)
language sql
stable
security definer
set search_path = public
as $$
  with quien as (
    select m.hospedaje_desde d, m.hospedaje_hasta h, 1 + coalesce(m.acompanantes, 0) n
      from public.metropolitano_inscripciones m
     where m.estado = 'activa' and m.pago_estado = 'verificado' and m.hospedaje
    union all
    select (m.viaje->>'llegada')::date, (m.viaje->>'salida')::date, 1
      from public.metropolitano_inscripciones m
     where m.estado = 'activa' and m.rol = 'jugador' and m.titulo in ('GM', 'IM', 'WGM')
       and m.pago_estado = 'verificado'
       and coalesce(m.viaje->>'llegada', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       and coalesce(m.viaje->>'salida', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  select g::date, coalesce(sum(q.n) filter (where q.d <= g::date and g::date < q.h), 0)::int
    from generate_series(date '2026-12-20', date '2027-01-02', interval '1 day') g
    left join quien q on true
   group by g order by g;
$$;
revoke execute on function interno.metropolitano_noches() from public, anon, authenticated;

-- Parqueo: espacios tomados.
create or replace function interno.metropolitano_parqueo_usados()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.metropolitano_inscripciones m
   where m.parqueo and m.estado = 'activa' and m.pago_estado = 'verificado';
$$;
revoke execute on function interno.metropolitano_parqueo_usados() from public, anon, authenticated;

-- La lista pública de asistentes.
create or replace function public.metropolitano_quien_viene()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with j as (
    select m.*, t
      from public.metropolitano_inscripciones m, unnest(m.torneos) t
     where m.estado = 'activa' and m.pago_estado = 'verificado' and m.rol = 'jugador')
  select coalesce(jsonb_object_agg(x.t, jsonb_build_object('total', x.total, 'lista', x.lista)), '{}'::jsonb)
    from (select j.t, count(*) total,
                 coalesce(jsonb_agg(jsonb_build_object('nombre', j.nombre || ' ' || j.apellidos, 'titulo', j.titulo,
                     'fed', coalesce(j.federacion, case when j.origen = 'cr' then 'CRC' end),
                     'elo', case when j.t = 'BLITZ' then j.elo_blitz else j.elo_estandar end,
                     'delegacion', coalesce(j.delegacion, j.club))
                   order by (case when j.t = 'BLITZ' then j.elo_blitz else j.elo_estandar end) desc nulls last, j.apellidos)
                   filter (where j.acepta_publicidad), '[]'::jsonb) lista
            from j group by j.t) x;
$$;
revoke execute on function public.metropolitano_quien_viene() from public;
grant execute on function public.metropolitano_quien_viene() to anon, authenticated;
