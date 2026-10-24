-- Lo que se compra en la tienda de puntos, aplicado de verdad a quien lo compra.
--
-- Revisando premio por premio salieron tres cosas que se cobraban y no daban
-- lo que decían (ver «Lo que se canjea tiene que notarse» en
-- docs/decisiones/puntos-y-premios.md):
--
-- 1. «Adelanta una lección» sumaba la lección al desbloqueo manual anterior
--    (0 si no había) sin mirar por dónde va el alumno: el primer canje
--    desbloqueaba la lección 1, que siempre está abierta, y a quien ya iba
--    por la 6 le «adelantaba» la 1. Ahora cuenta desde la lección que ya
--    tiene disponible (la siguiente a la última que marcó como estudiada, o
--    hasta donde se la abrió su profe) y le abre una más.
-- 2. Un día (o una semana) de puntos dobles comprado mientras corría otro
--    empezaba a contar desde ya: los dos se pisaban y se perdía lo comprado.
--    Ahora se suma al final del que está corriendo. Igual cuando se regala.
-- 3. Poner un título, un marco o un accesorio dejaba puesto el anterior del
--    mismo tipo: se mostraba el más nuevo, y al quitarlo volvía a aparecer el
--    viejo sin que nadie lo pidiera. Ahora poner uno quita el otro.
--
-- Y se arregla lo ya comprado: las lecciones que se pagaron y no se abrieron
-- (ningún alumno que compró había marcado lecciones de ese curso: se le abre
-- una más por cada canje, contando desde la 1) y los puntos dobles que se
-- compraron con otros corriendo (se corren al final de esos).

create or replace function interno.fin_de_puntos_dobles(p_alumno uuid, p_horas integer)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select greatest(now(), coalesce(max(pc.vigente_hasta), now()))
         + make_interval(hours => coalesce(p_horas, 24))
    from public.premios_canjeados pc
    join public.premios_catalogo cat on cat.id = pc.premio_id
   where pc.student_id = p_alumno and cat.tipo_efecto = 'doble_puntos';
$$;
revoke execute on function interno.fin_de_puntos_dobles(uuid, integer) from public, anon, authenticated;

-- Hasta qué lección tiene abierto un curso hoy: la siguiente a la última
-- estudiada (js/curso-academia.js anota el número en detail.n) o el
-- desbloqueo manual, lo que llegue más lejos.
create or replace function interno.leccion_abierta(p_alumno uuid, p_curso text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select greatest(
    1,
    coalesce((select u.hasta_leccion from public.course_unlocks u
               where u.student_id = p_alumno and u.curso = p_curso), 0),
    coalesce((select max((tp.detail->>'n')::int) from public.training_progress tp
               where tp.student_id = p_alumno and tp.activity = 'curso'
                 and tp.detail->>'curso' = p_curso and tp.detail->>'n' ~ '^[0-9]{1,4}$'), 0) + 1);
$$;
revoke execute on function interno.leccion_abierta(uuid, text) from public, anon, authenticated;

create or replace function public.canjear_premio(p_premio_id uuid)
returns table(canje_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    v_vigente_hasta := interno.fin_de_puntos_dobles(v_yo, (v_premio.parametros->>'horas')::int);
  end if;

  -- Un cosmético comprado sale puesto: quita el que había del mismo tipo.
  if v_premio.tipo_efecto in ('titulo', 'marco_perfil', 'accesorio_avatar') then
    update public.premios_canjeados pc set activo = false
      from public.premios_catalogo cat
     where cat.id = pc.premio_id and pc.student_id = v_yo and pc.activo
       and cat.tipo_efecto = v_premio.tipo_efecto;
  end if;

  insert into public.premios_canjeados (student_id, premio_id, costo_pagado, parametros, vigente_hasta)
  values (v_yo, p_premio_id, v_premio.costo_puntos, v_premio.parametros, v_vigente_hasta)
  returning id into v_canje_id;

  if v_premio.tipo_efecto = 'curso_adelanto' then
    insert into public.course_unlocks (student_id, curso, hasta_leccion, granted_by)
    values (
      v_yo, v_premio.parametros->>'curso',
      interno.leccion_abierta(v_yo, v_premio.parametros->>'curso')
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
$function$;

create or replace function public.regalar_premio(p_premio_id uuid, p_para uuid, p_mensaje text default null)
returns table(canje_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    v_vigente_hasta := interno.fin_de_puntos_dobles(p_para, (v_premio.parametros->>'horas')::int);
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
$function$;

create or replace function public.equipar_premio(p_canje_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_yo uuid := auth.uid();
  v_tipo text;
begin
  select cat.tipo_efecto into v_tipo
    from public.premios_canjeados pc
    join public.premios_catalogo cat on cat.id = pc.premio_id
   where pc.id = p_canje_id and pc.student_id = v_yo;
  if v_tipo is null then
    raise exception 'Ese premio no es tuyo o no existe.' using errcode = '42501';
  end if;
  -- Se lleva puesto uno de cada tipo: poner este quita el otro.
  if coalesce(p_activo, true) and v_tipo in ('titulo', 'marco_perfil', 'accesorio_avatar') then
    update public.premios_canjeados pc set activo = false
      from public.premios_catalogo cat
     where cat.id = pc.premio_id and pc.student_id = v_yo and pc.activo
       and cat.tipo_efecto = v_tipo and pc.id <> p_canje_id;
  end if;
  update public.premios_canjeados
     set activo = coalesce(p_activo, true)
   where id = p_canje_id and student_id = v_yo;
end;
$function$;

-- Lo ya comprado: una lección más por cada canje, desde la 1 (lo que daría la
-- regla nueva, porque ninguno había estudiado lecciones de ese curso).
update public.course_unlocks u
   set hasta_leccion = greatest(u.hasta_leccion, 1 + c.canjes), updated_at = now()
  from (select pc.student_id, cat.parametros->>'curso' as curso,
               sum(coalesce((cat.parametros->>'lecciones')::int, 1))::int as canjes
          from public.premios_canjeados pc
          join public.premios_catalogo cat on cat.id = pc.premio_id
         where cat.tipo_efecto = 'curso_adelanto' and pc.regalo_de is null
         group by 1, 2) c
 where u.student_id = c.student_id and u.curso = c.curso
   and not exists (select 1 from public.training_progress tp
                    where tp.student_id = c.student_id and tp.activity = 'curso'
                      and tp.detail->>'curso' = c.curso);

-- Los puntos dobles comprados con otros corriendo: van después de esos,
-- con lo que duraban.
update public.premios_canjeados x
   set vigente_hasta = (select max(pc.vigente_hasta)
                          from public.premios_canjeados pc
                          join public.premios_catalogo c2 on c2.id = pc.premio_id
                         where pc.student_id = x.student_id and c2.tipo_efecto = 'doble_puntos'
                           and pc.created_at < x.created_at and pc.vigente_hasta > x.created_at)
                       + (x.vigente_hasta - x.created_at)
 where x.premio_id in (select id from public.premios_catalogo where tipo_efecto = 'doble_puntos')
   and exists (select 1 from public.premios_canjeados pc
                 join public.premios_catalogo c2 on c2.id = pc.premio_id
                where pc.student_id = x.student_id and c2.tipo_efecto = 'doble_puntos'
                  and pc.created_at < x.created_at and pc.vigente_hasta > x.created_at);

-- Más de un cosmético puesto del mismo tipo: queda el más nuevo, como ya se veía.
update public.premios_canjeados pc set activo = false
  from public.premios_catalogo cat
 where cat.id = pc.premio_id and pc.activo
   and cat.tipo_efecto in ('titulo', 'marco_perfil', 'accesorio_avatar')
   and exists (select 1 from public.premios_canjeados otro
                 join public.premios_catalogo cat2 on cat2.id = otro.premio_id
                where otro.student_id = pc.student_id and otro.activo
                  and cat2.tipo_efecto = cat.tipo_efecto
                  and otro.created_at > pc.created_at);
