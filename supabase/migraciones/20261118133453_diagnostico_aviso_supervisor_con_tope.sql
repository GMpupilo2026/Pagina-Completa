-- El aviso al supervisor por un diagnóstico de su enlace salía por cada fila
-- insertada en diagnosticos_publicos, sin ningún tope: quien conoce un enlace
-- (es semipúblico, se comparte con los alumnos) podía insertar en bucle y
-- bombardear al supervisor y gastar el cupo de Resend (que deja sin salir las
-- recuperaciones de contraseña, los informes y los cobros).
--
-- Se le pone un tope por supervisor y hora DENTRO del disparador (aditivo, no
-- cambia la política ni el cliente). 60/h es holgado para una clase entera que
-- hace el diagnóstico junta, pero corta el bombardeo. Pasado el tope, no se
-- avisa (pero la fila se guarda igual: no se bloquea el diagnóstico).
create or replace function public.avisar_diagnostico_supervisor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  secreto text;
begin
  if new.supervisor_id is null then return new; end if;
  -- Tope por supervisor y hora: si ya salieron muchos avisos de este
  -- supervisor en la última hora, no se manda otro (el bombardeo se corta acá).
  if (select count(*) from public.diagnosticos_publicos
        where supervisor_id = new.supervisor_id
          and created_at > now() - interval '1 hour') > 60 then
    raise warning 'Demasiados avisos de diagnóstico del supervisor % en una hora: no se avisó %', new.supervisor_id, new.id;
    return new;
  end if;
  begin
    select decrypted_secret into secreto
      from vault.decrypted_secrets where name = 'aviso_diagnostico_secreto';
    if secreto is null or secreto = '' then
      raise warning 'No hay secreto del aviso de diagnóstico: no se avisó %', new.id;
      return new;
    end if;
    perform net.http_post(
      url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/avisar-diagnostico',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || secreto),
      body := jsonb_build_object('id', new.id),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'No se pudo encolar el aviso del diagnóstico %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.avisar_diagnostico_supervisor() from public, anon, authenticated;
