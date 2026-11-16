# N.º 16 — notas de la revisión (para Oscar)

## Qué traía el original (48 páginas, PDF de enero de 2014)

1. Editorial (Santiago García Ramos).
2. «Manual de Eventos FIDE 2014» (pp. 4-31): comentario del autor sobre patrocinio y, sobre
   todo, la traducción del *Identity Manual & Sponsorship Guidelines* de la Comisión de
   Eventos (septiembre de 2013): historia y perfil de la FIDE, especificaciones del logotipo,
   formatos, bandera, plano de sala, niveles de patrocinio y lista de la comisión.
3. «¿Qué es el rating performance?» (pp. 32-44): tabla dp, ejercicio resuelto con ocho GM
   reales y un «ejercicio en casa».
4. «Torre de cabeza, ¿jugada ilegal o no?» (pp. 45-48).

## Qué se hizo

- **Editorial**: conservada y condensada; se quitaron el correo y la fecha de la siguiente
  revista. Se dejó la firma original («Conductor Master de Arbitraje FIDE») con una nota que
  explica que hoy se dice *FIDE Lecturer*.
- **Manual de eventos**: el manual de 2013 se presenta como documento histórico (se resume
  su índice y los niveles de patrocinio; no se reproducen las especificaciones de logotipo,
  colores, tamaños ni la lista de la comisión de 2013). Se conservan los consejos de Santiago
  («no pidas: invita», el proyecto, el apoyo en especie). Se corrigió el presupuesto.
- **Rating performance**: actualizado al Reglamento de Títulos vigente desde el 1-ene-2024
  (1.4.1, 1.4.6-1.4.9) y al C.07 (2026, art. 10.2, TPR). Jugadores reales sustituidos por
  ficticios con los mismos ratings y resultados. Todo recalculado con un programa
  (Python, fracciones exactas): simetría de los cuadros (28 puntos cada uno), sumas,
  promedios, p, dp y Rp. Se publica la solución del ejercicio en casa.
- **Torre de cabeza**: se conserva el razonamiento del autor y se añade cómo se resuelve
  hoy (Manual del Árbitro 2026: es torre; diagonal = ilegal; el árbitro corrige). Se añaden
  4.4.4, 6.11.2, 7.4 (pieza acostada = desplazada, según el glosario) y 7.5.2.

## Fe de erratas y cambios (todo en `cambios`)

- Rp del primer lugar: 2495 → **2945**; del segundo: 2448 → **2848**; último: el texto decía
  «2800 + −50» y el dp correcto es **−102** (el resultado 2698 sí estaba bien). Errores de
  copia en las listas de rivales (2788 por 2777, 1783 por 2783); las sumas sí eran correctas.
- Presupuesto: 100 sillas para 200 niños → 204 sillas; 370 → 474 USD por día; 740 → 948 en
  total.
- 178 federaciones → «más de 200» hoy.
- Solución del ejercicio en casa (nueva): 2853, 2799, 2746, 2746, 2696, 2594, 2595, 2538.

## Lo que se quitó y por qué

- Las especificaciones gráficas del manual de 2013 (CMYK, Pantone, tamaños, formatos,
  plano de sala, pancartas de un evento de Atenas): pueden haber cambiado y no pude
  comprobar los lineamientos vigentes.
- La lista de miembros y contactos de la Comisión de Eventos de 2013 (con correos
  personales): dato caducado.
- Las anécdotas de cultura popular y las cifras comerciales de la encuesta de 2012 (se
  menciona una sola, identificada como de 2012).

## Lo que no pude verificar

- **Lineamientos gráficos vigentes de la FIDE** (logotipo actual, colores): no los encontré
  publicados en el Handbook; en la revista se recomienda pedirlos a la FIDE o a la federación.
- **Número exacto de federaciones miembro hoy**: la FIDE publicó que superó las 200 (noticia
  de la incorporación de Vanuatu y Tonga); no encontré una cifra oficial de noviembre de 2026.
  Se escribió «más de 200».
- **Las cifras de la encuesta de 2012** (605 millones de jugadores, etc.): no verificadas; se
  presentan como dato de aquel estudio.
- **Redondeo de p a dos decimales**: el Reglamento de Títulos da la tabla con dos decimales
  pero no dice expresamente cómo redondear p; se usó el redondeo a la centésima más cercana
  (el mismo del original y el que usan los programas). Si el reglamento lo precisara de otro
  modo, cambiaría algún dp en casos límite (no en los ejercicios de este número, salvo que
  alguno cayera justo en x,xx5, y ninguno cae).
- **Que el Manual del Árbitro de 2013-2014 declarara ilegal la torre invertida**: viene del
  original; no tuve ese manual. Sí verifiqué la postura actual (Manual del Árbitro 2026,
  comentario al art. 4.6) y la de la revista de árbitros FIDE de agosto de 2016.
- **Que en Argentina se aceptara por tradición la torre invertida como dama**: dato del autor
  original, no verificado; se dejó atribuido a él.
- **Reglamento de títulos de organizadores (B.09, desde el 20-dic-2023)**: solo comprobé que
  existe en el Handbook con esa vigencia; no lo leí en detalle.

## Fichas

4 fichas, 25 preguntas y 2 casos de decisión: `rating-performance-normas`,
`tpr-desempate-performance`, `torre-invertida-coronacion`, `patrocinio-proyecto-evento`.
