-- clase_elegidos.origen: además de 'azar' (el sorteo) y 'mano' (le dio la
-- palabra a quien la levantó), 'profe': el profe lo eligió a propósito, desde
-- el aviso de quién lleva un rato sin contestar (js/clase-callados.js). Sin
-- este valor, ese turno habría quedado registrado como un sorteo que no fue.
alter table public.clase_elegidos drop constraint if exists clase_elegidos_origen_check;
alter table public.clase_elegidos add constraint clase_elegidos_origen_check check (origen in ('azar', 'mano', 'profe'));
