create table public.elo_nacional_activos (
  id bigint generated always as identity primary key,
  fide_id text not null check (fide_id ~ '^[0-9]+$'),
  nombre text not null check (char_length(nombre) between 1 and 120),
  club text not null default '' check (char_length(club) <= 80),
  edad smallint not null check (edad between 0 and 120),
  rating_nacional integer check (rating_nacional is null or rating_nacional between 100 and 3500),
  consultado_en timestamptz not null default now(),
  unique (fide_id)
);
comment on table public.elo_nacional_activos is
  'Jugadores activos del Elo Nacional de ajedrezcostarica.com/es/national-rating (dato público, no de chess-results): nombre, club y edad tal como los publica la FCA. Pensada para cruzar con jdn_inscripciones en jdn-proyeccion.html. Se llena a mano con herramientas/jdn-proyeccion/elo-nacional-cargar.sql.';

alter table public.elo_nacional_activos enable row level security;
revoke all on public.elo_nacional_activos from anon;
revoke insert, update, delete, truncate on public.elo_nacional_activos from authenticated;
grant select on public.elo_nacional_activos to authenticated;

create policy elo_nacional_activos_con_herramienta on public.elo_nacional_activos
  for select to authenticated
  using ((select public.tengo_herramienta('jdn-proyeccion')));
