-- El alumno pide ayuda desde su partida de práctica.
--
-- En la tarjeta de práctica el alumno tiene «🙋 Pedir ayuda». El pedido vive en
-- su fila de practice_games (pide_ayuda_at), así que lo ve el profe y quien
-- esté observando (supervisión, coordinación, administración), le llega por el
-- mismo Realtime que ya escuchan y sobrevive a una recarga. No se manda como
-- mensaje suelto: quien entra después también tiene que verlo.
--
-- Qué hace cumplir la base (trigger practica_ayuda_proteger):
-- - El alumno enciende y apaga SU pedido; la hora la pone la base, no el
--   navegador, y pedir otra vez no la corre (el que pidió primero sigue primero).
-- - Quien no es el alumno solo puede APAGARLO (lo atendió de palabra, por la
--   llamada), nunca encenderlo a nombre del alumno.
-- - Mandarle una ayuda lo da por atendido.
-- - Reintentar la partida lo apaga, igual que la ayuda: era de otra partida.

alter table public.practice_games add column if not exists pide_ayuda_at timestamptz;

create or replace function public.practica_ayuda_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  ayuda_nueva jsonb := new.ayuda;
  pide_nuevo timestamptz := new.pide_ayuda_at;
begin
  -- Sin usuario (service role, tareas de la base): no se toca nada.
  if yo is null then
    return new;
  end if;

  if yo = old.student_id then
    -- El alumno juega su partida, pero la ayuda no se la escribe él.
    new.ayuda := old.ayuda;
    -- Su pedido sí: lo enciende y lo apaga, con la hora de la base.
    new.pide_ayuda_at := case when pide_nuevo is null then null
                              else coalesce(old.pide_ayuda_at, now()) end;
    if new.attempts is distinct from old.attempts then
      new.ayuda := null;
      new.pide_ayuda_at := null;
    end if;
    return new;
  end if;

  -- Quien no es el alumno solo mira: la fila queda como estaba, salvo la ayuda
  -- y apagar el pedido.
  new := old;
  if pide_nuevo is null then
    new.pide_ayuda_at := null;
  end if;
  if ayuda_nueva is distinct from old.ayuda
     and not exists (select 1 from public.practice_sessions s
                      where s.id = old.session_id and s.ended_at is not null) then
    new.ayuda := case when ayuda_nueva is null then null
                      else ayuda_nueva || jsonb_build_object(
                             'de', yo,
                             'en', now(),
                             'nombre', (select coalesce(nullif(p.full_name, ''), 'Alguien de la academia')
                                          from public.profiles p where p.id = yo)) end;
    -- Mandarle una ayuda es atender su pedido.
    if ayuda_nueva is not null then
      new.pide_ayuda_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.practica_ayuda_proteger() from public, anon, authenticated;
