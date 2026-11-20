-- La tablet del árbitro sigue sola a su enlace nuevo cuando un reparto desde el plano le apagó el que tenía abierto.
-- Ver «El reparto de los árbitros desde el plano» en docs/decisiones/juegos-y-torneos.md.
--
-- Al aprobar un reparto, el tramo que un árbitro deja (un torneo que ya no le toca) se apaga. Si su tablet
-- tenía abierto justo ese, la función centroamericano-mesa le contesta «La organización apagó este enlace» y
-- se queda sin mesas. Para eso:
--   1. centroamericano_asignaciones.reemplazada_en: la hora en que un REPARTO apagó el tramo. Un tramo apagado
--      a mano no la lleva: ese puede ser un QR que se perdió o se filtró, y no tiene que llevar a ningún lado.
--   2. centroamericano_reparto_aplicar() la pone al apagar.
--   3. centroamericano_seguir(p_token): con el token de un tramo apagado por un reparto (en las últimas 24 h),
--      devuelve el token de un tramo vigente de la MISMA persona, o null. Es pública (anon) a propósito, como
--      la función centroamericano-mesa: el token, de 64 caracteres al azar, es la credencial; y solo lleva a
--      un enlace de quien ya tenía uno. SECURITY DEFINER, con search_path fijo.

alter table public.centroamericano_asignaciones add column reemplazada_en timestamptz;
comment on column public.centroamericano_asignaciones.reemplazada_en is
  'Cuándo un reparto desde el plano apagó este tramo (no uno apagado a mano). Con eso, centroamericano_seguir() lleva la tablet al tramo vigente de la misma persona.';
grant update (reemplazada_en) on public.centroamericano_asignaciones to authenticated;

create or replace function public.centroamericano_reparto_aplicar(p_acciones jsonb)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  x jsonb;
  v_tipo text;
  v_id uuid;
  v_desde int;
  v_hasta int;
  v_persona uuid;
  v_vence timestamptz;
  n_act int := 0;
  n_cre int := 0;
  n_apa int := 0;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Hace falta la herramienta de la Mesa del árbitro para cambiar las mesas de los árbitros.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_acciones) is distinct from 'array' or jsonb_array_length(p_acciones) > 400 then
    raise exception 'El reparto llegó con una forma que no se entiende.' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(p_acciones) loop
    v_tipo := x->>'tipo';
    v_persona := nullif(x->>'persona', '')::uuid;
    if v_tipo in ('actualizar', 'crear') then
      v_desde := (x->>'desde')::int;
      v_hasta := (x->>'hasta')::int;
      if v_desde is null or v_hasta is null or v_desde < 1 or v_hasta < v_desde or v_hasta > 9999 then
        raise exception 'Mesas que no se entienden: % a %.', x->>'desde', x->>'hasta' using errcode = '22023';
      end if;
    end if;
    if v_tipo = 'actualizar' then
      v_id := (x->>'id')::uuid;
      update public.centroamericano_asignaciones
        set mesa_desde = v_desde, mesa_hasta = v_hasta, persona = coalesce(v_persona, persona)
        where id = v_id and not revocada;
      if not found then raise exception 'Uno de los enlaces ya no está vigente. Vuelve a pedir la sugerencia.' using errcode = 'P0002'; end if;
      n_act := n_act + 1;
    elsif v_tipo = 'crear' then
      v_vence := coalesce(nullif(x->>'vence', '')::timestamptz,
        (select max(a.vence) from public.centroamericano_asignaciones a where v_persona is not null and a.persona = v_persona),
        now() + interval '1 day');
      insert into public.centroamericano_asignaciones (tnr, arbitro, nombrado, mesa_desde, mesa_hasta, vence, persona, experiencia)
        values (x->>'tnr', left(coalesce(nullif(btrim(x->>'arbitro'), ''), 'Árbitro'), 80), coalesce((x->>'nombrado')::boolean, true),
                v_desde, v_hasta, v_vence, v_persona, nullif(x->>'experiencia', '')::smallint);
      n_cre := n_cre + 1;
    elsif v_tipo = 'apagar' then
      v_id := (x->>'id')::uuid;
      update public.centroamericano_asignaciones set revocada = true, reemplazada_en = now() where id = v_id;
      if not found then raise exception 'Uno de los enlaces ya no existe. Vuelve a pedir la sugerencia.' using errcode = 'P0002'; end if;
      n_apa := n_apa + 1;
    else
      raise exception 'Acción desconocida: %.', v_tipo using errcode = '22023';
    end if;
  end loop;
  return jsonb_build_object('actualizados', n_act, 'creados', n_cre, 'apagados', n_apa);
end;
$$;

create or replace function public.centroamericano_seguir(p_token text)
returns text
language sql stable security definer set search_path = public
as $$
  select h.token
  from public.centroamericano_asignaciones a
  join public.centroamericano_asignaciones h on h.persona = a.persona and h.id <> a.id
  where a.token = p_token
    and length(coalesce(p_token, '')) >= 32
    and a.persona is not null
    and a.revocada and a.reemplazada_en is not null and a.reemplazada_en > now() - interval '24 hours'
    and not h.revocada and h.vence > now() and h.concluyo_en is null
  order by (h.tnr = a.tnr) desc, h.creada desc
  limit 1;
$$;
revoke execute on function public.centroamericano_seguir(text) from public;
grant execute on function public.centroamericano_seguir(text) to anon, authenticated;
comment on function public.centroamericano_seguir(text) is
  'Con el token de un tramo apagado por un reparto (24 h), el token vigente de la misma persona. Pública: el token es la credencial.';
