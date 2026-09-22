-- Los tres avisos automáticos de morosidad salían con días fijos, escritos
-- como constantes dentro de la Edge Function cobros-recordatorios. Ahora se
-- pueden cambiar desde la ficha "Morosidad" de cobros.html; la función los lee
-- de estas tres filas y si no las encuentra usa el mismo valor de siempre (3,
-- 1, 15). Se siembran para que la página tenga algo que mostrar desde el
-- primer momento, sin esperar a que alguien las guarde.
insert into public.ajustes_academia (clave, valor)
values ('cobros_dias_antes', '3'),
       ('cobros_dias_vencido', '1'),
       ('cobros_dias_moroso', '15')
on conflict (clave) do nothing;