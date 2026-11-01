-- Centroamericano 2026: el control de tiempos lleva las jugadas de CADA color.
--
-- Hasta ahora una lectura traía una sola «jugada en que va». El árbitro ahora anota, por mesa,
-- lo que marca el reloj de las blancas y cuántas jugadas lleva, y lo mismo con las negras. Son
-- dos columnas nuevas (nulas en las lecturas viejas, que solo tenían la jugada); `jugada` sigue
-- siendo la mayor de las dos para no tocar nada de lo que ya la lee. Nada se borra ni se
-- cambia: solo se agregan columnas, y «restaurar» las incluye.
-- La foto de las planillas pasa a ser UNA por mesa (las dos planillas juntas) y se guarda en la
-- misma fila de siempre (lado = 'blancas'), así que no hay nada que cambiar en esa tabla.

alter table public.centroamericano_tiempos add column j_blancas integer check (j_blancas between 0 and 400);
alter table public.centroamericano_tiempos add column j_negras integer check (j_negras between 0 and 400);
comment on column public.centroamericano_tiempos.j_blancas is
  'Jugadas que lleva el jugador de blancas cuando el árbitro leyó los relojes (null en las lecturas viejas, que solo traían `jugada`).';
comment on column public.centroamericano_tiempos.j_negras is
  'Jugadas que lleva el jugador de negras cuando el árbitro leyó los relojes (null en las lecturas viejas).';
comment on column public.centroamericano_planillas.lado is
  'Desde el 1 de noviembre la foto es UNA por mesa, con las dos planillas juntas, y se guarda con lado = blancas. «negras» solo queda en fotos de prueba de antes.';

create or replace function public.centroamericano_restaurar(p_copia jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := (select auth.uid());
  v_a integer; v_r integer; v_v integer; v_p integer; v_f integer; v_l integer; v_n integer; v_s integer; v_t integer;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if p_copia is null or jsonb_typeof(p_copia) <> 'object' or (p_copia->>'version') is distinct from '1' or p_copia->>'evento' is distinct from 'Centroamericano 2026' then
    raise exception 'Ese archivo no es una copia del Centroamericano 2026' using errcode = '22023';
  end if;

  insert into public.centroamericano_asignaciones (id, token, tnr, arbitro, nombrado, persona, mesa_desde, mesa_hasta, vence, revocada, creada_por, creada, ultimo_uso)
  select r.id, r.token, r.tnr, r.arbitro, r.nombrado, r.persona, r.mesa_desde, r.mesa_hasta, r.vence, r.revocada, v_yo, r.creada, r.ultimo_uso
    from jsonb_populate_recordset(null::public.centroamericano_asignaciones, p_copia->'asignaciones') r
  on conflict do nothing;
  get diagnostics v_a = row_count;

  insert into public.centroamericano_registro (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, tipo, resultado, anterior, articulo, texto, enviado, anula)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.tipo, r.resultado, r.anterior, r.articulo, r.texto, r.enviado, null
    from jsonb_populate_recordset(null::public.centroamericano_registro, p_copia->'registro') r
   where r.anula is null
  on conflict do nothing;
  get diagnostics v_r = row_count;
  insert into public.centroamericano_registro (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, tipo, resultado, anterior, articulo, texto, enviado, anula)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.tipo, r.resultado, r.anterior, r.articulo, r.texto, r.enviado, r.anula
    from jsonb_populate_recordset(null::public.centroamericano_registro, p_copia->'registro') r
   where r.anula is not null
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_r := v_r + v_n;

  insert into public.centroamericano_avisos (id, creado, de, asignacion_id, mesa, texto, estado, atendido_en, leido_en, creado_por, tipo, ronda)
  select r.id, r.creado, r.de, r.asignacion_id, r.mesa, r.texto, r.estado, r.atendido_en, r.leido_en, v_yo, r.tipo, r.ronda
    from jsonb_populate_recordset(null::public.centroamericano_avisos, p_copia->'avisos') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_v = row_count;

  insert into public.centroamericano_progreso (asignacion_id, ronda, total, con_resultado, pendientes, actualizado)
  select r.asignacion_id, r.ronda, r.total, r.con_resultado, r.pendientes, r.actualizado
    from jsonb_populate_recordset(null::public.centroamericano_progreso, p_copia->'progreso') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_p = row_count;

  insert into public.centroamericano_finales (id, asignacion_id, ronda, finalizada_en, revision, reabierta)
  select r.id, r.asignacion_id, r.ronda, r.finalizada_en, r.revision, r.reabierta
    from jsonb_populate_recordset(null::public.centroamericano_finales, p_copia->'finales') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_f = row_count;

  insert into public.centroamericano_planillas (id, asignacion_id, arbitro, tnr, ronda, mesa, lado, jugador, rival, ruta, subida, bytes, drive_ok, drive_en, drive_error)
  select r.id, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.lado, r.jugador, r.rival, r.ruta, r.subida, r.bytes, r.drive_ok, r.drive_en, r.drive_error
    from jsonb_populate_recordset(null::public.centroamericano_planillas, p_copia->'planillas') r
  on conflict do nothing;
  get diagnostics v_l = row_count;

  insert into public.centroamericano_presencia (id, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, presente, marcada)
  select r.id, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.presente, r.marcada
    from jsonb_populate_recordset(null::public.centroamericano_presencia, p_copia->'presencia') r
  on conflict do nothing;
  get diagnostics v_s = row_count;

  insert into public.centroamericano_tiempos (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, blancas, negras, jugada, j_blancas, j_negras, turno, t_blancas, t_negras, nota)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.blancas, r.negras, r.jugada, r.j_blancas, r.j_negras, r.turno, r.t_blancas, r.t_negras, r.nota
    from jsonb_populate_recordset(null::public.centroamericano_tiempos, p_copia->'tiempos') r
  on conflict do nothing;
  get diagnostics v_t = row_count;

  return jsonb_build_object('asignaciones', v_a, 'registro', v_r, 'avisos', v_v, 'progreso', v_p, 'finales', v_f, 'planillas', v_l, 'presencia', v_s, 'tiempos', v_t);
end;
$$;
