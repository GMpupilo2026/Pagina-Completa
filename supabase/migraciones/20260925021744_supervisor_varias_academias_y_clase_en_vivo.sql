-- Quien supervisa puede tener VARIAS academias, y las ve por separado; y
-- puede mirar la clase en vivo de sus profesores.
--
-- 1) Varias academias. Se va el índice «un supervisor por academia al revés»
--    (academias_un_supervisor: una persona supervisaba UNA sola). Cada academia
--    sigue teniendo un solo supervisor; lo que cambia es que ese supervisor
--    puede serlo de dos.
--
--    Para que no se mezclen, quien supervisa dos o más mira SIEMPRE una a la
--    vez: la «academia activa» (supervisor_academia_activa, la elige con
--    elegir_academia_activa(); sin elegir, la primera por nombre). Lo acota la
--    BASE, no la pantalla: las tres preguntas de la supervisión
--    —interno.supervisados_por_mi(), mis_supervisados() y
--    supervisado_por_mi()— contestan solo con la gente de la academia activa.
--    Todo lo que cuelga de ahí (Informes, cobros, cuentas, supervisión de
--    profesores, el detalle del informe mensual, «Ver como», la RLS de
--    profiles y de las tablas de actividad) queda separado sin tocar una sola
--    política. Con UNA academia (o ninguna) no cambia nada.
--
--    supervisores_de() NO cambia, a propósito: dice a quién le llega el
--    informe mensual, los recordatorios y la respuesta de las familias, y eso
--    no puede depender de qué academia tenga abierta su supervisor ese día.
--
-- 2) La clase en vivo. Quien supervisa a un profesor puede leer su tablero, sus
--    variantes y el enlace de su videollamada MIENTRAS tiene la clase abierta
--    (lo mismo que un alumno suyo). El conjunto se arma una vez,
--    interno.clases_que_superviso(), como pide la regla de las políticas.
--    Solo lectura: ninguna política de escritura cambia.

-- ---------- 1) Varias academias ----------

drop index if exists public.academias_un_supervisor;
create index if not exists academias_supervisor on public.academias (supervisor_id);

create or replace function public.academia_guardar(p_id uuid, p_nombre text, p_supervisor uuid, p_whatsapp text, p_correo text)
 returns academias
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_fila public.academias;
  v_wa   text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
  v_co   text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
begin
  if not public.soy_admin() then
    raise exception 'Solo quien administra crea y edita academias.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'La academia necesita un nombre.';
  end if;
  if v_wa is not null and char_length(v_wa) = 8 then v_wa := '506' || v_wa; end if;
  if v_co is not null and public.es_correo_interno(v_co) then
    raise exception 'Ese es un usuario de la Academia, no un correo: ahí no llega nada.';
  end if;
  if p_supervisor is not null and not coalesce((select es_supervisor from public.profiles where id = p_supervisor), false) then
    raise exception 'Esa cuenta no es supervisora: márcala como supervisora primero.';
  end if;
  -- Una persona puede supervisar varias academias: las ve de una en una
  -- (ver interno.academia_activa()).
  if exists (select 1 from public.academias where lower(btrim(nombre)) = lower(btrim(p_nombre))
                                              and id is distinct from p_id) then
    raise exception 'Ya hay una academia con ese nombre.';
  end if;
  if p_id is null then
    insert into public.academias (nombre, supervisor_id, whatsapp, correo_respuestas, created_by)
    values (btrim(p_nombre), p_supervisor, v_wa, v_co, auth.uid()) returning * into v_fila;
  else
    update public.academias set nombre = btrim(p_nombre), supervisor_id = p_supervisor,
           whatsapp = v_wa, correo_respuestas = v_co, updated_at = now()
     where id = p_id returning * into v_fila;
    if not found then raise exception 'Esa academia ya no existe.'; end if;
  end if;
  return v_fila;
end;
$function$;

-- La academia que cada supervisor tiene abierta. Sin políticas: la escribe
-- elegir_academia_activa() y la lee interno.academia_activa().
create table if not exists public.supervisor_academia_activa (
  supervisor_id uuid primary key references public.profiles(id) on delete cascade,
  academia_id   uuid not null references public.academias(id) on delete cascade,
  elegida_at    timestamptz not null default now()
);
alter table public.supervisor_academia_activa enable row level security;
revoke all on public.supervisor_academia_activa from anon, authenticated;
create index if not exists supervisor_academia_activa_academia on public.supervisor_academia_activa (academia_id);

-- La academia activa de quien llama, o NULL si supervisa menos de dos (y
-- entonces todo sigue como siempre). Con dos o más nunca es NULL: la elegida
-- si todavía es suya, si no la primera por nombre. Así no hay un estado
-- «todas juntas» donde se mezclen.
create or replace function interno.academia_activa()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  with mias as (
    select a.id, a.nombre from public.academias a
      join public.profiles s on s.id = a.supervisor_id and s.es_supervisor
     where a.supervisor_id = auth.uid()
  )
  select case when (select count(*) from mias) < 2 then null else coalesce(
    (select sa.academia_id from public.supervisor_academia_activa sa
      where sa.supervisor_id = auth.uid() and sa.academia_id in (select id from mias)),
    (select id from mias order by nombre collate "es-CR-x-icu", id limit 1)) end;
$function$;
revoke execute on function interno.academia_activa() from public, anon;
grant execute on function interno.academia_activa() to authenticated, service_role;

create or replace function interno.supervisados_por_mi()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  with act as (select interno.academia_activa() as a)
  -- Con una academia activa: su gente y nada más.
  select m.persona_id from public.academia_miembros m
    join public.academias ac on ac.id = m.academia_id and ac.supervisor_id = auth.uid()
    join public.profiles s on s.id = ac.supervisor_id and s.es_supervisor
   where m.academia_id = (select a from act) and m.persona_id <> auth.uid()
  union
  -- Sin academia activa (una o ninguna): como siempre.
  select sc.persona_id from public.supervisor_cuentas sc
    join public.profiles s on s.id = sc.supervisor_id and s.es_supervisor
   where sc.supervisor_id = auth.uid() and (select a from act) is null
  union
  select a from public.supervisor_cuentas sc
    join public.profiles s on s.id = sc.supervisor_id and s.es_supervisor
    cross join lateral interno.alumnos_de(sc.persona_id) a
   where sc.supervisor_id = auth.uid() and (select a from act) is null
  union
  select m.persona_id from public.academias ac
    join public.academia_miembros m on m.academia_id = ac.id
    join public.profiles s on s.id = ac.supervisor_id and s.es_supervisor
   where ac.supervisor_id = auth.uid() and m.persona_id <> ac.supervisor_id and (select a from act) is null;
$function$;

create or replace function public.mis_supervisados()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select s from interno.supervisados_por_mi() s where public.soy_supervisor()
  union
  select a from interno.alumnos_de(auth.uid()) a
   where public.soy_supervisor() and interno.academia_activa() is null;
$function$;

create or replace function public.supervisado_por_mi(p_persona uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select p_persona is not null and case
    when interno.academia_activa() is null
      then auth.uid() in (select public.supervisores_de(p_persona))
    else p_persona <> auth.uid() and exists (
      select 1 from public.academia_miembros m
       where m.academia_id = interno.academia_activa() and m.persona_id = p_persona)
  end;
$function$;

-- Las academias que supervisa quien llama, y cuál tiene abierta.
create or replace function public.mis_academias_supervisadas()
 returns table(id uuid, nombre text, activa boolean)
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select a.id, a.nombre, a.id is not distinct from interno.academia_activa()
    from public.academias a
    join public.profiles s on s.id = a.supervisor_id and s.es_supervisor
   where a.supervisor_id = auth.uid()
   order by a.nombre collate "es-CR-x-icu", a.id;
$function$;
revoke execute on function public.mis_academias_supervisadas() from public, anon;
grant execute on function public.mis_academias_supervisadas() to authenticated, service_role;

-- Cambiar de academia. Solo a una que supervisa; devuelve la que quedó
-- (vuelve a leerla: es la que de verdad va a acotar todo).
create or replace function public.elegir_academia_activa(p_academia uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_academia is null or not coalesce(public.supervisa_academia(p_academia), false) then
    raise exception 'No supervisas esa academia.' using errcode = '42501';
  end if;
  insert into public.supervisor_academia_activa (supervisor_id, academia_id)
  values (auth.uid(), p_academia)
  on conflict (supervisor_id) do update set academia_id = excluded.academia_id, elegida_at = now();
  return interno.academia_activa();
end;
$function$;
revoke execute on function public.elegir_academia_activa(uuid) from public, anon;
grant execute on function public.elegir_academia_activa(uuid) to authenticated, service_role;

-- La marca del encabezado: con varias academias, la de la activa (antes, con
-- dos, no se pintaba ninguna).
create or replace function public.mi_marca_academia()
 returns table(academia_id uuid, nombre text, color text, logo_path text)
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  with act as (select interno.academia_activa() as a),
  mias as (
    select a as id from act where a is not null
    union
    select m.academia_id from public.academia_miembros m
     where m.persona_id = auth.uid() and (select a from act) is null
    union
    select a.id from public.academias a
     where a.supervisor_id = auth.uid() and (select a from act) is null
  )
  select a.id, a.nombre, a.color, a.logo_path
    from public.academias a
   where a.id in (select id from mias)
     and (select count(*) from mias) = 1;
$function$;

-- ---------- 2) La clase en vivo ----------

-- Los profesores con la clase ABIERTA que quien llama supervisa (en su
-- academia activa, si tiene varias). Se arma una vez por consulta.
create or replace function interno.clases_que_superviso()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select distinct cs.created_by from public.class_sessions cs
   where cs.ended_at is null
     and public.soy_supervisor()
     and public.supervisado_por_mi(cs.created_by);
$function$;
revoke execute on function interno.clases_que_superviso() from public, anon;
grant execute on function interno.clases_que_superviso() to authenticated, service_role;

drop policy if exists game_state_select_supervisor on public.game_state;
create policy game_state_select_supervisor on public.game_state for select to authenticated
  using ((select public.soy_supervisor()) and owner_id in (select interno.clases_que_superviso()));

drop policy if exists variant_nodes_select_supervisor on public.variant_nodes;
create policy variant_nodes_select_supervisor on public.variant_nodes for select to authenticated
  using ((select public.soy_supervisor()) and teacher_id in (select interno.clases_que_superviso()));

drop policy if exists profesor_videollamada_select_supervisor on public.profesor_videollamada;
create policy profesor_videollamada_select_supervisor on public.profesor_videollamada for select to authenticated
  using ((select public.soy_supervisor()) and profesor_id in (select interno.clases_que_superviso()));
