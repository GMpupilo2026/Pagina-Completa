-- Arreglo de 20261111224043_mesa_arbitro_ilegales.sql: la política de insert
-- miraba la MISMA tabla (arbitro_bitacora) en su subconsulta, y Postgres la rechaza
-- con «infinite recursion detected in policy» (42P17) en CUALQUIER insert, también en
-- los resultados de siempre. Se comprobó impersonando una cuenta con licencia, el
-- 11/11/2026, apenas aplicada la migración anterior.
--
-- La comprobación de la anulación pasa a una función SECURITY DEFINER (no vuelve a
-- pasar por la RLS de la tabla): la anulada tiene que ser de quien llama, una ilegal
-- o irregularidad, de la misma partida (tnr, ronda, mesa) y del mismo jugador (color).
-- La política la llama solo cuando la fila trae `anula`.

create or replace function interno.arbitro_puede_anular(p_anula uuid, p_tnr text, p_ronda integer, p_mesa integer, p_color text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.arbitro_bitacora b
     where b.id = p_anula
       and b.creada_por = (select auth.uid())
       and b.tipo in ('ilegal', 'irregularidad')
       and b.tnr = p_tnr
       and b.ronda is not distinct from p_ronda
       and b.mesa is not distinct from p_mesa
       and b.color is not distinct from p_color);
$function$;
revoke execute on function interno.arbitro_puede_anular(uuid, text, integer, integer, text) from public, anon;
grant execute on function interno.arbitro_puede_anular(uuid, text, integer, integer, text) to authenticated;
comment on function interno.arbitro_puede_anular(uuid, text, integer, integer, text) is
  'Mesa del árbitro: si quien llama puede anular esa línea de su bitácora (ilegal o irregularidad propia, de la misma partida y jugador). La usa la política arbitro_bitacora_anotar; es SECURITY DEFINER para no recursar en la RLS de la misma tabla.';

drop policy arbitro_bitacora_anotar on public.arbitro_bitacora;
create policy arbitro_bitacora_anotar on public.arbitro_bitacora
  for insert to authenticated
  with check (
    creada_por = (select auth.uid())
    and (select public.tengo_herramienta('mesa-arbitro'))
    and (anula is null
         or (tipo = 'anulacion' and interno.arbitro_puede_anular(anula, tnr, ronda, mesa, color)))
  );
