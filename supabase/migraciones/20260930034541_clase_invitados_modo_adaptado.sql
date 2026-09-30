-- El Modo Adaptado de cada invitado, a la vista del profe y en sus manos.
--
-- Una persona ciega que entra con el enlace de invitados no siempre encuentra
-- el botón del Modo Adaptado. Ahora el profe lo ve en su lista («🦯 modo
-- adaptado») y se lo puede encender o apagar desde su panel de la clase.
--
-- `adaptado` lo escriben los dos lados, cada uno con su función:
--   - el profe, con clase_enlace_adaptado() (solo a SUS invitados);
--   - la página del invitado, con clase_invitado_modo(), cuando la persona lo
--     cambia ella misma: así la lista del profe dice la verdad.
-- clase_invitado_ver() lo devuelve en cada consulta, y la página aplica solo el
-- CAMBIO (de una consulta a la otra): lo que la persona elige a mano no se le
-- vuelve a pisar en la vuelta siguiente.
--
-- Ver «El profe le enciende el modo adaptado» en docs/decisiones/clase-en-vivo.md.

alter table public.clase_espectadores add column adaptado boolean not null default false;
grant select (adaptado) on public.clase_espectadores to authenticated;

-- El profe le enciende o apaga el Modo Adaptado a uno de sus invitados.
create or replace function public.clase_enlace_adaptado(p_espectador uuid, p_adaptado boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update clase_espectadores set adaptado = coalesce(p_adaptado, false)
   where id = p_espectador and owner_id = auth.uid() and bloqueado_at is null;
end;
$function$;

-- La página del invitado avisa que la persona cambió su modo.
create or replace function public.clase_invitado_modo(p_token text, p_secreto text, p_adaptado boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update clase_espectadores s set adaptado = coalesce(p_adaptado, false)
    from clase_enlaces e
   where e.id = s.enlace_id and e.token = p_token and e.apagado_at is null
     and s.secreto_hash = encode(extensions.digest(coalesce(p_secreto, ''), 'sha256'), 'hex')
     and s.bloqueado_at is null and s.adaptado is distinct from coalesce(p_adaptado, false);
end;
$function$;

-- La misma de antes, con `adaptado` en la respuesta.
create or replace function public.clase_invitado_ver(p_token text, p_secreto text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_esp clase_espectadores%rowtype;
  v_gs game_state%rowtype;
  v_vista jsonb;
begin
  select s.* into v_esp
    from clase_espectadores s join clase_enlaces e on e.id = s.enlace_id
   where e.token = p_token and e.apagado_at is null
     and s.secreto_hash = encode(extensions.digest(coalesce(p_secreto, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('estado', 'fuera');
  end if;
  if v_esp.bloqueado_at is not null then
    return jsonb_build_object('estado', 'bloqueado', 'salidas', v_esp.salidas);
  end if;
  -- «Sigue mirando», para la lista del profe: una vez cada 20 s basta, y así
  -- Realtime no le manda un aviso por cada vuelta de cada invitado.
  if v_esp.visto_at < now() - interval '20 seconds' then
    update clase_espectadores set visto_at = now() where id = v_esp.id;
  end if;
  if not public.clase_abierta_de(v_esp.owner_id) then
    return jsonb_build_object('estado', 'esperando', 'salidas', v_esp.salidas, 'adaptado', v_esp.adaptado);
  end if;
  select * into v_gs from game_state where owner_id = v_esp.owner_id;
  -- Solo el tablero. De la vista se quita de quién es la respuesta mostrada.
  v_vista := case when jsonb_typeof(v_gs.vista) = 'object' then v_gs.vista - 'respuesta' else null end;
  return jsonb_build_object('estado', 'ok', 'salidas', v_esp.salidas, 'adaptado', v_esp.adaptado, 'tablero', jsonb_build_object(
    'start_fen', v_gs.start_fen,
    'moves', coalesce(v_gs.moves, '[]'::jsonb),
    'vista', v_vista,
    'arrows', coalesce(v_gs.arrows, '[]'::jsonb),
    'circles', coalesce(v_gs.circles, '[]'::jsonb),
    'pieces_hidden', coalesce(v_gs.pieces_hidden, false)));
end;
$function$;

revoke execute on function public.clase_enlace_adaptado(uuid, boolean) from public, anon;
grant execute on function public.clase_enlace_adaptado(uuid, boolean) to authenticated;
revoke execute on function public.clase_invitado_modo(text, text, boolean) from public;
grant execute on function public.clase_invitado_modo(text, text, boolean) to anon, authenticated;
