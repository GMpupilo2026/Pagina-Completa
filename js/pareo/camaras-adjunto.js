/* ===== Pareo Integral — lo que leen las cámaras, en la mesa del árbitro adjunto =====
 *
 * Las cámaras de Notara (camara-tablero.html) transmiten cada mesa de un
 * torneo publicado por el canal `tablero-vivo-<código>` (js/partida-en-vivo.js).
 * El árbitro principal le pasa ese código al adjunto con su estado
 * (`camaras` y `torneo` en enviarAdjunto, js/pareo/pagina.js), y aquí el
 * celular del adjunto (js/pareo/ver.js) y la Mesa del árbitro
 * (js/mesa-arbitro-pareo.js) escuchan el mismo canal: cada mesa suya con su
 * tablero en vivo y, si la cámara leyó un final (mate, ahogado o el resultado
 * que marcó quien cuida la cámara), «La cámara dice: 1-0» con «Confirmar».
 *
 * El resultado NUNCA se anota solo: «Confirmar» es lo mismo que tocar el
 * resultado a mano, y lo decide el árbitro principal con sus reglas de
 * siempre. Solo lo de su torneo y su ronda; en equipos, no (se ve tablero por
 * tablero en la ronda del principal). Sin el retraso de la transmisión
 * pública: es para el árbitro. Ver «Pareo Integral: las cámaras en la mesa
 * del adjunto» en docs/decisiones/juegos-y-torneos.md.
 *
 *   PareoCamarasAdjunto.conectar({ codigo, torneo, ronda, alCambiar(mesa) }) → { mesa(n), cerrar() }
 *   PareoCamarasAdjunto.pintar(contenedor, d, opciones)   (d: lo que dio mesa(n), o undefined)
 *   PareoCamarasAdjunto.cargar()                          (chess.js y partida-en-vivo.js, una vez)
 */
(function (raiz) {
  "use strict";
  let cargando = null;
  const script = (src) => new Promise((listo, fallo) => {
    const sc = document.createElement("script");
    sc.src = src;
    sc.addEventListener("load", listo);
    sc.addEventListener("error", () => fallo(new Error("No cargó " + src)));
    document.head.appendChild(sc);
  });
  // También js/pieza-preferida.js: sin él, partida-en-vivo.js pinta las
  // blancas y las negras con el mismo glifo y no se distinguen.
  function cargar() {
    if (raiz.PartidaEnVivo && raiz.Chess && raiz.PiezaPreferida) return Promise.resolve();
    if (!cargando) {
      cargando = (raiz.Chess ? Promise.resolve() : script("js/vendor/chess.js"))
        .then(() => (raiz.PiezaPreferida ? null : script("js/pieza-preferida.js")))
        .then(() => (raiz.PartidaEnVivo ? null : script("js/partida-en-vivo.js")))
        .catch((e) => { cargando = null; throw e; });
    }
    return cargando;
  }

  // Escucha las cámaras de un torneo publicado. `alCambiar(mesa)` se llama
  // con la mesa física cada vez que llega algo nuevo de ella.
  async function conectar(o) {
    await cargar();
    const P = raiz.PartidaEnVivo;
    const partidas = new Map();
    const pedidas = new Map();
    const canal = raiz.sb.channel(P.canal(o.codigo));
    canal.on("broadcast", { event: "estado" }, (msg) => {
      const p = msg.payload || {};
      const antes = partidas.get(Number(p.mesa));
      if (p.tablero) return;
      const d = P.leer(p, antes);
      if (d && d.falta) {
        const ya = pedidas.get(d.mesa) || 0;
        if (d.mesa && !d.tablero && Date.now() - ya >= 3000) { pedidas.set(d.mesa, Date.now()); canal.send({ type: "broadcast", event: "pedir", payload: { mesa: d.mesa } }); }
        return;
      }
      if (!d || d.torneo !== o.torneo || d.ronda !== o.ronda || !d.mesa || d.tablero) return;
      d.recibido = Date.now();
      partidas.set(d.mesa, d);
      if (o.alCambiar) o.alCambiar(d.mesa);
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
    return {
      codigo: o.codigo, torneo: o.torneo, ronda: o.ronda,
      mesa: (n) => partidas.get(Number(n)),
      cerrar: () => { try { raiz.sb.removeChannel(canal); } catch (e) { /* ya cerrado */ } },
    };
  }

  // El tablero chico de una mesa (oculto para el lector de pantalla: lo dice
  // escrito al lado) y, si la cámara leyó un final y la mesa todavía no tiene
  // resultado, la propuesta con «Confirmar» y «No es así».
  //   opciones: { tam (px), conResultado, descartada, textoResultado(r), confirmar(r), descartar(r), textos }
  //   textos (para Pareo en inglés): { sinNoticias, enVivo(n), dice(t), confirmar(t), noEs }
  const TEXTOS = {
    sinNoticias: "📷 Sin noticias de la cámara de esta mesa.",
    enVivo: (n) => "📷 En vivo · " + (n === 1 ? "1 jugada" : n + " jugadas"),
    dice: (t) => "📷 La cámara dice: " + t,
    confirmar: (t) => "Confirmar " + t,
    noEs: "No es así",
  };
  function pintar(cont, d, op) {
    const P = raiz.PartidaEnVivo;
    const X = Object.assign({}, TEXTOS, (op && op.textos) || {});
    const doc = cont.ownerDocument;
    const el = (tag, clase, texto) => { const n = doc.createElement(tag); if (clase) n.className = clase; if (texto != null) n.textContent = texto; return n; };
    cont.replaceChildren();
    if (!P || !d) {
      cont.append(el("p", "text-xs text-brand-600 dark:text-brand-300", X.sinNoticias));
      return;
    }
    const tam = (op && op.tam) || 112;
    const fila = el("div", "flex items-start gap-3");
    const tab = el("div", "grid grid-cols-8 grid-rows-8 aspect-square rounded overflow-hidden select-none shrink-0");
    tab.style.width = tam + "px";
    tab.setAttribute("aria-hidden", "true");
    P.pintar(tab, d.juego, { coordenadas: false });
    for (const c of tab.children) c.style.fontSize = Math.round(tam / 8 * 0.78) + "px";
    const jug = d.juego.history().length;
    const lado = el("div", "min-w-0");
    lado.append(el("p", "text-xs font-semibold text-green-800 dark:text-green-300", X.enVivo(jug)));
    lado.append(el("p", "text-xs text-brand-700 dark:text-brand-200 mt-1", P.comoVa(d.juego)));
    fila.append(tab, lado);
    cont.append(fila);
    if (d.resultado && op && op.conResultado && !op.descartada) {
      const texto = op.textoResultado ? op.textoResultado(d.resultado) : d.resultado;
      const caja = el("div", "mt-2 rounded-lg border border-accent-500 bg-accent-50 dark:bg-brand-800 p-2");
      caja.setAttribute("data-camara-dice", d.resultado);
      caja.append(el("p", "text-sm font-semibold", X.dice(texto)));
      const si = el("button", "mt-2 mr-2 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-800", X.confirmar(texto));
      si.type = "button";
      si.setAttribute("data-camara-confirmar", d.resultado);
      si.addEventListener("click", () => op.confirmar(d.resultado));
      const no = el("button", "mt-2 border border-brand-300 dark:border-brand-600 font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", X.noEs);
      no.type = "button";
      no.setAttribute("data-camara-descartar", d.resultado);
      no.addEventListener("click", () => op.descartar(d.resultado));
      caja.append(si, no);
      cont.append(caja);
    }
  }

  const api = { cargar, conectar, pintar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoCamarasAdjunto = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
