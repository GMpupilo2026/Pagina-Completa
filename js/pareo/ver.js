/* El enlace y el QR de solo lectura de pareo.html, en dos versiones (ver «El
 * enlace y el QR de solo lectura» y «El canal en vivo» en
 * docs/decisiones/juegos-y-torneos.md).
 *
 * `#ver=<datos>`: una «foto» de una ronda y la clasificación de ese momento,
 * para ver desde el celular sin tocar nada. Nunca pasa por un servidor:
 * viaja comprimida en el fragmento de la URL (después del «#», que el
 * navegador no manda a nadie).
 *
 * `#vivo=<código>`: lo mismo, pero actualizándose sola mientras quien
 * organiza tenga la pestaña abierta. Acá SÍ hay servidor —la primera vez que
 * Pareo Integral toca uno, a propósito, con el visto bueno del dueño del
 * repo—: un canal de Supabase Realtime en modo Broadcast, efímero y sin
 * tabla (nada se guarda ni ahí), público por default en este proyecto.
 *
 * En los dos casos no se necesita el motor de emparejamiento ni el resto del
 * torneo: recibe ya armadas las filas que la pantalla (o el PDF) ya pintó.
 */
window.PareoVer = (function () {
  "use strict";

  const X = window.PareoTextos;

  let cargaSupabase = null;
  function cargarSupabase() {
    if (window.sb) return Promise.resolve();
    if (!cargaSupabase) {
      cargaSupabase = new Promise((listo, fallo) => {
        const s1 = document.createElement("script");
        s1.src = "js/vendor/supabase.js";
        s1.addEventListener("load", () => {
          const s2 = document.createElement("script");
          s2.src = "js/supabase-client.js";
          s2.addEventListener("load", listo);
          s2.addEventListener("error", () => { cargaSupabase = null; fallo(new Error("No cargó supabase-client.js")); });
          document.head.appendChild(s2);
        });
        s1.addEventListener("error", () => { cargaSupabase = null; fallo(new Error("No cargó la librería de Supabase")); });
        document.head.appendChild(s1);
      });
    }
    return cargaSupabase;
  }

  function b64urlDeBytes(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function bytesDeB64url(cadena) {
    const base = (cadena + "=".repeat((4 - (cadena.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(base);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function empaquetar(datos) {
    const flujo = new Blob([JSON.stringify(datos)]).stream().pipeThrough(new CompressionStream("deflate"));
    return b64urlDeBytes(new Uint8Array(await new Response(flujo).arrayBuffer()));
  }

  async function desempaquetar(cadena) {
    const flujo = new Blob([bytesDeB64url(cadena)]).stream().pipeThrough(new DecompressionStream("deflate"));
    return JSON.parse(new TextDecoder().decode(await new Response(flujo).arrayBuffer()));
  }

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }

  function puntosTexto(idioma, x) {
    return Number(x).toLocaleString(idioma === "en" ? "en-US" : "es-CR", { maximumFractionDigits: 2 })
      .replace(/[.,]5$/, "½").replace(/^0½$/, "½");
  }

  // La ronda y la clasificación de un torneo; `h` es el nivel de sus
  // títulos (h2 solo, h3 dentro de un evento).
  // La ficha de un jugador en el enlace del evento: todas sus partidas del
  // torneo, sus puntos, su puesto y sus desempates.
  function ficha(idioma, x, nombre) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const rondas = (x.anteriores || []).concat(x.ronda ? [x.ronda] : []);
    const filas = [];
    for (const RR of rondas) {
      const m = RR.mesas.find((y) => y.b === nombre || y.n === nombre);
      if (!m) { filas.push(el("li", {}, tx("rondaN", { r: RR.n }) + ": " + tx("verFichaNoJugo"))); continue; }
      const rival = m.b === nombre ? m.n : m.b;
      filas.push(el("li", {}, tx("rondaN", { r: RR.n }) + ": " + (rival ? tx(m.b === nombre ? "verMioBlancas" : "verMioNegras", { x: rival }) : tx("cBye")) + (m.r && m.r !== "bye" ? " · " + tx("corto_" + m.r) : "")));
    }
    const f = (x.clasificacion || []).find((y) => y.n === nombre);
    // Sus JDE de años anteriores (de «Ajedrez estudiantil en Costa Rica»):
    // se bajan solo si se piden, porque pesan más de un megabyte.
    const cajaHist = el("div", { "data-historial": "" });
    const bHist = el("button", { type: "button", class: "mt-3 border border-brand-300 dark:border-brand-600 font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "data-ver-historial": "" }, tx("verHistorial"));
    bHist.addEventListener("click", async () => {
      bHist.disabled = true;
      cajaHist.replaceChildren(el("p", { class: "text-sm mt-2", role: "status" }, tx("verHistorialCargando")));
      try { cajaHist.replaceChildren(...(await historialJde(idioma, nombre))); }
      catch (e) { cajaHist.replaceChildren(el("p", { class: "text-sm mt-2", role: "status" }, tx("verHistorialError"))); bHist.disabled = false; }
    });
    return el("section", { class: "rounded-xl border-2 border-accent-500 p-3 mb-4", "data-ficha": nombre },
      el("h2", { class: "font-serif text-xl font-bold" }, nombre),
      el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, x.nombre),
      f ? el("p", { class: "text-sm mt-1 font-semibold" }, tx("verMioPuesto", { p: f.p, pts: puntosTexto(idioma, f.pts) }) + ((f.d || []).length ? " · " + f.d.map((y) => y.c + " " + puntosTexto(idioma, y.v)).join(" · ") : "")) : null,
      el("ol", { class: "text-sm mt-2 space-y-1" }, filas), bHist, cajaHist);
  }

  let jdeDatos = null;
  function cargarJdeDatos() {
    if (!jdeDatos) {
      jdeDatos = new Promise((ok, mal) => {
        if (window.JdeDatos) { ok(); return; }
        const sc = document.createElement("script");
        sc.src = "js/jde-datos.js";
        sc.onload = ok;
        sc.onerror = () => mal(new Error("jde-datos.js"));
        document.head.append(sc);
      }).then(() => window.JdeDatos.cargar());
      jdeDatos.catch(() => { jdeDatos = null; });
    }
    return jdeDatos;
  }
  async function historialJde(idioma, nombre) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const d = await cargarJdeDatos();
    const j = PareoEvento.buscarEnHistorial(nombre, d.jugadores, window.JdeDatos.normalizar);
    const part = j ? j.part.filter((p) => p.torneo.jde) : [];
    if (!part.length) return [el("p", { class: "text-sm mt-2", role: "status" }, tx("verHistorialNada"))];
    return [el("p", { class: "text-sm mt-2 font-semibold", role: "status" }, tx("verHistorialDe", { n: j.nombre })),
      el("ul", { class: "text-sm mt-1 space-y-1 list-disc pl-5" }, part.map((p) => el("li", {},
        [p.torneo.anio, p.torneo.etapa, p.torneo.categoria ? tx("verHistorialCategoria", { c: p.torneo.categoria }) : null, p.torneo.modalidad].filter(Boolean).join(" · ") + ": " +
        (p.puesto ? tx("verHistorialPuesto", { p: p.puesto, d: p.torneo.de || "?" }) : tx("verHistorialJugo"))))),
      el("p", { class: "text-xs mt-1 text-brand-600 dark:text-brand-300" }, tx("verHistorialNota"))];
  }

  function tablas(idioma, datos, h, alTocar) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const nodos = [];
    if (datos.ronda) {
      nodos.push(el(h, { class: "font-serif text-xl font-bold mb-3" }, tx("rondaN", { r: datos.ronda.n })));
      const cuerpo = el("tbody");
      for (const m of datos.ronda.mesas) {
        cuerpo.append(el("tr", {},
          el("td", { class: "num" }, String(m.m)),
          el("td", { class: "font-semibold" }, m.b),
          m.n ? el("td", {}, m.n) : el("td", { class: "italic" }, tx("cBye")),
          el("td", { class: "text-center" }, m.r ? tx("corto_" + m.r) : "")));
      }
      nodos.push(el("div", { class: "overflow-x-auto mb-8" },
        el("table", { class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col" }, tx("mesa")), el("th", { scope: "col" }, tx("blancas")),
            el("th", { scope: "col" }, tx("negras")), el("th", { class: "text-center", scope: "col" }, tx("resultado")))),
          cuerpo)));
    }
    if (datos.clasificacion && datos.clasificacion.length) {
      nodos.push(el(h, { class: "font-serif text-xl font-bold mb-3" }, tx("fClasificacion")));
      const cuerpo = el("tbody");
      for (const f of datos.clasificacion) {
        // En el enlace del evento, el nombre abre su ficha.
        let celda = f.n;
        if (alTocar) {
          celda = el("button", { type: "button", class: "font-semibold underline underline-offset-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "data-jugador": f.n }, f.n);
          celda.addEventListener("click", () => alTocar(f.n));
        }
        cuerpo.append(el("tr", {}, el("td", { class: "num" }, String(f.p)), el("td", { class: "font-semibold" }, celda),
          el("td", { class: "num" }, puntosTexto(idioma, f.pts))));
      }
      nodos.push(el("div", { class: "overflow-x-auto" },
        el("table", { class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col" }, tx("puesto")), el("th", { scope: "col" }, tx("nombre")),
            el("th", { class: "num", scope: "col" }, tx("pts")))),
          cuerpo)));
    }
    return nodos;
  }

  function pintar(cont, idioma, datos, enVivo) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    cont.replaceChildren(
      el("h1", { class: "font-serif text-2xl font-bold mb-1" }, datos.nombre || "Pareo Integral"),
      el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-6" }, tx(enVivo ? "verEnVivoLeyenda" : "verFotoDelMomento")),
      ...tablas(idioma, datos, "h2"));
  }

  const normal = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // «Mi jugador»: dónde juega en la ronda de cada torneo (su mesa y, en
  // equipos, su tablero), con qué color, contra quién y cómo va.
  function buscarJugador(datos, q) {
    const out = [];
    for (const x of datos.torneos || []) {
      const tiene = (n) => n && normal(n).includes(q);
      const fila = (nombre) => (x.clasificacion || []).find((f) => f.n === nombre);
      // Lo que jugó antes: una línea por ronda anterior.
      const antes = (nombre) => (x.anteriores || []).map((RR) => {
        const m = RR.mesas.find((y) => y.b === nombre || y.n === nombre);
        return m ? { n: RR.n, rival: m.b === nombre ? m.n : m.b, color: m.b === nombre ? "b" : "n", r: m.r } : null;
      }).filter(Boolean);
      for (const m of (x.ronda && x.ronda.mesas) || []) {
        if (tiene(m.b)) out.push({ torneo: x.nombre, nombre: m.b, ronda: x.ronda.n, mesa: m.m, color: "b", rival: m.n, r: m.r, fila: fila(m.b), antes: antes(m.b) });
        if (tiene(m.n)) out.push({ torneo: x.nombre, nombre: m.n, ronda: x.ronda.n, mesa: m.m, color: "n", rival: m.b, r: m.r, fila: fila(m.n), antes: antes(m.n) });
        for (const k of m.tableros || []) {
          if (tiene(k.b)) out.push({ torneo: x.nombre, nombre: k.b, ronda: x.ronda.n, mesa: m.m, tablero: k.t, color: "b", rival: k.n, r: k.r });
          if (tiene(k.n)) out.push({ torneo: x.nombre, nombre: k.n, ronda: x.ronda.n, mesa: m.m, tablero: k.t, color: "n", rival: k.b, r: k.r });
        }
      }
    }
    return out;
  }

  function pintarMio(caja, idioma, datos, texto) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const q = normal(texto).trim();
    if (q.length < 3) { caja.replaceChildren(); return; }
    const hallados = buscarJugador(datos, q);
    if (!hallados.length) { caja.replaceChildren(el("p", { class: "text-sm" }, tx("verMioNada"))); return; }
    caja.replaceChildren(el("ul", { class: "space-y-2" }, hallados.slice(0, 20).map((h) => {
      // El resultado va escrito desde las blancas: «1-0» gana quien juega con blancas.
      const partes = [tx("verMioRonda", { r: h.ronda, m: h.mesa }) + (h.tablero ? ", " + tx("tableroN", { t: h.tablero }) : ""),
        tx(h.color === "b" ? "verMioBlancas" : "verMioNegras", { x: h.rival || tx("cBye") })];
      if (h.r) partes.push(tx("resultado") + ": " + tx("corto_" + h.r));
      if (h.fila) partes.push(tx("verMioPuesto", { p: h.fila.p, pts: puntosTexto(idioma, h.fila.pts) }));
      const antes = (h.antes || []).map((a) => tx("rondaN", { r: a.n }) + ": " + (a.rival ? tx(a.color === "b" ? "verMioBlancas" : "verMioNegras", { x: a.rival }) : tx("cBye")) + (a.r ? " " + tx("corto_" + a.r) : ""));
      return el("li", { class: "rounded-lg border border-brand-200 dark:border-brand-700 p-2 text-sm" },
        el("p", { class: "font-semibold" }, h.nombre), el("p", { class: "text-brand-600 dark:text-brand-300" }, h.torneo), el("p", {}, partes.join(" · ")),
        antes.length ? el("p", { class: "text-xs text-brand-600 dark:text-brand-300 mt-1" }, tx("verMioAntes") + " " + antes.join(" · ")) : null);
    })));
  }

  // Todo un evento: un desplegable por torneo, que queda abierto o cerrado
  // como lo dejó quien mira aunque llegue un resultado nuevo, y arriba el
  // buscador de «Mi jugador», que no se borra al llegar un resultado.
  function pintarEvento(cont, idioma, datos, abiertos) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    let caja = cont.querySelector("[data-evento]");
    if (!caja) {
      const buscar = el("input", { id: "pi-ver-buscar", type: "search", autocomplete: "off", class: "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" });
      buscar.addEventListener("input", () => pintarMio(cont.querySelector("#pi-ver-mio"), idioma, cont.__datos, buscar.value));
      // «Avisarme»: cuando sale una ronda nueva donde juega quien se buscó,
      // una notificación del celular (si la deja) y el aviso en la página.
      const avisar = el("button", { id: "pi-ver-avisar", type: "button", class: "border border-brand-300 dark:border-brand-600 text-brand-800 dark:text-white font-semibold px-3 py-1 rounded-lg text-sm hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("verAvisar"));
      avisar.addEventListener("click", async () => {
        // Si ya se sigue a alguien, el botón lo deja de seguir.
        if (cont.__seguir) {
          cont.__seguir = null;
          guardarSeguir(cont.__codigo, null);
          pintarAvisar(cont, idioma);
          cont.querySelector("#pi-ver-aviso").textContent = tx("verAvisarParado");
          return;
        }
        const q = normal(buscar.value).trim();
        if (q.length < 3) { cont.querySelector("#pi-ver-aviso").textContent = tx("verAvisarFalta"); return; }
        seguir(cont, q, buscar.value.trim());
        pintarAvisar(cont, idioma);
        cont.querySelector("#pi-ver-aviso").textContent = tx("verAvisarListo", { n: buscar.value.trim() });
        try { if (window.Notification && Notification.permission === "default") await Notification.requestPermission(); } catch (e) { /* sin notificaciones */ }
      });
      caja = el("div", { "data-evento": "" },
        el("h1", { id: "pi-ver-titulo", class: "font-serif text-2xl font-bold mb-1" }),
        el("p", { id: "pi-ver-leyenda", class: "text-sm text-brand-600 dark:text-brand-300 mb-4" }),
        el("label", { for: "pi-ver-buscar", class: "block text-sm font-semibold mb-1" }, tx("verBuscar")),
        buscar,
        el("p", { class: "text-xs text-brand-600 dark:text-brand-300 mt-1 mb-2" }, tx("verBuscarAyuda")),
        el("div", { id: "pi-ver-mio", class: "mb-2", "aria-live": "polite" }),
        avisar,
        el("p", { id: "pi-ver-aviso", class: "text-sm font-semibold mt-2 mb-6", role: "status", "aria-live": "assertive" }),
        el("div", { id: "pi-ver-ficha" }),
        el("div", { id: "pi-ver-torneos" }));
      cont.replaceChildren(caja);
    }
    cont.__datos = datos;
    // Lo que se seguía la vez pasada en este celular.
    if (!cont.__seguir && !cont.__seguirLeido) {
      cont.__seguirLeido = true;
      let x = null;
      try { x = JSON.parse(localStorage.getItem(CLAVE_SEGUIR + cont.__codigo) || "null"); } catch (e) { /* nada guardado */ }
      if (x && x.q) seguir(cont, x.q, x.texto || x.q);
    }
    pintarAvisar(cont, idioma);
    caja.querySelector("#pi-ver-titulo").textContent = datos.nombre || "Pareo Integral";
    caja.querySelector("#pi-ver-leyenda").textContent = tx("verEventoLeyenda", { n: (datos.torneos || []).length });
    const lista = caja.querySelector("#pi-ver-torneos");
    for (const d of lista.querySelectorAll("details[data-torneo]")) {
      if (d.open) abiertos.add(d.dataset.torneo); else abiertos.delete(d.dataset.torneo);
    }
    const nodos = [];
    cont.__elegidas = cont.__elegidas || new Map();
    for (const x of datos.torneos || []) {
      const resumen = x.nombre + (x.ronda ? " · " + tx("rondaN", { r: x.ronda.n }) : "");
      // Ver una ronda anterior: la elegida se queda aunque llegue un resultado.
      const anteriores = x.anteriores || [];
      const elegida = cont.__elegidas.get(x.nombre);
      const ronda = elegida ? anteriores.find((RR) => RR.n === elegida) || x.ronda : x.ronda;
      const cuerpo = tablas(idioma, Object.assign({}, x, { ronda }), "h3", (nombre) => {
        cont.__ficha = { torneo: x.nombre, nombre };
        pintarEvento(cont, idioma, cont.__datos, abiertos);
        const f = cont.querySelector("#pi-ver-ficha [data-ficha] h2");
        if (f) { f.tabIndex = -1; f.focus(); }
      });
      if (anteriores.length && x.ronda) {
        const sel = el("select", { class: "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-2 py-1 text-sm mb-3", "aria-label": tx("verRondaElegir") });
        for (const RR of anteriores.concat(x.ronda)) {
          const o = el("option", { value: String(RR.n) }, tx("rondaN", { r: RR.n }));
          if (RR.n === (ronda ? ronda.n : 0)) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener("change", () => {
          const k = Number(sel.value);
          if (k === x.ronda.n) cont.__elegidas.delete(x.nombre); else cont.__elegidas.set(x.nombre, k);
          pintarEvento(cont, idioma, cont.__datos, abiertos);
        });
        cuerpo.unshift(sel);
      }
      nodos.push(el("details", { class: "mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-torneo": x.nombre, open: abiertos.has(x.nombre) },
        el("summary", { class: "cursor-pointer font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, resumen,
          proximaTexto(idioma, x) ? el("span", { class: "block text-sm font-normal text-brand-600 dark:text-brand-300", "data-proxima": "" }, proximaTexto(idioma, x)) : null),
        el("div", { class: "mt-3" }, cuerpo.length ? cuerpo : el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("clasificadosSinRondas")))));
    }
    lista.replaceChildren(...nodos);
    // La ficha abierta, con lo último que llegó.
    const cajaFicha = caja.querySelector("#pi-ver-ficha");
    const fx = cont.__ficha && (datos.torneos || []).find((x) => x.nombre === cont.__ficha.torneo);
    if (fx) {
      const cerrar = el("button", { type: "button", class: "border border-brand-300 dark:border-brand-600 font-semibold px-3 py-1 rounded-lg text-sm mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("verFichaCerrar"));
      cerrar.addEventListener("click", () => { cont.__ficha = null; cajaFicha.replaceChildren(); });
      cajaFicha.replaceChildren(ficha(idioma, fx, cont.__ficha.nombre), cerrar);
    } else cajaFicha.replaceChildren();
    pintarMio(caja.querySelector("#pi-ver-mio"), idioma, datos, caja.querySelector("#pi-ver-buscar").value);
    avisarSiToca(cont, idioma, datos);
  }

  // A quién se sigue con «Avisarme», guardado en el celular por código de
  // evento: al volver a abrir el enlace se sigue avisando.
  const CLAVE_SEGUIR = "pareo_ver_seguir_v1_";
  function guardarSeguir(codigo, x) {
    if (!codigo) return;
    try { if (x) localStorage.setItem(CLAVE_SEGUIR + codigo, JSON.stringify(x)); else localStorage.removeItem(CLAVE_SEGUIR + codigo); } catch (e) { /* sin espacio */ }
  }
  function seguir(cont, q, texto) {
    // Lo que ya salió no se avisa: solo las rondas que vengan.
    cont.__seguir = { q, texto, rondas: new Map(buscarJugador(cont.__datos || {}, q).map((h) => [h.torneo, h.ronda])) };
    guardarSeguir(cont.__codigo, { q, texto });
  }
  function pintarAvisar(cont, idioma) {
    const b = cont.querySelector("#pi-ver-avisar");
    if (!b) return;
    b.textContent = X.t(idioma, cont.__seguir ? "verAvisarParar" : "verAvisar", { n: cont.__seguir ? cont.__seguir.texto : "" });
    b.setAttribute("aria-pressed", cont.__seguir ? "true" : "false");
  }
  // La notificación: en Android, Chrome solo las deja salir por el service
  // worker (new Notification() da error); en la computadora sirve cualquiera.
  async function notificar(titulo, texto) {
    if (!window.Notification || Notification.permission !== "granted") return;
    try {
      const reg = navigator.serviceWorker && (await Promise.race([navigator.serviceWorker.getRegistration(), new Promise((r) => setTimeout(r, 1000))]));
      if (reg && reg.showNotification) { await reg.showNotification(titulo, { body: texto, tag: "pareo-ronda" }); return; }
    } catch (e) { /* sin service worker: se prueba lo de siempre */ }
    try { new Notification(titulo, { body: texto }); } catch (e) { /* sin notificaciones */ }
  }

  function avisarSiToca(cont, idioma, datos) {
    const s = cont.__seguir;
    if (!s) return;
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    for (const h of buscarJugador(datos, s.q)) {
      const antes = s.rondas.get(h.torneo) || 0;
      if (h.ronda <= antes) continue;
      s.rondas.set(h.torneo, h.ronda);
      const texto = h.nombre + ": " + tx("verMioRonda", { r: h.ronda, m: h.mesa }) + ", " + tx(h.color === "b" ? "verMioBlancas" : "verMioNegras", { x: h.rival || tx("cBye") });
      cont.querySelector("#pi-ver-aviso").textContent = tx("verSalio") + " " + texto;
      notificar(tx("verSalio"), texto);
      try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) { /* sin vibración */ }
    }
  }

  // La pantalla para proyectar en el salón: un torneo a la vez, en grande,
  // y pasa sola al siguiente cada 15 segundos.
  const CADA = 15000;
  function pintarProyector(cont, idioma, datos, vuelta) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const torneos = (datos.torneos || []).filter((x) => x.ronda || (x.clasificacion && x.clasificacion.length));
    if (!torneos.length) { cont.replaceChildren(el("p", { class: "text-2xl" }, datos.nombre || ""), el("p", { class: "text-xl mt-4" }, tx("clasificadosSinRondas"))); return; }
    const i = vuelta % torneos.length;
    const x = torneos[i];
    cont.replaceChildren(el("div", { class: "pi-proyector" },
      el("p", { class: "text-xl text-brand-600 dark:text-brand-300" }, datos.nombre || ""),
      el("h1", { class: "font-serif text-4xl font-bold mb-1" }, x.nombre),
      el("p", { class: "text-lg text-brand-600 dark:text-brand-300 mb-6" }, tx("verProyectorTorneo", { i: i + 1, n: torneos.length })),
      proximaTexto(idioma, x) ? el("p", { class: "text-3xl font-bold mb-6", "data-proxima": "" }, proximaTexto(idioma, x)) : null,
      el("div", { class: "grid lg:grid-cols-2 gap-8" }, ...tablas(idioma, x, "h2").reduce((a, n, k, l) => (k % 2 ? a : a.concat(el("div", {}, n, l[k + 1]))), []))));
  }

  async function iniciar(cadena, idioma) {
    const cont = document.getElementById("pi-ver");
    const tx = (clave) => X.t(idioma, clave);
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("cargandoVer")));
    let datos;
    try {
      datos = await desempaquetar(cadena);
    } catch (e) {
      cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorVerEnlace")));
      return;
    }
    pintar(cont, idioma, datos, false);
  }

  async function iniciarVivo(codigo, idioma) {
    const cont = document.getElementById("pi-ver");
    const tx = (clave) => X.t(idioma, clave);
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("conectandoEnVivo")));
    try {
      await cargarSupabase();
    } catch (e) {
      cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorEnVivoVer")));
      return;
    }
    let llego = false;
    const canal = window.sb.channel("pareo-vivo-" + codigo);
    canal.on("broadcast", { event: "estado" }, (msg) => { llego = true; pintar(cont, idioma, msg.payload, true); });
    canal.subscribe();
    setTimeout(() => { if (!llego) cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("esperandoVivo"))); }, 8000);
  }

  // El botón de idioma del enlace: guarda el elegido y vuelve a abrir la
  // misma dirección (con su código), ya en el otro idioma.
  function botonIdioma(idioma, cambiar) {
    const b = el("button", { type: "button", id: "pi-ver-idioma", lang: idioma === "es" ? "en" : "es", class: "mb-4 border border-brand-300 dark:border-brand-600 text-brand-800 dark:text-white font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, idioma === "es" ? "English" : "Español");
    b.addEventListener("click", () => cambiar(idioma === "es" ? "en" : "es"));
    return b;
  }

  // Sin internet: lo último que llegó queda en este celular, con su hora, y
  // se muestra de entrada y cuando se cae la conexión.
  const CLAVE_ULTIMO = "pareo_ver_ultimo_v1_";
  function guardarUltimo(codigo, datos) { try { localStorage.setItem(CLAVE_ULTIMO + codigo, JSON.stringify({ hora: Date.now(), datos })); } catch (e) { /* sin espacio */ } }
  function leerUltimo(codigo) { try { return JSON.parse(localStorage.getItem(CLAVE_ULTIMO + codigo)); } catch (e) { return null; } }
  // La próxima ronda de un torneo del evento, con su cuenta regresiva (si
  // quien organiza puso el horario del día). La hora es la de Costa Rica.
  const minutosCR = () => {
    const [h, m] = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Costa_Rica" }).format(Date.now()).split(":").map(Number);
    return (h % 24) * 60 + m;
  };
  function proximaTexto(idioma, x) {
    if (!x.horas || !x.horas.length) return "";
    const p = PareoEvento.proximaRonda(x.horas, minutosCR());
    if (!p || (x.ronda && x.ronda.n > p.n)) return "";
    const falta = p.faltan >= 60 ? Math.floor(p.faltan / 60) + " h " + (p.faltan % 60) + " min" : p.faltan + " min";
    return X.t(idioma, p.faltan ? "verProxima" : "verProximaYa", { r: p.n, h: p.hora, f: falta });
  }
  const horaCorta = (ms) => new Date(ms).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" });

  async function iniciarEvento(cadena, idioma) {
    const [codigo, ...opciones] = String(cadena).split("&");
    const proyectar = opciones.includes("proyectar");
    const aviso = document.getElementById("pi-ver-conexion");
    const decirConexion = (texto) => { if (aviso) { aviso.textContent = texto; aviso.hidden = !texto; } };
    const cont = document.getElementById("pi-ver");
    const tx = (clave) => X.t(idioma, clave);
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("conectandoEnVivo")));
    try {
      await cargarSupabase();
    } catch (e) {
      cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorEnVivoVer")));
      return;
    }
    let llego = false;
    const abiertos = new Set();
    cont.__codigo = codigo;
    const canal = window.sb.channel("pareo-evento-" + codigo);
    let ultimo = null, vuelta = 0;
    const previo = leerUltimo(codigo);
    if (previo && previo.datos) {
      ultimo = previo.datos;
      llego = true;
      if (proyectar) pintarProyector(cont, idioma, ultimo, vuelta); else pintarEvento(cont, idioma, ultimo, abiertos);
      decirConexion(X.t(idioma, "verUltimoDe", { h: horaCorta(previo.hora) }));
    }
    window.addEventListener("offline", () => { const u = leerUltimo(codigo); decirConexion(X.t(idioma, "verSinConexion", { h: u ? horaCorta(u.hora) : "—" })); });
    window.addEventListener("online", () => { decirConexion(X.t(idioma, "verConectando")); canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
    canal.on("broadcast", { event: "estado" }, (msg) => {
      llego = true;
      ultimo = msg.payload;
      guardarUltimo(codigo, ultimo);
      decirConexion("");
      if (proyectar) pintarProyector(cont, idioma, ultimo, vuelta);
      else pintarEvento(cont, idioma, ultimo, abiertos);
    });
    if (proyectar) setInterval(() => { if (ultimo) pintarProyector(cont, idioma, ultimo, ++vuelta); }, CADA);
    // La cuenta regresiva corre aunque no llegue nada nuevo.
    else setInterval(() => { if (ultimo) pintarEvento(cont, idioma, ultimo, abiertos); }, 30000);
    // Al entrar se pide el estado: quien organiza lo manda sin esperar al
    // próximo resultado.
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
    setTimeout(() => { if (!llego) cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("esperandoVivo"))); }, 8000);
  }

  // La página del árbitro adjunto (#adjunto=<código>&m=1-10): sus mesas de
  // la ronda en juego, con un selector por mesa. Lo que manda lo acepta (o
  // no) la pestaña del árbitro principal, que contesta con el estado: una
  // mesa ya anotada se ve anotada y no se vuelve a tocar desde acá.
  const CLAVE_GRANDE = "pareo_adjunto_grande_v1";
  const RESULTADOS = { "1-0": "res10", "=": "resTablas", "0-1": "res01", "+-": "resMasMenos", "-+": "resMenosMas", "--": "resMenosMenos" };
  async function iniciarAdjunto(cadena, idioma) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const [codigo, ...opciones] = String(cadena).split("&");
    const rango = ((opciones.find((o) => o.startsWith("m=")) || "m=1-999").slice(2)).split("-").map(Number);
    const [desde, hasta] = [rango[0] || 1, rango[1] || 999];
    const cont = document.getElementById("pi-ver");
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("conectandoEnVivo")));
    try { await cargarSupabase(); }
    catch (e) { cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorEnVivoVer"))); return; }
    const canal = window.sb.channel("pareo-adjunto-" + codigo);
    const enviadas = new Set();
    try { if (localStorage.getItem(CLAVE_GRANDE) === "1") cont.classList.add("pi-grande"); } catch (e) { /* sin almacenamiento */ }
    // Un selector de resultado (de una mesa o de un tablero), que se apaga al
    // mandar hasta que el árbitro principal conteste.
    const selector = (d, mesa, tablero, clave, etiqueta) => {
      const sel = el("select", { id: "pi-adj-" + mesa + (tablero ? "-" + tablero : ""), class: "mt-2 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-3 py-2 text-base", "aria-label": etiqueta });
      sel.append(el("option", { value: "" }, tx("resSin")));
      for (const [v, k] of Object.entries(RESULTADOS)) sel.append(el("option", { value: v }, tx(k)));
      const estadoMesa = el("p", { class: "text-sm mt-1", role: "status" }, enviadas.has(clave) ? tx("adjuntoEnviando") : "");
      // Los tres resultados de siempre, a un toque (en una tableta, sin
      // abrir la lista); los demás, en el selector.
      const rapidos = el("div", { class: "flex flex-wrap gap-2 mt-2" });
      for (const v of ["1-0", "=", "0-1"]) {
        const b = el("button", { type: "button", class: "pi-adj-rapido border border-brand-300 dark:border-brand-600 font-semibold px-4 py-2 rounded-lg text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "data-r": v, "aria-label": etiqueta + ": " + tx(RESULTADOS[v]) }, tx(RESULTADOS[v]));
        b.addEventListener("click", () => { sel.value = v; sel.dispatchEvent(new Event("change")); });
        rapidos.append(b);
      }
      sel.addEventListener("change", () => {
        if (!sel.value) return;
        enviadas.add(clave);
        sel.disabled = true;
        for (const b of rapidos.children) b.disabled = true;
        estadoMesa.textContent = tx("adjuntoEnviando");
        canal.send({ type: "broadcast", event: "resultado", payload: Object.assign({ ronda: d.ronda, mesa, r: sel.value }, tablero ? { tablero } : {}) });
      });
      return el("div", {}, rapidos, sel, estadoMesa);
    };
    canal.on("broadcast", { event: "estado" }, (msg) => {
      const d = msg.payload || {};
      if (d.apagado) { cont.replaceChildren(el("p", { class: "text-base font-semibold" }, tx("adjuntoEnlaceApagado"))); canal.unsubscribe(); return; }
      const mesas = (d.mesas || []).filter((m) => m.m >= desde && m.m <= hasta);
      const lista = el("ul", { class: "space-y-3" });
      for (const m of mesas) {
        const li = el("li", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-mesa": String(m.m) },
          el("p", { class: "font-semibold" }, tx("mesa") + " " + m.m + ": " + m.b + " – " + (m.n || tx("cBye"))));
        if (!m.n) { lista.append(li); continue; }
        // En equipos, un selector por tablero.
        if (m.tableros) {
          for (const k of m.tableros) {
            const clave = m.m + "-" + k.t;
            const fila = el("div", { class: "mt-2", "data-tablero": String(k.t) },
              el("p", { class: "text-sm" }, tx("tableroN", { t: k.t }) + ": " + (k.b || tx("nadie")) + " – " + (k.n || tx("nadie"))));
            if (k.r || k.fijo) { enviadas.delete(clave); fila.append(el("p", { class: "text-sm" }, tx("adjuntoAnotada", { r: k.r ? tx("corto_" + k.r) : "—" }))); li.append(fila); continue; }
            fila.append(selector(d, m.m, k.t, clave, tx("resultadoTablero", { t: k.t, b: k.b, n: k.n })));
            li.append(fila);
          }
          lista.append(li);
          continue;
        }
        if (m.r) { enviadas.delete(m.m); li.append(el("p", { class: "text-sm mt-1" }, tx("adjuntoAnotada", { r: tx("corto_" + m.r) }))); lista.append(li); continue; }
        li.append(selector(d, m.m, null, m.m, tx("resultadoMesa", { m: m.m, b: m.b, n: m.n })));
        lista.append(li);
      }
      // Letra grande, para anotar desde una tableta en la sala; se recuerda.
      const grande = el("button", { type: "button", id: "pi-adj-grande", class: "border border-brand-300 dark:border-brand-600 font-semibold px-3 py-1 rounded-lg text-sm mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "aria-pressed": cont.classList.contains("pi-grande") ? "true" : "false" }, tx("adjuntoGrande"));
      grande.addEventListener("click", () => {
        const si = !cont.classList.contains("pi-grande");
        cont.classList.toggle("pi-grande", si);
        grande.setAttribute("aria-pressed", si ? "true" : "false");
        try { localStorage.setItem(CLAVE_GRANDE, si ? "1" : "0"); } catch (e) { /* sin espacio */ }
      });
      cont.replaceChildren(
        el("h1", { class: "font-serif text-2xl font-bold mb-1" }, d.nombre || "Pareo Integral"),
        el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-2" }, tx("adjuntoLeyenda", { r: d.ronda, a: desde, b: Math.min(hasta, (d.mesas || []).length) })),
        grande,
        mesas.length ? lista : el("p", { class: "text-sm" }, tx("adjuntoSinMesas")));
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
  }

  // La página del capitán (#capitan=<código>): su equipo en la ronda en
  // juego, una casilla por integrante (hasta 4, en el orden de tableros) y
  // «Confirmar la alineación». Lo acepta o no la pestaña del árbitro
  // principal, que contesta con el estado.
  async function iniciarCapitan(codigo, idioma) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const cont = document.getElementById("pi-ver");
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("conectandoEnVivo")));
    try { await cargarSupabase(); }
    catch (e) { cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorEnVivoVer"))); return; }
    const canal = window.sb.channel("pareo-capitan-" + String(codigo).split("&")[0]);
    let enviado = false;
    canal.on("broadcast", { event: "estado" }, (msg) => {
      const d = msg.payload || {};
      const nodos = [el("h1", { class: "font-serif text-2xl font-bold mb-1" }, d.equipo || ""),
        el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-4" }, (d.nombre || "") + " · " + tx("rondaN", { r: d.ronda }) + (d.rival ? " · " + tx("capitanContra", { e: d.rival }) : ""))];
      if (d.confirmada) { enviado = false; nodos.push(el("p", { id: "pi-cap-confirmada", class: "font-semibold mb-3" }, tx("capitanConfirmada", { h: horaCorta(d.confirmada) }))); }
      if (d.bloqueada) {
        nodos.push(el("p", { class: "text-sm" }, tx(d.rival ? "capitanBloqueada" : "capitanSinEncuentro")));
        cont.replaceChildren(...nodos);
        return;
      }
      const marcados = new Set(d.alineacion || []);
      const lista = el("ul", { class: "space-y-2" });
      const estadoTxt = el("p", { class: "text-sm mt-2", role: "status" }, enviado ? tx("adjuntoEnviando") : "");
      const boton = el("button", { type: "button", id: "pi-cap-confirmar", class: "mt-3 bg-brand-800 hover:bg-brand-900 dark:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("capitanConfirmar"));
      const pintarCuenta = () => { boton.disabled = marcados.size < 2 || marcados.size > 4; };
      (d.integrantes || []).forEach((j, k) => {
        const id = "pi-cap-" + k;
        const c = el("input", { type: "checkbox", id, class: "w-5 h-5" });
        c.checked = marcados.has(j.id);
        c.addEventListener("change", () => { if (c.checked) marcados.add(j.id); else marcados.delete(j.id); if (marcados.size > 4) { marcados.delete(j.id); c.checked = false; } pintarCuenta(); });
        lista.append(el("li", { class: "flex items-center gap-3" }, c, el("label", { for: id, class: "text-base" }, (k + 1) + ". " + j.nombre)));
      });
      boton.addEventListener("click", () => {
        enviado = true;
        boton.disabled = true;
        estadoTxt.textContent = tx("adjuntoEnviando");
        canal.send({ type: "broadcast", event: "alineacion", payload: { ronda: d.ronda, alineacion: [...marcados] } });
      });
      pintarCuenta();
      nodos.push(el("p", { class: "text-sm mb-2" }, tx("capitanInstrucciones")), lista, boton, estadoTxt);
      cont.replaceChildren(...nodos);
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
  }

  return { iniciarCapitan, empaquetar, desempaquetar, cargarSupabase, iniciar, iniciarVivo, iniciarEvento, iniciarAdjunto, pintarEvento, pintarProyector, buscarJugador, botonIdioma };
})();
