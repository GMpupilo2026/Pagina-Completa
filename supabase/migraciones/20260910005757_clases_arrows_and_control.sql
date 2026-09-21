
-- Flechas dibujadas por el profesor (visibles para todos) y control cedido a un alumno.
alter table public.game_state
  add column arrows jsonb not null default '[]'::jsonb,
  add column active_player_id uuid references public.profiles(id) on delete set null;

-- Reemplaza la política de UPDATE: además del profesor, permite al alumno con el
-- control cedido (active_player_id) actualizar la fila (para mover piezas).
drop policy "game_state_update_profesor" on public.game_state;

create policy "game_state_update_profesor_or_active_player"
  on public.game_state for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
    or auth.uid() = active_player_id
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
    or auth.uid() = active_player_id
  );

-- Un alumno con control cedido solo puede mover piezas: no puede tocar `arrows` ni
-- `active_player_id` (ceder/quitar control y dibujar flechas queda solo para el profesor).
create function public.protect_game_state_teacher_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_teacher boolean;
begin
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
    into is_teacher;
  if not is_teacher then
    new.arrows := old.arrows;
    new.active_player_id := old.active_player_id;
  end if;
  return new;
end;
$$;

create trigger protect_game_state_teacher_columns_trigger
  before update on public.game_state
  for each row execute function public.protect_game_state_teacher_columns();
