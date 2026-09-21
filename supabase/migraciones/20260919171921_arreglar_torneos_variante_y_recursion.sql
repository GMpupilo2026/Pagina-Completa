-- 1) tournaments.variant decía 'standard' (constraint y default) pero TODO
-- el resto del sitio (game_rooms, torneos.html, torneo.html) usa 'estandar'.
-- Crear un torneo con la modalidad de siempre violaba el constraint.
alter table public.tournaments drop constraint tournaments_variant_check;
alter table public.tournaments alter column variant set default 'estandar';
alter table public.tournaments add constraint tournaments_variant_check
  check (variant = any (array['estandar'::text, 'crazyhouse'::text, 'cartas'::text, 'duelo'::text, 'niebla'::text]));

-- 2) tournaments_update se mordía la cola: su USING/WITH CHECK consultaba
-- tournament_registrations, y la política de esa tabla vuelve a consultar
-- tournaments -> "infinite recursion detected in policy for relation
-- tournaments" en TODO update (empezar el torneo, generar una ronda, cerrar
-- una ronda), sin excepción de quién llama. Se envuelve en una función
-- SECURITY DEFINER, el mismo patrón que ya usan es_mi_profesor() y
-- soy_profesor_de() para no volver a pasar por la RLS de la otra tabla.
create or replace function public.estoy_inscrito_en(p_torneo uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.tournament_registrations r
    where r.tournament_id = p_torneo and r.player_id = auth.uid()
  );
$$;

drop policy tournaments_update on public.tournaments;
create policy tournaments_update on public.tournaments
  for update
  using (
    created_by = auth.uid()
    or (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or estoy_inscrito_en(id)
  )
  with check (
    created_by = auth.uid()
    or (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or estoy_inscrito_en(id)
  );
