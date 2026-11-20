-- arbitrajes_publicos tenía una política que dejaba a anon INSERT directo
-- (with check: pg_column_size(detalle) < 60000). El envío real va por
-- registrar_arbitraje_publico(), que es SECURITY DEFINER, valida y pasa por el
-- freno (frenar_envio_publico). La política directa solo servía para saltarse
-- ese freno: meter filas de 59 KB sin tope. El navegador nunca inserta directo
-- (solo lee y administración actualiza), así que se quita sin romper nada.
drop policy if exists arbitrajes_publicos_insert on public.arbitrajes_publicos;
revoke insert on public.arbitrajes_publicos from anon, authenticated;
