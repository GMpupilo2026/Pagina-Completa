-- El reparto de los árbitros desde el plano de la sala (centroamericano-mesas.html, «Plano de la sala»).
-- Ver «El reparto de los árbitros desde el plano» en docs/decisiones/juegos-y-torneos.md.
--
-- 1. centroamericano_asignaciones.experiencia: el nivel del árbitro que pone la organización (3 internacional,
--    2 FIDE, 1 nacional, 0 en formación; null sin dato). Va en cada tramo y la página lo pone igual en todos
--    los de la misma persona. Solo lo lee la organización (la misma política de la tabla).
-- 2. centroamericano_reparto_tasas(): por torneo, cuántas partidas tienen resultado y cuántas incidencias
--    hubo (ilegales, irregularidades, incidencias y correcciones que nadie anuló, más los pedidos de ayuda
--    de los árbitros). La cuenta se hace acá y no en el navegador: el registro pasa de mil filas.
--    SECURITY INVOKER: la ve quien ya ve el registro (la organización).
-- 3. centroamericano_reparto_aplicar(p_acciones): lo que se aprobó en el plano, en UNA transacción: o se
--    cambian todas las mesas, o ninguna. SECURITY INVOKER a propósito: corre con las mismas políticas y
--    los mismos permisos por columna que ya tiene la organización para crear, cambiar y apagar enlaces;
--    no abre nada nuevo. Revisa la forma de cada acción y que sea de un enlace vigente.

alter table public.centroamericano_asignaciones add column experiencia smallint check (experiencia between 0 and 3);
comment on column public.centroamericano_asignaciones.experiencia is
  'Nivel del árbitro para el reparto desde el plano: 3 internacional (AI), 2 FIDE (AF), 1 nacional, 0 en formación; null sin dato. Lo pone la organización.';
grant insert (experiencia) on public.centroamericano_asignaciones to authenticated;
grant update (experiencia) on public.centroamericano_asignaciones to authenticated;

create or replace function public.centroamericano_reparto_tasas()
returns table (tnr text, partidas bigint, incidencias bigint)
language sql stable security invoker set search_path = public
as $$
  with anuladas as (
    select r.anula from public.centroamericano_registro r where r.tipo = 'anulacion' and r.anula is not null
  ), partidas as (
    select r.tnr, count(distinct (r.ronda, r.mesa)) as n
    from public.centroamericano_registro r
    where r.tipo = 'resultado'
    group by r.tnr
  ), incid as (
    select r.tnr, count(*) as n
    from public.centroamericano_registro r
    where r.tipo in ('ilegal', 'irregularidad', 'incidencia', 'correccion')
      and r.id not in (select anula from anuladas)
    group by r.tnr
  ), ayudas as (
    select a.tnr, count(*) as n
    from public.centroamericano_avisos v
    join public.centroamericano_asignaciones a on a.id = v.asignacion_id
    where v.de = 'arbitro' and v.tipo = 'ayuda'
    group by a.tnr
  )
  select t.tnr, coalesce(p.n, 0), coalesce(i.n, 0) + coalesce(y.n, 0)
  from public.centroamericano_torneos t
  left join partidas p on p.tnr = t.tnr
  left join incid i on i.tnr = t.tnr
  left join ayudas y on y.tnr = t.tnr
  where not coalesce(t.prueba, false) and not coalesce(t.archivado, false);
$$;
revoke execute on function public.centroamericano_reparto_tasas() from public, anon;
grant execute on function public.centroamericano_reparto_tasas() to authenticated;

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
      update public.centroamericano_asignaciones set revocada = true where id = v_id;
      if not found then raise exception 'Uno de los enlaces ya no existe. Vuelve a pedir la sugerencia.' using errcode = 'P0002'; end if;
      n_apa := n_apa + 1;
    else
      raise exception 'Acción desconocida: %.', v_tipo using errcode = '22023';
    end if;
  end loop;
  return jsonb_build_object('actualizados', n_act, 'creados', n_cre, 'apagados', n_apa);
end;
$$;
revoke execute on function public.centroamericano_reparto_aplicar(jsonb) from public, anon;
grant execute on function public.centroamericano_reparto_aplicar(jsonb) to authenticated;
comment on function public.centroamericano_reparto_aplicar(jsonb) is
  'Aplica en una transacción el reparto de árbitros aprobado en el plano: actualizar (id, desde, hasta, persona), crear (tnr, desde, hasta, persona, arbitro, nombrado, vence, experiencia) y apagar (id). SECURITY INVOKER: rigen las políticas de la tabla.';
