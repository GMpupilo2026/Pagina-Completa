-- ===================================================================
-- El banco del diagnóstico de nivel deja de viajar entero al navegador.
--
-- Hasta ahora las 301 preguntas —con su respuesta correcta y su
-- explicación— vivían en js/diagnostico-items.js, un archivo que el
-- worker sirve igual que cualquier otro: cualquiera podía bajarlo
-- completo escribiendo su dirección directo, sin pasar por ninguna
-- página ni ninguna sesión. Ver «Diagnóstico» en
-- docs/decisiones/entrenamiento.md.
--
-- Acá vive ahora el banco, detrás de RLS y sin ninguna política de
-- select para `anon` ni `authenticated`: se llega a él solo por estas
-- funciones SECURITY DEFINER, que entregan lo que a cada quien le toca
-- y nada más:
--
--   diagnostico_armar()                  — arma una prueba nueva (60
--                                           ítems) y entrega solo lo
--                                           VISIBLE (nunca la clave).
--   diagnostico_sesion_estado(sesión)     — retoma una prueba a medias.
--   diagnostico_responder(sesión, ítem,
--                          respuesta)     — califica en el servidor y
--                                           dice si acertó; la prueba
--                                           sigue sin decir nada más.
--   diagnostico_terminar(sesión)          — ya con la prueba cerrada,
--                                           entrega la clave de ESOS
--                                           60 ítems para la revisión
--                                           final (como una hoja de
--                                           examen corregida).
--   diagnostico_items_para_examen(ids)    — para quien da clase: arma
--                                           las preguntas listas para
--                                           crear_examen(), sin que el
--                                           banco entero pase por su
--                                           navegador.
--
-- `arbitraje-items.js` y `aperturas-lineas.js` quedan igual por ahora:
-- es la misma fuga, pero en otro banco, para otra vez.
-- ===================================================================

create table if not exists public.diagnostico_items (
  id text primary key,
  area text not null,
  tipo text not null check (tipo in ('opcion','opcion_tablero','jugada','casilla')),
  peso integer not null check (peso between 1 and 5),
  elo integer not null,
  elo_base integer not null,
  enunciado text not null,
  -- Solo tipo 'opcion'/'opcion_tablero'.
  opciones jsonb,
  -- Todos menos 'opcion' sin tablero.
  fen text,
  -- Lo que no puede leer nadie por fuera de las funciones de abajo:
  correcta integer,   -- índice en `opciones` (tipo opción)
  solucion jsonb,      -- {"from","to"} (jugada) o una casilla en texto (casilla)
  alternas jsonb,      -- otras soluciones que también valen
  explica text not null default '',
  -- Metadatos de origen (Lichess), no son secretos pero tampoco hacen
  -- falta en el navegador: viven acá igual que todo lo demás.
  lichess text,
  rating integer,
  updated_at timestamptz not null default now()
);
comment on table public.diagnostico_items is 'El banco del diagnóstico de nivel. Sin política de select: solo lo leen las funciones diagnostico_* (SECURITY DEFINER).';

alter table public.diagnostico_items enable row level security;
-- A propósito, ninguna política: ni anon ni authenticated leen esta
-- tabla directo. Todo pasa por las funciones de abajo.

create table if not exists public.diagnostico_sesiones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  items text[] not null,
  respondidas jsonb not null default '{}'::jsonb,
  terminada boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.diagnostico_sesiones is 'La prueba que alguien está haciendo o ya hizo: qué 60 ítems le tocaron y qué contestó. Sin política de select/update: solo las funciones diagnostico_*.';
create index if not exists diagnostico_sesiones_user_idx on public.diagnostico_sesiones (user_id, created_at desc);

alter table public.diagnostico_sesiones enable row level security;
-- Tampoco acá: los ids son uuid al azar, pero igual no hace falta
-- arriesgar nada con una política — nadie necesita leer esta tabla
-- directo, ni siquiera su propia fila.

-- -------------------------------------------------------------------
-- Arma una prueba nueva: sortea 60 ítems con la misma cuota de FORMA
-- (DiagnosticoPrueba.FORMA en js/diagnostico-items.js) y entrega solo
-- lo visible. Abierta a anon: el diagnóstico también lo hacen
-- visitantes sin cuenta.
-- -------------------------------------------------------------------
create or replace function public.diagnostico_armar()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_forma jsonb := '{
    "reglas":     {"1":1,"2":1,"3":1,"4":2,"5":0},
    "material":   {"1":1,"2":1,"3":1,"4":2,"5":1},
    "apertura":   {"1":1,"2":1,"3":1,"4":2,"5":1},
    "tactica":    {"1":1,"2":1,"3":2,"4":2,"5":3},
    "mate":       {"1":1,"2":1,"3":2,"4":2,"5":2},
    "finales":    {"1":1,"2":1,"3":2,"4":2,"5":2},
    "estrategia": {"1":1,"2":1,"3":1,"4":1,"5":2},
    "calculo":    {"1":0,"2":2,"3":1,"4":2,"5":2},
    "maestria":   {"1":1,"2":1,"3":1,"4":1,"5":1}
  }'::jsonb;
  v_areas text[] := array['reglas','material','apertura','tactica','mate','finales','estrategia','calculo','maestria'];
  v_area text;
  v_peso int;
  v_cuota int;
  v_elegidos text[] := '{}';
  v_sesion uuid;
  v_items jsonb;
begin
  foreach v_area in array v_areas loop
    for v_peso in 1..5 loop
      v_cuota := coalesce((v_forma->v_area->>v_peso::text)::int, 0);
      if v_cuota > 0 then
        v_elegidos := v_elegidos || array(
          select id from public.diagnostico_items
          where area = v_area and peso = v_peso and not (id = any(v_elegidos))
          order by random() limit v_cuota
        );
      end if;
    end loop;
  end loop;

  insert into public.diagnostico_sesiones (user_id, items)
  values (auth.uid(), v_elegidos)
  returning id into v_sesion;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'area', i.area, 'peso', i.peso, 'elo', i.elo, 'eloBase', i.elo_base,
           'tipo', i.tipo, 'enunciado', i.enunciado, 'opciones', i.opciones, 'fen', i.fen
         ) order by array_position(v_elegidos, i.id)), '[]'::jsonb)
    into v_items
    from public.diagnostico_items i
    where i.id = any(v_elegidos);

  return jsonb_build_object('sesion', v_sesion, 'items', v_items);
end;
$$;

revoke all on function public.diagnostico_armar() from public;
grant execute on function public.diagnostico_armar() to anon, authenticated;

-- -------------------------------------------------------------------
-- Retomar una prueba a medias (se recargó la página, o se volvió otro
-- día): los mismos 60 ítems, en el mismo orden, con lo ya contestado.
-- -------------------------------------------------------------------
create or replace function public.diagnostico_sesion_estado(p_sesion uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.diagnostico_sesiones%rowtype;
  v_items jsonb;
begin
  select * into s from public.diagnostico_sesiones where id = p_sesion;
  if not found then raise exception 'Esa prueba ya no está disponible.'; end if;
  if s.user_id is distinct from auth.uid() then
    raise exception 'Esa prueba no es tuya.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'area', i.area, 'peso', i.peso, 'elo', i.elo, 'eloBase', i.elo_base,
           'tipo', i.tipo, 'enunciado', i.enunciado, 'opciones', i.opciones, 'fen', i.fen
         ) order by array_position(s.items, i.id)), '[]'::jsonb)
    into v_items
    from public.diagnostico_items i
    where i.id = any(s.items);

  return jsonb_build_object('sesion', s.id, 'items', v_items,
                             'respondidas', s.respondidas, 'terminada', s.terminada);
end;
$$;

revoke all on function public.diagnostico_sesion_estado(uuid) from public;
grant execute on function public.diagnostico_sesion_estado(uuid) to anon, authenticated;

-- -------------------------------------------------------------------
-- Califica UNA respuesta en el servidor y dice si acertó — nada más:
-- ni la clave, ni la explicación. Eso solo se entrega al cerrar la
-- prueba entera (diagnostico_terminar), igual que hoy no se dice nada
-- hasta el resultado final.
-- -------------------------------------------------------------------
create or replace function public.diagnostico_responder(p_sesion uuid, p_item text, p_respuesta jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.diagnostico_sesiones%rowtype;
  it public.diagnostico_items%rowtype;
  v_ok boolean := false;
begin
  select * into s from public.diagnostico_sesiones where id = p_sesion for update;
  if not found then raise exception 'Esa prueba ya no está disponible.'; end if;
  if s.user_id is distinct from auth.uid() then
    raise exception 'Esa prueba no es tuya.';
  end if;
  if s.terminada then raise exception 'Esa prueba ya se cerró.'; end if;
  if not (p_item = any(s.items)) then
    raise exception 'Esa pregunta no es parte de esta prueba.';
  end if;

  select * into it from public.diagnostico_items where id = p_item;
  if not found then raise exception 'Esa pregunta ya no está en el banco.'; end if;

  if coalesce((p_respuesta->>'nose')::boolean, false) then
    v_ok := false;
  elsif it.tipo in ('opcion','opcion_tablero') then
    v_ok := (p_respuesta->>'opcion') is not null
        and (p_respuesta->>'opcion')::int = it.correcta;
  elsif it.tipo = 'casilla' then
    v_ok := (p_respuesta->>'casilla') is not null
        and ((p_respuesta->>'casilla') = (it.solucion #>> '{}')
             or exists (select 1 from jsonb_array_elements_text(coalesce(it.alternas, '[]'::jsonb)) a
                        where a = (p_respuesta->>'casilla')));
  elsif it.tipo = 'jugada' then
    v_ok := exists (
      select 1 from (
        select it.solucion as j
        union all
        select jsonb_array_elements(coalesce(it.alternas, '[]'::jsonb))
      ) alt(j)
      where (alt.j->>'from') = (p_respuesta->>'from') and (alt.j->>'to') = (p_respuesta->>'to')
    );
  end if;

  update public.diagnostico_sesiones
     set respondidas = respondidas || jsonb_build_object(p_item, jsonb_build_object('dada', p_respuesta, 'ok', v_ok))
   where id = p_sesion;

  -- Se vuelve a leer `respondidas` tal como queda, no la variable `s` de
  -- arriba: si se contara sobre `s`, esta última respuesta nunca se vería
  -- a sí misma y la prueba nunca se marcaría terminada en la pregunta 60.
  update public.diagnostico_sesiones
     set terminada = true
   where id = p_sesion
     and not terminada
     and (select count(*) from jsonb_object_keys(respondidas)) >= coalesce(array_length(items, 1), 0);

  return v_ok;
end;
$$;

revoke all on function public.diagnostico_responder(uuid, text, jsonb) from public;
grant execute on function public.diagnostico_responder(uuid, text, jsonb) to anon, authenticated;

-- -------------------------------------------------------------------
-- La prueba ya está cerrada: entrega la clave de ESOS 60 ítems, para
-- la revisión final. No sirve si todavía falta alguna por contestar —
-- si sirviera, cualquiera podría usarla para espiar las que le faltan.
-- -------------------------------------------------------------------
create or replace function public.diagnostico_terminar(p_sesion uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.diagnostico_sesiones%rowtype;
  v_items jsonb;
begin
  select * into s from public.diagnostico_sesiones where id = p_sesion;
  if not found then raise exception 'Esa prueba ya no está disponible.'; end if;
  if s.user_id is distinct from auth.uid() then
    raise exception 'Esa prueba no es tuya.';
  end if;
  if not s.terminada then
    raise exception 'Todavía faltan preguntas por contestar.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'area', i.area, 'peso', i.peso, 'elo', i.elo, 'eloBase', i.elo_base,
           'tipo', i.tipo, 'enunciado', i.enunciado, 'opciones', i.opciones, 'fen', i.fen,
           'correcta', i.correcta, 'solucion', i.solucion, 'alternas', i.alternas, 'explica', i.explica
         ) order by array_position(s.items, i.id)), '[]'::jsonb)
    into v_items
    from public.diagnostico_items i
    where i.id = any(s.items);

  return v_items;
end;
$$;

revoke all on function public.diagnostico_terminar(uuid) from public;
grant execute on function public.diagnostico_terminar(uuid) to anon, authenticated;

-- -------------------------------------------------------------------
-- Para examenes.html: quien da clase ya eligió CUÁLES ítems (con
-- ExamenBanco.armar(), que ahora sortea sobre el catálogo público —sin
-- respuestas— en js/diagnostico-catalogo.js). Esto entrega esos pocos
-- ítems ya armados como visible/clave, listos para crear_examen():
-- el mismo formato que ya construían deOpcion/deJugada/deCasilla en
-- js/examen-banco.js, ahora armado acá para que el banco entero no
-- tenga que pasar por el navegador de quien da clase.
--
-- Solo profesor o administración: un alumno no tiene por qué llegar a
-- esta función, y si llegara, pedir los 301 ids de una sentada le
-- devolvería la clave de todos. El filtro de ANTES (que el alumno no
-- lee examen_items.clave) no alcanza para proteger ESTA función.
-- -------------------------------------------------------------------
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
  if not (coalesce(v_admin, false) or v_role = 'profesor') then
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

revoke all on function public.diagnostico_items_para_examen(text[]) from public;
grant execute on function public.diagnostico_items_para_examen(text[]) to authenticated;
