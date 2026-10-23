-- «Torneos en Pareo Integral»: la inscripción antes del torneo.
--
-- Quien organiza abre la inscripción de un torneo publicado (o de un torneo
-- anunciado, todavía sin jugadores) y las familias o los entrenadores
-- inscriben desde torneos-pareo.html, sin cuenta, días antes. Lo que mandan
-- queda acá hasta que el organizador lo lee desde Pareo Integral (con la
-- clave de su torneo) y acepta o rechaza a cada uno: los aceptados entran a
-- su lista de jugadores en su computadora. Lo pidió el dueño del sitio.
--
-- Son datos personales (el nombre del estudiante y cómo contactar a quien lo
-- inscribe): la tabla no se lee ni se escribe desde afuera, ni con la clave
-- anónima ni con sesión. Solo la Edge Function pareo-publicar, con la clave
-- de servicio, después de comprobar la clave del torneo para leer o de
-- pasar por el freno para escribir. Se borran solas con el torneo (on delete
-- cascade): «Dejar de publicar» se lleva también sus inscripciones.
--
-- Ver «Torneos en Pareo Integral: inscripción, anuncios, partidas y
-- estadísticas» en docs/decisiones/juegos-y-torneos.md.

create table public.pareo_preinscripciones (
  id uuid primary key default gen_random_uuid(),
  publicado_id uuid not null references public.pareo_publicados (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 100),
  institucion text not null default '' check (char_length(institucion) <= 100),
  categoria text not null default '' check (char_length(categoria) <= 30),
  elo smallint check (elo is null or elo between 0 and 3500),
  fide_id text not null default '' check (fide_id ~ '^[0-9]{0,12}$'),
  responsable text not null check (char_length(btrim(responsable)) between 2 and 100),
  contacto text not null check (char_length(btrim(contacto)) between 5 and 120),
  nota text not null default '' check (char_length(nota) <= 300),
  consentimiento timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  creado timestamptz not null default now()
);

comment on table public.pareo_preinscripciones is
  'Inscripciones previas a un torneo de «Torneos en Pareo Integral». Solo las lee y escribe la Edge Function pareo-publicar.';

create index pareo_preinscripciones_publicado_idx on public.pareo_preinscripciones (publicado_id, creado);

alter table public.pareo_preinscripciones enable row level security;
-- Sin políticas: con RLS encendida y sin ninguna, nadie de afuera ve ni toca una fila.
revoke all on public.pareo_preinscripciones from anon, authenticated;

-- El freno de las inscripciones: 30 por conexión en una hora, 400 por torneo
-- en total (lo que llega de más es abuso, no un torneo grande: un evento de
-- 800 se inscribe por categoría) y 2000 en una hora en todo el espacio. Se
-- anota en interno.envios_publicos como tipo 'pareo', ámbito 'inscribir'.
create or replace function public.pareo_inscribir_frenar(p_ip text, p_publicado uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  perform pg_advisory_xact_lock(hashtext('envios_publicos:pareo'));
  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'pareo' and ambito = 'inscribir' and ip = v_ip
          and creado > now() - interval '1 hour') >= 30 then
    return 'Llegaron demasiadas inscripciones seguidas desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;
  if (select count(*) from public.pareo_preinscripciones where publicado_id = p_publicado) >= 400 then
    return 'Este torneo ya no recibe más inscripciones por aquí. Escríbele a quien lo organiza.';
  end if;
  if (select count(*) from interno.envios_publicos
        where tipo = 'pareo' and ambito = 'inscribir'
          and creado > now() - interval '1 hour') >= 2000 then
    return 'El espacio público está recibiendo demasiadas inscripciones en este momento. Intenta de nuevo en una hora.';
  end if;
  insert into interno.envios_publicos (tipo, ambito, ip, correo) values ('pareo', 'inscribir', v_ip, null);
  return null;
end;
$$;
revoke all on function public.pareo_inscribir_frenar(text, uuid) from public, anon, authenticated;
