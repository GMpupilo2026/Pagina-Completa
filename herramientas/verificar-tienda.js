/* Comprueba la tienda de materiales: el catálogo contra el DISCO, y la página
   en un navegador de verdad.
 *
 * Existe porque acá todo lo que se rompe, se rompe callado — y lo caro es que
 * lo descubre quien ya pagó:
 *
 *  - Un producto que apunta a una carpeta o a un archivo que ya no está. La
 *    ficha se pinta igual, se cobra igual, y no llega nada.
 *  - Un número inventado ("27 cuadernillos" donde hay 24). Nadie los cuenta:
 *    se leen y se creen. Por eso `piezas` se cuenta contra el disco, que es la
 *    misma regla que el resultado de cada posición de un curso, verificado con
 *    motor y no a ojo.
 *  - Un curso fuera de los seis módulos (el "sistema completo" no lo entrega)
 *    o metido en dos (se cobra dos veces). Las dos cosas se ven perfectas.
 *  - Un precio que dice una cosa en la ficha y otra en el mensaje de WhatsApp.
 *    Quien lo lee manda el mensaje y se entera después.
 *  - Un wa.me sin código de país: abre un chat con un número que no existe y
 *    se ve como un enlace perfecto.
 *  - Y la que no se puede deshacer: que la tienda se le pinte a alguien que no
 *    administra mientras todavía está cerrada.
 *
 * La página está detrás del login Y detrás del rol, así que verificar-css.js
 * —que abre las páginas sin cuenta— no ve nada de esto.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-tienda.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

/* El catálogo se carga DEL ARCHIVO QUE USA LA PÁGINA. Comprobar una copia de
   la lista no comprobaría nada. */
function cargar(archivo) {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, archivo), "utf8"))(w);
  return w;
}
const T = cargar("js/tienda-catalogo.js").TiendaCatalogo;

const ADMIN  = { id: "u-oscar", full_name: "Oscar Angulo", role: "profesor", is_admin: true,  es_coordinador: true };
const PROFE  = { id: "u-kari",  full_name: "Karina Rojas", role: "profesor", is_admin: false, es_coordinador: false };
const ALUMNA = { id: "u-ana",   full_name: "Ana Rojas",    role: "alumno",   is_admin: false, es_coordinador: false };

/* Ocho dígitos escritos como los escribe una persona: el enlace tiene que
   salir con el 506 delante. Es justo el caso que se rompe callado. */
const WHATSAPP = "8309-2291";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* ==================================================================
   1. El catálogo contra el disco
   ================================================================== */
/* Con qué terminación se cuenta cada pieza. Es lo que de verdad hay en
   cursos/recursos/: un cuadernillo es `-material.pdf`, su versión accesible
   `-material-accesible.html`, la hoja `-ejercicios.pdf` y la presentación
   `.pptx`. Ojo con el orden: `-material-accesible.html` NO termina en
   `-material.pdf`, pero si algún día se contara por "incluye", el accesible se
   contaría dos veces. */
const TERMINACION = {
  cuadernillos: "-material.pdf",
  accesibles: "-material-accesible.html",
  ejercicios: "-ejercicios.pdf",
  presentaciones: ".pptx",
};

function pruebaCatalogo() {
  console.log("\n=== El catálogo contra el disco ===");

  // -------- los archivos existen
  let rotos = [];
  for (const p of T.PRODUCTOS) {
    if (p.carpeta && !fs.existsSync(path.join(RAIZ, p.carpeta))) rotos.push(p.id + " → " + p.carpeta);
    for (const a of p.archivos || []) {
      if (!fs.existsSync(path.join(RAIZ, a))) rotos.push(p.id + " → " + a);
    }
  }
  cierto("los " + T.PRODUCTOS.length + " productos apuntan a archivos que existen",
    rotos.length === 0, "faltan: " + rotos.join(", "));

  // -------- los números que promete cada ficha
  let mentiras = [];
  for (const p of T.PRODUCTOS) {
    if (!p.carpeta) continue;
    const hay = fs.readdirSync(path.join(RAIZ, p.carpeta));
    for (const [clave, suf] of Object.entries(TERMINACION)) {
      const real = hay.filter((f) => f.endsWith(suf)).length;
      const dicho = p.piezas[clave] || 0;
      if (real !== dicho) mentiras.push(`${p.id}.${clave}: dice ${dicho}, hay ${real}`);
    }
  }
  cierto("y las piezas que promete cada uno están de verdad en la carpeta",
    mentiras.length === 0, mentiras.join("\n      "));

  // -------- el "ver el material" de cada ficha
  const vistasRotas = T.PRODUCTOS
    .map((p) => [p.id, T.vistaDe(p)])
    .filter(([, v]) => !v || !fs.existsSync(path.join(RAIZ, v)));
  cierto("el enlace para revisar cada material abre algo que existe",
    vistasRotas.length === 0, vistasRotas.map(([id, v]) => id + " → " + v).join(", "));

  // -------- la carpeta se llama como el id: el candado pregunta por ella
  /* El worker pregunta `puede_bajar(<carpeta>)` y registrar_compra() guarda
     el id: si no son el mismo texto, la compra queda registrada y el
     material no abre nunca. Solo dos archivos quedan fuera, en la raíz y sin
     candado, a propósito. */
  const PUBLICOS = ["guia-del-profesor-accesible.html", "instrucciones-adaptadas.pdf"];
  const desalineados = [];
  for (const p of T.PRODUCTOS) {
    const rutas = (p.carpeta ? [p.carpeta + "/"] : []).concat(p.archivos || []);
    for (const r of rutas) {
      if (PUBLICOS.includes(r)) continue;
      const m = r.match(/^(?:cursos\/recursos|material)\/([^/]+)\//);
      if (!m || m[1] !== p.id) desalineados.push(p.id + " → " + r);
    }
  }
  cierto("todo lo que se vende está en cursos/recursos/<id>/ o material/<id>/",
    desalineados.length === 0, desalineados.join(", "));

  // -------- ids
  const ids = T.PRODUCTOS.map((p) => p.id);
  cierto("ningún id repetido", new Set(ids).size === ids.length);

  // -------- los módulos reparten TODO, una sola vez
  const enModulos = T.MODULOS.flatMap((m) => m.productos);
  const fantasma = enModulos.filter((id) => !T.producto(id));
  const repetido = enModulos.filter((id, i) => enModulos.indexOf(id) !== i);
  const fuera = ids.filter((id) => !enModulos.includes(id));
  cierto("ningún módulo nombra un producto que no existe", fantasma.length === 0, fantasma.join(", "));
  cierto("ningún producto está en dos módulos (se cobraría dos veces)", repetido.length === 0, repetido.join(", "));
  cierto("ningún producto queda fuera del sistema completo (se vendería sin entregarse)",
    fuera.length === 0, fuera.join(", "));

  // -------- el texto de venta
  const mudos = T.PRODUCTOS.filter((p) => !p.gancho || !p.resumen || !p.titulo || !p.nivel);
  cierto("los productos traen su gancho y su resumen", mudos.length === 0, mudos.map((p) => p.id).join(", "));

  // -------- las cuentas no se contradicen
  igual("el precio de cada material", T.PRECIO, 5000);
  cierto("el paquete cuesta menos que comprarlo suelto", T.precioPack() < T.precioSuelto(),
    T.moneda(T.precioPack()) + " vs " + T.moneda(T.precioSuelto()));
  igual("y el ahorro que anuncia es exactamente la resta",
    T.ahorroPack(), T.precioSuelto() - T.precioPack());
  cierto("el paquete es un precio redondo, pagable por SINPE sin monedas",
    T.precioPack() % 1000 === 0, T.moneda(T.precioPack()));

  console.log("  · " + T.PRODUCTOS.length + " materiales · suelto " + T.moneda(T.precioSuelto()) +
    " · paquete " + T.moneda(T.precioPack()) + " · " + T.totalArchivos().toLocaleString("es-CR") + " archivos de curso");
}

/* ==================================================================
   2. La página, en un navegador
   ================================================================== */
function clienteFalso(perfil, whatsapp) {
  return `
window.__llamadas = [];
window.__abiertas = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  const AJUSTES = ${JSON.stringify(whatsapp ? [{ clave: "whatsapp_consultas", valor: whatsapp }] : [])};
  /* Una compradora con HTML en el nombre: el panel de compras lo tiene que
     pintar como texto. */
  const COMPRADORA = { id: "u-ana", full_name: "Ana <b>Mora</b>", email: "ana@correo.cr", is_admin: false };
  window.__compras = [];
  const TABLAS = { profiles: [PERFIL, COMPRADORA], ajustes_academia: AJUSTES, compras_tienda: window.__compras };
  /* Los filtros se apuntan y se aplican en el RESOLVER, sobre la tabla como
     está en ese momento: así una lista que se vuelve a pedir después de
     registrar una compra trae la compra. */
  function constructor(tabla) {
    let unica = false;
    const filtros = [];
    let tope = null;
    const b = {
      select() { return b; },
      eq(col, val) { filtros.push((f) => String(f[col]) === String(val)); return b; },
      in(col, vals) { filtros.push((f) => vals.map(String).includes(String(f[col]))); return b; },
      /* El or de la búsqueda: "full_name.ilike.%x%,email.ilike.%x%". */
      or(expr) {
        const partes = expr.split(",").map((p) => {
          const m = p.match(/^(\\w+)\\.ilike\\.%(.*)%$/);
          return m && { col: m[1], txt: m[2].toLowerCase() };
        });
        if (partes.some((x) => !x)) throw new Error("or() mal armado: " + expr);
        filtros.push((f) => partes.some((x) => String(f[x.col] || "").toLowerCase().includes(x.txt)));
        return b;
      },
      order() { return b; }, limit(n) { tope = n; return b; }, range(a, z) { tope = z - a + 1; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = (TABLAS[tabla] || []).filter((f) => filtros.every((fn) => fn(f)));
        if (tope !== null) d = d.slice(0, tope);
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  /* registrar_compra() como la de la base: solo administración, y la
     lista queda como dice la función (insertar sin duplicar, o borrar). */
  function rpc(n, args) {
    window.__llamadas.push({ n, args });
    if (n === "registrar_compra") {
      if (!PERFIL.is_admin) return Promise.resolve({ data: null, error: { message: "Solo administración registra compras." } });
      const i = window.__compras.findIndex((c) => c.profile_id === args.p_profile && c.producto === args.p_producto);
      if (args.p_registrar && i < 0) window.__compras.push({ profile_id: args.p_profile, producto: args.p_producto, creado_en: "2026-09-29T18:00:00Z" });
      if (!args.p_registrar && i >= 0) window.__compras.splice(i, 1);
    }
    return Promise.resolve({ data: null, error: null });
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: PERFIL.id }, access_token: "t" } } }), signOut: () => Promise.resolve({}) },
    from: (t) => constructor(t),
    rpc,
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
  // El pedido sale por window.open: se anota en vez de abrirse, que es la
  // única forma de mirar QUÉ se va a pedir y por cuánto.
  window.open = function (url) { window.__abiertas.push(String(url)); return null; };
})();
`;
}

async function abrir(browser, perfil, whatsapp, oscuro) {
  const page = await browser.newPage({ colorScheme: oscuro ? "dark" : "light" });
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil, whatsapp) }));
  await page.goto(BASE + "/tienda.html", { waitUntil: "networkidle" });
  return { page, errores };
}

async function pruebaCerrada(browser, quien, perfil) {
  console.log("\n=== La tienda está cerrada para " + quien + " ===");
  const { page, errores } = await abrir(browser, perfil, WHATSAPP);
  await page.waitForSelector("#denegado:not(.hidden)", { timeout: 20000 });

  /* Que no se VEA, medido con checkVisibility() y no con la clase: es lo que
     ve quien entra. Y que no quede ni un precio ni un botón de pedido — una
     tienda escondida con una clase sigue estando en el DOM, y con ella los
     precios de todo lo que todavía no está a la venta. */
  igual("no se le pinta nada de la tienda",
    await page.evaluate(() => document.getElementById("app").checkVisibility()), false);
  igual("ni una sola ficha de producto en el DOM",
    await page.evaluate(() => document.querySelectorAll("#productos article").length), 0);
  /* El armazón del anuncio SÍ está en el HTML —`#app` entero va con
     `display:none`, como en el resto de las páginas de administración— así
     que lo que hay que medir no es si existe, sino si se puede llegar a él:
     ni verlo ni tabular hasta él. Un botón invisible pero enfocable es una
     parada de tabulador fantasma. */
  igual("ni un control suyo al que se pueda llegar con el teclado",
    await page.evaluate(() => [...document.querySelectorAll("#app a, #app button, #app input")]
      .filter((e) => e.checkVisibility()).length), 0);
  /* Y lo que de verdad no puede escaparse mientras la tienda está cerrada:
     los PRECIOS. Se mide sobre el HTML entero —scripts y comentarios
     incluidos, no solo lo que se ve— y por eso vale doble: que no haya ni un
     «₡» en el código es la prueba de que NINGÚN precio está escrito a mano en
     la página. Todos salen del catálogo, que solo se pinta si quien mira
     administra. El día que alguien escriba uno acá, la tienda cerrada
     empezaría a contarle el precio a cualquiera que abra el código, y esto
     salta. */
  igual("y ni un precio escrito a mano en el código de la página",
    await page.evaluate(() => (document.body.innerHTML.match(/₡/g) || []).length), 0);
  igual("se le dice que todavía no está abierta",
    await page.evaluate(() => document.querySelector("#denegado h1").textContent.trim()), "Todavía no está abierta");
  cierto("sin errores en la consola", errores.length === 0, errores.join(" | "));
  await page.close();
}

async function pruebaAdmin(browser) {
  console.log("\n=== La tienda, para quien administra ===");
  const { page, errores } = await abrir(browser, ADMIN, WHATSAPP);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  // -------- el anuncio sale del catálogo, no escrito a mano
  igual("el sello dice cuántos módulos hay de verdad",
    await page.textContent("#sello-modulos"), String(T.MODULOS.length));
  igual("y cuántos bonos",
    await page.textContent("#sello-bonos"), String(T.BONOS.length));
  igual("se pintan los " + T.MODULOS.length + " módulos",
    await page.evaluate(() => document.querySelectorAll("#modulos article").length), T.MODULOS.length);
  igual("y los " + T.BONOS.length + " bonos",
    await page.evaluate(() => document.querySelectorAll("#bonos li").length), T.BONOS.length);

  /* Cada módulo tiene que NOMBRAR sus materiales: un módulo que solo promete
     ("táctica paso a paso") y no dice de qué cursos sale es la promesa que la
     entrega no puede cumplir. */
  igual("cada módulo nombra los materiales que lleva",
    await page.evaluate(() => [...document.querySelectorAll("#modulos article")].map((a) => a.querySelectorAll("ul li").length)),
    T.MODULOS.map((m) => m.productos.length));

  // -------- los productos
  igual("se pintan los " + T.PRODUCTOS.length + " materiales",
    await page.evaluate(() => document.querySelectorAll("#productos article").length), T.PRODUCTOS.length);
  const precios = await page.evaluate(() => [...document.querySelectorAll("#productos article")].map((a) => a.querySelector("p.font-serif").textContent));
  cierto("todos a " + T.moneda(T.PRECIO) + ", el precio del catálogo",
    precios.every((p) => p === T.moneda(T.PRECIO)), [...new Set(precios)].join(" / "));

  // -------- el filtro
  await page.click('.filtro-tienda[data-cat="libro"]');
  await page.waitForTimeout(150);
  igual("el filtro de libros deja solo los libros",
    await page.evaluate(() => document.querySelectorAll("#productos article").length), T.porCategoria("libro").length);
  await page.click('.filtro-tienda[data-cat="todos"]');
  await page.waitForTimeout(150);

  // -------- la selección
  igual("la barra de la selección arranca escondida",
    await page.evaluate(() => document.getElementById("barra-seleccion").checkVisibility()), false);

  await page.evaluate(() => { document.querySelectorAll("#productos .boton-elegir")[0].click(); document.querySelectorAll("#productos .boton-elegir")[2].click(); });
  await page.waitForTimeout(200);
  igual("con dos elegidos se destapa y dice el total",
    await page.evaluate(() => [document.getElementById("barra-seleccion").checkVisibility(), document.getElementById("sel-total").textContent]),
    [true, T.moneda(2 * T.PRECIO)]);
  /* El estado va ESCRITO en el botón, no solo en el borde: un color solo no
     se distingue con daltonismo ni se anuncia con lector de pantalla. */
  igual("y el botón del material elegido lo dice con todas las letras",
    await page.evaluate(() => {
      const b = document.querySelectorAll("#productos .boton-elegir")[0];
      return [b.textContent.trim(), b.getAttribute("aria-pressed")];
    }), ["✓ Agregado", "true"]);

  /* Que el botón de pedido se pueda APRETAR, no solo que exista. Se mide
     quién está de verdad en el punto donde uno toca: la burbuja de «quién
     está en línea» flota fija en esa misma esquina de abajo, así que tapaba
     el botón entero — la barra se veía perfecta y no se podía comprar. Lo
     mismo vale para cualquier cosa que algún día se ponga a flotar ahí. */
  igual("el botón de pedido no lo tapa nada",
    await page.evaluate(() => {
      const b = document.getElementById("sel-pedir");
      const r = b.getBoundingClientRect();
      const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return b.contains(encima) ? "se puede apretar" : "lo tapa " + (encima ? (encima.id || encima.className || encima.tagName) : "nada");
    }), "se puede apretar");

  // -------- el pedido: lo que se manda es lo que la pantalla tiene delante
  await page.evaluate(() => { window.__abiertas = []; });
  await page.click("#sel-pedir");
  await page.waitForTimeout(200);
  const pedido = decodeURIComponent(await page.evaluate(() => window.__abiertas[0] || ""));
  cierto("el pedido sale por wa.me CON código de país",
    pedido.startsWith("https://wa.me/50683092291?text="),
    "salió: " + pedido.slice(0, 60));
  const esperados = [T.PRODUCTOS[0].titulo, T.PRODUCTOS[2].titulo];
  cierto("y lleva exactamente los dos materiales elegidos",
    esperados.every((t) => pedido.includes(t)) &&
    !T.PRODUCTOS.filter((p) => !esperados.includes(p.titulo)).some((p) => pedido.includes(p.titulo)),
    pedido);
  cierto("con el mismo total que decía la barra",
    pedido.includes("Total: " + T.moneda(2 * T.PRECIO)), pedido);

  // -------- quitar todo
  await page.click("#sel-limpiar");
  await page.waitForTimeout(200);
  igual("«Quitar todo» esconde la barra y desmarca las fichas",
    await page.evaluate(() => [document.getElementById("barra-seleccion").checkVisibility(),
                               [...document.querySelectorAll("#productos .boton-elegir")].filter((b) => b.getAttribute("aria-pressed") === "true").length]),
    [false, 0]);

  // -------- el paquete
  igual("el precio del paquete es el que calcula el catálogo",
    await page.textContent("#pack-precio"), T.moneda(T.precioPack()));
  igual("y dice cuánto sería suelto y cuánto se ahorra",
    await page.evaluate(() => [document.getElementById("pack-suelto").textContent, document.getElementById("pack-ahorro").textContent]),
    [T.moneda(T.precioSuelto()), T.moneda(T.ahorroPack())]);

  await page.evaluate(() => { window.__abiertas = []; });
  await page.click("#pack-comprar");
  await page.waitForTimeout(200);
  const pack = decodeURIComponent(await page.evaluate(() => window.__abiertas[0] || ""));
  cierto("pedir el paquete manda su precio, no la suma suelta",
    pack.includes("Total: " + T.moneda(T.precioPack())) && !pack.includes(T.moneda(T.precioSuelto())), pack.slice(0, 200));
  cierto("y nombra los " + T.MODULOS.length + " módulos",
    T.MODULOS.every((m) => pack.includes(m.titulo)), pack.slice(0, 300));

  // -------- el aviso de administración
  cierto("el aviso dice que cada material tiene su candado por compra",
    (await page.textContent("#app")).includes("Cada material ya tiene su candado por compra"));
  igual("con el número puesto, el aviso de «no hay WhatsApp» no se ve",
    await page.evaluate(() => document.getElementById("sin-whatsapp").checkVisibility()), false);

  cierto("sin errores en la consola", errores.length === 0, errores.join(" | "));
  await page.close();
}

async function pruebaSinWhatsapp(browser) {
  console.log("\n=== Sin número de WhatsApp guardado ===");
  const { page, errores } = await abrir(browser, ADMIN, null);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  /* No se inventa ningún número: es la misma regla que el informe a la casa.
     Un wa.me armado con la nada abre un chat con un número que no existe, y
     eso se ve como un enlace perfecto. */
  igual("se dice, en vez de armar un enlace a la nada",
    await page.evaluate(() => document.getElementById("sin-whatsapp").checkVisibility()), true);

  await page.evaluate(() => { window.__abiertas = []; document.querySelectorAll("#productos .boton-elegir")[0].click(); });
  await page.click("#sel-pedir");
  await page.waitForTimeout(200);
  igual("y apretar «pedir» no abre ningún chat",
    await page.evaluate(() => window.__abiertas.length), 0);

  cierto("sin errores en la consola", errores.length === 0, errores.join(" | "));
  await page.close();
}

async function pruebaCompras(browser) {
  console.log("\n=== Las compras registradas ===");
  const { page, errores } = await abrir(browser, ADMIN, WHATSAPP);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  igual("sin compras, se dice que no hay",
    await page.evaluate(() => document.getElementById("compras-vacia").checkVisibility()), true);
  igual("el menú trae todos los materiales del catálogo",
    await page.evaluate(() => document.querySelectorAll("#compra-producto option[value]:not([value=''])").length), T.PRODUCTOS.length);

  /* Sin elegir a nadie no se llama a la base: el nombre escrito no es una
     cuenta, y registrarle la compra «a un texto» no abriría nada. */
  await page.fill("#compra-buscar", "ana");
  await page.selectOption("#compra-producto", "examen-de-arbitraje");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#compra-form button[type=submit]");
  await page.waitForTimeout(150);
  igual("sin elegir a la persona de la lista, no se registra nada",
    await page.evaluate(() => window.__llamadas.length), 0);

  await page.fill("#compra-buscar", "");
  await page.type("#compra-buscar", "correo.cr");
  await page.waitForSelector("#compra-resultados button", { timeout: 5000 });
  igual("la búsqueda por correo la encuentra, y el nombre va como texto",
    await page.evaluate(() => document.querySelector("#compra-resultados button span").textContent), "Ana <b>Mora</b>");
  igual("ningún <b> de verdad dentro de los resultados",
    await page.evaluate(() => document.querySelectorAll("#compra-resultados b").length), 0);
  await page.click("#compra-resultados button");
  cierto("dice a quién se le va a registrar",
    (await page.textContent("#compra-elegida")).includes("Ana <b>Mora</b>"));
  await page.selectOption("#compra-producto", "examen-de-arbitraje");
  await page.click("#compra-form button[type=submit]");
  await page.waitForSelector("#compras-lista li", { timeout: 5000 });
  igual("se llama a registrar_compra con la cuenta y el id del producto",
    await page.evaluate(() => JSON.stringify(window.__llamadas.map((l) => l.args))),
    JSON.stringify([{ p_profile: "u-ana", p_producto: "examen-de-arbitraje", p_registrar: true }]));
  const fila = await page.textContent("#compras-lista li");
  cierto("y la compra aparece en la lista, con el nombre y el material",
    fila.includes("Ana <b>Mora</b>") && fila.includes(T.producto("examen-de-arbitraje").titulo), fila);
  igual("ya no se dice que no hay compras",
    await page.evaluate(() => document.getElementById("compras-vacia").checkVisibility()), false);

  /* Quitarla pide confirmación propia (nunca confirm()), y «Dejarla» no
     toca nada. */
  await page.click("#compras-lista li button");
  await page.click("[data-avisos-cancelar]");
  await page.waitForTimeout(150);
  igual("«Dejarla» no la quita",
    await page.evaluate(() => window.__compras.length), 1);
  await page.click("#compras-lista li button");
  await page.click("[data-avisos-aceptar]");
  await page.waitForSelector("#compras-vacia:not(.hidden)", { timeout: 5000 });
  igual("«Quitar la compra» la borra con registrar_compra(…, false)",
    await page.evaluate(() => JSON.stringify(window.__llamadas.slice(-1)[0].args)),
    JSON.stringify({ p_profile: "u-ana", p_producto: "examen-de-arbitraje", p_registrar: false }));

  cierto("sin errores en la consola", errores.length === 0, errores.join(" | "));
  await page.close();
}

async function pruebaSeVe(browser) {
  console.log("\n=== Que la página se vea ===");
  const { page } = await abrir(browser, ADMIN, WHATSAPP, true);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  /* Las dos formas en que se rompe al clonar la cabecera de otra página del
     sitio, y que ya costaron una vez: el `</style>` de la original cerrando la
     hoja antes de tiempo —y el resto del CSS impreso como texto— y el script
     del tema quedándose fuera, o sea la página siempre clara. */
  cierto("no hay CSS impreso como texto",
    !(await page.evaluate(() => document.body.innerText.slice(0, 4000))).includes("{"),
    "aparece una llave en el texto visible");
  igual("una sola hoja de estilo en línea",
    await page.evaluate(() => document.querySelectorAll("style").length), 0);
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const claro = fondo.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0) / 3;
  cierto("con el tema en oscuro, el fondo sale oscuro", claro < 90, "fondo: " + fondo);

  /* El anuncio es lo primero que se lee, y tiene que leerse. Un h1 por página
     y ningún nivel saltado, como en el resto del sitio. */
  const niveles = await page.evaluate(() =>
    [...document.querySelectorAll("#app h1, #app h2, #app h3")].map((h) => Number(h.tagName[1])));
  igual("un solo h1", niveles.filter((n) => n === 1).length, 1);
  cierto("y ningún nivel de encabezado saltado",
    niveles.every((n, i) => i === 0 || n <= niveles[i - 1] + 1),
    niveles.join(" "));
  await page.close();
}

(async () => {
  pruebaCatalogo();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAdmin(browser);
    await pruebaCerrada(browser, "el equipo docente", PROFE);
    await pruebaCerrada(browser, "el alumnado", ALUMNA);
    await pruebaSinWhatsapp(browser);
    await pruebaCompras(browser);
    await pruebaSeVe(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
