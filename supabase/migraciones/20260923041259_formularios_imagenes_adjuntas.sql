-- Imágenes adjuntas en los formularios de inscripción.
-- El público (anon) sube a un bucket PRIVADO, solo dentro de la carpeta de un
-- formulario abierto que tenga una pregunta de tipo imagen; lee quien ya puede
-- ver ese formulario (la RLS de formularios, la misma que las respuestas).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('formulario-adjuntos', 'formulario-adjuntos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.formulario_acepta_adjuntos(p_carpeta text)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.formularios f
     where f.id::text = p_carpeta
       and f.abierto
       and (f.cierra_el is null or f.cierra_el > now())
       and exists (select 1 from jsonb_array_elements(f.campos) c where c->>'tipo' = 'imagen'));
$$;
revoke execute on function public.formulario_acepta_adjuntos(text) from public;
grant execute on function public.formulario_acepta_adjuntos(text) to anon, authenticated;

create policy formulario_adjuntos_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'formulario-adjuntos'
              and public.formulario_acepta_adjuntos((storage.foldername(name))[1]));

create policy formulario_adjuntos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'formulario-adjuntos'
         and exists (select 1 from public.formularios f
                      where f.id::text = (storage.foldername(name))[1]));

create policy formulario_adjuntos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'formulario-adjuntos'
         and exists (select 1 from public.formularios f
                      where f.id::text = (storage.foldername(name))[1]
                        and (f.creado_por = auth.uid()
                             or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))));

-- El formulario público necesita su id: es el nombre de la carpeta donde sube.
drop function public.formulario_publico(text);
create function public.formulario_publico(p_slug text)
returns table(id uuid, titulo text, descripcion text, grupo text, campos jsonb, cierra_el timestamptz)
language sql stable security definer
set search_path to 'public'
as $$
  select f.id, f.titulo, f.descripcion, f.grupo, f.campos, f.cierra_el
  from public.formularios f
  where f.slug = p_slug
    and f.abierto
    and (f.cierra_el is null or f.cierra_el > now());
$$;
revoke execute on function public.formulario_publico(text) from public;
grant execute on function public.formulario_publico(text) to anon, authenticated, service_role;

create or replace function public.responder_formulario(p_slug text, p_respuestas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f record;
  campo jsonb;
  clave text;
  valor jsonb;
  texto text;
  limpias jsonb := '{}'::jsonb;
  n_opciones int;
  ruta text;
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

    if campo->>'tipo' = 'imagen' then
      -- Una imagen es la RUTA de un archivo ya subido, y tiene que ser de ESTE
      -- formulario y existir de verdad: si no, una respuesta podría apuntar a
      -- la foto de otro formulario o a un archivo que no está.
      if jsonb_typeof(valor) <> 'array' or jsonb_array_length(valor) > 5 then
        return jsonb_build_object('ok', false, 'error', 'Imágenes inválidas en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
      for ruta in select jsonb_array_elements_text(valor) loop
        if ruta !~ ('^' || f.id::text || '/[a-z0-9-]{8,64}\.(jpg|png|webp)$')
           or not exists (select 1 from storage.objects o
                           where o.bucket_id = 'formulario-adjuntos' and o.name = ruta) then
          return jsonb_build_object('ok', false, 'error', 'Una imagen no se subió bien en: ' || coalesce(campo->>'etiqueta', clave));
        end if;
      end loop;
    elsif jsonb_typeof(valor) = 'array' then
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
$function$;