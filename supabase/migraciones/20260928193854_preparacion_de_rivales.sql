-- Preparación de rivales (preparacion-rivales.html): un profesor carga un PGN
-- con partidas de un rival y la página arma el análisis (repertorio, FODA,
-- qué jugarle y cómo, revisado con Stockfish). El análisis se hace en el
-- navegador; acá vive QUIÉN puede usarlo y lo que se guarda.
--
-- QUIÉN PUEDE: quien administra, y los profesores que administración active
-- uno por uno en admin.html#preparacion. La lista no tiene política de
-- escritura: la escribe activar_preparacion_rivales(), que valida que quien
-- llama administre y que la cuenta sea de un profesor.
--
-- LO QUE SE GUARDA: el resultado del análisis (no el PGN), de quien lo hizo.
-- Lo ve su dueño y quien administra; nadie más. Guardar exige tener la
-- función activa: si administración la desactiva, los análisis que ya tenía
-- se siguen viendo y borrando, pero no se guardan nuevos.
--
-- Ver «La preparación de rivales» en docs/decisiones/paneles.md.

create table public.preparacion_rivales_profesores (
  profesor_id uuid primary key references public.profiles(id) on delete cascade,
  activado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.preparacion_rivales_profesores is
  'Profesores con la preparación de rivales activa. La escribe solo activar_preparacion_rivales() (administración).';
create index preparacion_rivales_profesores_activado_por_idx on public.preparacion_rivales_profesores (activado_por);

alter table public.preparacion_rivales_profesores enable row level security;
revoke all on public.preparacion_rivales_profesores from public, anon, authenticated;
grant select on public.preparacion_rivales_profesores to authenticated;

create policy preparacion_rivales_profesores_ver on public.preparacion_rivales_profesores
  for select to authenticated
  using (profesor_id = (select auth.uid()) or (select public.soy_admin()));

-- ¿La cuenta que llama puede preparar rivales? Quien administra, siempre.
create or replace function public.puedo_preparar_rivales()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce((select public.soy_admin()), false)
      or exists (select 1 from public.preparacion_rivales_profesores p
                  where p.profesor_id = (select auth.uid()));
$function$;
revoke execute on function public.puedo_preparar_rivales() from public, anon;
grant execute on function public.puedo_preparar_rivales() to authenticated;

-- Activa o desactiva la función para un profesor. Devuelve cómo quedó,
-- leído de la tabla y no de lo que se pidió.
create or replace function public.activar_preparacion_rivales(p_profesor uuid, p_activa boolean)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo quien administra puede activar la preparación de rivales.' using errcode = '42501';
  end if;
  if p_activa then
    if not exists (select 1 from public.profiles where id = p_profesor and role = 'profesor') then
      raise exception 'Esa cuenta no es de un profesor.' using errcode = '22023';
    end if;
    insert into public.preparacion_rivales_profesores (profesor_id, activado_por)
    values (p_profesor, auth.uid())
    on conflict (profesor_id) do nothing;
  else
    delete from public.preparacion_rivales_profesores where profesor_id = p_profesor;
  end if;
  return exists (select 1 from public.preparacion_rivales_profesores where profesor_id = p_profesor);
end;
$function$;
revoke execute on function public.activar_preparacion_rivales(uuid, boolean) from public, anon;
grant execute on function public.activar_preparacion_rivales(uuid, boolean) to authenticated;

create table public.preparaciones_rival (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rival text not null check (char_length(btrim(rival)) between 1 and 120),
  partidas integer not null check (partidas between 1 and 100000),
  analisis jsonb not null check (jsonb_typeof(analisis) = 'object' and pg_column_size(analisis) <= 1500000),
  created_at timestamptz not null default now()
);
comment on table public.preparaciones_rival is
  'Análisis de rivales guardados desde preparacion-rivales.html. Los ve su dueño y quien administra.';
create index preparaciones_rival_profesor_idx on public.preparaciones_rival (profesor_id, created_at desc);

alter table public.preparaciones_rival enable row level security;
revoke all on public.preparaciones_rival from public, anon, authenticated;
grant select, insert, delete on public.preparaciones_rival to authenticated;

create policy preparaciones_rival_ver on public.preparaciones_rival
  for select to authenticated
  using (profesor_id = (select auth.uid()) or (select public.soy_admin()));
create policy preparaciones_rival_guardar on public.preparaciones_rival
  for insert to authenticated
  with check (profesor_id = (select auth.uid()) and (select public.puedo_preparar_rivales()));
create policy preparaciones_rival_borrar on public.preparaciones_rival
  for delete to authenticated
  using (profesor_id = (select auth.uid()));
