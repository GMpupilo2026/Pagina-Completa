-- El banco del diagnóstico se podía bajar sin cuenta, con las respuestas.
--
-- diagnostico_items_para_examen(p_ids) devuelve, por cada pregunta, lo visible
-- Y la clave (la opción correcta, las jugadas, las casillas) con su explicación.
-- Es solo para armar exámenes: profesor o administración. Pero:
--
--   1. El permiso iba `if not (coalesce(v_admin, false) or v_role = 'profesor')`.
--      Sin sesión, my_profile() no da filas y v_role queda NULL. En SQL,
--      `false or NULL` es NULL, `not NULL` es NULL, y el IF con NULL NO entra:
--      no rechazaba. Es el caso que el núcleo (CLAUDE.md) manda envolver en
--      coalesce(..., false) sobre TODO el `or`, no sobre cada término.
--   2. `anon` tenía execute igual (has_function_privilege comprobado en vivo el
--      2026-11-18): el `revoke all … from public` de la migración original no
--      alcanzó, así que la clave quedaba a un POST de distancia para cualquiera
--      con la clave pública: diagnostico_armar (abierta a propósito) da ids al
--      azar, y estos ids se cambiaban por la clave.
--
-- Dos capas, para que ninguna sola sea el único freno: se arregla el coalesce
-- (aunque anon llegue, rechaza) y se le quita el execute a anon (no llega).
-- No cambia nada para quien da clase: sigue con `authenticated` + el permiso.

create or replace function public.diagnostico_items_para_examen(p_ids text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role text;
  v_admin boolean;
  it record;
  v_perm int[];
  v_n int;
  v_opciones jsonb;
  v_nueva int;
  v_visible jsonb;
  v_clave jsonb;
  v_salida jsonb := '[]'::jsonb;
begin
  select mp.role, mp.is_admin into v_role, v_admin from public.my_profile() mp(role, is_admin, teacher_id);
  if not coalesce(v_admin or v_role = 'profesor', false) then
    raise exception 'Esto es solo para quien da clase.';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return '[]'::jsonb;
  end if;
  if array_length(p_ids, 1) > 100 then
    raise exception 'Como mucho 100 preguntas de una vez.';
  end if;

  for it in select * from public.diagnostico_items where id = any(p_ids) loop
    if it.tipo in ('opcion', 'opcion_tablero') then
      v_n := jsonb_array_length(it.opciones);
      select array_agg(g order by random()) into v_perm from generate_series(0, v_n - 1) g;
      select jsonb_agg(it.opciones -> v_perm[gi]) into v_opciones from generate_series(1, v_n) gi;
      v_nueva := array_position(v_perm, it.correcta) - 1;
      v_visible := jsonb_build_object('enunciado', it.enunciado, 'opciones', v_opciones,
                                       'fen', it.fen, 'explica', coalesce(it.explica, ''));
      v_clave := jsonb_build_object('correcta', v_nueva::text);
    elsif it.tipo = 'jugada' then
      v_visible := jsonb_build_object('enunciado', it.enunciado, 'fen', it.fen, 'explica', coalesce(it.explica, ''));
      select jsonb_build_object('jugadas', coalesce(jsonb_agg(jsonb_build_object('from', j->>'from', 'to', j->>'to')), '[]'::jsonb))
        into v_clave
        from (select it.solucion as j union all select jsonb_array_elements(coalesce(it.alternas, '[]'::jsonb))) alt(j);
    else
      v_visible := jsonb_build_object('enunciado', it.enunciado, 'fen', it.fen, 'explica', coalesce(it.explica, ''));
      select jsonb_build_object('casillas', coalesce(jsonb_agg(c), '[]'::jsonb))
        into v_clave
        from (select it.solucion #>> '{}' as c union all select jsonb_array_elements_text(coalesce(it.alternas, '[]'::jsonb))) alt(c);
    end if;

    v_salida := v_salida || jsonb_build_array(jsonb_build_object(
      'tipo', it.tipo, 'banco', 'diagnostico', 'item_id', it.id,
      'area', it.area, 'peso', it.peso, 'visible', v_visible, 'clave', v_clave));
  end loop;

  return v_salida;
end;
$$;

revoke all on function public.diagnostico_items_para_examen(text[]) from public, anon;
grant execute on function public.diagnostico_items_para_examen(text[]) to authenticated;
