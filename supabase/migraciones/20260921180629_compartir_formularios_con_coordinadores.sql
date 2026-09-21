-- Compartir un formulario con un coordinador concreto.
--
-- Hoy un formulario solo lo ve quien lo creó, quien administra, y —desde
-- coordinacion_acota_formularios— un coordinador BAJO cuya coordinación esté
-- quien lo creó. Eso deja un hueco: cuando quien lo arma es la propia cuenta
-- master, `bajo_mi_coordinacion()` nunca es cierto para nadie (administrar no
-- es "estar bajo" ningún coordinador), así que un formulario armado por quien
-- administra queda invisible para todo el equipo de coordinación, sin que
-- nada avise. Y aunque lo hubiera armado otra coordinadora, hoy no hay forma
-- de dárselo a UNA colega puntual — solo a quien ya la coordina.
--
-- La salida es la misma que ya se usó para los planes de clase: un formulario
-- sigue siendo DE quien lo armó (compartirlo no permite editarlo ni borrarlo,
-- eso sigue siendo del dueño o de quien administra), y el dueño elige, uno por
-- uno, con qué coordinador lo comparte. Quien lo recibe puede verlo, leer sus
-- respuestas y dar de alta las cuentas desde ellas — exactamente lo mismo que
-- ya puede un coordinador que lo ve por `bajo_mi_coordinacion()`.

create table if not exists public.formulario_compartidos (
    formulario_id  uuid not null references public.formularios(id) on delete cascade,
    coordinador_id uuid not null references public.profiles(id)     on delete cascade,
    created_at     timestamptz not null default now(),
    primary key (formulario_id, coordinador_id)
);

create index if not exists formulario_compartidos_coordinador_idx
    on public.formulario_compartidos (coordinador_id);

comment on table public.formulario_compartidos is
    'A qué coordinador más, además del dueño, se le comparte un formulario. Da ver el formulario y sus respuestas, no editarlo ni borrarlo.';

alter table public.formulario_compartidos enable row level security;

-- Las dos preguntas de siempre, SECURITY DEFINER para que la política de
-- formularios (que mira formulario_compartidos) y la de formulario_compartidos
-- (que mira formularios) no se muerdan la cola: una RLS llamando a la otra es
-- recursión infinita.
create or replace function public.soy_dueno_del_formulario(p_formulario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.formularios f
        where f.id = p_formulario and f.creado_por = auth.uid()
    );
$$;

create or replace function public.formulario_compartido_conmigo(p_formulario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.formulario_compartidos c
        where c.formulario_id = p_formulario and c.coordinador_id = auth.uid()
    );
$$;

-- Solo se puede compartir con alguien que YA coordina (o administra). Sin
-- esto, nada impediría poner ahí el id de un profesor cualquiera o de un
-- alumno, y formulario_respuestas trae cédulas y fechas de nacimiento de
-- menores.
create or replace function public.es_coordinador_de(p_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select p.es_coordinador or p.is_admin
         from public.profiles p where p.id = p_persona),
        false
    );
$$;

revoke all on function public.soy_dueno_del_formulario(uuid) from anon;
revoke all on function public.formulario_compartido_conmigo(uuid) from anon;
revoke all on function public.es_coordinador_de(uuid) from anon;
grant execute on function public.soy_dueno_del_formulario(uuid) to authenticated;
grant execute on function public.formulario_compartido_conmigo(uuid) to authenticated;
grant execute on function public.es_coordinador_de(uuid) to authenticated;

-- Con quién se puede compartir: el resto del equipo de coordinación, con
-- nombre. Hace falta una función porque la RLS de profiles no le deja a un
-- coordinador ver a sus colegas (solo a sus alumnos y a sí mismo) — sin ella
-- el selector saldría vacío o con filas sin nombre.
create or replace function public.coordinadores_disponibles()
returns table (id uuid, nombre text, email text)
language sql
stable
security definer
set search_path = public
as $$
    select p.id,
           coalesce(nullif(trim(p.full_name), ''), p.email) as nombre,
           p.email
    from public.profiles p
    where (coalesce(p.es_coordinador, false) or coalesce(p.is_admin, false))
      and p.id <> auth.uid()
      and public.soy_coordinador()
    order by nombre;
$$;

revoke all on function public.coordinadores_disponibles() from anon;
grant execute on function public.coordinadores_disponibles() to authenticated;

-- ---------------------------------------------------- formulario_compartidos
drop policy if exists formulario_compartidos_select on public.formulario_compartidos;
create policy formulario_compartidos_select on public.formulario_compartidos
    for select to authenticated
    using (
        coordinador_id = auth.uid()
        or public.soy_dueno_del_formulario(formulario_id)
        or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    );

drop policy if exists formulario_compartidos_insert on public.formulario_compartidos;
create policy formulario_compartidos_insert on public.formulario_compartidos
    for insert to authenticated
    with check (
        public.soy_dueno_del_formulario(formulario_id)
        and public.es_coordinador_de(coordinador_id)
    );

-- No hay política de update: una fila de "compartido" se pone o se quita.
drop policy if exists formulario_compartidos_delete on public.formulario_compartidos;
create policy formulario_compartidos_delete on public.formulario_compartidos
    for delete to authenticated
    using (public.soy_dueno_del_formulario(formulario_id));

revoke all on table public.formulario_compartidos from anon;
grant select, insert, delete on table public.formulario_compartidos to authenticated;

-- ------------------------------------------------------------- el select se amplía
-- El update y el delete de formularios NO se tocan: compartir da ver, no
-- editar ni borrar. Igual el delete de formulario_respuestas: leerlas sí, pero
-- borrarlas sigue siendo del dueño o de quien administra.
drop policy if exists formularios_select on public.formularios;
create policy formularios_select on public.formularios
  for select to authenticated
  using (
    creado_por = auth.uid()
    or (select mp.is_admin from my_profile() mp(role, is_admin, teacher_id))
    or (soy_coordinador() and bajo_mi_coordinacion(creado_por))
    or public.formulario_compartido_conmigo(id)
  );

drop policy if exists formulario_respuestas_select on public.formulario_respuestas;
create policy formulario_respuestas_select on public.formulario_respuestas
  for select to authenticated
  using (
    exists (
      select 1 from public.formularios f
       where f.id = formulario_respuestas.formulario_id
         and (
           f.creado_por = auth.uid()
           or (select mp.is_admin from my_profile() mp(role, is_admin, teacher_id))
           or (soy_coordinador() and bajo_mi_coordinacion(f.creado_por))
           or public.formulario_compartido_conmigo(f.id)
         )
    )
  );
