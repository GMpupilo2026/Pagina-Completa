-- ============================================================================
-- Borrar un plan de cobro de verdad, no solo desactivarlo.
--
-- La tabla no se puede borrar desde la página: suscripciones.plan_id es
-- ON DELETE RESTRICT, y la RLS de suscripciones solo deja tocar las de la
-- gente bajo la coordinación de uno. Esta función lo hace de una vez y sin
-- dejar nada a medias: borra las suscripciones del plan y el plan.
--
-- Lo que NO borra son los cobros ya emitidos: son lo que pasó (el recibo con
-- su consecutivo y sus pagos). Se quedan con su concepto y su monto, y
-- cobros.suscripcion_id pasa a NULL solo (ON DELETE SET NULL). Si se pide
-- (p_anular_sin_pagos), los que todavía no tienen ningún pago se ANULAN con
-- su motivo — anular, no borrar: el consecutivo ya se usó.
--
-- Permiso: el mismo de escribir planes (coordinador_puede('cobros') y el plan
-- es de alguien bajo mi coordinación), y además toda la gente en el plan tiene
-- que estar bajo mi coordinación: si no, se niega entero en vez de borrarle a
-- otra coordinación suscripciones que no ve.
-- ============================================================================
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
