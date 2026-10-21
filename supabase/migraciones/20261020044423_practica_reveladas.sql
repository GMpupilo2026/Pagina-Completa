-- Mostrar a los alumnos la respuesta de la práctica (js/clase-formacion-respuestas.js).
--
-- Las respuestas modelo —con su artículo— viven en practica_claves y solo las lee
-- quien da clase. Cuando el profe termina de analizar una lámina con el grupo,
-- decide mostrarla: la marca en game_state.practica.reveladas (los números de
-- lámina), la misma columna que ya solo el profe escribe (el trigger se la
-- devuelve a cualquier otro). Desde ahí:
--
--  * respuestas_reveladas_practica(envio) le da a quien tiene a ese profe la
--    respuesta modelo de las láminas reveladas (y NADA de las demás), con cómo le
--    fue a él en cada pregunta que se corrige sola.
--  * responder_practica() ya no recibe respuestas de una lámina revelada: con la
--    respuesta a la vista se podría «contestar» copiándola, y el registro de lo
--    que cada uno sabía antes del análisis dejaría de valer.
--
-- El CHECK del campo (en coalesce(…, false): un CHECK que da NULL aprueba) sigue
-- pidiendo la forma de siempre y acepta `reveladas` opcional: una lista de hasta 40
-- números de lámina. (CASE: el orden de un AND no está garantizado y
-- jsonb_array_length sobre algo que no es un arreglo da error en vez de false.)

alter table public.game_state drop constraint if exists game_state_practica_forma;
alter table public.game_state add constraint game_state_practica_forma
  check (practica is null or coalesce(jsonb_typeof(practica) = 'object'
         and length(practica::text) <= 1500
         and jsonb_typeof(practica->'id') = 'string'
         and char_length(practica->>'id') between 4 and 40
         and jsonb_typeof(practica->'deck') = 'string'
         and (practica->>'deck') ~ '^[a-z0-9-]{1,60}/[a-z0-9-]{1,40}$'
         and jsonb_typeof(practica->'titulo') = 'string'
         and char_length(practica->>'titulo') between 1 and 160
         and jsonb_typeof(practica->'laminas') = 'array'
         and (case when jsonb_typeof(practica->'laminas') = 'array'
                   then jsonb_array_length(practica->'laminas') between 1 and 40 else false end)
         and not jsonb_path_exists(practica, '$.laminas[*] ? (@.type() != "number" || @ < 1 || @ > 500 || @ != @.floor())')
         and (not practica ? 'reveladas'
              or (jsonb_typeof(practica->'reveladas') = 'array'
                  and (case when jsonb_typeof(practica->'reveladas') = 'array'
                            then jsonb_array_length(practica->'reveladas') <= 40 else false end)
                  and not jsonb_path_exists(practica, '$.reveladas[*] ? (@.type() != "number" || @ < 1 || @ > 500 || @ != @.floor())'))), false));

create or replace function public.responder_practica(
  p_envio text, p_deck text, p_lamina integer, p_pregunta text, p_respuesta text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_owner uuid;
  v_practica jsonb;
  v_clave public.practica_claves%rowtype;
  v_correcta boolean;
  v_buenas integer;
  v_total integer;
  v_arr jsonb;
  v_extras boolean;
begin
  if yo is null or not coalesce(public.acceso_vigente(), false) then
    raise exception 'Sin acceso vigente.' using errcode = '42501';
  end if;
  if p_respuesta is null or char_length(p_respuesta) > 4000 then
    raise exception 'La respuesta no tiene la forma esperada.' using errcode = '22023';
  end if;

  -- Contesta quien tiene a ese profesor (es_mi_profesor) y la práctica es la que
  -- su profe tiene ahora en la clase: no se mira el rol, para que también
  -- conteste una persona que da clase y a la vez estudia con otra.
  select g.owner_id, g.practica into v_owner, v_practica
    from public.game_state g
   where g.practica->>'id' = p_envio and public.es_mi_profesor(g.owner_id)
   limit 1;
  if v_owner is null or v_practica->>'deck' is distinct from p_deck
     or not coalesce((v_practica->'laminas') @> to_jsonb(p_lamina), false) then
    raise exception 'Esa práctica ya no está en tu clase.' using errcode = '22023';
  end if;
  -- Con la respuesta ya a la vista no se contesta: el registro es de lo que sabía antes.
  if coalesce((v_practica->'reveladas') @> to_jsonb(p_lamina), false) then
    raise exception 'Tu profe ya mostró la respuesta de esta lámina.' using errcode = '22023';
  end if;

  select * into v_clave from public.practica_claves
   where deck = p_deck and lamina = p_lamina and pregunta = p_pregunta;
  if not found then
    raise exception 'Esa pregunta no existe.' using errcode = '22023';
  end if;

  if btrim(p_respuesta) = '' or (v_clave.tipo = 'planilla' and p_respuesta in ('[]', '[""]')) then
    delete from public.practica_respuestas
     where envio = p_envio and student_id = yo and deck = p_deck and lamina = p_lamina and pregunta = p_pregunta;
    return jsonb_build_object('guardada', true);
  end if;

  if v_clave.tipo = 'opciones' then
    v_correcta := btrim(p_respuesta) = v_clave.clave->>'correcta';
  elsif v_clave.tipo = 'planilla' then
    begin
      v_arr := p_respuesta::jsonb;
    exception when others then
      raise exception 'La planilla no tiene la forma esperada.' using errcode = '22023';
    end;
    if jsonb_typeof(v_arr) <> 'array' or jsonb_array_length(v_arr) > 80 then
      raise exception 'La planilla no tiene la forma esperada.' using errcode = '22023';
    end if;
    v_total := jsonb_array_length(v_clave.clave);
    select count(*) into v_buenas
      from jsonb_array_elements_text(v_clave.clave) with ordinality k(jugada, i)
     where interno.norma_jugada(v_arr->>((k.i - 1)::int)) = interno.norma_jugada(k.jugada);
    select exists (
      select 1 from jsonb_array_elements_text(v_arr) with ordinality a(jugada, i)
       where a.i > v_total and interno.norma_jugada(a.jugada) <> '') into v_extras;
    v_correcta := v_buenas = v_total and not v_extras;
  end if;

  insert into public.practica_respuestas
    (owner_id, student_id, envio, titulo, deck, lamina, pregunta, respuesta, correcta, buenas, total)
  values (v_owner, yo, p_envio, v_practica->>'titulo', p_deck, p_lamina, p_pregunta, p_respuesta, v_correcta, v_buenas, v_total)
  on conflict (envio, student_id, deck, lamina, pregunta) do update
    set respuesta = excluded.respuesta, correcta = excluded.correcta,
        buenas = excluded.buenas, total = excluded.total, updated_at = now();
  return jsonb_build_object('guardada', true);
end;
$$;
revoke execute on function public.responder_practica(text, text, integer, text, text) from public, anon;
grant execute on function public.responder_practica(text, text, integer, text, text) to authenticated;

-- Las respuestas que su profe mostró (y solo esas), con cómo le fue a quien pregunta.
create or replace function public.respuestas_reveladas_practica(p_envio text)
returns table (deck text, lamina integer, pregunta text, tipo text, opcion text, modelo text,
               respondio boolean, correcta boolean, buenas integer, total integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.deck, c.lamina, c.pregunta, c.tipo,
         case when c.tipo = 'opciones' then c.clave->>'correcta' end,
         c.modelo,
         r.id is not null, r.correcta, r.buenas, r.total
    from public.game_state g
    join public.practica_claves c
      on c.deck = g.practica->>'deck' and (g.practica->'reveladas') @> to_jsonb(c.lamina)
    left join public.practica_respuestas r
      on r.envio = p_envio and r.student_id = (select auth.uid())
     and r.deck = c.deck and r.lamina = c.lamina and r.pregunta = c.pregunta
   where g.practica->>'id' = p_envio and public.es_mi_profesor(g.owner_id);
$$;
revoke execute on function public.respuestas_reveladas_practica(text) from public, anon;
grant execute on function public.respuestas_reveladas_practica(text) to authenticated;
