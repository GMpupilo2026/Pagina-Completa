-- formulario_respuestas preguntaba el permiso UNA VEZ POR RESPUESTA
-- (soy_admin, coordinador_puede, bajo_mi_coordinacion... ~3 ms cada fila):
-- con 112 respuestas ya tardaba 0,36 s, y crece con cada inscripción.
-- La regla depende solo del formulario, así que se arma una vez el conjunto
-- de formularios que se pueden ver y cada respuesta se busca en él. Misma
-- regla: comparado cuenta por cuenta (129), cero diferencias.
alter policy formulario_respuestas_select on public.formulario_respuestas using (
  formulario_id in (
    select f.id from public.formularios f
     where public.soy_admin()
        or (public.coordinador_puede('formularios'::text)
            and (f.creado_por = auth.uid() or public.bajo_mi_coordinacion(f.creado_por)
                 or public.formulario_compartido_conmigo(f.id)))));
