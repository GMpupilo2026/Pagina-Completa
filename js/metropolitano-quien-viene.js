/* Ajedrez Integral — «¿Quién viene?» en la página del Metropolitano 2026.
 *
 * Los jugadores ya inscritos en cada torneo (A, B, U14 y blitz), con su
 * título, su federación y su Elo, ordenados por Elo. Los da la base
 * (public.metropolitano_quien_viene, sin cuenta): con su nombre salen solo
 * quienes autorizaron el uso de su nombre en la publicidad del torneo; los
 * demás solo se cuentan. Ningún contacto, documento ni foto sale de ahí.
 *
 * Una ficha en «Todo el torneo» y su ventana, en español, inglés y francés
 * (lo pinta este módulo en el idioma de la página: va con data-no-traducir).
 * Ver «¿Quién viene?» en docs/decisiones/cuentas-y-formularios.md.
 */
window.MetroQuienViene = (function () {
  "use strict";
  const TX = {
    es: {
      titulo: "¿Quién viene?", ficha: "Los jugadores ya inscritos en cada torneo, con su título, su federación y su Elo.", accion: "Ver la lista →",
      cerrar: "Cerrar", cargando: "Leyendo la lista…", error: "No se pudo leer la lista. Vuelve a intentarlo en un momento.",
      vacio: "Todavía no hay jugadores inscritos en este torneo.", cols: ["Jugador", "Federación", "Elo", "Delegación o club"],
      total: (n) => (n === 1 ? "1 jugador inscrito" : n + " jugadores inscritos"),
      ocultos: (k) => (k === 1 ? "y 1 más que no autorizó publicar su nombre." : "y " + k + " más que no autorizaron publicar su nombre."),
      nota: "Salen con su nombre los jugadores que autorizaron el uso de su nombre en la publicidad del torneo; los demás solo se cuentan.",
      inscribete: "¿Todavía no te inscribes? Inscríbete →", sinElo: "sin Elo", torneos: "Torneos",
    },
    en: {
      titulo: "Who is coming?", ficha: "The players already registered in each tournament, with their title, federation and rating.", accion: "See the list →",
      cerrar: "Close", cargando: "Reading the list…", error: "The list could not be read. Try again in a moment.",
      vacio: "No players are registered in this tournament yet.", cols: ["Player", "Federation", "Rating", "Delegation or club"],
      total: (n) => (n === 1 ? "1 player registered" : n + " players registered"),
      ocultos: (k) => (k === 1 ? "and 1 more who did not authorise publishing their name." : "and " + k + " more who did not authorise publishing their name."),
      nota: "Players appear by name if they authorised the use of their name in the tournament's publicity; the others are only counted.",
      inscribete: "Not registered yet? Register →", sinElo: "unrated", torneos: "Tournaments",
    },
    fr: {
      titulo: "Qui vient ?", ficha: "Les joueurs déjà inscrits dans chaque tournoi, avec leur titre, leur fédération et leur Elo.", accion: "Voir la liste →",
      cerrar: "Fermer", cargando: "Lecture de la liste…", error: "La liste n’a pas pu être lue. Réessayez dans un instant.",
      vacio: "Aucun joueur n’est encore inscrit dans ce tournoi.", cols: ["Joueur", "Fédération", "Elo", "Délégation ou club"],
      total: (n) => (n === 1 ? "1 joueur inscrit" : n + " joueurs inscrits"),
      ocultos: (k) => (k === 1 ? "et 1 autre qui n’a pas autorisé la publication de son nom." : "et " + k + " autres qui n’ont pas autorisé la publication de leur nom."),
      nota: "Les joueurs figurent avec leur nom s’ils ont autorisé son utilisation dans la publicité du tournoi ; les autres sont seulement comptés.",
      inscribete: "Pas encore inscrit ? Inscrivez-vous →", sinElo: "sans Elo", torneos: "Tournois",
    },
  };
  const ORDEN = ["A", "B", "U14", "BLITZ"];
  let datos = null, error = false, idioma = "es", torneo = "A";

  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }

  async function leer() {
    try {
      const { data, error: e } = await window.sb.rpc("metropolitano_quien_viene");
      if (e || !data || typeof data !== "object") throw e || new Error("sin datos");
      datos = data; error = false;
    } catch (e) { error = true; }
    pintarLista();
  }

  function pintarLista() {
    const T = TX[idioma] || TX.es;
    const cu = document.getElementById("quien-viene-cuerpo");
    if (!cu) return;
    cu.textContent = "";
    if (error) { cu.append(el("p", "", T.error)); return; }
    if (!datos) { cu.append(el("p", "", T.cargando)); return; }
    const R = window.MetropolitanoReglas;
    // Las pestañas: un botón por torneo, con cuántos van.
    const tabs = el("div", "flex flex-wrap gap-2 mb-3"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", T.torneos);
    ORDEN.forEach((t) => {
      const n = (datos[t] && datos[t].total) || 0;
      const b = el("button", "metro-boton", R.TORNEOS[t].nombre + " (" + n + ")"); b.type = "button";
      b.setAttribute("aria-pressed", t === torneo ? "true" : "false");
      b.addEventListener("click", () => { torneo = t; pintarLista(); const x = document.querySelector('#quien-viene-cuerpo [aria-pressed="true"]'); if (x) x.focus(); });
      tabs.append(b);
    });
    cu.append(tabs);
    const d = datos[torneo] || { total: 0, lista: [] };
    cu.append(el("p", "font-semibold", d.total ? T.total(d.total) : T.vacio));
    if (d.lista && d.lista.length) {
      const tabla = el("table", "w-full text-sm mt-2");
      const cap = el("caption", "sr-only", R.TORNEOS[torneo].nombre); tabla.append(cap);
      const th = el("thead"); const tr = el("tr");
      T.cols.forEach((c) => { const x = el("th", "text-left p-1 text-xs uppercase tracking-wide", c); x.scope = "col"; tr.append(x); });
      th.append(tr); tabla.append(th);
      const tb = el("tbody");
      d.lista.forEach((j, i) => {
        const f = el("tr", "border-t border-brand-100");
        f.append(el("td", "p-1", (i + 1) + ". " + (j.titulo ? j.titulo + " " : "") + j.nombre), el("td", "p-1", j.fed || "—"),
          el("td", "p-1", j.elo ? String(j.elo) : T.sinElo), el("td", "p-1", j.delegacion || ""));
        tb.append(f);
      });
      tabla.append(tb); cu.append(tabla);
    }
    const ocultos = d.total - ((d.lista && d.lista.length) || 0);
    if (ocultos > 0 && d.lista && d.lista.length) cu.append(el("p", "text-sm mt-2", T.ocultos(ocultos)));
    cu.append(el("p", "text-xs mt-3", T.nota));
    const a = el("a", "underline font-semibold mt-2 inline-block", T.inscribete); a.href = "inscripcion-metropolitano.html" + (idioma !== "es" ? "?lang=" + idioma : "");
    cu.append(a);
  }

  // La ficha y su ventana. La lista se lee al pintar la primera vez y al abrir la ficha.
  function pintarPagina(nuevo, cajaFicha) {
    idioma = TX[nuevo] ? nuevo : "es";
    const T = TX[idioma];
    let d = document.getElementById("quien-viene");
    if (!d) {
      d = el("dialog", "metro-ventana"); d.id = "quien-viene"; d.setAttribute("aria-labelledby", "quien-viene-titulo"); d.setAttribute("data-no-traducir", "");
      const cab = el("div", "metro-ventana-cabeza"); const h2 = el("h2"); h2.id = "quien-viene-titulo";
      const b = el("button", "metro-boton"); b.type = "button"; b.dataset.cerrar = ""; b.id = "quien-viene-cerrar";
      cab.append(h2, b);
      const cu = el("div", "metro-ventana-cuerpo"); cu.id = "quien-viene-cuerpo";
      d.append(cab, cu);
      document.querySelector("main").append(d);
      leer();
    }
    document.getElementById("quien-viene-titulo").textContent = "👥 " + T.titulo;
    document.getElementById("quien-viene-cerrar").textContent = T.cerrar;
    pintarLista();
    if (cajaFicha) {
      cajaFicha.textContent = "";
      const a = el("a", "metro-ficha"); a.href = "#quien-viene"; a.dataset.tono = "5";
      const e = el("span", "metro-ficha-emoji", "👥"); e.setAttribute("aria-hidden", "true");
      a.append(e, el("span", "metro-ficha-titulo", T.titulo), el("span", "metro-ficha-texto", T.ficha), el("span", "metro-ficha-accion", T.accion));
      a.addEventListener("click", () => leer());
      cajaFicha.append(a);
    }
  }

  return { TX, pintarPagina };
})();

/*! rev bfb5bbb0d2d82f9f */
