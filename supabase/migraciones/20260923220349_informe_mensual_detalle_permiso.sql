-- Las dos puertas del detalle mensual, con el permiso envuelto en coalesce.
-- Sin usuario (auth.uid() nulo) la condición daba NULL en vez de false y el
-- `if not (...)` no rechazaba: hoy solo llegan así la service role y el cron,
-- que igual podrían, pero un permiso que se abre por un NULL no puede quedar
-- escrito así.

create or replace function public.detalle_mensual_profesor(p_profesor uuid, p_periodo date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_profesor is null or p_periodo is null or not coalesce(
       p_profesor = auth.uid() or public.supervisado_por_mi(p_profesor) or public.soy_admin(), false) then
    raise exception 'No supervisas a esa persona.' using errcode = '42501';
  end if;
  return public.detalle_para_mi(p_profesor, public.detalle_mensual_crudo(p_profesor, p_periodo));
end;
$$;

create or replace function public.detalle_informe_mensual(p_informe uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' set row_security to off as $$
declare
  v public.informes_profesor;
  d jsonb;
begin
  select * into v from public.informes_profesor where id = p_informe;
  if not found or not coalesce(
       v.profesor_id = auth.uid()
       or public.soy_admin()
       or (v.estado = 'enviado' and public.supervisado_por_mi(v.profesor_id)), false) then
    raise exception 'Ese informe no está a tu cargo.' using errcode = '42501';
  end if;
  select detalle into d from public.informes_profesor_detalle where informe_id = p_informe;
  return public.detalle_para_mi(v.profesor_id, d);
end;
$$;
