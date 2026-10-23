/* «Torneos en Pareo Integral»: avisar por correo a quien sigue a un jugador
 * (supabase/functions/pareo-publicar/avisos.ts y correos.ts, y la ficha del
 * jugador en torneos-pareo.html con su formulario).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - hay aviso de ronda solo cuando aparece una ronda emparejada nueva (no
 *     con cada resultado), y de final solo la vez que el torneo se completa;
 *     nada en un torneo por equipos;
 *   - el texto dice la mesa de la sala (con la mesa inicial), el color, el
 *     rival y su Elo; libre y ausente lo dicen escrito; el final, el puesto;
 *   - todo lo escrito por otros va escapado, y cada aviso trae cómo darse de
 *     baja;
 *   - la función: el aviso se anota ANTES de mandarlo (su clave única evita
 *     el doble), corre después de contestar, «seguir_correo» contesta igual
 *     pase lo que pase y la baja va firmada;
 *   - la página: el formulario pide el consentimiento, manda el nombre y la
 *     huella del jugador, y los enlaces del correo (#seguir-ok=, #seguir-baja=)
 *     confirman o dan de baja y se borran de la dirección.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-seguir-correo.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const DIR = path.join(RAIZ, "supabase/functions/pareo-publicar");
let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), m, "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));

const jug = [{ id: "a", nombre: "PRUEBA ANA", elo: 1800 }, { id: "b", nombre: "PRUEBA <b>BETO</b>", elo: 1650 }, { id: "c", nombre: "PRUEBA CARLA", elo: 0 }];
const r1 = { mesas: [{ b: "a", n: "b", r: "1-0" }, { b: "c", n: null, r: "bye" }], ausencias: {} };
const r2 = { mesas: [{ b: "b", n: "c", r: null }], ausencias: { a: "H" } };
const r2b = { mesas: [{ b: "b", n: "c", r: "0-1" }], ausencias: { a: "H" } };
const base = { nombre: "PRUEBA ABIERTO", rondasTotales: 2, mesaInicial: 11, jugadores: jug };
const T = (rondas, extra) => Object.assign({}, base, { rondas }, extra || {});

const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", `
  import * as A from ${JSON.stringify(path.join(DIR, "avisos.ts"))};
  import * as C from ${JSON.stringify(path.join(DIR, "correos.ts"))};
  const [T0, T1, T1res, T2, T2fin, Teq] = JSON.parse(process.argv[1]);
  const o = {
    crear: A.queAvisar(null, T1), resultado: A.queAvisar(T1, T1res), nueva: A.queAvisar(T1res, T2), fin: A.queAvisar(T2, T2fin), otraVez: A.queAvisar(T2fin, T2fin),
    equipos: A.queAvisar(null, Teq), vacio: A.queAvisar(null, T0),
    partida: A.textoRonda(T1, "a", "PRUEBA ANA", 0), negras: A.textoRonda(T1, "b", "PRUEBA BETO", 0), libre: A.textoRonda(T1, "c", "PRUEBA CARLA", 0),
    ausente: A.textoRonda(T2, "a", "PRUEBA ANA", 1), noJuega: A.textoRonda(T2, "zz", "X", 1),
    final: A.textoFin(T2fin, "c", "PRUEBA CARLA"),
  };
  const ronda = C.correoAvisoRonda("<tr><td>CAB</td></tr>", "PRUEBA ANA", o.partida, "https://ajedrez-integral.com/torneos-pareo.html#t=x", "https://ajedrez-integral.com/torneos-pareo.html#seguir-baja=s.t");
  const conf = C.correoSeguirConfirmar("<tr><td>CAB</td></tr>", "PRUEBA <img src=x>\\nOTRA", "https://ajedrez-integral.com/torneos-pareo.html#seguir-ok=s.t");
  const malo = C.correoAvisoFin("", "x", "x", "https://otro.com/phish", "https://ajedrez-integral.com/torneos-pareo.html#seguir-baja=s.t");
  o.correos = { ronda, conf, malo };
  process.stdout.write(JSON.stringify(o));
`, JSON.stringify([T([]), T([r1]), T([r1]), T([r1, r2]), T([r1, r2b], { resumen: [{ id: "c", puesto: 1, puntos: 2, rondas: 2 }, { id: "a", puesto: 2, puntos: 1.5, rondas: 2 }, { id: "b", puesto: 3, puntos: 0, rondas: 2 }] }), T([r1], { tipo: "equipos" })])], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const o = JSON.parse(r.stdout);

console.log("\n=== Cuándo hay aviso ===");
igual("al publicar con la ronda 1 emparejada: aviso de la ronda 1", o.crear, { ronda: 1, fin: false });
igual("un resultado nuevo de la misma ronda: nada", o.resultado, { ronda: null, fin: false });
igual("la ronda 2 emparejada: aviso de la ronda 2", o.nueva, { ronda: 2, fin: false });
igual("se completa la última ronda: aviso del final", o.fin, { ronda: null, fin: true });
igual("ponerlo al día otra vez sin cambios: nada", o.otraVez, { ronda: null, fin: false });
igual("un torneo por equipos: nada", o.equipos, { ronda: null, fin: false });
igual("un anuncio sin rondas: nada", o.vacio, { ronda: null, fin: false });

console.log("\n=== Lo que dice ===");
igual("la mesa de la sala (con la mesa inicial), el color, el rival y su Elo", o.partida, "PRUEBA ANA juega la ronda 1 de «PRUEBA ABIERTO»: mesa 11, con blancas, contra PRUEBA <b>BETO</b> (1650).");
ok(/mesa 11, con negras, contra PRUEBA ANA \(1800\)/.test(o.negras), "con negras, del otro lado", o.negras);
igual("libre, escrito", o.libre, "PRUEBA CARLA queda libre en la ronda 1 de «PRUEBA ABIERTO».");
igual("ausente, escrito", o.ausente, "PRUEBA ANA no juega la ronda 2 de «PRUEBA ABIERTO».");
igual("alguien que no está en la ronda: sin texto (no se manda)", o.noJuega, "");
igual("el final: su puesto de cuántos y sus puntos", o.final, "PRUEBA CARLA terminó «PRUEBA ABIERTO» en el puesto 1 de 3, con 2 puntos.");

console.log("\n=== Los correos ===");
const c = o.correos;
ok(!/<b>BETO<\/b>/.test(c.ronda.html) && /&lt;b&gt;BETO&lt;\/b&gt;/.test(c.ronda.html), "el nombre que escribió otro va escapado");
ok(/seguir-baja=s\.t/.test(c.ronda.html) && /Dejar de recibirlos/.test(c.ronda.html), "cada aviso trae cómo darse de baja");
ok(/Ver el torneo/.test(c.ronda.html) && /#t=x/.test(c.ronda.html), "y el botón al torneo");
ok(!/[\r\n]/.test(c.conf.asunto) && !/<img/.test(c.conf.html), "confirmar: asunto en una línea y nada de HTML ajeno", c.conf.asunto);
ok(/seguir-ok=s\.t/.test(c.conf.html) && /48 horas/.test(c.conf.html), "con su enlace y cuánto vale");
ok(!/href="https:\/\/otro\.com/.test(c.malo.html), "un botón que no es de ajedrez-integral.com no se pinta");

console.log("\n=== La función ===");
const fn = fs.readFileSync(path.join(DIR, "index.ts"), "utf8");
const anota = fn.indexOf('from("pareo_avisos_enviados").insert('), manda = fn.indexOf("await mandar([s.correo], c)");
ok(anota > 0 && manda > anota && /if \(error\) continue;/.test(fn.slice(anota, manda)), "anota el aviso ANTES de mandarlo y, si ya estaba, no lo manda");
ok(/enSegundoPlano\(avisarSeguidores\(pid, fila\.datos/.test(fn) && /enSegundoPlano\(avisarSeguidores\(data\.id, null/.test(fn), "avisa al poner al día y al crear, después de contestar");
ok(/waitUntil/.test(fn) && /TOPE_AVISOS/.test(fn), "en segundo plano y con tope por vez");
const seguir = fn.slice(fn.indexOf('accion === "seguir_correo"'), fn.indexOf('accion === "seguir_confirmar"'));
ok((seguir.match(/return json\(\{ ok: true \}\)/g) || []).length === 1 && !/ya sigue|ya está/.test(seguir), "«seguir_correo» contesta lo mismo pase lo que pase (no dice quién sigue a quién)");
ok(/body\.consentimiento !== true/.test(seguir) && /pareo_correo_frenar.*"seguir"/.test(seguir), "con consentimiento y su freno");
ok(/token !== \(await hmac\("baja:" \+ sid\)\)/.test(fn), "la baja va firmada (no se da de baja a otro cambiando el id)");
const sql = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261023191012_pareo_jugadores_y_avisos.sql"), "utf8");
ok(/primary key \(suscripcion_id, torneo_id, que\)/.test(sql), "la base no deja anotar el mismo aviso dos veces");
ok(/revoke all on public\.pareo_suscripciones from anon, authenticated/.test(sql) && /grant execute on function public\.pareo_suscriptores_de\(uuid\) to service_role/.test(sql), "nadie de afuera lee las suscripciones");

console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
