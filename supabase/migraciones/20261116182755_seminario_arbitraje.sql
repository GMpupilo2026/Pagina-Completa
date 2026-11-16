-- La sala de seminario de arbitraje, en arbitro.html («/arbitro»).
--
-- La pidió el dueño (16/11/2026): en el panel de los árbitros, además de las
-- herramientas (el Aula de Arbitraje para estudiar y entrenar), «un espacio
-- para sesión de seminario y poder correr todo ese contenido, que esté cerrada
-- solo para cuando el instructor la abra y decida quién entra». Lo que eligió:
--
--   · Instructor: administración Y cada organizador (quien puede dar
--     herramientas, `arbitros_puedo_dar()` no vacío). El organizador solo deja
--     entrar a SUS árbitros (`arbitros_cuentas.organizador_id`); la sala de
--     administración la puede pedir cualquier cuenta de árbitro.
--   · Entrada: SOLO sala de espera. Con la sala abierta, el árbitro pide
--     entrar y el instructor lo admite o lo rechaza, uno por uno. Sin sala
--     abierta no hay nada que pedir.
--   · Contenido: las diapositivas del curso (el instructor elige tema y
--     diapositiva y todos la ven), preguntas con tiempo (quién contestó qué) y
--     el examen de práctica con su nota.
--
-- Cómo se arma:
--
-- 1. Cuatro tablas, ninguna con política de escritura: las escriben funciones
--    que validan (regla del sitio para lo que reparte permisos).
--    `seminario_participantes` es la que reparte el permiso (quién está
--    admitido): lleva el trigger de la bitácora y va en VIGILADAS.
-- 2. La respuesta buena de una pregunta NO está en la sala mientras la
--    pregunta corre: `correcta` queda nula hasta que el instructor la muestra
--    (`seminario_revelar`), y entonces ya no se puede contestar.
-- 3. El examen de práctica se corrige en la página (son las preguntas del
--    banco del curso, que ya están en el navegador) y se guarda una sola vez
--    por sala: es una nota de práctica para el instructor, no un acta.
-- 4. Realtime: la sala (lo que se proyecta), los participantes (las
--    solicitudes y la admisión) y las respuestas, cada una con la política
--    restrictiva `verificacion_en_dos_pasos`, y escuchadas siempre con filtro
--    por sala o por persona.
-- 5. Una sala sin movimiento por 3 horas se cierra sola (pg_cron), como la
--    clase en vivo.
--
-- Ver «La sala de seminario de arbitraje» en docs/decisiones/permisos-y-roles.md.

-- ---------------------------------------------------------------- 1. tablas
create table public.seminario_salas (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  abierta_en timestamptz not null default now(),
  cerrada_en timestamptz,
  actualizada_en timestamptz not null default now(),
  tema text check (tema is null or tema ~ '^[a-z0-9-]{1,64}$'),
  diapositiva integer not null default 0 check (diapositiva between 0 and 199),
  pregunta_id text check (pregunta_id is null or char_length(pregunta_id) <= 80),
  pregunta jsonb,
  pregunta_hasta timestamptz,
  correcta smallint check (correcta is null or correcta between 0 and 5),
  examen_abierto boolean not null default false
);
comment on table public.seminario_salas is
  'Una sala de seminario de arbitraje (arbitro.html). La abre un instructor (administración o un organizador); lo que se proyecta (tema, diapositiva, pregunta) lo ven los admitidos. La escriben solo las funciones seminario_*.';
comment on column public.seminario_salas.correcta is
  'La opción buena de la pregunta en curso: nula mientras se contesta; la pone seminario_revelar y desde ahí ya no se puede contestar.';
create unique index seminario_salas_una_abierta_por_instructor
  on public.seminario_salas (instructor_id) where cerrada_en is null;

create table public.seminario_participantes (
  sala_id uuid not null references public.seminario_salas(id) on delete cascade,
  arbitro_id uuid not null references public.profiles(id) on delete cascade,
  estado text not null default 'esperando' check (estado in ('esperando', 'admitido', 'rechazado', 'sacado')),
  pedido_en timestamptz not null default now(),
  decidido_en timestamptz,
  decidido_por uuid references public.profiles(id) on delete set null,
  primary key (sala_id, arbitro_id)
);
comment on table public.seminario_participantes is
  'La sala de espera y los admitidos de cada sala de seminario. Es lo que da el permiso de ver la sala: la escriben solo seminario_pedir_entrar y seminario_decidir, y queda en la bitácora.';
create index seminario_participantes_arbitro_idx on public.seminario_participantes (arbitro_id);

create table public.seminario_respuestas (
  sala_id uuid not null references public.seminario_salas(id) on delete cascade,
  pregunta_id text not null,
  arbitro_id uuid not null references public.profiles(id) on delete cascade,
  opcion smallint not null check (opcion between 0 and 5),
  respondida_en timestamptz not null default now(),
  primary key (sala_id, pregunta_id, arbitro_id)
);
comment on table public.seminario_respuestas is
  'Lo que contestó cada admitido a cada pregunta de una sala de seminario. La escribe solo seminario_responder.';

create table public.seminario_examenes (
  sala_id uuid not null references public.seminario_salas(id) on delete cascade,
  arbitro_id uuid not null references public.profiles(id) on delete cascade,
  aciertos integer not null check (aciertos >= 0),
  total integer not null check (total between 1 and 100),
  nota numeric(5,2) not null check (nota between 0 and 100),
  entregado_en timestamptz not null default now(),
  primary key (sala_id, arbitro_id),
  check (aciertos <= total)
);
comment on table public.seminario_examenes is
  'La nota del examen de práctica de cada admitido en una sala de seminario (una vez por sala). Se corrige en la página: es práctica, no un acta.';

-- ---------------------------------------------------------------- 2. quién es quién
-- ¿Puede quien llama abrir una sala? Administración o quien puede dar
-- herramientas (un organizador con licencia propia). Un árbitro, no.
create or replace function interno.seminario_puedo_instruir()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(cardinality(public.arbitros_puedo_dar()) > 0, false);
$function$;
-- Solo la usan las funciones de abajo; la página pregunta arbitros_puedo_dar().
revoke execute on function interno.seminario_puedo_instruir() from public, anon, authenticated;

-- Las salas que da quien llama (abiertas o no): el conjunto, una vez.
create or replace function interno.seminario_mis_salas()
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select s.id from public.seminario_salas s where s.instructor_id = (select auth.uid());
$function$;
revoke execute on function interno.seminario_mis_salas() from public, anon;
grant execute on function interno.seminario_mis_salas() to authenticated;

-- Las salas ABIERTAS donde quien llama está admitido.
create or replace function interno.seminario_admitido_en()
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.sala_id
    from public.seminario_participantes p
    join public.seminario_salas s on s.id = p.sala_id and s.cerrada_en is null
   where p.arbitro_id = (select auth.uid()) and p.estado = 'admitido';
$function$;
revoke execute on function interno.seminario_admitido_en() from public, anon;
grant execute on function interno.seminario_admitido_en() to authenticated;

-- ¿Puede esta cuenta pedir entrar a esta sala? Tiene que ser de árbitro y, si
-- la sala es de un organizador, uno de sus árbitros. La de administración la
-- pide cualquier árbitro.
create or replace function interno.seminario_puede_pedir(p_sala uuid, p_persona uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(exists (
    select 1
      from public.seminario_salas s
      join public.profiles yo on yo.id = p_persona and yo.role = 'arbitro'
      join public.profiles ins on ins.id = s.instructor_id
     where s.id = p_sala and s.cerrada_en is null
       and (coalesce(ins.is_admin, false)
            or exists (select 1 from public.arbitros_cuentas c
                        where c.arbitro_id = p_persona and c.organizador_id = s.instructor_id))
  ), false);
$function$;
revoke execute on function interno.seminario_puede_pedir(uuid, uuid) from public, anon, authenticated;

-- La sala abierta que da quien llama, o error.
create or replace function interno.seminario_mia_abierta(p_sala uuid)
 returns void
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not coalesce(exists (select 1 from public.seminario_salas s
                           where s.id = p_sala and s.cerrada_en is null
                             and s.instructor_id = (select auth.uid())), false) then
    raise exception 'Esa sala no está abierta o no la das tú.';
  end if;
end;
$function$;
revoke execute on function interno.seminario_mia_abierta(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. RLS
alter table public.seminario_salas enable row level security;
alter table public.seminario_participantes enable row level security;
alter table public.seminario_respuestas enable row level security;
alter table public.seminario_examenes enable row level security;
revoke all on public.seminario_salas, public.seminario_participantes,
              public.seminario_respuestas, public.seminario_examenes from public, anon, authenticated;
grant select on public.seminario_salas, public.seminario_participantes,
               public.seminario_respuestas, public.seminario_examenes to authenticated;

create policy seminario_salas_ver on public.seminario_salas
  for select to authenticated
  using (instructor_id = (select auth.uid())
         or (select public.soy_admin())
         or id in (select interno.seminario_admitido_en()));

create policy seminario_participantes_ver on public.seminario_participantes
  for select to authenticated
  using (arbitro_id = (select auth.uid())
         or (select public.soy_admin())
         or sala_id in (select interno.seminario_mis_salas()));

-- Un admitido ve solo SUS respuestas; el instructor, las de su sala.
create policy seminario_respuestas_ver on public.seminario_respuestas
  for select to authenticated
  using (arbitro_id = (select auth.uid())
         or (select public.soy_admin())
         or sala_id in (select interno.seminario_mis_salas()));

create policy seminario_examenes_ver on public.seminario_examenes
  for select to authenticated
  using (arbitro_id = (select auth.uid())
         or (select public.soy_admin())
         or sala_id in (select interno.seminario_mis_salas()));

create policy verificacion_en_dos_pasos on public.seminario_salas as restrictive for all to authenticated
  using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
create policy verificacion_en_dos_pasos on public.seminario_participantes as restrictive for all to authenticated
  using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
create policy verificacion_en_dos_pasos on public.seminario_respuestas as restrictive for all to authenticated
  using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));

create trigger auditar after insert or update or delete on public.seminario_participantes
  for each row execute function interno.auditar();

-- ---------------------------------------------------------------- 4. el instructor
-- Abre su sala (o devuelve la que ya tiene abierta: una por instructor).
create or replace function public.seminario_abrir(p_titulo text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_id uuid; v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  if not coalesce(interno.seminario_puedo_instruir(), false) then
    raise exception 'Solo administración o un organizador con licencia propia abre una sala de seminario.';
  end if;
  if v_titulo = '' then v_titulo := 'Seminario de arbitraje'; end if;
  select s.id into v_id from public.seminario_salas s
   where s.instructor_id = (select auth.uid()) and s.cerrada_en is null;
  if v_id is not null then return v_id; end if;
  insert into public.seminario_salas (instructor_id, titulo)
  values ((select auth.uid()), left(v_titulo, 120))
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.seminario_cerrar(p_sala uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.seminario_mia_abierta(p_sala);
  update public.seminario_salas
     set cerrada_en = now(), actualizada_en = now(), examen_abierto = false,
         pregunta_hasta = case when correcta is null then least(pregunta_hasta, now()) else pregunta_hasta end
   where id = p_sala;
end;
$function$;

-- Admite, rechaza o saca a un árbitro de la sala de espera o de la sala.
create or replace function public.seminario_decidir(p_sala uuid, p_arbitro uuid, p_estado text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.seminario_mia_abierta(p_sala);
  if p_estado not in ('admitido', 'rechazado', 'sacado') then
    raise exception 'Estado no válido.';
  end if;
  update public.seminario_participantes
     set estado = p_estado, decidido_en = now(), decidido_por = (select auth.uid())
   where sala_id = p_sala and arbitro_id = p_arbitro;
  if not found then raise exception 'Esa persona no pidió entrar a tu sala.'; end if;
  update public.seminario_salas set actualizada_en = now() where id = p_sala;
end;
$function$;

-- Lo que se proyecta: el tema y la diapositiva.
create or replace function public.seminario_mostrar(p_sala uuid, p_tema text, p_diapositiva integer)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.seminario_mia_abierta(p_sala);
  update public.seminario_salas
     set tema = p_tema, diapositiva = greatest(0, least(199, coalesce(p_diapositiva, 0))), actualizada_en = now()
   where id = p_sala;
end;
$function$;

-- Lanza una pregunta con tiempo. La opción buena NO se manda acá.
create or replace function public.seminario_preguntar(p_sala uuid, p_pregunta_id text, p_texto text,
                                                      p_opciones text[], p_segundos integer)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.seminario_mia_abierta(p_sala);
  if coalesce(cardinality(p_opciones), 0) not between 2 and 6 then
    raise exception 'Una pregunta lleva de 2 a 6 opciones.';
  end if;
  if char_length(coalesce(p_texto, '')) not between 1 and 1000 or char_length(coalesce(p_pregunta_id, '')) not between 1 and 80 then
    raise exception 'Falta el texto de la pregunta.';
  end if;
  update public.seminario_salas
     set pregunta_id = p_pregunta_id,
         pregunta = jsonb_build_object('texto', p_texto, 'opciones', to_jsonb(p_opciones)),
         pregunta_hasta = now() + make_interval(secs => greatest(10, least(300, coalesce(p_segundos, 30)))),
         correcta = null,
         actualizada_en = now()
   where id = p_sala;
  -- La misma pregunta lanzada de nuevo empieza de cero.
  delete from public.seminario_respuestas where sala_id = p_sala and pregunta_id = p_pregunta_id;
end;
$function$;

-- Muestra la opción buena: desde acá ya no se contesta.
create or replace function public.seminario_revelar(p_sala uuid, p_correcta integer)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.seminario_mia_abierta(p_sala);
  if p_correcta is null or p_correcta < 0 or p_correcta > 5 then raise exception 'Opción no válida.'; end if;
  update public.seminario_salas
     set correcta = p_correcta, pregunta_hasta = least(pregunta_hasta, now()), actualizada_en = now()
   where id = p_sala and pregunta_id is not null;
end;
$function$;

create or replace function public.seminario_quitar_pregunta(p_sala uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.seminario_mia_abierta(p_sala);
  update public.seminario_salas
     set pregunta_id = null, pregunta = null, pregunta_hasta = null, correcta = null, actualizada_en = now()
   where id = p_sala;
end;
$function$;

create or replace function public.seminario_examen(p_sala uuid, p_abierto boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform interno.seminario_mia_abierta(p_sala);
  update public.seminario_salas set examen_abierto = coalesce(p_abierto, false), actualizada_en = now()
   where id = p_sala;
end;
$function$;

-- La sala de espera y la sala, con los nombres (profiles no se lee entero).
create or replace function public.seminario_participantes_de(p_sala uuid)
 returns table (arbitro_id uuid, nombre text, estado text, pedido_en timestamptz)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.arbitro_id, coalesce(nullif(btrim(pr.full_name), ''), 'Árbitro sin nombre'), p.estado, p.pedido_en
    from public.seminario_participantes p
    join public.profiles pr on pr.id = p.arbitro_id
    join public.seminario_salas s on s.id = p.sala_id
   where p.sala_id = p_sala
     and coalesce(s.instructor_id = (select auth.uid()) or public.soy_admin(), false)
   order by p.pedido_en;
$function$;

-- Quién contestó qué a una pregunta, para el instructor.
create or replace function public.seminario_respuestas_de(p_sala uuid, p_pregunta_id text)
 returns table (arbitro_id uuid, nombre text, opcion smallint, respondida_en timestamptz)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select r.arbitro_id, coalesce(nullif(btrim(pr.full_name), ''), 'Árbitro sin nombre'), r.opcion, r.respondida_en
    from public.seminario_respuestas r
    join public.profiles pr on pr.id = r.arbitro_id
    join public.seminario_salas s on s.id = r.sala_id
   where r.sala_id = p_sala and r.pregunta_id = p_pregunta_id
     and coalesce(s.instructor_id = (select auth.uid()) or public.soy_admin(), false)
   order by r.respondida_en;
$function$;

create or replace function public.seminario_examenes_de(p_sala uuid)
 returns table (arbitro_id uuid, nombre text, aciertos integer, total integer, nota numeric, entregado_en timestamptz)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select e.arbitro_id, coalesce(nullif(btrim(pr.full_name), ''), 'Árbitro sin nombre'), e.aciertos, e.total, e.nota, e.entregado_en
    from public.seminario_examenes e
    join public.profiles pr on pr.id = e.arbitro_id
    join public.seminario_salas s on s.id = e.sala_id
   where e.sala_id = p_sala
     and coalesce(s.instructor_id = (select auth.uid()) or public.soy_admin(), false)
   order by e.nota desc, e.entregado_en;
$function$;

-- ---------------------------------------------------------------- 5. el árbitro
-- Las salas abiertas que quien llama puede pedir (o ya pidió), con su estado.
create or replace function public.seminario_salas_para_mi()
 returns table (sala_id uuid, titulo text, instructor text, abierta_en timestamptz, mi_estado text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select s.id, s.titulo, coalesce(nullif(btrim(ins.full_name), ''), 'Instructor'), s.abierta_en, p.estado
    from public.seminario_salas s
    join public.profiles ins on ins.id = s.instructor_id
    left join public.seminario_participantes p on p.sala_id = s.id and p.arbitro_id = (select auth.uid())
   where s.cerrada_en is null
     and interno.seminario_puede_pedir(s.id, (select auth.uid()))
   order by s.abierta_en desc;
$function$;

-- Pide entrar. Quien fue rechazado o sacado puede volver a pedir: vuelve a la
-- sala de espera y el instructor decide otra vez. Un admitido no cambia.
create or replace function public.seminario_pedir_entrar(p_sala uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_estado text;
begin
  if not coalesce(interno.seminario_puede_pedir(p_sala, (select auth.uid())), false) then
    raise exception 'Esa sala no está abierta o no es para tu cuenta.';
  end if;
  insert into public.seminario_participantes (sala_id, arbitro_id)
  values (p_sala, (select auth.uid()))
  on conflict (sala_id, arbitro_id) do update
     set estado = 'esperando', pedido_en = now(), decidido_en = null, decidido_por = null
   where public.seminario_participantes.estado in ('rechazado', 'sacado');
  select estado into v_estado from public.seminario_participantes
   where sala_id = p_sala and arbitro_id = (select auth.uid());
  return v_estado;
end;
$function$;

-- Contesta la pregunta en curso (puede cambiar de opción mientras corre).
create or replace function public.seminario_responder(p_sala uuid, p_pregunta_id text, p_opcion integer)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s public.seminario_salas;
begin
  if not coalesce(p_sala in (select interno.seminario_admitido_en()), false) then
    raise exception 'No estás admitido en esa sala.';
  end if;
  select * into s from public.seminario_salas where id = p_sala;
  if s.pregunta_id is distinct from p_pregunta_id or s.correcta is not null
     or s.pregunta_hasta is null or now() > s.pregunta_hasta + interval '2 seconds' then
    raise exception 'Esa pregunta ya se cerró.';
  end if;
  if p_opcion is null or p_opcion < 0 or p_opcion >= jsonb_array_length(s.pregunta->'opciones') then
    raise exception 'Opción no válida.';
  end if;
  insert into public.seminario_respuestas (sala_id, pregunta_id, arbitro_id, opcion)
  values (p_sala, p_pregunta_id, (select auth.uid()), p_opcion)
  on conflict (sala_id, pregunta_id, arbitro_id) do update set opcion = excluded.opcion, respondida_en = now();
end;
$function$;

-- Entrega el examen de práctica (una vez por sala).
create or replace function public.seminario_entregar_examen(p_sala uuid, p_aciertos integer, p_total integer)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_nota numeric(5,2);
begin
  if not coalesce(p_sala in (select interno.seminario_admitido_en()), false) then
    raise exception 'No estás admitido en esa sala.';
  end if;
  if not coalesce((select examen_abierto from public.seminario_salas where id = p_sala), false) then
    raise exception 'El examen no está abierto.';
  end if;
  if p_total is null or p_total not between 1 and 100 or p_aciertos is null or p_aciertos not between 0 and p_total then
    raise exception 'Resultado no válido.';
  end if;
  v_nota := round(p_aciertos * 100.0 / p_total, 2);
  insert into public.seminario_examenes (sala_id, arbitro_id, aciertos, total, nota)
  values (p_sala, (select auth.uid()), p_aciertos, p_total, v_nota)
  on conflict (sala_id, arbitro_id) do nothing;
  if not found then raise exception 'Ya entregaste el examen de esta sala.'; end if;
  return v_nota;
end;
$function$;

-- ---------------------------------------------------------------- permisos de las funciones
do $$
declare f text;
begin
  foreach f in array array[
    'public.seminario_abrir(text)', 'public.seminario_cerrar(uuid)',
    'public.seminario_decidir(uuid, uuid, text)', 'public.seminario_mostrar(uuid, text, integer)',
    'public.seminario_preguntar(uuid, text, text, text[], integer)', 'public.seminario_revelar(uuid, integer)',
    'public.seminario_quitar_pregunta(uuid)', 'public.seminario_examen(uuid, boolean)',
    'public.seminario_participantes_de(uuid)', 'public.seminario_respuestas_de(uuid, text)',
    'public.seminario_examenes_de(uuid)', 'public.seminario_salas_para_mi()',
    'public.seminario_pedir_entrar(uuid)', 'public.seminario_responder(uuid, text, integer)',
    'public.seminario_entregar_examen(uuid, integer, integer)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- 6. Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seminario_salas') then
    alter publication supabase_realtime add table public.seminario_salas;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seminario_participantes') then
    alter publication supabase_realtime add table public.seminario_participantes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seminario_respuestas') then
    alter publication supabase_realtime add table public.seminario_respuestas;
  end if;
end $$;

-- ---------------------------------------------------------------- 7. cierre solo
-- Una sala sin movimiento del instructor por 3 horas se cierra sola. Bajo
-- pg_cron no hay auth.uid(): por eso no pasa por seminario_cerrar.
create or replace function interno.cerrar_seminarios_inactivos()
 returns integer
 language sql
 security definer
 set search_path to ''
as $function$
  with cerradas as (
    update public.seminario_salas
       set cerrada_en = actualizada_en, examen_abierto = false
     where cerrada_en is null and actualizada_en < now() - interval '3 hours'
    returning 1)
  select count(*)::integer from cerradas;
$function$;
revoke execute on function interno.cerrar_seminarios_inactivos() from public, anon, authenticated;

select cron.schedule('cerrar-seminarios-inactivos', '*/15 * * * *',
  $$select interno.cerrar_seminarios_inactivos()$$);
