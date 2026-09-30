-- Quien supervisa también mira la partida de práctica de un alumno y lo ayuda.
--
-- Desde sesion.html?observar=<profesor> quien supervisa ya ve el tablero de la
-- clase (game_state_select_supervisor). Ahora ve además la práctica contra el
-- motor —la ronda y la partida de cada alumno— y puede mandarle una ayuda a
-- uno, igual que el profe. Con el mismo alcance que el tablero: SOLO mientras
-- ese profesor tiene la clase abierta y solo si lo supervisa (el conjunto se
-- arma una vez, interno.clases_que_superviso()). Cerrada la clase, 0 filas.
--
-- El update NO le abre nada más que la ayuda: el trigger
-- practica_ayuda_proteger le devuelve la fila entera a quien no es el alumno,
-- salvo `ayuda`. Y no crea partidas: no tiene política de insert, así que no
-- queda anotado como alumno en la práctica que después revisa.
--
-- La ayuda lleva además el nombre de quien la dio, puesto por el trigger (no
-- por quien la manda): el alumno lee «Ayuda de Marta Solano» y no «de tu
-- profe» cuando no fue su profe.

create policy practice_sessions_select_supervisor on public.practice_sessions
  for select to authenticated
  using ((select public.soy_supervisor())
         and created_by in (select interno.clases_que_superviso()));

create policy practice_games_select_supervisor on public.practice_games
  for select to authenticated
  using ((select public.soy_supervisor())
         and session_id in (select s.id from public.practice_sessions s
                             where s.created_by in (select interno.clases_que_superviso())));

create policy practice_games_update_supervisor on public.practice_games
  for update to authenticated
  using ((select public.soy_supervisor())
         and session_id in (select s.id from public.practice_sessions s
                             where s.created_by in (select interno.clases_que_superviso())))
  with check ((select public.soy_supervisor())
         and session_id in (select s.id from public.practice_sessions s
                             where s.created_by in (select interno.clases_que_superviso())));

create or replace function public.practica_ayuda_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  ayuda_nueva jsonb := new.ayuda;
begin
  -- Sin usuario (service role, tareas de la base): no se toca nada.
  if yo is null then
    return new;
  end if;

  if yo = old.student_id then
    -- El alumno juega su partida, pero la ayuda no se la escribe él.
    new.ayuda := old.ayuda;
    if new.attempts is distinct from old.attempts then
      new.ayuda := null;
    end if;
    return new;
  end if;

  -- Quien no es el alumno solo mira: la fila queda como estaba, salvo la ayuda.
  new := old;
  if ayuda_nueva is distinct from old.ayuda
     and not exists (select 1 from public.practice_sessions s
                      where s.id = old.session_id and s.ended_at is not null) then
    new.ayuda := case when ayuda_nueva is null then null
                      else ayuda_nueva || jsonb_build_object(
                             'de', yo,
                             'en', now(),
                             'nombre', (select coalesce(nullif(p.full_name, ''), 'Alguien de la academia')
                                          from public.profiles p where p.id = yo)) end;
  end if;
  return new;
end;
$$;

revoke execute on function public.practica_ayuda_proteger() from public, anon, authenticated;