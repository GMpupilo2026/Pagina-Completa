-- Elo del alumno (lo registra el propio alumno en Configuración; el profesor de ese
-- alumno o un administrador pueden ajustarlo desde Informes con set_student_elo).
alter table public.profiles
  add column if not exists elo integer check (elo is null or (elo between 100 and 3500)),
  add column if not exists elo_tipo text check (elo_tipo is null or elo_tipo in ('fide','nacional','online','estimado')),
  add column if not exists elo_actualizado timestamptz;

comment on column public.profiles.elo is 'Rating declarado del alumno (100-3500). Lo usa el diagnóstico de nivel para ajustar el nivel estimado y el plan.';
comment on column public.profiles.elo_tipo is 'Origen del Elo: fide, nacional, online (Lichess/Chess.com) o estimado (por el profesor).';

create or replace function public.set_student_elo(p_student uuid, p_elo integer, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
begin
  select role, is_admin into me from public.profiles where id = auth.uid();
  if me is null then
    raise exception 'Sin sesión';
  end if;
  if not (me.is_admin
          or (me.role = 'profesor' and exists (select 1 from public.profiles s where s.id = p_student and s.teacher_id = auth.uid()))) then
    raise exception 'Solo el profesor del alumno o un administrador pueden cambiar su Elo';
  end if;
  if p_elo is not null and (p_elo < 100 or p_elo > 3500) then
    raise exception 'Elo fuera de rango (100 a 3500)';
  end if;
  if p_tipo is not null and p_tipo not in ('fide','nacional','online','estimado') then
    raise exception 'Tipo de Elo no válido';
  end if;
  update public.profiles
     set elo = p_elo, elo_tipo = p_tipo, elo_actualizado = now()
   where id = p_student;
end;
$$;

revoke all on function public.set_student_elo(uuid, integer, text) from public;
grant execute on function public.set_student_elo(uuid, integer, text) to authenticated;