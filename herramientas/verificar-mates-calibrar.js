/* ===== Verificador: la calibración de los Mates recupera la dificultad =====
 *
 * Todavía no hay intentos reales suficientes para calibrar (ver «Calibrar los
 * Mates con los intentos reales»), así que el ajuste se prueba con datos
 * INVENTADOS de dificultad conocida: alumnos de fuerza sabida (unos con
 * diagnóstico, otros con Elo de perfil, otros sin nada) intentan mates de
 * dificultad sabida, y cada intento sale limpio con la probabilidad del
 * modelo. Si el ajuste funciona, las dificultades que da siguen a las de
 * verdad; si no, ordenar los Mates por ellas sería ordenar por ruido.
 *
 * También revisa que el archivo publicado (entreno/data/mates-dificultad.json)
 * sea solo agregado —nada de alumnos— y coherente con mates.json.
 *
 * Uso: node herramientas/verificar-mates-calibrar.js
 */
const fs = require("fs");
const path = require("path");
const { ajustar, publicar, CENTRO_INICIAL, PE } = require("./lib/mates-ajuste");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
const ok = (cond, texto, detalle) => {
  if (cond) console.log("  ✓ " + texto);
  else { fallos += 1; console.log("  ✗ " + texto + (detalle !== undefined ? "\n      " + detalle : "")); }
};

/* Azar con semilla: la prueba sale igual cada vez. */
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function normal(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
function pearson(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sx += (x - mx) ** 2; sy += (ys[i] - my) ** 2; });
  return sxy / Math.sqrt(sx * sy);
}
function spearman(xs, ys) {
  const rango = (v) => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = []; o.forEach(([, i], j) => { r[i] = j; }); return r; };
  return pearson(rango(xs), rango(ys));
}

/* ---------- 1. con datos inventados ---------- */
console.log("\n=== El ajuste recupera dificultades conocidas ===");
const r = azar(20260929);
const VERDAD_CENTRO = { mate1: 1150, mate2: 1500, mate3: 1850 };   // a propósito, lejos de CENTRO_INICIAL
const mates = [];
Object.keys(VERDAD_CENTRO).forEach((cat) => {
  for (let i = 1; i <= 60; i++) mates.push({ id: `${cat}-${String(i).padStart(4, "0")}`, cat, d: Math.round(VERDAD_CENTRO[cat] + 250 * normal(r)) });
});
const alumnos = [];
for (let k = 1; k <= 120; k++) {
  const f = Math.round(1400 + 350 * normal(r));
  const cual = k % 3;   // 0: diagnóstico, 1: Elo de perfil (nacional), 2: sin nada
  alumnos.push({
    k, f,
    medido: cual === 0 ? Math.round(f + 80 * normal(r)) : null, error: cual === 0 ? 80 : null,
    elo: cual === 1 ? Math.round(f + 150 * normal(r)) : null, tipo: cual === 1 ? "nacional" : null,
  });
}
const intentos = [];
alumnos.forEach((a) => {
  mates.forEach((m) => {
    if (r() > 0.25) return;   // cada alumno intenta una cuarta parte
    intentos.push({ k: a.k, id: m.id, limpio: r() < PE.probabilidad(a.f, m.d, 0) });
  });
});
// Una fila repetida (se borró el navegador y lo volvió a resolver): cuenta la primera.
intentos.push(Object.assign({}, intentos[0], { limpio: !intentos[0].limpio }));
const datos = { alumnos: alumnos.map(({ k, medido, error, elo, tipo }) => ({ k, medido, error, elo, tipo })), intentos };

const ajuste = ajustar(datos);
const MINIMO = 8;
const total = { mate1: 60, mate2: 60, mate3: 60 };
const pub = publicar(ajuste, total, MINIMO, "2026-09-29");

const conDatos = mates.filter((m) => pub.elo[m.id] !== undefined);
ok(conDatos.length >= 170, `casi todos los mates tienen ${MINIMO} intentos o más y se publican`, conDatos.length);
const rho = spearman(conDatos.map((m) => m.d), conDatos.map((m) => pub.elo[m.id]));
ok(rho > 0.85, `el ORDEN por dificultad sigue al de verdad (Spearman ${rho.toFixed(2)})`);
const dentro = {};
Object.keys(VERDAD_CENTRO).forEach((cat) => {
  const ms = conDatos.filter((m) => m.cat === cat);
  dentro[cat] = spearman(ms.map((m) => m.d), ms.map((m) => pub.elo[m.id]));
});
ok(Object.values(dentro).every((x) => x > 0.6),
  "también DENTRO de cada categoría, que es lo que la página ordena",
  JSON.stringify(Object.fromEntries(Object.entries(dentro).map(([c, x]) => [c, x.toFixed(2)]))));
const mae = conDatos.reduce((s, m) => s + Math.abs(pub.elo[m.id] - m.d), 0) / conDatos.length;
ok(mae < 200, `el error medio es de ${Math.round(mae)} puntos (la escala queda anclada al Elo por los diagnósticos)`);
Object.keys(VERDAD_CENTRO).forEach((cat) => {
  ok(Math.abs(pub.categorias[cat].centro - VERDAD_CENTRO[cat]) < 150,
    `el centro de ${cat} va de ${CENTRO_INICIAL[cat]} a ${pub.categorias[cat].centro} (el de verdad es ${VERDAD_CENTRO[cat]})`);
});
const fuerzaMae = alumnos.filter((a) => a.k % 3 === 2).reduce((s, a) => s + Math.abs(ajuste.alumnos[a.k].fuerza - a.f), 0) / 40;
ok(fuerzaMae < 250, `la fuerza de quien no tenía ninguna medida sale de sus mates (error medio ${Math.round(fuerzaMae)})`);
ok(pub.intentos === intentos.length - 1, "la fila repetida de un mismo alumno cuenta una vez", `${pub.intentos} de ${intentos.length}`);

/* Con el mínimo justo: cada mate lo intentan unos 8 alumnos. Es lo que habrá
   la primera vez que alcance para calibrar, y lo que justifica MINIMO = 8. */
{
  const r2 = azar(7);
  const escasos = [];
  alumnos.forEach((a) => mates.forEach((m) => {
    if (r2() < 0.07) escasos.push({ k: a.k, id: m.id, limpio: r2() < PE.probabilidad(a.f, m.d, 0) });
  }));
  const pub2 = publicar(ajustar({ alumnos: datos.alumnos, intentos: escasos }), total, MINIMO, "x");
  const porCat = Object.keys(VERDAD_CENTRO).map((cat) => {
    const ms = mates.filter((m) => m.cat === cat && pub2.elo[m.id] !== undefined);
    return [cat, ms.length, spearman(ms.map((m) => m.d), ms.map((m) => pub2.elo[m.id]))];
  });
  ok(porCat.every(([, n, x]) => n >= 10 && x > 0.6),
    `con unos ${Math.round(escasos.length / mates.length)} intentos por mate, lo publicado ya sigue al orden de verdad dentro de cada categoría`,
    porCat.map(([c, n, x]) => `${c}: ${n} mates, ${x.toFixed(2)}`).join("; "));
}

/* Con pocos intentos no se publica: sería la previa disfrazada de medida. */
const pocos = ajustar({ alumnos: datos.alumnos, intentos: intentos.filter((t) => t.id === "mate2-0001").slice(0, MINIMO - 1) });
ok(Object.keys(publicar(pocos, total, MINIMO, "x").elo).length === 0, `un mate con menos de ${MINIMO} intentos no se publica`);

/* Lo publicado no lleva nada de nadie. */
const texto = JSON.stringify(pub);
ok(!/"k"|"medido"|"fuerza"|"tipo"|"student|"limpio"/.test(texto), "lo publicado es solo agregado: ni alumnos, ni fuerzas, ni intentos sueltos");

/* ---------- 2. el archivo publicado ---------- */
console.log("\n=== entreno/data/mates-dificultad.json ===");
const archivo = path.join(RAIZ, "entreno/data/mates-dificultad.json");
const real = JSON.parse(fs.readFileSync(archivo, "utf8"));
const banco = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/mates.json"), "utf8"));
const ids = new Set(banco.map((p) => p.id));
ok(Object.keys(real).sort().join() === "alumnos,categorias,elo,generado,intentos,minimo",
  "trae solo generado, intentos, alumnos, minimo, categorias y elo", Object.keys(real).join());
ok(!/"k"|"medido"|"fuerza"|"student|"limpio"/.test(JSON.stringify(real)), "no trae datos de alumnos");
const raros = Object.keys(real.elo).filter((id) => !ids.has(id));
ok(!raros.length, "cada mate calibrado existe en mates.json", raros.slice(0, 5).join(", "));
Object.keys(CENTRO_INICIAL).forEach((cat) => {
  const c = real.categorias[cat] || {};
  const cuenta = Object.keys(real.elo).filter((id) => id.startsWith(cat + "-")).length;
  ok(c.total === banco.filter((p) => p.category === cat).length && c.calibrados === cuenta,
    `${cat}: ${c.calibrados} de ${c.total} calibrados, y cuadra con mates.json`, JSON.stringify(c));
});
ok(Object.values(real.elo).every((e) => Number.isInteger(e) && e >= 100 && e <= 3200), "cada dificultad es un Elo entero entre 100 y 3200");
ok(real.minimo >= MINIMO, `se publicó con un mínimo de ${real.minimo} intentos por mate`);

if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron.`); process.exit(1); }
console.log("\nTodo en orden.");
