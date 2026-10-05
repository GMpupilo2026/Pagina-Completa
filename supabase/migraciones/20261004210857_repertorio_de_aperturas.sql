-- «Mi repertorio»: las aperturas que juega CADA alumno, con blancas y con
-- negras, para entrenarlas en Aperturas y celadas con el mismo repaso
-- espaciado que el banco.
--
-- - Cada fila es una línea desde la posición inicial, en SAN de chess.js (la
--   que el entrenador ya entiende). La legalidad la comprueba la página con
--   chess.js al armarla y otra vez al leerla: la base no sabe ajedrez, pero sí
--   exige la forma de cada jugada.
-- - Un repertorio tiene UNA respuesta tuya por posición: si en una línea
--   contestas 1.e4 con c5 y en otra con e5, el entrenador te pediría dos
--   jugadas distintas en el mismo lugar. Eso lo frena la base (trigger), no un
--   if de la pantalla.
-- - Lo escribe solo su dueño; lo ven también sus profesores, su supervisión y
--   administración (para preparar sus partidas), como el cuaderno.
-- Ver «Mi repertorio» en docs/decisiones/entrenamiento.md.

create table public.repertorio (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  color text not null check (color in ('w', 'b')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  jugadas text[] not null check (cardinality(jugadas) between 2 and 40
    and array_to_string(jugadas, ' ') ~ '^([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?[+#]?|O-O(-O)?[+#]?)( ([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?[+#]?|O-O(-O)?[+#]?))*$'),
  created_at timestamptz not null default now(),
  unique (alumno_id, color, jugadas)
);
create index repertorio_alumno on public.repertorio (alumno_id, color);

alter table public.repertorio enable row level security;

create policy repertorio_select_propio on public.repertorio for select to authenticated
  using (alumno_id = (select auth.uid()));
create policy repertorio_select_profesor on public.repertorio for select to authenticated
  using ((select mp.is_admin from public.my_profile() mp)
         or alumno_id in (select interno.alumnos_de((select auth.uid()))));
create policy repertorio_select_supervisor on public.repertorio for select to authenticated
  using ((select public.soy_supervisor()) and alumno_id in (select interno.supervisados_por_mi()));
create policy repertorio_insert_propio on public.repertorio for insert to authenticated
  with check (alumno_id = (select auth.uid()));
create policy repertorio_update_propio on public.repertorio for update to authenticated
  using (alumno_id = (select auth.uid())) with check (alumno_id = (select auth.uid()));
create policy repertorio_delete_propio on public.repertorio for delete to authenticated
  using (alumno_id = (select auth.uid()));
create policy repertorio_exige_acceso_ins on public.repertorio as restrictive for insert to authenticated
  with check ((select public.acceso_vigente()));
create policy repertorio_exige_acceso_upd on public.repertorio as restrictive for update to authenticated
  using ((select public.acceso_vigente())) with check ((select public.acceso_vigente()));

-- Una respuesta tuya por posición, un tope de líneas y la fecha de la base.
create or replace function interno.repertorio_coherente()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  i int;
  otra text;
begin
  new.nombre := btrim(new.nombre);
  if tg_op = 'INSERT' then
    new.created_at := now();
    if (select count(*) from public.repertorio r where r.alumno_id = new.alumno_id) >= 100 then
      raise exception 'Ya tienes 100 líneas en tu repertorio: borra alguna para agregar otra.' using errcode = 'check_violation';
    end if;
  end if;
  -- Las jugadas propias: con blancas, la 1.ª, 3.ª…; con negras, la 2.ª, 4.ª…
  i := case when new.color = 'w' then 1 else 2 end;
  while i <= cardinality(new.jugadas) loop
    select r.jugadas[i] into otra
      from public.repertorio r
     where r.alumno_id = new.alumno_id and r.color = new.color and r.id <> new.id
       and cardinality(r.jugadas) >= i
       and r.jugadas[1:i - 1] = new.jugadas[1:i - 1]
       and r.jugadas[i] <> new.jugadas[i]
     limit 1;
    if otra is not null then
      raise exception 'En esa posición tu repertorio ya juega %: una línea con otra respuesta te pediría dos jugadas distintas en el mismo lugar.', otra
        using errcode = 'check_violation', hint = 'repertorio_choca:' || i;
    end if;
    i := i + 2;
  end loop;
  return new;
end $$;
revoke execute on function interno.repertorio_coherente() from public, anon, authenticated;
create trigger repertorio_coherente before insert or update on public.repertorio
  for each row execute function interno.repertorio_coherente();

revoke all on public.repertorio from anon;
revoke truncate, references, trigger on public.repertorio from authenticated;
grant select, insert, update, delete on public.repertorio to authenticated;
