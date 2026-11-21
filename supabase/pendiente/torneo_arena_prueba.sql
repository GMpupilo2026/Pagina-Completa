do $t$
declare
  P uuid := '30761e7a-cb28-49f2-ba55-4b89de9e41d3';
  al uuid[] := '{}'; x uuid; T uuid; T2 uuid; R2 uuid; r jsonb; o text := ''; sala uuid; sala2 uuid; b boolean; ts timestamptz; v text;
begin
  for x in select a from interno.alumnos_de(P) a join public.profiles pr on pr.id = a and pr.role = 'alumno' loop
    perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    if public.acceso_vigente() then al := al || x; end if;
    exit when cardinality(al) >= 4;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  o := o || 'alumnos=' || cardinality(al);
  insert into public.tournaments (name, format, variant, initial_seconds, increment_seconds, created_by, arena_minutos)
  values ('Arena de prueba', 'arena', 'estandar', 180, 0, P, 10) returning id into T;
  insert into public.tournament_registrations (tournament_id, player_id) select T, unnest(al[1:3]);

  execute 'set local role authenticated';
  -- un alumno no la empieza
  perform set_config('request.jwt.claims', json_build_object('sub', al[1], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin ts := public.arena_empezar(T); o := o || ' | alumno-empieza=SI(MAL)'; exception when others then o := o || ' | alumno-empieza=no:' || sqlerrm; end;
  begin r := public.arena_buscar(T); o := o || ' | antes=' || (r->>'estado'); exception when others then o := o || ' | antes=err:' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', P, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  ts := public.arena_empezar(T); o := o || ' | empezar=' || (ts - now());
  begin ts := public.arena_empezar(T); o := o || ' | empezar2=SI(MAL)'; exception when others then o := o || ' | empezar2=no'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', al[1], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  r := public.arena_buscar(T); o := o || ' | A=' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', al[2], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  r := public.arena_buscar(T); o := o || ' | B=' || (r->>'estado'); sala := (r->>'sala')::uuid;
  select count(*)::text into v from public.game_rooms g where g.id = sala; o := o || ' | B-ve-sala=' || v;
  perform set_config('request.jwt.claims', json_build_object('sub', al[1], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  r := public.arena_buscar(T); o := o || ' | A2=' || (r->>'estado') || ':' || ((r->>'sala')::uuid = sala);
  perform set_config('request.jwt.claims', json_build_object('sub', al[3], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  r := public.arena_buscar(T); o := o || ' | C=' || r::text;
  -- D entra con la arena empezada
  perform set_config('request.jwt.claims', json_build_object('sub', al[4], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin r := public.arena_buscar(T); o := o || ' | D-sin-lista=SI(MAL)'; exception when others then o := o || ' | D-sin-lista=no'; end;
  insert into public.tournament_registrations (tournament_id, player_id) values (T, al[4]);
  r := public.arena_buscar(T); o := o || ' | D=' || (r->>'estado'); sala2 := (r->>'sala')::uuid;
  -- B intenta alargar la arena y cerrarla
  perform set_config('request.jwt.claims', json_build_object('sub', al[2], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  update public.tournaments set arena_termina = now() + interval '1 day', arena_minutos = 200 where id = T;
  b := public.arena_cerrar(T); o := o || ' | cerrar-antes=' || b;
  begin b := public.arena_cerrar(T, true); o := o || ' | alumno-termina=SI(MAL)'; exception when others then o := o || ' | alumno-termina=no'; end;
  begin insert into public.tournament_arena_cola (tournament_id, player_id) values (T, al[2]); o := o || ' | cola-escribe=SI(MAL)'; exception when others then o := o || ' | cola-escribe=no'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select (arena_termina - now())::text || '/' || arena_minutos into v from public.tournaments where id = T; o := o || ' | termina=' || v;
  select g.white_ready || '/' || g.black_ready || '/' || (g.clock_updated_at is not null) || '/' || g.fen || '/' || g.white_time_left || '/' || (g.created_by = P) into v from public.game_rooms g where g.id = sala; o := o || ' | sala=' || v;
  select count(*)::text into v from public.tournament_arena_cola where tournament_id = T; o := o || ' | cola=' || v;
  update public.game_rooms set status = 'finished', result = 'white', moves = '["e4","e5","Qh5"]' where id = sala;
  select p.result || '/' || p.jugadas || '/' || (p.finished_at is not null) || '/tab' || p.board_number into v from public.tournament_pairings p where p.game_room_id = sala; o := o || ' | cruce=' || v;
  select string_agg(p.board_number::text, ',' order by p.board_number) into v from public.tournament_pairings p where p.tournament_id = T; o := o || ' | tableros=' || v;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', al[3], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select string_agg(c.puntos || '-' || c.partidas || '-' || c.ganadas || '-' || c.perdidas, ',') into v from public.arena_clasificacion(T) c; o := o || ' | tabla=' || v;
  perform set_config('request.jwt.claims', json_build_object('sub', P, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  b := public.arena_cerrar(T, true); o := o || ' | profe-termina=' || b;
  b := public.arena_cerrar(T, true); o := o || ' | otra-vez=' || b;
  perform set_config('request.jwt.claims', json_build_object('sub', al[1], 'role', 'authenticated', 'aal', 'aal2')::text, true);
  r := public.arena_buscar(T); o := o || ' | despues=' || (r->>'estado');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select t.status || '/' || jsonb_array_length(t.winner_ids) || '/' || (t.finished_at = t.arena_termina) into v from public.tournaments t where t.id = T; o := o || ' | fin=' || v;
  select count(*)::text into v from public.public_tournament_champions where tournament_id = T; o := o || ' | campeones=' || v;
  select string_agg(status, ',') into v from public.tournament_rounds where tournament_id = T; o := o || ' | ronda=' || v;

  -- La racha, con cruces puestos a mano.
  insert into public.tournaments (name, format, variant, initial_seconds, increment_seconds, created_by, arena_minutos, status, arena_termina)
  values ('Racha', 'arena', 'estandar', 180, 0, P, 10, 'in_progress', now() - interval '1 minute') returning id into T2;
  insert into public.tournament_rounds (tournament_id, round_number) values (T2, 1) returning id into R2;
  insert into public.tournament_registrations (tournament_id, player_id) select T2, unnest(al[1:2]);
  insert into public.tournament_pairings (round_id, tournament_id, board_number, white_id, black_id, result, jugadas, finished_at) values
    (R2, T2, 1, al[1], al[2], 'white', 40, now() - interval '9 minutes'),
    (R2, T2, 2, al[2], al[1], 'black', 40, now() - interval '8 minutes'),
    (R2, T2, 3, al[1], al[2], 'white', 40, now() - interval '7 minutes'),
    (R2, T2, 4, al[2], al[1], 'draw', 10, now() - interval '6 minutes'),
    (R2, T2, 5, al[1], al[2], 'draw', 30, now() - interval '5 minutes'),
    (R2, T2, 6, al[1], al[2], 'black', 30, now());
  select string_agg(c.puntos || '-' || c.partidas || '-' || c.ganadas || '-' || c.tablas || '-' || c.perdidas || '-' || c.en_racha, ',') into v from public.arena_clasificacion(T2) c; o := o || ' | racha=' || v;
  raise exception 'RES: %', o;
end $t$;
