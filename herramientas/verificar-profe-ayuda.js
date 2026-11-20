#!/usr/bin/env node
/* ===== Verificador: «¿Te ayudo?» de la profe de la academia en el panel =====
 *
 * js/profe-ayuda.js, el asistente de la profe Pame (CCDR POCOCI) y de la
 * profe Karina (ADAPZ) para sus alumnos:
 *   - cada respuesta lleva a una página que existe y cada dibujo es uno de los
 *     de esa profe (img/avatar-profe-<profe>/);
 *   - solo se monta a quien ve a una profe que no es el profe Oscar, es alumno
 *     y mira su propio panel (se prueba con un documento de mentira);
 *   - «¿Puedo jugar contra ti?» solo la dice la profe con bot propio; la
 *     profe Karina lleva a la página de la eliminatoria JDN;
 *   - clases.html lo carga después del avatar y antes de clases.js, y
 *     clases.js lo monta con el perfil.
 *
 *   node herramientas/verificar-profe-ayuda.js
 *
 * Ver «La profe Pame ayuda en el panel» en docs/decisiones/clase-en-vivo.md.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");
let fallos = 0;
function igual(nombre, a, b) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) { console.log("  ✗ " + nombre + "\n      esperaba: " + sb + "\n      salió:    " + sa); fallos += 1; }
  else console.log("  ✓ " + nombre);
}

// Un documento de mentira: lo justo para que montar() arme el botón.
function cargar(profe) {
  const cuerpo = [];
  const nodo = (tag) => ({
    tag, className: "", hidden: false, dataset: {}, children: [], attrs: {}, textContent: "",
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); }, addEventListener() {},
  });
  const PROFES = { oscar: { nombre: "El profe Oscar" }, pame: { nombre: "La profe Pame" }, karina: { nombre: "La profe Karina" } };
  const window = profe ? { AvatarProfeOscar: { PROFE: profe, PROFES, ruta: (p) => "img/avatar-profe-" + profe + "/" + p + ".webp" } } : {};
  const document = { createElement: nodo, addEventListener() {}, body: { append: (...cs) => cuerpo.push(...cs) } };
  const localStorage = { getItem: () => null, setItem() {} };
  new Function("window", "document", "localStorage", leer("js/profe-ayuda.js"))(window, document, localStorage);
  return { P: window.ProfeAyuda, cuerpo };
}

for (const profe of ["pame", "karina"]) {
  console.log("\n=== Las respuestas y los dibujos: " + profe + " ===");
  const { P } = cargar(profe);
  const preguntas = Object.entries(P.preguntasDe(profe));
  igual("trae varias preguntas", preguntas.length >= 5, true);
  igual("cada respuesta lleva a una página que existe",
    preguntas.filter(([, q]) => !fs.existsSync(path.join(RAIZ, q[4]))).map(([k]) => k), []);
  const poses = preguntas.map(([, q]) => q[5]).concat(["presentando", "hola"]);
  igual("cada dibujo es suyo",
    poses.filter((p) => !fs.existsSync(path.join(RAIZ, "img/avatar-profe-" + profe, p + ".webp"))), []);
  igual("cada pregunta tiene icono, pregunta, respuesta, botón, página y dibujo",
    preguntas.filter(([, q]) => q.length !== 6 || q.some((x) => !x)).map(([k]) => k), []);
}
{
  const { P } = cargar("pame");
  igual("la profe Pame (con bot) contesta «¿Puedo jugar contra ti?», no la de practicar contra Oscar",
    ["jugar" in P.preguntasDe("pame"), "practicar" in P.preguntasDe("pame")], [true, false]);
  igual("la profe Karina (sin bot) dice que se practica contra Oscar",
    ["jugar" in P.preguntasDe("karina"), "practicar" in P.preguntasDe("karina")], [false, true]);
  igual("la profe Karina lleva a la página de la eliminatoria JDN", (P.preguntasDe("karina").torneo || [])[4], "jdn-pz-2026.html");
  igual("la profe Pame no", "torneo" in P.preguntasDe("pame"), false);
}

console.log("\n=== A quién le sale ===");
const monta = (profe, perfil) => { const r = cargar(profe); return [r.P.montar(perfil), r.cuerpo.length]; };
igual("alumno que ve a la profe Pame: sí", monta("pame", { role: "alumno" }), [true, 2]);
igual("alumno que ve a la profe Karina: sí", monta("karina", { role: "alumno" }), [true, 2]);
igual("un profe que no está en la lista: no", monta("nadie", { role: "alumno" }), [false, 0]);
igual("alumno que ve a Oscar: no", monta("oscar", { role: "alumno" }), [false, 0]);
igual("profesor de CCDR POCOCI: no", monta("pame", { role: "profesor" }), [false, 0]);
igual("mirando el panel de otra persona: no", monta("pame", { role: "alumno", _persona: true }), [false, 0]);
igual("sin el avatar cargado: no", monta(null, { role: "alumno" }), [false, 0]);
{
  const r = cargar("pame");
  r.P.montar({ role: "alumno" });
  igual("una sola vez aunque se llame dos", [r.P.montar({ role: "alumno" }), r.cuerpo.length], [false, 2]);
}

console.log("\n=== El panel lo carga y lo monta ===");
const html = leer("clases.html");
const i = (s) => html.indexOf(s);
igual("clases.html: avatar, luego la ayuda, luego clases.js",
  i("js/avatar-profe-oscar.js") > 0 && i("js/avatar-profe-oscar.js") < i("js/profe-ayuda.js") && i("js/profe-ayuda.js") < i('src="js/clases.js"'), true);
igual("clases.js la monta con el perfil", /ProfeAyuda\.montar\(profile\)/.test(leer("js/clases.js")), true);
const css = leer("css/styles.css");
igual("styles.css la aparta cuando hay una ventana abierta", /body:has\(dialog\[open\]\) \.profe-ayuda-boton/.test(css), true);

console.log("\n=== La profe Pame en el resto de la plataforma ===");
{
  // vestirPagina() de js/avatar-profe-oscar.js con un documento de mentira.
  function vestir(profe) {
    const textos = [{ dataset: { profePame: "Jugar contra el bot de la profe Pame" }, textContent: "Jugar contra el bot de Oscar" }];
    const clases = new Set(["object-cover"]);
    const imagenes = [{ dataset: { profePameSrc: "cara" }, src: "img/oscar-avatar-160.jpg", removeAttribute() {},
      classList: { add: (...c) => c.forEach((x) => clases.add(x)), remove: (c) => clases.delete(c) } }];
    const uid = "u1";
    const ls = { "academia_marca_v1": JSON.stringify({ uid, marca: { academia_id: profe === "pame" ? "9b224c6b-c9aa-403c-bb20-2aeb897cc8d4" : "otra" } }),
      "sb-bgtijpimpcokxatxxbki-auth-token": JSON.stringify({ user: { id: uid } }) };
    const localStorage = { getItem: (k) => (k in ls ? ls[k] : null), key: (i) => Object.keys(ls)[i], get length() { return Object.keys(ls).length; } };
    const document = { readyState: "complete", querySelectorAll: (sel) => (sel.startsWith("img") ? imagenes : textos), addEventListener() {} };
    const window = { localStorage };
    new Function("window", "document", leer("js/avatar-profe-oscar.js"))(window, document);
    return [window.AvatarProfeOscar.PROFE, textos[0].textContent, imagenes[0].src, clases.has("object-contain")];
  }
  igual("a quien es de CCDR POCOCI le cambia el texto y el dibujo", vestir("pame"),
    ["pame", "Jugar contra el bot de la profe Pame", "img/avatar-profe-pame/cara.webp", true]);
  igual("al resto no le toca nada", vestir("otra"), ["oscar", "Jugar contra el bot de Oscar", "img/oscar-avatar-160.jpg", false]);
  for (const pag of ["juegos.html", "bot.html"]) {
    const h = leer(pag);
    igual(pag + ": dice el bot de la profe Pame y carga el avatar",
      /data-profe-pame="Jugar contra el bot de la profe Pame"/.test(h) && h.includes('src="js/avatar-profe-oscar.js"'), true);
  }
  const comp = leer("competir.html");
  igual("competir.html carga el avatar antes que competir.js",
    comp.indexOf("js/avatar-profe-oscar.js") > 0 && comp.indexOf("js/avatar-profe-oscar.js") < comp.indexOf('src="js/competir.js"'), true);
  igual("Competir ofrece el bot de quien le toca", /el bot de ' \+ BOT \+ '/.test(leer("js/competir.js")), true);
}

console.log("\n=== Si la marca guardada estaba vieja, la página se corrige sola ===");
{
  const ruta = require.resolve("../js/marca-academia.js");
  function probar(profePintado, academia, yaRecargado) {
    delete require.cache[ruta];
    let recargas = 0;
    const guardado = {};
    if (yaRecargado) guardado.profe_recargado = yaRecargado;
    global.window = { __marcaAcademiaSinArranque: true,
      AvatarProfeOscar: { PROFE: profePintado, PROFE_DE_ACADEMIA: { "9b224c6b-c9aa-403c-bb20-2aeb897cc8d4": "pame" } } };
    global.sessionStorage = { getItem: (k) => guardado[k] || null, setItem: (k, v) => { guardado[k] = v; } };
    global.location = { reload: () => { recargas += 1; } };
    const M = require(ruta);
    M.profeAlDia(academia ? { academia_id: academia, nombre: "x" } : null);
    delete global.window; delete global.sessionStorage; delete global.location;
    return recargas;
  }
  igual("pintó a Oscar y es de CCDR POCOCI: recarga una vez", probar("oscar", "9b224c6b-c9aa-403c-bb20-2aeb897cc8d4"), 1);
  igual("ya recargó por eso en esta pestaña: no vuelve a recargar", probar("oscar", "9b224c6b-c9aa-403c-bb20-2aeb897cc8d4", "pame"), 0);
  igual("pintó a la profe que le toca: no recarga", probar("pame", "9b224c6b-c9aa-403c-bb20-2aeb897cc8d4"), 0);
  igual("de otra academia y pintó a Oscar: no recarga", probar("oscar", "otra"), 0);
  igual("ya no es de CCDR POCOCI y pintó a la profe Pame: recarga", probar("pame", null), 1);
  igual("marca-academia.js lo revisa con la marca recién pedida",
    /guardar\(uid, marca, academias\);[\s\S]{0,120}profeAlDia\(marca\)/.test(leer("js/marca-academia.js")), true);
}

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
