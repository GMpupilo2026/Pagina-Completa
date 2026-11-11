-- Mesa del árbitro (mesa-arbitro.html): jugadas ilegales e irregularidades por mesa,
-- como en la versión del Centroamericano (centroamericano_registro).
--
-- La bitácora del árbitro (arbitro_bitacora) aceptaba solo resultado, corrección,
-- incidencia y nota. Ahora acepta también:
--   - 'ilegal' e 'irregularidad': de una partida (ronda + mesa) y de un jugador
--     (color, y su nombre en `jugador`). Las ilegales se cuentan por partida para el
--     art. 7.5.5; la cuenta la hace la página con lo que lee (MesaArbitro.marcas).
--   - 'anulacion': un toque por error no se edita ni se borra (la bitácora solo se
--     agrega). Se anula con otra línea que apunta a la anulada (`anula`).
--
-- Lo que la base garantiza, y no la pantalla:
--   - una anulación apunta a una ilegal o irregularidad PROPIA, de la misma partida
--     y el mismo jugador (la política de insert lo comprueba);
--   - una línea no se anula dos veces (índice único sobre `anula`);
--   - la hora y el autor los sigue poniendo la base: `jugador`, `color` y `anula` se
--     suman al permiso de insert por columna, `ocurrio` y `creada_por` no.
-- Ver «Mesa del árbitro: ilegales, irregularidades y guardar por mesa» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.arbitro_bitacora
  add column color text check (color in ('blancas', 'negras')),
  add column jugador text not null default '' check (length(jugador) <= 120),
  add column anula uuid references public.arbitro_bitacora(id) on delete cascade;

alter table public.arbitro_bitacora drop constraint arbitro_bitacora_tipo_check;
alter table public.arbitro_bitacora add constraint arbitro_bitacora_tipo_check
  check (tipo in ('resultado', 'correccion', 'ilegal', 'irregularidad', 'incidencia', 'nota', 'anulacion'));

alter table public.arbitro_bitacora drop constraint arbitro_bitacora_check;
alter table public.arbitro_bitacora add constraint arbitro_bitacora_check check (
  (tipo in ('resultado', 'correccion') and resultado is not null and mesa is not null)
  or (tipo in ('ilegal', 'irregularidad') and color is not null and ronda is not null and mesa is not null)
  or (tipo in ('incidencia', 'nota') and length(btrim(texto)) > 0)
  or (tipo = 'anulacion' and anula is not null)
);

-- Una línea se anula una sola vez.
create unique index arbitro_bitacora_anula_unico on public.arbitro_bitacora (anula) where anula is not null;

grant insert (color, jugador, anula) on public.arbitro_bitacora to authenticated;

comment on column public.arbitro_bitacora.color is 'De qué jugador es una ilegal o irregularidad (y su anulación): blancas o negras.';
comment on column public.arbitro_bitacora.jugador is 'El nombre del jugador de una ilegal o irregularidad, como lo mostraba chess-results.';
comment on column public.arbitro_bitacora.anula is 'Una anulación apunta a la ilegal o irregularidad que deja sin efecto. La anulada no se edita ni se borra.';

drop policy arbitro_bitacora_anotar on public.arbitro_bitacora;
create policy arbitro_bitacora_anotar on public.arbitro_bitacora
  for insert to authenticated
  with check (
    creada_por = (select auth.uid())
    and (select public.tengo_herramienta('mesa-arbitro'))
    and (
      anula is null
      or (tipo = 'anulacion' and exists (
        select 1 from public.arbitro_bitacora b
        where b.id = anula
          and b.creada_por = (select auth.uid())
          and b.tipo in ('ilegal', 'irregularidad')
          and b.tnr = arbitro_bitacora.tnr
          and b.ronda is not distinct from arbitro_bitacora.ronda
          and b.mesa is not distinct from arbitro_bitacora.mesa
          and b.color is not distinct from arbitro_bitacora.color))
    )
  );
