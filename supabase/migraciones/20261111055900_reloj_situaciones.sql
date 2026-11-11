-- Lo que resuelve cada alumno en las situaciones de árbitro del reloj de
-- práctica (js/clase-reloj.js): el profe las pone de a una
-- (game_state.reloj.situacion) y aquí queda, por alumno y por envío, cuántas
-- veces presionó «Comprobar» y en qué intento le salió. Con eso el profe ve el
-- cuadro de quién lleva cuáles.
-- Lo juzga el navegador del alumno: la respuesta de cada situación ya viaja en
-- js/clase-reloj.js (no hay clave que esconder, como en practica_claves), así
-- que comprobarla en la base no le quitaría nada a quien quiera hacer trampa
-- desde la consola, y solo se engañaría a sí mismo en una práctica.
-- Se escribe solo con reloj_situacion_intento(), que exige que la situación
-- siga puesta en la clase de un profe del alumno; lo lee el dueño de la clase
-- (o administración), como practica_respuestas.
create table if not exists public.reloj_situaciones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  envio text not null check (envio ~ '^[a-z0-9-]{4,40}$'),
  situacion integer not null check (situacion between 0 and 99),
  intentos integer not null default 1 check (intentos >= 1),
  logrado_en integer check (logrado_en is null or logrado_en between 1 and intentos),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reloj_situaciones_una_por_envio unique (envio, student_id)
);
create index if not exists reloj_situaciones_owner_idx on public.reloj_situaciones (owner_id, created_at);
create index if not exists reloj_situaciones_student_idx on public.reloj_situaciones (student_id);
alter table public.reloj_situaciones enable row level security;
revoke all on table public.reloj_situaciones from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.reloj_situaciones from authenticated;
grant select on table public.reloj_situaciones to authenticated;
create policy reloj_situaciones_select on public.reloj_situaciones for select to authenticated
  using (owner_id = (select auth.uid())
         or coalesce((select mp.is_admin from public.my_profile() mp), false));

create or replace function public.reloj_situacion_intento(p_envio text, p_situacion integer, p_logrado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_owner uuid;
begin
  if yo is null then
    raise exception 'Sin sesión.' using errcode = '42501';
  end if;
  if not coalesce((select p.role = 'alumno' and not coalesce(p.is_admin, false)
                     from public.profiles p where p.id = yo), false) then
    raise exception 'Solo el alumnado resuelve las situaciones.' using errcode = '42501';
  end if;
  select g.owner_id into v_owner
    from public.game_state g
   where g.reloj->>'id' = p_envio
     and g.reloj->>'situacion' = p_situacion::text
     and public.es_mi_profesor(g.owner_id)
   limit 1;
  if v_owner is null then
    raise exception 'Esa situación ya no está en tu clase.' using errcode = '22023';
  end if;
  insert into public.reloj_situaciones (owner_id, student_id, envio, situacion, intentos, logrado_en)
  values (v_owner, yo, p_envio, p_situacion, 1, case when coalesce(p_logrado, false) then 1 end)
  on conflict (envio, student_id) do update
    set intentos = public.reloj_situaciones.intentos + 1,
        logrado_en = coalesce(public.reloj_situaciones.logrado_en,
                              case when coalesce(p_logrado, false) then public.reloj_situaciones.intentos + 1 end),
        updated_at = now();
end;
$$;
revoke execute on function public.reloj_situacion_intento(text, integer, boolean) from public, anon;
grant execute on function public.reloj_situacion_intento(text, integer, boolean) to authenticated;