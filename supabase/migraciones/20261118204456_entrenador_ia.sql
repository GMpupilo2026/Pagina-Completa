-- El entrenador de IA: «¿Por qué?» después de fallar un ejercicio.
--
-- Salió de comparar la Academia con otras plataformas (18/11/2026). Stockfish
-- decide qué era mejor y por qué la jugada del alumno no sirve; la IA solo lo
-- pone en palabras (Edge Function `entrenador-ia`, con el mismo molde de
-- «Explícame esta posición»: cada línea se vuelve a jugar con chess.js y una
-- jugada que no esté en las líneas hace rechazar la explicación entera).
--
-- QUIÉN LO TIENE lo decide quien administra, persona por persona: lo pidió el
-- dueño («yo decido a quién se le activa»). Está apagado para todos. No es la
-- casilla `academia_ia.alumnos` de «Explícame esta posición», que abre a toda
-- una academia: acá es una lista de personas.
--
-- QUÉ MODELO Y CUÁNTO SE PUEDE GASTAR: lo mismo que «Mejorar informe»
-- (`academia_ia`, por academia; la fila general para quien no tiene academia)
-- y el mismo `ia_uso`, con `que = 'entrenador'`. Y un tope por persona y por
-- día, en hora de Costa Rica: 15 (50 para quien da clase).
--
-- Ver «El entrenador de IA» en docs/decisiones/entrenamiento.md.

create table public.entrenador_ia_personas (
  persona_id   uuid primary key references public.profiles(id) on delete cascade,
  activado_por uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
comment on table public.entrenador_ia_personas is
  'A quién le encendió quien administra el entrenador de IA. Sin política de escritura: la escribe activar_entrenador_ia().';
alter table public.entrenador_ia_personas enable row level security;
revoke all on public.entrenador_ia_personas from anon, authenticated;
grant select on public.entrenador_ia_personas to authenticated;
create policy entrenador_ia_personas_ver on public.entrenador_ia_personas
  for select to authenticated
  using (persona_id = (select auth.uid()) or (select public.soy_admin()));
create trigger auditar after insert or delete or update on public.entrenador_ia_personas
  for each row execute function interno.auditar();

-- Encender o apagar el entrenador de una persona. Solo quien administra.
-- Devuelve cómo quedó, leído de la tabla.
create function public.activar_entrenador_ia(p_persona uuid, p_activa boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo quien administra puede activar el entrenador de IA.' using errcode = '42501';
  end if;
  if p_activa then
    if not exists (select 1 from public.profiles where id = p_persona) then
      raise exception 'Esa cuenta no existe.' using errcode = '22023';
    end if;
    insert into public.entrenador_ia_personas (persona_id, activado_por)
    values (p_persona, auth.uid())
    on conflict (persona_id) do nothing;
  else
    delete from public.entrenador_ia_personas where persona_id = p_persona;
  end if;
  return exists (select 1 from public.entrenador_ia_personas where persona_id = p_persona);
end;
$$;
revoke execute on function public.activar_entrenador_ia(uuid, boolean) from public, anon;
grant execute on function public.activar_entrenador_ia(uuid, boolean) to authenticated;

-- La pregunta que hace el navegador: ¿me muestran el botón «¿Por qué?»?
-- Quien administra lo ve siempre, para poder probarlo.
create function public.tengo_entrenador_ia()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.soy_admin()), false)
      or exists (select 1 from public.entrenador_ia_personas e
                  where e.persona_id = (select auth.uid()));
$$;
revoke execute on function public.tengo_entrenador_ia() from public, anon;
grant execute on function public.tengo_entrenador_ia() to authenticated;

-- Qué configuración le toca a una persona para el entrenador: la misma regla
-- de ia_para_usuario() (sus academias por nombre, la fila general al final),
-- pero solo si quien administra se lo encendió. Devuelve también cuántas
-- lleva hoy y su tope del día. SOLO la service role: el modelo y el
-- presupuesto no son de quien llama.
create function public.ia_para_entrenador(p_usuario uuid)
returns table(academia_id uuid, modelo text, restante_usd numeric, usadas_hoy integer, tope_dia integer)
language sql stable security definer set search_path to 'public' set row_security to off as $$
  with yo as (
    select p.id, (p.is_admin or p.role in ('profesor', 'admin')) as da_clase, p.is_admin,
           (p.is_admin or exists (select 1 from public.entrenador_ia_personas e where e.persona_id = p.id)) as encendido
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
  ), gasto as (
    select c.academia_id, c.modelo, c.tope_mensual_usd, c.orden, c.nombre,
           coalesce((select sum(u.costo_usd) from public.ia_uso u
                      where u.academia_id is not distinct from c.academia_id
                        and u.creado_at >= public.ia_inicio_de_mes()), 0) as gastado
      from candidatas c
  ), hoy as (
    select count(*)::integer as n from public.ia_uso u
     where u.usuario_id = p_usuario and u.que = 'entrenador'
       and u.creado_at >= (date_trunc('day', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
  )
  select g.academia_id, g.modelo, g.tope_mensual_usd - g.gastado,
         (select n from hoy),
         case when (select da_clase from yo) then 50 else 15 end
    from gasto g
   where coalesce((select encendido from yo), false)
     and g.modelo is not null
     and g.tope_mensual_usd > g.gastado
   order by g.orden, g.nombre
   limit 1;
$$;
revoke all on function public.ia_para_entrenador(uuid) from public, anon, authenticated;
grant execute on function public.ia_para_entrenador(uuid) to service_role;
