# Verificar posiciones con el motor del sitio

Las posiciones que se publican —las de los cursos y las del diagnóstico— tienen
que cumplir lo que prometen: si el ejercicio dice "ganan blancas", tiene que
ganar; si dice "tablas", tiene que ser tablas. `chess.js` solo comprueba que las
jugadas sean legales; para el resultado hace falta un motor.

`verificador-motor.html` expone el Stockfish del propio sitio como una función
(`window.analizar(fen, profundidad)`) y se maneja desde un script de Playwright:

```js
const { chromium } = require("playwright");
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8777/herramientas/verificador-motor.html");
const r = await p.evaluate(([fen]) => window.analizar(fen, 20), ["8/8/3k4/8/3K4/3P4/8/8 b - - 0 1"]);
// r.best = mejor jugada en UCI · r.info = la línea "info ... score cp N ..."
```

El `score` viene siempre desde el punto de vista del bando que mueve: para leerlo
"desde las blancas" hay que cambiarle el signo cuando juegan las negras.

Dos cosas aprendidas usándolo:

- **Una página nueva por posición.** Una FEN imposible puede tumbar al Worker y
  dejarlo mudo para todo lo que venga después (está explicado en
  `js/shared-engine.js`); si cada posición se analiza en su propia página, una
  mala no arrastra a las demás.
- **Verificar la línea entera, no solo la posición inicial.** Vale la pena
  evaluar también la posición final de la línea: si el ejercicio promete "ganan
  blancas" y al terminar la línea el motor dice tablas, la línea está mal aunque
  todas sus jugadas sean legales. Así se encontró un error en la posición de
  Lucena del curso "Estrategia en el final": el rey negro estaba demasiado cerca
  y la técnica del puente no ganaba.
