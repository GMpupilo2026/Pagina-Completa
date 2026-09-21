
-- formularios / formulario_respuestas: se filtraban por grupo = mi_grupo(),
-- un texto de sede que dos coordinadores DISTINTOS pueden compartir (ya
-- verificado con datos reales: dos cuentas coordinadoras tienen ambas
-- grupo='SJ'), así que uno veía los formularios y respuestas del otro. Se
-- reemplaza por bajo_mi_coordinacion(creado_por) -- solo quien coordina a la
-- cuenta que armó el formulario, igual que el resto de la coordinación.
-- formularios_insert exige soy_coordinador(), así que creado_por siempre es
-- un coordinador o quien administra.

drop policy if exists formularios_select on public.formularios;
create policy formularios_select on public.formularios
  for select to authenticated
  using (
    creado_por = auth.uid()
    or (select mp.is_admin from my_profile() mp(role, is_admin, teacher_id))
    or (soy_coordinador() and bajo_mi_coordinacion(creado_por))
  );

drop policy if exists formulario_respuestas_select on public.formulario_respuestas;
create policy formulario_respuestas_select on public.formulario_respuestas
  for select to authenticated
  using (
    exists (
      select 1 from public.formularios f
       where f.id = formulario_respuestas.formulario_id
         and (
           f.creado_por = auth.uid()
           or (select mp.is_admin from my_profile() mp(role, is_admin, teacher_id))
           or (soy_coordinador() and bajo_mi_coordinacion(f.creado_por))
         )
    )
  );
