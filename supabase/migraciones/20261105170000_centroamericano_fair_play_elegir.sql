-- Fair Play: elegir una mesa a mano, además del sorteo. Ver «Elegir una mesa a mano» en docs/decisiones/juegos-y-torneos.md.
--
-- El encargado despliega una categoría, elige la mesa y a quién se revisa —el ganador (como el sorteo), el de blancas o el
-- de negras, gane, pierda o empate— con el motivo, y si quiere le avisa ya al árbitro de esa mesa (lo mismo que «Aprobar»).
-- Queda como una mesa más de la lista, con origen 'elegida', quién la eligió y por qué: no es azar y el acta lo dice.
--
-- 1. centroamericano_fair_play.revisar_fijo: a quién se revisa sin importar el resultado (null: al ganador, como siempre).
--    Con un jugador fijo, revisar_color ya lo dice desde el principio (el borde dorado va en él).
-- 2. centroamericano_fair_play_elegir(): la regla contra el acoso vale igual (quien no aplica no se puede elegir) y una mesa
--    no se elige dos veces en la ronda (el mismo índice único que el sorteo).
-- 3. centroamericano_fair_play_aprobar(): el aviso al árbitro dice a quién retener cuando el jugador es fijo.
-- 4. interno.fp_tras_resultado(): con un jugador fijo, el resultado no cambia a quién se revisa; la mesa queda sin efecto
--    solo si esa persona no se presentó (o no se jugó).

alter table public.centroamericano_fair_play drop constraint if exists centroamericano_fair_play_origen_check;
alter table public.centroamericano_fair_play
  add constraint centroamericano_fair_play_origen_check check (origen in ('sorteo', 'manual', 'elegida')),
  add column revisar_fijo text check (revisar_fijo is null or revisar_fijo in ('blancas', 'negras'));
comment on column public.centroamericano_fair_play.revisar_fijo is 'En una mesa elegida a mano: a quién se revisa sin importar el resultado (blancas o negras). Null: al ganador (en tablas, a color_si_tablas), como en el sorteo.';

create or replace function public.centroamericano_fair_play_elegir(p_tnr text, p_ronda integer, p_mesa integer, p_revisar text,
                                                                   p_motivo text, p_avisar boolean default false,
                                                                   p_quien text default null, p_enlace uuid default null)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  f public.centroamericano_fair_play;
  v_quien text := interno.fp_quien(p_quien);
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 300), '');
  v_fijo text := case when p_revisar in ('blancas', 'negras') then p_revisar end;
  v_nombre text;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para elegir mesas de Fair Play' using errcode = '42501'; end if;
  if p_ronda is null or p_ronda not between 1 and 99 then raise exception 'Ronda inválida'; end if;
  if p_mesa is null or p_mesa not between 1 and 9999 then raise exception 'Mesa inválida'; end if;
  if p_revisar is null or p_revisar not in ('ganador', 'blancas', 'negras') then raise exception 'Falta a quién se revisa (el ganador, blancas o negras)'; end if;
  if v_motivo is null then raise exception 'Una mesa elegida a mano lleva el motivo: queda en el acta'; end if;
  select * into c from public.centroamericano_fp_candidatas(p_tnr, p_ronda) x where x.mesa = p_mesa;
  if not found then raise exception 'La mesa % no tiene un árbitro con enlace vigente en esa categoría', p_mesa; end if;
  if c.excluida = 'Ya salió en esta ronda' then raise exception 'La mesa % ya está en la lista de esta ronda', p_mesa; end if;
  if c.excluida = 'Sin partida (bye)' then raise exception 'En la mesa % no hay partida (bye)', p_mesa; end if;
  -- Contra el acoso, como en el sorteo: no se elige a quien no aplica.
  if v_fijo is not null and not (case v_fijo when 'blancas' then c.aplica_blancas else c.aplica_negras end) then
    v_nombre := coalesce(case v_fijo when 'blancas' then c.blancas else c.negras end, 'Quien juega con ' || v_fijo);
    raise exception '% no aplica para Fair Play (%)', v_nombre, coalesce(c.no_aplica, 'ya se revisó');
  end if;
  if v_fijo is null and not c.aplica_blancas and not c.aplica_negras then raise exception 'En la mesa % ninguno de los dos aplica (%)', p_mesa, c.no_aplica; end if;
  begin
    insert into public.centroamericano_fair_play (tnr, ronda, mesa, mesas_en_sorteo, color_si_tablas, blancas, negras, snr_b, snr_n,
                                                  elo_b, elo_n, peso, motivos, sorteada_por, enlace_id, aplica_blancas, aplica_negras,
                                                  no_aplica, origen, motivo, revisar_fijo, revisar_color)
    values (p_tnr, p_ronda, p_mesa, 1,
            coalesce(v_fijo, case when not c.aplica_negras then 'blancas' when not c.aplica_blancas then 'negras'
                                  else (array['blancas', 'negras'])[1 + get_byte(uuid_send(gen_random_uuid()), 0) % 2] end),
            c.blancas, c.negras, c.snr_b, c.snr_n, c.elo_b, c.elo_n, c.peso, c.motivos, v_quien, p_enlace,
            -- con un jugador fijo solo cuenta el suyo (el otro no se revisa)
            case when v_fijo = 'negras' then false else c.aplica_blancas end,
            case when v_fijo = 'blancas' then false else c.aplica_negras end,
            case when v_fijo is null then c.no_aplica end, 'elegida', v_motivo, v_fijo, v_fijo)
    returning * into f;
  exception when unique_violation then
    raise exception 'La mesa % ya está en la lista de esta ronda', p_mesa;
  end;
  if coalesce(p_avisar, false) then
    f := public.centroamericano_fair_play_aprobar(f.id, p_quien);
  end if;
  return f;
end;
$$;
revoke execute on function public.centroamericano_fair_play_elegir(text, integer, integer, text, text, boolean, text, uuid) from public, anon;

create or replace function public.centroamericano_fair_play_aprobar(p_id uuid, p_quien text default null)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
  a public.centroamericano_asignaciones;
  v_aviso uuid;
  v_nombre text;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para aprobar el Fair Play' using errcode = '42501'; end if;
  select * into f from public.centroamericano_fair_play where id = p_id for update;
  if not found then raise exception 'No existe ese sorteo'; end if;
  if f.estado <> 'sorteada' then raise exception 'Ese sorteo ya se decidió'; end if;
  select * into a from public.centroamericano_asignaciones
    where tnr = f.tnr and not revocada and vence > now() and f.mesa between mesa_desde and mesa_hasta
    order by creada desc limit 1;
  if not found then raise exception 'La mesa % no tiene un árbitro con enlace vigente', f.mesa; end if;
  v_nombre := coalesce(nullif(case f.revisar_fijo when 'blancas' then f.blancas else f.negras end, ''), 'quien juega con ' || f.revisar_fijo);
  insert into public.centroamericano_avisos (de, asignacion_id, mesa, ronda, texto)
    values ('organizacion', a.id, f.mesa, f.ronda,
      case when f.revisar_fijo is not null then
        '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': cuando TERMINE la partida (gane, pierda o empate), retén a '
        || v_nombre || ' (' || upper(f.revisar_fijo) || ') y no lo dejes salir del local: el árbitro de Fair Play pasa a revisarlo.'
        || ' No le digas nada a nadie antes de que la partida termine.'
      else
        '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': cuando TERMINE la partida, retén al GANADOR'
        || ' (si es tablas, a quien jugó con ' || upper(f.color_si_tablas) || ') y no lo dejes salir del local:'
        || ' el árbitro de Fair Play pasa a revisarlo. No le digas nada a nadie antes de que la partida termine.'
        || case when f.no_aplica is not null then ' Ojo: ' || f.no_aplica || '. Si gana esa persona, la mesa queda sin efecto; te avisamos al guardar el resultado.' else '' end
      end)
    returning id into v_aviso;
  update public.centroamericano_fair_play
    set estado = 'aprobada', decidida_en = now(), decidida_por = (select auth.uid()), decidida_por_nombre = interno.fp_quien(p_quien),
        asignacion_id = a.id, arbitro = a.arbitro, aviso_id = v_aviso
    where id = p_id
    returning * into f;
  return f;
end;
$$;

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
    update public.centroamericano_fair_play set estado = 'aprobada', revisar_color = f.revisar_fijo, resultado_mesa = null,
           retenido_en = null, retenido_por = null where id = f.id;
    return null;
  end if;
  if f.revisar_fijo is not null then
    -- Un jugador elegido a mano: se revisa a esa persona gane, pierda o empate; solo si no se presentó, no hay revisión.
    v_nombre := coalesce(nullif(case f.revisar_fijo when 'blancas' then f.blancas else f.negras end, ''), 'quien jugó con ' || f.revisar_fijo);
    if new.resultado = '0f-0f' or (f.revisar_fijo = 'blancas' and new.resultado = '0f-1f') or (f.revisar_fijo = 'negras' and new.resultado = '1f-0f') then
      update public.centroamericano_fair_play set estado = 'sin_efecto', revisar_color = f.revisar_fijo, resultado_mesa = new.resultado,
             retenido_en = null, retenido_por = null where id = f.id;
      v_texto := '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': ' || v_nombre || ' no se presentó (' || new.resultado
        || '). La mesa queda sin efecto: no hay que retener a nadie.';
    else
      update public.centroamericano_fair_play set estado = 'aprobada', revisar_color = f.revisar_fijo, resultado_mesa = new.resultado,
             retenido_en = case when f.estado = 'aprobada' then retenido_en end, retenido_por = case when f.estado = 'aprobada' then retenido_por end
       where id = f.id;
      v_texto := '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': terminó (' || new.resultado || '). Retén a ' || v_nombre
        || ' (' || f.revisar_fijo || ') y no lo dejes salir del local: el árbitro de Fair Play pasa a revisarlo.';
    end if;
    if f.asignacion_id is not null and (f.resultado_mesa is distinct from new.resultado) then
      insert into public.centroamericano_avisos (de, asignacion_id, mesa, ronda, texto) values ('organizacion', f.asignacion_id, f.mesa, f.ronda, left(v_texto, 500));
    end if;
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

-- 5. «Ya retuve a …» con un jugador fijo: solo después del resultado, como en el sorteo (antes la partida sigue).
create or replace function public.centroamericano_fair_play_retener(p_tnr text, p_ronda integer, p_mesa integer, p_quien text default null)
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
  if f.estado <> 'aprobada' or f.revisar_color is null or (f.revisar_fijo is not null and f.resultado_mesa is null) then
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
