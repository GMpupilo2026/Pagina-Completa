create table if not exists public.chess_leads (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text not null,
  resumen_partida text,
  pgn text,
  resultado text,
  jugadas int4,
  duracion_seg int4,
  precision_estimada numeric,
  dificultad text,
  color_jugador text,
  creado_en timestamptz not null default now()
);

comment on table public.chess_leads is 'Leads capturados desde el tablero de ajedrez (envio de partida analizada por correo). Independiente de public.inscripciones.';

alter table public.chess_leads enable row level security;

-- Solo la Edge Function (con la service role key) puede insertar/leer.
-- No se otorgan permisos a los roles anon/authenticated: sin políticas =
-- RLS bloquea todo acceso vía la API pública, y la service role la evita.
