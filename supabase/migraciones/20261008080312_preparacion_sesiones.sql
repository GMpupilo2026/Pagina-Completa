-- La ficha «Asesores» de administración (admin.html#asesores): cómo va la
-- preparación de cada sesión de un curso a medida («Formación Ajedrez», hoy).
-- Una fila por sesión: «en preparación» o «lista», y una nota corta para quien
-- la prepara. Es cosa de administración: solo quien administra la lee y la
-- escribe. Ver «La ficha Asesores» en docs/decisiones/cursos-y-material.md.

create table if not exists public.preparacion_sesiones (
  curso text not null check (curso ~ '^[a-z0-9-]{2,60}$'),
  sesion integer not null check (sesion between 1 and 60),
  estado text not null default 'preparacion' check (estado in ('preparacion', 'lista')),
  nota text not null default '' check (char_length(nota) <= 500),
  actualizado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (curso, sesion)
);
create index if not exists preparacion_sesiones_actualizado_por_idx on public.preparacion_sesiones (actualizado_por);

alter table public.preparacion_sesiones enable row level security;

create policy preparacion_sesiones_select on public.preparacion_sesiones for select to authenticated
  using ((select public.soy_admin()));
create policy preparacion_sesiones_insert on public.preparacion_sesiones for insert to authenticated
  with check ((select public.soy_admin()));
create policy preparacion_sesiones_update on public.preparacion_sesiones for update to authenticated
  using ((select public.soy_admin())) with check ((select public.soy_admin()));

revoke all on public.preparacion_sesiones from anon, authenticated;
grant select, insert, update on public.preparacion_sesiones to authenticated;

-- Quién y cuándo lo pone la base, no la pantalla.
create or replace function interno.preparacion_sesiones_sello()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end;
$$;
revoke execute on function interno.preparacion_sesiones_sello() from public, anon, authenticated;

create trigger sello before insert or update on public.preparacion_sesiones
  for each row execute function interno.preparacion_sesiones_sello();