-- El candado del acceso, en la base: un alumno sin paquete vigente (y con el
-- acceso exigido) no escribe su progreso, no entra a la clase en vivo, no juega
-- ni rinde examenes. Politicas RESTRICTIVAS: se suman a las que ya existen sin
-- reescribir ninguna.

-- La unica pregunta, y sobre quien llama: nunca sobre otra persona.
create or replace function public.acceso_vigente()
returns boolean language sql stable security definer
set search_path = public set row_security to off as $$
  select case
    when auth.uid() is null then true
    when not coalesce((select c.exigido from public.acceso_config c where c.id), false) then true
    when not exists (select 1 from public.profiles pr
                      where pr.id = auth.uid() and pr.role = 'alumno' and not coalesce(pr.is_admin, false)) then true
    else exists (
      select 1 from public.paquete_alumnos pa
        join public.paquetes_acceso p on p.id = pa.paquete_id
       where pa.alumno_id = auth.uid()
         and p.vigente_desde <= (now() at time zone 'America/Costa_Rica')::date
         and p.vigente_hasta >= (now() at time zone 'America/Costa_Rica')::date)
  end;
$$;
revoke execute on function public.acceso_vigente() from public, anon;
grant execute on function public.acceso_vigente() to authenticated;

-- mi_acceso() dice lo mismo que el candado: su "vigente" sale de acceso_vigente().
create or replace function public.mi_acceso()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rol text; v_admin boolean; v_exigido boolean; v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
        v_hasta date; v_nombre text; v_vigente boolean := public.acceso_vigente();
begin
  select role, is_admin into v_rol, v_admin from public.profiles where id = auth.uid();
  select exigido into v_exigido from public.acceso_config where id;
  v_exigido := coalesce(v_exigido, false);
  if v_rol is null then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'sin_perfil', 'exigido', v_exigido);
  end if;
  if coalesce(v_admin, false) or v_rol <> 'alumno' then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'equipo', 'exigido', v_exigido);
  end if;
  select p.vigente_hasta, p.nombre into v_hasta, v_nombre
    from public.paquete_alumnos pa join public.paquetes_acceso p on p.id = pa.paquete_id
   where pa.alumno_id = auth.uid() and p.vigente_desde <= v_hoy
   order by p.vigente_hasta desc limit 1;
  if v_hasta is not null and v_hasta >= v_hoy then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'paquete', 'exigido', v_exigido,
      'hasta', v_hasta, 'dias', v_hasta - v_hoy, 'paquete', v_nombre);
  end if;
  return jsonb_build_object('vigente', v_vigente,
    'motivo', case when not v_exigido then 'sin_exigir' when v_hasta is null then 'sin_paquete' else 'vencido' end,
    'exigido', v_exigido, 'hasta', v_hasta, 'paquete', v_nombre);
end $$;

-- Escribir: progreso, tiempo, clase en vivo, juegos, tareas.
do $$
declare t text;
begin
  foreach t in array array['training_progress','training_state','platform_activity_log','class_presence_log',
    'class_attendance','question_answers','question_engine_answers','desafios','game_rooms',
    'practice_games','puzzle_rush_scores','tournament_registrations']
  loop
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.acceso_vigente()))',
                   t || '_exige_acceso_ins', t);
  end loop;
  foreach t in array array['training_state','platform_activity_log','class_presence_log','class_attendance',
    'question_answers','desafios','game_rooms','fourplayer_games','practice_games','puzzle_rush_scores','tarea_items']
  loop
    execute format('create policy %I on public.%I as restrictive for update to authenticated using ((select public.acceso_vigente())) with check ((select public.acceso_vigente()))',
                   t || '_exige_acceso_upd', t);
  end loop;
  -- Leer: lo que ES la clase en vivo. El progreso propio se sigue pudiendo leer.
  foreach t in array array['game_state','variant_nodes','questions','practice_sessions']
  loop
    execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.acceso_vigente()))',
                   t || '_exige_acceso_sel', t);
  end loop;
end $$;

-- Las tres puertas que escriben con SECURITY DEFINER (y por eso no las ve la
-- RLS): empezar un examen, responderlo y aceptar un reto. Un trigger si corre.
create or replace function public.exigir_acceso_vigente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.acceso_vigente() then
    raise exception 'Tu acceso a la Academia no está activo.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.exigir_acceso_vigente() from public, anon, authenticated;

create trigger examen_respuestas_exige_acceso before insert on public.examen_respuestas
  for each row execute function public.exigir_acceso_vigente();
create trigger examenes_exige_acceso_al_empezar before update of estado on public.examenes
  for each row when (old.estado = 'asignado' and new.estado = 'en_curso')
  execute function public.exigir_acceso_vigente();
create trigger game_rooms_exige_acceso before insert on public.game_rooms
  for each row execute function public.exigir_acceso_vigente();