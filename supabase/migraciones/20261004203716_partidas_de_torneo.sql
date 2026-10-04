-- Mis partidas de torneo (1 de 2): las partidas que el alumno jugó en un
-- torneo en tablero y anota él mismo, para que «Tus propios errores» las
-- revise con el motor y su profesor las vea en Informes.
--
-- - Las jugadas se guardan ya comprobadas con chess.js en el navegador, en
--   notación SAN inglesa; la base solo acota el tamaño.
-- - No se guarda el nombre del rival: es de otra persona que no tiene cuenta
--   ni dio su consentimiento. Basta su Elo, si lo sabe.
-- - Las ve el alumno, sus profesores, quien lo supervisa y administración; las
--   escribe y borra solo el alumno.
create table public.partidas_torneo (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  evento text check (char_length(evento) <= 120),
  fecha date not null,
  color text not null check (color in ('w', 'b')),
  resultado text not null check (resultado in ('1-0', '0-1', '1/2-1/2', '*')),
  rival_elo integer check (rival_elo between 0 and 3500),
  jugadas jsonb not null check (jsonb_typeof(jugadas) = 'array'
    and jsonb_array_length(jugadas) between 10 and 600),
  created_at timestamptz not null default now()
);
create index partidas_torneo_alumno on public.partidas_torneo (student_id, fecha desc);

alter table public.partidas_torneo enable row level security;

create policy partidas_torneo_lee on public.partidas_torneo for select to authenticated
  using (
    student_id = (select auth.uid())
    or student_id in (select interno.alumnos_de((select auth.uid())))
    or (select public.soy_admin())
  );
create policy partidas_torneo_lee_supervisor on public.partidas_torneo for select to authenticated
  using ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()));
create policy partidas_torneo_anota on public.partidas_torneo for insert to authenticated
  with check (student_id = (select auth.uid()));
create policy partidas_torneo_borra on public.partidas_torneo for delete to authenticated
  using (student_id = (select auth.uid()));