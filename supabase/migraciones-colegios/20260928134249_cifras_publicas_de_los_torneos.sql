-- Las cifras de la portada (index.html) salen de las inscripciones reales a
-- los torneos en linea, y se actualizan solas: cada visita las vuelve a pedir.
--
-- `inscripciones` sigue cerrada: anon no tiene ni el permiso de tabla (ver
-- 20260921022552). Esta funcion es la unica puerta, y por ella salen CUATRO
-- NUMEROS y nada mas: ni una fila, ni un nombre, ni un colegio con su cantidad.
-- Por eso es SECURITY DEFINER y se le da execute a anon a proposito: la portada
-- se abre sin cuenta y con la clave publica de este proyecto.
--
-- Las personas se cuentan por cedula (solo los digitos), no por fila: quien se
-- inscribe dos veces es un estudiante, no dos. Los centros, provincias y
-- cantones, sin distinguir mayusculas ni espacios de mas.
create or replace function public.cifras_torneos()
returns table (estudiantes bigint, centros bigint, provincias bigint, cantones bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct nullif(regexp_replace(cedula, '\D', '', 'g'), '')),
         count(distinct nullif(lower(trim(centro)), '')),
         count(distinct nullif(lower(trim(provincia)), '')),
         count(distinct nullif(lower(trim(canton)), ''))
    from public.inscripciones;
$$;

revoke execute on function public.cifras_torneos() from public;
grant execute on function public.cifras_torneos() to anon, authenticated;
