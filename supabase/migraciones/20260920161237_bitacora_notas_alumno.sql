-- La bitácora del profesor: lo que observa de un alumno, cuando lo observa.
--
-- Hasta ahora lo único que el profesor podía escribir era class_sessions.notes,
-- que es UNA línea por clase entera y sin alumno: no había dónde poner "a Sofía
-- le cuesta el final de torre, revisarlo en dos semanas".
--
-- Aislada por profesor, igual que `tareas` y `class_sessions`: un profesor solo
-- ve las notas que ÉL escribió, no las de un colega que comparte el mismo
-- alumno. Quien administra ve todas, como en `tareas`.
--
-- El alumno solo ve las que le compartieron (misma idea que training_plans.shared)
-- y no puede escribir ninguna: no tiene política de insert, update ni delete.

create table public.notas_alumno (
    id          uuid primary key default gen_random_uuid(),
    alumno_id   uuid not null references public.profiles(id) on delete cascade,
    profesor_id uuid not null references public.profiles(id) on delete cascade,
    texto       text not null check (length(btrim(texto)) between 1 and 4000),
    etiqueta    text check (etiqueta is null or length(btrim(etiqueta)) between 1 and 60),
    compartida  boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz
);

comment on table public.notas_alumno is
    'Bitácora del profesor sobre un alumno. Aislada por profesor (cada quien ve las suyas; quien administra, todas). El alumno solo ve las que tienen compartida = true, y no escribe ninguna.';
comment on column public.notas_alumno.compartida is
    'Hasta que se marca, la nota es privada del profesor. Marcada, el alumno la ve en su propia página de Informes.';

-- Para la lista del profesor sobre un alumno (lo más pedido) y para la del
-- alumno con sus notas compartidas.
create index notas_alumno_profesor_alumno_idx
    on public.notas_alumno (profesor_id, alumno_id, created_at desc);
create index notas_alumno_alumno_compartida_idx
    on public.notas_alumno (alumno_id, created_at desc) where compartida;

-- La hora la pone el servidor y la nota no se puede mudar de alumno ni de
-- autor. Mismo patrón que proteger_tiempos_de_presencia(): new := old para
-- todo lo que no puede moverse, y después solo lo que sí.
create or replace function public.proteger_notas_alumno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.alumno_id  := old.alumno_id;
    new.profesor_id := old.profesor_id;
    new.created_at := old.created_at;
    new.updated_at := now();
    return new;
end;
$$;

create trigger notas_alumno_proteger
    before update on public.notas_alumno
    for each row execute function public.proteger_notas_alumno();

alter table public.notas_alumno enable row level security;

-- El profesor ve las suyas; quien administra, todas.
create policy notas_alumno_select_profesor on public.notas_alumno for select
    using (
        profesor_id = auth.uid()
        or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    );

-- El alumno, solo las que le compartieron.
create policy notas_alumno_select_alumno on public.notas_alumno for select
    using (alumno_id = auth.uid() and compartida);

-- Firmar como otro profesor no se puede, ni siendo administración: el insert
-- exige profesor_id = auth.uid() SIEMPRE, igual que `tareas`.
create policy notas_alumno_insert on public.notas_alumno for insert
    with check (
        profesor_id = auth.uid()
        and (
            (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
            or public.soy_profesor_de(alumno_id)
        )
    );

create policy notas_alumno_update on public.notas_alumno for update
    using (profesor_id = auth.uid())
    with check (profesor_id = auth.uid());

create policy notas_alumno_delete on public.notas_alumno for delete
    using (profesor_id = auth.uid());

-- El público no tiene nada que hacer acá. Supabase da estos permisos por
-- omisión a todo lo nuevo de `public` y confía en la RLS; una puerta menos
-- que dependa de que la política esté bien escrita.
revoke all on public.notas_alumno from anon;