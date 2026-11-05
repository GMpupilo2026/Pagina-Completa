#!/usr/bin/env node
/* El encargado de transmisión del Centroamericano: lo que se puede comprobar sin navegador.
 *   - js/centroamericano-transmision.js: cada aviso salta cuando tiene que saltar y NO cuando no (una partida normal no
 *     avisa nada), con partidas armadas con chess.js y relojes como los de LiveChess («Nf3 5482+5»);
 *   - js/centroamericano-arbitro-vivo.js: LiveChess a veces manda solo el reloj («Ba6 2912») o solo lo pensado
 *     («e4 +152»): también se leen;
 *   - la Edge Function centroamericano-transmision: la regla de los nombres es la misma del navegador, `run` de LiveChess
 *     dice de quién es el reloj que corre, nunca devuelve el id de LiveChess ni un token, y el enlace se valida;
 *   - la migración: las tablas sin permisos para anon y con la auditoría de los enlaces;
 *   - las páginas: la del encargado, la pestaña del principal y que el token no se guarda.
 * Ver «El encargado de transmisión (Centroamericano)» en docs/decisiones/juegos-y-torneos.md.
 *
 *   node herramientas/verificar-centroamericano-transmision.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const { Chess } = require("chess.js");
const V = require(path.join(RAIZ, "js/centroamericano-arbitro-vivo.js"));
const TX = require(path.join(RAIZ, "js/centroamericano-transmision.js"));

let fallas = 0, pruebas = 0;
function ok(nombre, cond, detalle) {
  pruebas++;
  if (!cond) { fallas++; console.error("✗ " + nombre + (detalle ? " — " + detalle : "")); }
}

// ---- partidas como las manda LiveChess: cada jugada con el reloj de quien jugó (con el incremento) y lo que pensó
const AHORA = Date.UTC(2026, 10, 4, 22, 0, 0);
function partida(sans, { inc = 30, base = 5400, pensar = 20, desde } = {}) {
  const relojes = { w: base + inc, b: base + inc };
  const c = new Chess();
  const jug = [];
  let t = desde != null ? desde : AHORA - sans.length * pensar * 1000 - 5000;
  const primera = t;
  sans.forEach((s, i) => {
    const turno = c.turn();
    if (!c.move(s, { sloppy: true })) throw new Error("jugada ilegal en el ensayo: " + s);
    relojes[turno] = relojes[turno] - (i < 2 ? 0 : pensar) + inc;
    jug.push(s + " " + relojes[turno] + (i < 2 ? "" : "+" + pensar));
    if (i) t += pensar * 1000;
  });
  return { jug, relojes, primera, ultima: t };
}
const CAT = { tnr: "100", nombre: "Sub-12 Absoluto", ronda: 5, ritmo: { texto: "90 min + 30 seg add", base: 5400, inc: 30 } };
function tablero(p, extra) {
  const turnoCorre = p.jug.length % 2 === 0 ? "blancas" : "negras";
  return Object.assign({
    tablero: 3, coincide: true, al_reves: false, en_otra_mesa: null, cambio: null,
    cr: { mesa: 3, blancas: "Pérez Mora, Ana", negras: "Solís Vega, Luis", resultado: null },
    lc: { blancas: "Perez Mora Ana", negras: "Solis Vega Luis", resultado: "*", live: true },
    partida: { live: true, resultado: null, primera: p.primera, jugadas: p.jug,
      reloj: { blancas: p.relojes.w, negras: p.relojes.b, corre: turnoCorre, hora: p.ultima } },
  }, extra || {});
}
const tipos = (t, cat, ahora) => TX.avisos(t, Object.assign({}, CAT, { tableros: [t] }, cat || {}), ahora || AHORA).map((x) => x.tipo);

// Una partida normal: ningún aviso.
const NORMAL = ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6", "Be3", "e5", "Nb3", "Be6"];
const pN = partida(NORMAL);
ok("una partida normal no avisa nada", tipos(tablero(pN)).length === 0, JSON.stringify(TX.avisos(tablero(pN), Object.assign({}, CAT, { tableros: [] }), AHORA)));

// Se desconectó.
ok("el tablero que deja de transmitir con la partida en curso: urgente",
  (() => { const a = TX.avisos(tablero(pN, { partida: Object.assign({}, tablero(pN).partida, { live: false }) }), Object.assign({}, CAT, { tableros: [] }), AHORA); return a.length && a[0].tipo === "desconectado" && a[0].nivel === "urgente"; })());
// Terminada (con resultado del árbitro): no es «desconectado».
ok("si el árbitro ya anotó el resultado, que no transmita no es un problema",
  !tipos(tablero(pN, { partida: Object.assign({}, tablero(pN).partida, { live: false }), cr: Object.assign({}, tablero(pN).cr, { resultado: "1-0" }) })).includes("desconectado"));

// El reloj.
const sinReloj = tablero(pN); sinReloj.partida = Object.assign({}, sinReloj.partida, { reloj: null, jugadas: NORMAL.slice() });
ok("no llega el reloj (jugadas sin tiempo y sin reloj): urgente", tipos(sinReloj).includes("reloj_apagado"));
const detenido = tablero(pN); detenido.partida.reloj = Object.assign({}, detenido.partida.reloj, { corre: null, hora: AHORA - 90 * 1000 });
ok("el reloj detenido hace 90 s: a mirar", TX.avisos(detenido, Object.assign({}, CAT, { tableros: [] }), AHORA).some((x) => x.tipo === "reloj_detenido" && x.nivel === "revisar"));
detenido.partida.reloj.hora = AHORA - 6 * 60 * 1000;
ok("el reloj detenido hace 6 min: urgente", TX.avisos(detenido, Object.assign({}, CAT, { tableros: [] }), AHORA).some((x) => x.tipo === "reloj_detenido" && x.nivel === "urgente"));
detenido.partida.reloj.hora = AHORA - 30 * 1000;
ok("el reloj detenido hace 30 s (una pausa corta): no avisa", !tipos(detenido).includes("reloj_detenido"));
// La jugada que el tablero no registró: el reloj corre para quien, según el tablero, ya jugó.
const noRegistrada = tablero(pN); noRegistrada.partida.reloj = Object.assign({}, noRegistrada.partida.reloj, { corre: "negras", hora: pN.ultima + 1000 });
ok("el reloj corre para quien ya jugó (el tablero no registró la jugada): urgente", tipos(noRegistrada).includes("reloj_no_coincide"));
// El reloj que no suma el incremento.
const pSin = partida(NORMAL, { inc: 0 });
ok("el reloj que no suma los 30 s: mal configurado", tipos(tablero(pSin)).includes("reloj_config"));
const pMas = partida(NORMAL, { base: 7200 });
ok("el reloj que empezó con más tiempo que el ritmo: mal configurado", tipos(tablero(pMas)).includes("reloj_config"));
// La bandera.
const bandera = tablero(pN); bandera.partida.reloj = Object.assign({}, bandera.partida.reloj, { blancas: 40, corre: "blancas", hora: AHORA - 60000 });
ok("al reloj que corre se le acabó el tiempo: la bandera", tipos(bandera).includes("bandera"));

// Las jugadas.
const ilegal = tablero(pN); ilegal.partida = Object.assign({}, ilegal.partida, { jugadas: pN.jug.concat(["Ke8 5000+5"]) });
ok("una jugada imposible: urgente, con la jugada en la notación de la planilla", TX.avisos(ilegal, Object.assign({}, CAT, { tableros: [] }), AHORA).some((x) => x.tipo === "ilegal" && x.nivel === "urgente" && /8\. Re8/.test(x.texto)));
const vieja = tablero(partida(NORMAL, { desde: AHORA - 22 * 3600 * 1000 }));
ok("jugadas de hace 22 horas: el tablero no se reinició", tipos(vieja).includes("vieja") && !tipos(vieja).includes("quieto"));
const quieto = tablero(partida(NORMAL, { desde: AHORA - 40 * 60000 - 14 * 20000 }));
quieto.partida.reloj.hora = AHORA - 40 * 60000;
ok("40 minutos sin jugadas con el reloj corriendo: a mirar", TX.avisos(quieto, Object.assign({}, CAT, { tableros: [] }), AHORA).some((x) => x.tipo === "quieto" && x.nivel === "revisar"));

// Las tablas y los finales.
const TRIPLE = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"];
ok("la triple repetición: a mirar (la reclama un jugador)", TX.avisos(tablero(partida(TRIPLE)), Object.assign({}, CAT, { tableros: [] }), AHORA).some((x) => x.tipo === "triple" && x.nivel === "revisar" && /art\. 9\.2/.test(x.texto)));
const QUINTA = TRIPLE.concat(TRIPLE);
const q = TX.avisos(tablero(partida(QUINTA)), Object.assign({}, CAT, { tableros: [] }), AHORA);
ok("la quíntuple: urgente y sin la triple de más", q.some((x) => x.tipo === "quintuple" && x.nivel === "urgente" && /9\.6\.1/.test(x.texto)) && !q.some((x) => x.tipo === "triple"));
const MATE = ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"];
ok("mate en el tablero sin resultado: a mirar", tipos(tablero(partida(MATE))).includes("mate"));
ok("mate con su resultado: nada", tipos(tablero(partida(MATE), { partida: Object.assign({}, tablero(partida(MATE)).partida, { resultado: "WHITEWIN" }) })).length === 0);

// Los jugadores y el resultado.
const otros = tablero(pN, { coincide: false, en_otra_mesa: 7, lc: { blancas: "Rojas Uno", negras: "Mora Dos", resultado: "*", live: true } });
const ao = TX.avisos(otros, Object.assign({}, CAT, { tableros: [] }), AHORA);
ok("otros jugadores en el tablero: urgente y dice en qué mesa están", ao.some((x) => x.tipo === "nombres" && x.nivel === "urgente" && /mesa 7/.test(x.texto)));
ok("con el cambio hecho por el encargado, ya no avisa", !tipos(Object.assign({}, otros, { cambio: { por: "Ana", actualizado: new Date(AHORA).toISOString() } })).includes("nombres"));
ok("colores al revés", tipos(tablero(pN, { coincide: false, al_reves: true })).includes("al_reves"));
const distinto = tablero(partida(MATE), { cr: { mesa: 3, blancas: "A B", negras: "C D", resultado: "0-1" } });
distinto.partida.resultado = "WHITEWIN";
ok("el resultado del tablero no coincide con el del árbitro: urgente", tipos(distinto).includes("resultado_distinto"));
ok("los resultados se comparan igual escritos de las dos formas", TX.resultadoNormal("1/2") === "½-½" && TX.resultadoNormal("DRAW") === "½-½" && TX.resultadoNormal("0f-1f") === null && TX.resultadoNormal("*") === null);
ok("la categoría que no transmite: urgente", TX.avisosDeCategoria(Object.assign({}, CAT, { error: "LiveChess no abre esta categoría." }), AHORA).some((x) => x.tipo === "categoria" && x.nivel === "urgente"));
ok("LiveChess sin el pareo de la ronda: urgente", TX.avisosDeCategoria(Object.assign({}, CAT, { sin_pareo: true }), AHORA).some((x) => x.tipo === "sin_ronda"));
ok("cada aviso tiene su clave estable (no se repite ni cambia entre lecturas)", (() => { const a = TX.avisos(ilegal, Object.assign({}, CAT, { tableros: [] }), AHORA), b = TX.avisos(ilegal, Object.assign({}, CAT, { tableros: [] }), AHORA + 10000); return a.map((x) => x.clave).join() === b.map((x) => x.clave).join() && new Set(a.map((x) => x.clave)).size === a.length; })());

// ---- LiveChess: el reloj solo o lo pensado solo
const lj = V.leerJugadas(["e4 5456", "e5 5449", "Nf3 5470+16", "Ba6 2912", "g6 +152", "Rd1"], Date.UTC(2026, 10, 4, 21));
ok("«Ba6 2912» trae el reloj sin lo pensado", lj.relojes[3].reloj === 2912 && lj.relojes[3].gasto == null);
ok("«g6 +152» trae lo pensado sin el reloj", lj.relojes[4].reloj == null && lj.relojes[4].gasto === 152);
ok("«Rd1» solo, sin nada", lj.sans[5] === "Rd1" && lj.relojes[5].reloj == null);

// ---- la Edge Function
const fn = leer("supabase/functions/centroamericano-transmision/index.ts");
const deJs = leer("js/centroamericano-transmision-reloj.js");
const regla = (t) => {
  const p = (t.match(/const palabras = [^;]*;/) || [""])[0];
  const f = (t.match(/function mismoJugador\([^)]*\) \{[\s\S]*?\n\s*\}\n/) || [""])[0];
  return (p + "\n" + f).replace(/: unknown/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
};
ok("la regla de los nombres es la misma en el navegador y en la función", regla(fn) && regla(fn) === regla(deJs));
ok("`run` de LiveChess: true las blancas, false las negras, null detenido", /corre: g\.clock\.run === true \? "blancas" : g\.clock\.run === false \? "negras" : null/.test(fn));
const respuestas = fn.match(/json\(\{[^;]*\}/g) || [];
const sinTextos = (x) => x.replace(/"(?:[^"\\]|\\.)*"/g, '""');
ok("nunca devuelve el id de LiveChess ni un token", respuestas.length > 5 && respuestas.every((x) => !/torneo_id|\btoken\b/.test(sinTextos(x))) && !/\.\.\.lc\b/.test(fn));
ok("un enlace apagado o vencido no lee nada", /e\.revocada\) return json/.test(fn) && /new Date\(e\.vence\)\.getTime\(\) <= Date\.now\(\)/.test(fn));
ok("sin enlace, hace falta la herramienta «mesa-arbitro»", /tengo_herramienta", \{ p_herramienta: "mesa-arbitro" \}/.test(fn));
ok("los nombres del cambio salen de los emparejamientos de chess-results, no del navegador", /const m = mesas\.find\(\(x\) => Number\(x\.mesa\) === mesa\)/.test(fn) && !/cuerpo\.blancas|cuerpo\.negras/.test(fn));
ok("las mesas son todas: la lectura compartida y los emparejamientos completos", /centroamericano_fp_partidas/.test(fn) && /unirMesas\(/.test(fn));
const desplegadas = leer("supabase/esquema/funciones-desplegadas.txt");
ok("está en la lista de desplegadas, sin JWT (el encargado no tiene sesión)", /^centroamericano-transmision\s+false\s/m.test(desplegadas));

// ---- la migración
const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /_centroamericano_transmision\.sql$/.test(f)).map((f) => leer("supabase/migraciones/" + f)).join("\n");
ok("las tres tablas, con RLS y sin permisos para anon", ["centroamericano_tx_enlaces", "centroamericano_tx_tableros", "centroamericano_tx_atendidas"].every((t) =>
  new RegExp("alter table public\\." + t + " enable row level security").test(mig) && new RegExp("revoke all on public\\." + t + " from public, anon, authenticated").test(mig)));
ok("los enlaces llevan auditoría (reparten acceso)", /create trigger auditar after insert or update or delete on public\.centroamericano_tx_enlaces/.test(mig));
ok("una mesa no puede quedar en dos tableros", /create unique index centroamericano_tx_tableros_mesa_unica on public\.centroamericano_tx_tableros \(tnr, ronda, mesa\)/.test(mig));
ok("los enlaces en VIGILADAS de la auditoría", /"centroamericano_tx_enlaces"/.test(leer("herramientas/verificar-auditoria.js")));

// ---- las páginas
const pag = leer("centroamericano-transmision.html"), pagJs = leer("js/centroamericano-transmision-pagina.js");
ok("la página del encargado: noindex, chess.js y el módulo", /name="robots" content="noindex"/.test(pag) && /js\/vendor\/chess\.js/.test(pag) && /js\/centroamericano-transmision\.js/.test(pag) && /id="tx-app"/.test(pag));
ok("el token va después del «#» y no se guarda en el navegador", /location\.hash/.test(pagJs) && !/localStorage|sessionStorage/.test(pagJs));
const org = leer("centroamericano-mesas.html"), orgJs = leer("js/centroamericano-mesas-pagina.js");
ok("la pestaña «Transmisión» de la organización", /id="pest-transmision"/.test(org) && /id="panel-transmision"/.test(org) && /"transmision"\]/.test(orgJs) && /CentroamericanoTransmision\.iniciar\(\{ raiz: \$\("tx-app"\), principal: true/.test(orgJs));
const mod = leer("js/centroamericano-transmision.js");
ok("sin sonido (en la sala no hay ruido): ni Audio ni AudioContext", !/new Audio|AudioContext|\.play\(/.test(mod));
ok("el brillo con «reducir movimiento» queda quieto", /prefers-reduced-motion: reduce\)[\s\S]*tx-tarjeta\[data-brilla="urgente"\][^}]*animation: none/.test(leer("css/centroamericano-mesas.css")));
ok("nada de alert/confirm/prompt", !/\b(alert|confirm|prompt)\(/.test(mod.replace(/Avisos\.confirmar\(/g, "")));

// ---- las mejoras del 5/11: avisar al árbitro, el historial, la pantalla grande y el tablero en grande
ok("«avisar» manda el aviso de la organización solo a los árbitros con enlace vigente de ESA mesa", /from\("centroamericano_avisos"\)\s*\.insert\(destino\.map\(\(a\) => \(\{ de: "organizacion", asignacion_id: a\.id, mesa/.test(fn) && /\.eq\("revocada", false\)\.gt\("vence"/.test(fn) && /mesa >= a\.mesa_desde && mesa <= a\.mesa_hasta/.test(fn));
ok("el historial guarda la PRIMERA vez que se vio cada aviso (no la pisa)", /from\("centroamericano_tx_historial"\)\.upsert\(filas, \{ onConflict: "clave", ignoreDuplicates: true \}\)/.test(fn));
ok("el historial solo acepta torneos que existen y tipos con su forma", /validos\.has\(f\.tnr\) && \/\^\[a-z_0-9\]\{2,40\}\$\/\.test\(f\.tipo\)/.test(fn));
const mig2 = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /_centroamericano_transmision_historial\.sql$/.test(f)).map((f) => leer("supabase/migraciones/" + f)).join("\n");
ok("la tabla del historial, con RLS y sin permisos para anon", /alter table public\.centroamericano_tx_historial enable row level security/.test(mig2) && /revoke all on public\.centroamericano_tx_historial from public, anon, authenticated/.test(mig2));
ok("el informe de la transmisión en PDF va con ReportePDF (la marca de agua) y la página trae sus scripts", /ReportePDF\.generar\(/.test(mod) && /js\/reporte-pdf\.js/.test(pag) && /js\/marca-agua\.js/.test(pag));
ok("la pantalla grande es pantalla completa y sale con Esc", /requestFullscreen/.test(mod) && /fullscreenchange/.test(mod));
ok("la pantalla grande muestra solo los tableros con un problema", /const soloConAvisos = soloAvisos \|\| proyector/.test(mod));
ok("el tablero en grande se recorre con las flechas y sigue solo en la última jugada", /ArrowLeft: -1, ArrowRight: 1/.test(mod) && /if \(grande\.siguiendo\) grande\.ply = a\.legales\.length/.test(mod));
ok("cada aviso se registra una sola vez por pantalla", /registrados\.has\(y\.x\.clave\)/.test(mod));

console.log((fallas ? "✗ " : "✓ ") + (pruebas - fallas) + " de " + pruebas + " pruebas del encargado de transmisión");
process.exit(fallas ? 1 : 0);
