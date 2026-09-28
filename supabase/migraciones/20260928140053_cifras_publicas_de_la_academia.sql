-- La cifra de estudiantes de la portada (index.html) suma las inscripciones a
-- los torneos en linea (cifras_torneos(), base de Colegios) y las cuentas de
-- alumno de la Academia, que salen de aca.
--
-- Devuelve UN numero y nada mas: ni una fila de profiles, ni un nombre. Por eso
-- es SECURITY DEFINER y se le da execute a anon a proposito, igual que
-- formulario_publico(): la portada se abre sin cuenta.
--
-- Se cuentan las cuentas con role = 'alumno' menos las de prueba, que son las
-- que se llaman «Prueba…» (Prueba, Prueba 2, Prueba Gratis): las arma el propio
-- equipo para probar y no son estudiantes. Ver «Las cifras de la portada» en
-- docs/decisiones/paneles.md.
create or replace function public.cifras_academia()
returns table (alumnos bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)
    from public.profiles
   where role = 'alumno'
     and coalesce(full_name, '') !~* '^\s*prueba\M';
$$;

revoke execute on function public.cifras_academia() from public;
grant execute on function public.cifras_academia() to anon, authenticated;
