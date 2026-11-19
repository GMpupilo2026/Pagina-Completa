-- «Marcar este momento» de la clase (19/11). Ver «Marcar este momento» en
-- docs/decisiones/clase-en-vivo.md.
--
-- Durante la clase en vivo, el alumno aprieta Alt+K (o el botón) y queda
-- anotada la hora. En «Repasar mis clases» cada marca lleva la grabación a
-- ese momento (unos segundos antes), para volver justo a esa explicación.
--
-- 1. public.clase_marcas: una fila por marca, con la hora de la BASE (now()),
--    nunca la que mande la página: así nadie se pone marcas en otra clase u
--    otra hora. Cada persona ve y borra solo las suyas; no hay política de
--    insertar: escribe solo marcar_momento_de_clase().
-- 2. public.marcar_momento_de_clase(p_clase): la deja a quien está en esa
--    clase (su asistencia, o el profe que la abrió) mientras está abierta, y
--    como mucho 200 marcas por persona y clase. Devuelve la hora anotada.
-- 3. Sin el acceso vigente no se leen (como la grabación).
--
-- Se borran con la clase (on delete cascade) y con la cuenta.

create table if not exists public.clase_marcas (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  persona_id uuid not null references public.profiles(id) on delete cascade,
  marcada_en timestamptz not null default now()
);
create index if not exists clase_marcas_persona_clase_idx on public.clase_marcas (persona_id, class_session_id);
create index if not exists clase_marcas_clase_idx on public.clase_marcas (class_session_id);

alter table public.clase_marcas enable row level security;

drop policy if exists clase_marcas_select on public.clase_marcas;
create policy clase_marcas_select on public.clase_marcas for select to authenticated
  using (persona_id = (select auth.uid()));

drop policy if exists clase_marcas_delete on public.clase_marcas;
create policy clase_marcas_delete on public.clase_marcas for delete to authenticated
  using (persona_id = (select auth.uid()));

drop policy if exists clase_marcas_exige_acceso_sel on public.clase_marcas;
create policy clase_marcas_exige_acceso_sel on public.clase_marcas as restrictive for select to authenticated
  using ((select public.acceso_vigente()));

revoke all on public.clase_marcas from anon;
grant select, delete on public.clase_marcas to authenticated;

create or replace function public.marcar_momento_de_clase(p_clase uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_hora timestamptz := now();
begin
  if not coalesce(yo is not null and exists (
       select 1 from public.class_sessions c
        where c.id = p_clase and c.ended_at is null
          and (c.created_by = yo
               or exists (select 1 from public.class_attendance a where a.session_id = c.id and a.student_id = yo))
     ), false) then
    raise exception 'Solo se marca un momento de una clase abierta en la que estás.' using errcode = '42501';
  end if;
  if (select count(*) from public.clase_marcas m where m.class_session_id = p_clase and m.persona_id = yo) >= 200 then
    raise exception 'Ya tienes 200 marcas en esta clase.' using errcode = '23514';
  end if;
  insert into public.clase_marcas (class_session_id, persona_id, marcada_en) values (p_clase, yo, v_hora);
  return v_hora;
end;
$$;

revoke execute on function public.marcar_momento_de_clase(uuid) from public, anon;
grant execute on function public.marcar_momento_de_clase(uuid) to authenticated;
