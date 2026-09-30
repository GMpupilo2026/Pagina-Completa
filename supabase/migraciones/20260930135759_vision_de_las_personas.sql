create table public.vision_personas (
  persona_id uuid primary key references public.profiles (id) on delete cascade,
  vision text not null check (vision in ('baja_vision', 'ciego')),
  actualizado timestamptz not null default now(),
  actualizado_por uuid
);

alter table public.vision_personas enable row level security;

create policy vision_personas_select on public.vision_personas
  for select to authenticated
  using (
    persona_id = (select auth.uid())
    or (select public.soy_admin())
    or persona_id in (select interno.alumnos_de((select auth.uid())))
  );

revoke all on public.vision_personas from anon;
revoke insert, update, delete, truncate on public.vision_personas from authenticated;
grant select on public.vision_personas to authenticated;

create trigger auditar after insert or update or delete on public.vision_personas
  for each row execute function interno.auditar();

create or replace function public.marcar_vision(p_persona uuid, p_vision text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  quedo text;
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo quien administra puede marcar la visión de una persona';
  end if;
  if not exists (select 1 from public.profiles where id = p_persona) then
    raise exception 'No se encontró esa cuenta';
  end if;
  if p_vision is not null and p_vision not in ('baja_vision', 'ciego') then
    raise exception 'La visión es baja_vision, ciego o ninguna';
  end if;

  if p_vision is null then
    delete from public.vision_personas where persona_id = p_persona;
  else
    insert into public.vision_personas (persona_id, vision, actualizado, actualizado_por)
    values (p_persona, p_vision, now(), auth.uid())
    on conflict (persona_id) do update
      set vision = excluded.vision, actualizado = now(), actualizado_por = auth.uid();
  end if;

  select vision into quedo from public.vision_personas where persona_id = p_persona;
  if quedo is distinct from p_vision then
    raise exception 'No se pudo guardar la visión de esa persona';
  end if;
  return quedo;
end;
$$;

revoke execute on function public.marcar_vision(uuid, text) from public, anon;
grant execute on function public.marcar_vision(uuid, text) to authenticated;