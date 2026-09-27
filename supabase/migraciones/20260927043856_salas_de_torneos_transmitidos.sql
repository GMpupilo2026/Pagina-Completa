-- Las salas de torneos transmitidos: las fichas de torneos-en-vivo.html.
--
-- Hasta acá las fichas estaban escritas en el HTML y el torneo de Lichess en
-- una lista dentro de js/transmision.js: cada sala nueva era un cambio de
-- código. Ahora las crea y las edita quien administra, en admin.html#torneos.
--
-- Una sala es de uno de dos tipos:
--   lichess  una transmisión (broadcast) de Lichess: entra a la sala de cine
--            (transmision.html?torneo=<clave>), con la pizarra de posiciones.
--            Lleva el id de la transmisión.
--   enlaces  cualquier otra transmisión (idchess, YouTube…): la ficha lleva
--            uno o más botones que la abren en otra pestaña.
-- Las dos pueden llevar además botones de enlaces (el «verlo directo en
-- Lichess» de CENFOTEC).
--
-- QUIÉN LEE: cualquiera, anónimo incluido, las visibles; quien administra,
-- también las ocultas (para prepararlas antes de publicarlas).
-- QUIÉN ESCRIBE: solo quien administra (soy_admin()). No reparte permisos, así
-- que se escribe directo con políticas, como tv_settings.
--
-- Los enlaces se validan en la base y no solo en el formulario: un enlace
-- «javascript:» o «http:» en una página pública no puede depender de que el
-- navegador de quien lo cargó lo haya revisado.
--
-- Ver «Las salas de torneos se editan en administración» en
-- docs/decisiones/juegos-y-torneos.md.

create or replace function interno.enlaces_de_sala_validos(p jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 6
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where case when jsonb_typeof(e) <> 'object' then true
                   else coalesce(e->>'texto', '') !~ '^\S.{0,59}$'
                     or coalesce(e->>'url', '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^\s"<>]*)?$'
                     or char_length(e->>'url') > 500
                     or (select count(*) from jsonb_object_keys(e)) <> 2
              end
     );
$function$;

create table public.salas_torneo (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(clave) <= 40),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  descripcion text not null default '' check (char_length(descripcion) <= 400),
  emoji text not null default '🏆' check (char_length(emoji) between 1 and 8),
  tipo text not null check (tipo in ('lichess', 'enlaces')),
  lichess_id text check (lichess_id ~ '^[A-Za-z0-9]{8}$'),
  enlaces jsonb not null default '[]'::jsonb check (interno.enlaces_de_sala_validos(enlaces)),
  visible boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint salas_torneo_lichess_con_id check (tipo <> 'lichess' or lichess_id is not null),
  constraint salas_torneo_enlaces_con_alguno check (tipo <> 'enlaces' or jsonb_array_length(enlaces) >= 1)
);
comment on table public.salas_torneo is
  'Salas de torneos transmitidos (torneos-en-vivo.html y transmision.html). Las escribe solo quien administra, desde admin.html#torneos.';

-- Quién la tocó y cuándo lo pone la base, no el navegador.
create or replace function interno.salas_torneo_sello()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end;
$function$;
revoke execute on function interno.salas_torneo_sello() from public, anon, authenticated;
create trigger salas_torneo_sello before insert or update on public.salas_torneo
  for each row execute function interno.salas_torneo_sello();

alter table public.salas_torneo enable row level security;
revoke all on public.salas_torneo from public, anon, authenticated;
grant select on public.salas_torneo to anon, authenticated;
grant insert, update, delete on public.salas_torneo to authenticated;

create policy salas_torneo_ver on public.salas_torneo
  for select to anon, authenticated
  using (visible or (select public.soy_admin()));
create policy salas_torneo_crear on public.salas_torneo
  for insert to authenticated
  with check ((select public.soy_admin()));
create policy salas_torneo_editar on public.salas_torneo
  for update to authenticated
  using ((select public.soy_admin()))
  with check ((select public.soy_admin()));
create policy salas_torneo_borrar on public.salas_torneo
  for delete to authenticated
  using ((select public.soy_admin()));

-- Las dos que ya estaban en el HTML.
insert into public.salas_torneo (clave, nombre, descripcion, emoji, tipo, lichess_id, enlaces, orden) values
  ('cenfotec', 'Desafío Mentes Maestras CENFOTEC 2026',
   'Las partidas del torneo de la Universidad CENFOTEC, en vivo en la pantalla grande, con la pizarra de posiciones al lado.',
   '🎓', 'lichess', 's7NfNv6H',
   '[{"texto": "Verlo directo en Lichess", "url": "https://lichess.org/broadcast/desafio-mentes-maestras-cenfotec-2026/s7NfNv6H"}]'::jsonb, 1),
  ('utn', 'Torneo UTN 2026',
   'Las partidas del torneo de la Universidad Técnica Nacional, en vivo. Se transmite en idchess, en dos salas: la masculina y la femenina.',
   '🎓', 'enlaces', null,
   '[{"texto": "Partida masculina", "url": "https://media.idchess.com/en/tournaments/kYfhVJ/utn-2026/desk/eyJpZCI6OTY1OTU2LCJwYXNzd29yZCI6bnVsbH0="},
     {"texto": "Partida femenina", "url": "https://media.idchess.com/en/tournaments/b0fhVJ/utn-2026/desk/eyJpZCI6OTY1OTYxLCJwYXNzd29yZCI6bnVsbH0="}]'::jsonb, 2);