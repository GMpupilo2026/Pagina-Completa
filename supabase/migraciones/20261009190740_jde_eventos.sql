-- «Juegos Estudiantiles MEP, modo árbitro» (jde-arbitro.html): quien organiza
-- una fase de los Juegos Deportivos Estudiantiles la arma con el motor ya
-- comprobado de Pareo Integral y, al cerrarla, publica el resumen acá. La
-- página pública juegos-estudiantiles.html lee esta tabla para mostrar los
-- eventos de TODAS las regionales con la MISMA plantilla.
--
-- SIN CUENTA, a propósito (lo pidió el dueño del sitio): cualquiera que
-- organice una fase puede publicarla, sin usuario ni licencia que repartir
-- entre decenas de comités regionales. Por eso la tabla no tiene ninguna
-- política de escritura: solo la escribe la Edge Function `jde-publicar`,
-- con la clave de servicio, después de pasar por el freno de los envíos
-- públicos (jde_frenar). La LECTURA sí es pública de verdad, hasta para quien
-- no tiene sesión: es justo lo que debe ver cualquier familia que busca el
-- resultado de su regional.
-- Ver «Juegos Estudiantiles MEP, modo árbitro» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.jde_eventos (
  id bigint generated always as identity primary key,
  anio smallint not null check (anio between 2024 and 2100),
  fase text not null check (fase in ('institucional', 'regional', 'interregional', 'nacional')),
  region text not null default '' check (char_length(region) <= 80),
  categoria text not null default '' check (char_length(categoria) <= 40),
  rama text not null default '' check (rama in ('', 'masculina', 'femenina', 'mixta')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 160),
  sede text not null default '' check (char_length(sede) <= 120),
  fecha date,
  arbitro text not null default '' check (char_length(arbitro) <= 80),
  clasificacion jsonb not null default '[]'::jsonb,
  creado timestamptz not null default now()
);

comment on table public.jde_eventos is
  'Eventos de los Juegos Deportivos Estudiantiles (JDE, MEP) publicados sin cuenta desde el modo árbitro de jde-arbitro.html. Se escribe solo con la Edge Function jde-publicar (clave de servicio); la lectura es pública, sin candado. Ver docs/decisiones/juegos-y-torneos.md.';

create index jde_eventos_anio_fase_idx on public.jde_eventos (anio, fase, region);

alter table public.jde_eventos enable row level security;

revoke insert, update, delete, truncate on public.jde_eventos from anon, authenticated;
grant select on public.jde_eventos to anon, authenticated;

create policy jde_eventos_lectura_publica on public.jde_eventos
  for select to anon, authenticated
  using (true);

-- El freno de «jde-publicar»: mismo patrón que jdn_frenar() (ver
-- 20261005233749_jdn_envio_publico.sql) — sus propios topes, más estrictos
-- porque publicar un evento entero pesa más que un formulario, y después el
-- freno genérico de envíos públicos, con el tipo 'formulario' y el ámbito
-- 'jde-publicar' (no se le suma un caso nuevo a interno.frenar_envio_publico:
-- ese freno ya reparte por tipo y por ámbito).
--   por conexión: 10 por hora   por correo: 5 por día   en total: 40 por hora
create or replace function public.jde_frenar(p_ip text, p_correo text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_correo text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
begin
  -- El mismo candado que toma el freno de los formularios: dos envíos a la
  -- vez no se cuentan uno al otro por fuera.
  perform pg_advisory_xact_lock(hashtext('envios_publicos:formulario'));

  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'formulario' and ambito = 'jde-publicar' and ip = v_ip
          and creado > now() - interval '1 hour') >= 10 then
    return 'Llegaron demasiados eventos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;

  if v_correo is not null and (select count(*) from interno.envios_publicos
        where tipo = 'formulario' and ambito = 'jde-publicar' and correo = v_correo
          and creado > now() - interval '1 day') >= 5 then
    return 'Ya publicamos varios eventos con este correo hoy. Si necesitas publicar más, escríbenos por WhatsApp.';
  end if;

  if (select count(*) from interno.envios_publicos
        where tipo = 'formulario' and ambito = 'jde-publicar'
          and creado > now() - interval '1 hour') >= 40 then
    return 'Esta página está recibiendo demasiados eventos en este momento. Intenta de nuevo en una hora.';
  end if;

  return interno.frenar_envio_publico('formulario', 'jde-publicar', v_correo, v_ip);
end;
$$;
revoke all on function public.jde_frenar(text, text) from public, anon, authenticated;
