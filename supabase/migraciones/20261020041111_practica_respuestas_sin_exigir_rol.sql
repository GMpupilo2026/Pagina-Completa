-- responder_practica() ya no exige el rol «alumno»: basta con que quien contesta tenga a
-- ese profesor (es_mi_profesor). Así también contesta una persona que da clase y a la
-- vez estudia con otra (profesores_tambien_alumnos). El resto, igual.

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

  select * into v_clave from public.practica_claves
   where deck = p_deck and lamina = p_lamina and pregunta = p_pregunta;
  if not found then
    raise exception 'Esa pregunta no existe.' using errcode = '22023';
  end if;

  -- Una respuesta vacía borra la que había.
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
