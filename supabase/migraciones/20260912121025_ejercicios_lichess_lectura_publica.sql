-- Ejercicios de la base abierta de Lichess (CC0): lectura pública, sin escritura.
create policy "Ejercicios Lichess: lectura publica"
  on public."Ejercicios Lichess"
  for select
  to anon, authenticated
  using (true);
grant select on public."Ejercicios Lichess" to anon, authenticated;
create index if not exists ejercicios_lichess_nbplays_idx on public."Ejercicios Lichess" ("NbPlays" desc);