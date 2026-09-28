-- Preparación de rivales, etapa 4: el plan le llega al alumno.
-- Ver supabase/migraciones/*_plan_rival_al_alumno.sql y
-- «Mandar el plan al alumno y a la clase: etapa 4» en docs/decisiones/paneles.md.

create table public.planes_rival_alumno (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  rival text not null check (char_length(btrim(rival)) between 1 and 120),
  lado text not null check (lado in ('conBlancas', 'conNegras')),
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and jsonb_typeof(plan -> 'plan') = 'array'
                             and pg_column_size(plan) <= 200000),
  nota text check (nota is null or char_length(nota) <= 2000),
  created_at timestamptz not null default now()
);
comment on table public.planes_rival_alumno is
  'El plan contra un rival que un profesor le mandó a un alumno (solo el plan, no el análisis). Lo ven el alumno, quien lo mandó y quien administra.';
create index planes_rival_alumno_alumno_idx on public.planes_rival_alumno (alumno_id, created_at desc);
create index planes_rival_alumno_profesor_idx on public.planes_rival_alumno (profesor_id, created_at desc);

alter table public.planes_rival_alumno enable row level security;
revoke all on public.planes_rival_alumno from public, anon, authenticated;
grant select, insert, delete on public.planes_rival_alumno to authenticated;

create policy planes_rival_alumno_ver on public.planes_rival_alumno
  for select to authenticated
  using (alumno_id = (select auth.uid())
         or profesor_id = (select auth.uid())
         or (select public.soy_admin()));
create policy planes_rival_alumno_mandar on public.planes_rival_alumno
  for insert to authenticated
  with check (profesor_id = (select auth.uid())
              and (select public.puedo_preparar_rivales())
              and ((select public.soy_admin()) or public.soy_profesor_de(alumno_id)));
create policy planes_rival_alumno_borrar on public.planes_rival_alumno
  for delete to authenticated
  using (profesor_id = (select auth.uid()) or (select public.soy_admin()));

create or replace function public.mandar_plan_rival(
  p_alumnos uuid[], p_rival text, p_lado text, p_plan jsonb, p_nota text, p_vence timestamptz)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_alumno uuid;
  v_id uuid;
  v_n integer := 0;
  v_rival text := btrim(coalesce(p_rival, ''));
  v_etiqueta text;
begin
  if p_alumnos is null or array_length(p_alumnos, 1) is null then
    raise exception 'Elige al menos un alumno.';
  end if;
  if array_length(p_alumnos, 1) > 300 then
    raise exception 'Demasiados alumnos de una vez.';
  end if;
  if not coalesce((select public.puedo_preparar_rivales()), false) then
    raise exception 'No tienes activa la preparación de rivales.' using errcode = '42501';
  end if;
  if p_lado not in ('conBlancas', 'conNegras') then
    raise exception 'El plan tiene que ser con blancas o con negras.';
  end if;
  if p_plan is null or jsonb_typeof(p_plan -> 'plan') <> 'array' or jsonb_array_length(p_plan -> 'plan') = 0 then
    raise exception 'Ese lado no tiene plan.';
  end if;
  v_etiqueta := 'el plan contra ' || v_rival || (case when p_lado = 'conBlancas' then ', con blancas' else ', con negras' end);

  foreach v_alumno in array p_alumnos loop
    if not exists (select 1 from public.profiles where id = v_alumno and role = 'alumno') then
      raise exception 'Una de las cuentas elegidas no es de un alumno.' using errcode = '22023';
    end if;
    insert into public.planes_rival_alumno (profesor_id, alumno_id, rival, lado, plan, nota)
    values (auth.uid(), v_alumno, v_rival, p_lado, p_plan, nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;

    perform public.crear_tarea(
      array[v_alumno],
      'Tu plan contra ' || v_rival,
      coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Recorre cada línea en el tablero hasta saberla.'),
      p_vence,
      jsonb_build_array(jsonb_build_object(
        'material_tipo', 'herramienta',
        'material_slug', 'plan-rival',
        'material_label', v_etiqueta,
        'material_href', 'plan-rival.html?id=' || v_id,
        'meta_tipo', 'completar')));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;
revoke execute on function public.mandar_plan_rival(uuid[], text, text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.mandar_plan_rival(uuid[], text, text, jsonb, text, timestamptz) to authenticated;