-- Preparación de rivales, etapa 5: dónde deja la teoría.
--
-- Lo que contestó el explorador de maestros de Lichess, por posición (los
-- cuatro campos del FEN que dicen qué posición es). Lo escribe y lo lee solo
-- la Edge Function explorador-maestros, con el service role: la tabla no
-- tiene políticas y a nadie más se le dan permisos. Guarda posiciones de
-- ajedrez y cuántas partidas de maestros hay en cada una; nada de nadie.
--
-- Ver «Dónde deja la teoría: etapa 5» en docs/decisiones/paneles.md.

create table public.explorador_maestros_cache (
  fen text primary key check (char_length(fen) between 20 and 100),
  datos jsonb not null check (jsonb_typeof(datos) = 'object'),
  leido_en timestamptz not null default now()
);
comment on table public.explorador_maestros_cache is
  'Lo que el explorador de maestros de Lichess contestó por posición. Solo la usa la Edge Function explorador-maestros (service role).';
alter table public.explorador_maestros_cache enable row level security;
revoke all on public.explorador_maestros_cache from public, anon, authenticated;