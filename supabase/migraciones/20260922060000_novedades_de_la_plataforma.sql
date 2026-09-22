-- Novedades de la plataforma: un changelog corto que quien administra redacta
-- a mano ("ahora se pueden compartir planes de clase"), no un espejo
-- automático de lo que pasó en la base. Al entrar al panel, quien administra
-- ve en una ventana emergente las que sean más nuevas que la última vez que
-- la cerró.
--
-- Es SOLO de administración, no del equipo docente ni del alumnado: acá se
-- anuncian decisiones del sitio, no actividad de un alumno o de una clase, y
-- confundirlo con la bitácora o con "Tu semana" sería la fuga de siempre —
-- mezclar dos preguntas distintas en una sola pantalla.

create table public.actualizaciones_plataforma (
    id          uuid primary key default gen_random_uuid(),
    titulo      text not null check (length(btrim(titulo)) between 1 and 140),
    descripcion text not null check (length(btrim(descripcion)) between 1 and 2000),
    created_by  uuid references public.profiles(id) on delete set null,
    created_at  timestamptz not null default now()
);

comment on table public.actualizaciones_plataforma is
    'Changelog manual para quien administra. El popup de clases.html muestra las que sean más nuevas que profiles.ultima_vista_actualizaciones.';

-- Es la lista que se pinta entera al abrir la tarjeta de administración y la
-- que arma el popup: siempre de la más nueva a la más vieja.
create index actualizaciones_plataforma_created_at_idx
    on public.actualizaciones_plataforma (created_at desc);

alter table public.actualizaciones_plataforma enable row level security;

-- Aislada para administración, sin excepción para el equipo docente: no es
-- "todo lo que se hace para los profesores vale también para quien
-- administra" (esa regla es al revés) — esto es un aviso ENTRE
-- administradores, y un profesor viéndolo no tiene con qué actuar.
create policy actualizaciones_plataforma_select on public.actualizaciones_plataforma
    for select
    using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));

create policy actualizaciones_plataforma_insert on public.actualizaciones_plataforma
    for insert
    with check (
        created_by = auth.uid()
        and (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    );

create policy actualizaciones_plataforma_update on public.actualizaciones_plataforma
    for update
    using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))
    with check ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));

create policy actualizaciones_plataforma_delete on public.actualizaciones_plataforma
    for delete
    using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));

-- El público no tiene nada que hacer acá. Supabase da estos permisos por
-- omisión a todo lo nuevo de `public` y confía en la RLS; una puerta menos
-- que dependa de que la política esté bien escrita.
revoke all on public.actualizaciones_plataforma from anon;

-- Hasta qué fecha de novedades ya vio quien administra. Vive en el propio
-- perfil, como el resto de lo que es de LA CUENTA y no del aparato (si entra
-- desde el celular y desde la compu, en las dos quiere verlo como leído). No
-- es una columna que protect_profiles_identity_columns() tenga que tocar: no
-- decide ningún permiso ni ninguna identidad, así que cada quien la
-- actualiza con un update normal sobre su propia fila —profiles_update_own
-- ya lo permite tal cual está.
alter table public.profiles
    add column ultima_vista_actualizaciones timestamptz;

comment on column public.profiles.ultima_vista_actualizaciones is
    'Hasta qué fecha de actualizaciones_plataforma ya vio esta cuenta en el popup del panel. NULL = nunca lo cerró (se le muestran todas las que haya).';
