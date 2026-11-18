-- «Registra y listo»: el recibo de un pago de una cuenta (cobros, versión 2)
-- sale en el momento, sin pasar por la revisión de quien supervisa. Lo decidió
-- el dueño el 17/11/2026. Quien registra el pago lo manda por WhatsApp desde
-- mensualidades.html y el recibo queda entregado («whatsapp»), así no se
-- amontona en «Recibos por revisar y entregar» de quien supervisa. Quien
-- supervisa sigue pudiendo corregirlo o anularlo después, como siempre.
--
-- Solo para recibos de cuentas (cobros con cuenta_id): los de los planes viejos
-- siguen con su revisión (recibo_entregado_en_mano / recibo_enviar).
alter table public.recibos drop constraint recibos_entrega_check;
alter table public.recibos add constraint recibos_entrega_check
  check (entrega = any (array['correo'::text, 'mano'::text, 'whatsapp'::text]));

create or replace function public.recibo_por_whatsapp(p_recibo uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v public.recibos;
begin
  select * into v from public.recibos where id = p_recibo;
  if not found then raise exception 'Ese recibo no existe.' using errcode = 'P0002'; end if;
  if not coalesce(public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(v.student_id), false) then
    raise exception 'Ese recibo no es de tu coordinación.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pagos p join public.cobros k on k.id = p.cobro_id
                  where p.recibo_id = p_recibo and k.cuenta_id is not null) then
    raise exception 'Ese recibo es de un plan viejo: lo entrega quien supervisa.' using errcode = '22023';
  end if;
  if v.estado = 'anulado' then
    raise exception 'Ese recibo está anulado: no se entrega.' using errcode = '22023';
  end if;
  update public.recibos set entrega = coalesce(entrega, 'whatsapp') where id = p_recibo;
end;
$$;
revoke execute on function public.recibo_por_whatsapp(uuid) from public, anon;
grant execute on function public.recibo_por_whatsapp(uuid) to authenticated;
