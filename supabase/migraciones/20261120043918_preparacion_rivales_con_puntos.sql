-- La preparación de rivales se desbloquea con 15 000 Puntos Ajedrez.
--
-- Hasta ahora preparacion-rivales.html era solo de quien administra y de los
-- profesores que administración activa uno por uno. Ahora un alumno la puede
-- abrir para siempre canjeando 15 000 puntos en la tienda de puntos
-- (puntos-tienda.html), y a quien administra le llega un aviso cuando alguien
-- la desbloquea.
--
-- QUÉ SE CANJEA: un premio más del catálogo (categoría «contenido», tipo
-- «herramienta», un solo canje por persona). No se puede regalar:
-- regalar_premio() solo deja cosméticos, ventajas de entrenamiento y regalos.
-- El canje es el de siempre, canjear_premio(): valida el saldo con su candado,
-- descuenta los puntos y deja la fila en premios_canjeados. Esa fila ES el
-- desbloqueo: no hay otra tabla que pueda quedar desfasada.
--
-- QUIÉN PUEDE: puedo_preparar_rivales() suma una tercera vía, tener ese canje.
-- Por eso la política de insert de preparaciones_rival (que ya pregunta a esa
-- función) deja guardar análisis al alumno sin tocarla.
--
-- EL AVISO: un trigger sobre premios_canjeados, AFTER INSERT. Si es este
-- premio:
--   * quien ya la tenía por otra vía (administra o es un profesor activo) no
--     la puede comprar: el error deshace el canje entero, puntos incluidos;
--   * a cada cuenta que administra le llega un aviso al celular (avisar_push).
--     El aviso que dura es la lista de admin.html#preparacion, que lee los
--     canjes; y el canje queda en la bitácora (premios_canjeados ya tiene su
--     trigger interno.auditar()).
--
-- Ver «Desbloquearla con 15 000 puntos» en docs/decisiones/paneles.md.

-- 1. El tipo de premio «herramienta».
alter table public.premios_catalogo drop constraint premios_catalogo_tipo_efecto_check;
alter table public.premios_catalogo add constraint premios_catalogo_tipo_efecto_check
  check (tipo_efecto = any (array['titulo', 'marco_perfil', 'doble_puntos', 'curso_adelanto',
                                  'material_tienda', 'accesorio_avatar', 'tarjeta', 'broma',
                                  'herramienta']));

-- 2. El premio.
insert into public.premios_catalogo
  (clave, nombre, descripcion, emoji, categoria, tipo_efecto, costo_puntos, parametros, limite_por_alumno, orden, activo)
values
  ('herramienta_preparacion_rivales',
   'Preparación de rivales',
   'La herramienta de los profesores para estudiar a un rival: sus partidas de Lichess o Chess.com, su repertorio, su FODA y qué jugarle con cada color, revisado con Stockfish. Queda abierta para siempre.',
   '🔭', 'contenido', 'herramienta', 15000,
   '{"herramienta": "preparacion_rivales"}'::jsonb, 1, 140, true)
on conflict (clave) do nothing;

-- 3. ¿La cuenta que llama puede preparar rivales? Quien administra, el
--    profesor activado y quien canjeó el premio.
create or replace function public.puedo_preparar_rivales()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce((select public.soy_admin()), false)
      or exists (select 1 from public.preparacion_rivales_profesores p
                  where p.profesor_id = (select auth.uid()))
      or exists (select 1 from public.premios_canjeados pc
                   join public.premios_catalogo cat on cat.id = pc.premio_id
                  where pc.student_id = (select auth.uid())
                    and cat.tipo_efecto = 'herramienta'
                    and cat.parametros->>'herramienta' = 'preparacion_rivales');
$function$;
revoke execute on function public.puedo_preparar_rivales() from public, anon;
grant execute on function public.puedo_preparar_rivales() to authenticated;

-- 4. El canje: no a quien ya la tiene, y el aviso a quien administra.
create or replace function interno.al_desbloquear_herramienta()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_cat     record;
  v_nombre  text;
  v_admins  uuid[];
begin
  select cat.tipo_efecto, cat.parametros, cat.costo_puntos into v_cat
    from public.premios_catalogo cat where cat.id = new.premio_id;
  if v_cat.tipo_efecto is distinct from 'herramienta'
     or v_cat.parametros->>'herramienta' is distinct from 'preparacion_rivales' then
    return new;
  end if;

  if exists (select 1 from public.profiles where id = new.student_id and is_admin)
     or exists (select 1 from public.preparacion_rivales_profesores where profesor_id = new.student_id) then
    raise exception 'Ya tienes la preparación de rivales: no hace falta canjearla.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), 'Un alumno') into v_nombre
    from public.profiles p where p.id = new.student_id;
  select array_agg(p.id) into v_admins from public.profiles p where p.is_admin;
  begin
    perform public.avisar_push(v_admins,
      'Desbloquearon la preparación de rivales',
      coalesce(v_nombre, 'Un alumno') || ' canjeó ' || replace(to_char(coalesce(new.costo_pagado, v_cat.costo_puntos), 'FM999,999,999'), ',', ' ')
        || ' puntos y ya puede preparar rivales.',
      '/admin.html#preparacion', 'prep-desbloqueo:' || new.student_id);
  exception when others then null;   -- un aviso que no sale no deshace el canje
  end;
  return new;
end;
$function$;
revoke execute on function interno.al_desbloquear_herramienta() from public, anon, authenticated;

create trigger al_desbloquear_herramienta after insert on public.premios_canjeados
  for each row execute function interno.al_desbloquear_herramienta();
