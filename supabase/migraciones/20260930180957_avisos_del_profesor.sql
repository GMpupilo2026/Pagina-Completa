-- El aviso del profe a sus alumnos: una ventana que el alumno no puede
-- saltarse hasta apretar «Marcar como leído», y el profe ve quién lo leyó.
--
-- Dos tablas: el aviso (qué dijo, a quién iba) y UNA FILA POR DESTINATARIO,
-- que se arma al mandarlo. Así «quiénes lo recibieron» es la lista de ese
-- momento: un alumno que entra al grupo la semana siguiente no aparece como
-- que no lo leyó, y uno que se va sigue diciendo si lo leyó.
--
-- Nadie escribe en las tablas desde afuera: no hay políticas de escritura.
-- Lo manda enviar_aviso() (valida que los destinatarios sean SUS alumnos) y lo
-- marca marcar_aviso_leido() (solo la fila propia, y solo la primera vez: la
-- hora de lectura no se reescribe).

create table public.avisos_profesor (
  id          uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profiles(id) on delete cascade,
  texto       text not null check (length(btrim(texto)) between 1 and 1000),
  para        text not null check (length(para) <= 120),
  created_at  timestamptz not null default now()
);
create index avisos_profesor_profesor on public.avisos_profesor (profesor_id, created_at desc);

create table public.aviso_destinatarios (
  aviso_id  uuid not null references public.avisos_profesor(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  leido_at  timestamptz,
  primary key (aviso_id, alumno_id)
);
create index aviso_destinatarios_alumno on public.aviso_destinatarios (alumno_id, leido_at);

alter table public.avisos_profesor enable row level security;
alter table public.aviso_destinatarios enable row level security;
revoke all on public.avisos_profesor, public.aviso_destinatarios from anon;
revoke insert, update, delete, truncate on public.avisos_profesor, public.aviso_destinatarios from authenticated;
grant select on public.avisos_profesor, public.aviso_destinatarios to authenticated;

-- Las dos políticas se necesitan una a la otra (el alumno ve el aviso porque
-- tiene su fila; el profe ve las filas porque el aviso es suyo). Preguntado
-- con subconsultas directas, cada una dispararía la RLS de la otra y la base
-- corta con «infinite recursion». Estas dos arman el conjunto sin RLS.
create function interno.avisos_que_recibi()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select d.aviso_id from public.aviso_destinatarios d where d.alumno_id = (select auth.uid());
$$;
create function interno.avisos_que_mande()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select a.id from public.avisos_profesor a where a.profesor_id = (select auth.uid());
$$;
revoke execute on function interno.avisos_que_recibi(), interno.avisos_que_mande() from public, anon;
grant execute on function interno.avisos_que_recibi(), interno.avisos_que_mande() to authenticated;

create policy avisos_profesor_select on public.avisos_profesor for select to authenticated
  using (profesor_id = (select auth.uid())
         or id in (select interno.avisos_que_recibi())
         or coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false));
create policy aviso_destinatarios_select on public.aviso_destinatarios for select to authenticated
  using (alumno_id = (select auth.uid())
         or aviso_id in (select interno.avisos_que_mande())
         or coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false));

-- Mandar un aviso: a todos sus alumnos, a un grupo (el texto exacto que
-- devuelve grupos_de_mis_alumnos) o a uno de SUS subgrupos. Siempre dentro de
-- interno.alumnos_de(): nadie le escribe a los alumnos de otro profe.
create function public.enviar_aviso(p_texto text, p_grupo text default null, p_subgrupo uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_yo    uuid := auth.uid();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_para  text;
  v_id    uuid;
  v_a     uuid[];
begin
  if v_yo is null or not coalesce((select p.role = 'profesor' or p.is_admin from public.profiles p where p.id = v_yo), false) then
    raise exception 'Solo quien da clase manda avisos.' using errcode = '42501';
  end if;
  if length(v_texto) = 0 then raise exception 'El aviso está vacío.' using errcode = '22023'; end if;
  if length(v_texto) > 1000 then raise exception 'El aviso pasa de 1000 caracteres.' using errcode = '22023'; end if;
  if (select count(*) from public.avisos_profesor a
       where a.profesor_id = v_yo and a.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Ya mandaste 10 avisos en la última hora: espera un rato.' using errcode = '54000';
  end if;

  if p_subgrupo is not null then
    select 'Subgrupo «' || s.nombre || '»' into v_para
      from public.subgrupos s where s.id = p_subgrupo and s.profesor_id = v_yo;
    if v_para is null then raise exception 'Ese subgrupo no es tuyo.' using errcode = '42501'; end if;
    select array_agg(sa.alumno_id) into v_a
      from public.subgrupo_alumnos sa
     where sa.subgrupo_id = p_subgrupo
       and sa.alumno_id in (select interno.alumnos_de(v_yo));
  elsif nullif(btrim(coalesce(p_grupo, '')), '') is not null then
    v_para := 'Grupo ' || btrim(p_grupo);
    select array_agg(p.id) into v_a
      from public.profiles p
     where p.role = 'alumno' and p.grupo = p_grupo
       and p.id in (select interno.alumnos_de(v_yo));
  else
    v_para := 'Todos tus alumnos';
    select array_agg(p.id) into v_a
      from public.profiles p
     where p.role = 'alumno' and p.id in (select interno.alumnos_de(v_yo));
  end if;
  if v_a is null or array_length(v_a, 1) is null then
    raise exception 'No hay alumnos a quienes mandárselo.' using errcode = '22023';
  end if;

  insert into public.avisos_profesor (profesor_id, texto, para)
  values (v_yo, v_texto, left(v_para, 120)) returning id into v_id;
  insert into public.aviso_destinatarios (aviso_id, alumno_id)
  select v_id, x from unnest(v_a) x on conflict do nothing;

  -- Al celular también. Si el aviso por push falla, el aviso queda igual: lo
  -- ve la próxima vez que abra cualquier página de la Academia.
  begin
    perform public.avisar_push(v_a, 'Aviso de tu profe', left(v_texto, 140), '/clases.html', 'aviso:' || v_id);
  exception when others then null;
  end;
  return v_id;
end;
$$;
revoke execute on function public.enviar_aviso(text, text, uuid) from public, anon;
grant execute on function public.enviar_aviso(text, text, uuid) to authenticated;

-- Marcar leído: solo la fila propia y solo la primera vez.
create function public.marcar_aviso_leido(p_aviso uuid)
returns void language sql security definer set search_path to 'public' as $$
  update public.aviso_destinatarios
     set leido_at = now()
   where aviso_id = p_aviso and alumno_id = (select auth.uid()) and leido_at is null;
$$;
revoke execute on function public.marcar_aviso_leido(uuid) from public, anon;
grant execute on function public.marcar_aviso_leido(uuid) to authenticated;

-- Lo que el alumno tiene sin leer, el más viejo primero (se leen en orden).
create function public.mis_avisos_sin_leer()
returns table (id uuid, texto text, created_at timestamptz, profesor text)
language sql stable security definer set search_path to 'public' as $$
  select a.id, a.texto, a.created_at, coalesce(nullif(btrim(p.full_name), ''), 'Tu profe')
    from public.aviso_destinatarios d
    join public.avisos_profesor a on a.id = d.aviso_id
    join public.profiles p on p.id = a.profesor_id
   where d.alumno_id = (select auth.uid()) and d.leido_at is null
   order by a.created_at
   limit 20;
$$;
revoke execute on function public.mis_avisos_sin_leer() from public, anon;
grant execute on function public.mis_avisos_sin_leer() to authenticated;

-- Los últimos avisos del profe, con cuántos lo leyeron. SECURITY INVOKER: la
-- RLS le da solo los suyos.
create function public.mis_avisos_enviados(p_limite int default 10)
returns table (id uuid, texto text, para text, created_at timestamptz, total int, leidos int)
language sql stable security invoker set search_path to 'public' as $$
  select a.id, a.texto, a.para, a.created_at,
         (select count(*)::int from public.aviso_destinatarios d where d.aviso_id = a.id),
         (select count(*)::int from public.aviso_destinatarios d where d.aviso_id = a.id and d.leido_at is not null)
    from public.avisos_profesor a
   where a.profesor_id = (select auth.uid())
   order by a.created_at desc
   limit least(greatest(coalesce(p_limite, 10), 1), 50);
$$;
revoke execute on function public.mis_avisos_enviados(int) from public, anon;
grant execute on function public.mis_avisos_enviados(int) to authenticated;

-- Quiénes lo recibieron y cuándo lo leyeron. SECURITY DEFINER para poder dar
-- el nombre, pero solo de un aviso propio (o para quien administra).
create function public.lectores_de_aviso(p_aviso uuid)
returns table (alumno_id uuid, nombre text, leido_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not coalesce(exists (select 1 from public.avisos_profesor a where a.id = p_aviso and a.profesor_id = auth.uid())
                  or (select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception 'Ese aviso no es tuyo.' using errcode = '42501';
  end if;
  return query
  select d.alumno_id, coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre'), d.leido_at
    from public.aviso_destinatarios d
    join public.profiles p on p.id = d.alumno_id
   where d.aviso_id = p_aviso
   order by d.leido_at is not null, p.full_name;
end;
$$;
revoke execute on function public.lectores_de_aviso(uuid) from public, anon;
grant execute on function public.lectores_de_aviso(uuid) to authenticated;
