-- Puntos Ajedrez, segunda parte (B): regalos y bromas entre compañeros.
-- Sigue a 20261008170000_puntos_retos_marcador.sql (que crea frases_regalo).
-- Ver «Retos, marcador, regalos y bromas» en docs/decisiones/puntos-y-premios.md.
set local lock_timeout = '8s';

-- =====================================================================
-- 5. Regalos: un alumno compra un premio para un compañero.
-- =====================================================================
alter table public.premios_catalogo drop constraint premios_catalogo_categoria_check;
alter table public.premios_catalogo add constraint premios_catalogo_categoria_check
  check (categoria in ('cosmetico', 'entrenamiento', 'contenido', 'regalo', 'broma'));
alter table public.premios_catalogo drop constraint premios_catalogo_tipo_efecto_check;
alter table public.premios_catalogo add constraint premios_catalogo_tipo_efecto_check
  check (tipo_efecto in ('titulo', 'marco_perfil', 'doble_puntos', 'curso_adelanto', 'material_tienda',
                         'accesorio_avatar', 'tarjeta', 'broma'));

alter table public.premios_canjeados add column regalo_de uuid references public.profiles(id) on delete set null;
alter table public.premios_canjeados add column mensaje text references public.frases_regalo(clave) on delete set null;
create index premios_canjeados_regalo_de on public.premios_canjeados (regalo_de, created_at desc) where regalo_de is not null;

-- Quien regala ve lo que regaló (para el historial de "Regalos que mandaste").
alter policy premios_canjeados_ver on public.premios_canjeados using (
  student_id = (select auth.uid())
  or regalo_de = (select auth.uid())
  or (select public.soy_admin())
  or student_id in (select interno.alumnos_de((select auth.uid())))
  or ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()))
);

insert into public.premios_catalogo (clave, nombre, descripcion, emoji, categoria, tipo_efecto, costo_puntos, parametros, limite_por_alumno, orden) values
  ('tarjeta_estrella', 'Tarjeta de estrella', 'Una tarjeta para felicitar a un compañero. Le llega a su campana con tu mensaje.', '🌟', 'regalo', 'tarjeta', 10, '{}'::jsonb, null, 200),
  ('tarjeta_flores', 'Ramo de flores', 'Un ramo para un compañero, con tu mensaje.', '💐', 'regalo', 'tarjeta', 15, '{}'::jsonb, null, 210),
  ('tarjeta_trofeo', 'Trofeo de campeón', 'Un trofeo de mentira para quien se lo ganó de verdad.', '🏆', 'regalo', 'tarjeta', 20, '{}'::jsonb, null, 220),
  ('tarjeta_pastel', 'Pastel de cumpleaños', 'Para el cumpleaños de un compañero.', '🎂', 'regalo', 'tarjeta', 25, '{}'::jsonb, null, 230),
  ('tarjeta_caballito', 'Peluche de caballito', 'Un caballito de peluche: salta en L, pero abraza derecho.', '🐴', 'regalo', 'tarjeta', 40, '{}'::jsonb, null, 240)
on conflict (clave) do nothing;

-- Lo propio no se compra para uno mismo: las tarjetas y las bromas son
-- para otro. canjear_premio() igual que antes, con ese freno.
create or replace function public.canjear_premio(p_premio_id uuid)
returns table (canje_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_premio record;
  v_saldo integer;
  v_ya_tiene integer;
  v_canje_id uuid;
  v_vigente_hasta timestamptz := null;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('puntos:' || v_yo::text));

  select * into v_premio from public.premios_catalogo where id = p_premio_id and activo;
  if v_premio.id is null then
    raise exception 'Ese premio ya no está disponible.' using errcode = '22023';
  end if;
  if v_premio.categoria in ('regalo', 'broma') then
    raise exception 'Eso es para mandárselo a un compañero.' using errcode = '22023';
  end if;

  if v_premio.limite_por_alumno is not null then
    select count(*) into v_ya_tiene from public.premios_canjeados
     where student_id = v_yo and premio_id = p_premio_id;
    if v_ya_tiene >= v_premio.limite_por_alumno then
      raise exception 'Ya canjeaste este premio el máximo de veces permitido.' using errcode = '22023';
    end if;
  end if;

  if v_premio.tipo_efecto = 'material_tienda' and exists (
       select 1 from public.compras_tienda
        where profile_id = v_yo and producto = v_premio.parametros->>'producto') then
    raise exception 'Ya tienes ese material.' using errcode = '22023';
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  if v_saldo < v_premio.costo_puntos then
    raise exception 'Te faltan % puntos para este premio.', (v_premio.costo_puntos - v_saldo) using errcode = '22023';
  end if;

  perform interno.otorgar_puntos(v_yo, -v_premio.costo_puntos, 'canje', 'Canjeado: ' || v_premio.nombre, 'canje:' || gen_random_uuid()::text);

  if v_premio.tipo_efecto = 'doble_puntos' then
    v_vigente_hasta := now() + make_interval(hours => coalesce((v_premio.parametros->>'horas')::int, 24));
  end if;

  insert into public.premios_canjeados (student_id, premio_id, costo_pagado, parametros, vigente_hasta)
  values (v_yo, p_premio_id, v_premio.costo_puntos, v_premio.parametros, v_vigente_hasta)
  returning id into v_canje_id;

  if v_premio.tipo_efecto = 'curso_adelanto' then
    insert into public.course_unlocks (student_id, curso, hasta_leccion, granted_by)
    values (
      v_yo, v_premio.parametros->>'curso',
      coalesce((select hasta_leccion from public.course_unlocks
                 where student_id = v_yo and curso = v_premio.parametros->>'curso'), 0)
        + coalesce((v_premio.parametros->>'lecciones')::int, 1),
      v_yo
    )
    on conflict (student_id, curso) do update
      set hasta_leccion = excluded.hasta_leccion, granted_by = excluded.granted_by, updated_at = now();
  elsif v_premio.tipo_efecto = 'material_tienda' then
    insert into public.compras_tienda (profile_id, producto, otorgado_por)
    values (v_yo, v_premio.parametros->>'producto', null)
    on conflict (profile_id, producto) do nothing;
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  return query select v_canje_id, v_saldo;
end;
$$;
revoke execute on function public.canjear_premio(uuid) from public, anon;
grant execute on function public.canjear_premio(uuid) to authenticated;

create or replace function public.regalar_premio(p_premio_id uuid, p_para uuid, p_mensaje text default null)
returns table (canje_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_premio record;
  v_saldo integer;
  v_ya_tiene integer;
  v_hoy timestamptz := (now() at time zone 'America/Costa_Rica')::date::timestamp at time zone 'America/Costa_Rica';
  v_canje_id uuid;
  v_vigente_hasta timestamptz := null;
  v_nombre_yo text;
  v_nombre_para text;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  if p_para is null or p_para = v_yo then
    raise exception 'Elige a un compañero.' using errcode = '22023';
  end if;
  if not coalesce(public.es_companero(p_para), false) then
    raise exception 'Solo se le puede regalar a un compañero de clase.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('puntos:' || v_yo::text));

  select * into v_premio from public.premios_catalogo where id = p_premio_id and activo;
  if v_premio.id is null then
    raise exception 'Ese premio ya no está disponible.' using errcode = '22023';
  end if;
  if v_premio.categoria not in ('cosmetico', 'entrenamiento', 'regalo') then
    raise exception 'Ese premio no se puede regalar.' using errcode = '22023';
  end if;
  if p_mensaje is not null and not exists (select 1 from public.frases_regalo f where f.clave = p_mensaje and f.uso = 'regalo') then
    raise exception 'Ese mensaje no está en la lista.' using errcode = '22023';
  end if;
  if (select count(*) from public.premios_canjeados where regalo_de = v_yo and created_at >= v_hoy) >= 10 then
    raise exception 'Ya hiciste 10 regalos hoy. Mañana puedes seguir.' using errcode = '22023';
  end if;
  if v_premio.limite_por_alumno is not null then
    select count(*) into v_ya_tiene from public.premios_canjeados
     where student_id = p_para and premio_id = p_premio_id;
    if v_ya_tiene >= v_premio.limite_por_alumno then
      raise exception 'Tu compañero ya tiene ese premio.' using errcode = '22023';
    end if;
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  if v_saldo < v_premio.costo_puntos then
    raise exception 'Te faltan % puntos para este regalo.', (v_premio.costo_puntos - v_saldo) using errcode = '22023';
  end if;

  select coalesce(full_name, 'Un compañero') into v_nombre_yo from public.profiles where id = v_yo;
  select coalesce(full_name, 'tu compañero') into v_nombre_para from public.profiles where id = p_para;

  perform interno.otorgar_puntos(v_yo, -v_premio.costo_puntos, 'regalo',
    'Regalo para ' || v_nombre_para || ': ' || v_premio.nombre, 'regalo:' || gen_random_uuid()::text);

  if v_premio.tipo_efecto = 'doble_puntos' then
    v_vigente_hasta := now() + make_interval(hours => coalesce((v_premio.parametros->>'horas')::int, 24));
  end if;

  -- Un cosmético regalado llega guardado: lo pone quien lo recibe, si quiere.
  insert into public.premios_canjeados (student_id, premio_id, costo_pagado, parametros, vigente_hasta, regalo_de, mensaje, activo)
  values (p_para, p_premio_id, v_premio.costo_puntos, v_premio.parametros, v_vigente_hasta, v_yo, p_mensaje,
          v_premio.tipo_efecto not in ('titulo', 'marco_perfil', 'accesorio_avatar'))
  returning id into v_canje_id;

  -- El aviso al celular no puede deshacer el regalo si falla.
  begin
    perform public.avisar_push(array[p_para], '🎁 Te llegó un regalo',
      v_nombre_yo || ' te regaló ' || v_premio.nombre || '.', '/puntos-tienda.html', 'regalo');
  exception when others then
    raise warning 'No se pudo avisar el regalo: %', sqlerrm;
  end;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  return query select v_canje_id, v_saldo;
end;
$$;
revoke execute on function public.regalar_premio(uuid, uuid, text) from public, anon;
grant execute on function public.regalar_premio(uuid, uuid, text) to authenticated;

-- mis_premios trae ahora quién lo regaló y con qué mensaje.
drop function public.mis_premios(uuid);
create function public.mis_premios(p_alumno uuid default auth.uid())
returns table (
  id uuid, premio_id uuid, clave text, nombre text, emoji text, categoria text,
  tipo_efecto text, parametros jsonb, activo boolean, vigente_hasta timestamptz, created_at timestamptz,
  regalo_de uuid, regalo_de_nombre text, mensaje text
)
language sql
stable
security invoker
set search_path = public
as $$
  select pc.id, pc.premio_id, cat.clave, cat.nombre, cat.emoji, cat.categoria,
         cat.tipo_efecto, pc.parametros, pc.activo, pc.vigente_hasta, pc.created_at,
         pc.regalo_de, pr.full_name, f.texto
    from public.premios_canjeados pc
    join public.premios_catalogo cat on cat.id = pc.premio_id
    left join public.profiles pr on pr.id = pc.regalo_de
    left join public.frases_regalo f on f.clave = pc.mensaje
   where pc.student_id = p_alumno
   order by pc.created_at desc;
$$;
revoke execute on function public.mis_premios(uuid) from public, anon;
grant execute on function public.mis_premios(uuid) to authenticated;

-- =====================================================================
-- 6. Bromas: inofensivas, visuales, que se van solas, y siempre con nombre.
-- =====================================================================
create table public.bromas (
  id uuid primary key default gen_random_uuid(),
  de_id uuid not null references public.profiles(id) on delete cascade,
  para_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('payaso', 'patito', 'arcoiris', 'confeti', 'globo')),
  frase text references public.frases_regalo(clave) on delete set null,
  vence_at timestamptz not null,
  visto_at timestamptz,
  created_at timestamptz not null default now(),
  check (de_id <> para_id)
);
comment on table public.bromas is
  'Bromas entre compañeros compradas con Puntos Ajedrez. Solo las escribe mandar_broma(), que valida compañero, topes y que quien la recibe las acepte.';
create index bromas_para on public.bromas (para_id, created_at desc);
create index bromas_de on public.bromas (de_id, created_at desc);
alter table public.bromas enable row level security;
revoke all on public.bromas from public, anon, authenticated;
grant select on public.bromas to authenticated;
create policy bromas_ver on public.bromas for select to authenticated using (
  para_id = (select auth.uid())
  or de_id = (select auth.uid())
  or (select public.soy_admin())
  or para_id in (select interno.alumnos_de((select auth.uid())))
  or ((select public.soy_supervisor()) and para_id in (select interno.supervisados_por_mi()))
);

-- No recibir bromas, a quién se bloqueó, y los profes que las apagaron en su clase.
create table public.bromas_preferencias (
  alumno_id uuid primary key references public.profiles(id) on delete cascade,
  no_recibir boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.bromas_bloqueos (
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  bloqueado_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (alumno_id, bloqueado_id)
);
create table public.bromas_apagadas (
  profesor_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.bromas_preferencias enable row level security;
alter table public.bromas_bloqueos enable row level security;
alter table public.bromas_apagadas enable row level security;
revoke all on public.bromas_preferencias, public.bromas_bloqueos, public.bromas_apagadas from public, anon, authenticated;
grant select on public.bromas_preferencias, public.bromas_bloqueos, public.bromas_apagadas to authenticated;
create policy bromas_preferencias_ver on public.bromas_preferencias for select to authenticated
  using (alumno_id = (select auth.uid()));
create policy bromas_bloqueos_ver on public.bromas_bloqueos for select to authenticated
  using (alumno_id = (select auth.uid()));
create policy bromas_apagadas_ver on public.bromas_apagadas for select to authenticated
  using (profesor_id = (select auth.uid()) or (select public.soy_admin()));

insert into public.premios_catalogo (clave, nombre, descripcion, emoji, categoria, tipo_efecto, costo_puntos, parametros, limite_por_alumno, orden) values
  ('broma_globo', 'Globo de reto', 'Le aparece un globo con una frase de la lista la próxima vez que entra a su panel.', '🎈', 'broma', 'broma', 20, '{"tipo":"globo","horas":168}'::jsonb, null, 300),
  ('broma_confeti', 'Lluvia de confeti', 'La próxima vez que entra a su panel, le cae confeti con tu nombre.', '🎉', 'broma', 'broma', 25, '{"tipo":"confeti","horas":168}'::jsonb, null, 310),
  ('broma_patito', 'Patito en el tablero', 'Durante una hora, un patito cruza su pantalla de Entrenamiento de vez en cuando.', '🦆', 'broma', 'broma', 35, '{"tipo":"patito","horas":1}'::jsonb, null, 320),
  ('broma_arcoiris', 'Tablero arcoíris', 'Durante una hora, las casillas de sus tableros de Entrenamiento cambian de color.', '🌈', 'broma', 'broma', 45, '{"tipo":"arcoiris","horas":1}'::jsonb, null, 330),
  ('broma_payaso', 'Gorro de payaso', 'Durante un día, un gorro de payaso sobre su foto, también en «Alumnos conectados» de la clase.', '🤡', 'broma', 'broma', 60, '{"tipo":"payaso","horas":24}'::jsonb, null, 340)
on conflict (clave) do nothing;

create or replace function public.mandar_broma(p_premio_id uuid, p_para uuid, p_frase text default null)
returns table (broma_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_premio record;
  v_tipo text;
  v_saldo integer;
  v_hoy timestamptz := (now() at time zone 'America/Costa_Rica')::date::timestamp at time zone 'America/Costa_Rica';
  v_id uuid;
  v_nombre_para text;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  if p_para is null or p_para = v_yo then
    raise exception 'Elige a un compañero.' using errcode = '22023';
  end if;
  if not coalesce(public.es_companero(p_para), false) then
    raise exception 'Solo se le pueden mandar bromas a un compañero de clase.' using errcode = '42501';
  end if;

  select * into v_premio from public.premios_catalogo where id = p_premio_id and activo and categoria = 'broma';
  if v_premio.id is null then
    raise exception 'Esa broma ya no está disponible.' using errcode = '22023';
  end if;
  v_tipo := v_premio.parametros->>'tipo';
  if v_tipo = 'globo' then
    if p_frase is null or not exists (select 1 from public.frases_regalo f where f.clave = p_frase and f.uso = 'broma') then
      raise exception 'Elige una frase de la lista.' using errcode = '22023';
    end if;
  else
    p_frase := null;
  end if;

  perform pg_advisory_xact_lock(hashtext('puntos:' || v_yo::text));
  perform pg_advisory_xact_lock(hashtext('bromas:' || p_para::text));

  -- Lo de quien la recibe va con UN solo mensaje, sin decir el porqué: la
  -- visión de una persona es un dato de salud, y un bloqueo no se anuncia.
  if exists (select 1 from public.vision_personas v where v.persona_id = p_para)
     or exists (select 1 from public.bromas_preferencias bp where bp.alumno_id = p_para and bp.no_recibir)
     or exists (select 1 from public.bromas_bloqueos bb where bb.alumno_id = p_para and bb.bloqueado_id = v_yo)
     or exists (select 1 from public.bromas_apagadas ba
                 where ba.profesor_id in (select interno.profesores_de(p_para) union select interno.profesores_de(v_yo))) then
    raise exception 'A ese compañero no se le pueden mandar bromas ahora.' using errcode = '22023';
  end if;

  if exists (select 1 from public.bromas b where b.de_id = v_yo and b.para_id = p_para and b.created_at >= v_hoy) then
    raise exception 'Ya le mandaste una broma hoy. Mañana puedes otra.' using errcode = '22023';
  end if;
  if (select count(*) from public.bromas b where b.de_id = v_yo and b.created_at >= v_hoy) >= 5 then
    raise exception 'Ya mandaste 5 bromas hoy. Mañana puedes seguir.' using errcode = '22023';
  end if;
  if (select count(*) from public.bromas b where b.para_id = p_para and b.created_at >= v_hoy) >= 3 then
    raise exception 'Tu compañero ya recibió muchas bromas hoy. Prueba mañana.' using errcode = '22023';
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  if v_saldo < v_premio.costo_puntos then
    raise exception 'Te faltan % puntos para esta broma.', (v_premio.costo_puntos - v_saldo) using errcode = '22023';
  end if;

  select coalesce(full_name, 'tu compañero') into v_nombre_para from public.profiles where id = p_para;
  perform interno.otorgar_puntos(v_yo, -v_premio.costo_puntos, 'broma',
    'Broma para ' || v_nombre_para || ': ' || v_premio.nombre, 'broma:' || gen_random_uuid()::text);

  insert into public.bromas (de_id, para_id, tipo, frase, vence_at)
  values (v_yo, p_para, v_tipo, p_frase,
          now() + make_interval(hours => coalesce((v_premio.parametros->>'horas')::int, 24)))
  returning id into v_id;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  return query select v_id, v_saldo;
end;
$$;
revoke execute on function public.mandar_broma(uuid, uuid, text) from public, anon;
grant execute on function public.mandar_broma(uuid, uuid, text) to authenticated;

-- Las bromas que me tocan ahora: las de duración (payaso, patito, arcoíris)
-- mientras duran; las de una vez (confeti, globo) hasta que las vea.
create or replace function public.mis_bromas()
returns table (id uuid, tipo text, de_nombre text, frase text, vence_at timestamptz, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select b.id, b.tipo, coalesce(p.full_name, 'Un compañero'), f.texto, b.vence_at, b.created_at
    from public.bromas b
    left join public.profiles p on p.id = b.de_id
    left join public.frases_regalo f on f.clave = b.frase
   where b.para_id = (select auth.uid())
     and b.vence_at > now()
     and (b.tipo in ('payaso', 'patito', 'arcoiris') or b.visto_at is null)
   order by b.created_at;
$$;
revoke execute on function public.mis_bromas() from public, anon;
grant execute on function public.mis_bromas() to authenticated;

create or replace function public.broma_vista(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bromas set visto_at = now()
   where id = p_id and para_id = (select auth.uid()) and visto_at is null;
$$;
revoke execute on function public.broma_vista(uuid) from public, anon;
grant execute on function public.broma_vista(uuid) to authenticated;

create or replace function public.bromas_configurar(p_no_recibir boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  insert into public.bromas_preferencias (alumno_id, no_recibir, updated_at)
  values (auth.uid(), coalesce(p_no_recibir, false), now())
  on conflict (alumno_id) do update set no_recibir = excluded.no_recibir, updated_at = now();
end;
$$;
revoke execute on function public.bromas_configurar(boolean) from public, anon;
grant execute on function public.bromas_configurar(boolean) to authenticated;

create or replace function public.bromas_bloquear(p_persona uuid, p_bloquear boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  if p_persona is null or p_persona = auth.uid() then
    raise exception 'Elige a otra persona.' using errcode = '22023';
  end if;
  if coalesce(p_bloquear, true) then
    insert into public.bromas_bloqueos (alumno_id, bloqueado_id) values (auth.uid(), p_persona)
    on conflict do nothing;
  else
    delete from public.bromas_bloqueos where alumno_id = auth.uid() and bloqueado_id = p_persona;
  end if;
end;
$$;
revoke execute on function public.bromas_bloquear(uuid, boolean) from public, anon;
grant execute on function public.bromas_bloquear(uuid, boolean) to authenticated;

-- El profe (o quien administra) apaga o prende las bromas entre sus alumnos.
create or replace function public.bromas_en_mi_clase(p_permitir boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.soy_admin() or (select mp.role from public.my_profile() mp) = 'profesor', false) then
    raise exception 'Solo un profesor puede cambiar esto.' using errcode = '42501';
  end if;
  if coalesce(p_permitir, true) then
    delete from public.bromas_apagadas where profesor_id = auth.uid();
  else
    insert into public.bromas_apagadas (profesor_id) values (auth.uid()) on conflict do nothing;
  end if;
end;
$$;
revoke execute on function public.bromas_en_mi_clase(boolean) from public, anon;
grant execute on function public.bromas_en_mi_clase(boolean) to authenticated;

-- El gorro de payaso le gana al accesorio que tenga puesto, mientras dure.
create or replace function public.accesorios_de(p_ids uuid[])
returns table (student_id uuid, emoji text, nombre text)
language sql
stable
security invoker
set search_path = public
as $$
  with payasos as (
    select distinct on (b.para_id) b.para_id as sid
      from public.bromas b
     where b.tipo = 'payaso' and b.vence_at > now() and b.para_id = any(p_ids)
     order by b.para_id, b.created_at desc
  ),
  equipados as (
    select distinct on (pc.student_id) pc.student_id, cat.emoji, cat.nombre
      from public.premios_canjeados pc
      join public.premios_catalogo cat on cat.id = pc.premio_id
     where pc.activo and cat.tipo_efecto = 'accesorio_avatar' and pc.student_id = any(p_ids)
     order by pc.student_id, pc.created_at desc
  )
  select sid, '🤡'::text, 'Gorro de payaso (broma)'::text from payasos
  union all
  select e.student_id, e.emoji, e.nombre from equipados e where e.student_id not in (select sid from payasos);
$$;
revoke execute on function public.accesorios_de(uuid[]) from public, anon;
grant execute on function public.accesorios_de(uuid[]) to authenticated;

-- Lo que le llegó (regalos y bromas) para la campana del panel.
create or replace function public.regalos_y_bromas_recientes(p_desde timestamptz)
returns table (tipo text, de_nombre text, emoji text, que text, frase text, fecha timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select 'regalo', coalesce(p.full_name, 'Un compañero'), cat.emoji, cat.nombre, f.texto, pc.created_at
    from public.premios_canjeados pc
    join public.premios_catalogo cat on cat.id = pc.premio_id
    left join public.profiles p on p.id = pc.regalo_de
    left join public.frases_regalo f on f.clave = pc.mensaje
   where pc.student_id = (select auth.uid()) and pc.regalo_de is not null and pc.created_at >= p_desde
  union all
  select 'broma', coalesce(p.full_name, 'Un compañero'), cat.emoji, cat.nombre, f.texto, b.created_at
    from public.bromas b
    left join public.profiles p on p.id = b.de_id
    left join public.frases_regalo f on f.clave = b.frase
    left join public.premios_catalogo cat on cat.tipo_efecto = 'broma' and cat.parametros->>'tipo' = b.tipo
   where b.para_id = (select auth.uid()) and b.created_at >= p_desde
  order by 6 desc
  limit 10;
$$;
revoke execute on function public.regalos_y_bromas_recientes(timestamptz) from public, anon;
grant execute on function public.regalos_y_bromas_recientes(timestamptz) to authenticated;
