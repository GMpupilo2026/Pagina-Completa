# Pareo Integral — versión de línea de comandos

Pareo Integral es un programa gratuito de emparejamientos de torneos de
ajedrez (Sistema Holandés de FIDE) que publica Ajedrez Integral en
<https://ajedrez-integral.com/pareo.html>. Este paquete es su versión de línea
de comandos, para probarlo en lote (por ejemplo, los probadores de FIDE). Corre
**el mismo motor y el mismo código** que la página, así que los dos dan
siempre lo mismo.

*The English version is in `README.md`.*

## Qué necesitas

[Node.js](https://nodejs.org) 18 o más nuevo. Nada más: el motor de
emparejamiento viene incluido en WebAssembly.

## Cómo se usa

Para emparejar, comprobar y generar se usa la misma sintaxis de JaVaFo y
bbpPairings.

```
node pareo.js --dutch TORNEO.trf -p [SALIDA]
```
Empareja la ronda siguiente. El TRF tiene que traer el total de rondas (`142`
o `XXR`) y puede marcar quién no juega la ronda que viene (`0000 - H`, `Z` o
`F` en su columna). Sale la cantidad de mesas y una línea por mesa,
`blancas negras` con los números de emparejamiento (`0` = bye del pareo), en
el orden de las mesas.

```
node pareo.js --dutch TORNEO.trf -c [-l [LISTA]]
```
Comprobador de emparejamientos: vuelve a emparejar cada ronda con el Sistema
Holandés y lista cada diferencia con lo que dice el archivo. Si no lista
ninguna, todas las rondas coinciden.

```
node pareo.js --dutch [CONFIGURACIÓN] -g -o SALIDA.trf [-s SEMILLA] [-l [LISTA]]
```
Generador de torneos al azar: arma un torneo entero con resultados al azar,
emparejado con el Sistema Holandés. El archivo de configuración es el de
JaVaFo / bbpPairings. Ojo: con la misma semilla sale un torneo distinto que con
el bbpPairings de escritorio, porque el azar de la librería de C++ es otro; los
emparejamientos sí son los mismos.

```
node pareo.js standings TORNEO.trf [--tiebreaks BH-C1,BH,SB] [--csv] [--lang es|en]
```
La clasificación con los desempates del reglamento C.07 de FIDE (versión
2026), en el orden que se den. `node pareo.js --tiebreak-codes` muestra los 26
códigos.

`node pareo.js --version` dice las versiones del programa, del motor y de los
reglamentos que sigue.

Los códigos de salida son los de bbpPairings: 0 bien, 1 no hay
emparejamiento posible, 2 error inesperado, 3 pedido o archivo inválido,
4 tamaño fuera de límite, 5 error con un archivo.

## Qué trae

- `pareo.js` — por donde se entra.
- `js/pareo/` — el torneo y el TRF (`torneo.js`), los desempates
  (`desempates.js`) y la línea de comandos (`cli.js`).
- `js/vendor/bbppairings/` — el motor de emparejamiento.

## Créditos y licencias

- Emparejamientos: **bbpPairings**, de Jeremy Bierema, licencia Apache 2.0
  (`js/vendor/bbppairings/`), compilado a WebAssembly sin cambiarle nada al
  código. Se usa solo su Sistema Holandés.
- Desempates: traducidos de **chesspairing**, de Gert Nutterts, licencia
  Apache 2.0 (<https://github.com/gnutterts/chesspairing>), y comparados con él.
- Pareo Integral © 2026 Ajedrez Integral.

Pareo Integral **todavía no tiene el aval de FIDE**.
