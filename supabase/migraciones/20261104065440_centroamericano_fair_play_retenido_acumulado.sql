-- Centroamericano 2026, Fair Play: el árbitro de mesa confirma que retuvo al ganador, y la precisión de cada jugador
-- sumada en todo el torneo. Ver «Retenido, el acumulado y el informe final» en docs/decisiones/juegos-y-torneos.md.
--
-- 1. RETENIDO. Hasta ahora el árbitro de mesa recibía el aviso, pero el encargado no sabía si de verdad había detenido
--    al ganador. Cuando el resultado ya dice a quién revisar (estado «aprobada» con revisar_color), la tablet muestra
--    «Ya lo retuve»: centroamericano_fair_play_retener() anota la hora y el nombre del árbitro (lo llama la Edge
--    Function centroamericano-fair-play con el token del árbitro, que ella valida, y el rango de mesas). Un resultado
--    corregido que cambia el ganador, o uno borrado, borra lo retenido: era de otra persona (fp_tras_resultado).
--
-- 2. EL ACUMULADO. Una alerta por partida no ve a quien juega un poco por encima de su nivel en cada ronda. Se suman
--    sus partidas del torneo con la regla de Stouffer: z conjunta = suma de las z / raíz del número de partidas (dos
--    partidas con z 1,5 dan 2,12). Con 2 o más partidas: 2 o más es «a mirar» y 2,5 o más «muy alta», como por
--    partida. Es una alerta, nunca una acusación. Pesa en los sorteos (dentro del +1 de las alertas, no aparte)
--    mientras le quede alguna partida sin mirar; «Ya lo miré» / «Seguirlo» las marca todas
--    (centroamericano_fp_acumulado_marcar).

alter table public.centroamericano_fair_play
  add column retenido_en timestamptz,
  add column retenido_por text check (retenido_por is null or length(retenido_por) <= 120);
comment on column public.centroamericano_fair_play.retenido_en is
  'Cuándo confirmó el árbitro de la mesa, desde su tablet, que retuvo a quien se revisa. Se borra si un resultado corregido cambia el ganador.';
comment on column public.centroamericano_fair_play.retenido_por is
  'El nombre del árbitro de mesa que confirmó que lo retuvo (de su enlace en centroamericano_asignaciones).';

-- ---------------------------------------------------------------- 1. «Ya lo retuve»
create function public.centroamericano_fair_play_retener(p_tnr text, p_ronda integer, p_mesa integer, p_quien text default null)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  select * into f from public.centroamericano_fair_play where tnr = p_tnr and ronda = p_ronda and mesa = p_mesa for update;
  if not found then raise exception 'Esta mesa no está elegida para Fair Play'; end if;
  if f.estado <> 'aprobada' or f.revisar_color is null then
    raise exception 'Todavía no hay a quién retener: primero se guarda el resultado de la mesa';
  end if;
  if f.retenido_en is null then
    update public.centroamericano_fair_play
       set retenido_en = now(), retenido_por = left(nullif(btrim(coalesce(p_quien, '')), ''), 120)
     where id = f.id
    returning * into f;
  end if;
  return f;
end;
$$;
revoke execute on function public.centroamericano_fair_play_retener(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.centroamericano_fair_play_retener(text, integer, integer, text) to service_role;

-- Lo retenido se borra si el resultado cambia de ganador o se borra (el resto, igual que antes).
create or replace function interno.fp_tras_resultado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
  v_color text;
  v_nombre text;
  v_aplica boolean;
  v_texto text;
begin
  if new.tipo not in ('resultado', 'correccion') or new.resultado is null then return null; end if;
  select * into f from public.centroamericano_fair_play
   where tnr = new.tnr and ronda = new.ronda and mesa = new.mesa and estado in ('aprobada', 'sin_efecto')
   for update;
  if not found then return null; end if;
  if new.resultado = 'borrado' then
    update public.centroamericano_fair_play set estado = 'aprobada', revisar_color = null, resultado_mesa = null,
           retenido_en = null, retenido_por = null where id = f.id;
    return null;
  end if;
  v_color := case new.resultado when '1-0' then 'blancas' when '1f-0f' then 'blancas' when '0-1' then 'negras' when '0f-1f' then 'negras'
                                when '1/2' then f.color_si_tablas end;
  if v_color is null then   -- 0f-0f: nadie jugó
    update public.centroamericano_fair_play set estado = 'sin_efecto', revisar_color = null, resultado_mesa = new.resultado,
           retenido_en = null, retenido_por = null where id = f.id;
    v_texto := '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': no se jugó (0f-0f). La mesa queda sin efecto: no hay que retener a nadie.';
  else
    v_nombre := coalesce(nullif(case v_color when 'blancas' then f.blancas else f.negras end, ''), case v_color when 'blancas' then 'quien jugó con blancas' else 'quien jugó con negras' end);
    v_aplica := case v_color when 'blancas' then f.aplica_blancas else f.aplica_negras end;
    update public.centroamericano_fair_play
       set estado = case when v_aplica then 'aprobada' else 'sin_efecto' end, revisar_color = v_color, resultado_mesa = new.resultado,
           -- otro ganador (un resultado corregido): lo retenido era de otra persona
           retenido_en = case when revisar_color is not distinct from v_color and v_aplica then retenido_en end,
           retenido_por = case when revisar_color is not distinct from v_color and v_aplica then retenido_por end
     where id = f.id;
    v_texto := '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': '
      || case when new.resultado = '1/2' then 'tablas; se revisa a ' else 'ganó ' end || v_nombre || ' (' || v_color || '). '
      || case when v_aplica then 'Retenlo y no lo dejes salir del local: el árbitro de Fair Play pasa a revisarlo.'
              else 'NO APLICA para Fair Play (' || coalesce(f.no_aplica, 'ya se revisó') || '). La mesa queda sin efecto: no hace falta retenerlo.' end;
  end if;
  if f.asignacion_id is not null and (f.resultado_mesa is distinct from new.resultado) then
    insert into public.centroamericano_avisos (de, asignacion_id, mesa, ronda, texto) values ('organizacion', f.asignacion_id, f.mesa, f.ronda, left(v_texto, 500));
  end if;
  return null;
end;
$$;
revoke all on function interno.fp_tras_resultado() from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. el acumulado del torneo
-- Cada jugador (por su nombre normalizado) con 2 o más partidas medidas en la categoría; con p_antes_de, solo las
-- rondas anteriores a esa (lo que usa el sorteo de esa ronda).
create function public.centroamericano_fp_acumulado(p_tnr text default null, p_antes_de integer default null)
returns table (tnr text, clave text, jugador text, elo integer, partidas integer, rondas text,
               precision_media numeric, esperada_media numeric, z numeric, nivel text, sin_mirar integer, seguir boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  return query
  select q.tnr, q.clave, q.jugador, q.elo, q.partidas, q.rondas, q.precision_media, q.esperada_media, q.z,
         case when q.z >= 2.5 then 'alta' when q.z >= 2 then 'a_mirar' else 'normal' end,
         q.sin_mirar, q.seguir
    from (
      select an.tnr, interno.fp_clave(an.jugador) clave, max(an.jugador) jugador, max(an.elo) elo, count(*)::integer partidas,
             string_agg(an.ronda::text, ', ' order by an.ronda) rondas,
             round(avg(an.precision), 1) precision_media, round(avg(an.esperada), 1) esperada_media,
             round(sum(an.z) / sqrt(count(*))::numeric, 2) z,
             count(*) filter (where an.estado = 'nueva')::integer sin_mirar,
             bool_or(an.estado = 'seguir') seguir
        from public.centroamericano_fp_analisis an
       where (p_tnr is null or an.tnr = p_tnr) and (p_antes_de is null or an.ronda < p_antes_de)
         and an.jugador <> '' and an.jugadas >= 15 and an.z is not null
       group by an.tnr, interno.fp_clave(an.jugador)
      having count(*) >= 2
    ) q
   order by q.z desc;
end;
$$;
revoke execute on function public.centroamericano_fp_acumulado(text, integer) from public, anon;
grant execute on function public.centroamericano_fp_acumulado(text, integer) to authenticated, service_role;

-- «Ya lo miré» (vista) o «Seguirlo en los sorteos» (seguir) para TODAS las partidas medidas de ese jugador en la
-- categoría, con quién y cuándo. Devuelve cuántas marcó.
create function public.centroamericano_fp_acumulado_marcar(p_tnr text, p_clave text, p_estado text, p_nota text default null, p_quien text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  if p_estado not in ('vista', 'seguir') then raise exception 'Estado inválido'; end if;
  update public.centroamericano_fp_analisis an
     set estado = p_estado,
         nota = coalesce(left(nullif(btrim(coalesce(p_nota, '')), ''), 500), an.nota),
         vista_en = now(),
         vista_por_nombre = left(nullif(btrim(coalesce(p_quien, '')), ''), 120)
   where an.tnr = p_tnr and interno.fp_clave(an.jugador) = p_clave and an.jugadas >= 15 and an.z is not null
     and not (p_estado = 'vista' and an.estado = 'seguir');   -- «mirado» no le quita a una partida el seguimiento
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.centroamericano_fp_acumulado_marcar(text, text, text, text, text) from public, anon;
grant execute on function public.centroamericano_fp_acumulado_marcar(text, text, text, text, text) to authenticated, service_role;

-- El sorteo: el acumulado entra en las alertas que pesan (igual que antes, el resto de la función no cambia).
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
    union all    -- o, sumadas sus partidas del torneo, muy por encima de lo esperable (con alguna todavía sin mirar)
    select ac.clave, 'sumadas sus ' || ac.partidas || ' partidas de las rondas ' || ac.rondas
      from public.centroamericano_fp_acumulado(p_tnr, p_ronda) ac
     where ac.nivel <> 'normal' and ac.sin_mirar > 0
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
