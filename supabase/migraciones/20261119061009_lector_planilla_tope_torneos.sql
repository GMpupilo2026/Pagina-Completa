-- El tope del lector de planilla, para un torneo grande (lo pidió el dueño el
-- 18/11/2026: un torneo de unas 500 partidas el domingo, con las fotos leídas
-- por varios árbitros con «📷 Planilla» de Pareo Integral).
--   · en total: de 500 a 2000 fotos al día. Con 500 no alcanzaba ni para una
--     foto por partida y volver a tomar las malas. 2000 fotos de Google Vision
--     cuestan unos 3 dólares: sigue siendo el techo contra quien reparta el
--     gasto entre muchas cuentas.
--   · por persona: 30 sigue siendo el de cualquier cuenta, pero quien tiene la
--     licencia de Pareo Integral o de la Mesa del árbitro (las que un
--     organizador les da a sus árbitros, ver «Las cuentas de árbitro») llega a
--     250: una ronda entera de un torneo grande. Lo dice tengo_herramienta(),
--     que ya sabe de licencias dadas, vencidas y anuladas. Quien administra
--     sigue sin tope personal.
-- El resto queda igual: el upsert solo suma si no llegó al tope, así que dos
-- fotos a la vez no se cuelan.

create or replace function public.lector_planilla_gastar()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := (select auth.uid());
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_admin boolean;
  v_usos integer;
  v_tope_persona integer := 30;
  tope_torneo constant integer := 250;
  tope_total constant integer := 2000;
begin
  if v_yo is null then
    return 'Hace falta iniciar sesión para usar el lector de planilla.';
  end if;
  v_admin := coalesce((select is_admin from public.profiles where id = v_yo), false);
  if coalesce(public.tengo_herramienta('pareo') or public.tengo_herramienta('mesa-arbitro'), false) then
    v_tope_persona := tope_torneo;
  end if;

  if coalesce((select sum(usos) from interno.lector_planilla_uso where dia = v_hoy), 0) >= tope_total then
    return 'El lector de planilla llegó a su tope de hoy. Vuelve a intentarlo mañana.';
  end if;

  insert into interno.lector_planilla_uso as u (persona, dia, usos)
  values (v_yo, v_hoy, 1)
  on conflict (persona, dia) do update set usos = u.usos + 1
    where u.usos < v_tope_persona or v_admin
  returning u.usos into v_usos;

  if v_usos is null then
    return 'Ya leíste ' || v_tope_persona || ' planillas hoy, que es el máximo por día. Mañana puedes seguir.';
  end if;
  return null;
end;
$$;

revoke execute on function public.lector_planilla_gastar() from public, anon;
grant execute on function public.lector_planilla_gastar() to authenticated;
