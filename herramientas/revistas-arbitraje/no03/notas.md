# N.º 3 (julio de 2012): notas de la revisión

El PDF original es todo imagen (cada página en 8 teselas). Se recompusieron
las páginas completas en `img/pagNN.png` (las teselas sueltas también están en
`img/`) y se leyó el contenido de ahí.

## Artículos del original y qué se hizo

| Original | Edición actualizada |
|---|---|
| Editorial (Santiago García Ramos) | Conservada y condensada. Se quitaron la promoción de la revista impresa, un párrafo repetido dos veces y «¡Nos leemos en agosto!». |
| Trato con padres de ajedrecistas infantiles-juveniles (Paula Man Reich) | Conservado con su autora, corregido. Se añadió un bloque con las Leyes 2023: 11.2.3.3 (acceso al área de juego), 12.7 (espectadores; el árbitro puede expulsar), 12.2.3/12.2.4, 12.8 (celulares) y un aviso: las sanciones del 12.9 son para jugadores (si el niño recibió ayuda, art. 11.3.1). |
| Jugador virtual en desempate Buchholz | Rehecho («Por IA Oscar Angulo Cubero, a partir de…»): la fórmula de 2012 queda como historia (secciones 15.2 y 15.3 del reglamento anterior, vigente hasta el 31-ago-2023) y se explica el art. 16 del C.07 (2026) con cuatro ejemplos nuevos. |
| Ejercicio de práctica (torneo de 10 GM, 7 rondas) | Mismos emparejamientos y resultados, con jugadores ficticios y sin Elo. La solución está en el N.º 4 actualizado. |
| Posición muerta | Actualizado a los arts. 1.5, 5.2.2, 6.9 y A.5.3 (antes 5.2.b y 9.6 de las Leyes de 2009). Se mantienen los seis diagramas; se añaden la solución del ejercicio y el caso rey y caballo contra rey y caballo (anunciado en la portada del N.º 4 original). |
| Swiss Manager (parte 1) | Conservado lo general. Se quitaron precios (150 €, 75 €, gratuita hasta 60 jugadores/4 rondas), límites de jugadores y rondas, «Windows XP o superior» y el anuncio del curso. Se añadió qué comprobar en la versión del programa. |

## Fe de erratas

- Ejemplo 3 del Buchholz: «torneo a 7 rondas, después de la ronda 4 tiene 3,5
  puntos» y la cuenta usaba SPR = 3,5 **antes** de la ronda 4: imposible
  (máximo 3 puntos tras tres rondas).
- El orden de títulos del original (N.º 4) ponía WIM antes que FM; se corrige
  en el N.º 4 y en la ficha de Swiss-Manager.
- Elo inconsistente entre el N.º 3 y el N.º 4 (Karjakin 2779/2785, Kramnik
  2799/2797): se resolvió quitando el Elo y usando jugadores ficticios.

## Comprobaciones hechas

- Torneo del ejercicio: puntuaciones finales recalculadas con un script a partir
  de las 7 rondas; coinciden con la tabla final del original.
- Las seis posiciones muertas se comprobaron con chess.js recorriendo **todas**
  las posiciones alcanzables (búsqueda exhaustiva sin límite alcanzado): ningún
  mate. Las de peones y la de alfiles, con ambos turnos.
- Ejercicio de la torre: la serie 1.Td1 Rg6 2.Th1 Rf6 3.Th3 gxh3 4.g4 hxg4
  5.h5 Rf7 6.Rf2 Rf8 7.Rg3 Re8 8.Rh4 Rf8 9.Rg5 Re8 10.Rf6 Rf8 11.h6 Re8 12.h7 Rf8
  13.h8=D# se jugó con chess.js y termina en mate.
- Rey y caballo contra rey y caballo: `kn6/2N5/1K6/8/8/8/8/8 b` es mate según
  chess.js.
- Textos de la norma contrastados en handbook.fide.com: Leyes 2023 (E012023),
  C.07 2026 (TieBreakRegulations032026), reglamento anterior
  (TieBreakRegulationsPre2023), reglamento 2023 (TieBreakRegulations2023) y
  C.04.2 (GeneralHandlingRulesForSwissTournaments202602).

## Lo que no se pudo verificar

- **Fecha de entrada del jugador virtual (1-jul-2012, «Congreso de 2009»)** y la
  regla anterior («empate contra sí mismo»): se cuentan como lo dice el
  original, en tono histórico; no encontré el texto de 2009-2012 con fecha.
- **Diferencias entre el reglamento de 2023 y el de 2026 en el art. 16**: el de
  2023 ya tenía el rival ficticio («dummy» con la puntuación del propio jugador);
  no comparé si los topes del 16.4 son nuevos de 2026. El texto dice «desde el
  reglamento de 2023 … en el C.07 de 2026 la regla está en el art. 16», sin
  atribuir los topes a una versión.
- **Swiss-Manager en la lista de programas avalados**: la búsqueda mostró que el
  capítulo C.02.04 (aplicado desde el 1-mar-2026) lista Swiss-Manager para el
  sistema holandés, pero no pude leer la versión avalada. El texto remite a
  consultar la lista. Tampoco verifiqué los datos biográficos de Heinz Herzog
  (se atribuyen a «la edición original») ni si el programa ya implementa el
  art. 16 de 2026: se pide comprobarlo.
- **Autor del artículo de posición muerta**: el original no lo firma; se puso
  «Por la redacción de la edición original».
- El art. 12.1 como base para que el árbitro declare de oficio la posición
  muerta es una lectura razonable (5.2.2 + 12.1), no un texto literal.
- La nota del art. 11.3.1 en el artículo de padres («si el niño recibió ayuda,
  se analiza como infracción del jugador») es criterio arbitral, no una regla
  expresa sobre padres.

## Material para el Aula

`fichas.json`: 4 fichas (buchholz-rondas-no-jugadas, posicion-muerta,
padres-en-el-torneo, swiss-manager-configuracion), 25 preguntas (8, 7, 5 y 5)
y 2 casos de decisión (bandera-caballos, torre-y-cadena). Sin repeticiones.

## Para el generador

Las piezas blancas salen casi negras: con `-webkit-text-stroke: 1px` y la
sombra de `estilo.css`, a 19 pt, el rey y el peón de «Segoe UI Symbol» se
rellenan de negro. En `cuerpo.html` hay un `<style>` que lo arregla solo para
este número (trazo de 0,5 px, sin sombra); convendría corregirlo en
`estilo.css` para todos (el N.º 1 probablemente tiene el mismo problema).
