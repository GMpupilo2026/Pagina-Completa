/* Los resultados del Torneo Intereducativo Tacho Chess 2 (tacho-chess-2.html):
 * se publican en Pareo Integral (lo dijo el dueño el 12/11/2026). Este módulo
 * encuentra el torneo solo, sin tocar el código, y cambia la ficha
 * «Resultados» de «Pronto» al enlace a su página pública en Pareo
 * (torneos-pareo.html#t=<id>), que js/ventana-enlace.js abre encima.
 *
 * - Cuenta solo un torneo de una organización de Pareo con el sello
 *   «Organizador verificado» (lo pone solo administración: sin el sello,
 *   cualquiera publicaría un «Tacho Chess» y la ficha llevaría a él), con
 *   «Tacho» en el nombre y creado desde octubre de 2026 (no la edición 1).
 * - Si la organización juega los niveles en varios torneos, salen todos: la
 *   ficha abre la ventana #resultados con un enlace por torneo.
 * - Sin torneo, la ficha se queda «Pronto»: nunca lleva a la lista de Pareo,
 *   que trae los torneos de otros.
 *
 * Se lee con la clave anónima: pareo_organizadores y pareo_publicados son de
 * lectura pública (sus políticas dejan fuera lo oculto).
 *
 * Ver «La del Tacho Chess 2» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const NOMBRE = /\btacho\b/;
  const DESDE = "2026-10-01";
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  async function buscar() {
    // Con js/torneo-pareo-datos.js en la página, su búsqueda: sin el torneo
    // publicado dos veces y en el orden de los niveles.
    if (window.TorneoPareoDatos && window.TorneoPareoDatos.buscar) return window.TorneoPareoDatos.buscar();
    const sb = window.sb;
    if (!sb) throw new Error("sin cliente");
    const { data: orgs, error: e1 } = await sb.from("pareo_organizadores").select("id").eq("verificado", true);
    if (e1) throw e1;
    const ids = (orgs || []).map((o) => o.id);
    if (!ids.length) return [];
    const { data, error } = await sb.from("pareo_publicados").select("id, nombre, creado")
      .in("organizador_id", ids).ilike("nombre", "%tacho%").gte("creado", DESDE)
      .order("creado", { ascending: true }).range(0, 49);
    if (error) throw error;
    return (data || []).filter((t) => NOMBRE.test(sinTildes(t.nombre)));
  }

  const enlaceTorneo = (t, titulo) => {
    const a = document.createElement("a");
    a.href = "torneos-pareo.html?en-ventana=1#t=" + encodeURIComponent(t.id);
    a.dataset.ventana = titulo;
    return a;
  };

  // La ficha «Pronto» pasa a ser un enlace: al torneo, o a la ventana con todos.
  function pintar(torneos) {
    const vieja = $("ficha-resultados");
    if (!vieja || !torneos.length || vieja.tagName === "A") return;
    let a;
    if (torneos.length === 1) a = enlaceTorneo(torneos[0], "Resultados de Tacho Chess 2");
    else {
      a = document.createElement("a");
      a.href = "#resultados";
      const lista = $("resultados-lista");
      lista.replaceChildren(...torneos.map((t) => {
        const li = document.createElement("li");
        const e = enlaceTorneo(t, t.nombre);
        e.className = "tacho-boton";
        e.textContent = t.nombre + " →";
        li.append(e);
        return li;
      }));
      $("resultados-estado").textContent = "La organización juega los niveles en " + torneos.length + " torneos. Elige el tuyo:";
    }
    a.id = vieja.id;
    a.dataset.color = vieja.dataset.color;
    a.className = vieja.className.replace("bg-white/70 dark:bg-brand-900/70 border-2 border-dashed border-brand-300 dark:border-brand-700", "bg-white dark:bg-brand-900 shadow-md");
    a.removeAttribute("tabindex");
    const partes = [...vieja.children];
    const fin = document.createElement("span");
    fin.className = "mt-auto pt-3 sm:pt-4 text-xs sm:text-sm font-bold cac-accion";
    fin.textContent = (torneos.length === 1 ? "Ver el torneo" : "Ver los torneos") + " →";
    a.append(...partes.slice(0, -1), fin);
    vieja.replaceWith(a);
  }

  // «En vivo»: UNA partida transmitida por una cámara de Notara (lo pidió el
  // dueño el 13/11/2026: «solo vamos a transmitir una única partida»).
  // Siempre está en «El torneo»: dice «Próximamente» mientras ninguna cámara
  // transmite, y apenas una transmite, esa partida (su mesa y quién juega),
  // con «Ver la partida», que abre tablero-vivo.html encima de la página.
  //
  // - El código de las cámaras lo publica Pareo con el torneo (`datos.camaras`,
  //   al conectar «Recibir de las cámaras»; el mismo del QR de cada mesa). Se
  //   pregunta cada minuto, liviano (sin los datos del torneo): el árbitro las
  //   conecta con el torneo ya empezado.
  // - Se escucha el canal de las cámaras como tablero-vivo.html
  //   (`tablero-vivo-<código>`, Broadcast): se pide («pedir») y cada cámara
  //   contesta con su partida. Se vuelve a pedir cada 20 s; una cámara que no
  //   contesta en 50 s ya no está transmitiendo.
  // - Solo se cree lo de ESE torneo, y de lo que llega solo se usan la mesa
  //   y los nombres (texto ajeno: textContent). Si transmiten varias, la que
  //   habló último. No carga chess.js: la partida la muestra tablero-vivo.html.
  const CODIGO = /^[a-hjkmnp-z2-9]{8}$/;
  const PREGUNTAR = 60000, PEDIR = 20000, VIGENTE = 50000;
  const canales = new Map();   // código → { canal, torneo }
  const vivas = new Map();     // «código|mesa» → { codigo, torneo, mesa, blancas, negras, visto }
  const nombreDe = (x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, 60) : "");

  async function leerCodigos(torneos) {
    const { data, error } = await window.sb.from("pareo_publicados").select("id, camaras:datos->>camaras")
      .in("id", torneos.map((t) => t.id));
    if (error) throw error;
    return (data || []).filter((x) => CODIGO.test(x.camaras || "")).map((x) => ({ codigo: x.camaras, torneo: x.id }));
  }

  function alLlegar(codigo, torneo, p) {
    if (!p || typeof p.pgn !== "string" || (p.torneo && p.torneo !== torneo)) return;
    const mesa = Number(p.mesa);
    if (!Number.isInteger(mesa) || mesa < 1 || mesa > 999) return;
    vivas.set(codigo + "|" + mesa, { codigo, torneo, mesa, blancas: nombreDe(p.blancas), negras: nombreDe(p.negras), visto: Date.now() });
    pintarVivo();
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

  function pintarVivo() {
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
      caja.append(zona);
    }
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
    a.className = "tacho-boton mt-2";
    a.href = "tablero-vivo.html#" + v.codigo + "&t=" + encodeURIComponent(v.torneo) + "&m=" + v.mesa;
    a.dataset.ventana = "En vivo: Mesa " + v.mesa;
    a.textContent = "Ver la partida en vivo →";
    zona.replaceChildren(titulo, partida, a);
  }

  function vigilarVivo(torneos) {
    pintarVivo();
    if (!torneos.length || !window.sb) return;
    const preguntar = () => leerCodigos(torneos).then((lista) => { escuchar(lista); pintarVivo(); }).catch(() => { /* sin conexión: queda lo último */ });
    preguntar();
    setInterval(() => { if (!document.hidden) preguntar(); }, PREGUNTAR);
    setInterval(() => { if (!document.hidden) pedir(); pintarVivo(); }, PEDIR);
  }

  buscar().then((torneos) => { pintar(torneos); vigilarVivo(torneos); })
    .catch(() => { pintarVivo(); /* sin conexión: la ficha sigue «Pronto» */ });
})();

/*! rev bfb5bbb0d2d82f9f */
