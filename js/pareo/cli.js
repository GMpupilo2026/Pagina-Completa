#!/usr/bin/env node
/* ===== Pareo Integral — la línea de comandos =====
 *
 * Para quien prueba programas de emparejamiento (los probadores de FIDE, un
 * árbitro con sus propios scripts): lo mismo que la página, sin navegador y en
 * lote. Corre el MISMO bbpPairings en WebAssembly y los mismos módulos que
 * pareo.html (js/pareo/), así que contesta exactamente lo mismo que la página.
 *
 * La sintaxis de emparejar, comprobar y generar es la de JaVaFo / bbpPairings,
 * que es la que usan los probadores:
 *
 *   node pareo.js --dutch torneo.trf -p [salida.txt]      empareja la ronda siguiente
 *   node pareo.js --dutch torneo.trf -c                   comprobador (FPC)
 *   node pareo.js --dutch [config.txt] -g -o azar.trf [-s semilla]   generador (RTG)
 *   node pareo.js standings torneo.trf [--tiebreaks BH-C1,BH,SB] [--csv] [--lang es|en]
 *   node pareo.js --version | --help
 *
 * Los mensajes van en inglés y en español: el aval de FIDE pide inglés.
 * Se empaqueta para bajar con herramientas/pareo-cli-empaquetar.py
 * (descargas/pareo-integral-cli.zip). Ver «Pareo Integral» en
 * docs/decisiones/juegos-y-torneos.md.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const T = require("./torneo.js");
const D = require("./desempates.js");

const VERSION = "Pareo Integral 1.1 (bbpPairings 8f9e3c5, FIDE Dutch System C.04.3 2026, tie-breaks C.07:2026)";

const AYUDA = `${VERSION}
https://ajedrez-integral.com/pareo.html

Usage / Uso:
  node pareo.js --dutch TOURNAMENT.trf -p [OUTPUT]
      Pair the next round (JaVaFo/bbpPairings output: number of boards, then
      "white black" per board, 0 = pairing-allocated bye).
      Empareja la ronda siguiente.
  node pareo.js --dutch TOURNAMENT.trf -c [-l [CHECKLIST]]
      Free Pairing Checker: re-pairs every round and lists the differences.
      Comprobador: vuelve a emparejar cada ronda y dice dónde difiere.
  node pareo.js --dutch [CONFIG] -g -o OUTPUT.trf [-s SEED] [-l [CHECKLIST]]
      Random Tournament Generator.
      Generador de torneos al azar.
  node pareo.js standings TOURNAMENT.trf [--tiebreaks CODES] [--csv] [--lang en|es]
      Standings with FIDE C.07:2026 tie-breaks (default: BH-C1,BH,SB,DE,WIN).
      Clasificación con los desempates del C.07:2026.
  node pareo.js --tiebreak-codes      List the tie-break codes / Los códigos de desempate.
  node pareo.js --version | --help

Exit codes (as bbpPairings / como bbpPairings): 0 ok, 1 no valid pairing,
2 unexpected error, 3 invalid request or file, 4 size limit, 5 file error.`;

// Las opciones de bbpPairings que llevan detrás un archivo de SALIDA.
const SALIDAS = new Set(["-p", "-o", "-l"]);

async function conSalidas(args) {
  // Los archivos de entrada se copian al sistema de archivos del motor con un
  // nombre propio, y los de salida (-p, -o, -l) se copian de vuelta al terminar.
  const archivos = {};
  const salidas = [];
  const argv = [];
  let n = 0;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (SALIDAS.has(args[i - 1]) && a && !a.startsWith("-")) {
      const interno = "salida" + ++n + path.extname(a);
      salidas.push([interno, a]);
      argv.push(interno);
    } else if (!a.startsWith("-") && fs.existsSync(a) && fs.statSync(a).isFile()) {
      const interno = "entrada" + ++n + path.extname(a);
      archivos[interno] = fs.readFileSync(a);
      argv.push(interno);
    } else argv.push(a);
  }
  const crear = require(path.join(__dirname, "..", "vendor", "bbppairings", "bbppairings.js"));
  const m = await crear({
    print: (t) => process.stdout.write(t + "\n"),
    printErr: (t) => process.stderr.write(t + "\n"),
  });
  for (const [k, v] of Object.entries(archivos)) m.FS.writeFile(k, v);
  let codigo;
  try { codigo = m.callMain(argv); } catch (x) { codigo = x && x.status != null ? x.status : 2; }
  for (const [interno, real] of salidas) {
    try { fs.writeFileSync(real, m.FS.readFile(interno)); } catch (x) { /* el motor no lo escribió */ }
  }
  return codigo;
}

function clasificacion(args) {
  const archivo = args.find((a, i) => !a.startsWith("-") && i > 0 && !["--tiebreaks", "--lang"].includes(args[i - 1]));
  if (!archivo || !fs.existsSync(archivo)) {
    process.stderr.write("Missing TRF file / Falta el archivo TRF.\n");
    return 3;
  }
  const valor = (op) => { const i = args.indexOf(op); return i >= 0 ? args[i + 1] : null; };
  const idioma = valor("--lang") === "es" ? "es" : "en";
  const codigos = (valor("--tiebreaks") || "BH-C1,BH,SB,DE,WIN").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const malos = codigos.filter((c) => !D.CATALOGO.some((x) => x.codigo === c));
  if (malos.length) {
    process.stderr.write("Unknown tie-break / Desempate desconocido: " + malos.join(", ") + "\n");
    return 3;
  }
  let t;
  try { t = T.deTrf(fs.readFileSync(archivo, "utf8")); }
  catch (e) { process.stderr.write(e.message + "\n"); return 3; }
  const filas = D.clasificacion(t, codigos);
  const num = T.numeros(t);
  const cab = [idioma === "es" ? "Puesto" : "Rank", idioma === "es" ? "N.º" : "No.", idioma === "es" ? "Nombre" : "Name", "Fed", "Elo", idioma === "es" ? "Pts" : "Pts"].concat(codigos);
  const datos = filas.map((f) => {
    const j = t.jugadores.find((x) => x.id === f.id);
    return [f.puesto, num.get(f.id), j.nombre, j.fed || "", j.elo || "", f.puntos].concat(codigos.map((c) => Math.round(f.valores[c] * 100) / 100));
  });
  if (args.includes("--csv")) {
    const esc = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    process.stdout.write([cab].concat(datos).map((r) => r.map(esc).join(",")).join("\n") + "\n");
    return 0;
  }
  const anchos = cab.map((c, i) => Math.max(String(c).length, ...datos.map((r) => String(r[i]).length)));
  const linea = (r) => r.map((v, i) => (i === 2 || i === 3 ? String(v).padEnd(anchos[i]) : String(v).padStart(anchos[i]))).join("  ");
  process.stdout.write([linea(cab), anchos.map((a) => "-".repeat(a)).join("  ")].concat(datos.map(linea)).join("\n") + "\n");
  return 0;
}

async function principal(args) {
  if (!args.length || args.includes("--help") || args.includes("-h")) { console.log(AYUDA); return 0; }
  if (args.includes("--version")) { console.log(VERSION); return 0; }
  if (args.includes("--tiebreak-codes")) {
    for (const x of D.CATALOGO) console.log(x.codigo.padEnd(7) + x.en + " / " + x.es);
    return 0;
  }
  if (args[0] === "standings") return clasificacion(args);
  if (args.includes("--burstein")) {
    process.stderr.write("Only the FIDE Dutch System is offered (--dutch). / Solo se ofrece el Sistema Holandés (--dutch).\n");
    return 3;
  }
  return conSalidas(args);
}

if (require.main === module) {
  principal(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exit(2); });
}

module.exports = { principal, VERSION };
