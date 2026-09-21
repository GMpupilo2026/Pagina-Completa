-- Postgres le da EXECUTE a PUBLIC en toda función nueva, y anon/authenticated
-- lo heredan de ahí. Revocárselo a los roles no sirve de nada mientras PUBLIC
-- lo tenga: hay que quitárselo a PUBLIC y después dar lo que de verdad hace
-- falta. (Es lo que el analizador de seguridad estaba marcando.)

-- El secreto de la tanda y el disparador: NADIE los llama desde el navegador.
-- Solo el cron (como postgres) y la Edge Function con la service role.
revoke all on function public.secreto_tanda_cobros()          from public, anon, authenticated;
revoke all on function public.disparar_recordatorios_cobro()  from public, anon, authenticated;

-- Emitir cobros sí lo llama la página, con el botón "Emitir los que falten",
-- pero solo con sesión iniciada: la propia función exige además coordinación.
revoke all on function public.generar_cobros(date) from public, anon;
grant execute on function public.generar_cobros(date) to authenticated;
