-- «Torneos en Pareo Integral» (torneos-pareo.html): el espacio público donde
-- se ven todos los torneos que sus organizadores publican desde pareo.html,
-- con todas sus rondas, el buscador de jugador con sus rivales y la tabla de
-- posiciones. Lo pidió el dueño del sitio.
--
-- SIN CUENTA, como Pareo Integral y como jde_eventos: quien organiza no
-- tiene usuario. Por eso la tabla no tiene ninguna política de escritura:
-- la escribe solo la Edge Function `pareo-publicar`, con la clave de
-- servicio, después de pasar por su freno (pareo_frenar). Quien publica
-- recibe una clave secreta (la guarda su navegador, dentro del torneo) y
-- con ella actualiza o borra lo suyo; acá queda solo su huella (sha256),
-- y esa columna NO se puede leer desde afuera (el permiso de lectura es
-- por columnas). La LECTURA de lo demás es pública, hasta sin sesión: es
-- justo lo que busca una familia.
--
-- Lo que se guarda del torneo lo elige la Edge Function campo por campo
-- (nombres, centros, Elo, rondas y resultados): nunca la fecha de
-- nacimiento, la cédula ni nada que no se vea en una tabla de posiciones.
-- Ver «Torneos en Pareo Integral: el espacio público» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.pareo_publicados (
  id uuid primary key default gen_random_uuid(),
  clave_hash text not null check (clave_hash ~ '^[0-9a-f]{64}$'),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 160),
  evento text not null default '' check (char_length(evento) <= 160),
  lugar text not null default '' check (char_length(lugar) <= 120),
  fecha date,
  rondas smallint not null default 0 check (rondas between 0 and 99),
  rondas_total smallint not null default 0 check (rondas_total between 0 and 99),
  jugadores smallint not null default 0 check (jugadores between 0 and 2000),
  datos jsonb not null check (pg_column_size(datos) <= 2000000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

comment on table public.pareo_publicados is
  'Torneos publicados sin cuenta desde Pareo Integral (pareo.html) para el espacio público torneos-pareo.html. Se escribe solo con la Edge Function pareo-publicar (clave de servicio); la lectura es pública salvo clave_hash. Ver docs/decisiones/juegos-y-torneos.md.';
comment on column public.pareo_publicados.clave_hash is
  'sha256 de la clave secreta que recibió quien publicó (la guarda su navegador): con ella actualiza o borra. No se puede leer desde afuera.';

create index pareo_publicados_actualizado_idx on public.pareo_publicados (actualizado desc);

alter table public.pareo_publicados enable row level security;

revoke all on public.pareo_publicados from anon, authenticated;
-- La lectura, por columnas: todas menos clave_hash.
grant select (id, nombre, evento, lugar, fecha, rondas, rondas_total, jugadores, datos, creado, actualizado)
  on public.pareo_publicados to anon, authenticated;

create policy pareo_publicados_lectura_publica on public.pareo_publicados
  for select to anon, authenticated
  using (true);

-- El freno de «pareo-publicar». Crear pesa más (una fila nueva): 20 por
-- conexión en una hora y 300 en total. Actualizar es lo de todos los días
-- (cada resultado de cada categoría de un evento): 1500 por conexión en una
-- hora. Se anota en interno.envios_publicos con su propio tipo, 'pareo',
-- para NO sumarle al tope por conexión de los formularios: un organizador
-- que actualiza seguido no se tiene que quedar sin poder mandar uno.
create or replace function public.pareo_frenar(p_ip text, p_crear boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_ambito text := case when p_crear then 'crear' else 'actualizar' end;
begin
  perform pg_advisory_xact_lock(hashtext('envios_publicos:pareo'));

  if coalesce(p_crear, false) then
    if v_ip is not null and (select count(*) from interno.envios_publicos
          where tipo = 'pareo' and ambito = 'crear' and ip = v_ip
            and creado > now() - interval '1 hour') >= 20 then
      return 'Se publicaron demasiados torneos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
    end if;
    if (select count(*) from interno.envios_publicos
          where tipo = 'pareo' and ambito = 'crear'
            and creado > now() - interval '1 hour') >= 300 then
      return 'El espacio público está recibiendo demasiados torneos en este momento. Intenta de nuevo en una hora.';
    end if;
  elsif v_ip is not null and (select count(*) from interno.envios_publicos
          where tipo = 'pareo' and ambito = 'actualizar' and ip = v_ip
            and creado > now() - interval '1 hour') >= 1500 then
    return 'Llegaron demasiadas actualizaciones seguidas desde tu conexión. Espera un rato: el torneo se actualiza solo.';
  end if;

  -- (Lo de hace más de dos días lo borra interno.frenar_envio_publico con
  -- cualquier envío, de todos los tipos: acá no hace falta.)
  insert into interno.envios_publicos (tipo, ambito, ip, correo) values ('pareo', v_ambito, v_ip, null);
  return null;
end;
$$;
revoke all on function public.pareo_frenar(text, boolean) from public, anon, authenticated;
