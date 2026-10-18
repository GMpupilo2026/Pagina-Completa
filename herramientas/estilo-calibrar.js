/* ===== La calibración de la prueba de estilo =====
 *
 * Calcula, para cada posición del banco (js/estilo-items.js), los dos
 * números del modelo de js/estilo-perfil.js, con las respuestas reales:
 *
 *   b  el TIRÓN: hacia qué polo tira la posición aunque las dos jugadas valgan
 *      igual. Si casi todos eligen atacar en una, elegir atacar ahí dice poco.
 *   a  cuánto DISTINGUE: si quienes atacan en el resto de la prueba también
 *      atacan en esta, distingue; si da lo mismo, casi no dice nada.
 *
 * Es el modelo de dos parámetros de siempre, ajustado por máximo a
 * posteriori conjunto: se alternan la tendencia de cada persona (con las
 * posiciones fijas) y los dos números de cada posición (con las personas
 * fijas), hasta que no cambian. Las previas evitan que una posición con pocas
 * respuestas tome valores extremos: a alrededor de 1 (desvío 0,5, entre 0,2 y
 * 3) y b alrededor de 0 (desvío 1). Las respuestas pesan como en la medición
 * (seguridad y tiempo); los controles y las partidas no entran.
 *
 *   - Solo se escriben las posiciones con MINIMO respuestas o más: con menos,
 *     siguen pesando a = 1, b = 0. Conviene volver a calibrar cada vez que se
 *     junten unas 50 pruebas nuevas.
 *   - Las que distinguen poco (a < 0,4 con muchas respuestas) se listan al
 *     final: conviene reemplazarlas por otras del generador
 *     (herramientas/estilo-generar.js, que confirma más de 60 por eje).
 *   - Los datos de personas que se exportan para calibrar NUNCA van al
 *     repositorio: se exportan sin el alumno, solo las respuestas.
 *
 * Cómo se corre:
 *   1. En el proyecto de la Academia (SQL editor o execute_sql), exportar a un
 *      JSON fuera del repositorio:
 *        select version, respuestas from public.estilo_pruebas where version = 1;
 *   2. node herramientas/estilo-calibrar.js /ruta/fuera/del/repo/pruebas.json
 *
 * La salida reemplaza el bloque entre CALIBRADO-INICIO y CALIBRADO-FIN de
 * js/estilo-items.js, que NO se edita a mano. Lo comprueba
 * herramientas/verificar-estilo.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const P = require("../js/estilo-perfil.js");
const B = require("../js/estilo-items.js");
const M = require("../js/estilo-medidas.js");

const MINIMO = 30;
const BANCO = path.join(__dirname, "..", "js", "estilo-items.js");
const sigma = (x) => 1 / (1 + Math.exp(-x));
const recortar = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* pruebas: [{ version, respuestas }] → { id: { a, b, n } } (solo las de MINIMO o más). */
function calibrar(pruebas, opciones) {
  const minimo = (opciones && opciones.minimo) || MINIMO;
  const porId = new Map(B.ITEMS.map((i) => [i.id, i]));
  // Las observaciones: por persona y eje, [{ id, y, w }].
  const personas = [];
  for (const pr of pruebas) {
    // Todas las versiones sirven: las posiciones conservan su id y su
    // contenido de una versión a otra (el generador no toca lo que ya está),
    // y lo que cambia es cuántas se preguntan. Las 45 de la versión 1 se
    // siguen calibrando con las respuestas de entonces.
    if (!(B.FORMAS || {})[pr.version] || !Array.isArray(pr.respuestas)) continue;
    const obs = {}, theta = {};
    for (const e of P.EJES) { obs[e] = []; theta[e] = 0; }
    for (const r of pr.respuestas) {
      if (r.control) continue;
      const it = porId.get(r.id);
      const polo = it && (r.eleccion === "a" ? it.a.polo : r.eleccion === "b" ? it.b.polo : null);
      if (!polo) continue;
      obs[it.eje].push({ id: r.id, y: polo === M.POLOS[it.eje][0] ? 1 : 0, w: (P.SEGURIDAD[r.seguridad] || P.SEGURIDAD[2]) * P.pesoTiempo(r.ms) });
    }
    personas.push({ obs, theta });
  }
  const par = new Map(B.ITEMS.map((i) => [i.id, { a: 1, b: 0, n: 0 }]));
  for (const p of personas) for (const e of P.EJES) for (const o of p.obs[e]) par.get(o.id).n++;

  for (let vuelta = 0; vuelta < 60; vuelta++) {
    // Las personas, con las posiciones fijas (la misma estimación que la medición).
    for (const p of personas) for (const e of P.EJES) {
      p.theta[e] = P.estimar(p.obs[e].map((o) => Object.assign({}, o, par.get(o.id)))).theta;
    }
    // La escala la fijan las personas: media 0 y desvío 1 en cada eje. Sin
    // esto la escala se corre de vuelta en vuelta (`a` se infla y `b` se achica).
    for (const e of P.EJES) {
      const ts = personas.map((p) => p.theta[e]);
      const mu = ts.reduce((x, y) => x + y, 0) / (ts.length || 1);
      const sd = Math.sqrt(ts.reduce((x, y) => x + (y - mu) ** 2, 0) / (ts.length || 1)) || 1;
      for (const p of personas) p.theta[e] = (p.theta[e] - mu) / sd;
    }
    // Las posiciones, con las personas fijas: Newton en (a, b) con sus previas.
    let cambio = 0;
    const porItem = new Map();
    for (const p of personas) for (const e of P.EJES) for (const o of p.obs[e]) {
      if (!porItem.has(o.id)) porItem.set(o.id, []);
      porItem.get(o.id).push({ t: p.theta[e], y: o.y, w: o.w });
    }
    for (const [id, lista] of porItem) {
      const q = par.get(id);
      let a = q.a, b = q.b;
      for (let it = 0; it < 50; it++) {
        // Log-posterior: Σ w [y log σ(a(t−b)) + (1−y) log(1−σ)] − (a−1)²/(2·0,25) − b²/2
        let ga = -(a - 1) / 0.25, gb = -b, haa = -1 / 0.25, hbb = -1, hab = 0;
        for (const x of lista) {
          const d = x.t - b, pr = sigma(a * d), r = x.w * (x.y - pr), v = x.w * pr * (1 - pr);
          ga += r * d; gb += -r * a;
          haa -= v * d * d; hbb -= v * a * a; hab += -r + v * a * d;
        }
        const det = haa * hbb - hab * hab;
        // Fuera de la zona cóncava Newton no sirve: un paso corto cuesta
        // arriba por el gradiente (antes se quedaba quieta, en a = 1 y b = 0).
        const newton = det > 0;
        const da = newton ? (hbb * ga - hab * gb) / det : -0.05 * ga;
        const db = newton ? (haa * gb - hab * ga) / det : -0.05 * gb;
        a = recortar(a - recortar(da, -0.5, 0.5), 0.2, 3);
        b = recortar(b - recortar(db, -0.5, 0.5), -3, 3);
        if (Math.abs(da) + Math.abs(db) < 1e-6) break;
      }
      cambio = Math.max(cambio, Math.abs(a - q.a) + Math.abs(b - q.b));
      q.a = a; q.b = b;
    }
    if (cambio < 1e-4) break;
  }
  const out = {};
  for (const it of B.ITEMS) {
    const q = par.get(it.id);
    if (q.n >= minimo) out[it.id] = { a: Math.round(q.a * 100) / 100, b: Math.round(q.b * 100) / 100, n: q.n };
  }
  return out;
}

if (require.main === module) {
  const archivo = process.argv[2];
  if (!archivo || !fs.existsSync(archivo)) {
    console.error("Uso: node herramientas/estilo-calibrar.js /ruta/fuera/del/repo/pruebas.json");
    process.exit(2);
  }
  if (path.resolve(archivo).startsWith(path.resolve(__dirname, ".."))) {
    console.error("El archivo con las respuestas va FUERA del repositorio: son datos de personas.");
    process.exit(2);
  }
  const pruebas = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const cal = calibrar(pruebas);
  const texto = fs.readFileSync(BANCO, "utf8");
  const ini = texto.indexOf("/* CALIBRADO-INICIO");
  const fin = texto.indexOf("/* CALIBRADO-FIN */");
  if (ini < 0 || fin < 0) throw new Error("Faltan las marcas CALIBRADO-INICIO / CALIBRADO-FIN en " + BANCO);
  const finLinea = texto.indexOf("\n", ini) + 1;
  const cuerpo = "  const CALIBRADO = " + JSON.stringify(cal, null, 1).replace(/\n/g, "\n  ") + ";\n  ";
  fs.writeFileSync(BANCO, texto.slice(0, finLinea) + cuerpo + texto.slice(fin));
  const flojas = Object.entries(cal).filter(([, c]) => c.a < 0.4).map(([id]) => id);
  console.log("Listo: " + Object.keys(cal).length + " de " + B.ITEMS.length + " posiciones calibradas con " + pruebas.length + " pruebas."
    + (flojas.length ? "\nDistinguen poco (conviene reemplazarlas): " + flojas.join(", ") : ""));
}

module.exports = { calibrar, MINIMO };
