-- ============================================================================
-- Cuándo sale un aviso.
--
-- Los avisos los dispara la BASE, no la página. Si dependieran de que
-- clases.html llame a la función después de insertar la fila, cualquier otro
-- camino que abra una clase —otra página, una corrección a mano, un script—
-- dejaría a los alumnos sin aviso y nadie se enteraría. Con un trigger, el
-- aviso sale porque la fila existe.
--
-- pg_net encola el pedido y no bloquea la transacción: abrir la clase no se
-- queda esperando a que Google conteste.
-- ============================================================================

create or replace function public.avisar_push(p_a uuid[], p_titulo text, p_cuerpo text,
                                              p_url text default '/clases.html',
                                              p_etiqueta text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  secreto text;
begin
  if p_a is null or array_length(p_a, 1) is null then return; end if;
  select decrypted_secret into secreto
    from vault.decrypted_secrets where name = 'tanda_push_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de push: no se mandó el aviso "%"', p_titulo;
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/notificar',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('action', 'tanda', 'a', to_jsonb(p_a),
                               'titulo', p_titulo, 'cuerpo', p_cuerpo,
                               'url', p_url, 'etiqueta', p_etiqueta),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.avisar_push(uuid[], text, text, text, text)
  from public, anon, authenticated;

-- ------------------------------------------------- el profe abrió la clase
create or replace function public.avisar_clase_abierta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  alumnos uuid[];
  profe   text;
begin
  select array_agg(pt.student_id) into alumnos
    from public.profile_teachers pt where pt.teacher_id = new.created_by;
  if alumnos is null then return new; end if;

  select coalesce(p.full_name, 'Tu profe') into profe
    from public.profiles p where p.id = new.created_by;

  perform public.avisar_push(
    alumnos,
    'Empezó la clase',
    profe || ' abrió la sesión en vivo. Entra cuando puedas.',
    '/sesion.html',
    'clase-abierta');
  return new;
end;
$$;

drop trigger if exists class_sessions_avisa_push on public.class_sessions;
create trigger class_sessions_avisa_push
  after insert on public.class_sessions
  for each row execute function public.avisar_clase_abierta();

-- ------------------------------------------------------------- te retaron
create or replace function public.avisar_desafio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  quien text;
begin
  -- Solo los retos que nacen pendientes: los que ya vienen aceptados o
  -- cancelados no son una invitación a nada.
  if new.estado is distinct from 'pendiente' then return new; end if;

  select coalesce(p.full_name, 'Alguien') into quien
    from public.profiles p where p.id = new.de_id;

  perform public.avisar_push(
    array[new.para_id],
    'Te retaron a jugar',
    quien || ' te está esperando para una partida de ' || coalesce(new.modalidad, 'ajedrez') || '.',
    '/juegos.html',
    'reto');
  return new;
end;
$$;

drop trigger if exists desafios_avisa_push on public.desafios;
create trigger desafios_avisa_push
  after insert on public.desafios
  for each row execute function public.avisar_desafio();
