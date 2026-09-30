create or replace function public.eliminar_plan_cobro(p_plan uuid, p_anular_sin_pagos boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.planes_cobro%rowtype;
  v_ajenas integer;
  v_anulados integer := 0;
  v_suscripciones integer := 0;
begin
  select * into v_plan from public.planes_cobro where id = p_plan for update;
  if not found then
    raise exception 'Ese plan ya no existe';
  end if;
  if not coalesce(public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(v_plan.creado_por), false) then
    raise exception 'Solo quien coordina los cobros de este plan puede borrarlo';
  end if;

  select count(*) into v_ajenas
    from public.suscripciones s
   where s.plan_id = p_plan and not coalesce(public.bajo_mi_coordinacion(s.student_id), false);
  if v_ajenas > 0 then
    raise exception 'Este plan tiene % alumno(s) de otra coordinación: no se puede borrar desde acá', v_ajenas;
  end if;

  if p_anular_sin_pagos then
    update public.cobros c
       set estado = 'anulado',
           anulado_motivo = left('Se borró el plan «' || v_plan.nombre || '»', 300)
     where c.suscripcion_id in (select s.id from public.suscripciones s where s.plan_id = p_plan)
       and c.estado = 'emitido'
       and not exists (select 1 from public.pagos p where p.cobro_id = c.id);
    get diagnostics v_anulados = row_count;
  end if;

  delete from public.suscripciones where plan_id = p_plan;
  get diagnostics v_suscripciones = row_count;
  delete from public.planes_cobro where id = p_plan;

  return jsonb_build_object('suscripciones', v_suscripciones, 'anulados', v_anulados);
end;
$$;

revoke execute on function public.eliminar_plan_cobro(uuid, boolean) from public, anon;
grant execute on function public.eliminar_plan_cobro(uuid, boolean) to authenticated;