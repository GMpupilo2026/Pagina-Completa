-- Funciones SECURITY DEFINER que solo tienen sentido con sesión y que el
-- público sin cuenta podía llamar por /rest/v1/rpc/ (heredaban el EXECUTE de
-- PUBLIC). Con `profesores_del_coordinador` cualquiera sacaba qué profesores
-- lleva cada coordinación; las demás validan por dentro, pero no tienen nada
-- que hacer sin sesión. Se revoca de PUBLIC y de anon y se le devuelve a
-- authenticated, que es quien las usa (incluidas las políticas de equipos).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('profesores_del_coordinador','gente_de_mi_coordinacion',
        'planes_compartidos_conmigo','cambiar_rol','cerrar_examen',
        'disparar_recordatorios_programados','examen_informe','examen_para_alumno',
        'iniciar_examen','registrar_salida_examen','responder_examen',
        'resumen_tareas_examenes','set_profesores_del_coordinador','set_student_elo',
        'aceptar_desafio','puede_ver_equipo')
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;