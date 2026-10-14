-- «Resultados JDN por comité» (jdn-comites.html): las partidas, para los
-- enfrentamientos entre comités, y las correcciones de comité que hace
-- administración.
--
-- jdn_partidas: una fila por partida jugada de verdad (1, ½ o 0; sin forfeits
-- ni byes), guardada UNA vez: desde el jugador de menor orden. orden y rival
-- son el orden de jdn_jugadores en ese torneo, y puntos lo que sacó el de
-- `orden`. La ronda es 0 en los todos contra todos, donde la tabla cruzada no
-- la dice; vez distingue las dos partidas de un doble todos contra todos. Se
-- llena desde la base leyendo chess-results
-- (herramientas/jdn-comites/cargar-partidas.sql).
--
-- jdn_correcciones: el comité de un jugador corregido a mano por
-- administración (chess-results lo trae mal o no lo trae). nombre es la clave
-- con que la página reconoce a una persona (minúsculas, sin tildes ni signos);
-- sin edición, vale para todas. La página la aplica antes de deducir.
--
-- Las dos las lee quien tiene la herramienta; las partidas no se escriben
-- desde afuera y las correcciones solo las escribe quien administra.
-- Ver «Los enfrentamientos entre comités» y «La calidad de los datos y la
-- corrección del comité» en docs/decisiones/juegos-y-torneos.md.

create table public.jdn_partidas (
  id bigint generated always as identity primary key,
  tnr integer not null check (tnr > 0),
  ronda smallint not null check (ronda >= 0),
  orden smallint not null check (orden > 0),
  rival smallint not null check (rival > orden),
  vez smallint not null default 1 check (vez between 1 and 4),
  puntos numeric(2,1) not null check (puntos in (0, 0.5, 1)),
  unique (tnr, ronda, orden, rival, vez)
);
comment on table public.jdn_partidas is
  'Cada partida jugada de los torneos JDN de chess-results, una vez (desde el de menor orden), para los enfrentamientos entre comités de la herramienta jdn-comites. orden y rival son los de jdn_jugadores; ronda 0 = todos contra todos. Solo la lee quien tiene la herramienta.';

alter table public.jdn_partidas enable row level security;
revoke all on public.jdn_partidas from anon;
revoke insert, update, delete, truncate on public.jdn_partidas from authenticated;
grant select on public.jdn_partidas to authenticated;

create policy jdn_partidas_con_herramienta on public.jdn_partidas
  for select to authenticated
  using ((select public.tengo_herramienta('jdn-comites')));

create table public.jdn_correcciones (
  id bigint generated always as identity primary key,
  nombre text not null check (nombre ~ '^[a-z ]{3,120}$'),
  edicion text check (edicion is null or edicion ~ '^20\d\d-[EF]$'),
  comite text not null check (char_length(btrim(comite)) between 2 and 80),
  nota text check (nota is null or char_length(nota) <= 300),
  creado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  creado timestamptz not null default now()
);
create unique index jdn_correcciones_una on public.jdn_correcciones (nombre, coalesce(edicion, ''));
comment on table public.jdn_correcciones is
  'Comité de un jugador corregido a mano por administración para la herramienta jdn-comites: nombre es la clave de la página (minúsculas, sin tildes); sin edición vale para todas.';

alter table public.jdn_correcciones enable row level security;
revoke all on public.jdn_correcciones from anon;
revoke truncate on public.jdn_correcciones from authenticated;
grant select, insert, update, delete on public.jdn_correcciones to authenticated;

create policy jdn_correcciones_con_herramienta on public.jdn_correcciones
  for select to authenticated
  using ((select public.tengo_herramienta('jdn-comites')));
create policy jdn_correcciones_admin_crea on public.jdn_correcciones
  for insert to authenticated
  with check ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));
create policy jdn_correcciones_admin_cambia on public.jdn_correcciones
  for update to authenticated
  using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))
  with check ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));
create policy jdn_correcciones_admin_borra on public.jdn_correcciones
  for delete to authenticated
  using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));
