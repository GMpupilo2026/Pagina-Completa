#!/usr/bin/env node
/* El robo de puntos (supabase/functions/partida-fin/calculo.ts): cuando dos
   alumnos juegan entre sí y quien gana estuvo en algún momento en una
   posición materialmente perdida, se le roban esos puntos —la ventaja que
   tuvo el perdedor, por 100— a quien la dejó ir. Ver «El robo de puntos» en
   docs/decisiones/puntos-y-premios.md.

   La cuenta de verdad (que el disparador solo avisa con un secreto, que
   registrar_robo_de_puntos no paga ni cobra dos veces la misma sala) vive en
   la base: supabase/migraciones/20261009140000_robo_de_puntos_al_perder_la_
   ventaja.sql, comprobada aplicándola. Acá se comprueba el CÁLCULO: la misma
   función que corre la Edge Function (calculo.ts), reproduciendo una
   partida real con el chess.js que usa el resto del sitio — sin copiarla,
   para no probar una reimplementación en vez del código que despliega.

   Sin navegador:
       node herramientas/verificar-puntos-robo.js
*/
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function cargarCalculo() {
  const ruta = path.join(__dirname, "..", "supabase", "functions", "partida-fin", "calculo.ts");
  const codigo = fs.readFileSync(ruta, "utf8");
  // Es un .ts sin nada de TypeScript (ningún tipo, solo JS de verdad), así
  // que Node lo puede importar tal cual como módulo, con el mismo truco que
  // otras herramientas usan para no mantener una segunda copia del archivo.
  return import("data:text/javascript," + encodeURIComponent(codigo));
}

async function main() {
  console.log("=== El cálculo del robo de puntos ===");
  const { peorMomentoDelGanador, puntosDelRobo } = await cargarCalculo();

  // La trampa de Légal: negras capturan la dama blanca (Bxd1) después de que
  // blancas ya habían ganado un peón (Nxe5), y aun así blancas da mate.
  // Blancas, el ganador, estuvo 8 puntos abajo en su peor momento.
  const legal = ["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6", "Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"];
  let peor = peorMomentoDelGanador(new Chess(), legal, "white");
  igual("Légal: blancas estuvieron 8 abajo y aun así ganaron", peor, 8);
  igual("eso son 800 puntos robados", puntosDelRobo(peor), 800);

  // Las mismas jugadas, pero mirando a negras (quien de verdad perdió): el
  // peor momento de negras es apenas 1 (cuando blancas ganó el peón con
  // Nxe5, antes de perder la dama).
  peor = peorMomentoDelGanador(new Chess(), legal, "black");
  igual("mirado desde negras, su peor momento fue apenas 1", peor, 1);
  igual("eso son 100 puntos, no 800: importa quién ganó de verdad", puntosDelRobo(peor), 100);

  // El loro de Boden-Kieseritzky (mate rápido, sin ninguna captura de por
  // medio): quien gana nunca estuvo abajo, no hay nada que robar.
  const sinCapturas = ["f3", "e5", "g4", "Qh4"];
  peor = peorMomentoDelGanador(new Chess(), sinCapturas, "black");
  igual("sin capturas, nadie estuvo nunca abajo", peor, 0);
  igual("y no se roba nada", puntosDelRobo(peor), 0);

  // Una partida vacía (recién armada, nadie movió): tampoco hay nada.
  igual("una partida sin jugadas no roba nada", puntosDelRobo(peorMomentoDelGanador(new Chess(), [], "white")), 0);

  // Una jugada que no existe en la posición (SAN inventado o de otra
  // partida): se corta ahí, no se sigue inventando cómo habría seguido.
  const conJugadaRara = ["e4", "e5", "Qh5000", "Nc6"];
  peor = peorMomentoDelGanador(new Chess(), conJugadaRara, "white");
  igual("una jugada que no calza corta la reproducción, no revienta", peor, 0);

  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\n✓ Todo bien");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
