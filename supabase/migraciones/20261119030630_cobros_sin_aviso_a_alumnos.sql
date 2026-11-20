-- A los alumnos no les sale nada de cobros hasta que el dueño lo decida
-- (18/11/2026): todavía no probó ni configuró los cobros nuevos, y 20 alumnos
-- con la mensualidad vencida veían en su panel la franja «Tu mensualidad
-- venció…».
--
-- mi_acceso() ya no le cuenta a una cuenta que NO está apagada en qué estado
-- está su mensualidad: contesta `motivo: "cobro"`, vigente y
-- `avisar_en_panel: false`, sin estado ni fecha. Así la franja no se pinta ni
-- con el js/acceso-vigente.js que ya estaba publicado (pinta solo con estado
-- «vence_pronto» o «vencido») ni con el nuevo (pinta solo con
-- avisar_en_panel). Tiene efecto en el momento, sin esperar el despliegue.
-- La cuenta APAGADA sigue contestando todo (monto, SINPE, comprobante): solo
-- pasa si alguien la apaga a mano, y sin eso el alumno no sabría por qué no
-- puede entrar. Lo demás de la función queda igual.
create or replace function public.mi_acceso()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_rol text; v_admin boolean; v_exigido boolean; v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
        v_hasta date; v_nombre text; v_vigente boolean := public.acceso_vigente(); v_prueba timestamptz;
        v_temporal timestamptz; v_detalle text; v_empieza timestamptz; v_origen text;
        v_cuenta uuid; v_est jsonb; v_c public.cuentas_cobro; v_aj public.cobros_ajustes;
begin
  select role, is_admin into v_rol, v_admin from public.profiles where id = auth.uid();
  select exigido into v_exigido from public.acceso_config where id;
  v_exigido := coalesce(v_exigido, false);
  if v_rol is null then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'sin_perfil', 'exigido', v_exigido);
  end if;
  -- La cuenta de árbitro: su lugar es arbitro.html (js/acceso-vigente.js lo lleva).
  if v_rol = 'arbitro' then
    return jsonb_build_object('vigente', false, 'motivo', 'arbitro', 'exigido', v_exigido);
  end if;
  if coalesce(v_admin, false) or v_rol <> 'alumno' then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'equipo', 'exigido', v_exigido);
  end if;
  select ca.cuenta_id into v_cuenta from public.cuenta_cobro_alumnos ca where ca.alumno_id = auth.uid();
  if v_cuenta is not null then
    v_est := interno.cuenta_cobro_estado(v_cuenta);
    -- Sin apagar: nada que mostrarle (ver la cabecera).
    if v_est->>'estado' <> 'apagado' then
      return jsonb_build_object('vigente', v_vigente, 'motivo', 'cobro', 'exigido', v_exigido,
        'avisar_en_panel', false);
    end if;
    select * into v_c from public.cuentas_cobro where id = v_cuenta;
    select * into v_aj from public.cobros_ajustes where id;
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'cobro', 'exigido', v_exigido,
      'estado', v_est->>'estado', 'hasta', v_est->>'activo_hasta', 'dias', (v_est->>'dias')::int,
      'apaga_el', v_est->>'apaga_el', 'apagada_a_mano', (v_est->>'apagada_a_mano')::boolean,
      'monto', v_c.monto, 'moneda', v_c.moneda,
      'sinpe_numero', v_aj.sinpe_numero, 'sinpe_nombre', v_aj.sinpe_nombre,
      'avisar_en_panel', false,
      'reporte_pendiente', exists (select 1 from public.pagos_reportados r
                                    where r.cuenta_id = v_cuenta and r.estado = 'pendiente'));
  end if;
  select p.vigente_hasta, p.nombre into v_hasta, v_nombre
    from public.paquete_alumnos pa join public.paquetes_acceso p on p.id = pa.paquete_id
   where pa.alumno_id = auth.uid() and p.vigente_desde <= v_hoy
   order by p.vigente_hasta desc limit 1;
  if v_hasta is not null and v_hasta >= v_hoy then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'paquete', 'exigido', v_exigido,
      'hasta', v_hasta, 'dias', v_hasta - v_hoy, 'paquete', v_nombre);
  end if;
  select t.vence, t.detalle into v_temporal, v_detalle from public.cuentas_temporales t where t.persona_id = auth.uid();
  if v_temporal is not null then
    return jsonb_build_object('vigente', v_vigente,
      'motivo', case when v_temporal > now() then 'temporal' else 'temporal_vencida' end,
      'exigido', v_exigido, 'vence', v_temporal, 'detalle', v_detalle,
      'dias', greatest(0, (v_temporal at time zone 'America/Costa_Rica')::date - v_hoy));
  end if;
  select g.vence, g.empieza, g.origen into v_prueba, v_empieza, v_origen from public.pruebas_gratis g where g.alumno_id = auth.uid();
  if v_prueba is not null then
    return jsonb_build_object('vigente', v_vigente,
      'motivo', case when v_prueba > now() then 'prueba' else 'prueba_vencida' end,
      'exigido', v_exigido, 'vence', v_prueba,
      'horas', greatest(0, ceil(extract(epoch from (v_prueba - now())) / 3600))::int,
      'origen', v_origen,
      'dias_total', round(extract(epoch from (v_prueba - v_empieza)) / 86400)::int);
  end if;
  return jsonb_build_object('vigente', v_vigente,
    'motivo', case when not v_exigido then 'sin_exigir' when v_hasta is null then 'sin_paquete' else 'vencido' end,
    'exigido', v_exigido, 'hasta', v_hasta, 'paquete', v_nombre);
end $function$;
