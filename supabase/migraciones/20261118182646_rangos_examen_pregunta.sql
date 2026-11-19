-- El banco de los exámenes de rango se guarda compacto (herramientas/
-- rangos-examen-banco.js: 60 preguntas por rango, ~90 KB en vez de 300): la
-- pregunta completa, con la forma exacta que arma ExamenBanco.deTactica()
-- (tipo 'jugada', banco 'tactica', visible {enunciado, fen, explica}, clave
-- {jugadas}), la rearma esta función al crear el examen.
--   a = área (el tema), p = peso, e = enunciado, f = fen, x = explica, j = jugadas
create or replace function interno.pregunta_de_rango(p_item jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'tipo', 'jugada', 'banco', 'tactica', 'area', p_item->>'a', 'peso', (p_item->>'p')::integer,
    'visible', jsonb_build_object('enunciado', p_item->>'e', 'fen', p_item->>'f', 'explica', p_item->>'x'),
    'clave', jsonb_build_object('jugadas', p_item->'j'));
$$;
revoke all on function interno.pregunta_de_rango(jsonb) from public, anon, authenticated;

create or replace function interno.revisar_examen_rango(p_alumno uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_pend uuid;
  v_actual text;
  v_sig text;
  v_prof uuid;
  v_examen uuid;
begin
  if p_alumno is null or coalesce((select role from public.profiles where id = p_alumno), '') <> 'alumno' then
    return null;
  end if;
  -- Uno pendiente que venció sin entregarse cuenta como reprobado.
  select examen_id into v_pend from public.rango_examenes where alumno_id = p_alumno and resultado = 'pendiente';
  if v_pend is not null then
    if interno.resolver_examen_rango(v_pend) = 'pendiente' then return v_pend; end if;
  end if;

  v_actual := coalesce((select rango from public.rangos_alumno where alumno_id = p_alumno), 'peon');
  v_sig := interno.rango_siguiente(v_actual);
  if v_sig is null or interno.puntos_para_rango(p_alumno) < interno.umbral_rango(v_sig) then
    return null;
  end if;
  -- Sin banco para ese rango no se arma un examen vacío.
  if not exists (select 1 from interno.rango_examen_banco where rango = v_sig) then return null; end if;

  select x into v_prof from interno.profesores_de(p_alumno) x order by x limit 1;
  if v_prof is null then
    select a.supervisor_id into v_prof from public.academia_miembros m join public.academias a on a.id = m.academia_id
     where m.persona_id = p_alumno and a.supervisor_id is not null order by a.nombre limit 1;
  end if;
  if v_prof is null then return null; end if;

  insert into public.examenes (profesor_id, alumno_id, titulo, instrucciones, minutos, vence_at, salidas_permitidas)
  values (v_prof, p_alumno, 'Examen de rango: ' || interno.nombre_rango(v_sig),
          'Juntaste los puntos para subir a ' || interno.nombre_rango(v_sig) || '. Diez ejercicios de táctica: se aprueba con el 70 %. '
          || 'Si lo apruebas, subes de rango y recibes tu diploma. Si no, se te restan 500 puntos del avance y, cuando los vuelvas a juntar, te sale otra vez.',
          20, now() + interval '7 days', 2)
  returning id into v_examen;

  insert into public.examen_items (examen_id, orden, tipo, banco, item_id, area, peso, visible, clave)
  select v_examen, row_number() over () - 1, q->>'tipo', q->>'banco', b.item_id, q->>'area',
         (q->>'peso')::integer, q->'visible', q->'clave'
    from (select item_id, interno.pregunta_de_rango(item) q
            from interno.rango_examen_banco where rango = v_sig order by random() limit 10) b;

  insert into public.rango_examenes (examen_id, alumno_id, rango) values (v_examen, p_alumno, v_sig);
  return v_examen;
end;
$$;
revoke all on function interno.revisar_examen_rango(uuid) from public, anon, authenticated;
