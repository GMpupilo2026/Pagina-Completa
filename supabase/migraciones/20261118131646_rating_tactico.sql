-- El rating táctico de cada alumno: un número que sube al resolver ejercicios
-- limpio y baja al necesitar ayuda, como el «Coliseo de táctica» de
-- Chessgora. Ver «El rating táctico» en docs/decisiones/entrenamiento.md.
--
-- * NO SE GUARDA: se calcula cada vez, desde lo que ya está en
--   training_progress (actividad 'temas', con el rating del ejercicio y si
--   salió limpio: lo anota Ejercicios por tema desde el 10/2026). Lo que se
--   deriva de otras filas no se guarda; así no hay un número que se pueda
--   desfasar de su historia ni una tabla más que escribir y proteger.
--
-- * LA CUENTA ES ELO, ejercicio por ejercicio y en orden: se espera
--   E = 1 / (1 + 10^((rating_ejercicio - R) / 400)), y R sube K·(1 − E) si
--   salió limpio o baja K·E si costó (con error o con pista). K es 40 los
--   primeros 20 ejercicios (para que llegue rápido a su nivel), 24 hasta los
--   60 y 16 después. Arranca en 1200 y se queda entre 400 y 3000. Las filas
--   viejas sin «limpio» (de antes de que se anotara) no cuentan: no se sabe
--   cómo salieron.
--
-- * SECURITY INVOKER: lee training_progress con la RLS de quien pregunta. El
--   alumno, el suyo; su profe y quien administra, el de sus alumnos (la misma
--   política de siempre). Sin p_alumno, el propio. No hay nada que validar a
--   mano: si la RLS no deja ver las filas, sale el rating de partida y 0
--   ejercicios.
--
-- * Devuelve también cuánto cambió HOY (día de Costa Rica) y el mejor que
--   llegó a tener, para decirlo en pantalla sin una segunda consulta.

create or replace function public.rating_tactico(p_alumno uuid default null)
 returns table(rating integer, ejercicios integer, cambio_hoy integer, mejor integer)
 language plpgsql
 stable
 security invoker
 set search_path to 'public'
as $function$
declare
  v_alumno uuid := coalesce(p_alumno, (select auth.uid()));
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  r numeric := 1200;
  r_antes_de_hoy numeric := null;
  v_mejor numeric := 1200;
  n integer := 0;
  k numeric;
  e numeric;
  f record;
begin
  if v_alumno is null then
    return query select 1200, 0, 0, 1200;
    return;
  end if;
  for f in
    select (t.detail->>'rating')::numeric as rp,
           (t.detail->>'limpio')::boolean as limpio,
           (t.created_at at time zone 'America/Costa_Rica')::date as dia
      from public.training_progress t
     where t.student_id = v_alumno
       and t.activity = 'temas'
       and jsonb_typeof(t.detail->'rating') = 'number'
       and jsonb_typeof(t.detail->'limpio') = 'boolean'
     order by t.created_at, t.id
  loop
    if r_antes_de_hoy is null and f.dia >= v_hoy then r_antes_de_hoy := r; end if;
    k := case when n < 20 then 40 when n < 60 then 24 else 16 end;
    e := 1 / (1 + power(10::numeric, (f.rp - r) / 400));
    r := least(3000, greatest(400, r + k * ((case when f.limpio then 1 else 0 end) - e)));
    v_mejor := greatest(v_mejor, r);
    n := n + 1;
  end loop;
  return query select round(r)::integer, n,
                      round(r - coalesce(r_antes_de_hoy, r))::integer,
                      round(v_mejor)::integer;
end;
$function$;

revoke execute on function public.rating_tactico(uuid) from public, anon;
grant execute on function public.rating_tactico(uuid) to authenticated;
