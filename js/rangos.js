/* Los rangos: suben con los Puntos Ajedrez GANADOS asistiendo y entrenando.

   Una sola copia de los nombres y de cuántos puntos pide cada uno. La base
   solo da los puntos ganados (public.puntos_ganados_de, que cuenta clase,
   entrenamiento, tareas, exámenes, racha, retos y temas terminados): no el
   saldo, así que canjear un premio no te baja de rango, y lo que se devuelve
   de un canje cancelado o lo que llega de regalo no te sube. La idea es de
   Chessgora («sube de rango al asistir y entrenar»). Ver «Los rangos» en
   docs/decisiones/puntos-y-premios.md.

   Rangos.de(ganados) → { actual, siguiente, faltan, progreso (0 a 1) }
   Rangos.pintar(caja, ganados): el rango con su pieza, el número escrito y
   la barra hasta el siguiente (la barra es adorno: el dato va escrito). */
(function (raiz) {
    "use strict";

    const RANGOS = [
        { id: "peon", nombre: "Peón", pieza: "♙", desde: 0 },
        { id: "caballo", nombre: "Caballo", pieza: "♘", desde: 1000 },
        { id: "alfil", nombre: "Alfil", pieza: "♗", desde: 3000 },
        { id: "torre", nombre: "Torre", pieza: "♖", desde: 7000 },
        { id: "dama", nombre: "Dama", pieza: "♕", desde: 15000 },
        { id: "rey", nombre: "Rey", pieza: "♔", desde: 30000 },
    ];

    function de(ganados) {
        const g = Math.max(0, Number(ganados) || 0);
        let i = 0;
        while (i + 1 < RANGOS.length && g >= RANGOS[i + 1].desde) i += 1;
        const actual = RANGOS[i], siguiente = RANGOS[i + 1] || null;
        return {
            actual, siguiente,
            faltan: siguiente ? siguiente.desde - g : 0,
            progreso: siguiente ? (g - actual.desde) / (siguiente.desde - actual.desde) : 1,
        };
    }

    const fmt = (n) => new Intl.NumberFormat("es-CR").format(n);

    function pintar(caja, ganados) {
        const r = de(ganados);
        caja.replaceChildren();
        const fila = document.createElement("div");
        fila.className = "flex items-center gap-4";
        const pieza = document.createElement("span");
        pieza.className = "text-5xl leading-none text-brand-800 dark:text-white";
        pieza.setAttribute("aria-hidden", "true");
        pieza.textContent = r.actual.pieza;
        const texto = document.createElement("div");
        texto.className = "min-w-0 flex-1";
        const nombre = document.createElement("p");
        nombre.className = "text-xl font-bold text-brand-800 dark:text-white";
        nombre.setAttribute("data-rango", r.actual.id);
        nombre.textContent = "Rango: " + r.actual.nombre;
        const detalle = document.createElement("p");
        detalle.className = "text-sm text-brand-600 dark:text-brand-200";
        detalle.setAttribute("data-rango-detalle", "");
        detalle.textContent = fmt(ganados || 0) + " puntos ganados. " + (r.siguiente
            ? "Te faltan " + fmt(r.faltan) + " para " + r.siguiente.nombre + "."
            : "Llegaste al rango más alto.");
        texto.append(nombre, detalle);
        if (r.siguiente) {
            const barra = document.createElement("progress");
            barra.className = "mt-2 w-full h-2 accent-accent-500";
            barra.max = r.siguiente.desde - r.actual.desde;
            barra.value = (ganados || 0) - r.actual.desde;
            barra.setAttribute("aria-label", "Camino a " + r.siguiente.nombre);
            texto.appendChild(barra);
        }
        fila.append(pieza, texto);
        const escala = document.createElement("p");
        escala.className = "text-xs text-brand-500 dark:text-brand-300 mt-3";
        escala.textContent = "Los rangos: " + RANGOS.map((x) => x.nombre + " (" + fmt(x.desde) + ")").join(" · ")
            + ". Cuentan los puntos que ganas asistiendo y entrenando: canjear un premio no te baja de rango.";
        caja.append(fila, escala);
        return r;
    }

    raiz.Rangos = { RANGOS, de, pintar };
    if (typeof module !== "undefined" && module.exports) module.exports = raiz.Rangos;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
