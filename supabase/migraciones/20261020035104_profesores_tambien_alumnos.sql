create or replace function interno.profesor_alumno_mio(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select p.role = 'profesor' and not coalesce(p.is_admin, false)
       from public.profiles p where p.id = p_id)
    and (
      p_id in (select interno.alumnos_de(auth.uid()))
      or (
        (coalesce(public.soy_admin(), false) or coalesce(public.bajo_mi_coordinacion(p_id), false))
        and (
          exists (select 1 from public.profile_teachers pt where pt.student_id = p_id)
          or exists (select 1 from public.equipo_alumnos ea where ea.alumno_id = p_id)
        )
      )
    ),
    false);
$$;
revoke execute on function interno.profesor_alumno_mio(uuid) from public, anon;
grant execute on function interno.profesor_alumno_mio(uuid) to authenticated, service_role;

do $$
declare
  f text;
  def text;
  nuevo text;
  nombres text[] := array[
    'alumnos_del_profesor', 'actividad_profesor', 'detalle_mensual_crudo',
    'entreno_hoy_de_mis_alumnos', 'enviar_aviso', 'grupos_de_mis_alumnos',
    'informe_de_alumno', 'informes_cursos_alumnos', 'informes_diagnosticos_alumnos',
    'informes_entreno_modulos', 'informes_inactivos', 'informes_resumen_alumnos',
    'panel_profesor', 'se_caen_del_plan'];
begin
  foreach f in array nombres loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if def is null then raise exception 'No existe public.%', f; end if;
    nuevo := replace(def, 'p.role = ''alumno''',
                     '(p.role = ''alumno'' or interno.profesor_alumno_mio(p.id))');
    if nuevo = def then raise exception 'public.% ya no tiene «p.role = ''alumno''»', f; end if;
    execute nuevo;
  end loop;
end $$;

do $$
declare
  def text;
  nuevo text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mandar_plan_rival';
  nuevo := replace(def, 'where id = v_alumno and role = ''alumno''',
                   'where id = v_alumno and (role = ''alumno'' or interno.profesor_alumno_mio(id))');
  if nuevo = def then raise exception 'mandar_plan_rival cambió'; end if;
  execute nuevo;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'justificar_ausencia';
  nuevo := replace(def, 'select p.role = ''alumno'' from public.profiles p where p.id = yo',
                   'select (p.role = ''alumno'' or exists (select 1 from public.profile_teachers t where t.student_id = p.id)) from public.profiles p where p.id = yo');
  if nuevo = def then raise exception 'justificar_ausencia cambió'; end if;
  execute nuevo;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'coord_set_profesores';
  nuevo := replace(def, 'if (select role from public.profiles where id = p_alumno) <> ''alumno'' then',
                   'if (select role from public.profiles where id = p_alumno) not in (''alumno'', ''profesor'') then');
  if nuevo = def then raise exception 'coord_set_profesores cambió'; end if;
  nuevo := replace(nuevo, 'if array_length(v_pedidos, 1) > 10 then',
                   'if p_alumno = any (v_pedidos) then
    raise exception ''Nadie puede ser su propio profesor.'' using errcode = ''22023'';
  end if;
  if array_length(v_pedidos, 1) > 10 then');
  execute nuevo;
end $$;