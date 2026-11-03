-- Centroamericano 2026: las revisiones de Fair Play anotadas a mano. Ver «El sorteo de Fair Play» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- El sorteo empezó a usarse en la ronda 3, pero en las rondas 1 y 2 ya se revisó a gente. Para que la regla contra el
-- acoso (2 rondas de descanso, tope de 3) y las señales del sorteo cuenten esas revisiones, el encargado de Fair Play
-- (o el principal) las anota a mano: categoría, ronda, mesa, a quién (de los dos de la mesa, leídos de chess-results),
-- cómo terminó y una nota. Quedan como una mesa «revisada» de origen «manual», con quién la anotó y cuándo; el índice
-- único (tnr, ronda, mesa) sigue valiendo: una mesa no se anota dos veces en la ronda, ni si ya salió en un sorteo.
--
-- Además, un HALLAZGO en una revisión anterior (sorteada o anotada a mano) suma +1 al peso de las mesas de ese jugador
-- en los sorteos siguientes (dentro del tope de 4), igual que una alerta de los tableros.

alter table public.centroamericano_fair_play
  add column origen text not null default 'sorteo' check (origen in ('sorteo', 'manual'));
comment on column public.centroamericano_fair_play.origen is
  'sorteo: salió en centroamericano_fair_play_sortear. manual: una revisión hecha sin sorteo (p. ej. las de las rondas 1 y 2), anotada por el encargado con centroamericano_fair_play_manual.';

-- Las mesas de una categoría y ronda, con su peso, sus motivos y quién de los dos no aplica (y por qué).
create or replace function public.centroamericano_fp_candidatas(p_tnr text, p_ronda integer)
returns table (mesa integer, blancas text, negras text, snr_b integer, snr_n integer, elo_b integer, elo_n integer,
               peso numeric, motivos text[], aplica_blancas boolean, aplica_negras boolean, no_aplica text, excluida text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  return query
  with mesas as (
    select distinct m::integer mesa
      from public.centroamericano_asignaciones a, generate_series(a.mesa_desde, a.mesa_hasta) m
     where a.tnr = p_tnr and not a.revocada and a.vence > now()
  ),
  leida as (   -- la lectura compartida de los árbitros, si es de esta ronda (sin Elo)
    select (x->>'mesa')::integer mesa, x->>'blancas' blancas, x->>'negras' negras
      from public.centroamericano_lecturas l, jsonb_array_elements(l.mesas) x
     where l.tnr = p_tnr and l.ronda = p_ronda and (x->>'mesa') ~ '^\d+$'
  ),
  par as (
    select m.mesa,
           coalesce(nullif(p.blancas, ''), le.blancas, '') blancas, coalesce(nullif(p.negras, ''), le.negras, '') negras,
           p.snr_b, p.snr_n, p.elo_b, p.elo_n
      from mesas m
      left join public.centroamericano_fp_partidas p on p.tnr = p_tnr and p.ronda = p_ronda and p.mesa = m.mesa
      left join leida le on le.mesa = m.mesa
  ),
  reg as (     -- lo que anotan los árbitros, sin lo anulado
    select r.* from public.centroamericano_registro r
     where r.tnr = p_tnr
       and not exists (select 1 from public.centroamericano_registro an where an.tipo = 'anulacion' and an.anula = r.id)
  ),
  previas as ( -- quién le ganó a alguien con 200 o más de Elo en rondas anteriores
    select q.snr, count(*)::integer n, string_agg('ronda ' || q.ronda, ', ' order by q.ronda) rondas
      from (
        select f.ronda, f.snr_b snr from public.centroamericano_fp_partidas f
         where f.tnr = p_tnr and f.ronda < p_ronda and f.resultado ~ '^1\s*-\s*0' and f.elo_n - f.elo_b >= 200
        union all
        select f.ronda, f.snr_n from public.centroamericano_fp_partidas f
         where f.tnr = p_tnr and f.ronda < p_ronda and f.resultado ~ '^0\s*-\s*1' and f.elo_b - f.elo_n >= 200
      ) q where q.snr is not null group by q.snr
  ),
  revisados as ( -- a quién ya se revisó (o se va a revisar): el ganador anotado o, si falta, los dos de la mesa
    select fp.ronda, x.snr, x.clave
      from public.centroamericano_fair_play fp,
           lateral (
             select fp.jugador_snr snr, interno.fp_clave(fp.jugador) clave where fp.estado = 'revisada'
             union all select fp.snr_b, interno.fp_clave(fp.blancas) where fp.estado = 'aprobada' and coalesce(fp.revisar_color, 'blancas') = 'blancas'
             union all select fp.snr_n, interno.fp_clave(fp.negras) where fp.estado = 'aprobada' and coalesce(fp.revisar_color, 'negras') = 'negras'
           ) x
     where fp.tnr = p_tnr and fp.estado in ('aprobada', 'revisada') and fp.ronda <= p_ronda
  ),
  alertas as ( -- precisión muy alta en rondas anteriores, todavía sin mirar o marcada «seguir»
    select interno.fp_clave(an.jugador) clave, string_agg('ronda ' || an.ronda || ', ' || round(an.precision) || ' %', '; ' order by an.ronda) cuales
      from public.centroamericano_fp_analisis an
     where an.tnr = p_tnr and an.ronda < p_ronda and an.jugador <> ''
       and ((an.nivel <> 'normal' and an.estado = 'nueva') or an.estado = 'seguir')
     group by 1
  ),
  hallazgos as ( -- un hallazgo en una revisión anterior (sorteada o anotada a mano): pesa en los sorteos siguientes
    select x.clave, string_agg('ronda ' || x.ronda, ', ' order by x.ronda) cuales
      from (select fp.ronda, coalesce(nullif(interno.fp_clave(fp.jugador), ''), '') clave, fp.jugador_snr snr
              from public.centroamericano_fair_play fp
             where fp.tnr = p_tnr and fp.estado = 'revisada' and fp.resultado = 'hallazgo' and fp.ronda < p_ronda) x
     where x.clave <> '' group by x.clave
  ),
  senal as (
    select pa.*,
           (select string_agg(h.cuales, '; ') from hallazgos h where h.clave in (interno.fp_clave(pa.blancas), interno.fp_clave(pa.negras))) hallazgo,
           (select string_agg(al.cuales, '; ') from alertas al where al.clave in (interno.fp_clave(pa.blancas), interno.fp_clave(pa.negras))) alerta,
           case when pa.elo_b > 0 and pa.elo_n > 0 then abs(pa.elo_b - pa.elo_n) end dif,
           (select count(*) from reg r where r.ronda = p_ronda and r.mesa = pa.mesa and r.tipo = 'nota' and r.articulo = 'Levantó')::integer lev,
           (select count(*) from reg r where r.ronda = p_ronda and r.mesa = pa.mesa and r.tipo in ('ilegal', 'irregularidad'))::integer irr,
           (select coalesce(sum(pv.n), 0) from previas pv where pv.snr in (pa.snr_b, pa.snr_n))::integer sorpresas,
           (select string_agg(pv.rondas, '; ') from previas pv where pv.snr in (pa.snr_b, pa.snr_n)) sorpresas_rondas,
           (select count(*) from reg r where r.ronda < p_ronda and r.tipo = 'nota' and r.articulo = 'Levantó'
              and interno.fp_clave(r.jugador) in (interno.fp_clave(pa.blancas), interno.fp_clave(pa.negras)) and r.jugador <> '')::integer lev_antes,
           (select max(rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_b) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.blancas))) ult_b,
           (select max(rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_n) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.negras))) ult_n,
           (select count(distinct rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_b) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.blancas)))::integer veces_b,
           (select count(distinct rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_n) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.negras)))::integer veces_n
      from par pa
  ),
  aplica as (  -- por qué uno de los dos no aplica: 3 revisiones en el torneo, o se revisó hace menos de 3 rondas
    select se.*,
           case when se.veces_b >= 3 then 'ya tuvo 3 revisiones en el torneo'
                when se.ult_b is not null and se.ult_b >= p_ronda - 2 then 'se revisó en la ronda ' || se.ult_b end no_b,
           case when se.veces_n >= 3 then 'ya tuvo 3 revisiones en el torneo'
                when se.ult_n is not null and se.ult_n >= p_ronda - 2 then 'se revisó en la ronda ' || se.ult_n end no_n
      from senal se
  )
  select s.mesa, nullif(s.blancas, ''), nullif(s.negras, ''), s.snr_b, s.snr_n, s.elo_b, s.elo_n,
         least(4, 1
           + case when s.dif >= 400 then 1 when s.dif >= 200 then 0.5 else 0 end
           + least(1.5, 0.5 * s.lev)
           + case when s.irr > 0 then 0.5 else 0 end
           + least(1, 0.5 * s.sorpresas)
           + case when s.lev_antes >= 3 then 0.5 else 0 end
           + case when s.alerta is not null then 1 else 0 end
           + case when s.hallazgo is not null then 1 else 0 end)::numeric,
         array_remove(array[
           case when s.dif >= 200 then 'Diferencia de ' || s.dif || ' de Elo' end,
           case when s.lev > 0 then 'Se levantó ' || s.lev || (case when s.lev = 1 then ' vez' else ' veces' end) || ' en esta ronda' end,
           case when s.irr > 0 then 'Ilegal o irregularidad en esta ronda' end,
           case when s.sorpresas > 0 then 'Le ganó a alguien con 200 o más de Elo (' || s.sorpresas_rondas || ')' end,
           case when s.lev_antes >= 3 then 'Se levanta seguido (' || s.lev_antes || ' veces antes)' end,
           case when s.alerta is not null then 'Precisión muy alta para su Elo (' || s.alerta || ')' end,
           case when s.hallazgo is not null then 'Hallazgo en una revisión anterior (' || s.hallazgo || ')' end], null),
         s.no_b is null, s.no_n is null,
         nullif(concat_ws('; ',
           case when s.no_b is not null then coalesce(nullif(s.blancas, ''), 'Blancas') || ' no aplica: ' || s.no_b end,
           case when s.no_n is not null then coalesce(nullif(s.negras, ''), 'Negras') || ' no aplica: ' || s.no_n end), ''),
         case
           when exists (select 1 from public.centroamericano_fair_play f where f.tnr = p_tnr and f.ronda = p_ronda and f.mesa = s.mesa) then 'Ya salió en esta ronda'
           when s.blancas <> '' and s.negras = '' then 'Sin partida (bye)'
           when s.no_b is not null and s.no_n is not null then 'Ninguno de los dos aplica'
         end
    from aplica s
   order by s.mesa;
end;
$$;

-- Anotar a mano una revisión ya hecha. El nombre y el número del jugador salen de los emparejamientos leídos de esa ronda
-- (centroamericano_fp_partidas); si no están, vale el nombre que escriba el encargado.
create function public.centroamericano_fair_play_manual(p_tnr text, p_ronda integer, p_mesa integer, p_color text, p_resultado text,
                                                        p_jugador text default null, p_nota text default null,
                                                        p_quien text default null, p_enlace uuid default null)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.centroamericano_fp_partidas;
  f public.centroamericano_fair_play;
  v_quien text := interno.fp_quien(p_quien);
  v_jugador text;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para anotar el Fair Play' using errcode = '42501'; end if;
  if not exists (select 1 from public.centroamericano_torneos where tnr = p_tnr) then raise exception 'No existe esa categoría'; end if;
  if p_ronda is null or p_ronda not between 1 and 99 then raise exception 'Ronda inválida'; end if;
  if p_mesa is null or p_mesa not between 1 and 9999 then raise exception 'Mesa inválida'; end if;
  if p_color is null or p_color not in ('blancas', 'negras') then raise exception 'Falta a quién se revisó (blancas o negras)'; end if;
  if p_resultado is null or p_resultado not in ('sin_novedad', 'hallazgo', 'se_nego', 'no_se_presento') then raise exception 'Resultado inválido'; end if;
  if p_resultado <> 'sin_novedad' and length(btrim(coalesce(p_nota, ''))) = 0 then raise exception 'Con ese resultado hace falta anotar qué pasó'; end if;
  select * into p from public.centroamericano_fp_partidas where tnr = p_tnr and ronda = p_ronda and mesa = p_mesa;
  v_jugador := coalesce(nullif(case p_color when 'blancas' then p.blancas else p.negras end, ''), nullif(left(btrim(coalesce(p_jugador, '')), 120), ''));
  if v_jugador is null then raise exception 'No sé quién jugó en esa mesa: escribe el nombre del jugador'; end if;
  begin
    insert into public.centroamericano_fair_play (tnr, ronda, mesa, mesas_en_sorteo, color_si_tablas, estado, origen, blancas, negras,
                                                  snr_b, snr_n, elo_b, elo_n, peso, motivos, sorteada_por, enlace_id,
                                                  resultado, jugador, jugador_color, jugador_snr, revisar_color, nota,
                                                  decidida_en, decidida_por, decidida_por_nombre, revisada_en, revisada_por, revisada_por_nombre)
    values (p_tnr, p_ronda, p_mesa, 1, p_color, 'revisada', 'manual', nullif(p.blancas, ''), nullif(p.negras, ''),
            p.snr_b, p.snr_n, p.elo_b, p.elo_n, 1, array['Anotada a mano'], v_quien, p_enlace,
            p_resultado, v_jugador, p_color, case p_color when 'blancas' then p.snr_b else p.snr_n end, p_color,
            nullif(left(btrim(coalesce(p_nota, '')), 500), ''),
            now(), (select auth.uid()), v_quien, now(), (select auth.uid()), v_quien)
    returning * into f;
  exception when unique_violation then
    raise exception 'La mesa % de la ronda % ya tiene un registro de Fair Play: corrígelo desde la lista', p_mesa, p_ronda;
  end;
  return f;
end;
$$;
revoke execute on function public.centroamericano_fair_play_manual(text, integer, integer, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.centroamericano_fair_play_manual(text, integer, integer, text, text, text, text, text, uuid) to authenticated, service_role;
