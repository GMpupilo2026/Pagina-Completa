-- «Mi cuaderno»: las posiciones que el alumno guarda, con su nota.
--
-- La bitácora (notas_alumno) es del profesor; el alumno no tenía un lugar
-- suyo. Esto es suyo: lo escribe, lo cambia y lo borra solo él. Su profe lo
-- ve solo si él lo marca como compartido (compartida), con el mismo alcance
-- que el resto de su progreso: sus profesores (interno.alumnos_de), quien lo
-- supervisa y administración.
--
-- Una posición se guarda una vez: guardar otra vez la misma posición (el
-- mismo FEN) cambia la nota en vez de duplicarla (índice único).
create table public.cuaderno (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  fen text not null check (char_length(fen) between 15 and 100),
  titulo text check (titulo is null or char_length(titulo) <= 120),
  nota text check (nota is null or char_length(nota) <= 2000),
  origen text check (origen is null or char_length(origen) <= 160),
  -- A dónde volver: una dirección DEL SITIO, relativa a la raíz
  -- («entreno/temas.html?…»). Nunca otra página: se pinta como enlace.
  enlace text check (enlace is null or (char_length(enlace) <= 300 and enlace ~ '^[a-z0-9][a-z0-9/_.-]*\.html([?#][^\s<>"'']*)?$')),
  jugadas text[] check (jugadas is null or cardinality(jugadas) <= 60),
  compartida boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cuaderno_alumno_fen on public.cuaderno (alumno_id, fen);
create index cuaderno_alumno_fecha on public.cuaderno (alumno_id, updated_at desc);

alter table public.cuaderno enable row level security;

create policy cuaderno_select_propio on public.cuaderno for select to authenticated
  using (alumno_id = (select auth.uid()));
create policy cuaderno_select_profesor on public.cuaderno for select to authenticated
  using (compartida and (
    (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or alumno_id in (select interno.alumnos_de((select auth.uid())))));
create policy cuaderno_select_supervisor on public.cuaderno for select to authenticated
  using (compartida and (select public.soy_supervisor())
         and alumno_id in (select interno.supervisados_por_mi()));
create policy cuaderno_insert_propio on public.cuaderno for insert to authenticated
  with check (alumno_id = (select auth.uid()));
create policy cuaderno_update_propio on public.cuaderno for update to authenticated
  using (alumno_id = (select auth.uid())) with check (alumno_id = (select auth.uid()));
create policy cuaderno_delete_propio on public.cuaderno for delete to authenticated
  using (alumno_id = (select auth.uid()));
-- Como el resto de lo que escribe un alumno: con el acceso vencido, no escribe.
create policy cuaderno_exige_acceso_ins on public.cuaderno as restrictive for insert to authenticated
  with check ((select public.acceso_vigente()));
create policy cuaderno_exige_acceso_upd on public.cuaderno as restrictive for update to authenticated
  using ((select public.acceso_vigente())) with check ((select public.acceso_vigente()));

-- updated_at lo pone la base, y alumno_id no se cambia.
create or replace function interno.cuaderno_al_cambiar()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  new.alumno_id := old.alumno_id;
  new.created_at := old.created_at;
  return new;
end $$;
revoke execute on function interno.cuaderno_al_cambiar() from public, anon, authenticated;
create trigger cuaderno_al_cambiar before update on public.cuaderno
  for each row execute function interno.cuaderno_al_cambiar();

-- Hasta 500 posiciones por alumno: es un cuaderno, no un respaldo de la base.
create or replace function interno.cuaderno_tope()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (select count(*) from public.cuaderno c where c.alumno_id = new.alumno_id) >= 500 then
    raise exception 'Tu cuaderno ya tiene 500 posiciones. Borra alguna para guardar otra.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function interno.cuaderno_tope() from public, anon, authenticated;
create trigger cuaderno_tope before insert on public.cuaderno
  for each row execute function interno.cuaderno_tope();

revoke all on public.cuaderno from anon;
grant select, insert, update, delete on public.cuaderno to authenticated;
