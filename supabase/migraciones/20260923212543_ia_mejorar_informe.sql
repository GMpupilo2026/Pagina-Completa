-- «Mejorar informe»: la IA por academia. Qué modelo usa cada una (o ninguno),
-- su tope mensual y el gasto medido llamada por llamada. Todo es de quien
-- administra: los profesores solo ven el botón, y si la academia no tiene IA
-- o se quedó sin presupuesto, el botón no aparece. Ver «Mejorar informe» en
-- CLAUDE.md.

-- Una fila por academia; la fila SIN academia (academia_id null) es la de
-- quien administra y la de quien no es de ninguna academia.
create table if not exists public.academia_ia (
  id               uuid primary key default gen_random_uuid(),
  academia_id      uuid references public.academias(id) on delete cascade,
  modelo           text check (modelo in ('claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5')),
  tope_mensual_usd numeric(10,2) not null default 5 check (tope_mensual_usd >= 0 and tope_mensual_usd <= 1000),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles(id) on delete set null
);
create unique index if not exists academia_ia_una_por_academia
  on public.academia_ia (coalesce(academia_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Cada llamada, con lo que costó de verdad (sale de `usage` de la respuesta).
create table if not exists public.ia_uso (
  id              bigserial primary key,
  creado_at       timestamptz not null default now(),
  academia_id     uuid references public.academias(id) on delete set null,
  usuario_id      uuid references public.profiles(id) on delete set null,
  que             text not null,
  modelo          text,
  tokens_entrada  integer not null default 0,
  tokens_salida   integer not null default 0,
  costo_usd       numeric(12,6) not null default 0,
  ok              boolean not null default true,
  detalle         text
);
create index if not exists ia_uso_academia_fecha on public.ia_uso (academia_id, creado_at desc);

alter table public.academia_ia enable row level security;
alter table public.ia_uso enable row level security;
revoke all on public.academia_ia, public.ia_uso from anon, authenticated;
grant select on public.academia_ia, public.ia_uso to authenticated;
grant all on public.academia_ia, public.ia_uso to service_role;
revoke all on sequence public.ia_uso_id_seq from anon, authenticated;

-- Solo quien administra lee. Nadie escribe desde el navegador.
drop policy if exists academia_ia_select on public.academia_ia;
create policy academia_ia_select on public.academia_ia for select to authenticated using (public.soy_admin());
drop policy if exists ia_uso_select on public.ia_uso;
create policy ia_uso_select on public.ia_uso for select to authenticated using (public.soy_admin());

-- El comienzo del mes en curso, en hora de Costa Rica.
create or replace function public.ia_inicio_de_mes()
returns timestamptz language sql stable set search_path to '' as $$
  select (date_trunc('month', now() at time zone 'America/Costa_Rica')) at time zone 'America/Costa_Rica';
$$;

-- Qué configuración le toca a una persona, con cuánto le queda este mes.
-- Primero sus academias (por nombre); la fila sin academia, al final, solo
-- para quien administra o para quien no es de ninguna. Solo cuentan las que
-- tienen modelo y todavía tienen presupuesto.
create or replace function public.ia_para_usuario(p_usuario uuid)
returns table(academia_id uuid, modelo text, restante_usd numeric)
language sql stable security definer set search_path to 'public' set row_security to off as $$
  with yo as (
    select p.id, (p.is_admin or p.role in ('profesor', 'admin')) as da_clase, p.is_admin
      from public.profiles p where p.id = p_usuario
  ), mias as (
    select m.academia_id as id from public.academia_miembros m where m.persona_id = p_usuario
    union
    select a.id from public.academias a where a.supervisor_id = p_usuario
  ), candidatas as (
    select c.academia_id, c.modelo, c.tope_mensual_usd, 0 as orden, a.nombre
      from public.academia_ia c join public.academias a on a.id = c.academia_id
     where c.academia_id in (select id from mias)
    union all
    select c.academia_id, c.modelo, c.tope_mensual_usd, 1, ''
      from public.academia_ia c
     where c.academia_id is null
       and ((select is_admin from yo) or not exists (select 1 from mias))
  )
  select c.academia_id, c.modelo,
         c.tope_mensual_usd - coalesce((select sum(u.costo_usd) from public.ia_uso u
                                         where u.academia_id is not distinct from c.academia_id
                                           and u.creado_at >= public.ia_inicio_de_mes()), 0)
    from candidatas c
   where (select da_clase from yo)
     and c.modelo is not null
     and c.tope_mensual_usd > coalesce((select sum(u.costo_usd) from public.ia_uso u
                                         where u.academia_id is not distinct from c.academia_id
                                           and u.creado_at >= public.ia_inicio_de_mes()), 0)
   order by c.orden, c.nombre
   limit 1;
$$;

-- Lo único que ve un profesor: si el botón va o no va. Ni el modelo, ni el tope.
create or replace function public.ia_disponible()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.ia_para_usuario(auth.uid()));
$$;

-- Quien administra fija el modelo (null = sin IA) y el tope de una academia,
-- o de la fila sin academia.
create or replace function public.ia_guardar_config(p_academia uuid, p_modelo text, p_tope numeric)
returns public.academia_ia language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.academia_ia;
  v_modelo text := nullif(btrim(coalesce(p_modelo, '')), '');
begin
  if not public.soy_admin() then
    raise exception 'Solo quien administra decide la IA de cada academia.' using errcode = '42501';
  end if;
  if v_modelo is not null and v_modelo not in ('claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5') then
    raise exception 'Ese modelo no se ofrece.';
  end if;
  if p_tope is null or p_tope < 0 or p_tope > 1000 then
    raise exception 'El tope mensual va de 0 a 1000 dólares.';
  end if;
  if p_academia is not null and not exists (select 1 from public.academias where id = p_academia) then
    raise exception 'Esa academia ya no existe.';
  end if;
  update public.academia_ia set modelo = v_modelo, tope_mensual_usd = round(p_tope, 2),
         updated_at = now(), updated_by = auth.uid()
   where academia_id is not distinct from p_academia
  returning * into v_fila;
  if not found then
    insert into public.academia_ia (academia_id, modelo, tope_mensual_usd, updated_by)
    values (p_academia, v_modelo, round(p_tope, 2), auth.uid()) returning * into v_fila;
  end if;
  return v_fila;
end;
$$;

-- El gasto de un mes (el que contiene p_dia, en hora de Costa Rica), por academia.
create or replace function public.ia_resumen_mes(p_dia date default null)
returns table(academia_id uuid, llamadas bigint, fallidas bigint, tokens_entrada bigint, tokens_salida bigint, costo_usd numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_ini timestamptz;
begin
  if not public.soy_admin() then
    raise exception 'Solo quien administra ve el gasto de la IA.' using errcode = '42501';
  end if;
  v_ini := (date_trunc('month', coalesce(p_dia, (now() at time zone 'America/Costa_Rica')::date)::timestamp)) at time zone 'America/Costa_Rica';
  return query
    select u.academia_id, count(*), count(*) filter (where not u.ok),
           coalesce(sum(u.tokens_entrada), 0)::bigint, coalesce(sum(u.tokens_salida), 0)::bigint,
           coalesce(sum(u.costo_usd), 0)
      from public.ia_uso u
     where u.creado_at >= v_ini and u.creado_at < v_ini + interval '1 month'
     group by u.academia_id;
end;
$$;

revoke execute on function public.ia_para_usuario(uuid) from public, anon, authenticated;
grant execute on function public.ia_para_usuario(uuid) to service_role;
revoke execute on function public.ia_inicio_de_mes() from public, anon;
grant execute on function public.ia_inicio_de_mes() to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array['public.ia_disponible()', 'public.ia_guardar_config(uuid,text,numeric)',
                           'public.ia_resumen_mes(date)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
