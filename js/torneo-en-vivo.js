/* «En vivo» en «El torneo» (#hoy-vivo) de una página de torneo con los datos
 * de Pareo Integral: UNA partida transmitida por una cámara de Notara. Lo
 * pidió el dueño el 13/11/2026 para Tacho Chess 2 («solo vamos a transmitir
 * una única partida») y el 18/11/2026 para la Eliminatoria JDN de Pérez
 * Zeledón («ya tiene las actualizaciones que se hicieron al tacho?»). Es la
 * misma copia para las dos: antes vivía dentro de js/tacho-chess-resultados.js.
 *
 * Siempre está en «El torneo»: dice «Próximamente» mientras ninguna cámara
 * transmite, y apenas una transmite, esa partida (su mesa y quién juega), con
 * «Ver la partida en vivo», que abre tablero-vivo.html encima de la página.
 *
 * - LOS TORNEOS son los que ya leyó js/centroamericano-vivo.js de Pareo
 *   (js/torneo-pareo-datos.js; su `tnr` es el id del torneo en Pareo), y con
 *   cada lectura nueva («cac-datos») se toman los de ese momento. Esa página
 *   lee solo cuando alguien busca, así que al cargar se le pide la lectura una
 *   vez (V.pedir): la misma que después usa «Busca a tu jugador», no otra.
 * - El código de las cámaras lo publica Pareo con el torneo (`datos.camaras`,
 *   al conectar «Recibir de las cámaras»; el mismo del QR de cada mesa). Se
 *   pregunta cada minuto, liviano (sin los datos del torneo): el árbitro las
 *   conecta con el torneo ya empezado. No usa TorneoPareoDatos.buscar(): volver
 *   a leer con él mueve las horas de cambio(), y los pareos dejarían de
 *   ponerse al día solos.
 * - Se escucha el canal de las cámaras como tablero-vivo.html
 *   (`tablero-vivo-<código>`, Broadcast): se pide («pedir») y cada cámara
 *   contesta con su partida. Se vuelve a pedir cada 20 s; una cámara que no
 *   contesta en 50 s ya no está transmitiendo.
 * - Solo se cree lo de ESE torneo, y de lo que llega solo se usan la mesa y
 *   los nombres (texto ajeno: textContent). Si transmiten varias, la que habló
 *   último. No carga chess.js: la partida la muestra tablero-vivo.html.
 * - El botón lleva la clase de la página (`TorneoPagina.botonVivo`: el rojo
 *   del afiche en el Tacho, el azul de ADAPZ en PZ), con su contraste medido
 *   en css/universidades.css.
 *
 * Ver «La partida en vivo de Notara en la página del Tacho» y «Lo del Tacho,
 * también en la Eliminatoria JDN de PZ» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const CONFIG = window.TorneoPagina || {};
  if (CONFIG.fuente !== "pareo") return;
  const $ = (id) => document.getElementById(id);
  const BOTON = CONFIG.botonVivo || "tacho-boton";
  const CODIGO = /^[a-hjkmnp-z2-9]{8}$/;
  const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PREGUNTAR = 60000, PEDIR = 20000, VIGENTE = 50000;
  const canales = new Map();   // código → { canal, torneo }
  const vivas = new Map();     // «código|mesa» → { codigo, torneo, mesa, blancas, negras, visto }
  let torneos = [];            // los id de Pareo de la última lectura de la página
  const nombreDe = (x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, 60) : "");

  // Los torneos que leyó js/centroamericano-vivo.js (su `tnr` es el id de Pareo).
  function idsDeLaPagina() {
    const V = window.CentroamericanoVivo;
    const d = V && V.datos ? V.datos() : null;
    return [...new Set(((d && d.torneos) || []).map((t) => String(t.tnr || "")).filter((id) => ID.test(id)))];
  }

  async function leerCodigos() {
    if (!torneos.length) return [];
    const { data, error } = await window.sb.from("pareo_publicados").select("id, camaras:datos->>camaras")
      .in("id", torneos);
    if (error) throw error;
    return (data || []).filter((x) => CODIGO.test(x.camaras || "")).map((x) => ({ codigo: x.camaras, torneo: x.id }));
  }

  function alLlegar(codigo, torneo, p) {
    if (!p || typeof p.pgn !== "string" || (p.torneo && p.torneo !== torneo)) return;
    const mesa = Number(p.mesa);
    if (!Number.isInteger(mesa) || mesa < 1 || mesa > 999) return;
    vivas.set(codigo + "|" + mesa, { codigo, torneo, mesa, blancas: nombreDe(p.blancas), negras: nombreDe(p.negras), visto: Date.now() });
    pintar();
  }

  function escuchar(lista) {
    const quedan = new Set(lista.map((x) => x.codigo));
    for (const [c, x] of canales) {
      if (quedan.has(c)) continue;
      try { window.sb.removeChannel(x.canal); } catch (e) { /* ya cerrado */ }
      canales.delete(c);
    }
    lista.forEach(({ codigo, torneo }) => {
      if (canales.has(codigo) || typeof window.sb.channel !== "function") return;
      const canal = window.sb.channel("tablero-vivo-" + codigo);
      canal.on("broadcast", { event: "estado" }, (msg) => alLlegar(codigo, torneo, msg && msg.payload));
      canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
      canales.set(codigo, { canal, torneo });
    });
  }

  function pedir() {
    for (const x of canales.values()) {
      try { x.canal.send({ type: "broadcast", event: "pedir", payload: {} }); } catch (e) { /* sin red: se vuelve a pedir */ }
    }
  }

  function pintar() {
    const caja = document.querySelector("#hoy .cac-hoy");
    if (!caja) return;
    const ahora = Date.now();
    for (const [k, v] of vivas) if (ahora - v.visto > VIGENTE || !canales.has(v.codigo)) vivas.delete(k);
    const v = [...vivas.values()].sort((a, b) => b.visto - a.visto)[0] || null;
    let zona = $("hoy-vivo");
    if (!zona) {
      zona = document.createElement("div");
      zona.id = "hoy-vivo";
      zona.className = "mt-4";
    }
    // «Hoy en el torneo» se vuelve a armar (js/torneo-hoy.js): la zona vuelve a su caja.
    if (zona.parentNode !== caja) caja.append(zona);
    const quienes = v ? [v.blancas, v.negras].filter(Boolean).join(" – ") : "";
    const clave = v ? v.codigo + "|" + v.mesa + "|" + quienes : "pronto";
    if (zona.dataset.clave === clave) return; // igual que antes: no se rearma (ni se pierde el foco)
    zona.dataset.clave = clave;
    zona.dataset.estado = v ? "vivo" : "pronto";
    const titulo = document.createElement("p");
    titulo.className = "text-sm font-bold";
    const ico = document.createElement("span");
    ico.setAttribute("aria-hidden", "true");
    ico.textContent = "📺 ";
    titulo.append(ico, v ? "En vivo ahora" : "En vivo: próximamente");
    if (!v) {
      const nota = document.createElement("p");
      nota.className = "text-sm mt-1";
      nota.textContent = "Cuando la cámara de la mesa empiece a transmitir, la partida aparece aquí.";
      zona.replaceChildren(titulo, nota);
      return;
    }
    const partida = document.createElement("p");
    partida.className = "text-sm mt-1";
    partida.textContent = "Mesa " + v.mesa + (quienes ? ": " + quienes : "");
    const a = document.createElement("a");
    a.className = BOTON + " mt-2";
    a.href = "tablero-vivo.html#" + v.codigo + "&t=" + encodeURIComponent(v.torneo) + "&m=" + v.mesa;
    a.dataset.ventana = "En vivo: Mesa " + v.mesa;
    a.textContent = "Ver la partida en vivo →";
    zona.replaceChildren(titulo, partida, a);
  }

  const preguntar = () => {
    if (!window.sb || !torneos.length) return;
    leerCodigos().then((lista) => { escuchar(lista); pintar(); }).catch(() => { /* sin conexión: queda lo último */ });
  };

  // Con cada lectura de la página, sus torneos; si cambiaron, se pregunta ya.
  function alDia() {
    const ids = idsDeLaPagina();
    const cambiaron = ids.join(",") !== torneos.join(",");
    torneos = ids;
    pintar();
    if (cambiaron) preguntar();
  }

  document.addEventListener("cac-datos", alDia);
  alDia();
  // La página lee Pareo solo cuando alguien busca: si todavía no leyó, se le
  // pide una vez (la misma lectura que usa después «Busca a tu jugador»).
  const V = window.CentroamericanoVivo;
  if (!torneos.length && V && V.pedir) V.pedir().catch(() => { /* sin conexión: queda «Próximamente» */ });
  setInterval(() => { if (!document.hidden) preguntar(); }, PREGUNTAR);
  setInterval(() => { if (!document.hidden) pedir(); pintar(); }, PEDIR);
})();

/*! rev bfb5bbb0d2d82f9f */
