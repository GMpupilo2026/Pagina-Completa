-- Las cuatro tablas de torneos entraron a Realtime (20260930145834) sin la
-- política restrictiva verificacion_en_dos_pasos que lleva cada tabla de
-- Realtime (ver 20260930061319_verificacion_en_dos_pasos): Realtime no pasa por
-- el candado de PostgREST (antes_de_cada_pedido), lee con la RLS de cada tabla,
-- así que sin ella los cambios de un torneo le llegaban a quien entró con la
-- contraseña sola. La misma política, igual que en las demás.
do $$
declare t text;
begin
  foreach t in array array['tournaments', 'tournament_registrations', 'tournament_rounds', 'tournament_pairings'] loop
    execute format(
      'create policy verificacion_en_dos_pasos on public.%I as restrictive for all to authenticated
         using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()))', t);
  end loop;
end $$;
