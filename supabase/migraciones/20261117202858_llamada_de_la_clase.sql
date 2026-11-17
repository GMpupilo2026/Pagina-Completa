-- La llamada de voz de la clase en vivo, dentro de sesion.html.
--
-- La pidió el dueño (17/11/2026): «un Meet propio adaptado a ciegos». Para un
-- alumno ciego lo difícil de Meet no es Meet: es tener la llamada en una
-- pestaña y el tablero en otra, saltar entre las dos con el lector de pantalla
-- y que los anuncios de las dos se pisen. La voz va ahora en la misma página que
-- el tablero, por LiveKit (el servidor de audio; ver la Edge Function
-- clase-llamada). Se probó antes fuera del sitio (fase 0) y se oyó bien.
--
-- Esta migración es UNA función y nada más. A propósito:
--
--   · La sala ES la clase abierta (`class_sessions`): sin clase abierta no hay
--     llamada, y cada clase nueva es una sala nueva (un pase de la clase de
--     ayer no entra a la de hoy).
--   · Quién tiene la palabra NO se guarda en otro lado: es
--     `game_state.elegido`, el MISMO turno de «Darle la palabra» y del sorteo
--     que ya existían (lo protege protect_game_state_teacher_columns: solo un
--     profesor lo cambia, y la RLS solo en SU tablero). Una segunda cola de
--     manos para la llamada sería otra cosa que se desincroniza sin avisar, y
--     el turno ya queda anotado en clase_elegidos. Por eso no hay tabla nueva
--     ni trigger de auditoría: lo que reparte (el turno) ya se anota ahí.
--   · Quien el profe sacó de la clase (clase_sacados sin devuelto_at) no entra,
--     y la función le dice al profe quiénes son para sacarlos también de la sala.
--
-- La función contesta, para QUIEN LLAMA y sobre la clase de p_profesor:
--   null si no puede entrar (sin sesión, sin clase abierta, no es el profesor
--   ni alumno suyo, o lo sacaron), o
--   {yo, rol: 'profe'|'alumno', sala, nombre, elegido, sacados}
--   (`sacados` solo para el profe).
-- El profe tiene que ser `role = 'profesor'`: quien administra no da clase
-- (ver «El panel de quien administra no es el de un profesor»).
--
-- SECURITY DEFINER porque lee la clase, el turno y los sacados de otra persona:
-- es una API, así que se le quita a public y anon, y se deja a authenticated.
-- La Edge Function la llama con el token de quien pide (no con la clave de
-- servicio), así que pasa por antes_de_cada_pedido(): con la verificación en
-- dos pasos a medias, PostgREST corta antes de llegar acá.
--
-- Ver «La llamada de voz de la clase» en docs/decisiones/clase-en-vivo.md.

create or replace function public.llamada_de_la_clase(p_profesor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_sesion uuid;
  v_rol text;
  v_elegido uuid;
  v_texto text;
  v_nombre text;
  v_sacados jsonb;
begin
  if yo is null or p_profesor is null then
    return null;
  end if;

  select c.id into v_sesion
    from public.class_sessions c
   where c.created_by = p_profesor and c.ended_at is null
   order by c.started_at desc
   limit 1;
  if v_sesion is null then
    return null;
  end if;

  if yo = p_profesor then
    if not exists (select 1 from public.profiles p where p.id = yo and p.role = 'profesor') then
      return null;
    end if;
    v_rol := 'profe';
  elsif coalesce(public.es_mi_profesor(p_profesor), false) then
    if exists (select 1 from public.clase_sacados s
                where s.class_session_id = v_sesion and s.student_id = yo and s.devuelto_at is null) then
      return null;
    end if;
    v_rol := 'alumno';
  else
    return null;
  end if;

  -- El turno de la clase. Un id que no sea un uuid no le da la palabra a nadie
  -- (y no revienta el cast).
  select g.elegido->>'id' into v_texto from public.game_state g where g.owner_id = p_profesor;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_elegido := v_texto::uuid;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), 'Sin nombre') into v_nombre
    from public.profiles p where p.id = yo;

  if v_rol = 'profe' then
    select coalesce(jsonb_agg(s.student_id), '[]'::jsonb) into v_sacados
      from public.clase_sacados s
     where s.class_session_id = v_sesion and s.devuelto_at is null;
  end if;

  return jsonb_build_object(
    'yo', yo,
    'rol', v_rol,
    'sala', 'clase-' || v_sesion,
    'nombre', coalesce(v_nombre, 'Sin nombre'),
    'elegido', v_elegido,
    'sacados', v_sacados
  );
end;
$$;

revoke execute on function public.llamada_de_la_clase(uuid) from public, anon;
grant execute on function public.llamada_de_la_clase(uuid) to authenticated;

comment on function public.llamada_de_la_clase(uuid) is
  'La llamada de voz de la clase abierta de p_profesor, para quien llama: rol, sala y si tiene la palabra (game_state.elegido). Ver «La llamada de voz de la clase» en docs/decisiones/clase-en-vivo.md.';
