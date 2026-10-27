/* La plantilla de las páginas de los torneos universitarios
 * (herramientas/torneo-universitario.js): cada página y su js/<config>.js
 * son lo que sale de su configuración en herramientas/torneos-universitarios/.
 * Si alguien edita la página a mano, o cambia la configuración y no la vuelve
 * a armar, esto falla (la página se vería bien y diría otra cosa que su
 * configuración).
 *
 * Y lo que la plantilla no puede ver sola, en cada configuración:
 *   - el logo existe y su tamaño es el que dice;
 *   - la página tiene su portada en PORTADAS de js/salas-torneo.js, con el
 *     mismo logo (así Torneos lleva a ella), y cada «#ficha-…» a la que
 *     llevan sus botones está entre las fichas;
 *   - las ediciones anteriores son clasificaciones de verdad: cada grupo con
 *     su número de torneo, los puestos de 1 en adelante sin bajar, los
 *     puntos de medio en medio y sin subir, cada nombre «Apellidos, Nombre»;
 *   - los grupos de las ediciones son los de esta (los nombres de `grupos`,
 *     o «—» si no tiene), para que se comparen rama con rama;
 *   - cada nombre de `mismaPersona` está en alguna edición anterior.
 *
 *   node herramientas/verificar-plantilla-universitaria.js
 */
const fs = require("fs");
const path = require("path");
const { armar, configuraciones } = require("./torneo-universitario.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : " — " + detalle));
  if (!cond) fallos++;
}

// El ancho y el alto de un PNG, de su cabecera.
function tamPng(ruta) {
  const b = fs.readFileSync(ruta);
  return b.toString("ascii", 1, 4) === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null;
}

const salas = fs.readFileSync(path.join(RAIZ, "js", "salas-torneo.js"), "utf8");
const confs = configuraciones();
ok("hay configuraciones", confs.length >= 2, String(confs.length));

for (const { id, c } of confs) {
  console.log(id);
  for (const [ruta, contenido] of armar(id, c)) {
    const rel = path.relative(RAIZ, ruta);
    const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, "utf8") : "";
    ok(rel + " es lo que sale de su configuración (node herramientas/torneo-universitario.js " + id + ")", actual === contenido);
  }

  const logo = path.join(RAIZ, c.logo.src);
  const tam = fs.existsSync(logo) ? tamPng(logo) : null;
  ok("el logo existe y mide lo que dice (" + c.logo.ancho + "×" + c.logo.alto + ")", !!tam && tam[0] === c.logo.ancho && tam[1] === c.logo.alto, tam ? tam.join("×") : c.logo.src);

  const portada = salas.match(new RegExp('"' + c.torneoPagina.sala + '":\\s*\\{[\\s\\S]*?\\n    \\}'));
  ok("su sala «" + c.torneoPagina.sala + "» tiene portada en js/salas-torneo.js, que lleva a esta página con este logo",
    !!portada && portada[0].includes('pagina: "/' + c.pagina + '"') && portada[0].includes('imagen: "/' + c.logo.src + '"'), portada ? portada[0].slice(0, 160) : "no está");
  // Los botones de Torneos llevan a «página#ficha-…»: esa ficha tiene que estar.
  const ids = new Set(c.fichas.map((f) => f.id).filter(Boolean));
  const pedidas = portada ? [...portada[0].matchAll(/"(ficha-[a-z-]+)"/g)].map((m) => m[1]) : [];
  ok("cada ficha a la que lleva Torneos está en la página", pedidas.every((f) => ids.has(f)), pedidas.filter((f) => !ids.has(f)).join(", "));

  const grupos = c.torneoPagina.grupos ? Object.values(c.torneoPagina.grupos) : ["—"];
  const nombres = new Set();
  (c.ediciones || []).forEach((e) => {
    const gs = Object.keys(e.grupos);
    ok(e.nombre + ": sus grupos son los de esta edición (" + grupos.join(", ") + ")", gs.every((g) => grupos.includes(g)), gs.join(", "));
    gs.forEach((g) => {
      const x = e.grupos[g], js = x.jugadores;
      js.forEach((j) => nombres.add(j[1]));
      const malos = [];
      js.forEach((j, i) => {
        const [p, n, pts] = j;
        if (j.length !== 3 || !Number.isInteger(p) || p < 1 || p > i + 1 || (i && p < js[i - 1][0])) malos.push("puesto " + JSON.stringify(j));
        if (typeof n !== "string" || !/^[^,]+, \S/.test(n)) malos.push("nombre " + JSON.stringify(n));
        if (typeof pts !== "number" || pts * 2 !== Math.round(pts * 2) || pts < 0 || (i && pts > js[i - 1][2])) malos.push("puntos " + JSON.stringify(j));
      });
      ok(e.nombre + " · " + g + ": tnr" + x.tnr + ", " + js.length + " jugadores, en orden y bien escritos",
        Number.isInteger(x.tnr) && x.tnr > 0 && js.length > 0 && js[0][0] === 1 && !malos.length, malos.slice(0, 5).join("; "));
    });
  });
  const sobran = Object.keys(c.mismaPersona || {}).filter((n) => !nombres.has(n));
  ok("cada nombre de mismaPersona está en una edición anterior", !sobran.length, sobran.join(", "));
}

console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
process.exit(fallos ? 1 : 0);
