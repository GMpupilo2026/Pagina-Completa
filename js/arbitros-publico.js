/* El código de arbitros.html: la lista pública de árbitros de Costa Rica y
   «Buscar árbitro para un torneo».

   - Los datos salen de arbitros_cr_publico(), una función de la base que
     cualquiera puede llamar y que devuelve solo lo que ya es público: quién
     está en la lista de la Federación, su título de FIDE, su categoría
     nacional, si FIDE lo tiene activo y la fecha de su último torneo en Costa
     Rica válido para Elo. De los cursos, solo si tiene las 20 horas de
     actualización de los dos últimos años (art. 19), sin horas ni notas. Las
     tablas de la herramienta (arbitros-cr.html) siguen cerradas a quien no
     tiene la licencia.
   - «Buscar árbitro»: con el Elo del torneo, la división de los jugadores y
     cuántos son, dice qué categoría pide el Reglamento para Árbitros de la
     Federación (arts. 11, 13 y 15) y deja en la lista solo a quien la tiene.
     Un AF o un AI cuenta como A. En un torneo de FIDE, además, tiene que
     estar activo en FIDE (con licencia).
   - El que no arbitró en los últimos dos años sale al final; con la casilla
     marcada (lo que viene), no sale.

   Ver «La lista pública de árbitros» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    // La dirección y la clave pública de la base de la Academia, las mismas de
    // js/supabase-client.js: cargar ese cliente (y la librería entera) para una
    // sola llamada pesaría bastante más que la página.
    const URL_LISTA = "https://bgtijpimpcokxatxxbki.supabase.co/rest/v1/rpc/arbitros_cr_publico";
    const CLAVE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

    const TITULOS = { IA: "Árbitro Internacional", FA: "Árbitro FIDE", AN: "Árbitro Nacional" };
    // Qué tan alto llega cada uno para la regla de la categoría: un AF o un AI va con la A.
    const NIVEL = { C: 0, B: 1, A: 2 };
    const nivel = (a) => (a.titulo === "FA" || a.titulo === "IA" ? 3 : a.categoria in NIVEL ? NIVEL[a.categoria] : -1);
    let lista = [];

    const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const fecha = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };
    const masAnios = (iso, n) => (parseInt(iso.slice(0, 4), 10) + n) + iso.slice(4);
    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) { if (k === "class") n.className = v; else n.setAttribute(k, v); }
        for (const h of hijos) if (h != null) n.append(h instanceof Node ? h : String(h));
        return n;
    }

    /* Qué categoría pide el reglamento para ser principal o adjunto: la C llega
       hasta torneos solo de Elo nacional, de cuarta o tercera división y 30
       jugadores (art. 11); la B, hasta segunda división y 50 (art. 13); lo demás
       (Elo FIDE, primera división, campeonatos nacionales, más de 50) es de la A
       (art. 15). Un torneo sin Elo no lo regula. */
    function categoriaQuePide(elo, division, jugadores) {
        const n = Number(jugadores) || 0;
        if (!elo) return null;
        if (elo === "sin") return { minimo: -1, texto: "El reglamento regula los torneos válidos para Elo: para uno sin Elo, puede ser cualquier árbitro de la lista." };
        if (elo === "fide") return { minimo: 2, fide: true, texto: "Un torneo válido para Elo FIDE pide la categoría A, un Árbitro FIDE o un Árbitro Internacional como principal o adjunto (arts. 11, 13 y 15), activo en FIDE. Según el evento, el reglamento de FIDE puede pedir un título mayor." };
        if (division === "nacional") return { minimo: 2, texto: "Un campeonato nacional pide la categoría A, un Árbitro FIDE o un Árbitro Internacional como principal o adjunto (art. 15)." };
        if (division === "1") return { minimo: 2, texto: "Con jugadores de primera división pide la categoría A, un Árbitro FIDE o un Árbitro Internacional: la B llega hasta segunda división (art. 13)." };
        if (n > 50) return { minimo: 2, texto: `Con ${n} jugadores pide la categoría A, un Árbitro FIDE o un Árbitro Internacional: la B llega hasta 50 (art. 13).` };
        if (division === "2") return { minimo: 1, texto: "Con jugadores de segunda división pide la categoría B o más: la C llega hasta tercera división (art. 11)." };
        if (n > 30) return { minimo: 1, texto: `Con ${n} jugadores pide la categoría B o más: la C llega hasta 30 (art. 11).` };
        return { minimo: 0, texto: "Un torneo solo de Elo nacional, de cuarta o tercera división y de hasta 30 jugadores lo puede dirigir cualquier categoría, desde la C (art. 11)." };
    }

    function pintar() {
        const pide = categoriaQuePide($("ar-elo").value, $("ar-division").value, $("ar-jugadores").value);
        const q = sinTildes($("ar-texto").value.trim());
        const desde = masAnios(window.HoraCR.hoy(), -2);
        const reciente = (a) => !!a.ultimo_torneo && a.ultimo_torneo >= desde;
        const filas = lista.filter((a) => (!q || sinTildes(a.nombre + " " + a.fide_id).includes(q))
            && (!pide || (nivel(a) >= pide.minimo && (!pide.fide || a.activo_fide)))
            && (!pide || !$("ar-recientes").checked || reciente(a)))
            // Quien arbitró hace poco primero; después, el título y la categoría más altos.
            .sort((x, y) => (reciente(y) - reciente(x)) || (nivel(y) - nivel(x)) || String(y.ultimo_torneo || "").localeCompare(String(x.ultimo_torneo || "")) || x.nombre.localeCompare(y.nombre, "es"));
        $("ar-pide").textContent = pide ? pide.texto + " Cualquier categoría puede trabajar como árbitro bajo la supervisión de uno con licencia FIDE." : "";
        const td = (v) => el("td", { class: "px-3 py-2 align-top" }, v);
        $("ar-tabla").tBodies[0].replaceChildren(...(filas.length ? filas.map((a) => el("tr", { class: "border-t border-brand-100 dark:border-brand-800", "data-fide": String(a.fide_id) },
            el("th", { scope: "row", class: "px-3 py-2 align-top font-normal text-left" },
                el("a", { href: "https://ratings.fide.com/profile/" + a.fide_id, target: "_blank", rel: "noopener", class: "font-semibold underline underline-offset-2 hover:no-underline" }, a.nombre),
                el("span", { class: "block text-xs text-brand-500 dark:text-brand-300" }, "ID FIDE " + a.fide_id)),
            td(TITULOS[a.titulo] || a.titulo || "—"), td(a.categoria || "—"), td(a.activo_fide ? "Activo" : "Inactivo"),
            td(a.ultimo_torneo ? fecha(a.ultimo_torneo) : "Ninguno registrado"), td(a.curso_al_dia ? "Al día" : "No consta")))
            : [el("tr", {}, el("td", { colspan: "6", class: "px-3 py-2 text-brand-500 dark:text-brand-300" },
                pide ? "Nadie de la lista cumple con eso. Prueba sin marcar «Solo quienes arbitraron en los últimos dos años»." : "Nadie con ese nombre en la lista."))]));
        $("ar-cuenta").textContent = pide
            ? `${filas.length} ${filas.length === 1 ? "árbitro puede" : "árbitros pueden"} ser principal o adjunto en ese torneo.`
            : `${lista.length} árbitros en la lista de la Federación; ${lista.filter(reciente).length} arbitraron en Costa Rica en los últimos dos años.`;
        // La división y los jugadores solo cuentan en un torneo de Elo nacional; la casilla, en cuanto se busca.
        $("ar-division").disabled = $("ar-jugadores").disabled = !pide || pide.minimo < 0 || !!pide.fide;
        $("ar-recientes").disabled = !pide;
    }

    async function init() {
        try {
            const r = await fetch(URL_LISTA, { method: "POST", headers: { apikey: CLAVE, "Content-Type": "application/json" }, body: "{}" });
            if (!r.ok) throw new Error(String(r.status));
            lista = await r.json();
            if (!Array.isArray(lista) || !lista.length) throw new Error("lista vacía");
        } catch (e) {
            $("ar-estado").textContent = "No se pudo leer la lista. Vuelve a cargar la página en un rato.";
            return;
        }
        $("ar-estado").textContent = "";
        $("ar-leida").textContent = fecha(lista[0].lista);
        for (const id of ["ar-elo", "ar-division", "ar-recientes"]) $(id).addEventListener("change", pintar);
        for (const id of ["ar-jugadores", "ar-texto"]) $(id).addEventListener("input", pintar);
        pintar();
    }
    init();
})();
