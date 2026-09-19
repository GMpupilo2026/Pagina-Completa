#!/usr/bin/env node
/**
 * Baja Inter y Merriweather de Google Fonts y las deja autoalojadas en fonts/,
 * con su hoja css/fuentes.css.
 *
 * POR QUÉ: pedirlas a Google cuesta dos conexiones a terceros ANTES de que el
 * texto se pueda pintar bien (fonts.googleapis.com para el CSS y
 * fonts.gstatic.com para el .woff2), y con `display=swap` el navegador pinta
 * primero con la fuente del sistema y después salta. Medido en este sitio: el
 * mismo titular mide 14,9 % distinto en una fuente y en la otra, así que cada
 * línea del sitio se reacomoda sola un segundo después de entrar.
 *
 * Se queda SOLO con los subconjuntos latin y latin-ext. El sitio está en
 * español: el cirílico, el griego y el vietnamita son bytes que nadie va a
 * pintar nunca.
 *
 * Se puede correr todas las veces que se quiera: reescribe fonts/ y la hoja.
 *
 *     node herramientas/fuentes-bajar.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DIR_FUENTES = path.join(RAIZ, "fonts");
const HOJA = path.join(RAIZ, "css", "fuentes.css");

const PEDIDO =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700" +
  "&family=Merriweather:wght@700&display=swap";

// Solo lo que el sitio puede llegar a pintar.
const SUBCONJUNTOS = ["latin", "latin-ext"];

// Chrome moderno, para que Google devuelva woff2 y no un formato viejo.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

async function bajar(url, binario = false) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} al pedir ${url}`);
  return binario ? Buffer.from(await r.arrayBuffer()) : r.text();
}

/** Parte el CSS de Google en bloques, cada uno con su comentario de subconjunto. */
function trocear(css) {
  const bloques = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
  let m;
  while ((m = re.exec(css))) {
    const cuerpo = m[2];
    const campo = (n) => (cuerpo.match(new RegExp(n + ":\\s*([^;]+);")) || [])[1]?.trim();
    bloques.push({
      subconjunto: m[1],
      familia: (campo("font-family") || "").replace(/['"]/g, ""),
      peso: campo("font-weight"),
      estilo: campo("font-style"),
      rango: campo("unicode-range"),
      url: (cuerpo.match(/url\(([^)]+)\)/) || [])[1],
    });
  }
  return bloques;
}

(async () => {
  console.log("Pidiendo la hoja a Google…");
  const css = await bajar(PEDIDO);
  const todos = trocear(css);
  const usados = todos.filter((b) => SUBCONJUNTOS.includes(b.subconjunto));

  if (!usados.length) throw new Error("No se reconoció ningún @font-face en la respuesta");
  console.log(
    `  ${todos.length} bloques; me quedo con ${usados.length} (${SUBCONJUNTOS.join(", ")})`
  );

  fs.rmSync(DIR_FUENTES, { recursive: true, force: true });
  fs.mkdirSync(DIR_FUENTES, { recursive: true });

  // Google sirve Inter como fuente VARIABLE: los cuatro pesos que pedimos son
  // byte por byte el MISMO archivo. Guardarlo cuatro veces serían 141 KB de
  // más y cuatro descargas donde basta una, así que se deduplica por
  // contenido y el @font-face declara el rango de pesos que cubre.
  const porContenido = new Map();
  let total = 0;

  for (const b of usados) {
    const datos = await bajar(b.url, true);
    const huella = require("crypto").createHash("sha1").update(datos).digest("hex");
    if (!porContenido.has(huella)) {
      porContenido.set(huella, { ...b, datos, pesos: new Set() });
    }
    porContenido.get(huella).pesos.add(Number(b.peso));
  }

  const reglas = [];
  for (const f of porContenido.values()) {
    const pesos = [...f.pesos].sort((a, b) => a - b);
    const variable = pesos.length > 1;
    const nombre =
      `${f.familia.toLowerCase().replace(/\s+/g, "-")}-` +
      `${variable ? "variable" : pesos[0]}-${f.subconjunto}.woff2`;

    fs.writeFileSync(path.join(DIR_FUENTES, nombre), f.datos);
    total += f.datos.length;
    console.log(
      `  ${nombre}  ${(f.datos.length / 1024).toFixed(1)} KB` +
        (variable ? `  (variable, pesos ${pesos[0]}-${pesos.at(-1)})` : "")
    );

    reglas.push(
      [
        `/* ${f.subconjunto} */`,
        `@font-face {`,
        `  font-family: '${f.familia}';`,
        `  font-style: ${f.estilo};`,
        `  font-weight: ${variable ? `${pesos[0]} ${pesos.at(-1)}` : pesos[0]};`,
        `  font-display: swap;`,
        `  src: url('/fonts/${nombre}') format('woff2');`,
        `  unicode-range: ${f.rango};`,
        `}`,
      ].join("\n")
    );
  }

  const cabecera = [
    "/* Inter y Merriweather, autoalojadas.",
    " *",
    " * NO SE EDITA A MANO: la genera herramientas/fuentes-bajar.js.",
    " *",
    " * Antes venían de fonts.googleapis.com, que son dos conexiones a terceros",
    " * antes de poder pintar el texto como se debe. Acá salen del mismo origen",
    " * que el resto del sitio, y la portada las precarga.",
    " *",
    " * Los respaldos con size-adjust de más abajo los calcula",
    " * herramientas/fuentes-metricas.js: sin ellos, el texto SALTA cuando la",
    " * fuente termina de llegar, que es justo lo que este cambio viene a evitar.",
    " */",
    "",
  ].join("\n");

  fs.writeFileSync(HOJA, cabecera + reglas.join("\n\n") + "\n");
  console.log(`\nfonts/ = ${(total / 1024).toFixed(0)} KB en ${porContenido.size} archivos`);
  console.log("  (una página en español solo pide los `latin`; `latin-ext` casi nunca)");
  console.log(`Hoja escrita en css/fuentes.css`);
  console.log("\nAhora: node herramientas/fuentes-metricas.js  (calcula los respaldos)");
})();
