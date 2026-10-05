-- Lo que el alumno juega de verdad, para su profe.
--
-- El alumno pone en Configuración sus usuarios de Lichess y de Chess.com y su
-- navegador baja sus partidas públicas y las analiza con el mismo análisis de
-- la preparación de rivales (js/preparacion-analisis.js), aplicado a él: qué
-- abre con blancas, qué contesta con negras, dónde rinde y dónde no, dónde
-- improvisa. Se guarda UNA fila por alumno con el último análisis, y su profe
-- la ve en Informes al lado de «Mi repertorio» (js/analisis-alumno.js).
--
-- - Las partidas no se guardan: solo los usuarios y el resultado (como
--   preparaciones_rival). Los usuarios son públicos en esos sitios, pero son
--   del alumno: los ve quien ve al alumno.
-- - Lo escribe el alumno o quien le da clase (o administración): el profe
--   puede volver a analizar o poner los usuarios él mismo.
-- - El análisis lo hace un navegador; la base acota lo que acepta (un objeto,
--   hasta 1,5 MB) y anota quién y cuándo, para que nadie lo tome por un dato
--   de la base.
-- Ver «Lo que juega en Lichess y Chess.com» en docs/decisiones/informes.md.

create table public.analisis_partidas_alumno (
  alumno_id uuid primary key references public.profiles(id) on delete cascade,
  lichess text check (lichess is null or lichess ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$'),
  chesscom text check (chesscom is null or chesscom ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$'),
  analisis jsonb check (analisis is null or (jsonb_typeof(analisis) = 'object' and pg_column_size(analisis) <= 1572864)),
  partidas integer check (partidas is null or partidas between 0 and 100000),
  analizado_at timestamptz,
  analizado_por uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (lichess is not null or chesscom is not null)
);

alter table public.analisis_partidas_alumno enable row level security;

create policy analisis_partidas_select on public.analisis_partidas_alumno for select to authenticated
  using (alumno_id = (select auth.uid())
         or (select mp.is_admin from public.my_profile() mp)
         or alumno_id in (select interno.alumnos_de((select auth.uid())))
         or ((select public.soy_supervisor()) and alumno_id in (select interno.supervisados_por_mi())));
create policy analisis_partidas_insert on public.analisis_partidas_alumno for insert to authenticated
  with check (alumno_id = (select auth.uid())
              or (select mp.is_admin from public.my_profile() mp)
              or alumno_id in (select interno.alumnos_de((select auth.uid()))));
create policy analisis_partidas_update on public.analisis_partidas_alumno for update to authenticated
  using (alumno_id = (select auth.uid())
         or (select mp.is_admin from public.my_profile() mp)
         or alumno_id in (select interno.alumnos_de((select auth.uid()))))
  with check (alumno_id = (select auth.uid())
              or (select mp.is_admin from public.my_profile() mp)
              or alumno_id in (select interno.alumnos_de((select auth.uid()))));
create policy analisis_partidas_delete on public.analisis_partidas_alumno for delete to authenticated
  using (alumno_id = (select auth.uid()));

-- Quién y cuándo lo pone la base: si cambia el análisis, quien lo mandó y la
-- hora; si cambian los usuarios, el análisis viejo ya no es de esas cuentas y
-- se borra (no se le muestra al profe lo de otra persona).
create or replace function interno.analisis_partidas_al_guardar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (new.lichess is distinct from old.lichess or new.chesscom is distinct from old.chesscom)
     and new.analisis is not distinct from old.analisis then
    new.analisis := null;
    new.partidas := null;
  end if;
  if new.analisis is null then
    new.analizado_at := null;
    new.analizado_por := null;
  elsif tg_op = 'INSERT' or new.analisis is distinct from old.analisis then
    new.analizado_at := now();
    new.analizado_por := (select auth.uid());
  else
    new.analizado_at := old.analizado_at;
    new.analizado_por := old.analizado_por;
  end if;
  return new;
end $$;
revoke execute on function interno.analisis_partidas_al_guardar() from public, anon, authenticated;
create trigger analisis_partidas_al_guardar before insert or update on public.analisis_partidas_alumno
  for each row execute function interno.analisis_partidas_al_guardar();

revoke all on public.analisis_partidas_alumno from anon;
revoke truncate, references, trigger on public.analisis_partidas_alumno from authenticated;
grant select, insert, update, delete on public.analisis_partidas_alumno to authenticated;
