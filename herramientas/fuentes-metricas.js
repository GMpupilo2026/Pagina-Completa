#!/usr/bin/env node
/**
 * Calcula los @font-face de RESPALDO y los agrega a css/fuentes.css.
 *
 * POR QUÉ: aunque la fuente esté autoalojada y precargada, el navegador pinta
 * el primer cuadro con la fuente del sistema. Si esa fuente ocupa otro ancho,
 * el texto se reacomoda cuando llega la buena — medido en este sitio: 14,9 %
 * de diferencia, o sea que cada línea salta. Eso es exactamente lo que se lee
 * como «página barata», y no da ningún error.
 *
 * Un respaldo con `size-adjust` y los override de subida y bajada hace que la
 * fuente del sistema ocupe EL MISMO espacio que la final: al llegar la buena
 * cambia el dibujo de las letras y nada más, ni una línea se mueve.
 *
 * Los números NO se escriben a ojo: se miden en un navegador de verdad.
 *
 * Por qué Arial y Times New Roman y no otras: son las únicas dos cuyo respaldo
 * se puede medir en cualquier máquina. Liberation Sans y Liberation Serif —que
 * es lo que hay en un Linux— se diseñaron métricamente idénticas a esas dos, y
 * en Windows y Mac están las de verdad. Georgia no tiene equivalente, así que
 * medirla en Linux daría el número de OTRA fuente: un respaldo calculado
 * contra la fuente equivocada es peor que no tener respaldo, porque el salto
 * sigue ahí y además nadie lo vuelve a mirar. Por eso el script COMPRUEBA que
 * el respaldo exista de verdad y falla si no, en vez de escribir un número
 * inventado.
 *
 *     node herramientas/fuentes-metricas.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const HOJA = path.join(RAIZ, "css", "fuentes.css");
const MARCA = "/* respaldos: los calcula herramientas/fuentes-metricas.js */";

// `respaldos` es una familia métrica: todas miden IGUAL, así que medir
// cualquiera de las que estén instaladas da el mismo número, y en el CSS se
// declaran todas para que cada sistema tome la que tenga.
const PARES = [
  {
    real: "Inter", archivo: "inter-variable-latin.woff2", peso: 400,
    nombre: "Inter respaldo",
    respaldos: ["Arial", "Liberation Sans", "Helvetica"],
  },
  {
    real: "Merriweather", archivo: "merriweather-700-latin.woff2", peso: 700,
    nombre: "Merriweather respaldo",
    respaldos: ["Times New Roman", "Liberation Serif", "Times"],
  },
];

// Texto del propio sitio, con las tildes y la eñe que de verdad se pintan.
const MUESTRA =
  "Academia de ajedrez con clases en vivo, seguimiento del progreso y " +
  "entrenamiento interactivo para escuelas, colegios y familias. " +
  "Aprende, practica y compite. ¿Jugamos una partida? ¡Vamos!";

(async () => {
  const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--no-sandbox"],
  });
  const pagina = await navegador.newPage();
  await pagina.goto("about:blank");

  const salida = [];

  for (const par of PARES) {
    const datos = fs.readFileSync(path.join(RAIZ, "fonts", par.archivo));
    const m = await pagina.evaluate(
      async ({ par, MUESTRA, b64 }) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const f = new FontFace("__real__", bin.buffer, { weight: String(par.peso) });
        await f.load();
        document.fonts.add(f);

        const lienzo = document.createElement("canvas").getContext("2d");
        const medir = (familia) => {
          lienzo.font = `${par.peso} 100px ${familia}`;
          const t = lienzo.measureText(MUESTRA);
          return { ancho: t.width, subida: t.fontBoundingBoxAscent, bajada: t.fontBoundingBoxDescent };
        };
        // ¿Está instalada de verdad? No alcanza con compararla contra una
        // familia inventada: ante un nombre que no conoce, el navegador cae a
        // SU genérica por omisión (en Chromium, la serif), así que una serif
        // instalada mide igual que la inventada y parecería faltar.
        //
        // La prueba que sí distingue: pedirla con las tres genéricas de
        // respaldo. Si la fuente existe, gana ella y las tres miden igual; si
        // no existe, cada una cae a una genérica distinta y miden distinto.
        const existe = (f) => {
          const a = medir(`"${f}", monospace`).ancho;
          const b = medir(`"${f}", sans-serif`).ancho;
          const c = medir(`"${f}", serif`).ancho;
          return Math.abs(a - b) < 0.5 && Math.abs(b - c) < 0.5;
        };
        let usado = null, resp = null;
        for (const r of par.respaldos) {
          if (existe(r)) { usado = r; resp = medir(`"${r}"`); break; }
        }
        return { real: medir("__real__"), resp, usado };
      },
      { par, MUESTRA, b64: datos.toString("base64") }
    );

    if (!m.usado) {
      console.error(
        `\n✗ Ninguna de las fuentes de respaldo de ${par.real} está instalada acá ` +
          `(${par.respaldos.join(", ")}).\n  El navegador las reemplazó por la ` +
          `genérica, así que medir daría el número de OTRA fuente y el respaldo ` +
          `saldría mal sin que nada avise.\n  Instala las fuentes Liberation ` +
          `(fonts-liberation) o corre esto en Windows o Mac.`
      );
      await navegador.close();
      process.exit(1);
    }

    // El lienzo mide con em = 100px, así que dividir entre 100 da la fracción del em.
    const ajuste = (m.real.ancho / m.resp.ancho) * 100;   // size-adjust
    const escala = m.resp.ancho / m.real.ancho;           // para reexpresar sobre el em ya ajustado
    const subida = m.real.subida * escala;
    const bajada = m.real.bajada * escala;
    const desvio = (Math.abs(m.resp.ancho - m.real.ancho) / m.real.ancho) * 100;

    console.log(
      `${par.real.padEnd(13)} medido contra ${m.usado.padEnd(17)} ` +
        `se desviaba ${desvio.toFixed(1).padStart(4)} %  ->  size-adjust ${ajuste.toFixed(2)} %`
    );

    salida.push(
      [
        `/* ${par.real} sobre ${par.respaldos[0]}: sin esto el texto se desviaba ${desvio.toFixed(1)} % */`,
        `@font-face {`,
        `  font-family: '${par.nombre}';`,
        `  src: ${par.respaldos.map((r) => `local('${r}')`).join(", ")};`,
        `  size-adjust: ${ajuste.toFixed(2)}%;`,
        `  ascent-override: ${subida.toFixed(1)}%;`,
        `  descent-override: ${bajada.toFixed(1)}%;`,
        `  line-gap-override: 0%;`,
        `}`,
      ].join("\n")
    );
  }

  await navegador.close();

  let css = fs.readFileSync(HOJA, "utf8");
  const corte = css.indexOf(MARCA);
  if (corte !== -1) css = css.slice(0, corte).trimEnd() + "\n";
  fs.writeFileSync(HOJA, `${css}\n${MARCA}\n${salida.join("\n\n")}\n`);
  console.log(`\nRespaldos escritos en css/fuentes.css`);
  console.log(`Falta ponerlos en la pila de font-family: herramientas/css-construir.js`);
})();
