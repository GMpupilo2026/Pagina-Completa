-- La videollamada de la clase en vivo.
--
-- El tablero de `sesion.html` es la pizarra, no la clase: la voz va por Meet,
-- Zoom o Teams, y hasta ahora ese enlace viajaba por WhatsApp cada vez. El
-- panel gana un botón al lado de «Sesión en vivo», y lo que hace falta del
-- lado de la base son dos cosas: dónde vive el enlace y quién lo puede ver.
--
-- EL ENLACE ES DEL PROFESOR, NO DE LA CLASE, y eso no es una comodidad: la
-- clase se abre SOLA —al entrar un alumno o al mandarse una posición—, sin
-- pasar por ningún formulario, así que un `class_sessions.enlace_video` se
-- quedaría en null casi siempre y el botón no se desbloquearía nunca. No daría
-- ningún error: se vería un candado para siempre y nadie sabría por qué. Con
-- la sala fija del profesor (el Meet de siempre, el PMI de Zoom, su canal de
-- Teams) se pone una vez y sirve para todas sus clases, incluidas las que se
-- abren solas.
--
-- Y QUIÉN LO VE LO HACE CUMPLIR LA RLS, NO LA PANTALLA. El alumno recibe el
-- enlace únicamente mientras ese profesor tenga una clase abierta: es la misma
-- regla que el botón dibuja, escrita donde no se puede saltar desde la
-- consola. Sin clase, la consulta no devuelve ninguna fila y `mis_clases()`
-- —que es SECURITY INVOKER— entrega `videollamada` en null sin que haya que
-- repetir la condición en la función.

create table if not exists public.profesor_videollamada (
    profesor_id    uuid primary key references public.profiles(id) on delete cascade,
    enlace         text not null,
    actualizado_at timestamptz not null default now(),
    -- Un enlace que el alumno va a ABRIR es texto ajeno, así que la forma se
    -- exige acá y no solo en el navegador: solo https, sin espacios y con un
    -- dominio de verdad. `javascript:` en un href es XSS, y `http://` en una
    -- página servida por https la bloquea el navegador sin decir por qué.
    constraint profesor_videollamada_https check (
        length(enlace) between 12 and 500
        and enlace ~* '^https://[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:[0-9]{1,5})?(/[^[:space:]]*)?$')
);

comment on table public.profesor_videollamada is
    'La sala de videollamada de cada profesor (Meet, Zoom, Teams). El alumno solo la recibe mientras ese profesor tenga una clase abierta.';

-- "¿Tiene clase abierta ahora mismo?", en una función y no escrita dentro de
-- la política: la usan la RLS de esta tabla y cualquiera que la necesite
-- después, y así la política no depende de la RLS de `class_sessions` para
-- contestar algo que no es una pregunta de permisos.
create or replace function public.clase_abierta_de(p_profesor uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
set row_security to off
as $$
    select exists (
        select 1 from public.class_sessions c
        where c.created_by = p_profesor and c.ended_at is null
    );
$$;

revoke execute on function public.clase_abierta_de(uuid) from public, anon;
grant execute on function public.clase_abierta_de(uuid) to authenticated;

alter table public.profesor_videollamada enable row level security;

-- Cada quien la suya, y quien administra todas (la regla permanente). El
-- alumno la recibe solo con la clase abierta — ese es el candado del botón,
-- puesto donde de verdad manda.
create policy profesor_videollamada_select on public.profesor_videollamada
    for select using (
        profesor_id = auth.uid()
        or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
        or (public.es_mi_profesor(profesor_id) and public.clase_abierta_de(profesor_id))
    );

-- Solo el dueño escribe la suya, y solo si da clase: nadie pone la sala de
-- otro, y la de un alumno no la miraría nadie.
create policy profesor_videollamada_insert on public.profesor_videollamada
    for insert with check (
        profesor_id = auth.uid()
        and (select mp.is_admin or mp.role = 'profesor'
             from public.my_profile() mp(role, is_admin, teacher_id))
    );

create policy profesor_videollamada_update on public.profesor_videollamada
    for update using (profesor_id = auth.uid()) with check (profesor_id = auth.uid());

create policy profesor_videollamada_delete on public.profesor_videollamada
    for delete using (profesor_id = auth.uid());

-- El público no tiene nada que hacer acá: una puerta menos que dependa de que
-- la política esté bien escrita.
revoke all on table public.profesor_videollamada from anon;

-- Mismo patrón que proteger_tiempos_de_presencia(): la fila no se muda de
-- dueño con un update, y la fecha la pone el reloj del servidor.
create or replace function public.proteger_profesor_videollamada()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
    if tg_op = 'UPDATE' then
        new.profesor_id := old.profesor_id;
    end if;
    new.enlace := btrim(new.enlace);
    new.actualizado_at := now();
    return new;
end;
$$;

revoke execute on function public.proteger_profesor_videollamada() from public, anon, authenticated;

drop trigger if exists profesor_videollamada_protege on public.profesor_videollamada;
create trigger profesor_videollamada_protege
    before insert or update on public.profesor_videollamada
    for each row execute function public.proteger_profesor_videollamada();

-- mis_clases() gana `videollamada`. Sigue siendo SECURITY INVOKER, así que el
-- left join pasa por la RLS de arriba: sin clase abierta no hay fila que unir
-- y la columna llega en null. La regla se escribe UNA vez.
drop function if exists public.mis_clases();

create function public.mis_clases()
returns table(profesor_id uuid, profesor text, es_principal boolean,
              clase_abierta boolean, titulo_clase text, videollamada text)
language sql
stable
set search_path to 'public'
as $$
  select pr.id as profesor_id,
         coalesce(nullif(pr.full_name, ''), pr.email) as profesor,
         pr.id = yo.teacher_id as es_principal,
         cs.id is not null as clase_abierta,
         cs.title,
         v.enlace
  from public.profiles yo
  join public.profiles pr on pr.id in (select public.profesores_de(auth.uid()))
  left join lateral (
    select c.id, c.title from public.class_sessions c
    where c.created_by = pr.id and c.ended_at is null
    order by c.started_at desc nulls last limit 1
  ) cs on true
  left join public.profesor_videollamada v on v.profesor_id = pr.id
  where yo.id = auth.uid()
  order by (pr.id = yo.teacher_id) desc, 2;
$$;

revoke execute on function public.mis_clases() from public, anon;
grant execute on function public.mis_clases() to authenticated;