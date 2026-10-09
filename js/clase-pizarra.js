/* El código de sesion.html.

   La pizarra de la presentación: el profe dibuja ENCIMA de la diapositiva que
   muestra (lápiz, línea, flecha, círculo, resaltador, borrador) y toda la
   clase —alumnos, proyector, quien supervisa— ve las mismas marcas en el
   mismo punto de la lámina. Sirve para subrayar, unir dos ideas con una
   flecha o dejar una guía mientras explica.

   Las marcas van en la misma columna que dice qué diapositiva se ve,
   game_state.presentacion.trazos, y no en un mensaje suelto: quien entra
   tarde o recarga ve la lámina CON sus marcas. Esa columna ya la protege
   protect_game_state_teacher_columns (un alumno no la cambia) y el CHECK
   game_state_presentacion_tamano le pone tope. Cada trazo es
   {h: herramienta, c: color, p: [x, y, x, y…]}, con x e y de 0 a 1000 sobre
   el ancho y el alto de la IMAGEN: la misma marca cae en el mismo lugar en una
   pantalla grande, en un celular o a pantalla completa. Se manda al soltar
   cada trazo, no mientras se dibuja.

   Las marcas son de la diapositiva: al pasar a otra se van, y al volver
   aparecen de nuevo (el profe las recuerda en su pantalla mientras dure la
   página). Al cerrar la clase se limpian con la presentación.

   Ver «La pizarra de la presentación» en docs/decisiones/clase-en-vivo.md. */

window.Pizarra = (function () {
    const HERRAMIENTAS = ["lapiz", "linea", "flecha", "circulo", "resaltador"];
    // El contraste de cada color contra la diapositiva lo mide
    // verificar-clase-presentacion.js (3:1 como mínimo, el de un gráfico):
    // los cuatro primeros contra el blanco, el blanco contra el negro (para
    // las láminas oscuras). El amarillo es solo para el resaltador, que va
    // DEBAJO de lo que se resalta. El nombre va siempre escrito en su botón.
    const COLORES = [
        { clave: "rojo", nombre: "Rojo", hex: "#dc2626" },
        { clave: "azul", nombre: "Azul", hex: "#1d4ed8" },
        { clave: "verde", nombre: "Verde", hex: "#15803d" },
        { clave: "negro", nombre: "Negro", hex: "#111827" },
        { clave: "blanco", nombre: "Blanco", hex: "#ffffff" },
        { clave: "amarillo", nombre: "Amarillo", hex: "#facc15" },
    ];
    const MAX_TRAZOS = 60;
    const MAX_PUNTOS = 200;          // por trazo de lápiz; al llegar, sigue en otro
    const MAX_TEXTO = 30000;         // lo que pesan todas las marcas de una lámina (la base admite 60 000 en la columna)
    const DE_DOS_PUNTOS = { linea: true, flecha: true, circulo: true };

    const color = (clave) => (COLORES.find((c) => c.clave === clave) || COLORES[0]).hex;

    // Lo que llega de la base se dibuja solo si tiene esta forma; lo demás se
    // descarta trazo por trazo. Devuelve copias con las claves en un orden fijo
    // (el eco de Realtime se compara como texto con lo que mandó el profe).
    function limpiar(trazos) {
        if (!Array.isArray(trazos)) return [];
        const out = [];
        for (const t of trazos.slice(0, MAX_TRAZOS)) {
            if (!t || typeof t !== "object" || !HERRAMIENTAS.includes(t.h)) continue;
            if (!COLORES.some((c) => c.clave === t.c) || !Array.isArray(t.p)) continue;
            const p = t.p;
            const largoBien = DE_DOS_PUNTOS[t.h] ? p.length === 4 : p.length >= 2 && p.length <= MAX_PUNTOS * 2 && p.length % 2 === 0;
            if (!largoBien || !p.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000)) continue;
            out.push({ h: t.h, c: t.c, p: p.slice() });
        }
        return out;
    }

    const NS = "http://www.w3.org/2000/svg";
    function el(nombre, attrs) {
        const e = document.createElementNS(NS, nombre);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    }

    // Un trazo, en unidades del viewBox (ancho 1000, alto alto).
    function dibujo(t, alto) {
        const y = (v) => Math.round(v * alto) / 1000;
        const hex = color(t.c);
        const p = t.p;
        const grueso = { stroke: hex, "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" };
        if (t.h === "lapiz" || t.h === "resaltador") {
            const pts = [];
            for (let i = 0; i < p.length; i += 2) pts.push(p[i] + "," + y(p[i + 1]));
            if (pts.length === 1) pts.push(pts[0]); // un toque: un punto
            const attrs = Object.assign({}, grueso, { points: pts.join(" ") });
            if (t.h === "resaltador") Object.assign(attrs, { "stroke-width": 22, "stroke-opacity": 0.4 });
            return el("polyline", attrs);
        }
        const x1 = p[0], y1 = y(p[1]), x2 = p[2], y2 = y(p[3]);
        if (t.h === "circulo") {
            return el("ellipse", Object.assign({}, grueso, {
                cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2,
            }));
        }
        const linea = el("line", Object.assign({}, grueso, { x1, y1, x2, y2 }));
        if (t.h === "linea") return linea;
        // La flecha: la línea y su punta, un triángulo en la dirección del trazo.
        const g = el("g", {});
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const largo = 26, ancho = 13;
        const bx = x2 - largo * Math.cos(ang), by = y2 - largo * Math.sin(ang);
        linea.setAttribute("x2", bx);
        linea.setAttribute("y2", by);
        const punta = [
            [x2, y2],
            [bx + ancho * Math.sin(ang), by - ancho * Math.cos(ang)],
            [bx - ancho * Math.sin(ang), by + ancho * Math.cos(ang)],
        ].map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ");
        g.append(linea, el("polygon", { points: punta, fill: hex }));
        return g;
    }

    // Qué tan lejos queda un punto (en unidades 0-1000) de un trazo: para el borrador.
    function distancia(t, x, y) {
        const seg = (ax, ay, bx, by) => {
            const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
            const k = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
            return Math.hypot(x - (ax + k * dx), y - (ay + k * dy));
        };
        const p = t.p;
        if (t.h === "circulo") {
            const cx = (p[0] + p[2]) / 2, cy = (p[1] + p[3]) / 2, rx = Math.abs(p[2] - p[0]) / 2, ry = Math.abs(p[3] - p[1]) / 2;
            let min = Infinity;
            for (let i = 0; i < 48; i++) {
                const a = (i / 48) * 2 * Math.PI;
                min = Math.min(min, Math.hypot(x - (cx + rx * Math.cos(a)), y - (cy + ry * Math.sin(a))));
            }
            return min;
        }
        if (p.length === 2) return Math.hypot(x - p[0], y - p[1]);
        let min = Infinity;
        for (let i = 0; i + 3 < p.length; i += 2) min = Math.min(min, seg(p[i], p[i + 1], p[i + 2], p[i + 3]));
        return min;
    }

    return { HERRAMIENTAS, COLORES, MAX_TRAZOS, MAX_PUNTOS, MAX_TEXTO, DE_DOS_PUNTOS, limpiar, dibujo, distancia };
})();

let pizarraActiva = false;            // el profe: está dibujando (el SVG recibe el puntero)
let pizarraHerramienta = "lapiz";
let pizarraColor = "rojo";
let pizarraTrazos = [];               // las marcas que se ven ahora
let pizarraHistoria = [];             // el profe: lo que había antes de cada cambio, para «Deshacer»
let pizarraDe = null;                 // "deck:n" de la diapositiva a la que pertenecen
const pizarraMemoria = {};            // el profe: las marcas de cada diapositiva que ya marcó
let pizarraEnvio = null;

function pizarraClave(p) { return p ? p.deck + ":" + p.n : null; }
function pizarraDeMemoria(deck, n) { return (pizarraMemoria[deck + ":" + n] || []).slice(); }

function pizarraAlto() {
    const img = document.getElementById("presentacion-img");
    return img && img.naturalWidth ? Math.round(1000 * img.naturalHeight / img.naturalWidth) : 563;
}

/* Las marcas de la diapositiva que se ve (presentacionActual): lo llama
   pintarPresentacion con las de la base, y el profe con las que acaba de hacer. */
function pintarPizarra(trazos) {
    const clave = pizarraClave(presentacionActual);
    if (clave !== pizarraDe) { pizarraDe = clave; pizarraHistoria = []; }
    pizarraTrazos = Pizarra.limpiar(trazos);
    if (clave && presentacionEsDelProfe()) pizarraMemoria[clave] = pizarraTrazos.slice();
    dibujarPizarra();
    if (clave && pizarraTrazos.length) {
        anunciarALaClase("pizarra", clave, "Tu profe está marcando la diapositiva con la pizarra.");
    } else {
        anunciarALaClase("pizarra", null);
    }
    pintarPizarraBotones();
}

// Solo dibuja: la imagen nueva puede tener otra proporción, y el viewBox es el suyo.
function dibujarPizarra() {
    const svg = document.getElementById("presentacion-pizarra");
    const alto = pizarraAlto();
    svg.setAttribute("viewBox", "0 0 1000 " + alto);
    svg.replaceChildren(...pizarraTrazos.map((t) => Pizarra.dibujo(t, alto)));
}

function pintarPizarraBotones() {
    const deshacer = document.getElementById("pizarra-deshacer");
    if (!deshacer) return;
    deshacer.disabled = !pizarraHistoria.length;
    document.getElementById("pizarra-limpiar").disabled = !pizarraTrazos.length;
}

function avisoPizarra(texto) {
    const m = document.getElementById("pizarra-msg");
    if (m) m.textContent = texto || "";
}

/* Encender o apagar el dibujo. Apagarlo no borra nada: las marcas siguen a la vista. */
function ponerPizarraActiva(si) {
    pizarraActiva = !!si && presentacionEsDelProfe() && !modoProyector;
    const btn = document.getElementById("pizarra-btn");
    btn.setAttribute("aria-pressed", String(pizarraActiva));
    btn.lastChild.textContent = pizarraActiva ? "Pizarra: dibujando" : "Pizarra";
    document.getElementById("pizarra-herramientas").hidden = !pizarraActiva;
    const svg = document.getElementById("presentacion-pizarra");
    svg.classList.toggle("dibujando", pizarraActiva);
    svg.classList.toggle("borrando", pizarraActiva && pizarraHerramienta === "borrador");
    if (!pizarraActiva) avisoPizarra("");
}

/* Un cambio del profe: se ve en el acto y se manda a la base enseguida (no a
   cada movimiento del dedo: al soltar). Si se cambia de diapositiva antes,
   mostrarPresentacion se lleva las de la nueva y esto ya no manda nada viejo. */
function cambiarPizarra(nuevos) {
    if (JSON.stringify(nuevos).length > Pizarra.MAX_TEXTO) {
        avisoPizarra("Esta diapositiva ya tiene demasiadas marcas: borra alguna (o «Borrar todo») para seguir.");
        pintarPizarra(pizarraTrazos);
        return;
    }
    pizarraHistoria.push(pizarraTrazos);
    if (pizarraHistoria.length > 50) pizarraHistoria.shift();
    pintarPizarra(nuevos);
    const de = pizarraDe;
    clearTimeout(pizarraEnvio);
    pizarraEnvio = setTimeout(() => {
        if (!presentacionActual || pizarraClave(presentacionActual) !== de) return;
        mostrarPresentacion(Object.assign({}, presentacionActual, { trazos: pizarraTrazos }));
    }, 120);
}

function pizarraPunto(svg, e) {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(m.inverse());
    const alto = pizarraAlto();
    const x = Math.round(Math.max(0, Math.min(1000, q.x)));
    const y = Math.round(Math.max(0, Math.min(alto, q.y)) * 1000 / alto);
    return [x, Math.min(1000, y)];
}

function setupPizarra() {
    const svg = document.getElementById("presentacion-pizarra");
    const colores = document.getElementById("pizarra-colores");
    Pizarra.COLORES.forEach((c) => {
        const b = presentacionBoton("", "Dibujar en " + c.nombre.toLowerCase());
        b.dataset.pizarraColor = c.clave;
        b.setAttribute("aria-pressed", String(c.clave === pizarraColor));
        b.classList.add("inline-flex", "items-center", "gap-1", "aria-pressed:ring-2", "aria-pressed:ring-accent-500");
        const muestra = document.createElement("span");
        muestra.setAttribute("aria-hidden", "true");
        muestra.className = "inline-block w-3.5 h-3.5 rounded-full border border-brand-400";
        muestra.style.background = c.hex;
        b.append(muestra, document.createTextNode(c.nombre));
        colores.appendChild(b);
    });
    colores.addEventListener("click", (e) => {
        const b = e.target.closest("[data-pizarra-color]");
        if (!b) return;
        pizarraColor = b.dataset.pizarraColor;
        colores.querySelectorAll("[data-pizarra-color]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        // Elegir un color con el borrador puesto es querer volver a dibujar.
        if (pizarraHerramienta === "borrador") elegirHerramienta("lapiz");
    });
    function elegirHerramienta(h) {
        pizarraHerramienta = h;
        document.querySelectorAll("[data-pizarra-herramienta]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.pizarraHerramienta === h)));
        svg.classList.toggle("borrando", pizarraActiva && h === "borrador");
    }
    document.querySelectorAll("[data-pizarra-herramienta]").forEach((b) => {
        b.addEventListener("click", () => elegirHerramienta(b.dataset.pizarraHerramienta));
    });
    document.getElementById("pizarra-btn").addEventListener("click", () => ponerPizarraActiva(!pizarraActiva));
    document.getElementById("pizarra-deshacer").addEventListener("click", () => {
        if (!pizarraHistoria.length) return;
        const antes = pizarraHistoria.pop();
        const deshecha = pizarraHistoria.slice();
        cambiarPizarra(antes);
        pizarraHistoria = deshecha; // deshacer no se apila a sí mismo
        pintarPizarraBotones();
        avisoPizarra("Se deshizo la última marca.");
    });
    document.getElementById("pizarra-limpiar").addEventListener("click", () => {
        if (!pizarraTrazos.length) return;
        cambiarPizarra([]);
        avisoPizarra("Se borraron las marcas de esta diapositiva. «Deshacer» las trae de vuelta.");
    });
    document.getElementById("presentacion-img").addEventListener("load", dibujarPizarra);

    let trazo = null, vivo = null, borroAlgo = false, antesDeBorrar = null;
    const dibujarVivo = () => {
        const alto = pizarraAlto();
        const nuevo = Pizarra.dibujo(trazo, alto);
        if (vivo) vivo.replaceWith(nuevo); else svg.appendChild(nuevo);
        vivo = nuevo;
    };
    const borrarEn = (pt) => {
        const i = pizarraTrazos.findIndex((t) => Pizarra.distancia(t, pt[0], pt[1]) <= 14);
        if (i < 0) return;
        if (!borroAlgo) antesDeBorrar = pizarraTrazos;
        borroAlgo = true;
        pintarPizarra(pizarraTrazos.filter((_, j) => j !== i));
    };
    const terminar = () => {
        if (borroAlgo) {
            // Todo lo borrado de una pasada se deshace de una vez.
            const quedan = pizarraTrazos;
            pizarraTrazos = antesDeBorrar;
            cambiarPizarra(quedan);
            borroAlgo = false;
            return;
        }
        if (!trazo) return;
        const t = trazo;
        trazo = null;
        if (vivo) { vivo.remove(); vivo = null; }
        const p = t.p;
        if (Pizarra.DE_DOS_PUNTOS[t.h] && Math.hypot(p[2] - p[0], p[3] - p[1]) < 6) return; // un toque no es una línea
        if (pizarraTrazos.length >= Pizarra.MAX_TRAZOS) {
            avisoPizarra("Esta diapositiva ya tiene " + Pizarra.MAX_TRAZOS + " marcas: borra alguna (o «Borrar todo») para seguir.");
            return;
        }
        cambiarPizarra(pizarraTrazos.concat([t]));
    };
    svg.addEventListener("pointerdown", (e) => {
        if (!pizarraActiva || (e.pointerType === "mouse" && e.button !== 0)) return;
        const pt = pizarraPunto(svg, e);
        if (!pt) return;
        e.preventDefault();
        svg.setPointerCapture(e.pointerId);
        if (pizarraHerramienta === "borrador") { borroAlgo = false; borrarEn(pt); return; }
        trazo = { h: pizarraHerramienta, c: pizarraColor, p: Pizarra.DE_DOS_PUNTOS[pizarraHerramienta] ? pt.concat(pt) : pt.slice() };
        dibujarVivo();
    });
    svg.addEventListener("pointermove", (e) => {
        if (!pizarraActiva || !svg.hasPointerCapture(e.pointerId)) return;
        const pt = pizarraPunto(svg, e);
        if (!pt) return;
        if (pizarraHerramienta === "borrador") { borrarEn(pt); return; }
        if (!trazo) return;
        const p = trazo.p;
        if (Pizarra.DE_DOS_PUNTOS[trazo.h]) { p[2] = pt[0]; p[3] = pt[1]; dibujarVivo(); return; }
        if (Math.hypot(pt[0] - p[p.length - 2], pt[1] - p[p.length - 1]) < 4) return;
        p.push(pt[0], pt[1]);
        dibujarVivo();
        // Un trazo larguísimo sigue en otro, pegado: ninguno pasa del tope.
        if (p.length >= Pizarra.MAX_PUNTOS * 2) {
            const sigue = { h: trazo.h, c: trazo.c, p: pt.slice() };
            terminar();
            if (pizarraTrazos.length < Pizarra.MAX_TRAZOS) { trazo = sigue; dibujarVivo(); }
        }
    });
    svg.addEventListener("pointerup", terminar);
    svg.addEventListener("pointercancel", terminar);
}

setupPizarra();
