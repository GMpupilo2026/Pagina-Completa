create table public.trofeos_ajustes (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  cantidad integer not null check (cantidad <> 0 and cantidad between -100 and 100),
  motivo text not null default '' check (char_length(motivo) <= 200),
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.trofeos_ajustes is
  'Trofeos que el profesor suma o quita a mano. El total del alumno es sus respuestas correctas en clase más la suma de esta tabla (trofeos_de()). Solo la escribe ajustar_trofeos().';

create index trofeos_ajustes_alumno on public.trofeos_ajustes (alumno_id, created_at desc);

alter table public.trofeos_ajustes enable row level security;
revoke all on public.trofeos_ajustes from public, anon, authenticated;
grant select on public.trofeos_ajustes to authenticated;

create policy trofeos_ajustes_ver on public.trofeos_ajustes
  for select to authenticated
  using (
    alumno_id = (select auth.uid())
    or (select public.soy_admin())
    or alumno_id in (select interno.alumnos_de((select auth.uid())))
    or ((select public.soy_supervisor())
        and alumno_id in (select interno.supervisados_por_mi()))
  );

create or replace function public.trofeos_de(p_alumno uuid default auth.uid())
 returns table(por_clase integer, ajustes integer, total integer)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_clase integer;
  v_ajustes integer;
begin
  if not coalesce(
       p_alumno is not null and (
         p_alumno = auth.uid()
         or public.soy_admin()
         or public.soy_profesor_de(p_alumno)
         or (public.soy_supervisor() and p_alumno in (select interno.supervisados_por_mi()))
       ), false) then
    raise exception 'No puedes ver los trofeos de esta persona.' using errcode = '42501';
  end if;
  select count(*)::integer into v_clase
    from public.question_answers qa
   where qa.student_id = p_alumno and qa.is_correct is true;
  select coalesce(sum(t.cantidad), 0)::integer into v_ajustes
    from public.trofeos_ajustes t
   where t.alumno_id = p_alumno;
  return query select v_clase, v_ajustes, greatest(0, v_clase + v_ajustes);
end;
$function$;
revoke execute on function public.trofeos_de(uuid) from public, anon;
grant execute on function public.trofeos_de(uuid) to authenticated;

create or replace function public.ajustar_trofeos(p_alumno uuid, p_cantidad integer, p_motivo text default '')
 returns table(por_clase integer, ajustes integer, total integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_yo uuid := auth.uid();
  v_actual integer;
begin
  if not coalesce(
       v_yo is not null and p_alumno is not null and p_alumno <> v_yo
       and (public.soy_admin() or public.soy_profesor_de(p_alumno)), false) then
    raise exception 'Solo su profesor puede ajustar los trofeos de este alumno.' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad = 0 or p_cantidad not between -100 and 100 then
    raise exception 'La cantidad va de -100 a 100 y no puede ser cero.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('trofeos:' || p_alumno::text));
  select t.total into v_actual from public.trofeos_de(p_alumno) t;
  if v_actual + p_cantidad < 0 then
    raise exception 'No se pueden quitar % trofeos: tiene %.', -p_cantidad, v_actual using errcode = '22023';
  end if;

  insert into public.trofeos_ajustes (alumno_id, cantidad, motivo, creado_por)
  values (p_alumno, p_cantidad, left(btrim(coalesce(p_motivo, '')), 200), v_yo);

  return query select * from public.trofeos_de(p_alumno);
end;
$function$;
revoke execute on function public.ajustar_trofeos(uuid, integer, text) from public, anon;
grant execute on function public.ajustar_trofeos(uuid, integer, text) to authenticated;

alter publication supabase_realtime add table public.trofeos_ajustes;