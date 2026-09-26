#!/usr/bin/env node
/* Que ninguna página necesite 'unsafe-inline' para su JavaScript.
 *
 * No necesita navegador, ni red, ni el sitio servido.
 *
 * Con 'unsafe-inline' en script-src, la CSP no frena un script inyectado: si
 * alguien logra meter un <script> en la página (un nombre sin escapar, un
 * mensaje), corre. Sin él, solo corre el JavaScript que viene de un archivo del
 * sitio o el escrito en línea cuyo hash la CSP autoriza. Y la CSP no puede
 * autorizar por hash un script que es distinto en cada página, ni un atributo
 * on… en ninguna.
 *
 * Comprueba, en todas las páginas del sitio:
 *   · que todo <script> escrito en la página sea uno de los que ponen los
 *     generadores, justo después de su marca (<!-- guardia/tema/oscuro/fuentes:
 *     inicio -->), y que cada uno sea IDÉNTICO en todas: el código de una
 *     página va en js/ (ver «El código de las páginas sale del HTML»);
 *   · que ninguna etiqueta lleve un atributo on… (onclick, onload…), ni un
 *     enlace un href="javascript:…";
 *   · que el código de js/ no arme HTML con atributos on… (un innerHTML con
 *     onclick="…" es JavaScript en línea igual, y la CSP también lo frena);
 *   · que script-src en _headers no tenga 'unsafe-inline' y autorice por su
 *     hash exactamente esos bloques (los escribe herramientas/csp-hashes.js).
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const PERMITIDOS = ["guardia", "tema", "oscuro", "fuentes"];

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

function paginas(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "herramientas", "docs", "supabase"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

/* Los <script> escritos en la página, recorriéndola en orden: un «<script»
   dentro de un comentario HTML no es un bloque, y un «<!--» dentro de un
   script no abre ningún comentario (lo mismo que bloques_de() de
   herramientas/mudar-script.py). */
function bloques(html) {
  const lista = [];
  const etiqueta = /<!--|<script\b[^>]*>/g;
  let m;
  while ((m = etiqueta.exec(html))) {
    if (m[0] === "<!--") {
      const fin = html.indexOf("-->", etiqueta.lastIndex);
      if (fin < 0) break;
      etiqueta.lastIndex = fin + 3;
      continue;
    }
    const cierre = html.indexOf("</script>", etiqueta.lastIndex);
    if (cierre < 0) break;
    lista.push({ inicio: m.index, etiqueta: m[0], codigo: html.slice(etiqueta.lastIndex, cierre) });
    etiqueta.lastIndex = cierre + 9;
  }
  return lista;
}

// Un <script> con type de datos no es JavaScript: la CSP no lo mira.
const DATOS = /\btype="(application\/(ld\+)?json|importmap|text\/template)"/;

const sueltos = [], conAtributo = [], conJavascript = [];
const distintos = new Map(PERMITIDOS.map((n) => [n, new Set()]));
const cuantos = new Map(PERMITIDOS.map((n) => [n, 0]));
let revisadas = 0;

for (const archivo of paginas(RAIZ)) {
  const rel = path.relative(RAIZ, archivo).split(path.sep).join("/");
  const html = fs.readFileSync(archivo, "utf8");
  revisadas += 1;
  for (const b of bloques(html)) {
    if (/\bsrc=/.test(b.etiqueta) || DATOS.test(b.etiqueta)) continue;
    const marca = (html.slice(Math.max(0, b.inicio - 60), b.inicio).match(/<!-- ([a-z]+): inicio -->\s*$/) || [])[1];
    if (marca && distintos.has(marca) && b.etiqueta === "<script>") {
      distintos.get(marca).add(b.codigo);
      cuantos.set(marca, cuantos.get(marca) + 1);
    } else {
      sueltos.push(rel + " (" + Buffer.byteLength(b.codigo) + " bytes: " + b.codigo.trim().slice(0, 50).replace(/\s+/g, " ") + "…)");
    }
  }
  // Los atributos, mirando solo las etiquetas y sin lo que hay dentro de los
  // scripts ni de los comentarios.
  const marcado = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const t of marcado.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const a = t[0].match(/\son[a-z]+\s*=/i);
    if (a) conAtributo.push(rel + ": " + t[0].slice(0, 70));
    if (/\bhref\s*=\s*["']?\s*javascript:/i.test(t[0])) conJavascript.push(rel + ": " + t[0].slice(0, 70));
  }
}

console.log("=== El JavaScript escrito en las páginas (" + revisadas + " páginas) ===");
if (sueltos.length) mal("<script> escritos en la página que no son de ningún generador (su código va a un archivo de js/, con herramientas/mudar-script.py):\n      " + sueltos.join("\n      "));
else bien("ningún <script> escrito en una página fuera de los que ponen los generadores");
for (const n of PERMITIDOS) {
  const d = distintos.get(n).size;
  if (d > 1) mal(`el bloque «${n}» tiene ${d} versiones distintas: tiene que ser uno solo, igual en todas las páginas`);
  else if (cuantos.get(n) === 0) mal(`no encontré ningún bloque «${n}»: ¿cambió su marca?`);
  else bien(`«${n}»: una sola versión, en ${cuantos.get(n)} páginas`);
}
if (conAtributo.length) mal("atributos on… en el HTML (van con addEventListener desde un archivo de js/):\n      " + conAtributo.slice(0, 10).join("\n      "));
else bien("ninguna etiqueta lleva un atributo on…");
if (conJavascript.length) mal("enlaces con href=\"javascript:…\":\n      " + conJavascript.join("\n      "));
else bien("ningún enlace con href=\"javascript:…\"");

console.log("\n=== El HTML que arma el código de js/ ===");
const armados = [];
for (const f of fs.readdirSync(path.join(RAIZ, "js"))) {
  if (!f.endsWith(".js")) continue;
  const txt = fs.readFileSync(path.join(RAIZ, "js", f), "utf8");
  // Un atributo on… dentro de un string o un template: `<button onclick="…">`.
  for (const m of txt.matchAll(/<[a-zA-Z][^<>]*?\son[a-z]+\s*=\s*\\?["']/g)) armados.push("js/" + f + ": " + m[0].slice(0, 60));
}
if (armados.length) mal("HTML armado con atributos on… (la CSP también los frena):\n      " + armados.slice(0, 10).join("\n      "));
else bien("ningún archivo de js/ arma HTML con atributos on…");

console.log("\n=== La CSP de _headers ===");
{
  const { hashesDeLasPaginas, scriptSrc, BLOQUES } = require("./csp-hashes");
  const fuentes = scriptSrc(fs.readFileSync(path.join(RAIZ, "_headers"), "utf8")) || [];
  if (!fuentes.length) mal("no encontré script-src en la CSP de _headers");
  if (fuentes.includes("'unsafe-inline'")) mal("script-src tiene 'unsafe-inline': cualquier <script> que alguien lograra meter en una página correría");
  else bien("script-src no tiene 'unsafe-inline'");
  const vistos = hashesDeLasPaginas();
  const deseados = BLOQUES.map((b) => [...vistos[b]][0]).filter(Boolean);
  const puestos = fuentes.filter((f) => /^'sha256-/.test(f));
  const faltan = deseados.filter((h) => !puestos.includes(h));
  const sobran = puestos.filter((h) => !deseados.includes(h));
  if (faltan.length) mal("script-src no autoriza " + faltan.length + " de los bloques en línea (quedarían bloqueados en TODAS las páginas que los llevan). Corre: node herramientas/csp-hashes.js");
  else bien("script-src autoriza por su hash los " + deseados.length + " bloques en línea");
  if (sobran.length) mal("script-src autoriza hashes que ya no son de ningún bloque: " + sobran.join(" ") + ". Corre: node herramientas/csp-hashes.js");
}

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
