-- Las presentaciones que sube cada profe para mostrarlas en su clase
-- (js/clase-presentacion.js): un PDF que el navegador parte en imágenes, una
-- por página, con el texto de cada una para el lector de pantalla y las
-- posiciones que el profe guarda en cada diapositiva. En la clase se muestran
-- como game_state.presentacion = {deck: "subida/<id>", n}. Ver «La
-- presentación de la clase» en docs/decisiones/clase-en-vivo.md.
create table if not exists public.presentaciones_profe (
  id          uuid        primary key default gen_random_uuid(),
  profesor_id uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  titulo      text        not null check (char_length(btrim(titulo)) between 1 and 120),
  paginas     integer     not null check (paginas between 1 and 200),
  formato     text        not null default 'webp' check (formato in ('webp', 'jpg')),
  textos      text[]      not null default '{}' check (cardinality(textos) <= 200),
  posiciones  jsonb       not null default '{}'::jsonb check (jsonb_typeof(posiciones) = 'object'),
  created_at  timestamptz not null default now()
);
create index if not exists presentaciones_profe_profesor_idx on public.presentaciones_profe (profesor_id, created_at desc);
alter table public.presentaciones_profe enable row level security;

-- La ve su profe, quien administra, y quien ve la clase MIENTRAS el profe la
-- está mostrando: la subconsulta pasa por la RLS de game_state (sus alumnos con
-- la clase abierta, quien la supervisa o coordina). Las demás presentaciones
-- del profe no se le listan a nadie.
create policy presentaciones_profe_select on public.presentaciones_profe for select to authenticated
  using (profesor_id = (select auth.uid())
         or (select public.soy_admin())
         or exists (select 1 from public.game_state g
                     where g.owner_id = presentaciones_profe.profesor_id
                       and g.presentacion->>'deck' = 'subida/' || presentaciones_profe.id::text));
-- Las sube, cambia y borra solo su profe (quien administra también puede borrar).
create policy presentaciones_profe_insert on public.presentaciones_profe for insert to authenticated
  with check (profesor_id = (select auth.uid())
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'profesor'));
create policy presentaciones_profe_update on public.presentaciones_profe for update to authenticated
  using (profesor_id = (select auth.uid())) with check (profesor_id = (select auth.uid()));
create policy presentaciones_profe_delete on public.presentaciones_profe for delete to authenticated
  using (profesor_id = (select auth.uid()) or (select public.soy_admin()));

-- Las imágenes: bucket PRIVADO, <profe>/<presentación>/<n>.(webp|jpg). El profe
-- lee las suyas; los demás, SOLO la página que se está mostrando ahora en una
-- clase que pueden ver: adelantarse a las siguientes (las respuestas) no se puede
-- ni pidiendo la dirección a mano.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('presentaciones', 'presentaciones', false, 3145728, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create policy presentaciones_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'presentaciones'
              and (storage.foldername(name))[1] = ((select auth.uid()))::text);

create policy presentaciones_select on storage.objects for select to authenticated
  using (bucket_id = 'presentaciones'
         and ((storage.foldername(name))[1] = ((select auth.uid()))::text
              or exists (select 1 from public.game_state g
                          where g.owner_id::text = (storage.foldername(name))[1]
                            and g.presentacion->>'deck' = 'subida/' || (storage.foldername(name))[2]
                            and g.presentacion->>'n' = split_part(storage.filename(name), '.', 1))));

create policy presentaciones_delete on storage.objects for delete to authenticated
  using (bucket_id = 'presentaciones'
         and ((storage.foldername(name))[1] = ((select auth.uid()))::text
              or (select public.soy_admin())));