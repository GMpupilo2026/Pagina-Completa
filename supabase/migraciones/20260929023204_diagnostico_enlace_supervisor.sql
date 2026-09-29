-- El diagnóstico de visitante, con el enlace propio de cada supervisor.
--
-- Cada supervisor tiene UN enlace, entreno/diagnostico.html?s=<código>, que
-- comparte con quien quiera (sin cuenta). El diagnóstico que llega por ese
-- enlace queda marcado con su supervisor y le llega a él: lo ve en Informes.
-- Los que llegan sin enlace (la portada, Cursos) siguen siendo de
-- administración.
--
-- Antes la RLS dejaba leer TODOS los diagnósticos públicos a cualquier cuenta
-- con role = 'profesor'; solo la pantalla los escondía. Con diagnósticos que
-- ahora son de un supervisor eso cruzaría academias, así que la regla pasa a
-- la base: administración ve todos; un supervisor, los de su enlace.

-- 1. El código de cada supervisor. Lo escribe solo mi_enlace_diagnostico().
create table if not exists public.enlaces_diagnostico (
  supervisor_id uuid primary key references public.profiles(id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[0-9a-f]{10}$'),
  created_at timestamptz not null default now()
);
comment on table public.enlaces_diagnostico is
  'El enlace propio de cada supervisor para el diagnóstico de visitantes (entreno/diagnostico.html?s=<codigo>). Lo escribe mi_enlace_diagnostico(); sin políticas a propósito.';
alter table public.enlaces_diagnostico enable row level security;
revoke all on public.enlaces_diagnostico from anon, authenticated;

-- 2. A quién le llega cada diagnóstico. `enlace` es lo que mandó la página;
--    `supervisor_id` lo pone el trigger, nunca quien envía.
alter table public.diagnosticos_publicos
  add column if not exists supervisor_id uuid references public.profiles(id) on delete set null,
  add column if not exists enlace text check (enlace is null or char_length(enlace) <= 40);
comment on column public.diagnosticos_publicos.supervisor_id is
  'El supervisor dueño del enlace por el que llegó (null: llegó sin enlace, es de administración). Lo pone el trigger diagnosticos_publicos_supervisor.';
create index if not exists diagnosticos_publicos_supervisor_idx
  on public.diagnosticos_publicos (supervisor_id);

-- 3. El trigger: traduce el código al supervisor. Un supervisor_id mandado a
--    mano se pisa siempre; un código que no existe (o de alguien que ya no
--    supervisa) deja el diagnóstico en la bandeja de administración: perderlo
--    sería peor.
create or replace function public.diagnosticos_publicos_supervisor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.supervisor_id := (
    select e.supervisor_id
      from public.enlaces_diagnostico e
      join public.profiles p on p.id = e.supervisor_id
     where e.codigo = new.enlace
       and (p.es_supervisor or p.is_admin)
  );
  return new;
end;
$$;
revoke execute on function public.diagnosticos_publicos_supervisor() from public, anon, authenticated;

drop trigger if exists diagnosticos_publicos_supervisor on public.diagnosticos_publicos;
create trigger diagnosticos_publicos_supervisor
  before insert on public.diagnosticos_publicos
  for each row execute function public.diagnosticos_publicos_supervisor();

-- 4. Mi enlace: lo crea la primera vez y después devuelve siempre el mismo.
create or replace function public.mi_enlace_diagnostico()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  yo uuid := auth.uid();
  cod text;
begin
  if not coalesce((select p.es_supervisor or p.is_admin from public.profiles p where p.id = yo), false) then
    raise exception 'Solo quien supervisa tiene enlace propio del diagnóstico' using errcode = '42501';
  end if;
  select codigo into cod from public.enlaces_diagnostico where supervisor_id = yo;
  if cod is not null then return cod; end if;
  loop
    cod := substr(md5(gen_random_uuid()::text), 1, 10);
    begin
      insert into public.enlaces_diagnostico (supervisor_id, codigo) values (yo, cod);
      return cod;
    exception when unique_violation then
      -- Dos pestañas a la vez: gana la primera y se devuelve ese.
      select codigo into cod from public.enlaces_diagnostico where supervisor_id = yo;
      if cod is not null then return cod; end if;
    end;
  end loop;
end;
$$;
revoke execute on function public.mi_enlace_diagnostico() from public, anon;
grant execute on function public.mi_enlace_diagnostico() to authenticated;

-- 5. Lo que ve el visitante: a quién le llega su resultado. Solo un nombre
--    (la academia, si el supervisor tiene exactamente una; si no, el suyo),
--    y nada si el código no vale.
create or replace function public.enlace_diagnostico_publico(p_codigo text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
           (select min(a.nombre) from public.academias a
             where a.supervisor_id = p.id
            having count(*) = 1),
           nullif(btrim(p.full_name), ''),
           'tu supervisor')
    from public.enlaces_diagnostico e
    join public.profiles p on p.id = e.supervisor_id
   where e.codigo = p_codigo
     and (p.es_supervisor or p.is_admin);
$$;
revoke execute on function public.enlace_diagnostico_publico(text) from public;
grant execute on function public.enlace_diagnostico_publico(text) to anon, authenticated;

-- 6. Quién lee y marca como atendido.
drop policy if exists diagnosticos_publicos_select on public.diagnosticos_publicos;
create policy diagnosticos_publicos_select on public.diagnosticos_publicos
  for select to authenticated
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or supervisor_id = (select auth.uid())
  );

drop policy if exists diagnosticos_publicos_update on public.diagnosticos_publicos;
create policy diagnosticos_publicos_update on public.diagnosticos_publicos
  for update to authenticated
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or supervisor_id = (select auth.uid())
  )
  with check (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or supervisor_id = (select auth.uid())
  );

-- Desde el navegador solo se cambia «atendido»: ni a quién le llegó ni el
-- resultado. Y anon solo envía: tenía de regalo select, update, delete y
-- truncate (los de omisión de Supabase), que la RLS paraba salvo truncate.
revoke all on public.diagnosticos_publicos from anon, authenticated;
grant insert on public.diagnosticos_publicos to anon, authenticated;
grant select on public.diagnosticos_publicos to authenticated;
grant update (atendido) on public.diagnosticos_publicos to authenticated;
