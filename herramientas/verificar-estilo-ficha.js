/* Comprueba la ficha en PDF de la prueba de estilo (js/estilo-ficha-pdf.js).
 *
 * Sin navegador: se arma el documento neutral y se escribe el PDF con el
 * mismo generador del sitio (js/reporte-pdf.js), sin la marca de agua (esa
 * necesita un lienzo). Lo que se rompe callado acá es un PDF que se ve bien y
 * dice otra cosa que la pantalla:
 *
 *  1. Los ejes son los de SU prueba (una de la versión 1, tres), con su
 *     etiqueta y su margen ESCRITOS (se imprime en blanco y negro).
 *  2. Las aperturas son las de la recomendación guardada (el acta), con sus
 *     primeras jugadas en notación española y su porqué.
 *  3. La voz: «tu» al alumno, en tercera persona y con su nombre al profe.
 *  4. El PDF sale (%PDF, una página por lo menos) y lleva escrito lo de arriba,
 *     con las tildes en WinAnsi.
 *
 * Uso:  npm install && node herramientas/verificar-estilo-ficha.js
 */
"use strict";
const path = require("path");
const fs = require("fs");
const RAIZ = path.join(__dirname, "..");
const { Chess } = require(path.join(RAIZ, "node_modules", "chess.js"));
global.Chess = Chess;
global.window = global;
global.EstiloMedidas = require("../js/estilo-medidas.js");
global.EstiloItems = require("../js/estilo-items.js");
const P = require("../js/estilo-perfil.js");
const A = require("../js/estilo-aperturas.js");
const F = require("../js/estilo-ficha-pdf.js");
new Function("window", fs.readFileSync(path.join(RAIZ, "js/reporte-pdf.js"), "utf8"))(global);

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos++;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

const B = global.EstiloItems;
function prueba(version, quiere) {
  const respuestas = [];
  for (const eje of B.FORMAS[version].ejes) {
    B.ITEMS.filter((i) => i.eje === eje).slice(0, B.FORMAS[version].porEje).forEach((it) => {
      respuestas.push({ id: it.id, eleccion: it.a.polo === quiere[eje] ? "a" : "b", seguridad: 3, ms: 5000 });
    });
  }
  const perfil = P.medir(respuestas, null, version);
  const recomendacion = A.recomendar(perfil, { ritmo: "rapidas", estudio: "medio", elo: 1500, actual: {} });
  return { fila: { version, respuestas, recomendacion, created_at: "2026-10-02T15:00:00Z" }, perfil };
}

(async () => {
  console.log("-- 1. Los ejes de su prueba, con su margen escrito");
  const v2 = prueba(2, { ataque: "atacar", estructura: "abrir", cambios: "mantener", material: "iniciativa" });
  const doc = F.documento(v2.fila, v2.perfil, { nombre: "Ana Rojas 🎉", tu: true });
  const ejes = (d) => d.bloques.filter((b) => b.eje && b.tipo === "subtitulo");
  const margenes = doc.bloques.filter((b) => b.eje && b.tipo === "nota");
  ok("cuatro ejes, con su resultado y el «entre X y Y %»", ejes(doc).length === 4 && margenes.every((b) => /entre \d+ y \d+ %/.test(b.texto))
    && ejes(doc).map((b) => b.eje).join("|") === Object.keys(B.EJES).join("|"), JSON.stringify(ejes(doc)));
  ok("y lo mismo que dice la pantalla (EstiloPerfil.medir)", ejes(doc)[0].texto === B.EJES.ataque.nombre + ": " + v2.perfil.ataque.etiqueta.texto);
  const v1 = prueba(1, { ataque: "atacar", estructura: "abrir", cambios: "mantener" });
  const doc1 = F.documento(v1.fila, v1.perfil, { tu: true });
  ok("una prueba de la versión 1: sus tres ejes, no un cuarto", ejes(doc1).length === 3);

  console.log("-- 2. Las aperturas del acta, en notación española");
  const subt = doc.bloques.filter((b) => b.tipo === "subtitulo" && !b.eje).map((b) => b.texto);
  ok("las tres de la recomendación guardada", subt.join("|") === ["blancas", "e4", "d4"].map((g) => v2.fila.recomendacion[g].titulo).join("|"), subt.join("|"));
  const nombres = doc.bloques.filter((b) => b.tipo === "parrafo" && /^Te recomendamos|^Sigue con la tuya/.test(b.texto)).map((b) => b.texto);
  ok("con el nombre de cada una", ["blancas", "e4", "d4"].every((g, k) => nombres[k] && nombres[k].includes(v2.fila.recomendacion[g].principal.nombre)), nombres.join("|"));
  const jugadas = doc.bloques.filter((b) => b.tipo === "parrafo" && /^1\./.test(b.texto)).map((b) => b.texto);
  ok("sus jugadas en notación española (C, A, T, D, R; sin N ni B de pieza)", jugadas.length === 3 && jugadas.every((j) => !/(^|\s|\.)[NBQK][a-h1-8x]/.test(j)), jugadas.join(" | "));
  ok("y la Nf3 se escribe Cf3", F.lineaEsSimple(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "O-O"]) === "1.e4 e5 2.Cf3 Cc6 3.Ab5 a6 4.O-O");
  ok("cada una con su porqué", doc.bloques.filter((b) => b.tipo === "lista").length >= 3);

  console.log("-- 3. La voz");
  ok("al alumno, «Tu estilo de juego», sin el emoji de su nombre", doc.titulo === "Tu estilo de juego" && /^Ana Rojas · Prueba del 2 de octubre de 2026$/.test(doc.subtitulo), doc.subtitulo);
  const docProfe = F.documento(v2.fila, v2.perfil, { nombre: "Ana Rojas", tu: false });
  ok("al profe, con su nombre y en tercera persona", docProfe.titulo === "Estilo de juego de Ana Rojas"
    && docProfe.bloques.some((b) => b.texto === "Qué tipo de partida le gusta")
    && !JSON.stringify(docProfe.bloques).includes("Te recomendamos"));
  ok("el archivo, con su nombre sin tildes y la fecha", F.nombreArchivo("Ana Rojas Núñez", "2026-10-02T15:00:00Z") === "estilo-de-juego-ana-rojas-nunez-2026-10-02.pdf");

  console.log("-- 4. El PDF");
  const blob = await global.ReportePDF.generar(doc);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const crudo = bytes.toString("latin1");
  ok("sale un PDF", crudo.startsWith("%PDF-1.4") && /\/Type \/Page\b/.test(crudo) && crudo.trimEnd().endsWith("%%EOF"));
  // Lo que escribe el generador: cada carácter en WinAnsi, un byte.
  const winAnsi = (s) => global.ReportePDF._aLatin1(s);
  ok("lleva escrito el título, la tabla y las aperturas, con las tildes", [doc.titulo, "Qué tipo de partida te gusta", v2.fila.recomendacion.e4.principal.nombre].every((s) => crudo.includes(winAnsi(s).replace(/([()\\])/g, "\\$1"))));

  if (fallos) { console.log(`\n✗ ${fallos} comprobación(es) fallaron.`); process.exit(1); }
  console.log("\n✓ La ficha en PDF de la prueba de estilo dice lo que dice la pantalla.");
})();
