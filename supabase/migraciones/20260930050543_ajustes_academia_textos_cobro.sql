-- Los textos del correo de cobro los escribe quien coordina.
--
-- El asunto y el mensaje de cada uno de los tres avisos (próximo, vencido,
-- moroso) y el «Cómo pagar» se guardan en ajustes_academia, como los días de
-- cada aviso: claves `cobros_asunto_<tipo>`, `cobros_mensaje_<tipo>` y
-- `cobros_como_pagar`. Los lee la Edge Function cobros-recordatorios; lo que
-- está vacío sale con el texto de fábrica.
--
-- El tope de 300 caracteres de la tabla alcanzaba para un número de WhatsApp,
-- no para un párrafo con la cuenta bancaria y el SINPE Móvil. Se sube a 1000,
-- lo mismo que dejan escribir las casillas de cobros.html.
alter table public.ajustes_academia drop constraint if exists ajustes_academia_valor_corto;
alter table public.ajustes_academia add constraint ajustes_academia_valor_corto
  check (valor is null or length(valor) <= 1000);