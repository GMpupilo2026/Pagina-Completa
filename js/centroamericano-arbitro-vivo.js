/* «Mis mesas en vivo»: las partidas de las mesas del árbitro SIN el atraso de la transmisión pública (Centroamericano 2026).

   La transmisión pública de Lichess va con 15 min de atraso (juego limpio). La organización conecta una segunda
   transmisión, privada y sin atraso, en centroamericano-mesas.html; la Edge Function centroamericano-mesas-vivo la lee con la
   clave de quien organiza y a esta tablet le da SOLO sus mesas (acción `mesas`, con el token del enlace). Si la
   organización no la conectó, el botón no aparece.

   Lo de las mesas puras (los relojes que corren, las jugadas de la FEN, el texto) se prueba en Node
   (herramientas/verificar-centroamericano-mesas-vivo.js); lo demás es la ventana.

     CentroamericanoArbitroVivo.iniciar({ token, boton })   token: () => el token del enlace; boton: el botón «Mis mesas en vivo»
     CentroamericanoArbitroVivo.deLaMesa(mesa)              → la última lectura de esa mesa (o null), para el reloj apagado
     CentroamericanoArbitroVivo.leer()                      → Promise: vuelve a pedir ahora
     CentroamericanoArbitroVivo.relojes(m, ahora)           → { blancas, negras, turno } en segundos, con el que tiene el turno corriendo
     CentroamericanoArbitroVivo.lectura(m, leida)           → la partida con la forma que espera CentroamericanoTransmisionReloj.controlDe

   Ver «La transmisión sin atraso para los árbitros» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;
  const CADA_MS = 10000;          // con la ventana abierta
  const SIN_CONEXION_MS = 5 * 60000;   // si no está conectada, se vuelve a preguntar cada 5 min

  // Los relojes de ahora: el de quien tiene el turno sigue corriendo desde la lectura (lo que llevaba pensando + lo
  // que pasó desde que se leyó). Los relojes vienen de Lichess en centésimas.
  function relojes(m, ahora, leida) {
    const p = String(m.fen || "").split(/\s+/);
    const turno = p[1] === "b" ? "negras" : "blancas";
    const s = (x) => (typeof x === "number" ? Math.round(x / 100) : null);
    let b = s(m.reloj_b), n = s(m.reloj_n);
    const terminada = m.estado && m.estado !== "*";
    const n1 = Number(p[5]);
    const empezada = Number.isInteger(n1) && (n1 > 1 || p[1] === "b");
    if (!terminada && empezada && typeof m.piensa === "number" && leida != null) {
      const corre = m.piensa + Math.max(0, Math.round((ahora - leida) / 1000));
      if (turno === "blancas" && b != null) b = b - corre;
      if (turno === "negras" && n != null) n = n - corre;
    }
    return { blancas: b, negras: n, turno, terminada };
  }

  // La forma de una partida del JSON de Lichess (la que lee controlDe), con el «thinkTime» al momento de la lectura.
  function lectura(m, leida) {
    return { fen: m.fen, status: m.estado || "*", thinkTime: m.piensa, players: [{ clock: m.reloj_b }, { clock: m.reloj_n }], leida };
  }

  const dos = (x) => String(x).padStart(2, "0");
  function hms(seg) {
    if (seg == null) return "—";
    const neg = seg < 0, t = Math.abs(seg);
    return (neg ? "−" : "") + (t >= 3600 ? Math.floor(t / 3600) + ":" + dos(Math.floor((t % 3600) / 60)) : Math.floor(t / 60)) + ":" + dos(t % 60);
  }
  // Lo que se lee de una mesa, en palabras (para la tarjeta y para el lector de pantalla).
  function texto(m, ahora, leida) {
    const r = relojes(m, ahora, leida);
    const p = String(m.fen || "").split(/\s+/), n = Number(p[5]) || 1;
    const jugada = p[1] === "b" ? n : n - 1;
    if (r.terminada) return "Terminó en la transmisión: " + m.estado + ".";
    if (!jugada) return "Todavía no se ha hecho ninguna jugada.";
    return "Van " + jugada + (jugada === 1 ? " jugada" : " jugadas") + " · le toca a las " + r.turno + " · Blancas " + hms(r.blancas) + " · Negras " + hms(r.negras);
  }

  // ---------------------------------------------------------------- en el navegador
  let o = null, datos = null, leidaMs = null, conectada = null, preguntado = 0, dialogo = null, cada = null, pidiendo = null;

  function el(tag, at, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(at || {})) {
      if (v == null || v === false) continue;
      if (k === "texto") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos) if (h != null) n.append(h);
    return n;
  }

  function leer() {
    if (pidiendo) return pidiendo;
    pidiendo = (async () => {
      try {
        const { data, error } = await raiz.sb.functions.invoke("centroamericano-mesas-vivo", { body: { action: "mesas", arbitro_token: o.token() } });
        preguntado = Date.now();
        if (error || !data || !data.ok) { if (data && data.conectada === false) conectada = false; return datos; }
        conectada = !!data.conectada;
        if (conectada) { datos = data; leidaMs = Date.now(); }
        if (o.boton) o.boton.hidden = !conectada;
        pintar();
        return datos;
      } catch (e) {
        return datos;   // sin red: se queda con lo último y lo dice la hora
      } finally {
        pidiendo = null;
      }
    })();
    return pidiendo;
  }

  function pintar() {
    if (!dialogo || !dialogo.open) return;
    const cuerpo = dialogo.querySelector(".cv-cuerpo");
    const ahora = Date.now();
    if (!datos) { cuerpo.replaceChildren(el("p", { texto: "Leyendo tus mesas…" })); return; }
    const aviso = [];
    aviso.push(el("p", { class: "text-sm cv-hora", role: "status", texto: "Sin atraso · leído a las " + raiz.HoraCR.hora(new Date(leidaMs).toISOString(), { hour: "numeric", minute: "2-digit", second: "2-digit" }) + " · se actualiza cada 10 s mientras esta ventana está abierta." }));
    if (datos.delay > 0) aviso.push(el("p", { class: "text-sm cam-apagado-ojo", texto: "⚠ La transmisión privada tiene un atraso de " + Math.round(datos.delay / 60) + " min: avísale a la organización (debe ir en 0)." }));
    if (!datos.mesas.length) aviso.push(el("p", { texto: "Ninguna de tus mesas está en la transmisión (solo se transmiten las que tienen tablero electrónico)." }));
    const tarjetas = datos.mesas.map((m) => {
      const tab = el("div", { class: "cine-tablero cv-tablero", "aria-hidden": "true" });
      if (raiz.TableroFen) raiz.TableroFen.dibujar(tab, m.fen, m.ultima, { miniatura: true });
      return el("article", { class: "cv-mesa", "data-mesa": String(m.mesa) },
        el("p", { class: "cv-mesa-titulo" }, el("strong", { texto: "Mesa " + m.mesa })),
        tab,
        el("p", { class: "text-sm cv-texto", texto: texto(m, ahora, leidaMs) }),
        raiz.TableroFen ? el("p", { class: "sr-only", texto: raiz.TableroFen.describir(m.fen) }) : null);
    });
    // No repintar bajo el dedo: lo único que cambia cada segundo es el texto de los relojes.
    cuerpo.replaceChildren(...aviso, el("div", { class: "cv-mesas" }, ...tarjetas));
  }

  function latir() {
    if (!dialogo || !dialogo.open || !datos) return;
    const ahora = Date.now();
    for (const m of datos.mesas) {
      const p = dialogo.querySelector('.cv-mesa[data-mesa="' + m.mesa + '"] .cv-texto');
      if (p) p.textContent = texto(m, ahora, leidaMs);
    }
  }

  function abrir() {
    if (!dialogo) {
      dialogo = el("dialog", { id: "mesas-en-vivo", class: "cam-dialogo cv-dialogo", "aria-labelledby": "cv-titulo" },
        el("div", { class: "cam-dialogo-titulo" }, el("span", { id: "cv-titulo", texto: "Mis mesas en vivo (sin atraso)" }),
          el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => dialogo.close() }, "Cerrar")),
        el("div", { class: "cam-dialogo-cuerpo cv-cuerpo" }),
        el("p", { class: "text-sm cv-pie", texto: "Solo para ti: no lo muestres a jugadores ni a entrenadores. La transmisión pública va con 15 min de atraso por juego limpio." }));
      dialogo.addEventListener("close", () => { clearInterval(cada); cada = null; if (o.boton) o.boton.focus(); });
      document.body.append(dialogo);
    }
    try { dialogo.showModal(); } catch (e) { dialogo.setAttribute("open", ""); }
    pintar();
    leer();
    clearInterval(cada);
    let n = 0;
    cada = setInterval(() => { if (document.hidden) return; latir(); if (++n % (CADA_MS / 1000) === 0) leer(); }, 1000);
  }

  function iniciar(op) {
    o = op;
    if (o.boton) { o.boton.hidden = true; o.boton.addEventListener("click", abrir); }
    // La primera pregunta va unos segundos después: al abrir, lo primero son las mesas del árbitro, no esto.
    setTimeout(leer, 3000);
    // Si no está conectada, se vuelve a preguntar de vez en cuando (la organización la puede conectar en cualquier momento).
    setInterval(() => { if (!document.hidden && !conectada && Date.now() - preguntado > SIN_CONEXION_MS) leer(); }, 30000);
  }

  // La última lectura de una mesa (o null), con la hora en que se leyó: para el reloj apagado.
  function deLaMesa(mesa) {
    if (!conectada || !datos) return null;
    const m = datos.mesas.find((x) => x.mesa === Number(mesa));
    return m ? { m, leida: leidaMs, delay: datos.delay || 0 } : null;
  }

  const api = { relojes, lectura, texto, hms, iniciar, leer, deLaMesa, conectada: () => conectada };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoArbitroVivo = api;
})(typeof self !== "undefined" ? self : this);
