/* El lector de los torneos de ajedrezcostarica.com
 * (supabase/functions/torneos-externos/leer.ts), contra páginas escritas con
 * la misma forma que las de verdad (23/10/2026): Next.js, con el JSON dentro
 * de los <script> y las comillas escapadas. Los datos son inventados.
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - la portada da cada torneo una sola vez, con las fechas de SU tarjeta
 *     (no las del siguiente);
 *   - la ficha se lee dentro del bloque del torneo: la página trae antes los
 *     textos de la interfaz («location":"Ubicación»), y leer el primero que
 *     aparece daba «Ubicación» como lugar de todos;
 *   - los números se traducen: ritmo 3 es rápido, Elo 4 es FIDE y nacional,
 *     la provincia 6 es Puntarenas;
 *   - nunca sale nada que no se va a mostrar (los correos y las
 *     instrucciones de pago que trae la ficha);
 *   - una página que cambió de forma da null o una lista vacía, nunca un
 *     torneo inventado; y la función, con la portada vacía, no toca nada.
 *
 * Uso:  node herramientas/verificar-torneos-externos.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), m, "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));

// Como en la página: \" dentro de un <script>.
const esc = (o) => JSON.stringify(o).replace(/"/g, '\\"');
const tarjeta = (id, start, end) => `["$","$L59",null,{"ref":"$undefined","href":"/es/tournaments/${id}","target":"_self","children":["$","div",null,{"children":[["$","$L7b",null,{"start":"${start}","end":"${end}"}]]}]}]`;
const portada = `<!DOCTYPE html><html lang="es"><head><title>Torneos | Ajedrez Costa Rica</title></head><body>
<a href="/es/tournaments/901">PRUEBA uno</a>
<script>self.__next_f.push([1,"${esc({ Nav: { tournaments: "Torneos" }, filters: { startDate: "Fecha de inicio" } }).slice(1, -1)}"])</script>
<script>self.__next_f.push([1,"75:${tarjeta(901, "2026-11-21T15:00:00.000Z", "2026-11-21T23:00:00.000Z").replace(/"/g, '\\"')}\\n76:${tarjeta(902, "2026-12-05T06:00:00.000Z", "2026-12-06T06:00:00.000Z").replace(/"/g, '\\"')}\\n77:${tarjeta(901, "2026-11-21T15:00:00.000Z", "2026-11-21T23:00:00.000Z").replace(/"/g, '\\"')}\\n78:${tarjeta(903, "no es fecha", "2026-12-07T06:00:00.000Z").replace(/"/g, '\\"')}"])</script>
</body></html>`;

const ficha = (id, extra) => {
  const t = Object.assign({
    id: String(id),
    details: { title: "PRUEBA Torneo Rápido", price: 8000, region: 6, subRegion: 601, modality: 1, rating: 4, format: 1, platform: "", prizes: "$6a",
      location: "Salón PRUEBA, Paquera", about: "", chessResultsUrl: "https://s2.chess-results.com/tnr999999.aspx", rulesUrl: "", priceCurrency: "CRC", images: {} },
    gameTime: { gamePace: 3, minutes: 10, increment: 2 },
    schedule: [{ schedule: "2026-11-28T15:00:00.000Z", title: "", isRound: true }, { schedule: "2026-11-28T21:00:00.000Z", title: "Premiación", isRound: false }, { schedule: "2026-11-28T16:00:00.000Z", title: "", isRound: true }],
    organization: { userId: "1", organizationId: "9", name: "Club PRUEBA", description: "", verified: true, image: "" },
    registration: { open: true, capacity: 60, paymentInstructions: "SINPE PRUEBA 8888-8888", notificationEmails: ["prueba@ejemplo.com"] },
  }, extra || {});
  return `<!DOCTYPE html><html><body>
<script>self.__next_f.push([1,"${esc({ TournamentDetails: { title: "Título", location: "Ubicación", gamePace: "Ritmo de juego" } }).slice(1, -1)}"])</script>
<script>self.__next_f.push([1,"23:[\\"$\\",\\"$L69\\",null,{${esc({ tournament: t }).slice(1, -1)},\\"user\\":null,\\"registrationFull\\":false}]"])</script>
</body></html>`;
};

const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { leerLista, leerTorneo } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/torneos-externos/leer.ts"))};
   const [portada, ficha, otra, rara, sinTitulo] = JSON.parse(process.argv[1]);
   process.stdout.write(JSON.stringify({
     lista: leerLista(portada), listaVacia: leerLista("<html><body>Sin torneos</body></html>"),
     torneo: leerTorneo(ficha, 552), otro: leerTorneo(ficha, 553), rara: leerTorneo(rara, 552), sinTitulo: leerTorneo(sinTitulo, 552),
     clasico: leerTorneo(otra, 554),
   }));`, JSON.stringify([portada, ficha(552), ficha(554, { details: { title: "PRUEBA Clásico", region: 1, modality: 2, rating: 1, format: 2, location: "", chessResultsUrl: "javascript:alert(1)", priceCurrency: "USD", price: 100 },
     gameTime: { gamePace: 4, minutes: 90, increment: 30 }, organization: { name: "Org", verified: false }, registration: { open: false } }),
     "<html><body>Esta página cambió</body></html>", ficha(552, { details: { title: "" } })])], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const o = JSON.parse(r.stdout);

console.log("\n=== La portada ===");
igual("cada torneo una vez, en el orden en que salen", o.lista.map((x) => x.id), [901, 902, 903]);
igual("con las fechas de su tarjeta", o.lista.slice(0, 2).map((x) => [x.inicio, x.fin]), [["2026-11-21T15:00:00.000Z", "2026-11-21T23:00:00.000Z"], ["2026-12-05T06:00:00.000Z", "2026-12-06T06:00:00.000Z"]]);
ok(o.lista[2].inicio === null && o.lista[2].fin === "2026-12-07T06:00:00.000Z", "una fecha que no es fecha queda vacía, no se inventa");
igual("una portada sin torneos da una lista vacía", o.listaVacia, []);

console.log("\n=== La ficha ===");
const t = o.torneo || {};
igual("el nombre, el lugar y la provincia (dentro del torneo, no los textos de la página)", [t.titulo, t.lugar, t.provincia], ["PRUEBA Torneo Rápido", "Salón PRUEBA, Paquera", "Puntarenas"]);
igual("el ritmo traducido, con minutos e incremento", [t.ritmo, t.minutos, t.incremento], ["rapido", 10, 2]);
igual("Elo 4 es FIDE y nacional", t.elo, "ambos");
igual("precio, moneda, modalidad y formato", [t.precio, t.moneda, t.modalidad, t.formato], [8000, "CRC", "presencial", "individual"]);
igual("la primera y la última hora del horario, ordenadas", [t.inicio, t.fin], ["2026-11-28T15:00:00.000Z", "2026-11-28T21:00:00.000Z"]);
igual("quién organiza e inscripción abierta", [t.organizador, t.inscripcionAbierta], ["Club PRUEBA", true]);
ok(t.chessResults === "https://s2.chess-results.com/tnr999999.aspx", "el enlace de chess-results");
const todo = JSON.stringify(o.torneo);
ok(!/prueba@ejemplo|SINPE|8888-8888/.test(todo), "no lee los correos ni las instrucciones de pago", todo);
const c = o.clasico || {};
igual("otro: clásico, sin Elo, en línea, por equipos, San José", [c.ritmo, c.elo, c.modalidad, c.formato, c.provincia, c.moneda], ["clasico", "no", "en_linea", "equipos", "San José", "USD"]);
ok(c.chessResults === "", "un enlace que no es de chess-results no se guarda");
ok(c.inscripcionAbierta === false, "inscripción cerrada");
ok(o.otro === null, "un torneo que no está en la página da null");
ok(o.rara === null, "una página que cambió de forma da null, no un torneo inventado");
ok(o.sinTitulo === null, "sin nombre no hay torneo");

console.log("\n=== La función ===");
const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/torneos-externos/index.ts"), "utf8");
ok(/if \(!tarjetas\.length\) return json\(/.test(fn) && fn.indexOf("if (!tarjetas.length)") < fn.indexOf(".upsert("), "con la portada vacía no toca nada (mejor la lista de ayer)");
ok(/jwt !== esperado\) return json\(/.test(fn), "solo la dispara la base, con su secreto");
ok(/\.slice\(0, MAXIMO\)/.test(fn) && /await dormir\(\d+\)/.test(fn), "lee con calma: un tope de fichas y una pausa entre una y otra");
const sql = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261023175201_torneos_externos.sql"), "utf8");
ok(!/correo|pago/.test(sql.replace(/--.*$/gm, "")), "la tabla no tiene columnas para correos ni pagos");

console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
