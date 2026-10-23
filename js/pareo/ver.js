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

  // Lo que se manda por un canal en vivo: tal cual si es chico, comprimido
  // si no. Supabase Realtime corta un mensaje de más de 256 KB (en el plan
  // gratuito) sin avisar, y un evento de 800 jugadores con todas sus rondas
  // pesa unos 360 KB (comprimido, unos 30). Lo chico no se comprime: así lo
  // lee también un celular viejo sin DecompressionStream.
  const LIMITE_VIVO = 180000;
  async function paraMandar(datos) {
    if (JSON.stringify(datos).length <= LIMITE_VIVO) return datos;
    return { z: await empaquetar(datos) };
  }
  async function alLlegar(payload) {
    return payload && typeof payload.z === "string" ? desempaquetar(payload.z) : payload;
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

  // Los encuentros abiertos (en equipos, tocar uno muestra sus tableros):
  // se recuerdan aparte porque la vista se vuelve a pintar con cada novedad
  // que llega, y lo abierto no se tiene que cerrar solo.
  const encuentrosAbiertos = new Set();
  const resultadoCorto = (tx, r) => (r && r !== "bye" ? tx("corto_" + r) : "");

  function tablas(idioma, datos, h, alTocar) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const nodos = [];
    if (datos.ronda) {
      nodos.push(el(h, { class: "font-serif text-xl font-bold mb-3" }, tx("rondaN", { r: datos.ronda.n })));
      const cuerpo = el("tbody");
      for (const m of datos.ronda.mesas) {
        const tableros = m.tableros && m.tableros.length ? m.tableros : null;
        const clave = (datos.nombre || "") + "|" + datos.ronda.n + "|" + m.m;
        let celdaB = m.b, celdaN = m.n;
        let detalle = null;
        if (tableros) {
          const abierto = encuentrosAbiertos.has(clave);
          const idDetalle = "pi-ver-tab-" + String(clave).replace(/[^A-Za-z0-9]+/g, "-");
          const jugados = tableros.filter((k) => k.r).length;
          const boton = (texto) => {
            const b = el("button", { type: "button", class: "font-semibold underline underline-offset-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
              "aria-expanded": abierto ? "true" : "false", "aria-controls": idDetalle, "data-encuentro": m.m, title: tx("verTablerosVer") }, texto);
            b.addEventListener("click", () => {
              if (encuentrosAbiertos.has(clave)) encuentrosAbiertos.delete(clave); else encuentrosAbiertos.add(clave);
              const ahora = encuentrosAbiertos.has(clave);
              const fila = document.getElementById(idDetalle);
              if (fila) fila.hidden = !ahora;
              for (const x of cuerpo.querySelectorAll('[aria-controls="' + idDetalle + '"]')) x.setAttribute("aria-expanded", ahora ? "true" : "false");
            });
            return b;
          };
          celdaB = boton(m.b);
          celdaN = boton(m.n);
          const lista = el("ol", { class: "space-y-1 text-sm" }, tableros.map((k) => el("li", { class: "flex flex-wrap gap-x-2", "data-tablero": k.t },
            el("span", { class: "font-mono text-xs font-bold" }, tx("tableroN", { t: k.t })),
            el("span", { class: "flex-1 min-w-[10rem]" }, (k.b || "—") + " (" + tx("blancas") + ") – " + (k.n || "—") + " (" + tx("negras") + ")"),
            el("span", { class: "font-semibold" }, k.r ? tx("corto_" + k.r) : tx("verTableroJugando")))));
          detalle = el("tr", { id: idDetalle, class: "pi-ver-tableros" }, el("td"), el("td", { colspan: "3" },
            el("p", { class: "text-xs text-brand-600 dark:text-brand-300 mb-1" }, tx("verTablerosLlevan", { k: jugados, n: tableros.length })), lista));
          detalle.hidden = !abierto;
        }
        cuerpo.append(el("tr", {},
          el("td", { class: "num" }, String(m.f || m.m)),
          el("td", { class: "font-semibold" }, celdaB),
          m.n ? el("td", {}, celdaN) : el("td", { class: "italic" }, tx("cBye")),
          el("td", { class: "text-center" }, resultadoCorto(tx, m.r))));
        if (detalle) cuerpo.append(detalle);
      }
      nodos.push(el("div", { class: "overflow-x-auto mb-8" },
        el("table", { class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col" }, tx("mesa")), el("th", { scope: "col" }, tx("blancas")),
            el("th", { scope: "col" }, tx("negras")), el("th", { class: "text-center", scope: "col" }, tx("resultado")))),
          cuerpo)));
    }
    if (datos.clasificacion && datos.clasificacion.length) {
      const conPT = datos.clasificacion.some((f) => f.pt != null);
      nodos.push(el(h, { class: "font-serif text-xl font-bold mb-3" }, tx("fClasificacion")));
      // La ronda en juego todavía no suma: si no, todos en 0 parece un error.
      if (datos.hasta != null && datos.ronda && datos.hasta < datos.ronda.n) {
        nodos.push(el("p", { class: "text-sm text-brand-600 dark:text-brand-300 -mt-2 mb-3", "data-clasif-hasta": "" },
          datos.hasta ? tx("verClasifHasta", { k: datos.hasta, r: datos.ronda.n }) : tx("verClasifSinRondas", { r: datos.ronda.n })));
      }
      const cuerpo = el("tbody");
      for (const f of datos.clasificacion) {
        // En el enlace del evento, el nombre abre su ficha.
        let celda = f.n;
        if (alTocar) {
          celda = el("button", { type: "button", class: "font-semibold underline underline-offset-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "data-jugador": f.n }, f.n);
          celda.addEventListener("click", () => alTocar(f.n));
        }
        cuerpo.append(el("tr", {}, el("td", { class: "num" }, String(f.p)), el("td", { class: "font-semibold" }, celda),
          el("td", { class: "num" }, puntosTexto(idioma, f.pts)),
          conPT ? el("td", { class: "num" }, f.pt == null ? "" : puntosTexto(idioma, f.pt)) : null));
      }
      nodos.push(el("div", { class: "overflow-x-auto" },
        el("table", { class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col" }, tx("puesto")), el("th", { scope: "col" }, tx("nombre")),
            el("th", { class: "num", scope: "col" }, tx("pts")),
            conPT ? el("th", { class: "num", scope: "col", title: tx("verPuntosTablero") }, tx("verPT")) : null)),
          cuerpo)));
    }
    // En equipos, los mejores de cada tablero hasta ahora.
    if (datos.mejores && datos.mejores.length) {
      nodos.push(el(h, { class: "font-serif text-xl font-bold mt-8 mb-3", "data-mejores": "" }, tx("verMejoresTableros")),
        el("div", { class: "grid sm:grid-cols-2 gap-4" }, datos.mejores.map((x) => el("div", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3" },
          el("p", { class: "font-semibold" }, tx("tableroN", { t: x.t })),
          el("ol", { class: "mt-1 space-y-1 text-sm" }, (x.filas || []).map((f) => el("li", {},
            el("span", { class: "font-semibold" }, f.p + ". " + f.n), " · " + f.e + " · " + tx("verMejorPuntos", { p: puntosTexto(idioma, f.pts), j: f.j }))))))));
    }
    return nodos;
  }

  // Los otros torneos del mismo evento (un JDE: cada categoría es un torneo):
  // cada uno abre el enlace del evento en vivo con ese torneo desplegado.
  // La dirección se arma acá con el código, que tiene que parecer un código:
  // lo que llega por el canal no va tal cual a un href.
  const CODIGO_VIVO = /^[a-z0-9]{4,16}$/;
  const enlaceEvento = (codigo, torneo) => location.pathname + "#evento=" + codigo + (torneo ? "&t=" + encodeURIComponent(torneo) : "");
  function otrosDelEvento(idioma, ev) {
    if (!ev || typeof ev.codigo !== "string" || !CODIGO_VIVO.test(ev.codigo)) return null;
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const otros = (ev.torneos || []).filter((n) => typeof n === "string" && n !== ev.este);
    const clase = "inline-block border border-brand-300 dark:border-brand-600 text-brand-800 dark:text-white font-semibold px-3 py-1 rounded-lg text-sm hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    return el("nav", { class: "mb-6 rounded-xl border border-brand-200 dark:border-brand-700 p-3", "aria-label": tx("verOtrosTorneos"), "data-otros-torneos": "" },
      el("p", { class: "text-sm" }, tx("verParteDe", { e: String(ev.nombre || "") })),
      otros.length ? el("ul", { class: "mt-2 flex flex-wrap gap-2" }, otros.map((n) => el("li", {}, el("a", { href: enlaceEvento(ev.codigo, n), class: clase }, n)))) : null,
      el("a", { href: enlaceEvento(ev.codigo), class: "inline-block mt-2 text-sm font-semibold underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "data-todo-evento": "" }, tx("verTodoElEvento")));
  }

  // El torneo publicado en «Torneos en Pareo Integral»: ahí queda aunque
  // quien organiza cierre su pestaña. El id llega en lo que manda la pestaña
  // (texto ajeno): solo se usa si tiene forma de id.
  const ID_PUBLICADO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  function enlacePublicado(idioma, pub) {
    if (!pub || !ID_PUBLICADO.test(pub)) return null;
    return el("p", { class: "text-sm mb-4", "data-publicado": "" },
      el("a", { href: "torneos-pareo.html#t=" + pub, class: "underline underline-offset-2 hover:no-underline font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, X.t(idioma, "verPublicado")));
  }
  // Un enlace en vivo que ya nadie transmite: si el torneo (o el evento) se
  // publicó, se busca por su código y se ofrece ir a lo publicado.
  async function buscarPublicados(campo, codigo) {
    if (!window.sb || !/^[a-z0-9]{6,12}$/.test(codigo)) return [];
    try {
      const { data } = await window.sb.from("pareo_publicados").select("id,nombre").filter("datos->>" + campo, "eq", codigo).order("nombre").range(0, 99);
      return (data || []).filter((x) => ID_PUBLICADO.test(x.id));
    } catch (e) { return []; }
  }
  async function ofrecerPublicados(cont, idioma, campo, codigo, siguePendiente) {
    const lista = await buscarPublicados(campo, codigo);
    if (!lista.length || !siguePendiente()) return;
    cont.replaceChildren(el("div", { "data-publicados": "" },
      el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, X.t(idioma, "esperandoVivo")),
      el("h2", { class: "font-serif text-xl font-bold mt-4 mb-2" }, X.t(idioma, "verQuedoPublicado")),
      el("ul", { class: "space-y-2" }, lista.map((x) => el("li", {},
        el("a", { href: "torneos-pareo.html#t=" + x.id, class: "underline underline-offset-2 hover:no-underline font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, x.nombre))))));
  }

  function pintar(cont, idioma, datos, enVivo) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    cont.replaceChildren(
      el("h1", { class: "font-serif text-2xl font-bold mb-1" }, datos.nombre || "Pareo Integral"),
      el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-6" }, tx(enVivo ? "verEnVivoLeyenda" : "verFotoDelMomento")),
      ...[enlacePublicado(idioma, datos.pub), otrosDelEvento(idioma, datos.evento)].filter(Boolean),
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
        if (tiene(m.b)) out.push({ torneo: x.nombre, nombre: m.b, ronda: x.ronda.n, mesa: m.f || m.m, color: "b", rival: m.n, r: m.r, fila: fila(m.b), antes: antes(m.b), horas: x.horas });
        if (tiene(m.n)) out.push({ torneo: x.nombre, nombre: m.n, ronda: x.ronda.n, mesa: m.f || m.m, color: "n", rival: m.b, r: m.r, fila: fila(m.n), antes: antes(m.n), horas: x.horas });
        for (const k of m.tableros || []) {
          if (tiene(k.b)) out.push({ torneo: x.nombre, nombre: k.b, ronda: x.ronda.n, mesa: m.f || m.m, tablero: k.t, color: "b", rival: k.n, r: k.r, horas: x.horas });
          if (tiene(k.n)) out.push({ torneo: x.nombre, nombre: k.n, ronda: x.ronda.n, mesa: m.f || m.m, tablero: k.t, color: "n", rival: k.b, r: k.r, horas: x.horas });
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
      if (h.r && h.r !== "bye") partes.push(tx("resultado") + ": " + tx("corto_" + h.r));
      if (h.fila) partes.push(tx("verMioPuesto", { p: h.fila.p, pts: puntosTexto(idioma, h.fila.pts) }));
      const antes = (h.antes || []).map((a) => tx("rondaN", { r: a.n }) + ": " + (a.rival ? tx(a.color === "b" ? "verMioBlancas" : "verMioNegras", { x: a.rival }) : tx("cBye")) + (a.r && a.r !== "bye" ? " " + tx("corto_" + a.r) : ""));
      // Cuándo es su próxima ronda, del horario que puso quien organiza.
      const proxima = proximaTexto(idioma, { horas: h.horas, ronda: { n: h.ronda } });
      return el("li", { class: "rounded-lg border border-brand-200 dark:border-brand-700 p-2 text-sm" },
        el("p", { class: "font-semibold" }, h.nombre), el("p", { class: "text-brand-600 dark:text-brand-300" }, h.torneo), el("p", {}, partes.join(" · ")),
        proxima ? el("p", { class: "font-semibold mt-1", "data-mio-proxima": "" }, proxima) : null,
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
        // «Mi centro»: los de un centro educativo en todos los torneos.
        el("label", { for: "pi-ver-centro", class: "block text-sm font-semibold mb-1" }, tx("verCentro")),
        el("select", { id: "pi-ver-centro", class: "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }),
        el("div", { id: "pi-ver-centro-lista", class: "mt-2 mb-6", "aria-live": "polite" }),
        el("div", { id: "pi-ver-ficha" }),
        el("div", { id: "pi-ver-torneos" }));
      cont.replaceChildren(caja);
      if (cont.__q) buscar.value = cont.__q;
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
    pintarCentro(cont, idioma, datos);
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
        el("div", { class: "mt-3" }, enlacePublicado(idioma, x.pub), cuerpo.length ? cuerpo : el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("clasificadosSinRondas")))));
    }
    // Ir directo a un torneo (en un JDE son muchas categorías): lo abre y
    // lleva hasta él.
    const torneos = datos.torneos || [];
    const indice = torneos.length > 1 ? el("nav", { class: "mb-4", "aria-label": tx("verIrATorneo"), "data-indice-torneos": "" },
      el("p", { class: "text-sm font-semibold mb-1" }, tx("verIrATorneo")),
      el("ul", { class: "flex flex-wrap gap-2" }, torneos.map((x) => {
        const b = el("button", { type: "button", class: "border border-brand-300 dark:border-brand-600 text-brand-800 dark:text-white font-semibold px-3 py-1 rounded-lg text-sm hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "data-ir-torneo": x.nombre }, x.nombre);
        b.addEventListener("click", () => irATorneo(cont, x.nombre));
        return el("li", {}, b);
      }))) : null;
    lista.replaceChildren(...[indice].filter(Boolean), ...nodos);
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

  // «Mi centro»: el selector se rellena con cada estado que llega, sin
  // perder lo elegido (que se recuerda en el celular por código de evento).
  const CLAVE_CENTRO = "pareo_ver_centro_v1_";
  // Abre el torneo en la lista del evento y lleva el foco hasta él.
  function irATorneo(cont, nombre) {
    const d = [...cont.querySelectorAll("details[data-torneo]")].find((x) => x.dataset.torneo === nombre);
    if (!d) return false;
    d.open = true;
    d.scrollIntoView({ block: "start" });
    const s = d.querySelector("summary");
    if (s) s.focus({ preventScroll: true });
    return true;
  }

  function pintarCentro(cont, idioma, datos) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const sel = cont.querySelector("#pi-ver-centro");
    if (!sel) return;
    if (!sel.dataset.listo) {
      sel.dataset.listo = "1";
      try { sel.dataset.elegido = localStorage.getItem(CLAVE_CENTRO + cont.__codigo) || ""; } catch (e) { /* sin almacenamiento */ }
      sel.addEventListener("change", () => {
        sel.dataset.elegido = sel.value;
        try { localStorage.setItem(CLAVE_CENTRO + cont.__codigo, sel.value); } catch (e) { /* sin espacio */ }
        pintarCentro(cont, idioma, cont.__datos);
      });
    }
    const centros = PareoEvento.centrosDeVista(datos);
    const elegido = sel.dataset.elegido || "";
    sel.replaceChildren(el("option", { value: "" }, tx("verCentroNinguno")), ...centros.map((c) => el("option", { value: c }, c)));
    sel.value = centros.includes(elegido) ? elegido : "";
    const lista = cont.querySelector("#pi-ver-centro-lista");
    if (!sel.value) { lista.replaceChildren(); return; }
    const grupos = PareoEvento.delCentro(datos, sel.value);
    lista.replaceChildren(grupos.length ? el("div", { class: "space-y-2" }, grupos.map((g) => el("section", { class: "rounded-lg border border-brand-200 dark:border-brand-700 p-2" },
      el("h3", { class: "font-semibold text-sm" }, g.torneo),
      el("ul", { class: "text-sm" }, g.filas.map((f) => el("li", {}, tx("verCentroFila", { p: f.p, n: f.n, pts: puntosTexto(idioma, f.pts) }))))))) :
      el("p", { class: "text-sm" }, tx("verCentroNada")));
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
  // El reloj de la ronda en juego: desde cuándo se juega y qué mesas
  // faltan por terminar (con «Empezar la ronda» del reloj del retraso).
  function relojRonda(idioma, x) {
    const R = x.ronda;
    if (!R || !R.inicio) return null;
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const lleva = Math.max(0, Math.floor((Date.now() - R.inicio) / 60000));
    const faltan = R.mesas.filter((m) => m.n && !m.r).map((m) => m.f || m.m);
    return el("div", { class: "text-2xl mb-6", "data-reloj-ronda": "" },
      el("p", { class: "font-bold" }, tx("verRelojRonda", { r: R.n, h: horaCorta(R.inicio), l: lleva >= 60 ? Math.floor(lleva / 60) + " h " + (lleva % 60) + " min" : lleva + " min" })),
      el("p", {}, faltan.length ? tx("verRelojFaltan", { n: faltan.length, l: faltan.join(", ") }) : tx("verRelojTerminaron")));
  }

  // El llamado a la ronda: cuando una categoría empareja una ronda nueva, el
  // proyector deja de pasar torneos y muestra sus mesas en grande un rato
  // (LLAMADO_MS); si son varias a la vez, una detrás de otra. Con «Leer en
  // voz alta» (lo prende alguien en la computadora del proyector: el
  // navegador no deja hablar sin que se toque algo), además lo dice.
  const LLAMADO_MS = 45000;
  function anotarLlamados(cont, datos) {
    const vistas = cont.__rondasVistas || (cont.__rondasVistas = new Map());
    const cola = cont.__llamados || (cont.__llamados = []);
    const primera = !cont.__llamadosListos;
    cont.__llamadosListos = true;
    for (const x of datos.torneos || []) {
      const n = x.ronda ? x.ronda.n : 0;
      const antes = vistas.get(x.nombre);
      vistas.set(x.nombre, n);
      if (!primera && n && (antes == null || n > antes)) cola.push({ nombre: x.nombre, n });
    }
  }
  function llamadoActual(cont) {
    const cola = cont.__llamados || [];
    while (cola.length) {
      const c = cola[0];
      if (!c.desde) c.desde = Date.now();
      if (Date.now() - c.desde < LLAMADO_MS) return c;
      cola.shift();
    }
    return null;
  }
  function decirLlamado(idioma, c) {
    if (c.dicho || !window.speechSynthesis) return;
    c.dicho = true;
    try {
      const u = new SpeechSynthesisUtterance(X.t(idioma, "verLlamadoVoz", { t: c.nombre, r: c.n }));
      u.lang = idioma === "en" ? "en-US" : "es-CR";
      window.speechSynthesis.speak(u);
    } catch (e) { /* sin voz */ }
  }
  function botonVoz(cont, idioma) {
    const b = el("button", { type: "button", id: "pi-proyector-voz", class: "no-imprimir border border-current font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
      "aria-pressed": cont.__voz ? "true" : "false" }, X.t(idioma, cont.__voz ? "verVozApagar" : "verVozPrender"));
    b.addEventListener("click", () => { cont.__voz = !cont.__voz; b.setAttribute("aria-pressed", cont.__voz ? "true" : "false"); b.textContent = X.t(idioma, cont.__voz ? "verVozApagar" : "verVozPrender"); });
    return b;
  }

  function pintarProyector(cont, idioma, datos, vuelta) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const torneos = (datos.torneos || []).filter((x) => x.ronda || (x.clasificacion && x.clasificacion.length));
    if (!torneos.length) { cont.replaceChildren(el("p", { class: "text-2xl" }, datos.nombre || ""), el("p", { class: "text-xl mt-4" }, tx("clasificadosSinRondas"))); return; }
    // Un llamado pendiente va primero.
    const c = llamadoActual(cont);
    const xc = c && torneos.find((x) => x.nombre === c.nombre && x.ronda && x.ronda.n === c.n);
    if (xc) {
      if (cont.__voz) decirLlamado(idioma, c);
      cont.replaceChildren(el("div", { class: "pi-proyector", "data-llamado": "" },
        el("div", { class: "flex justify-between items-start gap-4" }, el("p", { class: "text-xl text-brand-600 dark:text-brand-300" }, datos.nombre || ""), botonVoz(cont, idioma)),
        el("h1", { class: "font-serif text-5xl font-bold mt-2 mb-6" }, tx("verLlamado", { t: xc.nombre, r: xc.ronda.n })),
        ...tablas(idioma, { nombre: xc.nombre, ronda: xc.ronda }, "h2")));
      return;
    }
    const i = vuelta % torneos.length;
    const x = torneos[i];
    // Terminado: la pantalla de premiación.
    if (x.terminado && x.podio && x.podio.length) {
      cont.replaceChildren(el("div", { class: "pi-proyector", "data-podio": "" },
        el("div", { class: "flex justify-between items-start gap-4" }, el("p", { class: "text-xl text-brand-600 dark:text-brand-300" }, datos.nombre || ""), botonVoz(cont, idioma)),
        el("h1", { class: "font-serif text-4xl font-bold mb-6" }, tx("verPremiacion", { t: x.nombre })),
        el("ol", { class: "space-y-4" }, x.podio.map((f) => el("li", { class: "pi-podio-lugar text-3xl", "data-puesto": String(f.p) },
          el("span", { class: "font-bold" }, tx("verPuestoN", { p: f.p }) + " "), el("span", { class: "font-serif font-bold" }, f.n),
          f.i ? el("span", { class: "block text-xl text-brand-600 dark:text-brand-300" }, f.i) : null))),
        ...(x.mejores && x.mejores.length ? tablas(idioma, { mejores: x.mejores }, "h2") : [])));
      return;
    }
    cont.replaceChildren(el("div", { class: "pi-proyector" },
      el("div", { class: "flex justify-between items-start gap-4" }, el("p", { class: "text-xl text-brand-600 dark:text-brand-300" }, datos.nombre || ""), botonVoz(cont, idioma)),
      el("h1", { class: "font-serif text-4xl font-bold mb-1" }, x.nombre),
      el("p", { class: "text-lg text-brand-600 dark:text-brand-300 mb-6" }, tx("verProyectorTorneo", { i: i + 1, n: torneos.length })),
      proximaTexto(idioma, x) ? el("p", { class: "text-3xl font-bold mb-6", "data-proxima": "" }, proximaTexto(idioma, x)) : null,
      relojRonda(idioma, x),
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
    canal.on("broadcast", { event: "estado" }, async (msg) => {
      let datos;
      try { datos = await alLlegar(msg.payload); } catch (e) { return; }
      llego = true;
      pintar(cont, idioma, datos, true);
    });
    canal.subscribe();
    setTimeout(() => {
      if (llego) return;
      cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("esperandoVivo")));
      ofrecerPublicados(cont, idioma, "vivo", codigo, () => !llego);
    }, 8000);
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
    // «&t=<torneo>»: llegó desde el enlace de un torneo y abre ese.
    let irA = null;
    const t = opciones.find((x) => x.startsWith("t="));
    if (t) { try { irA = decodeURIComponent(t.slice(2)); } catch (e) { irA = null; } }
    // «&q=<nombre>»: el QR de una planilla de anotación; «Mi jugador» ya
    // buscado con ese nombre.
    const q = opciones.find((x) => x.startsWith("q="));
    const aviso = document.getElementById("pi-ver-conexion");
    const decirConexion = (texto) => { if (aviso) { aviso.textContent = texto; aviso.hidden = !texto; } };
    const cont = document.getElementById("pi-ver");
    if (q) { try { cont.__q = decodeURIComponent(q.slice(2)).slice(0, 80); } catch (e) { cont.__q = null; } }
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
    if (irA) abiertos.add(irA);
    // Llevar hasta el torneo pedido la primera vez que se pinta con él.
    const llevar = () => { if (irA && !proyectar && irATorneo(cont, irA)) irA = null; };
    cont.__codigo = codigo;
    const canal = window.sb.channel("pareo-evento-" + codigo);
    let ultimo = null, vuelta = 0;
    const previo = leerUltimo(codigo);
    if (previo && previo.datos) {
      ultimo = previo.datos;
      llego = true;
      if (proyectar) { anotarLlamados(cont, ultimo); pintarProyector(cont, idioma, ultimo, vuelta); } else { pintarEvento(cont, idioma, ultimo, abiertos); llevar(); }
      decirConexion(X.t(idioma, "verUltimoDe", { h: horaCorta(previo.hora) }));
    }
    window.addEventListener("offline", () => { const u = leerUltimo(codigo); decirConexion(X.t(idioma, "verSinConexion", { h: u ? horaCorta(u.hora) : "—" })); });
    window.addEventListener("online", () => { decirConexion(X.t(idioma, "verConectando")); canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
    canal.on("broadcast", { event: "estado" }, async (msg) => {
      let datos;
      try { datos = await alLlegar(msg.payload); } catch (e) { return; }
      llego = true;
      ultimo = datos;
      guardarUltimo(codigo, ultimo);
      decirConexion("");
      if (proyectar) { anotarLlamados(cont, ultimo); pintarProyector(cont, idioma, ultimo, vuelta); }
      else { pintarEvento(cont, idioma, ultimo, abiertos); llevar(); }
    });
    if (proyectar) setInterval(() => { if (ultimo) pintarProyector(cont, idioma, ultimo, ++vuelta); }, CADA);
    // La cuenta regresiva corre aunque no llegue nada nuevo.
    else setInterval(() => { if (ultimo) pintarEvento(cont, idioma, ultimo, abiertos); }, 30000);
    // Al entrar se pide el estado: quien organiza lo manda sin esperar al
    // próximo resultado.
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
    setTimeout(() => {
      if (llego) return;
      cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("esperandoVivo")));
      ofrecerPublicados(cont, idioma, "codigoEvento", codigo, () => !llego);
    }, 8000);
  }

  // La página del árbitro adjunto (#adjunto=<código>&m=1-10): sus mesas de
  // la ronda en juego, con un selector por mesa. Lo que manda lo acepta (o
  // no) la pestaña del árbitro principal, que contesta con el estado: una
  // mesa ya anotada se ve anotada y no se vuelve a tocar desde acá.
  const CLAVE_GRANDE = "pareo_adjunto_grande_v1";
  const CLAVE_AUTOR = "pareo_adjunto_autor_v1";
  const RESULTADOS = { "1-0": "res10", "=": "resTablas", "0-1": "res01", "+-": "resMasMenos", "-+": "resMenosMas", "--": "resMenosMenos" };
  // La marca de las incidencias de un jugador (i, !) junto a su nombre: un
  // botón chico que abre, debajo, de qué fue cada una.
  function marcaCelular(tx, marca, nombre, cont) {
    if (!marca || !marca.t) return null;
    const det = el("div", { class: "pi-inc-detalle text-sm mt-1", hidden: true },
      el("p", { class: "font-semibold" }, nombre + (marca.pierde ? " · " + tx("marcaPierde") : "")),
      el("ul", { class: "list-disc pl-5" }, (marca.d || []).map((x) => el("li", {}, String(x)))));
    const b = el("button", { type: "button", class: "pi-marca-inc", "data-marca": marca.t, "aria-expanded": "false", "aria-label": tx("marcaVerCorta", { n: nombre }) }, marca.t);
    b.addEventListener("click", () => { det.hidden = !det.hidden; b.setAttribute("aria-expanded", det.hidden ? "false" : "true"); });
    cont.append(det);
    return b;
  }

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
    // Una ronda nueva: el celular vibra (si deja) y lo dice arriba hasta que
    // el adjunto toque «Listo», para que no tenga que estar mirándolo.
    let rondaVista = null;
    let avisoRonda = "";
    canal.on("broadcast", { event: "estado" }, (msg) => {
      const d = msg.payload || {};
      if (d.apagado) { cont.replaceChildren(el("p", { class: "text-base font-semibold" }, tx("adjuntoEnlaceApagado"))); canal.unsubscribe(); return; }
      const mesas = (d.mesas || []).filter((m) => m.m >= desde && m.m <= hasta);
      if (rondaVista !== null && d.ronda !== rondaVista && mesas.length) {
        avisoRonda = tx("adjuntoRondaNueva", { r: d.ronda, m: mesas.map((m) => m.f || m.m).join(", ") });
        try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch (e) { /* sin vibración */ }
      }
      rondaVista = d.ronda;
      const lista = el("ul", { class: "space-y-3" });
      for (const m of mesas) {
        const li = el("li", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-mesa": String(m.m) });
        const dets = el("div");
        const cab = el("p", { class: "font-semibold" }, tx("mesa") + " " + (m.f || m.m) + ": " + m.b);
        const mb = marcaCelular(tx, m.mb, m.b, dets);
        if (mb) cab.append(" ", mb);
        cab.append(" – " + (m.n || tx("cBye")));
        const mn = m.n ? marcaCelular(tx, m.mn, m.n, dets) : null;
        if (mn) cab.append(" ", mn);
        li.append(cab, dets);
        if (!m.n) { lista.append(li); continue; }
        // En equipos, un selector por tablero.
        if (m.tableros) {
          for (const k of m.tableros) {
            const clave = m.m + "-" + k.t;
            const detsT = el("div");
            const pT = el("p", { class: "text-sm" }, tx("tableroN", { t: k.t }) + ": " + (k.b || tx("nadie")));
            const tb = k.b ? marcaCelular(tx, k.mb, k.b, detsT) : null;
            if (tb) pT.append(" ", tb);
            pT.append(" – " + (k.n || tx("nadie")));
            const tn = k.n ? marcaCelular(tx, k.mn, k.n, detsT) : null;
            if (tn) pT.append(" ", tn);
            const fila = el("div", { class: "mt-2", "data-tablero": String(k.t) }, pT, detsT);
            if (k.r || k.fijo) { enviadas.delete(clave); fila.append(el("p", { class: "text-sm" }, tx("adjuntoAnotada", { r: k.r ? tx("corto_" + k.r) : "—" }))); li.append(fila); continue; }
            fila.append(selector(d, m.m, k.t, clave, tx("resultadoTablero", { t: k.t, b: k.b, n: k.n })));
            li.append(fila);
          }
          lista.append(li);
          continue;
        }
        if (m.r) { enviadas.delete(m.m); li.append(el("p", { class: "text-sm mt-1" }, tx("adjuntoAnotada", { r: tx("corto_" + m.r) }))); lista.append(li); continue; }
        li.append(selector(d, m.m, null, m.m, tx("resultadoMesa", { m: m.f || m.m, b: m.b, n: m.n })));
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
      let aviso = null;
      if (avisoRonda) {
        const listo = el("button", { type: "button", id: "pi-adj-aviso-listo", class: "ml-2 border border-current font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("adjuntoAvisoListo"));
        listo.addEventListener("click", () => { avisoRonda = ""; const a = document.getElementById("pi-adj-aviso"); if (a) a.remove(); });
        aviso = el("div", { id: "pi-adj-aviso", role: "alert", class: "mb-4 rounded-xl border-2 border-brand-800 dark:border-white bg-brand-50 dark:bg-brand-800 p-3 text-base font-semibold" }, avisoRonda, listo);
      }
      cont.replaceChildren(
        el("h1", { class: "font-serif text-2xl font-bold mb-1" }, d.nombre || "Pareo Integral"),
        ...[aviso].filter(Boolean),
        el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-2" }, tx("adjuntoLeyenda", { r: d.ronda, a: desde, b: Math.min(hasta, (d.mesas || []).length) })),
        grande,
        mesas.length ? lista : el("p", { class: "text-sm" }, tx("adjuntoSinMesas")),
        notaInforme(d, mesas));
    });
    canal.on("broadcast", { event: "notaRecibida" }, () => {
      const x = document.getElementById("pi-adj-nota-estado");
      if (x) x.textContent = tx("adjuntoNotaRecibida");
      const t = document.getElementById("pi-adj-nota");
      if (t) t.value = "";
    });
    // La nota para el informe: se arma una vez y se queda (lo escrito no se
    // pierde cuando llega un resultado nuevo).
    let cajaNota = null;
    let mesasNota = [];
    function notaInforme(d, mesas) {
      mesasNota = mesas;
      if (cajaNota) { cajaNota.__llenarQuien(); return cajaNota; }
      let autor = "";
      try { autor = localStorage.getItem(CLAVE_AUTOR) || ""; } catch (e) { /* sin almacenamiento */ }
      const nombre = el("input", { id: "pi-adj-autor", type: "text", maxlength: "60", autocomplete: "name", value: autor, class: "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-base" });
      const mesa = el("select", { id: "pi-adj-nota-mesa", class: "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-base", "aria-label": tx("mesa") },
        el("option", { value: "" }, tx("incSinMesa")), mesas.map((m) => el("option", { value: String(m.m) }, tx("mesa") + " " + (m.f || m.m))));
      // A quién va (de los que juegan esa mesa), el tipo y el artículo.
      const quien = el("select", { id: "pi-adj-nota-jugador", class: "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-base", "aria-label": tx("incJugador"), disabled: true });
      const llenarQuien = () => {
        const m = mesasNota.find((x) => String(x.m) === mesa.value);
        const antes = quien.value;
        quien.replaceChildren(el("option", { value: "" }, tx("incSinJugador")), ...((m && m.quien) || []).map((x) => el("option", { value: x.k }, x.e)));
        quien.value = [...quien.options].some((o) => o.value === antes) ? antes : "";
        quien.disabled = !(m && m.quien && m.quien.length);
      };
      mesa.addEventListener("change", llenarQuien);
      const TIPOS = { reclamo: "incReclamo", sancion: "incSancion", decision: "incDecision", otra: "incOtra" };
      const tipo = el("select", { id: "pi-adj-nota-tipo", class: "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-base", "aria-label": tx("incTipo") },
        Object.entries(TIPOS).map(([k, c]) => el("option", { value: k }, tx(c))));
      const articulo = el("select", { id: "pi-adj-nota-articulo", class: "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-base max-w-full", "aria-label": tx("incArticulo") },
        el("option", { value: "" }, tx("incSinArticulo")), Object.keys(PareoEvento.ARTICULOS).map((k) => el("option", { value: k }, PareoEvento.articuloTexto(k))));
      const texto = el("textarea", { id: "pi-adj-nota", rows: "3", maxlength: "500", class: "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-base mt-2", "aria-label": tx("adjuntoNotaQue") });
      const estadoNota = el("p", { id: "pi-adj-nota-estado", class: "text-sm mt-1", role: "status" });
      const mandar = el("button", { type: "button", id: "pi-adj-nota-mandar", class: "mt-2 border border-brand-300 dark:border-brand-600 font-semibold px-4 py-2 rounded-lg text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("adjuntoNotaMandar"));
      mandar.addEventListener("click", () => {
        if (!nombre.value.trim()) { estadoNota.textContent = tx("adjuntoNotaFaltaNombre"); nombre.focus(); return; }
        if (!texto.value.trim()) { estadoNota.textContent = tx("incFalta"); texto.focus(); return; }
        try { localStorage.setItem(CLAVE_AUTOR, nombre.value.trim()); } catch (e) { /* sin espacio */ }
        estadoNota.textContent = tx("adjuntoEnviando");
        canal.send({ type: "broadcast", event: "nota", payload: { autor: nombre.value.trim(), texto: texto.value.trim(), mesa: mesa.value ? Number(mesa.value) : null,
          lado: quien.value || null, tipo: tipo.value, articulo: articulo.value || null } });
      });
      cajaNota = el("section", { class: "mt-6 rounded-xl border border-brand-200 dark:border-brand-700 p-3", "aria-labelledby": "pi-adj-nota-t" },
        el("h2", { id: "pi-adj-nota-t", class: "font-semibold" }, tx("adjuntoNotaTitulo")),
        el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-2" }, tx("adjuntoNotaTexto")),
        el("label", { for: "pi-adj-autor", class: "block text-sm font-semibold mb-1" }, tx("adjuntoNotaNombre")), nombre,
        el("div", { class: "mt-2 flex flex-wrap gap-2" }, mesa, quien, tipo, articulo), texto, mandar, estadoNota);
      cajaNota.__llenarQuien = llenarQuien;
      return cajaNota;
    }
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

  // El recuadro para firmar con el dedo o el mouse. imagen() da la firma en
  // JPEG (fondo blanco: el PDF no lleva transparencia), en base64.
  function padFirma(tx) {
    const ANCHO = 600, ALTO = 200;
    const lienzo = el("canvas", { width: String(ANCHO), height: String(ALTO), class: "pi-pad-firma w-full rounded-lg border-2 border-brand-300 dark:border-brand-600 bg-white touch-none", role: "img", "aria-label": tx("firmaRecuadro") });
    const ctx = lienzo.getContext("2d");
    const limpiar = () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, ANCHO, ALTO); trazos = 0; };
    let trazos = 0, dibujando = false;
    limpiar();
    ctx.strokeStyle = "#102a43"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const punto = (e) => { const r = lienzo.getBoundingClientRect(); return [(e.clientX - r.left) * ANCHO / r.width, (e.clientY - r.top) * ALTO / r.height]; };
    lienzo.addEventListener("pointerdown", (e) => { dibujando = true; lienzo.setPointerCapture(e.pointerId); const [x, y] = punto(e); ctx.beginPath(); ctx.moveTo(x, y); });
    lienzo.addEventListener("pointermove", (e) => { if (!dibujando) return; const [x, y] = punto(e); ctx.lineTo(x, y); ctx.stroke(); trazos++; });
    const soltar = () => { dibujando = false; };
    lienzo.addEventListener("pointerup", soltar);
    lienzo.addEventListener("pointercancel", soltar);
    const borrar = el("button", { type: "button", class: "mt-2 border border-brand-300 dark:border-brand-600 font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("firmaBorrar"));
    borrar.addEventListener("click", () => { limpiar(); ctx.strokeStyle = "#102a43"; });
    return {
      nodo: el("div", {}, lienzo, borrar),
      vacio: () => trazos < 3,
      imagen: () => ({ jpeg: lienzo.toDataURL("image/jpeg", 0.85).split(",")[1], ancho: ANCHO, alto: ALTO }),
    };
  }

  // La página para firmar el acta desde un celular (#firma=<código>): como
  // qué firma, su nombre y la firma. La pestaña del árbitro pregunta antes
  // de agregarla al acta y contesta si quedó.
  async function iniciarFirma(codigo, idioma) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const cont = document.getElementById("pi-ver");
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("conectandoEnVivo")));
    try { await cargarSupabase(); }
    catch (e) { cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorEnVivoVer"))); return; }
    const canal = window.sb.channel("pareo-firma-" + String(codigo).replace(/[^a-z0-9]/g, ""));
    const estadoTxt = el("p", { id: "pi-firma-estado", class: "text-base font-semibold mt-3", role: "status" });
    let armado = false;
    canal.on("broadcast", { event: "estado" }, (msg) => {
      if (armado) return;
      armado = true;
      const d = msg.payload || {};
      const cargo = el("select", { id: "pi-firma-cargo", class: "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-base" },
        Object.entries(d.cargos || {}).map(([k, x]) => el("option", { value: k }, String(x))));
      const nombre = el("input", { id: "pi-firma-nombre", type: "text", maxlength: "80", autocomplete: "name", class: "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-base" });
      const pad = padFirma(tx);
      const mandar = el("button", { type: "button", id: "pi-firma-mandar", class: "mt-4 bg-brand-800 hover:bg-brand-900 dark:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("firmaMandar"));
      mandar.addEventListener("click", () => {
        if (!nombre.value.trim()) { estadoTxt.textContent = tx("firmaFaltaNombre"); nombre.focus(); return; }
        if (pad.vacio()) { estadoTxt.textContent = tx("firmaFaltaFirma"); return; }
        mandar.disabled = true;
        estadoTxt.textContent = tx("firmaMandando");
        canal.send({ type: "broadcast", event: "firma", payload: Object.assign({ cargo: cargo.value, nombre: nombre.value.trim() }, pad.imagen()) });
      });
      cont.replaceChildren(
        el("h1", { class: "font-serif text-2xl font-bold mb-1" }, tx("firmasTitulo")),
        el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-4" }, String(d.evento || "")),
        el("label", { for: "pi-firma-cargo", class: "block text-sm font-semibold mb-1" }, tx("firmaCargo")), cargo,
        el("label", { for: "pi-firma-nombre", class: "block text-sm font-semibold mb-1 mt-3" }, tx("firmaNombre")), nombre,
        el("p", { class: "block text-sm font-semibold mb-1 mt-3" }, tx("firmaRecuadro")), pad.nodo, mandar, estadoTxt);
    });
    canal.on("broadcast", { event: "recibida" }, () => { estadoTxt.textContent = tx("firmaRecibida"); });
    canal.on("broadcast", { event: "negada" }, () => {
      estadoTxt.textContent = tx("firmaNegada");
      const b = document.getElementById("pi-firma-mandar"); if (b) b.disabled = false;
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
  }

  // La inscripción tardía desde el celular (#inscribir=<código>): el
  // entrenador de un centro manda a quien falta; lo acepta o lo rechaza la
  // pestaña del árbitro principal, uno por uno (nunca entra solo). Datos de
  // una persona: con su casilla de consentimiento y el enlace a la política.
  async function iniciarInscribir(codigo, idioma) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const cont = document.getElementById("pi-ver");
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("conectandoEnVivo")));
    try { await cargarSupabase(); }
    catch (e) { cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorEnVivoVer"))); return; }
    const canal = window.sb.channel("pareo-inscribir-" + codigo);
    const campo = "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-3 py-2 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    let pintado = false;
    canal.on("broadcast", { event: "estado" }, (msg) => {
      const d = msg.payload || {};
      if (d.cerrada) { cont.replaceChildren(el("p", { class: "text-base font-semibold" }, tx("inscribirCerrada"))); return; }
      if (pintado) return;
      pintado = true;
      const torneos = (d.torneos || []).filter((x) => typeof x === "string");
      const torneo = el("select", { id: "pi-ins-torneo", class: campo }, torneos.map((x) => el("option", { value: x }, x)));
      const nombre = el("input", { id: "pi-ins-nombre", type: "text", maxlength: "80", autocomplete: "off", class: campo });
      const centro = el("input", { id: "pi-ins-centro", type: "text", maxlength: "80", autocomplete: "organization", class: campo });
      const elo = el("input", { id: "pi-ins-elo", type: "number", min: "0", max: "3000", inputmode: "numeric", class: campo });
      const autor = el("input", { id: "pi-ins-autor", type: "text", maxlength: "60", autocomplete: "name", class: campo });
      const acepto = el("input", { id: "pi-ins-acepto", type: "checkbox" });
      const estado = el("p", { id: "pi-ins-estado", class: "text-sm font-semibold mt-2", role: "status" });
      const mandar = el("button", { type: "button", id: "pi-ins-mandar", class: "mt-4 bg-brand-800 text-white font-semibold px-4 py-2 rounded-lg text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("inscribirMandar"));
      const etiqueta = (id, texto) => el("label", { for: id, class: "block text-sm font-semibold mt-3 mb-1" }, texto);
      mandar.addEventListener("click", () => {
        const n = nombre.value.trim();
        if (n.length < 3) { estado.textContent = tx("inscribirFaltaNombre"); nombre.focus(); return; }
        if (!acepto.checked) { estado.textContent = tx("inscribirFaltaAcepto"); acepto.focus(); return; }
        canal.send({ type: "broadcast", event: "inscripcion", payload: { torneo: torneo.value, nombre: n, institucion: centro.value.trim(), elo: Number(elo.value) || 0, autor: autor.value.trim() } });
        estado.textContent = tx("inscribirEnviada", { n });
        nombre.value = ""; elo.value = "";
        nombre.focus();
      });
      const politica = el("a", { href: "privacidad.html", target: "_blank", rel: "noopener", class: "underline" }, tx("inscribirPolitica"));
      cont.replaceChildren(
        el("h1", { class: "font-serif text-2xl font-bold mb-1" }, tx("inscribirTitulo")),
        el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-2" }, String(d.evento || "")),
        el("p", { class: "text-sm" }, tx("inscribirTexto")),
        etiqueta("pi-ins-torneo", tx("inscribirTorneo")), torneo,
        etiqueta("pi-ins-nombre", tx("inscribirNombre")), nombre,
        etiqueta("pi-ins-centro", tx("inscribirCentro")), centro,
        etiqueta("pi-ins-elo", tx("inscribirElo")), elo,
        etiqueta("pi-ins-autor", tx("inscribirAutor")), autor,
        el("label", { for: "pi-ins-acepto", class: "flex items-start gap-2 text-sm mt-4" }, acepto, el("span", {}, tx("inscribirAcepto") + " ", politica, ".")),
        mandar, estado);
    });
    canal.on("broadcast", { event: "recibida" }, (msg) => {
      const x = document.getElementById("pi-ins-estado");
      if (x && msg.payload && msg.payload.nombre) x.textContent = tx("inscribirRecibida", { n: String(msg.payload.nombre) });
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
    setTimeout(() => { if (!pintado) cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("inscribirEsperando"))); }, 8000);
  }

  return { iniciarInscribir, paraMandar, alLlegar, LIMITE_VIVO, iniciarFirma, padFirma, iniciarCapitan, empaquetar, desempaquetar, cargarSupabase, iniciar, iniciarVivo, iniciarEvento, iniciarAdjunto, pintarEvento, pintarProyector, buscarJugador, botonIdioma };
})();
