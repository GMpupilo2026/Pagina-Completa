# N.º 14 (julio de 2013) — notas para Oscar

Fecha original: no viene impresa; se tomó de la fecha de creación del PDF (4-jul-2013), coherente con el comunicado de la FIDE del 25-jun-2013 que cita.

## Artículos y qué se hizo

1. **Editorial** (Santiago): se conserva como presentación, corregida («nuestra colaborador» → colaboradora).
2. **Fatiga mental** (Paula Man Reich): se conserva el test de 10 preguntas con sus resultados, corregido y pasado de usted a tú. El primer tramo de resultados decía «de 1 a 4»; se puso «de 0 a 4» para cubrir el cero. Se añade una línea: el test no es un diagnóstico.
3. **Antidopaje**: rehecho (firmado por ti) con la **Lista Prohibida 2026** de la AMA (en vigor desde el 1-ene-2026) y el **Programa de Seguimiento 2026**, ambos leídos en la fuente. Anfetaminas y modafinilo en S6.A; metilfenidato en S6.B; efedrina y metilefedrina > 10 µg/mL; seudoefedrina > 150 µg/mL; catina > 5 µg/mL; tramadol en S7. Cafeína y codeína: no prohibidas, en el Programa de Seguimiento (en competición). Fe de erratas: el cuadro de 2013 mezclaba los umbrales; se quitó el dato de «400 miligramos» (sin fuente). Se añadió la autorización de uso terapéutico.
4. **Curso de sistema suizo, 5.ª parte** (Santiago, revisado) con el C.04.3 aplicado desde el 1-feb-2026: arts. 1.6, 1.7.1-1.7.4, 1.8, [C3], [C10]-[C13] y art. 5 (asignación de colores); C.04.1 arts. 6-8; C.04.2 art. 3.4 (solo cuentan las partidas jugadas). Todos los ejemplos se recalcularon por programa. Fe de erratas: NBN-BN → fuerte a **blancas**; NNB-NB → 2(B) − 3(N); NB- → leve a **negras**; «menor a +1» → mayor que +1. Un ejemplo venía ilegible en el texto extraído («NNBN = 4(B)–2(N)»): se sustituyó por BBNBNB. Se quitaron las reglas especiales de ronda impar, ronda par y primeras rondas (no están en el C.04.3 vigente). Se añadió una tabla de asignación de colores con un ejemplo por regla.
5. **¿Son tablas?** (Santiago, revisado): arts. 5.2.2, 6.9, 9.2, 9.3 y 9.6 de las Leyes 2023; el antiguo 10.2 es hoy la Directriz III.5 (solo sin incremento, si se anunció, no en relámpago: III.2), con III.4. Comprobado con chess.js:
   - Las dos posiciones de cadenas de peones son posiciones muertas (búsqueda exhaustiva: 800 y 74 880 posiciones alcanzables, sin capturas, jugadas de peón ni mates).
   - Ejercicio 2: las líneas del original terminaban al coronar; se completaron hasta el mate (blancas: … 6.c8D Rf7 7.Dxf5+ Rg7 8.Dd7+ Rg6 9.De8+ Rf5 10.Df7#; negras, renumerada: 1…Rg6 2.Td3 cxd3 3.Rg2 d2 4.Rf2 d1D 5.c4 Dh1 6.Re2 Dg1 7.Rd2 Df1 8.Rc3 Dc1#).
   - Alfiles de distinto color, alfil contra caballo (las dos líneas): legales y terminan en mate tal como se publicaron.
   - Caballo contra caballo: la línea original empezaba con 1.Rd3, imposible con el rey en b1; se corrigió a 1.Rc2 Cg5 2.Rd3 Ce6 3.Re4… 14.Cg6# (comprobada).
   - Los diagramas compuestos del original (cuatro patrones de mate en un solo tablero) no son posiciones legales; se reemplazaron por las posiciones finales de mate de cada línea.
   - En el PDF original, la imagen del «segundo ejemplo» (pág. 23) está repetida (es la misma del ejercicio 1); se usó la posición de la pág. 27, que el propio texto llama «segundo ejemplo».

## Fichas para el Aula
5 fichas, 36 preguntas, 2 casos (sin reloj), 0 repeticiones.
Ids: `preferencia-color` (9), `posicion-muerta` (8), `reclamo-tablas` (7), `antidopaje-2026` (7), `fatiga-mental` (5). Casos: `bandera-caballos`, `cadena-bloqueada`.

## Lo que no pude verificar
- **Reglas Antidopaje de la FIDE**: el capítulo B.12 del Handbook es solo un índice de PDF; no leí el texto vigente. Que se basan en el Código Mundial Antidopaje y rigen desde el 1-ene-2021 viene de med.fide.com vía buscador, no de la lectura directa. El procedimiento concreto de la AUT ante la Comisión Médica no se leyó.
- **Posición muerta con alfiles del mismo color** (rey y alfil contra rey y alfil): no se pudo comprobar por búsqueda exhaustiva (demasiadas posiciones para chess.js); se afirma por el resultado conocido de que con todos los alfiles en casillas del mismo color no existe posición de mate.
- **Directrices III y art. 9.6**: verificados con un resumen del texto del Handbook (numeración y contenido), no con la cita literal completa de III.4-III.6.
- **Que el árbitro no debe explicar la posición durante la partida**: es práctica arbitral (no dar ayuda a un jugador), no un artículo concreto citado.
- **Que las tablas automáticas del art. 9.6 existen desde 2014**: de memoria.
