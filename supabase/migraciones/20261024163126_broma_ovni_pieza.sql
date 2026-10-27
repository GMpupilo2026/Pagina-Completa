-- El ovni ya no se lleva un muñequito del panel: se lleva una pieza de verdad
-- del tablero de Entrenamiento y la esconde un minuto (hay que acordarse de
-- cuál era). Lo pidió el dueño del sitio. Solo cambia lo que dice la tienda;
-- lo hace js/bromas.js. Ver «Las bromas grandes» en
-- docs/decisiones/puntos-y-premios.md.
update public.premios_catalogo
   set descripcion = 'La próxima vez que entra a Entrenamiento, un ovni se lleva una pieza de su tablero: tiene que acordarse de cuál era, y en un minuto se la devuelve.'
 where clave = 'broma_ovni';
