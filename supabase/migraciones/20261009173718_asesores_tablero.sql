-- El tablero del grupo en la ficha Asesores (admin.html#asesores).
--
-- Una fila por cuenta temporal ABIERTA del taller (p_detalle): quién es,
-- cuántas clases de la plataforma tiene, la última vez que entró y la nota de
-- cada cuestionario que contestó como tarea. Las cuentas se hacen acá y no en
-- el navegador: PostgREST corta a ~1000 filas sin avisar, y el registro de
-- actividad crece rápido.
--
-- SECURITY INVOKER: cada consulta pasa por la RLS de su tabla. Quien
-- administra lee las cuatro enteras (cuentas_temporales, class_attendance,
-- platform_activity_log y cuestionario_intentos); cualquier otro solo vería lo
-- que ya podía ver, que en cuentas_temporales es a lo sumo la suya.
--
-- «La última vez» es la página o la clase más reciente que abrió: no hay otra
-- huella de que entró que la base pueda leer (el último inicio de sesión vive
-- en auth.users, que no se le abre a nadie desde afuera).
--
-- La nota es la de la PRIMERA vez, como en «Tareas enviadas»: al entregar ve
-- las correctas, así que la segunda ya no mide nada. Va por cuestionario, con
-- cuántas veces lo hizo.
create or replace function public.asesores_tablero(p_detalle text)
returns table(persona_id uuid, nombre text, clases integer, ultima_vez timestamptz, cuestionarios jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ct.persona_id,
    p.full_name,
    (select count(*)::integer from public.class_attendance a where a.student_id = ct.persona_id),
    greatest(
      (select max(l.joined_at) from public.platform_activity_log l where l.student_id = ct.persona_id),
      (select max(a.joined_at) from public.class_attendance a where a.student_id = ct.persona_id)),
    coalesce((
      select jsonb_object_agg(x.cuestionario_id, jsonb_build_object(
               'aciertos', x.aciertos, 'total', x.total, 'veces', x.veces))
      from (
        select distinct on (i.cuestionario_id)
               i.cuestionario_id, i.aciertos, i.total,
               count(*) over (partition by i.cuestionario_id) as veces
        from public.cuestionario_intentos i
        where i.alumno_id = ct.persona_id and i.cuestionario_id is not null
        order by i.cuestionario_id, i.created_at
      ) x), '{}'::jsonb)
  from public.cuentas_temporales ct
  join public.profiles p on p.id = ct.persona_id
  where ct.detalle = p_detalle
    and ct.vence > now()
  order by p.full_name;
$$;

revoke execute on function public.asesores_tablero(text) from public, anon;
grant execute on function public.asesores_tablero(text) to authenticated;
