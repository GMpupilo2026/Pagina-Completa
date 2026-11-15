/* Las ilustraciones de las tarjetas de la vitrina de herramientas de
   arbitraje (herramientas-arbitraje.html): una por herramienta, que muestra
   de un vistazo QUÉ HACE (lo que entra y lo que sale), con los colores del
   sitio.

   Cada escena es un SVG de 1200×675 armado con las piezas de abajo; Playwright
   lo pinta y lo guarda en img/herramientas/<id>.png. Los PNG se commitean:
   esto se corre a mano solo cuando se cambia un dibujo (no lo corre el CI).

     node herramientas/generar-imagenes-herramientas.js          (todas)
     node herramientas/generar-imagenes-herramientas.js pareo    (una)

   Al final se pasan a una paleta de 256 colores con Pillow (python): son
   dibujos planos, no se nota y cada una baja de ~165 KB a ~60 KB.

   Los textos van grandes (la tarjeta muestra la imagen a ~1/3 de su tamaño) y
   pocos: la tarjeta ya trae el título y la descripción. Nadie real sale en
   ellas: los números y las filas son de muestra. Las herramientas que tienen
   foto no están acá (Notara, Pareo Integral, Pareo para DGT, la Mesa del
   árbitro y el Aula de Arbitraje: img/herramientas/*.jpg). Ver «Herramientas
   de arbitraje» en docs/decisiones/juegos-y-torneos.md. */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "img", "herramientas");
const W = 1200, H = 675;

const C = {
    navy: "#102A43", navy2: "#243B53", mid: "#486581", soft: "#829AB1", line: "#BCCCDC",
    light: "#D9E2EC", bg: "#F0F4F8", white: "#FFFFFF",
    gold: "#F0B429", gold2: "#DE911D", goldL: "#FCEFC7",
    green: "#27AB83", green2: "#147D64", greenL: "#C6F7E2",
    red: "#E12D39", redL: "#FFE3E3", blue: "#2680C2", blueL: "#DCEEFB",
    purple: "#724BB7", purpleL: "#EAE2F8",
    silver: "#9FB3C8", bronze: "#C77D3A",
    sqL: "#F0D9B5", sqD: "#B58863",
};
const F = "Segoe UI, Arial, sans-serif";
const FP = "Segoe UI Symbol, DejaVu Sans, sans-serif";

/* El color de cada tema, el mismo para todas sus herramientas. */
const TEMA = {
    arbitraje: { a: C.gold, l: C.goldL },
    jde: { a: C.green, l: C.greenL },
    jdn: { a: C.blue, l: C.blueL },
    universitarios: { a: C.purple, l: C.purpleL },
    clubes: { a: C.navy2, l: C.light },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------- Piezas de dibujo ---------- */

function t(x, y, s, o = {}) {
    const { size = 32, w = 600, fill = C.navy, a = "start", f = F, extra = "" } = o;
    return `<text x="${x}" y="${y}" font-family="${f}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${a}" ${extra}>${esc(s)}</text>`;
}
function card(x, y, w, h, o = {}) {
    const { fill = C.white, r = 22, stroke = null, sombra = true } = o;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="3"` : ""} ${sombra ? 'filter="url(#sh)"' : ""}/>`;
}
const rect = (x, y, w, h, fill, r = 0, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const circ = (x, y, r, fill, extra = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const bar = (x, y, w, h = 14, fill = C.light) => rect(x, y, w, h, fill, h / 2);

function pill(x, y, s, o = {}) {
    const { fill = C.navy, color = C.white, size = 26, pad = 18, h = 46, a = "start" } = o;
    const w = Math.round(s.length * size * 0.58 + pad * 2);
    const x0 = a === "middle" ? x - w / 2 : a === "end" ? x - w : x;
    return rect(x0, y, w, h, fill, h / 2) + t(x0 + w / 2, y + h / 2 + size * 0.36, s, { size, w: 700, fill: color, a: "middle" });
}

function flecha(x1, y1, x2, y2, o = {}) {
    const { color = C.mid, ancho = 8, curva = 0 } = o;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - curva;
    return `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="${ancho}" stroke-linecap="round" marker-end="url(#punta-${color.slice(1)})"/>`;
}

function check(x, y, r = 22, fill = C.green) {
    return circ(x, y, r, fill) + `<path d="M${x - r * 0.45},${y + r * 0.02} L${x - r * 0.1},${y + r * 0.38} L${x + r * 0.5},${y - r * 0.35}" fill="none" stroke="#fff" stroke-width="${r * 0.26}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function pieza(x, y, size, glifo, color = "w") {
    const fill = color === "w" ? C.white : C.navy;
    const stroke = color === "w" ? C.navy : C.navy;
    return `<text x="${x}" y="${y}" font-family="${FP}" font-size="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${color === "w" ? size * 0.035 : size * 0.01}" paint-order="stroke" text-anchor="middle" dominant-baseline="central">${glifo}&#xFE0E;</text>`;
}

/* Un tablero de n×n desde (x,y). piezas: [col, fila, glifo, color]; marcas: [col, fila, color]. */
function tablero(x, y, sq, n = 8, piezas = [], marcas = [], o = {}) {
    let s = "";
    if (o.marco !== false) s += rect(x - sq * 0.18, y - sq * 0.18, sq * n + sq * 0.36, sq * n + sq * 0.36, o.marcoColor || C.navy2, sq * 0.2, 'filter="url(#sh)"');
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) s += rect(x + c * sq, y + f * sq, sq, sq, (c + f) % 2 ? C.sqD : C.sqL);
    marcas.forEach(([c, f, col]) => { s += rect(x + c * sq, y + f * sq, sq, sq, col, 0, 'opacity="0.75"'); });
    piezas.forEach(([c, f, g, col]) => { s += pieza(x + c * sq + sq / 2, y + f * sq + sq / 2 + sq * 0.04, sq * 0.95, g, col); });
    return s;
}

function enlace(x, y, w, s = "chess-results.com", o = {}) {
    const h = o.h || 64;
    return card(x, y, w, h, { r: h / 2 }) +
        circ(x + 34, y + h / 2, 14, "none", `stroke="${C.mid}" stroke-width="5"`) +
        `<path d="M${x + 24},${y + h / 2} h20 M${x + 34},${y + h / 2 - 14} q-9,14 0,28 M${x + 34},${y + h / 2 - 14} q9,14 0,28" stroke="${C.mid}" stroke-width="3" fill="none"/>` +
        t(x + 62, y + h / 2 + 10, s, { size: o.size || 28, w: 600, fill: C.mid });
}

function documento(x, y, w, h, o = {}) {
    const dobl = Math.min(60, w * 0.22);
    let s = `<path d="M${x + 16},${y} H${x + w - dobl} L${x + w},${y + dobl} V${y + h - 16} Q${x + w},${y + h} ${x + w - 16},${y + h} H${x + 16} Q${x},${y + h} ${x},${y + h - 16} V${y + 16} Q${x},${y} ${x + 16},${y} Z" fill="${o.fill || C.white}" filter="url(#sh)"/>`;
    s += `<path d="M${x + w - dobl},${y} V${y + dobl - 10} Q${x + w - dobl},${y + dobl} ${x + w - dobl + 10},${y + dobl} H${x + w} Z" fill="${C.light}"/>`;
    if (o.lineas !== false) {
        const y0 = y + (o.y0 || 90), paso = o.paso || 34, n = o.n || Math.floor((h - (o.y0 || 90) - 40) / paso);
        for (let i = 0; i < n; i++) s += bar(x + 36, y0 + i * paso, (w - 72) * (i % 3 === 2 ? 0.62 : i % 4 === 1 ? 0.85 : 1), 12, C.light);
    }
    return s;
}

function medalla(x, y, r, color, n) {
    let s = `<path d="M${x - r * 0.7},${y - r * 2.1} L${x - r * 0.15},${y - r * 0.6} L${x + r * 0.15},${y - r * 0.6} L${x + r * 0.7},${y - r * 2.1}" fill="${C.blue}" stroke="${C.blue}" stroke-width="${r * 0.5}" stroke-linejoin="round"/>`;
    s += circ(x, y, r, color, `stroke="#fff" stroke-width="${r * 0.14}"`);
    if (n != null) s += t(x, y + r * 0.38, n, { size: r * 1.05, w: 800, fill: "#fff", a: "middle" });
    return s;
}

function podio(x, y, ancho, o = {}) {
    const a = ancho / 3, s1 = o.alto || 150;
    const alturas = [s1 * 0.68, s1, s1 * 0.48];
    const colores = [C.silver, C.gold, C.bronze];
    const nums = ["2", "1", "3"];
    let s = "";
    for (let i = 0; i < 3; i++) {
        const h = alturas[i], xx = x + i * a;
        s += rect(xx + 4, y - h, a - 8, h, colores[i], 10, 'filter="url(#sh)"');
        const tam = o.tam || 46;
        s += t(xx + a / 2, y - h + tam * 1.1, nums[i], { size: tam, w: 800, fill: "#fff", a: "middle" });
        if (o.piezas) s += pieza(xx + a / 2, y - h - a * 0.32, a * 0.62, o.piezas[i], o.colores ? o.colores[i] : "w");
        else s += circ(xx + a / 2, y - h - a * 0.3, a * 0.2, colores[i], `stroke="#fff" stroke-width="4"`);
    }
    return s;
}

function edificio(x, y, w, h, o = {}) {
    // Un edificio con columnas y frontón (universidad) o con techo y bandera (colegio).
    const col = o.color || C.navy2;
    let s = "";
    if (o.tipo === "colegio") {
        s += rect(x, y + h * 0.3, w, h * 0.7, col, 8, 'filter="url(#sh)"');
        s += `<path d="M${x - 14},${y + h * 0.32} L${x + w / 2},${y + h * 0.02} L${x + w + 14},${y + h * 0.32} Z" fill="${o.techo || C.red}"/>`;
        s += rect(x + w / 2 - 3, y - h * 0.22, 6, h * 0.26, C.navy);
        s += `<path d="M${x + w / 2 + 3},${y - h * 0.22} h${w * 0.24} l-10,${h * 0.06} l10,${h * 0.06} h-${w * 0.24} Z" fill="${o.bandera || C.gold}"/>`;
        const vw = w * 0.16;
        for (let i = 0; i < 3; i++) s += rect(x + w * 0.12 + i * w * 0.29, y + h * 0.45, vw, vw, C.blueL, 4);
        s += rect(x + w / 2 - w * 0.1, y + h * 0.72, w * 0.2, h * 0.28, C.gold2, 4);
    } else {
        s += `<path d="M${x - 10},${y + h * 0.28} L${x + w / 2},${y} L${x + w + 10},${y + h * 0.28} Z" fill="${col}"/>`;
        s += rect(x, y + h * 0.28, w, h * 0.08, col);
        const n = 4, cw = w * 0.11;
        for (let i = 0; i < n; i++) s += rect(x + w * 0.08 + i * (w * 0.84 - cw) / (n - 1), y + h * 0.38, cw, h * 0.5, C.white, 3, `stroke="${col}" stroke-width="4"`);
        s += rect(x - 10, y + h * 0.88, w + 20, h * 0.12, col, 4);
    }
    return s;
}

function birrete(x, y, s, color = C.navy) {
    return `<path d="M${x - s},${y} L${x},${y - s * 0.45} L${x + s},${y} L${x},${y + s * 0.45} Z" fill="${color}"/>` +
        `<path d="M${x - s * 0.55},${y + s * 0.2} v${s * 0.4} q${s * 0.55},${s * 0.35} ${s * 1.1},0 v-${s * 0.4}" fill="${color}"/>` +
        `<path d="M${x + s * 0.8},${y + s * 0.08} v${s * 0.55}" stroke="${C.gold}" stroke-width="${s * 0.1}" stroke-linecap="round"/>` + circ(x + s * 0.8, y + s * 0.68, s * 0.1, C.gold);
}

function escudo(x, y, w, color, letra) {
    const h = w * 1.15;
    return `<path d="M${x},${y} H${x + w} V${y + h * 0.5} Q${x + w},${y + h * 0.85} ${x + w / 2},${y + h} Q${x},${y + h * 0.85} ${x},${y + h * 0.5} Z" fill="${color}" filter="url(#sh)"/>` +
        `<path d="M${x + w * 0.12},${y + h * 0.1} H${x + w * 0.88} V${y + h * 0.48} Q${x + w * 0.88},${y + h * 0.76} ${x + w / 2},${y + h * 0.88} Q${x + w * 0.12},${y + h * 0.76} ${x + w * 0.12},${y + h * 0.48} Z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="4"/>` +
        (letra ? t(x + w / 2, y + h * 0.56, letra, { size: w * 0.42, w: 800, fill: "#fff", a: "middle" }) : "");
}

function reloj(x, y, r, o = {}) {
    return circ(x, y, r, o.fill || C.white, `stroke="${o.color || C.navy}" stroke-width="${r * 0.14}"`) +
        `<path d="M${x},${y} V${y - r * 0.6} M${x},${y} L${x + r * 0.45},${y + r * 0.2}" stroke="${o.color || C.navy}" stroke-width="${r * 0.13}" stroke-linecap="round"/>`;
}

function lupa(x, y, r, color = C.navy) {
    return circ(x, y, r, C.white, `stroke="${color}" stroke-width="${r * 0.22}" fill-opacity=".85"`) +
        `<path d="M${x + r * 0.72},${y + r * 0.72} L${x + r * 1.6},${y + r * 1.6}" stroke="${color}" stroke-width="${r * 0.34}" stroke-linecap="round"/>`;
}

function persona(x, y, r, color = C.mid) {
    return circ(x, y - r * 0.35, r * 0.42, color) + `<path d="M${x - r * 0.75},${y + r * 0.85} Q${x - r * 0.75},${y + r * 0.15} ${x},${y + r * 0.15} Q${x + r * 0.75},${y + r * 0.15} ${x + r * 0.75},${y + r * 0.85} Z" fill="${color}"/>`;
}

function avatar(x, y, r, fondo = C.blueL, color = C.blue) {
    return `<clipPath id="av${x}_${y}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>` + circ(x, y, r, fondo) +
        `<g clip-path="url(#av${x}_${y})">${persona(x, y + r * 0.25, r * 1.1, color)}</g>`;
}

function barras(x, y, w, h, valores, colores, o = {}) {
    const n = valores.length, g = w / n, bw = g * (o.grosor || 0.62), max = o.max || Math.max(...valores);
    let s = `<path d="M${x},${y + h} H${x + w}" stroke="${C.line}" stroke-width="4"/>`;
    valores.forEach((v, i) => {
        const bh = (v / max) * h;
        s += rect(x + i * g + (g - bw) / 2, y + h - bh, bw, bh, Array.isArray(colores) ? colores[i % colores.length] : colores, Math.min(10, bw / 4));
        if (o.etiquetas) s += t(x + i * g + g / 2, y + h + 38, o.etiquetas[i], { size: o.tam || 24, w: 600, fill: C.mid, a: "middle" });
    });
    return s;
}

function linea(x, y, w, h, valores, color, o = {}) {
    const max = o.max ?? Math.max(...valores), min = o.min ?? Math.min(...valores);
    const pts = valores.map((v, i) => [x + (i / (valores.length - 1)) * w, y + h - ((v - min) / (max - min || 1)) * h]);
    let s = "";
    if (o.area) s += `<path d="M${pts.map((p) => p.join(",")).join(" L")} L${x + w},${y + h} L${x},${y + h} Z" fill="${color}" opacity=".15"/>`;
    s += `<path d="M${pts.map((p) => p.join(",")).join(" L")}" fill="none" stroke="${color}" stroke-width="${o.ancho || 7}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (o.puntos !== false) pts.forEach(([px, py]) => { s += circ(px, py, o.r || 8, "#fff", `stroke="${color}" stroke-width="5"`); });
    return s;
}

function calendario(x, y, w, mes, dia) {
    const h = w * 1.05;
    return card(x, y, w, h, { r: 18 }) + `<path d="M${x},${y + 18} Q${x},${y} ${x + 18},${y} H${x + w - 18} Q${x + w},${y} ${x + w},${y + 18} V${y + h * 0.3} H${x} Z" fill="${C.red}"/>` +
        rect(x + w * 0.25, y - 14, 12, 34, C.navy2, 6) + rect(x + w * 0.75 - 12, y - 14, 12, 34, C.navy2, 6) +
        t(x + w / 2, y + h * 0.24, mes, { size: w * 0.17, w: 800, fill: "#fff", a: "middle" }) +
        t(x + w / 2, y + h * 0.78, dia, { size: w * 0.42, w: 800, fill: C.navy, a: "middle" });
}

function sello(x, y, r, s, color = C.gold2, o = {}) {
    let dientes = "";
    const n = 18;
    for (let i = 0; i < n * 2; i++) {
        const ang = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 0.88;
        dientes += (i ? "L" : "M") + (x + Math.cos(ang) * rr).toFixed(1) + "," + (y + Math.sin(ang) * rr).toFixed(1);
    }
    return `<path d="${dientes}Z" fill="${color}" filter="url(#sh)"/>` + circ(x, y, r * 0.72, "none", `stroke="#fff" stroke-width="4" stroke-dasharray="6 6"`) +
        t(x, y + r * (o.dy || 0.2), s, { size: o.size || r * 0.56, w: 800, fill: "#fff", a: "middle" });
}

/* El fondo: el color del tema muy suave y unas casillas de tablero al costado. */
function fondo(tema) {
    const c = TEMA[tema] || TEMA.arbitraje;
    let s = `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg}"/><stop offset="1" stop-color="${c.l}"/></linearGradient>
      <filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="${C.navy}" flood-opacity=".16"/></filter>
      ${[C.mid, C.navy, C.green, C.red, C.gold2, C.blue, C.purple, C.soft].map((col) => `<marker id="punta-${col.slice(1)}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${col}"/></marker>`).join("")}
    </defs>`;
    s += rect(0, 0, W, H, "url(#bg)");
    const sq = 56;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 6; k++) if ((f + k) % 2 === 0 && f + k < 6) s += rect(W - (k + 1) * sq, H - (f + 1) * sq, sq, sq, c.a, 0, `opacity="${0.1 - (f + k) * 0.014}"`);
    for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) if ((f + k) % 2 === 0 && f + k < 4) s += rect(k * sq, f * sq, sq, sq, c.a, 0, `opacity="${0.08 - (f + k) * 0.016}"`);
    s += rect(0, 0, W, 12, c.a);
    return s;
}

/* ---------- Las escenas, una por herramienta ---------- */

const ESCENAS = {};

ESCENAS["torneos-costa-rica"] = { tema: "arbitraje", alt: "Un calendario y una lista de torneos de Costa Rica, cada uno con su fecha, el ritmo de juego, si vale para Elo FIDE y un botón para inscribirse.", svg: () => {
    let s = calendario(80, 160, 230, "NOV", "22");
    s += `<path d="M195,470 c-40,0 -62,30 -62,58 c0,40 62,92 62,92 c0,0 62,-52 62,-92 c0,-28 -22,-58 -62,-58z" fill="${C.red}" filter="url(#sh)"/>` + circ(195, 528, 24, "#fff") + t(195, 537, "CR", { size: 22, w: 800, fill: C.red, a: "middle" });
    const filas = [["22", "NOV", "90'+30\"", true], ["29", "NOV", "15'+10\"", false], ["06", "DIC", "60'+30\"", true]];
    filas.forEach(([d, m, ritmo, elo], i) => {
        const y = 80 + i * 180;
        s += card(370, y, 760, 150);
        s += rect(395, y + 22, 106, 106, C.navy, 16) + t(448, y + 78, d, { size: 46, w: 800, fill: "#fff", a: "middle" }) + t(448, y + 112, m, { size: 22, w: 700, fill: C.gold, a: "middle" });
        s += bar(530, y + 34, 330, 20, C.navy2) + bar(530, y + 68, 220, 14, C.light);
        s += reloj(548, y + 113, 17) + t(576, y + 123, ritmo, { size: 26, w: 700, fill: C.mid });
        s += elo ? pill(720, y + 94, "Elo FIDE", { fill: C.greenL, color: C.green2, size: 22, h: 40 }) : pill(720, y + 94, "Sin Elo", { fill: C.light, color: C.mid, size: 22, h: 40 });
        s += rect(915, y + 46, 190, 58, C.gold, 14) + t(1010, y + 84, "Inscribirse", { size: 25, w: 800, fill: C.navy, a: "middle" });
    });
    return s;
}};

ESCENAS["seleccion-codicader"] = { tema: "jde", alt: "Los enlaces de chess-results entran a un embudo que pesa la posición, el rendimiento, el ranking nacional y el ranking FIDE, y sale la selección con cuatro estudiantes marcados.", svg: () => {
    let s = enlace(50, 150, 330) + enlace(50, 240, 330) + enlace(50, 330, 330);
    s += t(215, 460, "Etapa Nacional", { size: 30, w: 700, fill: C.mid, a: "middle" });
    s += flecha(395, 270, 445, 270, { color: C.green, ancho: 9 });
    s += `<path d="M460,110 H780 L670,330 V520 L570,570 V330 Z" fill="${C.green}" filter="url(#sh)"/>`;
    const crit = ["Posición", "Rendimiento", "Ranking nac.", "Ranking FIDE"];
    crit.forEach((c, i) => { s += pill(620, 128 + i * 52, c, { fill: "#fff", color: C.green2, size: 22, h: 42, a: "middle" }); });
    s += flecha(700, 470, 790, 400, { color: C.green, ancho: 9 });
    s += card(800, 110, 340, 470) + t(970, 170, "Selección", { size: 36, w: 800, a: "middle" });
    [1, 2, 3, 4].forEach((n, i) => {
        const y = 210 + i * 88;
        s += rect(830, y, 280, 70, i < 2 ? C.greenL : C.bg, 14) + t(865, y + 47, n, { size: 32, w: 800, fill: C.green2, a: "middle" }) + avatar(918, y + 35, 24, C.white, C.mid) + bar(955, y + 28, 90, 14, C.line) + check(1078, y + 35, 20);
    });
    return s;
}};

ESCENAS["jdn-comites"] = { tema: "jdn", alt: "Escudos de varios comités de deportes, cada uno con sus medallas de oro, plata y bronce en el ajedrez de los Juegos Deportivos Nacionales, y una línea de tiempo de 2018 a 2026.", svg: () => {
    let s = "";
    const com = [["A", C.blue, [5, 3, 2]], ["B", C.red, [4, 4, 1]], ["C", C.green2, [3, 2, 4]], ["D", C.purple, [2, 3, 3]], ["E", C.gold2, [1, 2, 5]], ["F", C.navy2, [1, 1, 2]]];
    com.forEach(([l, col, med], i) => {
        const x = 70 + (i % 3) * 360, y = 70 + Math.floor(i / 3) * 255;
        s += card(x, y, 330, 225);
        s += escudo(x + 28, y + 30, 120, col, l);
        [[C.gold, med[0]], [C.silver, med[1]], [C.bronze, med[2]]].forEach(([mc, n], k) => {
            s += circ(x + 200, y + 62 + k * 58, 20, mc, `stroke="#fff" stroke-width="3"`) + t(x + 236, y + 74 + k * 58, "× " + n, { size: 30, w: 800 });
        });
    });
    s += `<path d="M110,600 H1090" stroke="${C.blue}" stroke-width="8" stroke-linecap="round"/>`;
    ["2018", "2020", "2022", "2024", "2026"].forEach((a, i) => { s += circ(110 + i * 245, 600, 14, C.white, `stroke="${C.blue}" stroke-width="6"`) + t(110 + i * 245, 648, a, { size: 26, w: 700, fill: C.mid, a: "middle" }); });
    return s;
}};

ESCENAS.universidades = { tema: "universitarios", alt: "Tres universidades con sus edificios, cada una con su barra de resultados en los torneos universitarios de ajedrez desde 2010, y un birrete.", svg: () => {
    let s = birrete(120, 150, 70, C.purple);
    const u = [[C.purple, [8, 5, 3]], [C.navy2, [6, 6, 4]], [C.blue, [4, 3, 6]]];
    u.forEach(([col, med], i) => {
        const x = 250 + i * 310;
        s += card(x - 20, 70, 270, 540);
        s += edificio(x + 20, 100, 190, 170, { color: col });
        const tot = med[0] + med[1] + med[2];
        let yy = 560;
        [[C.bronze, med[2]], [C.silver, med[1]], [C.gold, med[0]]].forEach(([mc, n]) => { const h = n * 11; s += rect(x + 70, yy - h, 90, h, mc, 4); yy -= h; });
        s += t(x + 115, yy - 16, tot + " podios", { size: 26, w: 700, fill: C.mid, a: "middle" });
    });
    s += pill(120, 260, "2010", { fill: C.purple, size: 26, a: "middle" }) + `<path d="M120,320 V470" stroke="${C.purple}" stroke-width="6" stroke-dasharray="4 10" stroke-linecap="round"/>` + pill(120, 480, "2026", { fill: C.purple, size: 26, a: "middle" });
    return s;
}};

ESCENAS["torneos-universitarios"] = { tema: "universitarios", alt: "Un catálogo de torneos universitarios: cada tarjeta trae la fecha, quién lo organizó, cuántos jugaron y un pequeño podio.", svg: () => {
    let s = birrete(150, 160, 85, C.purple) + t(150, 300, "Catálogo", { size: 38, w: 800, a: "middle" });
    s += lupa(120, 400, 40, C.purple);
    [0, 1, 2].forEach((i) => {
        const y = 70 + i * 185;
        s += card(300, y, 830, 160);
        s += rect(325, y + 24, 112, 112, C.purpleL, 18) + edificio(345, y + 40, 72, 70, { color: C.purple });
        s += bar(470, y + 38, 300 - i * 30, 22, C.navy2) + bar(470, y + 78, 200, 14, C.light);
        s += persona(490, y + 120, 26, C.mid) + t(520, y + 132, [48, 32, 26][i] + " jugadores", { size: 26, w: 700, fill: C.mid });
        s += podio(870, y + 140, 220, { alto: 90, tam: 30 });
    });
    return s;
}};

ESCENAS["cenfotec-2026"] = { tema: "universitarios", alt: "La página del torneo: el podio, la tabla de la clasificación final, el video de la transmisión y la comparación con la edición 2025.", svg: () => {
    let s = card(60, 70, 400, 540) + podio(100, 420, 320, { alto: 170, piezas: ["♛", "♚", "♜"] }) + t(260, 500, "Podio 2026", { size: 34, w: 800, a: "middle" }) + bar(150, 540, 220, 14, C.light);
    s += card(490, 70, 380, 540) + t(520, 125, "Clasificación", { size: 32, w: 800 });
    for (let i = 0; i < 7; i++) {
        const y = 155 + i * 62;
        s += rect(515, y, 330, 50, i % 2 ? C.white : C.bg, 10) + t(540, y + 35, i + 1, { size: 26, w: 800, fill: i < 3 ? C.purple : C.mid }) + bar(580, y + 18, 160 - (i % 3) * 25, 14, C.line) + t(830, y + 36, ["6", "5½", "5", "5", "4½", "4", "4"][i], { size: 26, w: 800, a: "end" });
    }
    s += card(900, 70, 250, 250, { fill: C.navy }) + circ(1025, 195, 56, C.red) + `<path d="M1007,165 L1052,195 L1007,225 Z" fill="#fff"/>` + t(1025, 290, "Video", { size: 26, w: 700, fill: "#fff", a: "middle" });
    s += card(900, 350, 250, 260) + barras(930, 400, 190, 130, [20, 32], [C.soft, C.purple], { etiquetas: ["2025", "2026"], tam: 24 });
    return s;
}};

ESCENAS["utn-2026"] = { tema: "universitarios", alt: "Dos podios lado a lado, uno de la rama femenina con una dama y otro de la masculina con un rey, con la clasificación de cada rama.", svg: () => {
    let s = "";
    [["Femenino", "♛", C.purple, 70], ["Masculino", "♚", C.navy2, 620]].forEach(([nom, g, col, x]) => {
        s += card(x, 70, 510, 540);
        s += pill(x + 255, 100, nom, { fill: col, size: 30, a: "middle", h: 56 });
        s += pieza(x + 255, 235, 120, g, "w");
        s += podio(x + 70, 520, 370, { alto: 170 });
        s += bar(x + 120, 560, 270, 16, C.light);
    });
    return s;
}};

ESCENAS["comparador-jdn"] = { tema: "jdn", alt: "Tres comités de deportes lado a lado con sus medallas en barras y un «VS» entre ellos, para compararlos final por final.", svg: () => {
    let s = "";
    const com = [["A", C.blue, [6, 4, 3]], ["B", C.red, [4, 5, 4]], ["C", C.green2, [3, 3, 6]]];
    com.forEach(([l, col, med], i) => {
        const x = 80 + i * 380;
        s += card(x, 70, 280, 540);
        s += escudo(x + 85, 100, 110, col, l);
        s += barras(x + 30, 290, 220, 220, med, [C.gold, C.silver, C.bronze], { max: 7, grosor: 0.7 });
        med.forEach((n, k) => { s += t(x + 30 + k * 73.3 + 36.6, 510 - (n / 7) * 220 + 42, n, { size: 30, w: 800, fill: "#fff", a: "middle" }); });
        s += bar(x + 60, 560, 160, 14, C.light);
        if (i < 2) s += circ(x + 330, 330, 42, C.navy, 'filter="url(#sh)"') + t(x + 330, 343, "VS", { size: 32, w: 800, fill: C.gold, a: "middle" });
    });
    return s;
}};

ESCENAS["jdn-proyeccion"] = { tema: "jdn", alt: "La lista de inscritos de un comité para la próxima eliminatoria, con su categoría y en qué paso del trámite va cada uno, y una línea de su actividad reciente en torneos.", svg: () => {
    let s = card(60, 70, 700, 540) + t(95, 128, "Próxima eliminatoria", { size: 34, w: 800 }) + escudo(668, 92, 54, C.blue, "A");
    const pasos = [4, 3, 2, 4, 1];
    pasos.forEach((p, i) => {
        const y = 160 + i * 86;
        s += rect(90, y, 640, 72, i % 2 ? C.white : C.bg, 14) + avatar(130, y + 36, 24, C.white, C.mid) + bar(170, y + 20, 150, 14, C.navy2) + bar(170, y + 44, 100, 10, C.line);
        s += pill(340, y + 15, ["U14", "U16", "U18", "U14", "U20"][i], { fill: C.blueL, color: C.blue, size: 22, h: 42 });
        for (let k = 0; k < 4; k++) {
            const cx = 490 + k * 60;
            if (k < 3) s += rect(cx, y + 33, 60, 6, k < p - 1 ? C.green : C.line);
            s += k < p ? check(cx, y + 36, 16) : circ(cx, y + 36, 16, C.white, `stroke="${C.line}" stroke-width="5"`);
        }
    });
    s += card(790, 70, 350, 540) + t(965, 128, "Actividad", { size: 32, w: 800, a: "middle" });
    s += linea(830, 200, 270, 230, [3, 5, 4, 7, 6, 9], C.blue, { area: true, min: 0, max: 10 });
    s += t(965, 500, "torneos recientes", { size: 26, w: 600, fill: C.mid, a: "middle" });
    s += pill(965, 530, "en chess-results", { fill: C.light, color: C.mid, size: 22, a: "middle", h: 40 });
    return s;
}};

ESCENAS["arbitros-cr"] = { tema: "arbitraje", alt: "La credencial de un árbitro con su lista de torneos de FIDE y de chess-results, y dos sellos que marcan qué torneos valen para la norma de Árbitro FIDE y de Árbitro Internacional.", svg: () => {
    let s = card(60, 80, 340, 520);
    s += rect(190, 60, 80, 40, C.navy2, 10) + rect(210, 70, 40, 14, C.bg, 7);
    s += avatar(230, 230, 90, C.goldL, C.gold2) + pieza(300, 300, 64, "♚", "b");
    s += t(230, 375, "ÁRBITRO", { size: 38, w: 800, a: "middle" }) + bar(130, 400, 200, 16, C.light) + pill(230, 435, "Costa Rica", { fill: C.navy, size: 24, a: "middle", h: 44 });
    s += t(230, 545, "FIDE ID", { size: 22, w: 700, fill: C.mid, a: "middle" }) + [...Array(18)].map((_, i) => rect(125 + i * 12, 555, i % 3 ? 5 : 8, 26, C.navy)).join("");
    s += card(430, 80, 420, 520) + t(460, 138, "Torneos", { size: 32, w: 800 });
    const fil = [["FIDE", C.navy, true], ["FIDE", C.navy, true], ["chess-results", C.soft, false], ["FIDE", C.navy, true], ["chess-results", C.soft, false]];
    fil.forEach(([tag, col, norma], i) => {
        const y = 165 + i * 84;
        s += rect(455, y, 370, 68, i % 2 ? C.white : C.bg, 14) + bar(475, y + 18, 150, 14, C.navy2) + bar(475, y + 42, 100, 10, C.line);
        s += pill(640, y + 14, tag === "FIDE" ? "FIDE" : "c-r", { fill: col, size: 20, h: 40 }) + (norma ? check(790, y + 34, 19, C.gold2) : "");
    });
    s += sello(1000, 220, 105, "AF", C.gold2, { size: 64, dy: 0.22 }) + t(1000, 362, "Norma 3 de 4", { size: 28, w: 700, fill: C.mid, a: "middle" });
    s += sello(1000, 480, 82, "AI", C.navy2, { size: 52, dy: 0.22 }) + t(1000, 595, "Norma 1 de 4", { size: 28, w: 700, fill: C.mid, a: "middle" });
    return s;
}};

ESCENAS["ajedrez-estudiantil"] = { tema: "jde", alt: "Un gráfico de barras con la participación en los Juegos Deportivos Estudiantiles año por año, separada por etapa, junto a un colegio.", svg: () => {
    let s = edificio(90, 210, 220, 220, { tipo: "colegio" });
    s += t(200, 520, "JDE", { size: 56, w: 800, fill: C.green2, a: "middle" });
    s += card(380, 70, 760, 540);
    const anos = ["2019", "2021", "2022", "2023", "2024", "2025", "2026"], reg = [120, 70, 140, 170, 200, 230, 260], nac = [30, 15, 35, 45, 55, 60, 70];
    const x0 = 430, y0 = 500, ancho = 660, g = ancho / anos.length;
    s += `<path d="M${x0},${y0} H${x0 + ancho}" stroke="${C.line}" stroke-width="4"/>`;
    anos.forEach((a, i) => {
        const h1 = reg[i] * 1.2, h2 = nac[i] * 1.2, x = x0 + i * g + g * 0.18, w = g * 0.64;
        s += rect(x, y0 - h1, w, h1, C.green, 8) + rect(x, y0 - h1 - h2, w, h2 + 8, C.green2, 8);
        s += t(x + w / 2, y0 + 40, a, { size: 24, w: 600, fill: C.mid, a: "middle" });
    });
    s += rect(430, 105, 26, 26, C.green, 6) + t(466, 128, "Regional", { size: 26, w: 600, fill: C.mid }) + rect(630, 105, 26, 26, C.green2, 6) + t(666, 128, "Nacional", { size: 26, w: 600, fill: C.mid });
    return s;
}};

ESCENAS["historial-jugador"] = { tema: "jde", alt: "Una búsqueda por nombre que encuentra a un estudiante y su recorrido año por año en los juegos estudiantiles: circuital, regional y nacional, con su puesto.", svg: () => {
    let s = card(140, 60, 920, 90, { r: 45 }) + lupa(205, 102, 22, C.green2) + bar(270, 96, 280, 16, C.line) + rect(560, 80, 3, 46, C.navy);
    s += card(60, 200, 300, 400) + avatar(210, 310, 72, C.greenL, C.green2) + bar(120, 410, 180, 18, C.navy2) + bar(140, 445, 140, 12, C.line);
    s += edificio(170, 480, 80, 80, { tipo: "colegio" });
    s += card(390, 200, 750, 400);
    const et = [["2022", "Circuital", 1, C.soft], ["2023", "Regional", 2, C.green], ["2024", "Regional", 2, C.green], ["2025", "Nacional", 3, C.gold2], ["2026", "Nacional", 3, C.gold2]];
    et.forEach(([a, e, nivel, col], i) => {
        const x = 450 + i * 145, h = 60 + nivel * 70;
        s += rect(x, 530 - h, 100, h, col, 12);
        s += t(x + 50, 530 - h + 48, ["5º", "3º", "1º", "4º", "2º"][i], { size: 34, w: 800, fill: "#fff", a: "middle" });
        s += t(x + 50, 570, a, { size: 26, w: 700, fill: C.mid, a: "middle" });
    });
    s += rect(450, 228, 26, 26, C.soft, 6) + t(484, 250, "Circuital", { size: 24, w: 600, fill: C.mid }) + rect(650, 228, 26, 26, C.green, 6) + t(684, 250, "Regional", { size: 24, w: 600, fill: C.mid }) + rect(850, 228, 26, 26, C.gold2, 6) + t(884, 250, "Nacional", { size: 24, w: 600, fill: C.mid });
    return s;
}};

ESCENAS["estadisticas-colegios"] = { tema: "jde", alt: "Un colegio con sus medallas regionales y nacionales, individuales y por equipos, y una tabla de cuántos estudiantes llevó cada región.", svg: () => {
    let s = card(60, 70, 520, 540) + edificio(185, 150, 270, 250, { tipo: "colegio" });
    s += medalla(150, 520, 38, C.gold, "1") + medalla(250, 520, 38, C.silver, "2") + medalla(350, 520, 38, C.bronze, "3");
    s += persona(460, 520, 40, C.green2) + persona(510, 525, 34, C.green) + t(485, 590, "Equipos", { size: 22, w: 700, fill: C.mid, a: "middle" });
    s += card(610, 70, 530, 540) + t(640, 128, "Por región", { size: 32, w: 800 });
    const v = [92, 74, 66, 48, 40, 31];
    v.forEach((n, i) => {
        const y = 160 + i * 70;
        s += t(640, y + 38, "R" + (i + 1), { size: 26, w: 800, fill: C.green2 }) + rect(700, y + 12, 360, 36, C.bg, 18) + rect(700, y + 12, 360 * n / 100, 36, i === 0 ? C.green2 : C.green, 18) + t(1110, y + 40, n, { size: 26, w: 800, a: "end" });
    });
    return s;
}};

ESCENAS["ranking-estudiantil"] = { tema: "jde", alt: "Un ranking del año por categoría y rama: cada estudiante con su puesto, la etapa a la que llegó (nacional, regional o circuital) y su resultado.", svg: () => {
    let s = pill(70, 70, "2026", { fill: C.navy, size: 28, h: 52 }) + pill(200, 70, "U14", { fill: C.green2, size: 28, h: 52 }) + pill(320, 70, "Femenino", { fill: C.green, size: 28, h: 52 });
    s += card(70, 150, 1060, 460);
    const f = [["Nacional", C.gold2, "1º"], ["Nacional", C.gold2, "3º"], ["Regional", C.green, "1º"], ["Regional", C.green, "2º"], ["Circuital", C.soft, "1º"]];
    f.forEach(([e, col, p], i) => {
        const y = 175 + i * 84;
        s += rect(95, y, 1010, 70, i % 2 ? C.white : C.bg, 14);
        s += circ(150, y + 35, 28, i === 0 ? C.gold : i === 1 ? C.silver : i === 2 ? C.bronze : C.light) + t(150, y + 46, i + 1, { size: 30, w: 800, fill: i < 3 ? "#fff" : C.navy, a: "middle" });
        s += avatar(225, y + 35, 26, C.white, C.mid) + bar(270, y + 22, 260 - i * 20, 16, C.navy2) + bar(270, y + 46, 140, 10, C.line);
        s += pill(640, y + 12, e, { fill: col, size: 24, h: 46 }) + t(800, y + 46, p + " lugar", { size: 30, w: 800, fill: C.mid }) + t(1080, y + 46, ["6", "5½", "5", "4½", "4"][i] + " pts", { size: 30, w: 800, a: "end" });
    });
    return s;
}};

ESCENAS["inscripcion-jde"] = { tema: "jde", alt: "Un formulario de inscripción de un centro educativo: el colegio elegido, cada estudiante con su fecha de nacimiento y la categoría que le corresponde, todo revisado contra la normativa.", svg: () => {
    let s = card(70, 60, 760, 560);
    s += edificio(100, 90, 70, 70, { tipo: "colegio" }) + rect(200, 100, 600, 60, C.bg, 14, `stroke="${C.line}" stroke-width="3"`) + bar(225, 122, 260, 16, C.navy2) + `<path d="M760,122 l14,14 l14,-14" fill="none" stroke="${C.mid}" stroke-width="5" stroke-linecap="round"/>`;
    const fil = [["12/03/2012", "U14", true], ["05/09/2010", "U16", true], ["21/01/2009", "U18", true], ["17/06/2013", "U14", false]];
    fil.forEach(([fecha, cat, ok], i) => {
        const y = 200 + i * 100;
        s += rect(100, y, 700, 84, C.bg, 14) + avatar(145, y + 42, 26, C.white, C.mid) + bar(190, y + 26, 150, 14, C.navy2);
        s += t(190, y + 68, fecha, { size: 22, w: 600, fill: C.mid });
        s += flecha(370, y + 42, 440, y + 42, { color: C.green, ancho: 6 }) + pill(455, y + 19, cat, { fill: ok ? C.green2 : C.gold2, size: 24, h: 46 });
        s += ok ? check(760, y + 42, 22) : circ(760, y + 42, 22, C.gold2) + t(760, y + 54, "!", { size: 32, w: 800, fill: "#fff", a: "middle" });
    });
    s += documento(880, 110, 250, 330, { y0: 120 }) + t(1005, 180, "Normativa", { size: 28, w: 800, a: "middle" }) + t(1005, 92 + 120, "2026", { size: 26, w: 700, fill: C.green2, a: "middle" });
    s += check(1005, 500, 50);
    return s;
}};

ESCENAS.desempates = { tema: "arbitraje", alt: "Dos jugadores empatados en puntos sobre una balanza; la lista de desempates de las bases decide, paso a paso, quién queda arriba.", svg: () => {
    let s = `<path d="M300,140 V520" stroke="${C.navy2}" stroke-width="14" stroke-linecap="round"/>` + rect(220, 520, 160, 26, C.navy2, 12);
    s += `<path d="M120,215 L480,175" stroke="${C.navy2}" stroke-width="12" stroke-linecap="round"/>` + circ(300, 195, 18, C.gold);
    s += `<path d="M120,215 L70,330 M120,215 L170,330 M480,175 L430,290 M480,175 L530,290" stroke="${C.mid}" stroke-width="4"/>`;
    s += `<path d="M55,330 h130 q-10,46 -65,46 q-55,0 -65,-46z" fill="${C.gold}"/>` + `<path d="M415,290 h130 q-10,46 -65,46 q-55,0 -65,-46z" fill="${C.gold}"/>`;
    s += avatar(120, 290, 36, C.white, C.navy) + avatar(480, 250, 36, C.white, C.navy);
    s += pill(120, 400, "5 pts", { fill: C.navy, size: 26, a: "middle" }) + pill(480, 360, "5 pts", { fill: C.navy, size: 26, a: "middle" });
    s += card(620, 70, 520, 540) + t(650, 128, "Desempates de las bases", { size: 30, w: 800 });
    const d = [["1", "Encuentro directo", "="], ["2", "Buchholz corte 1", "▲"], ["3", "Sonneborn-Berger", ""], ["4", "Partidas ganadas", ""]];
    d.forEach(([n, nom, r], i) => {
        const y = 160 + i * 88;
        const activo = i === 1;
        s += rect(645, y, 470, 72, activo ? C.goldL : C.bg, 14, activo ? `stroke="${C.gold2}" stroke-width="4"` : "") + circ(685, y + 36, 22, activo ? C.gold2 : C.soft) + t(685, y + 46, n, { size: 26, w: 800, fill: "#fff", a: "middle" }) + t(722, y + 46, nom, { size: 27, w: 700, fill: i > 1 ? C.soft : C.navy });
        if (r === "=") s += t(1090, y + 48, "=", { size: 34, w: 800, fill: C.mid, a: "end" });
        if (r === "▲") s += `<path d="M1072,${y + 50} l14,-26 l14,26z" fill="${C.green}"/>`;
    });
    s += rect(645, 525, 470, 60, C.greenL, 14) + check(682, 555, 18) + t(714, 565, "Queda arriba por 1½", { size: 26, w: 700, fill: C.green2 });
    return s;
}};

ESCENAS["variacion-elo"] = { tema: "arbitraje", alt: "Cada participante del torneo con su Elo y cuánto sube o baja, en verde o en rojo, y una línea con la variación partida por partida.", svg: () => {
    let s = card(60, 70, 620, 540) + t(95, 128, "Participantes", { size: 32, w: 800 }) + t(450, 128, "Elo", { size: 26, w: 700, fill: C.mid, a: "end" });
    const f = [["2015", "+14", true], ["1940", "+9", true], ["1888", "−6", false], ["1802", "+21", true], ["1750", "−11", false]];
    f.forEach(([elo, d, sube], i) => {
        const y = 160 + i * 86;
        s += rect(85, y, 570, 70, i % 2 ? C.white : C.bg, 14) + avatar(125, y + 35, 24, C.white, C.mid) + bar(165, y + 28, 150, 14, C.line) + t(450, y + 46, elo, { size: 30, w: 800, a: "end" });
        s += rect(490, y + 12, 140, 46, sube ? C.greenL : C.redL, 23) + `<path d="${sube ? `M512,${y + 44} l12,-20 l12,20z` : `M512,${y + 25} l12,20 l12,-20z`}" fill="${sube ? C.green : C.red}"/>` + t(600, y + 46, d, { size: 28, w: 800, fill: sube ? C.green2 : C.red, a: "end" });
    });
    s += card(710, 70, 430, 540) + t(925, 128, "Partida a partida", { size: 30, w: 800, a: "middle" });
    s += `<path d="M750,380 H1100" stroke="${C.line}" stroke-width="3" stroke-dasharray="8 8"/>`;
    s += linea(760, 200, 330, 300, [0, 6, 2, 9, 14, 11, 21], C.green, { min: -8, max: 24 });
    s += t(925, 560, "R1 → R7", { size: 26, w: 700, fill: C.mid, a: "middle" });
    return s;
}};

ESCENAS["normas-titulo"] = { tema: "arbitraje", alt: "Un certificado con los sellos de las normas de GM e IM, la lista de condiciones del Reglamento de Títulos marcadas y una barra que muestra a quién le faltó medio punto.", svg: () => {
    let s = enlace(60, 90, 340);
    s += flecha(230, 175, 230, 235, { color: C.gold2, ancho: 9 });
    s += documento(70, 250, 320, 360, { lineas: false }) + t(230, 320, "NORMA", { size: 40, w: 800, a: "middle" }) + bar(120, 345, 220, 12, C.light);
    s += sello(165, 480, 70, "GM", C.gold2, { size: 46 }) + sello(295, 480, 70, "IM", C.navy2, { size: 46 });
    s += card(440, 70, 700, 330) + t(475, 125, "Condiciones", { size: 32, w: 800 });
    ["Rondas", "Rivales con título", "Federaciones", "Rendimiento"].forEach((c, i) => {
        const y = 150 + i * 60;
        s += check(492, y + 25, 20) + t(530, y + 36, c, { size: 28, w: 600 }) + bar(860, y + 18, 240, 14, C.light);
    });
    s += card(440, 430, 700, 180) + avatar(500, 520, 34, C.goldL, C.gold2);
    s += rect(560, 495, 420, 50, C.bg, 25) + rect(560, 495, 370, 50, C.gold, 25) + `<path d="M980,480 V560" stroke="${C.navy}" stroke-width="5" stroke-dasharray="6 6"/>`;
    s += t(1000, 482, "meta", { size: 22, w: 700, fill: C.mid }) + t(1000, 545, "−½", { size: 40, w: 800, fill: C.red });
    s += t(560, 590, "Le faltó medio punto", { size: 26, w: 700, fill: C.mid });
    return s;
}};

ESCENAS["reclamos-tablas"] = { tema: "arbitraje", alt: "Una partida en PGN con la misma posición repetida tres veces, marcada en la lista de jugadas, el contador de 50 jugadas y el resultado de tablas.", svg: () => {
    let s = tablero(80, 130, 46, 8, [[6, 7, "♚", "w"], [5, 6, "♟", "w"], [6, 6, "♟", "w"], [7, 6, "♟", "w"], [3, 0, "♛", "w"], [7, 1, "♚", "b"], [6, 1, "♟", "b"], [7, 2, "♟", "b"], [1, 4, "♜", "b"]], [[6, 0, "#F7C948"], [7, 1, "#F7C948"]]);
    s += [1, 2, 3].map((n, i) => circ(140 + i * 90, 560, 30, C.gold2, 'filter="url(#sh)"') + t(140 + i * 90, 571, "×" + n, { size: 28, w: 800, fill: "#fff", a: "middle" })).join("");
    s += card(500, 70, 340, 540) + t(530, 125, "PGN", { size: 32, w: 800 });
    const j = [["31.", "Dd5+", "Rh8", false], ["32.", "Dd8+", "Rh7", true], ["33.", "Dd3+", "Rg8", false], ["34.", "Dd8+", "Rh7", true], ["35.", "Dd3+", "Rg8", false], ["36.", "Dd8+", "Rh7", true]];
    j.forEach(([n, a, b, rep], i) => {
        const y = 150 + i * 70;
        s += rect(520, y, 300, 56, rep ? C.goldL : C.bg, 12, rep ? `stroke="${C.gold2}" stroke-width="3"` : "") + t(540, y + 38, n, { size: 26, w: 700, fill: C.mid }) + t(605, y + 38, a, { size: 26, w: 700 }) + t(720, y + 38, b, { size: 26, w: 700 });
    });
    s += card(870, 70, 270, 250) + circ(1005, 180, 72, C.bg) + t(1005, 205, "50", { size: 70, w: 800, fill: C.navy, a: "middle" }) + t(1005, 295, "jugadas", { size: 26, w: 700, fill: C.mid, a: "middle" });
    s += card(870, 350, 270, 260, { fill: C.navy }) + t(1005, 470, "½–½", { size: 82, w: 800, fill: C.gold, a: "middle" }) + t(1005, 545, "Procede", { size: 30, w: 700, fill: "#fff", a: "middle" });
    return s;
}};

ESCENAS["bases-torneo"] = { tema: "arbitraje", alt: "Un formulario con los datos del torneo que se convierte en el documento de las bases, listo para bajar en PDF o en Word.", svg: () => {
    let s = card(60, 90, 400, 500) + t(95, 150, "Datos del torneo", { size: 30, w: 800 });
    [["Fecha", calendario], ["Ritmo", reloj], ["Lugar", null], ["Premios", null]].forEach(([nom], i) => {
        const y = 180 + i * 96;
        s += t(95, y + 22, nom, { size: 22, w: 700, fill: C.mid }) + rect(95, y + 34, 330, 48, C.bg, 12, `stroke="${C.line}" stroke-width="3"`) + bar(115, y + 52, 160 - i * 15, 12, C.navy2);
    });
    s += flecha(480, 340, 560, 340, { color: C.gold2, ancho: 11 });
    s += documento(590, 70, 330, 540, { y0: 160, paso: 38 }) + t(755, 135, "BASES", { size: 44, w: 800, a: "middle" });
    s += pieza(670, 560, 56, "♞", "b");
    s += rect(960, 150, 180, 120, C.red, 18, 'filter="url(#sh)"') + t(1050, 228, "PDF", { size: 46, w: 800, fill: "#fff", a: "middle" });
    s += rect(960, 300, 180, 120, C.blue, 18, 'filter="url(#sh)"') + t(1050, 378, "Word", { size: 42, w: 800, fill: "#fff", a: "middle" });
    s += circ(1050, 520, 50, C.gold, 'filter="url(#sh)"') + `<path d="M1050,492 V540 M1030,522 L1050,542 L1070,522" fill="none" stroke="${C.navy}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
    return s;
}};

ESCENAS["acta-jde"] = { tema: "jde", alt: "El acta oficial de una etapa de los JDE con la tabla de resultados, la firma del árbitro y el sello de los clasificados que pasan a la etapa siguiente.", svg: () => {
    let s = enlace(50, 120, 300) + enlace(50, 210, 300);
    s += t(200, 330, "Swiss-Manager", { size: 26, w: 700, fill: C.mid, a: "middle" });
    s += flecha(360, 230, 430, 230, { color: C.green, ancho: 10 });
    s += documento(450, 60, 440, 560, { lineas: false });
    s += circ(520, 125, 32, C.green) + pieza(520, 128, 40, "♚", "w") + t(570, 120, "ACTA OFICIAL", { size: 32, w: 800 }) + bar(570, 138, 200, 12, C.light);
    for (let i = 0; i < 6; i++) {
        const y = 190 + i * 52;
        s += rect(490, y, 360, 42, i === 0 ? C.green : i % 2 ? C.white : C.bg, 8);
        if (i) s += t(510, y + 30, i, { size: 22, w: 800, fill: i < 3 ? C.green2 : C.mid }) + bar(545, y + 15, 170, 12, C.line) + bar(770, y + 15, 50, 12, C.line);
    }
    s += `<path d="M520,560 c20,-40 40,30 60,-10 s30,-30 50,5 s25,10 40,-15" fill="none" stroke="${C.navy}" stroke-width="4" stroke-linecap="round"/>` + `<path d="M500,575 H720" stroke="${C.line}" stroke-width="3"/>`;
    s += sello(790, 545, 58, "✓", C.green2, { size: 54, dy: 0.32 });
    s += flecha(910, 300, 980, 300, { color: C.green, ancho: 10 });
    s += card(990, 150, 160, 330) + t(1070, 205, "Pasan", { size: 28, w: 800, a: "middle" });
    [0, 1, 2].forEach((i) => { s += avatar(1035, 260 + i * 70, 24, C.greenL, C.green2) + check(1100, 260 + i * 70, 18); });
    return s;
}};

ESCENAS["ficha-federado"] = { tema: "clubes", alt: "La ficha de un jugador federado: su Código FIDE, su Elo nacional y FIDE, la línea de su rendimiento en el tiempo y la lista de sus torneos.", svg: () => {
    let s = card(60, 70, 420, 540) + rect(60, 70, 420, 130, C.navy2, 22) + rect(60, 160, 420, 40, C.navy2);
    s += avatar(270, 200, 72, C.white, C.mid);
    s += bar(170, 300, 200, 18, C.navy2) + t(270, 350, "FIDE ID", { size: 22, w: 700, fill: C.mid, a: "middle" }) + [...Array(20)].map((_, i) => rect(155 + i * 12, 362, i % 3 ? 5 : 8, 28, C.navy)).join("");
    s += rect(95, 420, 165, 150, C.bg, 16) + t(178, 465, "Nacional", { size: 22, w: 700, fill: C.mid, a: "middle" }) + t(178, 530, "1874", { size: 44, w: 800, a: "middle" });
    s += rect(280, 420, 165, 150, C.goldL, 16) + t(363, 465, "FIDE", { size: 22, w: 700, fill: C.gold2, a: "middle" }) + t(363, 530, "1822", { size: 44, w: 800, a: "middle" });
    s += card(510, 70, 630, 250) + t(540, 120, "Tendencia", { size: 30, w: 800 });
    s += linea(560, 145, 530, 140, [1700, 1735, 1720, 1780, 1810, 1795, 1850, 1874], C.blue, { area: true, r: 7 });
    s += card(510, 350, 630, 260) + t(540, 400, "Torneos", { size: 30, w: 800 });
    [0, 1, 2].forEach((i) => {
        const y = 425 + i * 58;
        s += rect(535, y, 580, 46, i % 2 ? C.white : C.bg, 10) + bar(555, y + 17, 230, 12, C.line) + t(910, y + 32, ["5/7", "4½/7", "6/9"][i], { size: 24, w: 800, a: "end" }) + pill(1095, y + 5, ["+12", "−4", "+18"][i], { fill: i === 1 ? C.redL : C.greenL, color: i === 1 ? C.red : C.green2, size: 20, h: 36, a: "end" });
    });
    return s;
}};

/* ---------- Pintar ---------- */

function svgDe(id) {
    const e = ESCENAS[id];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fondo(e.tema)}${e.svg()}</svg>`;
}

async function main() {
    const { chromium } = require("playwright");
    const pedidas = process.argv.slice(2);
    const ids = pedidas.length ? pedidas : Object.keys(ESCENAS);
    fs.mkdirSync(SALIDA, { recursive: true });
    const nav = await chromium.launch();
    const pag = await nav.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    for (const id of ids) {
        if (!ESCENAS[id]) { console.error("No hay escena para «" + id + "»"); process.exitCode = 1; continue; }
        await pag.setContent(`<!doctype html><html><body style="margin:0">${svgDe(id)}</body></html>`);
        const destino = path.join(SALIDA, id + ".png");
        await pag.screenshot({ path: destino, clip: { x: 0, y: 0, width: W, height: H } });
        console.log("✓", path.relative(RAIZ, destino));
    }
    await nav.close();
    const hechos = ids.filter((id) => ESCENAS[id]).map((id) => path.join(SALIDA, id + ".png"));
    const py = [
        "import sys",
        "from PIL import Image",
        "for f in sys.argv[1:]:",
        "    Image.open(f).convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(f, optimize=True)",
    ].join("\n");
    const r = require("child_process").spawnSync("python", ["-c", py, ...hechos], { stdio: "inherit" });
    if (r.status !== 0) console.error("No se pudieron comprimir (¿falta «pip install pillow»?): quedan sin comprimir.");
}

module.exports = { ESCENAS, W, H };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
