/* «Resultados U12» y «Resultados U20» en jdn-pz-2026.html: cada torneo de la
 * eliminatoria en una ventana de la página, con el diseño de cada categoría
 * del Centroamericano (#categoria de js/centroamericano-tablas.js), en lugar
 * de la página pública de Pareo encima. Lo pidió el dueño el 18/11/2026:
 * «colocar como en centroamericano para que se vea todo más ordenado».
 *
 * - LOS DATOS son los que ya leyó js/centroamericano-vivo.js de Pareo
 *   Integral (js/torneo-pareo-datos.js): no se pide nada aparte. El torneo de
 *   cada ventana se reconoce por el nombre, como en js/jdn-pz-inscripcion.js:
 *   «U12» en uno; «U20» o «U16» en el otro (los dos se juegan juntos).
 * - ARRIBA, cómo va: la ronda y cuántas partidas terminaron, o que todavía
 *   no empieza, o que terminó. Debajo, «Pareo de la ronda» y «Clasificación»
 *   (el mismo par de botones del Centroamericano) y un buscador.
 * - EL PAREO, una tarjeta por mesa (en el celular una tabla dejaba las negras
 *   fuera de la pantalla): blancas, el resultado y negras, cada uno con su
 *   categoría, su Elo y sus puntos. El color va escrito, no solo dibujado.
 * - LA CLASIFICACIÓN, una tabla por categoría (U12 Absoluto, U12 Femenino…),
 *   en el orden de la clasificación de Pareo con sus desempates: así se
 *   clasifica a los Juegos Nacionales. Antes de la ronda 1, el orden inicial.
 * - Tocar un nombre lo busca en «Busca a tu jugador» (sus rondas, su mesa).
 * - Abierta y a la vista, se pone al día sola: cada 20 s pregunta a Pareo si
 *   el torneo cambió (TorneoPareoDatos.cambio, solo la hora) y, si cambió,
 *   lo vuelve a leer, como «Pareos de la ronda» (js/torneo-pareos.js).
 *
 * Todo lo que viene de afuera (los nombres) va por textContent.
 * Ver «Los resultados U12 y U20, como en el Centroamericano» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  if (!V) return;
  const el = V.el;
  const D = window.TorneoPareoDatos;
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const TORNEOS = { U12: /\b(u|sub)[\s-]?12\b/, U20: /\b(u|sub)[\s-]?(20|16)\b/ };
  const REVISAR_MS = 20000;

  // El torneo de Pareo de una ventana («U12» o «U20»), o null si todavía no está.
  function torneo(k) {
    const lista = ((V.datos() || {}).torneos) || [];
    return lista.find((t) => TORNEOS[k] && TORNEOS[k].test(sinTildes(t.texto))) || null;
  }

  // El texto de lo que se lee de la página, sin el punto doble («p. m..»).
  const decir = (nodo, s) => { nodo.textContent = String(s).replace(/\.\./g, "."); };
  const nombreDe = (j) => (j.titulo ? j.titulo + " " : "") + (j.nombre || "");
  const coincide = (j, palabras) => !!j && palabras.every((p) => V.plano(j.nombre).includes(p));

  // Tocar un nombre: se cierra la ventana y se busca en «Busca a tu jugador».
  function buscarJugador(nombre, dialogo) {
    const campo = document.getElementById("buscador-nombre");
    if (!campo) return;
    if (dialogo && dialogo.open) dialogo.close();
    campo.value = nombre;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.scrollIntoView({ behavior: "smooth", block: "center" });
    campo.focus({ preventScroll: true });
  }
  function botonNombre(j, dialogo) {
    const b = el("button", "cac-cat-jugador", nombreDe(j));
    b.type = "button";
    b.setAttribute("aria-label", "Buscar a " + nombreDe(j) + " en «Busca a tu jugador»");
    b.addEventListener("click", () => buscarJugador(j.nombre, dialogo));
    return b;
  }

  /* ---------------- una ventana ---------------- */
  function Ventana(k) {
    const dialogo = document.getElementById("resultados-" + k.toLowerCase());
    const caja = document.getElementById("resultados-" + k.toLowerCase() + "-contenido");
    if (!dialogo || !caja) return null;
    const estado = { vista: "", texto: "" };
    let partes = null;

    function armar() {
      const arriba = el("p", "font-bold");
      arriba.setAttribute("role", "status");
      const grupo = el("div", "cac-modalidad mt-3");
      grupo.setAttribute("role", "group");
      grupo.setAttribute("aria-label", "Qué ver del torneo " + k);
      const botones = [["pareo", "Pareo de la ronda"], ["clasificacion", "Clasificación"]].map(([v, texto]) => {
        const b = el("button", "cac-modalidad-boton", texto);
        b.type = "button";
        b.dataset.vista = v;
        b.addEventListener("click", () => { estado.vista = v; pintar(); b.focus(); });
        grupo.appendChild(b);
        return b;
      });
      const etiqueta = el("label", "block text-sm font-bold mt-3", "Buscar un jugador");
      const q = el("input", "cac-buscador-campo !mt-1");
      q.type = "search"; q.autocomplete = "off"; q.spellcheck = false;
      q.addEventListener("input", () => { estado.texto = q.value; pintar(); });
      etiqueta.appendChild(q);
      const cuerpo = el("div", "mt-4");
      const pie = el("div", "mt-4 text-sm text-brand-600 dark:text-brand-300 grid gap-2");
      pie.appendChild(el("p", "", "Toca un nombre para ver sus rondas, su mesa y su rival en «Busca a tu jugador»."));
      const enPareo = el("a", "font-bold underline underline-offset-2 hover:no-underline", "Ver el torneo completo en Pareo Integral →");
      enPareo.dataset.ventana = "Torneo " + k + " en Pareo Integral";
      pie.appendChild(el("p")).appendChild(enPareo);
      const aldia = el("p", "", "");
      pie.appendChild(aldia);
      caja.replaceChildren(arriba, grupo, etiqueta, cuerpo, pie);
      partes = { arriba, grupo, botones, q, cuerpo, enPareo, aldia };
    }

    function pintar() {
      if (!dialogo.open) return;
      const t = torneo(k);
      if (!t) {
        partes = null;
        caja.replaceChildren(el("p", "font-semibold", V.datos()
          ? "El torneo " + k + " todavía no está publicado en Pareo Integral: aparece aquí en cuanto la organización lo publique."
          : "Cargando…"));
        return;
      }
      if (!partes || !partes.cuerpo.isConnected) armar();
      const pareo = t.pareo && t.pareo.ronda && Array.isArray(t.pareo.mesas) && t.pareo.mesas.length ? t.pareo : null;
      // Sin pareo (antes de la ronda 1, o terminado), empieza en la clasificación.
      if (!estado.vista) estado.vista = pareo && !t.terminado ? "pareo" : "clasificacion";
      partes.botones.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vista === estado.vista)));
      partes.enPareo.href = t.url || ("torneos-pareo.html#t=" + t.tnr);

      const jugados = pareo ? pareo.mesas.filter((m) => m.negras) : [];
      const hechas = jugados.filter((m) => /\d|½|\+/.test(m.resultado || "")).length;
      const n = t.jugadores.length;
      if (t.terminado) decir(partes.arriba, "El torneo terminó, a " + (t.rondas || t.ronda) + " rondas: esta es la clasificación final." + V.cuandoSeLeyo());
      else if (pareo) decir(partes.arriba, "Ronda " + pareo.ronda + (t.rondas ? " de " + t.rondas : "") + ": " + hechas + " de " + jugados.length + " partidas terminadas · " + n + " jugadores." + V.cuandoSeLeyo());
      else decir(partes.arriba, n + " jugadores aprobados. El pareo de la ronda " + ((t.ronda || 0) + 1) + " sale en cuanto lo publique el árbitro." + V.cuandoSeLeyo());

      const palabras = V.plano(estado.texto).split(" ").filter(Boolean);
      if (estado.vista === "pareo") pintarPareo(t, pareo, palabras);
      else pintarClasificacion(t, palabras);
    }

    function pintarPareo(t, pareo, palabras) {
      const cuerpo = partes.cuerpo;
      if (!pareo) {
        cuerpo.replaceChildren(el("p", "font-semibold", t.terminado
          ? "El torneo terminó: el resultado final está en «Clasificación»."
          : "El pareo de la ronda " + ((t.ronda || 0) + 1) + " todavía no está publicado."));
        return;
      }
      const porNo = new Map(t.jugadores.map((j) => [j.no, j]));
      const lado = (p, color) => {
        const j = porNo.get(p.no) || p;
        const c = el("div", "cac-cat-lado");
        c.appendChild(el("span", "sr-only", (color === "w" ? "Blancas" : "Negras") + ": "));
        const fila = el("span", "cac-cat-nombre");
        fila.appendChild(el("span", "cac-partida-color", color === "w" ? "♔" : "♚")).setAttribute("aria-hidden", "true");
        fila.appendChild(botonNombre(j, dialogo));
        c.appendChild(fila);
        c.appendChild(el("span", "cac-cat-sub", [j.grupo, j.elo ? "Elo " + j.elo : "", (j.puntos || "0") + " pts"].filter(Boolean).join(" · ")));
        return c;
      };
      const mesas = pareo.mesas.filter((m) => !palabras.length || coincide(porNo.get(m.blancas.no) || m.blancas, palabras) || (m.negras && coincide(porNo.get(m.negras.no) || m.negras, palabras)));
      if (!mesas.length) { cuerpo.replaceChildren(el("p", "", "Nadie con ese nombre en este pareo.")); return; }
      const ol = el("ol", "cac-cat-pareo");
      mesas.forEach((m) => {
        const li = el("li", "cac-cat-mesa");
        li.appendChild(el("p", "cac-cat-num", "Mesa " + m.mesa));
        const par = el("div", "cac-cat-par");
        const res = m.negras ? (m.resultado || "—") : "Bye";
        const celda = el("span", "cac-cat-res", res);
        par.append(lado(m.blancas, "w"), celda);
        // Donde va el resultado: el lector de pantalla lo dice en palabras.
        if (res === "—") { celda.setAttribute("aria-hidden", "true"); par.appendChild(el("span", "sr-only", "Todavía se juega.")); }
        if (m.negras) par.appendChild(lado(m.negras, "b"));
        li.appendChild(par);
        ol.appendChild(li);
      });
      cuerpo.replaceChildren(ol);
    }

    function pintarClasificacion(t, palabras) {
      const cuerpo = partes.cuerpo;
      const empezo = (t.ronda || 0) > 0;
      const grupos = [...new Set(t.jugadores.map((j) => j.grupo || "—"))].sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b));
      const out = [];
      grupos.forEach((g) => {
        const lista = t.jugadores.filter((j) => (j.grupo || "—") === g).sort((a, b) => a.puesto - b.puesto);
        const filas = lista.map((j, i) => ({ j, i })).filter(({ j }) => !palabras.length || coincide(j, palabras));
        if (!filas.length) return;
        const sec = el("section", "mt-5 first:mt-0");
        sec.appendChild(el("h3", "font-bold text-brand-800 dark:text-white", g + " · " + lista.length + (lista.length === 1 ? " jugador" : " jugadores")));
        const env = el("div", "cac-tabla-envoltura mt-2");
        const tabla = el("table", "cac-tabla");
        tabla.appendChild(el("caption", "sr-only", "Clasificación de " + g + (empezo ? " después de la ronda " + t.ronda : ", antes de la ronda 1")));
        const cab = el("tr");
        [[empezo ? "Puesto" : "N.º inicial", "num"], ["Jugador", ""], ["Elo", "num"], ["Puntos", "num"]].concat(empezo ? [["Puesto general", "num"]] : []).forEach(([c, clase]) => {
          const th = el("th", clase, c); th.scope = "col"; cab.appendChild(th);
        });
        const thead = el("thead"); thead.appendChild(cab);
        const tbody = el("tbody");
        filas.forEach(({ j, i }) => {
          const tr = el("tr");
          tr.appendChild(el("td", "num", empezo ? String(i + 1) : String(j.no || "—")));
          const th = el("th"); th.scope = "row"; th.appendChild(botonNombre(j, dialogo)); tr.appendChild(th);
          tr.appendChild(el("td", "num", j.elo ? String(j.elo) : "—"));
          tr.appendChild(el("td", "num", empezo ? j.puntos || "0" : "—"));
          if (empezo) tr.appendChild(el("td", "num", String(j.puesto)));
          tbody.appendChild(tr);
        });
        tabla.append(thead, tbody);
        env.appendChild(tabla);
        sec.appendChild(env);
        out.push(sec);
      });
      if (!out.length) { cuerpo.replaceChildren(el("p", "", "Nadie con ese nombre en este torneo.")); return; }
      const nota = el("p", "text-sm text-brand-600 dark:text-brand-300", empezo
        ? "Cada categoría en el orden de la clasificación de Pareo Integral, con sus desempates, después de la ronda " + t.ronda + "."
        : "Antes de la ronda 1: cada categoría en el orden inicial del torneo.");
      cuerpo.replaceChildren(nota, ...out);
    }

    // Se pone al día sola mientras está abierta y a la vista.
    let reloj = null, revisando = false;
    async function revisar() {
      if (revisando || !dialogo.open || document.hidden) return;
      revisando = true;
      try {
        const cambio = D && D.cambio ? await D.cambio() : true;
        if (cambio) await V.pedir(true);
        if (partes) decir(partes.aldia, "Se pone al día sola mientras la tienes abierta: revisado a las "
          + new Date().toLocaleTimeString("es-CR", { timeZone: V.ZONA, hour: "numeric", minute: "2-digit", second: "2-digit" }) + ".");
      } catch (e) {
        // Sin conexión: se queda lo que había y se vuelve a probar.
      } finally {
        revisando = false;
      }
    }

    const alAbrirse = () => {
      if (dialogo.open) {
        estado.vista = ""; estado.texto = ""; partes = null;
        pintar();
        V.pedir().then(pintar, () => { if (!V.datos()) caja.replaceChildren(el("p", "font-semibold", "No pudimos leer Pareo Integral ahora mismo. Revisa la conexión y vuelve a abrir esta ventana.")); });
        if (!reloj) reloj = setInterval(revisar, REVISAR_MS);
      } else if (reloj) { clearInterval(reloj); reloj = null; }
    };
    new MutationObserver(alAbrirse).observe(dialogo, { attributes: true, attributeFilter: ["open"] });
    document.addEventListener("cac-datos", pintar);
    // Abierta antes de cargar este módulo (con la dirección #resultados-u12).
    if (dialogo.open) alAbrirse();
    return { pintar };
  }

  ["U12", "U20"].forEach(Ventana);
  window.JdnPzResultados = { torneo };
  // Los torneos se leen una vez al cargar: así la profe Karina
  // (js/jdn-pz-profe.js) sabe si ya están publicados, y las ventanas abren
  // con los datos a mano. Son dos torneos chicos.
  V.pedir().catch(() => {});
})();

/*! rev bfb5bbb0d2d82f9f */
