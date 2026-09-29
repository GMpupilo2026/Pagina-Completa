-- El aviso por correo al supervisor cuando llega un diagnóstico por su enlace.
--
-- Lo dispara la BASE, no la página (igual que los avisos push): si dependiera
-- de que entreno/diagnostico.html llame a algo después de insertar, un envío
-- que se corta a la mitad dejaría el diagnóstico sin aviso y nadie se
-- enteraría. Con un trigger, el aviso sale porque la fila existe.
--
-- El correo lo manda la Edge Function avisar-diagnostico, que recibe solo el
-- id y lee todo lo demás con la service role. Ver «El enlace del diagnóstico
-- de cada supervisor» en docs/decisiones/informes.md.

-- 1. Cuándo se avisó. La escribe solo la función (con la service role): el
--    grant de update de authenticated es solo sobre `atendido`.
alter table public.diagnosticos_publicos
  add column if not exists aviso_enviado_at timestamptz;
comment on column public.diagnosticos_publicos.aviso_enviado_at is
  'Cuándo se le mandó el correo al supervisor (avisar-diagnostico). Null: sin supervisor, o todavía no salió.';

-- 2. El secreto con que la base se presenta ante la función. Lo crea la base
--    y no lo ve nadie: la función lo vuelve a leer para compararlo.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'aviso_diagnostico_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'aviso_diagnostico_secreto');
  end if;
end $$;

create or replace function public.secreto_aviso_diagnostico()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'aviso_diagnostico_secreto';
$$;
revoke all on function public.secreto_aviso_diagnostico() from public, anon, authenticated;
grant execute on function public.secreto_aviso_diagnostico() to service_role;

-- 3. El disparador. pg_net encola el pedido y no bloquea el insert; y si algo
--    falla al encolarlo, el diagnóstico se guarda igual: perder el resultado
--    de un visitante por un aviso sería lo peor de los dos.
create or replace function public.avisar_diagnostico_supervisor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  secreto text;
begin
  if new.supervisor_id is null then return new; end if;
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

drop trigger if exists diagnosticos_publicos_avisa on public.diagnosticos_publicos;
create trigger diagnosticos_publicos_avisa
  after insert on public.diagnosticos_publicos
  for each row execute function public.avisar_diagnostico_supervisor();
