-- Las dos funciones de disparador no tienen nada que hacer en la API: las
-- llama el trigger, nunca una persona. Llamarlas por /rpc/ daría error igual
-- (plpgsql no deja ejecutar una función de trigger a mano), pero una puerta
-- que no lleva a ninguna parte igual se cierra.
--
-- Se revoca de PUBLIC además de anon y authenticated: Postgres le da el
-- execute a PUBLIC por omisión, así que revocarlo solo de los dos roles no
-- hace absolutamente nada. Es la misma piedra de generar_cobros().
revoke all on function public.avisar_clase_abierta() from public, anon, authenticated;
revoke all on function public.avisar_desafio() from public, anon, authenticated;