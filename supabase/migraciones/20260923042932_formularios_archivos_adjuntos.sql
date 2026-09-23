-- Los formularios reciben también documentos (PDF, Word, Excel), no solo
-- fotos: tipo de pregunta 'archivo'. La ruta lleva el nombre original.
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id = 'formulario-adjuntos';

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
       and exists (select 1 from jsonb_array_elements(f.campos) c where c->>'tipo' in ('imagen', 'archivo')));
$$;

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

    if campo->>'tipo' in ('imagen', 'archivo') then
      -- Un adjunto es la RUTA de un archivo ya subido, y tiene que ser de ESTE
      -- formulario y existir de verdad: si no, una respuesta podría apuntar al
      -- archivo de otro formulario o a uno que no está. La ruta es
      -- <formulario>/<id>/<nombre>.<ext>; una pregunta de imagen solo admite
      -- imágenes.
      if jsonb_typeof(valor) <> 'array' or jsonb_array_length(valor) > 5 then
        return jsonb_build_object('ok', false, 'error', 'Archivos inválidos en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
      for ruta in select jsonb_array_elements_text(valor) loop
        if ruta !~ ('^' || f.id::text || '/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.('
                    || case when campo->>'tipo' = 'imagen' then 'jpg|png|webp'
                            else 'jpg|png|webp|pdf|doc|docx|xls|xlsx' end || ')$')
           or not exists (select 1 from storage.objects o
                           where o.bucket_id = 'formulario-adjuntos' and o.name = ruta) then
          return jsonb_build_object('ok', false, 'error', 'Un archivo no se subió bien en: ' || coalesce(campo->>'etiqueta', clave));
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