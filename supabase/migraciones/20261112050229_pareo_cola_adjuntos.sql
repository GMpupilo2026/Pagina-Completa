-- Pareo Integral: lo que anotan los árbitros adjuntos queda guardado en la
-- base, aunque la computadora del árbitro principal esté cerrada.
--
-- Pedido del dueño para la Eliminatoria Cantonal JDN de Pérez Zeledón (22 de
-- noviembre de 2026): «que todo sea uno solo», el torneo, la mesa del árbitro
-- y las cámaras. Hasta ahora el resultado que mandaba un adjunto viajaba solo
-- por un canal de Broadcast hasta la pestaña del principal: si esa pestaña no
-- estaba abierta en ese momento, el resultado se perdía.
--
-- Dos tablas, las dos SIN CUENTA (como todo Pareo Integral) y sin nada que se
-- lea o escriba desde afuera: RLS puesta, sin permisos para anon ni
-- authenticated y sin políticas. Las escribe y las lee solo la Edge Function
-- `pareo-publicar`, con la clave de servicio:
--
--  - pareo_adjuntos: los enlaces de árbitro adjunto de cada torneo publicado
--    (el código de 8 letras que ya tenían, su nombre y sus mesas). Los manda
--    el principal con la clave de su torneo. Con el código, el adjunto entra
--    (`adjunto_entrar`) y anota (`adjunto_anotar`). El código equivale a una
--    contraseña: la bitácora de auditoría NUNCA lo anota.
--  - pareo_cola: lo que mandó cada adjunto (un resultado o una incidencia),
--    en orden, hasta que el principal lo lee con su clave y lo pasa a su
--    torneo. Ahí se BORRA (`cola_borrar`): lo que queda es lo del torneo, no
--    una copia aparte. Quien decide sigue siendo la pestaña del principal,
--    con las mismas reglas que antes (`recibirDeAdjunto`).
--
-- Se borran con el torneo publicado (on delete cascade).
--
-- Ver «Pareo Integral: lo que anotan los adjuntos queda en la base» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.pareo_adjuntos (
  codigo text primary key check (codigo ~ '^[a-hjkmnp-z2-9]{8}$'),
  publicado_id uuid not null references public.pareo_publicados (id) on delete cascade,
  nombre text not null default '' check (char_length(nombre) <= 60),
  desde smallint not null check (desde between 1 and 999),
  hasta smallint not null check (hasta between 1 and 999),
  activo boolean not null default true,
  visto timestamptz,
  creado timestamptz not null default now(),
  constraint pareo_adjuntos_rango check (desde <= hasta)
);

comment on table public.pareo_adjuntos is
  'Los enlaces de árbitro adjunto de cada torneo publicado en Pareo Integral (código de 8 letras, nombre y mesas). Solo los lee y escribe la Edge Function pareo-publicar; el principal los manda con la clave de su torneo. Ver docs/decisiones/juegos-y-torneos.md.';
comment on column public.pareo_adjuntos.codigo is
  'El código del enlace (#adjunto=<código>): quien lo tiene anota como ese árbitro. No sale de la base ni va a la bitácora de auditoría.';
comment on column public.pareo_adjuntos.visto is
  'La última vez que ese árbitro entró o anotó algo con su código.';

create index pareo_adjuntos_publicado_idx on public.pareo_adjuntos (publicado_id);

alter table public.pareo_adjuntos enable row level security;
revoke all on public.pareo_adjuntos from public, anon, authenticated;

-- Quién recibió un enlace de árbitro y quién se lo apagó, sin el código.
create trigger pareo_adjuntos_auditar
  after insert or update or delete on public.pareo_adjuntos
  for each row execute function interno.auditar('publicado_id', 'nombre', 'desde', 'hasta', 'activo');

create table public.pareo_cola (
  id bigint generated always as identity primary key,
  publicado_id uuid not null references public.pareo_publicados (id) on delete cascade,
  codigo text not null references public.pareo_adjuntos (codigo) on delete cascade,
  evento text not null check (evento in ('resultado', 'nota')),
  ronda smallint not null check (ronda between 1 and 99),
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 4000),
  creado timestamptz not null default now()
);

comment on table public.pareo_cola is
  'Lo que mandó cada árbitro adjunto de Pareo Integral (resultado o incidencia), en orden, hasta que el árbitro principal lo pasa a su torneo; entonces se borra. Solo la Edge Function pareo-publicar. Ver docs/decisiones/juegos-y-torneos.md.';

create index pareo_cola_publicado_idx on public.pareo_cola (publicado_id, id);
create index pareo_cola_codigo_idx on public.pareo_cola (codigo);

alter table public.pareo_cola enable row level security;
revoke all on public.pareo_cola from public, anon, authenticated;
