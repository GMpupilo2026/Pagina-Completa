/* ===== Pareo Integral — la página (pareo.html): las mesas =====
 *
 * Las cámaras de las mesas, un teléfono para cada mesa (fotos, alertas, lectura de las planillas),
 * transmitir a Lichess y la salud de las cámaras.
 *
 * Es una parte de la página de Pareo Integral, que se partió por zonas el
 * 20/11/2026 (ver «Pareo Integral: la página partida por zonas» en
 * docs/decisiones/juegos-y-torneos.md). Lo de las otras partes llega por
 * window.PareoPagina: arriba, lo de las que ya cargaron; como Pagina.<nombre>,
 * lo de las que cargan después.
 */
(function () {
  "use strict";

  const Pagina = window.PareoPagina;
  const { E, V, PREFIJO, C, leer, escribir, leerJSON, $, el, tx, estado, guardar, t, pintarRondas, horaCR } = Pagina;
  // ---------- Las cámaras de las mesas ----------
  // La cámara que lee el tablero (camara-tablero.html, de quien administra la
  // Academia) transmite cada mesa de un torneo publicado por un canal de
  // Supabase Realtime en modo Broadcast: `tablero-vivo-<código>`, el mismo
  // que mira tablero-vivo.html. Esta pestaña lo escucha con el código de las
  // cámaras (`camaras`: { codigo, activo }, guardado en el torneo) y:
  //  - la partida de cada mesa entra sola a la mesa (`m.pgn`, con
  //    `pgnCamara`): sale en el torneo publicado. Nunca pisa una que se
  //    escribió a mano.
  //  - el resultado NUNCA se anota solo: queda en «Resultados para confirmar»
  //    (`R.deCamaras`), con «Anotar» y «Descartar».
  // Solo la última ronda de un torneo publicado (la cámara
  // elige el torneo publicado por su id), y lo que llega se vuelve a jugar con
  // chess.js (PartidaEnVivo.leer). Mientras esta pestaña esté abierta.
  // En un torneo por equipos, cada tablero de un encuentro tiene su cámara
  // (mesa y tablero): su partida va en `m.partidas[k].pgn` y su resultado se
  // confirma por tablero; el del encuentro sale de los tableros. Esa partida
  // queda en esta computadora (y va a Lichess si se transmite): el torneo
  // publicado lleva solo el resultado de cada tablero.
  let cargaVivo = null;
  function cargarVivo() {
    if (window.PartidaEnVivo) return Promise.resolve();
    if (!cargaVivo) cargaVivo = Pagina.cargarChess().then(() => new Promise((listo, fallo) => {
      const sc = document.createElement("script");
      sc.src = "js/partida-en-vivo.js";
      sc.addEventListener("load", listo);
      sc.addEventListener("error", () => { cargaVivo = null; fallo(new Error("No cargó partida-en-vivo.js")); });
      document.head.appendChild(sc);
    }));
    return cargaVivo;
  }
  const CODIGO_CAMARAS = /^[a-hjkmnp-z2-9]{8}$/;
  async function pedirCodigoCamaras() {
    const v = t();
    if (!v.publicado) { Avisos.avisar(tx("camarasSinPublicar"), { tipo: "error" }); return; }
    // El código ya viene puesto: el que tenía el torneo o uno nuevo. Así no
    // hace falta pasar antes por Notara: se toca «Recibir» y los QR de las
    // mesas (abajo) ya lo llevan. Quien ya tiene cámaras andando, lo cambia.
    try { await cargarVivo(); } catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
    const res = await Avisos.formulario({ titulo: tx("camarasTitulo"), texto: tx("camarasTexto"), aceptar: tx("camarasConectar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "codigo", etiqueta: tx("camarasCodigo"), valor: (v.camaras && v.camaras.codigo) || window.PartidaEnVivo.nuevoCodigo(), max: 8, ayuda: tx("camarasCodigoAyuda") },
        { nombre: "retraso", tipo: "select", etiqueta: tx("camarasRetraso"), valor: String((v.camaras && v.camaras.retraso) || 0), ayuda: tx("camarasRetrasoAyuda"),
          opciones: window.PartidaEnVivo.RETRASOS.map((r) => [String(r), r ? tx("camarasRetrasoMin", { n: r }) : tx("camarasRetrasoNo")]) }] });
    if (!res || t() !== v) return;
    const codigo = String(res.codigo || "").replace(/\s+/g, "").toLowerCase();
    if (!CODIGO_CAMARAS.test(codigo)) { Avisos.avisar(tx("camarasCodigoMalo"), { tipo: "error" }); return; }
    v.camaras = { codigo, activo: true };
    // El retraso de la transmisión pública va en el QR de cada mesa (0 no se guarda).
    if (window.PartidaEnVivo.RETRASOS.includes(Number(res.retraso)) && Number(res.retraso)) v.camaras.retraso = Number(res.retraso);
    guardar();
    if (await conectarCamaras()) Avisos.avisar(tx("camarasConectadas"));
    if (estado.ficha === "centro") Pagina.pintarCentro(); else pintarRondas();
  }
  // ---------- Un teléfono para cada mesa ----------
  // El QR de una mesa abre Notara en el celular que va encima, sin cuenta y
  // ya transmitiendo ESA mesa de ESTE torneo (PartidaEnVivo.enlaceCamara: el
  // mismo enlace que arma la hoja de QR de la cámara). Sale de aquí para no
  // tener que ir a Notara, elegir el torneo y copiar el código a mano: en
  // papel, uno por mesa para todo el torneo (la mesa es la de la sala y no
  // cambia de una ronda a otra), o en la pantalla, tocando la mesa en el
  // Centro del evento. En equipos no: cada tablero lleva su cámara y esa
  // hoja la arma Notara.
  const enlaceCamaraDe = (v, mesa) => window.PartidaEnVivo.enlaceCamara({ torneo: v.publicado.id, codigo: v.camaras.codigo, mesa, retraso: v.camaras.retraso || 0 });
  const conQrDeCamaras = (v) => !!(v.publicado && v.camaras && v.camaras.activo && v.rondas.length && !E.esDeEquipos(v));
  async function imprimirQrCamaras() {
    const v = t();
    if (!conQrDeCamaras(v)) return;
    try { await PareoQr.cargar(); await cargarVivo(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const mesas = [];
    for (let i = 0; i < V.mesasQueNecesita(v); i++) mesas.push(V.mesaFisica(v, i));
    $("pi-firmas").replaceChildren(el("div", { class: "pi-rotulos" }, mesas.map((n) => el("div", { class: "pi-rotulo", "data-rotulo-camara": String(n), "data-enlace": enlaceCamaraDe(v, n) },
      el("p", { class: "pi-rotulo-mesa", texto: tx("mesa") }),
      el("p", { class: "pi-rotulo-n", texto: String(n) }),
      el("p", { class: "pi-rotulo-cat", texto: V.nombreTorneo(v) }),
      el("div", { class: "pi-rotulo-qr" }, PareoQr.svg(enlaceCamaraDe(v, n), tx("camaraQrEtiqueta", { m: n }))),
      el("p", { class: "pi-rotulo-ayuda", texto: tx("camaraQrAyuda") })))));
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }
  async function conectarCamaras() {
    const v = t();
    const c = v.camaras && v.camaras.activo ? v.camaras.codigo : null;
    if (estado.camaras && (estado.camaras.idTorneo !== estado.id || estado.camaras.codigo !== c)) desconectarCamaras();
    if (!c || estado.camaras) return true;
    try { await PareoVer.cargarSupabase(); await cargarVivo(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return false; }
    if (estado.camaras) return true;
    const canal = window.sb.channel(window.PartidaEnVivo.canal(c));
    canal.on("broadcast", { event: "estado" }, (msg) => recibirDeCamara(msg.payload || {}));
    canal.on("broadcast", { event: "alerta" }, (msg) => alertaDeCamara(msg.payload || {}));
    canal.on("broadcast", { event: "foto" }, (msg) => fotoDeCamara(msg.payload || {}));
    canal.on("broadcast", { event: "latido" }, (msg) => latidoDeCamara(msg.payload || {}));
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
    estado.camaras = { idTorneo: estado.id, codigo: c, canal, mesas: new Map(), alertas: new Map(), partidas: new Map(), pedidas: new Map(), fotos: new Map(), desde: new Map(), cuenta: new Map(), latidos: new Map() };
    return true;
  }
  function desconectarCamaras() {
    if (estado.camaras) { try { window.sb.removeChannel(estado.camaras.canal); } catch (e) { /* ya cerrado */ } }
    estado.camaras = null;
  }
  function dejarCamaras() {
    const v = t();
    if (v.camaras) v.camaras.activo = false;
    desconectarCamaras();
    guardar();
    pintarRondas();
    Avisos.avisar(tx("camarasApagadas"));
  }
  const torneoDeCamaras = () => estado.camaras && (estado.camaras.idTorneo === estado.id ? t() : leerJSON(PREFIJO + estado.camaras.idTorneo, null));
  // El lugar de una cámara: «5» o, en un torneo por equipos, «5.2» (mesa y
  // tablero: cada tablero de un encuentro es una partida). Así se guarda; se
  // muestra «5 · tablero 2».
  const claveCamara = (mesa, tablero) => String(mesa) + (tablero ? "." + tablero : "");
  const verLugar = (clave) => String(clave).replace(/\.(\d+)$/, (x, k) => " · " + tx("tableroN", { t: k }).toLowerCase());
  const ordenLugar = (a, b) => parseFloat(a) - parseFloat(b);
  function recibirDeCamara(p) {
    const v = torneoDeCamaras();
    if (!v || !v.publicado || !v.rondas.length || !window.PartidaEnVivo) return;
    const equipos = E.esDeEquipos(v);
    // La cámara manda casi siempre solo lo nuevo: se pega a la partida que
    // ya llegó de esa mesa (y tablero). Si no calza (se perdió un mensaje), se pide entera.
    const c = estado.camaras;
    const antes = c.partidas.get(claveCamara(Number(p.mesa), Number(p.tablero) || null));
    if (antes && Number(p.t) < antes.t) return;
    const d = window.PartidaEnVivo.leer(p, antes);
    if (d && d.falta) {
      const k = claveCamara(d.mesa, d.tablero), ya = c.pedidas.get(k) || 0;
      if (d.mesa && Date.now() - ya >= 3000) { c.pedidas.set(k, Date.now()); c.canal.send({ type: "broadcast", event: "pedir", payload: { mesa: d.mesa, tablero: d.tablero || undefined } }); }
      return;
    }
    if (!d || d.torneo !== v.publicado.id || d.ronda !== v.rondas.length || !d.mesa || !!d.tablero !== equipos) return;
    const R = v.rondas[v.rondas.length - 1];
    const i = R.mesas.findIndex((x, k) => V.mesaFisica(v, k) === d.mesa);
    const m = R.mesas[i];
    if (!m || m.n == null) return;
    // Dónde va: la mesa, o en un encuentro por equipos, la partida de su tablero.
    let lugar = m;
    if (equipos) {
      E.prepararMesa(v, m);
      lugar = m.partidas[d.tablero - 1];
      if (!lugar) return;
    }
    const clave = claveCamara(d.mesa, d.tablero);
    d.recibido = Date.now(); // para el reloj de la cámara (ver relojesCamaras)
    c.partidas.set(clave, d);
    anotarLectura(v, claveCamara(d.mesa, d.tablero), d);
    c.mesas.set(clave, Date.now());
    if (!c.desde.has(clave)) c.desde.set(clave, Date.now());
    let cambio = false, repintar = false, aviso = null;
    // La partida: la de la cámara, salvo que la mesa tenga una escrita a mano.
    const pgn = d.juego.history().length ? window.PartidaEnVivo.pgn(d.juego, d.resultado, d.tiempos) : "";
    if (pgn && (!lugar.pgn || lugar.pgnCamara) && lugar.pgn !== pgn) { lugar.pgn = pgn; lugar.pgnCamara = true; cambio = true; }
    // El resultado: para confirmar, nunca anotado solo.
    if (d.resultado) {
      R.deCamaras = R.deCamaras || [];
      const ya = R.deCamaras.find((x) => x.mesa === i + 1 && (x.tablero || null) === (d.tablero || null) && !x.resuelta);
      if (lugar.r === d.resultado) { if (ya) { ya.resuelta = "igual"; cambio = repintar = true; } }
      else if (!ya || ya.r !== d.resultado) {
        if (ya) ya.resuelta = "otro";
        R.deCamaras.push(Object.assign({ hora: Date.now(), mesa: i + 1, r: d.resultado }, d.tablero ? { tablero: d.tablero } : {}));
        cambio = repintar = true;
        aviso = tx("camaraResultadoLlego", { m: verLugar(clave), r: tx("corto_" + d.resultado) });
      }
    }
    // Una jugada nueva no vuelve a pintar la ronda (le movería la página a
    // quien está anotando): solo la marca del botón de la partida.
    const enLaRonda = v === t() && estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1;
    if (cambio) {
      if (v === t()) guardar();
      else escribir(PREFIJO + estado.camaras.idTorneo, JSON.stringify(v));
    }
    if (enLaRonda && repintar) pintarRondas();
    else {
      if (enLaRonda && !equipos) { const b = document.querySelector('#pi-ronda [data-pgn="' + i + '"]'); if (b && m.pgn) b.textContent = "✓ " + tx("pgnBoton"); }
      pintarCamaras();
    }
    if (aviso) Avisos.avisar(aviso, { tipo: "info" });
    lichessPronto();
  }
  // La cámara ve algo que no sale de ninguna jugada legal: puede ser una
  // jugada ilegal. Se avisa (sin las casillas: con retraso, eso sería pasar
  // la jugada) y queda en la caja de las cámaras hasta que se marca «Visto».
  // Una vez cada 30 segundos por mesa, como mucho. También llegan la
  // repetición y las 50 jugadas (`tipo`), que no se marcan solas: el árbitro
  // las confirma si alguien reclama (o, con cinco veces y 75 jugadas, solo).
  // y la bandera que cae en el reloj de la cámara (con el color, `color`).
  const TIPOS_ALERTA = { ilegal: "camaraAlerta", repeticion3: "camaraTablas3", jugadas50: "camaraTablas50", repeticion5: "camaraTablas5", jugadas75: "camaraTablas75", bandera: "camaraBandera", sinMover: "camaraSinMover", sinApretar: "camaraSinApretar" };
  const colorTx = (c) => tx(c === "w" ? "colorLasBlancas" : "colorLasNegras");
  function alertaDeCamara(p) {
    const v = torneoDeCamaras();
    if (!v || !v.publicado || !v.rondas.length || p.torneo !== v.publicado.id || Number(p.ronda) !== v.rondas.length) return;
    const mesa = Number(p.mesa), tablero = E.esDeEquipos(v) ? Number(p.tablero) || null : null;
    const R = v.rondas[v.rondas.length - 1];
    if (!R.mesas.some((x, k) => V.mesaFisica(v, k) === mesa)) return;
    const clave = claveCamara(mesa, tablero), tipo = TIPOS_ALERTA[p.tipo] ? p.tipo : "ilegal";
    const k = tipo === "ilegal" ? clave : clave + "|" + tipo; // cada aviso por su lado: uno no tapa al otro
    const antes = estado.camaras.alertas.get(k);
    if (antes && Date.now() - antes.h < 30000) return;
    const color = p.color === "w" || p.color === "b" ? p.color : null;
    estado.camaras.alertas.set(k, { h: Date.now(), tipo, m: clave, color });
    // Para el informe: «Visto» quita el aviso de la lista, pero no de la cuenta.
    const cu = estado.camaras.cuenta.get(clave) || { ilegal: 0, tablas: 0 };
    if (tipo === "ilegal") cu.ilegal++;
    else if (/^(repeticion|jugadas)/.test(tipo)) cu.tablas++;
    estado.camaras.cuenta.set(clave, cu);
    Avisos.avisar(tx(TIPOS_ALERTA[tipo], { m: verLugar(clave), q: color ? colorTx(color) : "" }), { tipo: { ilegal: "error", bandera: "error", sinMover: "error" }[tipo] || "info" });
    pintarCamaras();
  }

  // La foto del tablero (visto desde arriba, recortado: solo el tablero, sin
  // nadie alrededor) que manda la cámara con cada resultado y cada aviso:
  // una prueba si hay un reclamo. Queda en la memoria de esta pestaña y, si
  // el árbitro la pasa, en las incidencias de la ronda (y en el respaldo del
  // torneo). No se publica.
  const FOTO_VALIDA = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
  const MOTIVOS_FOTO = ["resultado", "bandera", "ilegal", "repeticion3", "jugadas50", "repeticion5", "jugadas75"];
  function fotoDeCamara(p) {
    const v = torneoDeCamaras();
    if (!v || !v.publicado || !v.rondas.length || p.torneo !== v.publicado.id || Number(p.ronda) !== v.rondas.length) return;
    if (typeof p.img !== "string" || p.img.length > 120000 || !FOTO_VALIDA.test(p.img) || !MOTIVOS_FOTO.includes(p.motivo)) return;
    const mesa = Number(p.mesa), tablero = E.esDeEquipos(v) ? Number(p.tablero) || null : null;
    const R = v.rondas[v.rondas.length - 1];
    if (!R.mesas.some((x, k) => V.mesaFisica(v, k) === mesa)) return;
    const clave = claveCamara(mesa, tablero);
    const lista = (estado.camaras.fotos.get(clave) || []).concat({ h: Date.now(), motivo: p.motivo, img: p.img, mesa, tablero });
    estado.camaras.fotos.set(clave, lista.slice(-6));
    pintarCamaras();
    if (p.motivo === "resultado") pintarRondas(); // el botón de la foto va junto al resultado para confirmar
  }
  // La última foto de esa mesa desde un poco antes de `desde` (el aviso o el resultado).
  const fotoDe = (clave, desde) => {
    const lista = (estado.camaras && estado.camaras.fotos.get(String(clave))) || [];
    return lista.filter((f) => f.h >= (desde || 0) - 120000).pop() || null;
  };
  const textoMotivo = (m) => tx(m === "resultado" ? "fotoMotivoResultado" : m === "ilegal" ? "fotoMotivoIlegal" : TIPOS_ALERTA[m] + "Corto");
  function verFoto(f, pasar) {
    const cerrarB = el("button", { type: "button", class: C.botonSec }, tx("cerrar"));
    const pasarB = pasar ? el("button", { type: "button", id: "pi-foto-pasar", class: C.boton }, tx("fotoPasar")) : null;
    const d = el("dialog", { id: "pi-foto-dialogo", class: "rounded-2xl p-5 max-w-md w-full bg-white dark:bg-brand-900 text-brand-800 dark:text-white", "aria-labelledby": "pi-foto-dialogo-t" },
      el("h2", { id: "pi-foto-dialogo-t", class: "font-serif text-xl font-bold mb-1", texto: tx("fotoTitulo", { m: verLugar(claveCamara(f.mesa, f.tablero)) }) }),
      el("p", { class: C.nota, texto: horaCR(f.h) + (f.motivo ? " · " + textoMotivo(f.motivo) : "") }),
      el("img", { src: f.img, alt: tx("fotoAlt", { m: verLugar(claveCamara(f.mesa, f.tablero)) }), width: "256", height: "256", class: "mt-3 mx-auto rounded-lg w-64 h-64" }),
      el("div", { class: "flex flex-wrap gap-2 mt-4" }, pasarB, cerrarB));
    const cerrar = () => { d.close(); d.remove(); };
    cerrarB.addEventListener("click", cerrar);
    d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
    if (pasarB) pasarB.addEventListener("click", () => { pasar(); cerrar(); });
    document.body.append(d);
    d.showModal();
    cerrarB.focus();
  }
  // Pasar la foto a las incidencias de la ronda en juego, con su mesa.
  function fotoAIncidencias(f) {
    const v = t(), R = v.rondas[v.rondas.length - 1];
    const k = R.mesas.findIndex((x, i) => V.mesaFisica(v, i) === f.mesa);
    if (k < 0) return;
    R.incidencias = (R.incidencias || []).concat({ hora: f.h, mesa: k + 1, tipo: "otra",
      texto: tx("fotoIncidencia", { q: textoMotivo(f.motivo), b: f.tablero ? " " + tx("fotoTablero", { b: f.tablero }) : "" }), foto: f.img });
    guardar(); pintarRondas();
    Avisos.avisar(tx("fotoPasada"), { tipo: "ok" });
  }
  const botonFoto = (f) => el("button", { type: "button", class: C.mini, "data-foto": "1", onclick: () => verFoto(f, () => fotoAIncidencias(f)) },
    el("span", { "aria-hidden": "true", texto: "📷 " }), tx("fotoVer"));

  // El informe de las cámaras de la ronda: desde y hasta cuándo transmitió
  // cada mesa, cuántas jugadas anotó sola y cuántas se escribieron a mano en
  // la cámara, sus avisos y su resultado. Sirve para ver qué mesa necesita
  // mejor luz o mejor ángulo. Sale de lo que llegó a esta pestaña (no se
  // guarda en el torneo).
  function informeCamaras() {
    const c = estado.camaras;
    const claves = [...c.partidas.keys()].sort(ordenLugar);
    if (!claves.length) return null;
    const avisos = (k, cual) => (c.cuenta.get(k) || {})[cual] || 0;
    const th = (clave) => el("th", { scope: "col", class: "py-1 pr-3 text-left font-semibold", texto: tx(clave) });
    /* La ronda en un vistazo: cuántas mesas leyeron solas de punta a punta y,
     * mesa por mesa, qué mejorar para la próxima (luz, ángulo, batería). */
    const vistazo = (k) => {
      const d = c.partidas.get(k), n = d.juego.history().length, mano = Math.min(d.mano || 0, n), dudas = d.dudas || 0, ilegal = avisos(k, "ilegal");
      const mejorar = [];
      if (d.equipo && d.equipo.luz === "poca") mejorar.push(tx("vistazoLuz"));
      if (n && mano / n >= 0.2) mejorar.push(tx("vistazoMano"));
      if (dudas >= 3) mejorar.push(tx("vistazoDudas", { n: dudas }));
      if (ilegal) mejorar.push(tx("vistazoIlegal", { n: ilegal }));
      if (!d.resultado && Date.now() - (c.mesas.get(k) || 0) > SIN_NOTICIAS_MS) mejorar.push(tx("vistazoSinNoticias"));
      const terminada = { true: "sola", false: "corregida" }[!mano && !ilegal];
      return { estado: d.resultado ? terminada : "juega", mejorar };
    };
    const vistos = new Map(claves.map((k) => [k, vistazo(k)]));
    const cuenta = (e) => [...vistos.values()].filter((x) => x.estado === e).length;
    const conAlgo = claves.filter((k) => vistos.get(k).mejorar.length);
    const resumen = el("div", { id: "pi-camaras-vistazo", class: "text-sm mt-1" },
      el("p", { class: "font-semibold", texto: tx("camarasVistazo", { n: claves.length, s: cuenta("sola"), c: cuenta("corregida"), j: cuenta("juega") }) }),
      conAlgo.length ? el("p", { texto: tx("camarasVistazoMejorar", { l: conAlgo.map((k) => tx("vistazoMesa", { m: verLugar(k), q: vistos.get(k).mejorar.join(", ") })).join("; ") }) }) : null);
    const filas = claves.map((k) => {
      const d = c.partidas.get(k), n = d.juego.history().length, mano = Math.min(d.mano || 0, n);
      return el("tr", { "data-informe": k },
        el("td", { class: "py-1 pr-3 font-semibold", texto: verLugar(k) }),
        el("td", { class: "py-1 pr-3", texto: horaCR(c.desde.get(k)) + " – " + horaCR(c.mesas.get(k)) }),
        el("td", { class: "py-1 pr-3", texto: (d.equipo && d.equipo.tablero) || "—" }),
        el("td", { class: "py-1 pr-3", texto: d.equipo && d.equipo.luz ? tx(LUZ_TX[d.equipo.luz]) : "—" }),
        el("td", { class: "py-1 pr-3", texto: String(n - mano) }),
        el("td", { class: "py-1 pr-3", texto: String(mano) }),
        el("td", { class: "py-1 pr-3", texto: String(avisos(k, "ilegal")) }),
        el("td", { class: "py-1 pr-3", texto: String(avisos(k, "tablas")) }),
        el("td", { class: "py-1 pr-3", texto: d.resultado ? tx("corto_" + d.resultado) : "—" }),
        el("td", { class: "py-1", "data-mejorar": "", texto: vistos.get(k).mejorar.join(", ") || tx("vistazoNada") }));
    });
    // Lo de todos los torneos de esta computadora, por tablero y luz (ver anotarLectura).
    const historial = resumenLectura();
    const tablaHistorial = historial.length ? el("div", { class: "overflow-x-auto mt-3" },
      el("p", { class: "text-sm font-semibold", texto: tx("camarasLecturaTitulo") }),
      el("p", { class: C.nota, texto: tx("camarasLecturaTexto") }),
      el("table", { id: "pi-camaras-lectura", class: "text-sm mt-1" },
        el("thead", {}, el("tr", {}, th("camarasInfTablero"), th("camarasInfLuz"), th("camarasLecturaPartidas"), th("camarasInfSolas"), th("camarasInfMano"), th("camarasLecturaDudas"))),
        el("tbody", {}, historial.map((g) => el("tr", {},
          el("td", { class: "py-1 pr-3 font-semibold", texto: g.tablero || "—" }),
          el("td", { class: "py-1 pr-3", texto: g.luz ? tx(LUZ_TX[g.luz]) : "—" }),
          el("td", { class: "py-1 pr-3", texto: String(g.partidas) }),
          el("td", { class: "py-1 pr-3", texto: tx("camarasLecturaSolas", { s: g.jugadas - g.mano, n: g.jugadas, p: Math.round(100 * (g.jugadas - g.mano) / g.jugadas) }) }),
          el("td", { class: "py-1 pr-3", texto: String(g.mano) }),
          el("td", { class: "py-1 pr-3", texto: String(g.dudas) })))))) : null;
    // Se vuelve a pintar con cada jugada que llega: si estaba abierto, sigue abierto.
    const abierto = !!(document.getElementById("pi-camaras-informe") || {}).open;
    return el("details", { id: "pi-camaras-informe", class: "mt-2", open: abierto },
      el("summary", { class: "text-sm font-semibold cursor-pointer", texto: tx("camarasInforme") }),
      el("p", { class: C.nota, texto: tx("camarasInformeTexto") }),
      resumen,
      el("div", { class: "overflow-x-auto" }, el("table", { class: "text-sm mt-1" },
        el("thead", {}, el("tr", {}, th("camarasInfLugar"), th("camarasInfHoras"), th("camarasInfTablero"), th("camarasInfLuz"), th("camarasInfSolas"), th("camarasInfMano"), th("camarasInfIlegal"), th("camarasInfTablas"), th("camarasInfResultado"), th("camarasInfMejorar"))),
        el("tbody", {}, filas))),
      el("button", { type: "button", id: "pi-camaras-planillas", class: C.mini + " mt-2", onclick: planillasDeCamaras }, el("span", { "aria-hidden": "true", texto: "📝 " }), tx("camarasPlanillas")),
      tablaHistorial);
  }

  /* Cómo leyó cada cámara su partida, guardado en ESTA computadora para todos
   * los torneos (no va en el torneo, que se publica): una fila por partida
   * terminada, con el tablero y la luz que dice la cámara. Así quien organiza
   * sabe qué tableros conviene llevar. */
  const LECTURA_CAMARAS = "pareo_camaras_lectura_v1";
  const LUZ_TX = { poca: "luzPoca", normal: "luzNormal", mucha: "luzMucha" };
  function anotarLectura(v, clave, d) {
    const n = d.juego.history().length;
    if (!d.resultado || n < 2) return;
    const lista = leerJSON(LECTURA_CAMARAS, []).filter((x) => x.k !== v.id + "|" + d.ronda + "|" + clave);
    lista.push({ k: v.id + "|" + d.ronda + "|" + clave, tablero: (d.equipo && d.equipo.tablero) || "", luz: (d.equipo && d.equipo.luz) || null,
      jugadas: n, mano: Math.min(d.mano || 0, n), dudas: d.dudas || 0 });
    escribir(LECTURA_CAMARAS, JSON.stringify(lista.slice(-2000)));
  }
  function resumenLectura() {
    const grupos = new Map();
    for (const x of leerJSON(LECTURA_CAMARAS, [])) {
      const k = x.tablero + "|" + (x.luz || "");
      const g = grupos.get(k) || { tablero: x.tablero, luz: x.luz, partidas: 0, jugadas: 0, mano: 0, dudas: 0 };
      g.partidas++; g.jugadas += x.jugadas; g.mano += x.mano; g.dudas += x.dudas;
      grupos.set(k, g);
    }
    return [...grupos.values()].filter((g) => g.jugadas).sort((a, b) => (b.jugadas - b.mano) / b.jugadas - (a.jugadas - a.mano) / a.jugadas);
  }

  // Las planillas de anotación de la ronda en juego, de lo que mandaron las
  // cámaras (js/planilla-pdf.js, la misma de la cámara): una por jugador.
  let cargaPlanillas = null;
  function cargarPlanillas() {
    const una = (src) => new Promise((ok, mal) => { const sc = document.createElement("script"); sc.src = src; sc.onload = ok; sc.onerror = () => mal(new Error(src)); document.head.appendChild(sc); });
    if (!cargaPlanillas) cargaPlanillas = (window.ComandosTablero ? Promise.resolve() : una("js/comandos-tablero.js")).then(() => (window.PlanillaPDF ? null : una("js/planilla-pdf.js")));
    cargaPlanillas.catch(() => { cargaPlanillas = null; });
    return cargaPlanillas;
  }
  async function planillasDeCamaras() {
    const v = t(), c = estado.camaras;
    const partidas = [...c.partidas.entries()].sort((a, b) => ordenLugar(a[0], b[0]))
      .filter(([, d]) => d.ronda === v.rondas.length && d.juego.history().length && !d.juego.header().FEN)
      .map(([k, d]) => ({ jugadas: d.juego.history(), blancas: d.blancas, negras: d.negras, resultado: d.resultado || null,
        evento: v.nombre || "", ronda: v.rondas.length, mesa: verLugar(k), fecha: window.HoraCR ? HoraCR.hoy() : "" }));
    if (!partidas.length) { Avisos.avisar(tx("camarasPlanillasNinguna"), { tipo: "info" }); return; }
    try {
      await cargarPlanillas();
      await window.PlanillaPDF.descargar(partidas, "planillas-ronda-" + v.rondas.length + ".pdf", { en: Pagina.idioma === "en" });
      Avisos.avisar(tx("camarasPlanillasListas", { n: partidas.length }), { tipo: "ok" });
    } catch (e) { Avisos.avisar(tx("camarasPlanillasError"), { tipo: "error" }); }
  }

  // ---------- Transmitir a Lichess ----------
  // Las partidas de las mesas de la ronda en juego (las de las cámaras y las
  // escritas a mano) y sus resultados van a una transmisión de Lichess de
  // quien organiza: POST /api/broadcast/round/{id}/push, con su clave
  // («study:write»). La transmisión y cada ronda se crean en Lichess: crearlas
  // desde acá no se puede (Lichess no le contesta a otra página fuera de
  // /api/), y pegar el enlace de la ronda es un clic. La clave queda solo en
  // esta computadora (nunca en el torneo, que se exporta y se publica); qué
  // ronda de Lichess es cada ronda, por torneo. Se manda como mucho una vez
  // cada 5 segundos, y una vez por minuto igual (un resultado anotado a mano).
  // Ver «Transmitir a Lichess» en docs/decisiones/juegos-y-torneos.md.
  const LICHESS_CLAVE = "pareo_lichess_clave_v1", LICHESS_RONDAS = "pareo_lichess_v1_";
  const LICHESS_API = "https://lichess.org/api/broadcast/round/";
  const RESULTADO_PGN = { "1-0": "1-0", "=": "1/2-1/2", "0-1": "0-1", "+-": "1-0", "-+": "0-1" };
  // El id de una RONDA: el enlace es lichess.org/broadcast/<torneo>/<ronda>/<id>
  // (el de la transmisión entera, /broadcast/<torneo>/<id>, no sirve para mandar).
  function rondaLichess(texto) {
    const x = String(texto || "").trim();
    if (/^[A-Za-z0-9]{8}$/.test(x)) return x;
    let u;
    try { u = new URL(x); } catch (e) { return null; }
    const p = u.pathname.split("/").filter(Boolean);
    return u.hostname === "lichess.org" && p[0] === "broadcast" && p.length === 4 && /^[A-Za-z0-9]{8}$/.test(p[3]) ? p[3] : null;
  }
  const rondasLichess = (id) => leerJSON(LICHESS_RONDAS + id, {});
  function pgnParaLichess(v) {
    const n = v.rondas.length, R = v.rondas[n - 1];
    const jugador = (lista, id) => (lista || []).find((j) => j.id === id) || {};
    const encabezado = (k, x) => "[" + k + ' "' + String(x == null ? "" : x).replace(/["\\\n\r]/g, "").slice(0, 120) + '"]';
    // Solo las jugadas de lo guardado (sin su cabecera ni su resultado) y el resultado anotado.
    const juego = (cab, pgn, r) => {
      const jugadas = String(pgn || "").replace(/^(\s*\[[^\]]*\]\s*)+/, "").replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, "").trim();
      const res = RESULTADO_PGN[r] || "*";
      cab.push(["Result", res]);
      return cab.map(([k, x]) => encabezado(k, x)).join("\n") + "\n\n" + (jugadas ? jugadas + " " : "") + res;
    };
    const juegos = [];
    R.mesas.forEach((m, i) => {
      if (m.n == null || m.r === "--") return;
      const f = V.mesaFisica(v, i);
      const comun = [["Event", v.nombre || "Pareo Integral"], ["Site", v.ciudad || ""]];
      if (!E.esDeEquipos(v)) {
        const b = jugador(v.jugadores, m.b), ne = jugador(v.jugadores, m.n);
        juegos.push(juego(comun.concat([["Round", n + "." + f], ["White", b.nombre], ["Black", ne.nombre],
          ["WhiteElo", Number(b.elo) || ""], ["BlackElo", Number(ne.elo) || ""]]).filter(([, x]) => x !== ""), m.pgn, m.r));
        return;
      }
      const eb = jugador(v.jugadores, m.b), en = jugador(v.jugadores, m.n);
      const copia = Object.assign({}, m);
      if (!copia.alineacion) copia.alineacion = { b: E.alineacionPorOmision(v, m.b), n: E.alineacionPorOmision(v, m.n) };
      for (const x of E.tablerosDe(v, copia)) {
        if (!x.blancas || !x.negras) continue;
        const eqB = x.bBlancas ? eb : en, eqN = x.bBlancas ? en : eb;
        const b = jugador(eqB.integrantes, x.blancas), ne = jugador(eqN.integrantes, x.negras);
        const p = (m.partidas || [])[x.k] || {};
        juegos.push(juego(comun.concat([["Round", n + "." + f + "." + (x.k + 1)], ["White", b.nombre], ["Black", ne.nombre],
          ["WhiteTeam", eqB.nombre], ["BlackTeam", eqN.nombre], ["WhiteElo", Number(b.elo) || ""], ["BlackElo", Number(ne.elo) || ""]]).filter(([, y]) => y !== ""), p.pgn, x.r));
      }
    });
    return juegos.slice(0, 100).join("\n\n\n");
  }
  let lichessReloj = null;
  function lichessPronto() {
    if (lichessReloj || !estado.camaras || !leer(LICHESS_CLAVE)) return;
    const pasado = Date.now() - ((estado.lichess && estado.lichess.hora) || 0);
    lichessReloj = setTimeout(() => { lichessReloj = null; mandarALichess(); }, Math.max(0, 5000 - pasado));
  }
  setInterval(() => lichessPronto(), 60000);
  async function mandarALichess() {
    const v = torneoDeCamaras(), clave = leer(LICHESS_CLAVE);
    if (!v || !clave || !v.rondas.length) return;
    const n = v.rondas.length, ronda = rondasLichess(estado.camaras.idTorneo)[n];
    if (!ronda) { estado.lichess = { falta: n }; pintarCamaras(); return; }
    const pgn = pgnParaLichess(v);
    let r = { hora: Date.now(), n, partidas: 0, error: null };
    try {
      const res = await fetch(LICHESS_API + ronda.id + "/push", { method: "POST", headers: { Authorization: "Bearer " + clave, "Content-Type": "text/plain" }, body: pgn });
      const datos = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) r.error = tx("lichessClaveMala");
      else if (!res.ok) r.error = tx("lichessError", { e: (datos && datos.error) || "HTTP " + res.status });
      else r.partidas = Array.isArray(datos.games) ? datos.games.length : 0;
    } catch (e) { r.error = tx("lichessError", { e: e.message }); }
    estado.lichess = r;
    pintarCamaras();
  }
  async function conectarLichess() {
    const v = t();
    if (!estado.camaras || estado.camaras.idTorneo !== estado.id) return;
    const n = v.rondas.length, guardada = !!leer(LICHESS_CLAVE);
    const res = await Avisos.formulario({ titulo: tx("lichessTitulo"), texto: tx("lichessTexto", { r: n }), aceptar: tx("lichessConectar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "clave", etiqueta: tx("lichessClave"), valor: "", max: 200, ayuda: guardada ? tx("lichessClaveGuardada") : undefined },
        { nombre: "ronda", etiqueta: tx("lichessRonda", { r: n }), valor: "", max: 300 }] });
    if (!res) return;
    const clave = String(res.clave || "").trim();
    if (!clave && !guardada) { Avisos.avisar(tx("lichessSinClave"), { tipo: "error" }); return; }
    const id = rondaLichess(res.ronda);
    if (!id) { Avisos.avisar(tx("lichessRondaMala"), { tipo: "error" }); return; }
    if (clave) escribir(LICHESS_CLAVE, clave);
    const rondas = rondasLichess(estado.id);
    rondas[n] = { id, url: /^https:\/\/lichess\.org\//.test(String(res.ronda).trim()) ? String(res.ronda).trim() : "https://lichess.org/broadcast/-/-/" + id };
    escribir(LICHESS_RONDAS + estado.id, JSON.stringify(rondas));
    await mandarALichess();
  }
  function dejarLichess() {
    try { localStorage.removeItem(LICHESS_CLAVE); localStorage.removeItem(LICHESS_RONDAS + estado.id); } catch (e) { /* sin almacenamiento */ }
    estado.lichess = null;
    pintarCamaras();
    Avisos.avisar(tx("lichessDejado"));
  }
  // Lo de Lichess dentro de la caja de las cámaras.
  function pintarLichess(v) {
    const clave = leer(LICHESS_CLAVE), n = v.rondas.length, ronda = rondasLichess(estado.id)[n];
    const lx = estado.lichess;
    if (!clave) return el("div", { id: "pi-lichess", class: "mt-2" }, el("button", { type: "button", id: "pi-lichess-conectar", class: C.mini, onclick: conectarLichess }, tx("lichessBoton")));
    const texto = !ronda ? tx("lichessFaltaRonda", { r: n }) : lx && lx.error ? lx.error : lx && lx.hora ? tx("lichessEnviado", { n: lx.partidas, r: lx.n, h: horaCR(lx.hora) }) : "";
    return el("div", { id: "pi-lichess", class: "mt-2 text-sm" },
      el("p", { id: "pi-lichess-estado", role: "status", class: lx && lx.error ? "font-semibold" : "", texto }),
      el("div", { class: "flex flex-wrap gap-2 mt-1" },
        !ronda ? el("button", { type: "button", id: "pi-lichess-conectar", class: C.mini, onclick: conectarLichess }, tx("lichessRondaBoton", { r: n })) : null,
        ronda ? el("a", { href: ronda.url, target: "_blank", rel: "noopener", class: C.mini }, tx("lichessVer")) : null,
        el("button", { type: "button", id: "pi-lichess-dejar", class: C.mini, onclick: dejarLichess }, tx("lichessDejar"))));
  }

  // Arriba de la ronda: con qué código se escucha y qué mesas mandan.
  /* El latido de cada cámara (cada 30 s y cuando algo cambia): que sigue
   * viva aunque nadie mueva, su batería y si la mesa está lista (lee las 64,
   * hay luz, transmite, la pantalla no se apaga). Ver «Que no se caiga» en
   * js/camara-tablero.js. */
  const FALTA_TX = { lectura: "camaraFaltaLectura", luz: "camaraFaltaLuz", bateria: "camaraFaltaBateria", senal: "camaraFaltaSenal", pantalla: "camaraFaltaPantalla" };
  const SIN_NOTICIAS_MS = 90000;
  function latidoDeCamara(p) {
    const v = torneoDeCamaras();
    if (!v || !v.publicado || !v.rondas.length || p.torneo !== v.publicado.id || Number(p.ronda) !== v.rondas.length) return;
    const mesa = Number(p.mesa), tablero = E.esDeEquipos(v) ? Number(p.tablero) || null : null;
    if (!v.rondas[v.rondas.length - 1].mesas.some((x, k) => V.mesaFisica(v, k) === mesa)) return;
    const clave = claveCamara(mesa, tablero);
    const nivel = p.bateria && Number.isFinite(p.bateria.nivel) ? Math.max(0, Math.min(100, Math.round(p.bateria.nivel))) : null;
    const faltan = p.lista && Array.isArray(p.lista.faltan) ? p.lista.faltan.filter((k) => FALTA_TX[k]).slice(0, 5) : null;
    estado.camaras.latidos.set(clave, { h: Date.now(), ronda: v.rondas.length, bateria: nivel === null ? null : { nivel, cargando: !!p.bateria.cargando }, faltan });
    const nueva = !estado.camaras.mesas.has(clave);
    estado.camaras.mesas.set(clave, Date.now());
    if (nueva) pintarCamaras(); else relojesCamaras();
  }
  // Las mesas de la ronda que necesitan a alguien: sin noticias, sin batería o por revisar.
  function saludCamaras(v) {
    const c = estado.camaras, ahora = Date.now(), lineas = [];
    const sinNoticias = [], baja = [], revisar = [], listas = [];
    for (const clave of [...c.mesas.keys()].sort(ordenLugar)) {
      const d = c.partidas.get(clave), l = c.latidos.get(clave);
      const ronda = (d && d.ronda) || (l && l.ronda);
      if (ronda !== v.rondas.length || (d && d.resultado)) continue;
      const hace = ahora - c.mesas.get(clave);
      if (hace > SIN_NOTICIAS_MS) sinNoticias.push(tx("camaraSinNoticiasMesa", { m: verLugar(clave), n: Math.floor(hace / 60000) }));
      if (l && l.bateria && !l.bateria.cargando && l.bateria.nivel < 20) baja.push(tx("camaraBateriaMesa", { m: verLugar(clave), n: l.bateria.nivel }));
      if (l && l.faltan) {
        if (l.faltan.length) revisar.push(tx("camaraRevisarMesa", { m: verLugar(clave), q: l.faltan.map((k) => tx(FALTA_TX[k])).join(", ") }));
        else listas.push(verLugar(clave));
      }
    }
    if (sinNoticias.length) lineas.push(tx("camarasSinNoticias", { l: sinNoticias.join(", ") }));
    if (baja.length) lineas.push(tx("camarasBateriaBaja", { l: baja.join(", ") }));
    if (revisar.length) lineas.push(tx("camarasRevisar", { l: revisar.join("; ") }));
    if (listas.length) lineas.push(tx("camarasListas", { l: listas.join(", ") }));
    return lineas;
  }

  /* Las mesas de la ronda cuyo reloj de la cámara corre con menos de un
   * minuto: cada segundo, solo ese renglón (la caja no se vuelve a armar). */
  function relojesCamaras() {
    const e = $("pi-camaras-poco"), v = estado.camaras && estado.camaras.idTorneo === estado.id ? t() : null;
    if (!e || !v || !window.PartidaEnVivo) return;
    const P = window.PartidaEnVivo, cortas = [];
    for (const [clave, d] of [...estado.camaras.partidas.entries()].sort((a, b) => ordenLugar(a[0], b[0]))) {
      if (d.ronda !== v.rondas.length) continue;
      const r = P.relojDe(d), poco = P.pocoTiempo(r);
      if (poco) cortas.push(tx("camaraPocoMesa", { m: verLugar(clave), q: colorTx(poco), t: P.tiempoReloj(r[poco]) }));
    }
    const texto = cortas.length ? tx("camaraPocoTiempo", { l: cortas.join(", ") }) : "";
    e.hidden = !cortas.length;
    if (e.textContent !== texto) e.textContent = texto;
    const s = $("pi-camaras-salud");
    if (s) {
      const lineas = saludCamaras(v), txt = lineas.join("\n");
      s.hidden = !lineas.length;
      if (s.dataset.txt !== txt) { s.dataset.txt = txt; s.replaceChildren(...lineas.map((x) => el("li", { texto: x }))); }
    }
  }
  setInterval(relojesCamaras, 1000);
  function pintarCamaras() {
    const caja = $("pi-camaras-caja");
    if (!caja) return;
    const v = t();
    const activas = !!(v.camaras && v.camaras.activo);
    caja.hidden = !activas;
    if (!activas) { caja.replaceChildren(); return; }
    const mesas = estado.camaras && estado.camaras.idTorneo === estado.id ? [...estado.camaras.mesas.keys()].sort(ordenLugar).map(verLugar) : [];
    const dejar = el("button", { type: "button", id: "pi-camaras-dejar", class: C.mini, onclick: dejarCamaras }, tx("camarasDejar"));
    const alertas = estado.camaras && estado.camaras.idTorneo === estado.id ? [...estado.camaras.alertas.entries()].sort((a, b) => ordenLugar(a[1].m, b[1].m)) : [];
    const listaAlertas = alertas.length ? el("ul", { id: "pi-camaras-alertas", class: "mt-2 space-y-1 text-sm" }, alertas.map(([k, a]) => el("li", { class: "flex flex-wrap items-center gap-2", "data-alerta": String(a.m), "data-tipo": a.tipo },
      el("span", { class: "font-semibold", texto: tx(a.tipo === "ilegal" ? "camaraAlertaFila" : "camaraTablasFila", { m: verLugar(a.m), h: horaCR(a.h), q: a.tipo === "ilegal" ? "" : a.tipo === "bandera" && a.color ? tx("camaraBanderaDe", { q: colorTx(a.color) }) : tx(TIPOS_ALERTA[a.tipo] + "Corto") }) }),
      fotoDe(a.m, a.h) ? botonFoto(fotoDe(a.m, a.h)) : null,
      el("button", { type: "button", class: C.mini, onclick: () => { estado.camaras.alertas.delete(k); pintarCamaras(); } }, tx("camaraAlertaVista"))))) : null;
    caja.replaceChildren(el("h3", { class: "font-semibold" }, el("span", { "aria-hidden": "true", texto: "🎥 " }), tx("camarasCajaTitulo")),
      el("p", { class: C.nota, texto: tx("camarasCajaTexto", { c: v.camaras.codigo }) }),
      el("p", { id: "pi-camaras-mesas", class: "text-sm mt-1", texto: mesas.length ? tx("camarasMesas", { m: mesas.join(", ") }) : tx("camarasNinguna") }),
      el("p", { id: "pi-camaras-poco", class: "text-sm font-semibold text-red-800 dark:text-red-200 mt-1", hidden: true }),
      el("ul", { id: "pi-camaras-salud", class: "text-sm mt-1 space-y-0.5", hidden: true }),
      listaAlertas, estado.camaras && estado.camaras.idTorneo === estado.id ? informeCamaras() : null,
      estado.camaras && estado.camaras.idTorneo === estado.id ? pintarLichess(v) : null,
      conQrDeCamaras(v) ? el("p", { class: C.nota + " mt-2", texto: tx("camarasQrTexto") }) : null,
      el("div", { class: "mt-2 flex flex-wrap gap-2" },
        conQrDeCamaras(v) ? el("button", { type: "button", id: "pi-camaras-qr", class: C.mini, onclick: imprimirQrCamaras }, el("span", { "aria-hidden": "true", texto: "🖨️ " }), tx("camarasQrBoton")) : null,
        dejar));
    relojesCamaras();
  }

  Object.assign(Pagina, { cargarVivo, pedirCodigoCamaras, enlaceCamaraDe, conQrDeCamaras, imprimirQrCamaras,
    conectarCamaras, claveCamara, verLugar, FOTO_VALIDA, fotoDe, verFoto, botonFoto, SIN_NOTICIAS_MS,
    pintarCamaras });
})();

/*! rev bfb5bbb0d2d82f9f */
