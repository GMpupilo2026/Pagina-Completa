-- El ritmo de cada torneo como lo clasifica chess-results en su ficha
-- («Control de tiempo (Standard | Rapid | Blitz)»): el Elo nacional se calcula
-- solo para el clásico, así que «Solo con Elo nacional» pide las dos cosas.
alter table public.arbitros_cr_cr_elo
  add column ritmo text check (ritmo in ('clasico', 'rapido', 'blitz'));
comment on column public.arbitros_cr_cr_elo.ritmo is
  'El ritmo según la ficha de chess-results: clasico (Standard), rapido (Rapid) o blitz. Nulo si la ficha no lo dice.';