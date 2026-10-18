-- Herramienta «Árbitros de Costa Rica»: con qué Elo se evaluó cada torneo de
-- chess-results, como lo dice su página («Cálculo de elo»): solo nacional,
-- solo internacional, los dos, o ninguno (la página no trae el campo). Para
-- el filtro «Solo con Elo nacional» (ver «Los torneos con Elo nacional» en
-- docs/decisiones/juegos-y-torneos.md). Tabla aparte de arbitros_cr_cr a
-- propósito: la carga completa de esa tabla la borra y la vuelve a llenar, y
-- esto se lee de otra forma (una página por torneo). Mismo candado: solo la lee
-- quien tiene la herramienta; no se escribe desde afuera.

create table public.arbitros_cr_cr_elo (
  clave integer primary key,
  calculo text not null check (calculo in ('nacional', 'internacional', 'ambos', 'ninguno')),
  leido date not null
);
comment on table public.arbitros_cr_cr_elo is
  'Con qué Elo se evaluó cada torneo de chess-results («Cálculo de elo» en su página): nacional, internacional, ambos o ninguno. leido = qué día se leyó la página. La llena herramientas/arbitros-cr/calculo-elo.py desde herramientas/datos/arbitros-cr-calculo-elo.json.';

alter table public.arbitros_cr_cr_elo enable row level security;
revoke all on public.arbitros_cr_cr_elo from public, anon, authenticated;
grant select on public.arbitros_cr_cr_elo to authenticated;
create policy arbitros_cr_cr_elo_con_herramienta on public.arbitros_cr_cr_elo for select to authenticated
  using ((select public.tengo_herramienta('arbitros-cr')));