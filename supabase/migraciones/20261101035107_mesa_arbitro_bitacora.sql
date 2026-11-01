create table public.arbitro_bitacora (
  id uuid primary key default gen_random_uuid(),
  creada_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  ocurrio timestamptz not null default now(),
  tnr text not null check (tnr ~ '^[0-9]{1,7}$'),
  torneo text not null default '' check (length(torneo) <= 200),
  ronda integer check (ronda between 1 and 99),
  mesa integer check (mesa between 1 and 9999),
  tipo text not null check (tipo in ('resultado', 'correccion', 'incidencia', 'nota')),
  resultado text check (resultado in ('1-0', '1/2', '0-1', '1f-0f', '0f-1f', '0f-0f', 'borrado')),
  anterior text check (anterior in ('1-0', '1/2', '0-1', '1f-0f', '0f-1f', '0f-0f', 'borrado', 'sin resultado')),
  articulo text not null default '' check (length(articulo) <= 60),
  texto text not null default '' check (length(texto) <= 2000),
  enviado boolean not null default false,
  -- un resultado o una corrección dice cuál; una incidencia o una nota dice algo
  check ((tipo in ('resultado', 'correccion') and resultado is not null and mesa is not null)
         or (tipo in ('incidencia', 'nota') and length(btrim(texto)) > 0))
);
comment on table public.arbitro_bitacora is
  'La bitácora del árbitro (herramienta mesa-arbitro): una línea por hecho de un torneo de chess-results (tnr). tipo: resultado anotado o mandado, correccion (con el resultado anterior), incidencia o nota. enviado: el resultado se mandó a chess-results con la clave del torneo y se comprobó leyéndolo de vuelta. Solo se agrega: no se edita ni se borra. La hora y el autor los pone la base. La clave del torneo (SID) nunca se guarda.';
create index arbitro_bitacora_persona_torneo_idx on public.arbitro_bitacora (creada_por, tnr, ocurrio);

alter table public.arbitro_bitacora enable row level security;
revoke all on public.arbitro_bitacora from public, anon, authenticated;
grant select on public.arbitro_bitacora to authenticated;
grant insert (tnr, torneo, ronda, mesa, tipo, resultado, anterior, articulo, texto, enviado)
  on public.arbitro_bitacora to authenticated;

create policy arbitro_bitacora_ver on public.arbitro_bitacora
  for select to authenticated
  using ((creada_por = (select auth.uid()) and (select public.tengo_herramienta('mesa-arbitro')))
         or (select public.soy_admin()));
create policy arbitro_bitacora_anotar on public.arbitro_bitacora
  for insert to authenticated
  with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('mesa-arbitro')));
