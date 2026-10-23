-- «Torneos en Pareo Integral»: el organizador de cada torneo (su nombre y su
-- logo, su página con todos sus torneos y el sello «Organizador verificado»)
-- y la moderación de la lista pública (cualquiera reporta un torneo, quien
-- administra lo oculta). Lo pidió el dueño del sitio, para que la lista se
-- vea profesional y se pueda limpiar sin borrar nada.
--
-- SIN CUENTA, como los torneos: quien organiza no tiene usuario. Su
-- organización la crea la Edge Function `pareo-publicar` y le devuelve una
-- clave secreta (la guarda su navegador); con ella cambia su nombre y su
-- logo, y cada torneo que publica queda a su nombre. Acá queda solo el
-- sha256 de la clave, que no se puede leer desde afuera.
--
-- El sello lo pone solo quien administra (public.pareo_moderar): no lo pide
-- nadie, se da a federaciones, comités y organizadores de confianza. Queda
-- anotado en la bitácora (interno.auditar), como un certificado. Ocultar un
-- torneo o una organización tampoco borra nada: deja de verse en la lista,
-- y quien administra lo vuelve a mostrar.
--
-- El logo va en la fila, como imagen chica en base64 (data:image/…): lo
-- achica el navegador antes de mandarlo y la función vuelve a mirar el
-- formato y el tamaño. Así no hace falta un bucket público ni otra vía de
-- subida sin cuenta.
--
-- Ver «Torneos en Pareo Integral: el organizador y la moderación» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.pareo_organizadores (
  id uuid primary key default gen_random_uuid(),
  clave_hash text not null check (clave_hash ~ '^[0-9a-f]{64}$'),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  logo text check (logo is null or (logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$' and char_length(logo) <= 200000)),
  verificado boolean not null default false,
  oculto boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

comment on table public.pareo_organizadores is
  'Quien organiza torneos en Pareo Integral, sin cuenta: nombre, logo y el sello que pone administración. Se escribe con la Edge Function pareo-publicar (con su clave) y public.pareo_moderar (administración). Ver docs/decisiones/juegos-y-torneos.md.';
comment on column public.pareo_organizadores.clave_hash is
  'sha256 de la clave secreta que recibió el organizador (la guarda su navegador). No se puede leer desde afuera.';
comment on column public.pareo_organizadores.verificado is
  'El sello «Organizador verificado»: lo pone solo administración (public.pareo_moderar).';

alter table public.pareo_organizadores enable row level security;
revoke all on public.pareo_organizadores from anon, authenticated;
grant select (id, nombre, logo, verificado, oculto, creado, actualizado) on public.pareo_organizadores to anon, authenticated;

-- Lo oculto lo ve solo quien administra (para volver a mostrarlo).
create policy pareo_organizadores_lectura on public.pareo_organizadores
  for select to anon, authenticated
  using (not oculto or (select public.soy_admin()));

create trigger auditar after update of verificado, oculto on public.pareo_organizadores
  for each row execute function interno.auditar('verificado', 'oculto', 'nombre');

-- ---- cada torneo, con su organizador y su marca de oculto ----
alter table public.pareo_publicados
  add column organizador_id uuid references public.pareo_organizadores (id) on delete set null,
  add column oculto boolean not null default false;

comment on column public.pareo_publicados.organizador_id is
  'La organización que lo publicó (si mandó su clave al publicar).';
comment on column public.pareo_publicados.oculto is
  'Oculto por administración (public.pareo_moderar): no sale en la lista pública. No se borra.';

create index pareo_publicados_organizador_idx on public.pareo_publicados (organizador_id, fecha desc);

grant select (organizador_id, oculto) on public.pareo_publicados to anon, authenticated;

alter policy pareo_publicados_lectura_publica on public.pareo_publicados
  using (not oculto or (select public.soy_admin()));

create trigger auditar_oculto after update of oculto on public.pareo_publicados
  for each row execute function interno.auditar('oculto', 'nombre');

-- ---- los reportes ----
-- «Reportar este torneo», sin cuenta: lo manda la Edge Function (con su
-- freno) y lo lee solo quien administra. Nunca guarda quién lo mandó.
create table public.pareo_reportes (
  id uuid primary key default gen_random_uuid(),
  publicado_id uuid not null references public.pareo_publicados (id) on delete cascade,
  motivo text not null check (motivo in ('inapropiado', 'datos_personales', 'falso', 'error', 'otro')),
  detalle text not null default '' check (char_length(detalle) <= 500),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'revisado')),
  creado timestamptz not null default now()
);

comment on table public.pareo_reportes is
  'Reportes de un torneo de «Torneos en Pareo Integral». Los escribe la Edge Function pareo-publicar; los lee y marca solo administración.';

create index pareo_reportes_estado_idx on public.pareo_reportes (estado, creado desc);
create index pareo_reportes_publicado_idx on public.pareo_reportes (publicado_id);

alter table public.pareo_reportes enable row level security;
revoke all on public.pareo_reportes from anon, authenticated;
grant select on public.pareo_reportes to authenticated;

create policy pareo_reportes_admin on public.pareo_reportes
  for select to authenticated
  using ((select public.soy_admin()));

-- El freno de «Reportar»: 10 por conexión en una hora, 300 en total. Se
-- anota en interno.envios_publicos con el tipo 'pareo', como lo demás.
create or replace function public.pareo_reportar_frenar(p_ip text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  perform pg_advisory_xact_lock(hashtext('envios_publicos:pareo'));
  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'pareo' and ambito = 'reportar' and ip = v_ip
          and creado > now() - interval '1 hour') >= 10 then
    return 'Llegaron demasiados reportes seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;
  if (select count(*) from interno.envios_publicos
        where tipo = 'pareo' and ambito = 'reportar'
          and creado > now() - interval '1 hour') >= 300 then
    return 'Están llegando demasiados reportes en este momento. Intenta de nuevo en una hora.';
  end if;
  insert into interno.envios_publicos (tipo, ambito, ip, correo) values ('pareo', 'reportar', v_ip, null);
  return null;
end;
$$;
revoke all on function public.pareo_reportar_frenar(text) from public, anon, authenticated;

-- ---- lo que hace quien administra ----
-- Una sola puerta, que valida: el sello y ocultar/mostrar una organización,
-- ocultar/mostrar un torneo y marcar revisado un reporte. Devuelve la fila
-- como quedó (vuelta a leer).
--   p_que: 'verificar' | 'quitar_sello' | 'ocultar_org' | 'mostrar_org'
--          (p_id = la organización), 'ocultar' | 'mostrar' (p_id = el
--          torneo), 'revisado' (p_id = el reporte).
create or replace function public.pareo_moderar(p_que text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo administración modera la lista de torneos.' using errcode = '42501';
  end if;
  if p_que in ('verificar', 'quitar_sello', 'ocultar_org', 'mostrar_org') then
    update public.pareo_organizadores set
      verificado = case p_que when 'verificar' then true when 'quitar_sello' then false else verificado end,
      oculto = case p_que when 'ocultar_org' then true when 'mostrar_org' then false else oculto end,
      actualizado = now()
    where id = p_id;
    select jsonb_build_object('id', o.id, 'verificado', o.verificado, 'oculto', o.oculto) into v
      from public.pareo_organizadores o where o.id = p_id;
  elsif p_que in ('ocultar', 'mostrar') then
    update public.pareo_publicados set oculto = (p_que = 'ocultar') where id = p_id;
    select jsonb_build_object('id', t.id, 'oculto', t.oculto) into v from public.pareo_publicados t where t.id = p_id;
  elsif p_que = 'revisado' then
    update public.pareo_reportes set estado = 'revisado' where id = p_id;
    select jsonb_build_object('id', r.id, 'estado', r.estado) into v from public.pareo_reportes r where r.id = p_id;
  else
    raise exception 'Acción desconocida: %', p_que using errcode = '22023';
  end if;
  if v is null then
    raise exception 'No existe.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.pareo_moderar(text, uuid) from public, anon;
grant execute on function public.pareo_moderar(text, uuid) to authenticated;
