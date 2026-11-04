#!/usr/bin/env node
/* La transmisión sin atraso para los árbitros del Centroamericano: lo que se puede comprobar sin navegador.
 *   - js/centroamericano-arbitro-vivo.js: los relojes que corren desde la lectura, el texto de cada mesa y la lectura
 *     que pasa al reloj apagado (sin atraso, la hora es la de la lectura menos lo que llevaba pensando);
 *   - la Edge Function centroamericano-mesas-vivo: la regla de los nombres es la MISMA que la del navegador, los
 *     jugadores salen de la lectura compartida de chess-results (no de la tablet), y nunca devuelve la clave;
 *   - las migraciones: solo service_role lee, guarda y quita la clave (en la bóveda);
 *   - las páginas: el botón de la tablet, la conexión de la organización y la copia privada de Pareo para DGT.
 * Ver «La transmisión sin atraso para los árbitros» en docs/decisiones/juegos-y-torneos.md.
 *
 *   node herramientas/verificar-centroamericano-mesas-vivo.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const V = require(path.join(RAIZ, "js/centroamericano-arbitro-vivo.js"));
const TX = require(path.join(RAIZ, "js/centroamericano-transmision-reloj.js"));

let fallas = 0, pruebas = 0;
function ok(nombre, cond, detalle) {
  pruebas++;
  if (!cond) { fallas++; console.error("✗ " + nombre + (detalle ? " — " + detalle : "")); }
}

// ---- los relojes de la tablet
const LEIDA = Date.UTC(2026, 10, 4, 16, 0, 0);
const enJuego = { mesa: 3, fen: "8/8/8/8/8/8/8/K6k b - - 0 24", estado: "*", reloj_b: 270000, reloj_n: 312000, piensa: 40 };
const r1 = V.relojes(enJuego, LEIDA + 20000, LEIDA);
ok("le toca a las negras: su reloj corre (lo que llevaba pensando + lo que pasó desde la lectura)", r1.turno === "negras" && r1.negras === 3120 - 60 && r1.blancas === 2700, JSON.stringify(r1));
const r2 = V.relojes(Object.assign({}, enJuego, { estado: "1-0" }), LEIDA + 20000, LEIDA);
ok("terminada: ningún reloj corre", r2.terminada && r2.negras === 3120 && r2.blancas === 2700);
const r3 = V.relojes({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", estado: "*", reloj_b: 540000, reloj_n: 540000, piensa: 100 }, LEIDA + 5000, LEIDA);
ok("sin ninguna jugada: el reloj no corre (todavía no empezó)", r3.blancas === 5400);
ok("el texto de la mesa", V.texto(enJuego, LEIDA, LEIDA) === "Van 24 jugadas · le toca a las negras · Blancas 45:00 · Negras 51:20", V.texto(enJuego, LEIDA, LEIDA));
ok("el texto de una terminada", /^Terminó en la transmisión: 1-0/.test(V.texto(Object.assign({}, enJuego, { estado: "1-0" }), LEIDA, LEIDA)));
ok("horas, minutos y segundos", V.hms(3725) === "1:02:05" && V.hms(59) === "0:59" && V.hms(-5) === "−0:05" && V.hms(null) === "—");

// ---- la lectura para el reloj apagado: sin atraso, la hora es la de la lectura menos lo que llevaba pensando
const c = TX.controlDe(V.lectura(enJuego), { ahora: LEIDA, atraso: 0 });
ok("sin atraso: el control es de la lectura menos lo que llevaba pensando", !c.error && new Date(c.ocurrio).getTime() === LEIDA - 40000 && c.atraso === 0, JSON.stringify(c));
ok("sin atraso: las jugadas y los relojes", c.j_blancas === 24 && c.j_negras === 23 && c.t_blancas === 2700 && c.t_negras === 3120);
const conInicio = TX.controlDe(V.lectura(enJuego), { ahora: LEIDA, atraso: 0, inicio: LEIDA - 40000 - ((5400 + 30 * 24 - 2700) + (5400 + 30 * 23 - 3120)) * 1000 });
ok("sin atraso y con la hora de inicio que cuadra: sin avisos", conInicio.avisos.length === 0, JSON.stringify(conInicio.avisos));

// ---- la Edge Function
const fn = leer("supabase/functions/centroamericano-mesas-vivo/index.ts");
const deJs = leer("js/centroamericano-transmision-reloj.js");
// Las dos piezas de la regla (las palabras y la comparación), sin comentarios, sangría ni tipos de TypeScript.
const regla = (t) => {
  const p = (t.match(/const palabras = [^;]*;/) || [""])[0];
  const f = (t.match(/function mismoJugador\([^)]*\) \{[\s\S]*?\n\s*\}\n/) || [""])[0];
  return (p + "\n" + f).replace(/: unknown/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
};
ok("la regla de los nombres es la misma en el navegador y en la función", regla(fn) && regla(fn) === regla(deJs), "\n" + regla(fn) + "\n---\n" + regla(deJs));
ok("los jugadores de sus mesas salen de la lectura compartida de chess-results y de su rango", /from\("centroamericano_lecturas"\)/.test(fn) && /m\.mesa >= a\.mesa_desde && m\.mesa <= a\.mesa_hasta/.test(fn));
ok("un enlace apagado o vencido no lee nada", /a\.revocada \|\| new Date\(a\.vence\)/.test(fn));
const respuestas = fn.match(/json\(\{[^;]*\}/g) || [];
const sinTextos = (x) => x.replace(/"(?:[^"\\]|\\.)*"/g, '""');
ok("nunca devuelve la clave ni los enlaces privados", respuestas.length > 5 && respuestas.every((x) => !/\btoken\b|\benlace\b|\bids\b/.test(sinTextos(x))), respuestas.filter((x) => /\btoken\b|\benlace\b|\bids\b/.test(sinTextos(x))).join(" | "));
ok("la organización necesita la herramienta «mesa-arbitro»", /tengo_herramienta", \{ p_herramienta: "mesa-arbitro" \}/.test(fn));
ok("la clave se prueba con Lichess y debe poder leer lo privado (study:read)", /\/api\/token\/test/.test(fn) && /includes\("study:read"\)/.test(fn));
const desplegadas = leer("supabase/esquema/funciones-desplegadas.txt");
ok("está en la lista de desplegadas, sin JWT (la tablet no tiene sesión)", /^centroamericano-mesas-vivo\s+false\s/m.test(desplegadas));

// ---- las migraciones
const m1 = leer("supabase/migraciones/20261104023302_centroamericano_vivo_arbitros.sql");
const m2 = leer("supabase/migraciones/20261104024300_centroamericano_vivo_varios_torneos.sql");
for (const f of ["centroamericano_vivo_leer()", "centroamericano_vivo_guardar(text, text)", "centroamericano_vivo_quitar()"]) {
  const todas = m1 + m2;
  ok(f + ": se le quita a public, anon y authenticated y solo la usa service_role",
    todas.includes("revoke all on function public." + f + " from public, anon, authenticated;") && todas.includes("grant execute on function public." + f + " to service_role;"));
}
ok("la clave va en la bóveda, no en una tabla", /vault\.create_secret\(p_token, 'centroamericano_vivo_token'\)/.test(m2) && !/create table/i.test(m1 + m2));
ok("las migraciones no borran nada", !/\bdrop\b|\bdelete\b/i.test(m1 + m2));

// ---- las páginas
const tablet = leer("centroamericano-arbitro.html");
ok("la tablet: el botón «Mis mesas en vivo» empieza escondido", /<button type="button" id="ver-vivo"[^>]*hidden>/.test(tablet));
const i1 = tablet.indexOf('src="js/tablero-fen.js"'), i2 = tablet.indexOf('src="js/centroamericano-arbitro-vivo.js"'), i3 = tablet.indexOf('src="js/centroamericano-arbitro.js"');
ok("la tablet carga el tablero y el módulo antes de su página", i1 > 0 && i2 > i1 && i3 > i2);
const arb = leer("js/centroamericano-arbitro.js");
ok("la tablet arranca el módulo con su token y su botón", /CentroamericanoArbitroVivo\.iniciar\(\{ token, boton: \$\("ver-vivo"\) \}\)/.test(arb));
ok("el reloj apagado usa primero la transmisión sin atraso", /VIVO\.deLaMesa\(mesa\)/.test(arb) && /atraso: v\.delay/.test(arb));
const vivo = leer("js/centroamericano-arbitro-vivo.js");
ok("la tablet le pide a la función nueva, con el token de su enlace", /functions\.invoke\("centroamericano-mesas-vivo", \{ body: \{ action: "mesas", arbitro_token: o\.token\(\) \} \}\)/.test(vivo));
const org = leer("centroamericano-mesas.html");
ok("la organización: la conexión con su clave en un campo de contraseña", /id="vivo-token" type="password"/.test(org) && /id="vivo-enlace"/.test(org) && /src="js\/centroamericano-vivo-conectar\.js"/.test(org));
ok("la organización: la clave se borra del campo al conectar", /\$\("vivo-token"\)\.value = ""/.test(leer("js/centroamericano-vivo-conectar.js")));
const dgt = leer("js/pareo/dgt.js");
ok("Pareo para DGT: la visibilidad privada llega a Lichess", /d\.visibilidad === "private" \? d\.visibilidad/.test(dgt));
const dgtPag = leer("js/pareo-dgt.js"), dgtDir = leer("js/pareo-dgt-directo.js");
ok("Pareo para DGT: la copia de los árbitros es privada y cada jugada va también ahí", /visibilidad: "private"/.test(dgtPag) && /if \(r\.privada\) await API\(\)\.empujar\(r\.privada\.id, pgn\)/.test(dgtDir));
ok("Pareo para DGT: si la copia privada falla, la pública no se frena", /empujar\(r\.privada\.id, pgn\)\.catch\(/.test(dgtDir));
ok("la política de privacidad dice que la clave se guarda cifrada", /clave de su cuenta de Lichess que solo sirve para leer sus transmisiones privadas: queda cifrada/.test(leer("privacidad.html")));

if (fallas) { console.error("\n" + fallas + " de " + pruebas + " comprobaciones fallaron."); process.exit(1); }
console.log("✓ La transmisión sin atraso para los árbitros: " + pruebas + " comprobaciones.");
