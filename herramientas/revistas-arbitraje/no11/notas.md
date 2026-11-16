# N.º 11 — notas para Oscar

Fecha original: «abril de 2013», tomada de la fecha de creación del PDF original
(1-abr-2013); la revista no trae fecha impresa. El editorial habla de «11 meses»,
coherente con un inicio en junio de 2012.

## Artículos

1. **Editorial** (Santiago García Ramos) — condensado. Se añadió una nota: las
   Leyes que esperaba para el 1-jul-2013 se aplicaron desde el 1-jul-2014.
2. **Calentamiento mental** (Paula Man Reich) — corregido de ortografía y estilo,
   pasado a tuteo; las frases sueltas se ordenaron en una tabla. Incluye el
   párrafo de «ideas irracionales» (pág. 7 del original), que parece de otro
   artículo de la serie pero se conservó.
3. **Árbitros cibernéticos** (Santiago) — actualizado a Leyes 2023 (6.1, 6.3.1,
   6.4, 6.9, A.5.3, A.5.5) y al Reglamento FIDE de Ajedrez en Línea (4.3, 15.4).
4. **Curso de sistema suizo, 3.ª parte** (Santiago) — reescrito sobre el C.04.3
   (2026) y C.04.1 (2026).
5. **Round robin** (Santiago) — fórmulas corregidas, normativa C.05 añadida,
   tablas regeneradas.

## Posiciones (comprobadas con chess.js 0.10.3)

Reconstruidas de los diagramas del PDF (imágenes p9_3/p9_4, p13–p20):
- Buho21: `8/5n2/8/8/7R/7K/5k2/5N1R w - - 0 1`; 1.Th2+ Rf3 2.Cg3 Cg5# → mate.
- ICC: `8/3N4/1k1K4/p7/2r5/8/1b6/2n5 b - - 0 1`; 1…Rb5 2.Rd5 Ra4 3.Rxc4 Aa3 4.Cb6# → mate.
- Pregunta de rápidas: rey y caballo contra rey y torre, mate en `kr6/2N5/1K6/8/8/8/8/8 b` (comprobado).
  La primera redacción usaba rey y alfil; la cambié porque una búsqueda no
  encontró rápidamente un mate de R+A contra R+T (la torre siempre puede
  interponerse o capturar) y no quise afirmar algo sin comprobar.

## Fe de erratas encontradas

- Conclusión del ICC al revés («era empate» → ganan las blancas) y pies de
  diagrama (Rb6 → Rb5; rey y caballo que actúan son blancos).
- Mesa 7 «0–½» y grupos 5-5-6 imposibles → ½–½, grupos 5-6-5.
- Definiciones de flotación al revés; «la manzana sube» → la pera.
- Eliminación directa con 20: 6 rondas → 5.
- Round robin con 19: 162 partidas → 171.
- Regla «heterogéneo con la mitad de grupos superiores = homogéneo»: ya no existe.

## Cálculos

- Tablas Berger generadas con el método del artículo (script) e idénticas a las
  del Anexo 1 de C.05 para 4 a 16 jugadores; propiedades de comprobación
  verificadas para 4 a 20. Solo se publican de 3 a 12 (la de 13/14 del original
  estaba ilegible en la extracción).
- Emparejamiento del grupo de 1 punto con el Sistema Holandés (1–14, 11–12; baja
  el 16) hecho a mano con C1–C21 y el orden de transposiciones. No lo pasé por
  un programa de emparejamiento (no tengo uno a mano). Conviene comprobarlo con
  Vega/JaVaFo o similar. Solo emparejé el grupo de 1 punto, no la ronda entera.

## Lo que no pude verificar

- Fecha de aprobación del Reglamento FIDE de Ajedrez en Línea (E.04): el Handbook
  no la muestra en la página; se cita «en la versión publicada en el Handbook».
- Que el Torneo de Candidatos 2026 fuera a doble vuelta con 8 jugadores: lo dejé
  como «en sus últimas ediciones», sin dar año.
- La etimología «ruban» de round robin: se dejó con «se suele decir… su origen
  no es seguro».
- Si el error del servidor ICC «ya fue solucionado»: no se afirma.
- Los programas de emparejamiento: cito la lista C.02.04 sin nombrar programas
  concretos (la lista que vi incluye Vega, SwissSys y otros; no confirmé si
  Swiss-Manager figura en ella).

## Quitado

- Los nombres de servidores y direcciones web de 2012 (chessclub.com,
  buho21.com) como enlaces; se mencionan solo los nombres.
- Las tablas de 13 a 20 jugadores (se remite al Anexo 1 o al método).
- El correo electrónico de la autora del artículo de psicología.
