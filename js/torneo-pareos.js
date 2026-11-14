/* «Pareos de la ronda»: la ventana #pareos de una página de torneo con varios
 * torneos (hoy, tacho-chess-2.html). Lo pidió el dueño el 13/11/2026: «que
 * haya una ficha para ver los pareos únicamente y otra para las
 * clasificaciones». La clasificación ya es la de js/centroamericano-tablas.js;
 * esto es solo el pareo.
 *
 * Se elige el torneo y sale su ronda en juego, mesa por mesa: la mesa de la
 * sala, blancas, el resultado (o «—» si todavía se juega) y negras, cada uno
 * con su nivel, porque en Tacho Chess 2 cada torneo junta varios niveles. Los
 * datos son los mismos que ya leyó js/centroamericano-vivo.js (de Pareo
 * Integral con js/torneo-pareo-datos.js, o de chess-results): no pide nada
 * aparte. Se vuelve a pintar cuando llegan datos nuevos («cac-datos»).
 *
 * Mientras la ventana está abierta y a la vista, se pone al día sola: cada
 * 15 s pregunta si el torneo cambió en Pareo Integral (TorneoPareoDatos.cambio,
 * solo la hora de actualización) y, si cambió, vuelve a leerlo; cada 2 min lo
 * lee entero igual (por si se publicó otro torneo). Pedido del dueño el
 * 14/11/2026: «que se actualice en tiempo real». Ver «Los pareos de la ronda
 * se ponen al día solos» en docs/decisiones/juegos-y-torneos.md.
 *
 * Todo lo que viene de afuera (los nombres) va por textContent.
 * Ver «Los pareos de la ronda» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";
  const V = window.CentroamericanoVivo;
  const caja = document.getElementById("pareos-contenido");
  const sel = document.getElementById("pareos-torneo");
  if (!V || !caja || !sel) return;
  const el = V.el;
  const ventana = document.getElementById("pareos");
  const D = window.TorneoPareoDatos;
  let elegido = "";
  const REVISAR_MS = 15000;
  const COMPLETA_MS = 120000;
  let revisado = 0;
  const horaCorta = (ms) => new Date(ms).toLocaleTimeString("es-CR", { timeZone: V.ZONA, hour: "numeric", minute: "2-digit", second: "2-digit" });

  // Los torneos con sus jugadores, en el orden en que llegaron.
  const torneos = () => (((V.datos() || {}).torneos) || []).filter((t) => Array.isArray(t.jugadores) && t.jugadores.length);

  function pintarSelector(lista) {
    const firma = lista.map((t) => t.tnr + ":" + t.texto).join("|");
    if (sel.dataset.firma !== firma) {
      sel.dataset.firma = firma;
      sel.replaceChildren(...lista.map((t) => { const o = el("option", "", t.texto || ""); o.value = String(t.tnr); return o; }));
    }
    if (!lista.some((t) => String(t.tnr) === elegido)) elegido = lista.length ? String(lista[0].tnr) : "";
    sel.value = elegido;
    sel.closest("label").hidden = lista.length < 2;
  }

  // Un jugador de la mesa: el color escrito (nunca solo el color), su nombre y su nivel.
  function persona(color, p, porNo) {
    const fila = el("p", "cac-pareo-jugador");
    fila.appendChild(el("span", "cac-pareo-color", color));
    const j = porNo.get(p.no) || {};
    fila.appendChild(el("span", "cac-pareo-nombre", (p.titulo ? p.titulo + " " : "") + p.nombre));
    if (j.grupo) fila.appendChild(el("span", "cac-pareo-nivel", V.categoria(j.grupo)));
    return fila;
  }
  // El texto de lo que se lee de la página, sin el punto doble («p. m..»).
  const decir = (nodo, s) => { nodo.textContent = String(s).replace(/\.\./g, "."); };

  function pintar() {
    const lista = torneos();
    if (!lista.length) {
      sel.closest("label").hidden = true;
      caja.replaceChildren(el("p", "", V.datos() ? "Todavía no hay torneos publicados en Pareo Integral." : "Cargando…"));
      return;
    }
    pintarSelector(lista);
    const t = lista.find((x) => String(x.tnr) === elegido) || lista[0];
    const porNo = new Map(t.jugadores.map((j) => [j.no, j]));
    const estado = el("p", "font-semibold");
    if (t.terminado) {
      decir(estado, "El torneo terminó, a " + (t.rondas || t.ronda) + " rondas: el resultado final está en la clasificación." + V.cuandoSeLeyo());
      caja.replaceChildren(estado);
      return;
    }
    const pareo = t.pareo;
    if (!pareo || !pareo.ronda || !Array.isArray(pareo.mesas) || !pareo.mesas.length) {
      decir(estado, "El pareo de la ronda " + ((t.ronda || 0) + 1) + " todavía no está publicado." + V.cuandoSeLeyo());
      caja.replaceChildren(estado);
      return;
    }
    const hechas = pareo.mesas.filter((m) => m.negras && m.resultado).length;
    const total = pareo.mesas.filter((m) => m.negras).length;
    decir(estado, "Ronda " + pareo.ronda + (t.rondas ? " de " + t.rondas : "") + ": " + hechas + " de " + total + " partidas terminadas." + V.cuandoSeLeyo());
    // Una mesa por renglón, que cabe en el celular: el número, blancas y
    // negras una debajo de la otra, y el resultado a la derecha.
    const ul = el("ul", "cac-pareo-lista");
    pareo.mesas.forEach((m) => {
      const li = el("li", "cac-pareo-mesa");
      li.appendChild(el("span", "cac-pareo-n", "Mesa " + (m.mesa || "")));
      const quienes = el("div", "cac-pareo-quienes");
      quienes.appendChild(persona("Blancas", m.blancas, porNo));
      if (m.negras) quienes.appendChild(persona("Negras", m.negras, porNo));
      else quienes.appendChild(el("p", "cac-pareo-descansa", "Descansa: bye de un punto."));
      li.appendChild(quienes);
      li.appendChild(el("span", "cac-pareo-res", m.negras ? (m.resultado || "Se juega") : "Bye"));
      // Dónde queda la mesa en la foto de la sala (js/torneo-sala-foto.js).
      const donde = m.negras && window.TorneoSalaFoto && window.TorneoSalaFoto.boton(t, m.mesa);
      if (donde) li.appendChild(donde);
      ul.appendChild(li);
    });
    caja.replaceChildren(estado, ul);
    pintarRevisado();
  }

  // «Se pone al día sola: revisado a las 10:15:30 a. m.», debajo de las mesas.
  // Va fuera de la región que se anuncia, para que el lector de pantalla no
  // repita todo el pareo cada 15 segundos.
  let aviso = null;
  function pintarRevisado() {
    if (!ventana || !revisado) return;
    if (!aviso || !aviso.isConnected) {
      aviso = el("p", "cac-pareo-aldia text-sm text-brand-600 dark:text-brand-300 mt-3");
      caja.after(aviso);
    }
    decir(aviso, "Se pone al día sola mientras la tienes abierta: revisado a las " + horaCorta(revisado) + ".");
  }

  // Revisar: si cambió algo, leer de nuevo; si no, solo anotar la hora.
  let revisando = false, ultimaCompleta = Date.now();
  async function revisar() {
    if (revisando || !ventana || !ventana.open || document.hidden) return;
    revisando = true;
    try {
      const toca = Date.now() - ultimaCompleta >= COMPLETA_MS;
      // Sin Pareo (chess-results, por la Edge Function) no hay pregunta
      // liviana: solo la lectura entera, cada 2 minutos como hasta ahora.
      const cambio = toca ? true : (D && D.cambio ? await D.cambio() : false);
      if (cambio) { await V.pedir(true); ultimaCompleta = Date.now(); }
      revisado = Date.now();
      pintarRevisado();
    } catch (e) {
      // Sin conexión: se queda lo que había y se vuelve a probar en 15 s.
    } finally {
      revisando = false;
    }
  }

  sel.addEventListener("change", () => { elegido = sel.value; pintar(); });
  document.addEventListener("cac-datos", pintar);
  // Al abrir la ventana, los datos al día (pedir() no vuelve a leer si son recientes).
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href="#pareos"]');
    if (a) { pintar(); V.pedir().then(pintar, pintar).then(() => setTimeout(revisar, 0)); }
  });
  if (location.hash === "#pareos") V.pedir().then(pintar, pintar);
  if (ventana) {
    setInterval(revisar, REVISAR_MS);
    // Al volver a la pestaña (el celular bloqueado, otra app), en el acto.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) revisar(); });
  }
  pintar();
})();

/*! rev bfb5bbb0d2d82f9f */
