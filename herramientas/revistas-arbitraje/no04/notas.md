# N.º 4 (agosto de 2012): notas de la revisión

## Artículos del original y qué se hizo

| Original | Edición actualizada |
|---|---|
| Editorial (Santiago García Ramos) | Conservada y condensada; sin «¡Nos leemos en septiembre!», sin la invitación a colaborar ni el aviso del Manual del Organizador de la FIDE (1-ago-2012) y del N.º 5. |
| Cómo puede el árbitro ayudar a superar el estrés (Paula Man Reich) | Conservado con su autora, corregido. Se añadieron los límites de las Leyes 2023: 11.3.1 (consejos), 12.2.3/12.2.4/12.2.6 y 11.2.3.2 (salir del área de juego), y el aviso de que el reloj sigue corriendo. |
| Desempate Buchholz con jugador virtual (segunda parte) | Rehecho: solución del ejercicio del N.º 3 con el art. 16 del C.07 (2026), detalle por jugador, clasificación, comparación con lo publicado en 2012 y un apartado nuevo de BH-C1 con la excepción del art. 16.5. |
| Sistema de competencia Wimbledon | Conservado con su autor. Se corrigió el orden de títulos, se añadió el art. 3.1 del C.07 (play-off) y la advertencia de que el Armagedón no está regulado. Se publican las soluciones de los dos ejercicios (32 y 23 jugadores). Se quitaron los cuadros «simulados» con resultados inventados de jugadores reales. |

## Cambios principales frente a la normativa vigente

- Buchholz: jugador virtual (fórmula 2012, sección 15.2, vigente hasta el
  31-ago-2023) → rival ficticio del art. 16.4 del C.07 (2026), con tope; las
  incomparecencias de los rivales cuentan con el resultado asignado (16.3.1),
  ya no como tablas.
- Cut-1 con VUR: art. 16.5.1.
- Historial en el suizo: C.04.2 (2026), arts. 3.4 (colores, solo partidas
  jugadas) y 3.5 (pueden volver a emparejarse).
- Orden de títulos: C.04.2 (2026), art. 2.2.2 (GM, IM, WGM, FM, WIM, CM, WFM,
  WCM); el original ponía WIM antes que FM.
- Play-off: C.07 (2026), art. 3.1.

## Fe de erratas

- **El cálculo de 2012 no aplicó su propia regla**: la sección 15.3 del
  reglamento de entonces mandaba contar como tablas las incomparecencias de los
  rivales; el artículo sumó sus puntuaciones reales. Recalculado: Ibarra
  (Ivanchuk) 24½ y Carvajal (Karjakin) 23½, así que en 2012 el 2.º y el 3.º
  lugar estaban invertidos. (Los valores publicados sí cuadran con la fórmula
  del jugador virtual aplicada sin la 15.3; los verifiqué uno por uno).
- En el historial de Aronian aparecía dos veces «Ronda 2» (una línea sobrante,
  no sumada).
- Orden de títulos WIM/FM.

## Resultados (recalculados con script)

BH (C.07 2026): Morales 24½; Carvajal 24½, Ibarra 24; Guzmán 26½, Arce 23,
Kramer 22½; Carmona 25, Rojas 24; Andrade 21½; Navarro 24½. El orden final
coincide con el publicado en 2012. BH-C1: Carvajal 21 e Ibarra 22 (Ibarra
pasaría al 2.º puesto).

Cuadros: el método (zigzag + «U») reproduce el cuadro clásico; sumas de rating
del ejemplo de 16 (22 191 y 22 187) coinciden con el original. Soluciones
nuevas: 32 jugadores (4 grupos, 16 matches) y 23 jugadores (9 pasan
directamente, 7 matches), ordenados por rating, título y orden alfabético.

## Lo que no se pudo verificar

- **Datos de la lista FIDE de 2012** (ratings de los 16, 13, 32 y 23
  jugadores): se copiaron del original como dato histórico, sin contrastarlos
  con la lista de julio/agosto de 2012.
- **Experiencias en México** (Campeonato Nacional Absoluto en los noventa,
  Torneo «Carlos Torre Repetto»): relato del autor, sin verificar.
- **El nombre «sistema Belgrado»** para el reparto en zigzag es del autor; no
  encontré esa denominación en el Handbook. El texto lo presenta como «el autor
  lo llama».
- **Armagedón**: comprobé que no aparece en las Leyes 2023 ni en el C.07
  (2026). «Normalmente ganan las negras con tablas» es práctica habitual, no
  norma.
- Aplicar el orden de títulos de la C.04.2 (que es para el suizo) a la siembra
  de un cuadro de eliminación es una recomendación, no una norma expresa; el
  texto lo dice.
- Las fechas del reglamento de 2023 (aprobado el 1-ago-2023; aplicado desde el
  1-sep-2023 en eventos FIDE y desde el 1-abr-2024 en todos) se tomaron del
  propio capítulo del Handbook; se usan en el N.º 3.

## Material para el Aula

`fichas.json`: 3 fichas (buchholz-cortes-vur, eliminacion-directa,
estres-y-arbitro), 19 preguntas (7, 7 y 5) y 1 caso de decisión
(ko-armagedon-sin-bases). Sin repeticiones.

## Para el generador

Este número no tiene diagramas, pero `cuerpo.html` lleva el mismo `<style>`
que el N.º 3 para las piezas blancas (ver notas del N.º 3).
