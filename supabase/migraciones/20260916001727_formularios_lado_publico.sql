-- El lado público del formulario. Quien contesta no tiene sesión, así que no
-- pasa por la tabla: estas dos funciones son su única puerta. Mismo patrón que
-- registrar_arbitraje_publico() — la validación queda en el servidor y la tabla
-- no necesita ninguna política para anon.

-- Lo que se puede enseñar de un formulario abierto: ni quién lo creó ni cuándo.
create or replace function public.formulario_publico(p_slug text)
returns table (
  titulo text,
  descripcion text,
  grupo text,
  campos jsonb,
  cierra_el timestamptz
)
language sql stable security definer set search_path = public as $$
  select f.titulo, f.descripcion, f.grupo, f.campos, f.cierra_el
  from public.formularios f
  where f.slug = p_slug
    and f.abierto
    and (f.cierra_el is null or f.cierra_el > now());
$$;

revoke execute on function public.formulario_publico(text) from public;
grant execute on function public.formulario_publico(text) to anon, authenticated;

-- Guardar una respuesta. Devuelve { ok } o { ok:false, error } con un mensaje
-- que se le puede enseñar a la persona: qué campo falta, sobre todo.
create or replace function public.responder_formulario(p_slug text, p_respuestas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f record;
  campo jsonb;
  clave text;
  valor jsonb;
  texto text;
  limpias jsonb := '{}'::jsonb;
  n_opciones int;
begin
  if jsonb_typeof(p_respuestas) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'Respuestas con formato inválido');
  end if;
  -- Techo de cordura: nadie llena 20 KB a mano.
  if length(p_respuestas::text) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'La respuesta es demasiado larga');
  end if;

  select * into f from public.formularios
   where slug = p_slug and abierto and (cierra_el is null or cierra_el > now());
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Este formulario ya no está recibiendo respuestas');
  end if;

  -- Se recorre el formulario, no lo que mandaron: así una clave inventada no
  -- se guarda, y un campo obligatorio que falte se dice con su nombre.
  for campo in select * from jsonb_array_elements(f.campos) loop
    clave := campo->>'id';
    if coalesce(clave, '') = '' then continue; end if;
    valor := p_respuestas->clave;

    if valor is null or valor = 'null'::jsonb
       or (jsonb_typeof(valor) = 'string' and btrim(valor #>> '{}') = '')
       or (jsonb_typeof(valor) = 'array' and jsonb_array_length(valor) = 0) then
      if coalesce((campo->>'requerido')::boolean, false) then
        return jsonb_build_object('ok', false,
          'error', 'Falta llenar: ' || coalesce(campo->>'etiqueta', clave));
      end if;
      continue;
    end if;

    if jsonb_typeof(valor) = 'array' then
      n_opciones := jsonb_array_length(valor);
      if n_opciones > 30 then
        return jsonb_build_object('ok', false, 'error', 'Demasiadas opciones marcadas en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
      if exists (select 1 from jsonb_array_elements_text(valor) t where length(t) > 300) then
        return jsonb_build_object('ok', false, 'error', 'Una opción es demasiado larga en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
    elsif jsonb_typeof(valor) in ('string', 'number', 'boolean') then
      texto := valor #>> '{}';
      if length(texto) > 2000 then
        return jsonb_build_object('ok', false,
          'error', 'Respuesta demasiado larga en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'Respuesta con formato inválido en: ' || coalesce(campo->>'etiqueta', clave));
    end if;

    limpias := limpias || jsonb_build_object(clave, valor);
  end loop;

  insert into public.formulario_respuestas (formulario_id, respuestas, alumno_id)
  values (f.id, limpias, auth.uid());

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.responder_formulario(text, jsonb) from public;
grant execute on function public.responder_formulario(text, jsonb) to anon, authenticated;

comment on function public.responder_formulario(text, jsonb) is
  'Única puerta para contestar un formulario sin sesión. Recorre los campos del formulario, no lo que mandaron: una clave inventada no se guarda.';