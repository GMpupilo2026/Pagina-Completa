-- Los niveles de cada academia y en cuál va cada alumno (el «itinerario de
-- aprendizaje» de Chessgora). Ver «Los niveles de la academia» en
-- docs/decisiones/paneles.md.
--
-- * niveles_academia: los niveles de UNA academia, en orden (Iniciación,
--   Básico, Intermedio…). Los arma su supervisor o quien administra, con
--   set_niveles_academia(), que deja la lista EXACTAMENTE como llega (la regla
--   de las funciones set_*): un nivel que no viene se borra.
--
-- * niveles_alumno: el HISTORIAL. Cada vez que un profe le cambia el nivel a
--   un alumno queda una fila (quién, cuándo, a cuál). El nivel actual es la
--   última: no se guarda aparte, se lee. La fila guarda también el nombre del
--   nivel en ese momento (el acta): si después el nivel se borra o se
--   renombra, la historia sigue diciendo lo que pasó.
--
-- * Quién ve qué (RLS, el conjunto armado UNA vez por
--   interno.academias_de_niveles()):
--   - los niveles, quien es de la academia, quien la supervisa, el profe de
--     un alumno de esa academia y quien administra;
--   - el historial, el propio alumno, sus profes (interno.alumnos_de) y quien
--     administra.
--   Las academias son privadas: nada de esto le llega a otra academia.
--
-- * Escribir: solo por funciones que validan. Las tablas no tienen política de
--   escritura. poner_nivel_alumno(): lo hace un profe de ese alumno (o quien
--   administra), y el nivel tiene que ser de una academia del alumno. No
--   reparte permisos, accesos ni dinero: no va en la bitácora de auditoría.

create table public.niveles_academia (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references public.academias(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  descripcion text check (descripcion is null or char_length(descripcion) <= 300),
  orden integer not null check (orden >= 1),
  created_at timestamptz not null default now(),
  constraint niveles_academia_orden unique (academia_id, orden) deferrable initially deferred
);
create unique index niveles_academia_nombre on public.niveles_academia (academia_id, lower(btrim(nombre)));

comment on table public.niveles_academia is
  'Los niveles de una academia, en orden. Los escribe set_niveles_academia(). Ver «Los niveles de la academia» en docs/decisiones/paneles.md.';

create table public.niveles_alumno (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  nivel_id uuid references public.niveles_academia(id) on delete set null,
  nivel_nombre text,
  puesto_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index niveles_alumno_alumno on public.niveles_alumno (alumno_id, created_at desc);

comment on table public.niveles_alumno is
  'Historial de niveles de cada alumno (la última fila es el actual). Lo escribe poner_nivel_alumno(). nivel_nombre es el nombre de entonces.';

-- Las academias cuyos niveles puede ver quien pregunta: las suyas, las que
-- supervisa, las de sus alumnos, o todas si administra. SECURITY DEFINER
-- para no depender de la RLS de academia_miembros dentro de una política.
create or replace function interno.academias_de_niveles()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select a.id from public.academias a
   where coalesce((select public.soy_admin()), false)
      or a.supervisor_id = (select auth.uid())
      or a.id in (select m.academia_id from public.academia_miembros m
                   where m.persona_id = (select auth.uid())
                      or m.persona_id in (select interno.alumnos_de((select auth.uid()))));
$function$;
revoke execute on function interno.academias_de_niveles() from public, anon;
grant execute on function interno.academias_de_niveles() to authenticated;

alter table public.niveles_academia enable row level security;
alter table public.niveles_alumno enable row level security;

create policy niveles_academia_select on public.niveles_academia
  for select to authenticated
  using (academia_id in (select interno.academias_de_niveles()));

create policy niveles_alumno_select on public.niveles_alumno
  for select to authenticated
  using (
    alumno_id = (select auth.uid())
    or alumno_id in (select interno.alumnos_de((select auth.uid())))
    or coalesce((select public.soy_admin()), false)
  );

revoke all on public.niveles_academia from anon;
revoke all on public.niveles_alumno from anon;
revoke insert, update, delete, truncate on public.niveles_academia from authenticated;
revoke insert, update, delete, truncate on public.niveles_alumno from authenticated;
grant select on public.niveles_academia to authenticated;
grant select on public.niveles_alumno to authenticated;

-- Deja los niveles de la academia EXACTAMENTE como llegan, en ese orden.
-- p_niveles: [{ "id": <uuid o nulo>, "nombre": "...", "descripcion": "..." }].
-- Un id que no es de esta academia se toma como nivel nuevo. Devuelve la
-- lista leída otra vez de la tabla.
create or replace function public.set_niveles_academia(p_academia uuid, p_niveles jsonb)
 returns setof public.niveles_academia
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_item jsonb;
  v_i integer := 0;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_nombre text;
  v_desc text;
begin
  if not coalesce(
       (select public.soy_admin())
       or exists (select 1 from public.academias a where a.id = p_academia and a.supervisor_id = auth.uid()),
       false) then
    raise exception 'Solo quien supervisa esta academia o quien administra arma sus niveles.' using errcode = '42501';
  end if;
  if p_niveles is null or jsonb_typeof(p_niveles) <> 'array' then
    raise exception 'Los niveles llegan como una lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_niveles) > 30 then
    raise exception 'Como mucho 30 niveles.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_niveles) loop
    v_i := v_i + 1;
    v_nombre := btrim(coalesce(v_item->>'nombre', ''));
    v_desc := nullif(btrim(coalesce(v_item->>'descripcion', '')), '');
    if v_nombre = '' then
      raise exception 'El nivel % no tiene nombre.', v_i using errcode = '22023';
    end if;
    v_id := null;
    if (v_item->>'id') ~ '^[0-9a-f-]{36}$' then
      select n.id into v_id from public.niveles_academia n
       where n.id = (v_item->>'id')::uuid and n.academia_id = p_academia;
    end if;
    if v_id is null then
      insert into public.niveles_academia (academia_id, nombre, descripcion, orden)
      values (p_academia, v_nombre, v_desc, v_i)
      returning id into v_id;
    else
      update public.niveles_academia set nombre = v_nombre, descripcion = v_desc, orden = v_i
       where id = v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  delete from public.niveles_academia n
   where n.academia_id = p_academia and not (n.id = any (v_ids));

  return query select n.* from public.niveles_academia n
                where n.academia_id = p_academia order by n.orden;
end;
$function$;
revoke execute on function public.set_niveles_academia(uuid, jsonb) from public, anon;
grant execute on function public.set_niveles_academia(uuid, jsonb) to authenticated;

-- Le pone (o le quita, con p_nivel nulo) el nivel a un alumno. Lo hace un
-- profe suyo o quien administra; el nivel tiene que ser de una academia del
-- alumno. Si ya estaba en ese nivel no deja otra fila. Devuelve el nivel
-- actual, leído otra vez.
create or replace function public.poner_nivel_alumno(p_alumno uuid, p_nivel uuid)
 returns table(nivel_id uuid, nivel_nombre text, desde timestamptz)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_nombre text;
  v_actual uuid;
  v_hay boolean;
begin
  if p_alumno is null or not coalesce(
       (select public.soy_admin()) or public.soy_profesor_de(p_alumno), false) then
    raise exception 'Solo un profe de este alumno le pone el nivel.' using errcode = '42501';
  end if;
  if p_nivel is not null then
    select n.nombre into v_nombre from public.niveles_academia n
     where n.id = p_nivel
       and exists (select 1 from public.academia_miembros m
                    where m.academia_id = n.academia_id and m.persona_id = p_alumno);
    if v_nombre is null then
      raise exception 'Ese nivel no es de una academia de este alumno.' using errcode = '22023';
    end if;
  end if;

  select h.nivel_id, true into v_actual, v_hay from public.niveles_alumno h
   where h.alumno_id = p_alumno order by h.created_at desc, h.id desc limit 1;
  if not coalesce(v_hay, false) and p_nivel is null then
    null;   -- nunca tuvo nivel y se le quita: nada que anotar
  elsif v_actual is distinct from p_nivel or not coalesce(v_hay, false) then
    insert into public.niveles_alumno (alumno_id, nivel_id, nivel_nombre, puesto_por)
    values (p_alumno, p_nivel, v_nombre, auth.uid());
  end if;

  return query select h.nivel_id, h.nivel_nombre, h.created_at from public.niveles_alumno h
                where h.alumno_id = p_alumno order by h.created_at desc, h.id desc limit 1;
end;
$function$;
revoke execute on function public.poner_nivel_alumno(uuid, uuid) from public, anon;
grant execute on function public.poner_nivel_alumno(uuid, uuid) to authenticated;
