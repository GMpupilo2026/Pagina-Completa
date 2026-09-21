-- Un enlace de videollamada por GRUPO: «el de SJ», «el de CENFO», y uno
-- general para el resto.
--
-- Un profesor da clase en varias sedes y cada una tiene su sala: con un solo
-- enlace, el de SJ le llegaba también a los de CENFO y entraban a la clase que
-- no era. La tabla pasa a llevar una fila por (profesor, grupo), y el grupo
-- vacío es «para todas mis clases» — así quien tenga una sola sala la sigue
-- teniendo igual, sin migrar nada.
--
-- SE REPARTE POR `profiles.grupo` Y NO POR SUBGRUPO, a propósito: el grupo es
-- UNO por alumno, así que no hay dos enlaces que puedan disputárselo. Un
-- subgrupo puede contener al mismo alumno varias veces y habría que inventar
-- un desempate — y el que perdiera mandaría a alguien a la llamada de otro
-- grupo sin que nada fallara.

alter table public.profesor_videollamada
    add column if not exists grupo text not null default '';

alter table public.profesor_videollamada
    add constraint profesor_videollamada_grupo_corto check (length(grupo) <= 100);

-- La clave es (profesor, grupo): que no haya dos enlaces para el mismo grupo
-- lo garantiza el índice y no un `if` de la pantalla, igual que el resto de
-- las cosas que no pueden pasar dos veces.
alter table public.profesor_videollamada drop constraint profesor_videollamada_pkey;
alter table public.profesor_videollamada add primary key (profesor_id, grupo);

comment on table public.profesor_videollamada is
    'La sala de videollamada de cada profesor, por grupo de alumnos (grupo = '''' es la de todas sus clases). El alumno solo la recibe mientras ese profesor tenga una clase abierta.';

-- Al alumno le llega SU enlace, no la lista de salas de su profesor: el de su
-- grupo y el general, nada más. Con el de otro grupo a la vista podría
-- colarse en una clase que no es la suya, y no haría falta ni saber SQL.
drop policy if exists profesor_videollamada_select on public.profesor_videollamada;
create policy profesor_videollamada_select on public.profesor_videollamada
    for select using (
        profesor_id = auth.uid()
        or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
        or (public.es_mi_profesor(profesor_id)
            and public.clase_abierta_de(profesor_id)
            and (grupo = '' or grupo = coalesce(public.mi_grupo(), '')))
    );

-- El grupo de una fila no se mueve con un update: la fila ES el par
-- (profesor, grupo). Cambiar de grupo es borrar y poner otra, que además es lo
-- que hace la pantalla.
create or replace function public.proteger_profesor_videollamada()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
    if tg_op = 'UPDATE' then
        new.profesor_id := old.profesor_id;
        new.grupo := old.grupo;
    end if;
    new.enlace := btrim(new.enlace);
    new.grupo := btrim(coalesce(new.grupo, ''));
    new.actualizado_at := now();
    return new;
end;
$$;

revoke execute on function public.proteger_profesor_videollamada() from public, anon, authenticated;

-- mis_clases() entrega el enlace QUE LE TOCA a quien pregunta: el de su grupo
-- si su profesor puso uno, y si no el general. El orden lo decide la consulta
-- y no la pantalla — con dos filas a la vista, la que se pintara primero
-- dependería del humor de la base.
create or replace function public.mis_clases()
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
  left join lateral (
    select w.enlace from public.profesor_videollamada w
    where w.profesor_id = pr.id
      and (w.grupo = coalesce(yo.grupo, '') or w.grupo = '')
    order by (w.grupo <> '') desc   -- el del grupo manda sobre el general
    limit 1
  ) v on true
  where yo.id = auth.uid()
  order by (pr.id = yo.teacher_id) desc, 2;
$$;

revoke execute on function public.mis_clases() from public, anon;
grant execute on function public.mis_clases() to authenticated;

-- Los grupos que de verdad tienen alumnos suyos, con cuántos son.
--
-- El grupo se ELIGE de esta lista y no se escribe a mano: un enlace guardado
-- para «Cenfo» cuando sus alumnos están en «CENFO» no le llega a nadie nunca,
-- y eso no da ningún error — el profesor lo ve guardado y cree que está.
create or replace function public.grupos_de_mis_alumnos()
returns table(grupo text, alumnos bigint)
language sql
stable
set search_path to 'public'
as $$
  select p.grupo, count(*)::bigint
  from public.profiles p
  where p.role = 'alumno'
    and coalesce(p.grupo, '') <> ''
    and (p.id in (select public.alumnos_de(auth.uid()))
         or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))
  group by p.grupo
  order by 2 desc, 1;
$$;

revoke execute on function public.grupos_de_mis_alumnos() from public, anon;
grant execute on function public.grupos_de_mis_alumnos() to authenticated;