-- Diez bromas nuevas para la tienda de puntos, grandes y de pantalla entera.
-- Ver «Las bromas grandes» en docs/decisiones/puntos-y-premios.md.
--
-- Todas son de una vez (como el confeti y el globo): salen la próxima vez que
-- quien la recibe entra a su panel, duran unos 12 segundos, dicen quién la
-- mandó y se marcan vistas. Por eso mis_bromas() no cambia: ya devuelve toda
-- broma sin ver que no sea de duración. Tienen una semana para verse.
--
-- Cuestan más que las cinco primeras (80 a 150, cuando el entrenamiento paga
-- a lo sumo 40 por día): hay que hacer ejercicios varios días para mandarlas.
-- Las reglas de quién puede recibir qué siguen en mandar_broma(), sin tocar.

alter table public.bromas drop constraint bromas_tipo_check;
alter table public.bromas add constraint bromas_tipo_check check (tipo in (
  'payaso', 'patito', 'arcoiris', 'confeti', 'globo',
  'gallinas', 'papel', 'meteorito', 'payaso_gigante', 'pato_invasor',
  'gato', 'quesos', 'platanazo', 'ovni', 'sandia'));

insert into public.premios_catalogo (clave, nombre, descripcion, emoji, categoria, tipo_efecto, costo_puntos, parametros, limite_por_alumno, orden) values
  ('broma_gallinas', '¡Invasión de gallinas!', 'La próxima vez que entra a su panel, unas gallinas corren por toda su pantalla con tu nombre.', '🐔', 'broma', 'broma', 80, '{"tipo":"gallinas","horas":168}'::jsonb, null, 350),
  ('broma_papel', 'Pantalla empapelada', 'Un rollo de papel higiénico cruza su pantalla y la cubre de papel (de mentiras).', '🧻', 'broma', 'broma', 90, '{"tipo":"papel","horas":168}'::jsonb, null, 360),
  ('broma_quesos', '¡Lluvia de quesos!', 'Le caen quesos del cielo que rebotan por toda la pantalla, con tu nombre.', '🧀', 'broma', 'broma', 90, '{"tipo":"quesos","horas":168}'::jsonb, null, 370),
  ('broma_platanazo', '¡Platanazo!', 'Un banano gigante atraviesa su pantalla y le deja: «¡Te la hizo…» con tu nombre.', '🍌', 'broma', 'broma', 100, '{"tipo":"platanazo","horas":168}'::jsonb, null, 380),
  ('broma_pato_invasor', 'Pato invasor', 'Un pato gigante atraviesa su pantalla haciendo «¡CUAC CUAC!».', '🦆', 'broma', 'broma', 100, '{"tipo":"pato_invasor","horas":168}'::jsonb, null, 390),
  ('broma_gato', '¡Gato descontrolado!', 'Un gato corre de lado a lado por su pantalla, tira cosas imaginarias y desaparece.', '🐈', 'broma', 'broma', 100, '{"tipo":"gato","horas":168}'::jsonb, null, 400),
  ('broma_sandia', '¡Sandía explosiva!', 'Una sandía cae en su pantalla y explota en una lluvia de semillas y trocitos.', '🍉', 'broma', 'broma', 110, '{"tipo":"sandia","horas":168}'::jsonb, null, 410),
  ('broma_meteorito', 'Meteorito troll', 'Un meteorito cae sobre su pantalla y le deja: «Ataque patrocinado por…» con tu nombre.', '☄️', 'broma', 'broma', 120, '{"tipo":"meteorito","horas":168}'::jsonb, null, 420),
  ('broma_ovni', '¡Abducción alienígena!', 'Un ovni aparece, lanza un rayo de luz y se lleva a un muñequito de su pantalla.', '🛸', 'broma', 'broma', 130, '{"tipo":"ovni","horas":168}'::jsonb, null, 430),
  ('broma_payaso_gigante', 'Llegó el payaso', 'Una cara de payaso gigante con música graciosa: «… dice que hoy estás haciendo payasadas».', '🤡', 'broma', 'broma', 150, '{"tipo":"payaso_gigante","horas":168}'::jsonb, null, 440)
on conflict (clave) do nothing;
