/* Los dibujos del libro «Peonita y el reino de las 64 casillas».
 *
 * Todo es SVG escrito acá, sin imágenes de afuera: así el libro se vuelve a
 * generar igual en cualquier máquina, nadie tiene que pedir permiso por una
 * ilustración ajena y cada personaje se ve siempre igual de un capítulo a otro.
 *
 * Las piezas son personajes (cuerpo de pieza de ajedrez, ojos grandes,
 * cachetes), pero su silueta es la de la pieza de verdad: un niño que aprende
 * con el libro tiene que reconocer la torre cuando la ve en un tablero.
 *
 *   pieza(tipo, color, x, y, escala, opciones)   tipo: p t a d r c
 *       (x, y) es el punto donde la pieza apoya la base, en el centro.
 *       opciones: { cara: "feliz" | "sorpresa" | "pensando" | "dormida",
 *                   mono: true (el moño de Peonita), bufanda: true (Tizón),
 *                   espejo: true (mira para el otro lado) }
 *   perezoso(x, y, escala)    Don Lento colgado de su rama
 *   escena({ fondo, piso, contenido })   lienzo de 600 × 320
 */
"use strict";

const PAL = {
  b: { cuerpo: "#fffaf0", sombra: "#ecdfc8", linea: "#5b4636", boca: "#5b4636" },
  n: { cuerpo: "#4d4766", sombra: "#3a3550", linea: "#221e30", boca: "#ffd6e0" },
};
const ORO = "#ffd43b", ORO_LINEA = "#b07d00", ROSADO = "#f06595", MENTA = "#38d9a9";

function cara(cx, cy, color, tipo) {
  const c = PAL[color];
  const ojo = (dx) => {
    const x = cx + dx;
    if (tipo === "dormida") {
      return `<path d="M${x - 5},${cy + 1} Q${x},${cy + 5} ${x + 5},${cy + 1}" fill="none" stroke="${c.linea}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    return `<ellipse cx="${x}" cy="${cy}" rx="5.6" ry="6.6" fill="#fff" stroke="${c.linea}" stroke-width="1.6"/>` +
      `<circle cx="${x + 0.8}" cy="${cy + 1}" r="3.4" fill="#2b2233"/>` +
      `<circle cx="${x - 0.2}" cy="${cy - 0.8}" r="1.3" fill="#fff"/>`;
  };
  let boca;
  if (tipo === "sorpresa") boca = `<ellipse cx="${cx}" cy="${cy + 13}" rx="3.2" ry="4.2" fill="${c.boca}"/>`;
  else if (tipo === "pensando") boca = `<path d="M${cx - 5},${cy + 13} L${cx + 5},${cy + 11.5}" stroke="${c.boca}" stroke-width="2.4" stroke-linecap="round"/>`;
  else boca = `<path d="M${cx - 6.5},${cy + 9.5} Q${cx},${cy + 17} ${cx + 6.5},${cy + 9.5}" fill="none" stroke="${c.boca}" stroke-width="2.4" stroke-linecap="round"/>`;
  return ojo(-9) + ojo(9) +
    `<circle cx="${cx - 16}" cy="${cy + 8}" r="4.6" fill="#ff8fab" opacity=".75"/>` +
    `<circle cx="${cx + 16}" cy="${cy + 8}" r="4.6" fill="#ff8fab" opacity=".75"/>` + boca;
}

function base(c) {
  return `<rect x="12" y="118" width="76" height="20" rx="9" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>` +
    `<path d="M18,126 H82" stroke="${c.sombra}" stroke-width="3" stroke-linecap="round"/>`;
}

function cuello(c, y, color) {
  return `<rect x="31" y="${y}" width="38" height="10" rx="5" fill="${color || c.sombra}" stroke="${c.linea}" stroke-width="2.5"/>`;
}

const FORMAS = {
  p(c, o, col) {
    let s = `<path d="M30,120 C34,100 38,88 40,78 L60,78 C62,88 66,100 70,120 Z" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>`;
    s += cuello(c, 72, o.bufanda ? MENTA : null);
    if (o.bufanda) s += `<path d="M60,80 L66,100 L58,98 Z" fill="${MENTA}" stroke="${c.linea}" stroke-width="2"/>`;
    s += `<circle cx="50" cy="47" r="27" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>`;
    s += cara(50, 45, col, o.cara);
    if (o.mono) {
      s += `<g transform="rotate(18 68 24)"><path d="M68,24 L55,14 L56,34 Z" fill="${ROSADO}" stroke="#a61e4d" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M68,24 L81,14 L80,34 Z" fill="${ROSADO}" stroke="#a61e4d" stroke-width="2" stroke-linejoin="round"/>` +
        `<circle cx="68" cy="24" r="4.5" fill="#f783ac" stroke="#a61e4d" stroke-width="2"/></g>`;
    }
    return s;
  },
  t(c, o, col) {
    return `<path d="M28,120 L32,62 L68,62 L72,120 Z" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M22,64 L22,26 L35,26 L35,37 L44,37 L44,26 L56,26 L56,37 L65,37 L65,26 L78,26 L78,64 Z" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M22,52 H78" stroke="${c.sombra}" stroke-width="3"/>` +
      cara(50, 84, col, o.cara);
  },
  a(c, o, col) {
    return `<path d="M32,120 C36,104 40,94 42,86 L58,86 C60,94 64,104 68,120 Z" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>` +
      cuello(c, 78) +
      `<path d="M50,14 C71,28 77,52 71,68 C66,80 34,80 29,68 C23,52 29,28 50,14 Z" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>` +
      `<path d="M60,27 L49,42" stroke="${c.linea}" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="50" cy="11" r="6.5" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>` +
      cara(50, 57, col, o.cara);
  },
  d(c, o, col) {
    return `<path d="M28,120 C34,102 38,92 40,86 L60,86 C62,92 66,102 72,120 Z" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>` +
      cuello(c, 78) +
      `<path d="M26,44 L30,16 L40,32 L50,9 L60,32 L70,16 L74,44 Z" fill="${ORO}" stroke="${ORO_LINEA}" stroke-width="2.5" stroke-linejoin="round"/>` +
      [30, 50, 70].map((x, i) => `<circle cx="${x}" cy="${i === 1 ? 9 : 16}" r="4" fill="#ff6b6b" stroke="${ORO_LINEA}" stroke-width="1.8"/>`).join("") +
      `<circle cx="50" cy="58" r="23" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>` +
      cara(50, 57, col, o.cara);
  },
  r(c, o, col) {
    return `<path d="M28,120 C34,102 38,92 40,86 L60,86 C62,92 66,102 72,120 Z" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>` +
      cuello(c, 78) +
      `<rect x="45.5" y="2" width="9" height="24" rx="2" fill="${ORO}" stroke="${ORO_LINEA}" stroke-width="2"/>` +
      `<rect x="39" y="8" width="22" height="8" rx="2" fill="${ORO}" stroke="${ORO_LINEA}" stroke-width="2"/>` +
      `<path d="M28,46 L28,28 L39,37 L50,25 L61,37 L72,28 L72,46 Z" fill="${ORO}" stroke="${ORO_LINEA}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<circle cx="50" cy="60" r="23" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3"/>` +
      cara(50, 59, col, o.cara);
  },
  c(c, o, col) {
    const ojo = o.cara === "dormida"
      ? `<path d="M40,40 Q45,44 50,40" fill="none" stroke="${c.linea}" stroke-width="2.4" stroke-linecap="round"/>`
      : `<ellipse cx="45" cy="39" rx="6" ry="7" fill="#fff" stroke="${c.linea}" stroke-width="1.6"/><circle cx="44" cy="40" r="3.6" fill="#2b2233"/><circle cx="43" cy="38.4" r="1.3" fill="#fff"/>`;
    return `<path d="M30,120 C30,100 34,84 40,72 C34,68 26,63 21,55 C17,47 19,37 27,31 C33,26 39,23 43,21 L47,7 L55,20 C71,24 81,40 79,62 C77,84 72,100 70,120 Z" fill="${c.cuerpo}" stroke="${c.linea}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M55,21 Q66,21 67,30 Q77,32 74,42 Q84,46 78,56 Q86,62 79,72 L75,72 C76,52 70,34 55,21 Z" fill="${col === "b" ? "#ffc078" : "#9775fa"}" stroke="${c.linea}" stroke-width="2.2" stroke-linejoin="round"/>` +
      ojo +
      `<circle cx="25" cy="45" r="2.3" fill="${c.linea}"/>` +
      `<path d="M23,54 Q29,59 35,54" fill="none" stroke="${c.boca}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<circle cx="36" cy="50" r="4.4" fill="#ff8fab" opacity=".75"/>`;
  },
};

function pieza(tipo, color, x, y, escala, opciones) {
  const o = opciones || {};
  const c = PAL[color];
  const s = escala || 1;
  const giro = o.espejo ? ` translate(100,0) scale(-1,1)` : "";
  return `<g transform="translate(${(x - 50 * s).toFixed(1)},${(y - 140 * s).toFixed(1)}) scale(${s})${giro}">` +
    `<ellipse cx="50" cy="138" rx="40" ry="5" fill="#000" opacity=".12"/>` +
    base(c) + FORMAS[tipo](c, o, color) + `</g>`;
}

/* Don Lento: un perezoso de anteojos, colgado de una rama del guarumo. La rama
   va a lo ancho del dibujo; (x, y) es el punto de la rama donde se agarra. */
function perezoso(x, y, escala, opciones) {
  const o = opciones || {};
  const s = escala || 1;
  const ojos = o.dormido
    ? `<path d="M60,87 Q67,92 74,87 M86,87 Q93,92 100,87" fill="none" stroke="#2b2233" stroke-width="2.6" stroke-linecap="round"/>`
    : `<circle cx="67" cy="87" r="3.8" fill="#2b2233"/><circle cx="93" cy="87" r="3.8" fill="#2b2233"/><circle cx="66" cy="85.6" r="1.3" fill="#fff"/><circle cx="92" cy="85.6" r="1.3" fill="#fff"/>`;
  return `<g transform="translate(${(x - 80 * s).toFixed(1)},${(y - 10 * s).toFixed(1)}) scale(${s})">` +
    `<path d="M-60,12 C0,4 160,18 230,8" fill="none" stroke="#6b4a2e" stroke-width="13" stroke-linecap="round"/>` +
    `<path d="M150,10 q14,-16 30,-12 q-12,8 -30,12 Z" fill="#69db7c" stroke="#2b8a3e" stroke-width="2"/>` +
    `<path d="M58,74 L50,14 M102,74 L110,14" stroke="#8c6a4a" stroke-width="15" stroke-linecap="round"/>` +
    `<path d="M44,10 q3,8 0,14 M50,9 q3,8 0,14 M56,10 q3,8 0,14 M104,10 q3,8 0,14 M110,9 q3,8 0,14 M116,10 q3,8 0,14" fill="none" stroke="#3b2f2a" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="M58,172 L52,196 M102,172 L108,196" stroke="#8c6a4a" stroke-width="14" stroke-linecap="round"/>` +
    `<ellipse cx="80" cy="122" rx="50" ry="60" fill="#a5825f" stroke="#5b4636" stroke-width="3"/>` +
    `<ellipse cx="80" cy="138" rx="31" ry="38" fill="#c9a882"/>` +
    `<ellipse cx="80" cy="90" rx="35" ry="28" fill="#f1dfc0" stroke="#5b4636" stroke-width="2.5"/>` +
    `<ellipse cx="66" cy="88" rx="12" ry="7" transform="rotate(18 66 88)" fill="#6b4a32"/>` +
    `<ellipse cx="94" cy="88" rx="12" ry="7" transform="rotate(-18 94 88)" fill="#6b4a32"/>` +
    ojos +
    `<circle cx="67" cy="87" r="11" fill="#e7f5ff" fill-opacity=".25" stroke="#3b2f2a" stroke-width="2.6"/>` +
    `<circle cx="93" cy="87" r="11" fill="#e7f5ff" fill-opacity=".25" stroke="#3b2f2a" stroke-width="2.6"/>` +
    `<path d="M78,87 Q80,84 82,87" fill="none" stroke="#3b2f2a" stroke-width="2.6"/>` +
    `<ellipse cx="80" cy="99" rx="5.5" ry="3.8" fill="#3b2f2a"/>` +
    `<path d="M70,105 Q80,113 90,105" fill="none" stroke="#3b2f2a" stroke-width="2.6" stroke-linecap="round"/>` +
    `</g>`;
}

/* ---------------------------------------------------------- utilería */
function estrella(x, y, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push((x + rr * Math.cos(a)).toFixed(1) + "," + (y + rr * Math.sin(a)).toFixed(1));
  }
  return `<polygon points="${pts.join(" ")}" fill="${color || "#ffe066"}" stroke="#e8a200" stroke-width="1.5" stroke-linejoin="round"/>`;
}

function corazon(x, y, s, color) {
  return `<path transform="translate(${x},${y}) scale(${s || 1})" d="M0,6 C-4,-2 -14,0 -12,8 C-10,14 -2,18 0,22 C2,18 10,14 12,8 C14,0 4,-2 0,6 Z" fill="${color || "#ff6b81"}" stroke="#c2255c" stroke-width="1.5"/>`;
}

function flecha(x1, y1, x2, y2, color, curva) {
  const col = color || "#1971c2";
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const p1 = [x2 - 13 * Math.cos(ang - 0.45), y2 - 13 * Math.sin(ang - 0.45)];
  const p2 = [x2 - 13 * Math.cos(ang + 0.45), y2 - 13 * Math.sin(ang + 0.45)];
  const d = curva
    ? `M${x1},${y1} Q${curva[0]},${curva[1]} ${x2},${y2}`
    : `M${x1},${y1} L${x2},${y2}`;
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${curva ? "2 9" : "none"}"/>` +
    `<path d="M${x2},${y2} L${p1[0].toFixed(1)},${p1[1].toFixed(1)} L${p2[0].toFixed(1)},${p2[1].toFixed(1)} Z" fill="${col}"/>`;
}

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Un globo de diálogo. La cola apunta a (cx, cy). */
function globo(x, y, ancho, texto, cola, opciones) {
  const o = opciones || {};
  const lineas = Array.isArray(texto) ? texto : [texto];
  const alto = 18 + lineas.length * 19;
  const [cx, cy] = cola || [x + 20, y + alto + 18];
  const bx = Math.min(Math.max(cx, x + 18), x + ancho - 18);
  const by = cy > y ? y + alto : y;
  return `<g font-family="Quicksand, 'Comic Neue', sans-serif" font-weight="700" font-size="16" fill="#2b2233">` +
    `<path d="M${bx - 9},${by} L${cx},${cy} L${bx + 9},${by} Z" fill="#fff" stroke="#5b4636" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<rect x="${x}" y="${y}" width="${ancho}" height="${alto}" rx="16" fill="#fff" stroke="#5b4636" stroke-width="2.5"/>` +
    `<path d="M${bx - 7.5},${by} L${bx + 7.5},${by}" stroke="#fff" stroke-width="4"/>` +
    lineas.map((l, i) => `<text x="${x + ancho / 2}" y="${y + 27 + i * 19}" text-anchor="middle"${o.color ? ` fill="${o.color}"` : ""}>${esc(l)}</text>`).join("") +
    `</g>`;
}

function guarumo(x, y, s) {
  return `<g transform="translate(${x},${y}) scale(${s || 1})">` +
    `<path d="M-6,0 L-4,-150 L4,-150 L6,0 Z" fill="#c8b59a" stroke="#7a6248" stroke-width="2"/>` +
    `<path d="M-4,-60 H4 M-4,-100 H4" stroke="#7a6248" stroke-width="2"/>` +
    [[-48, -150], [0, -172], [48, -150], [-26, -125], [26, -125]].map(([dx, dy]) =>
      `<g transform="translate(${dx},${dy})">` +
      [0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="0" cy="-15" rx="8" ry="18" transform="rotate(${a})" fill="#51cf66" stroke="#2b8a3e" stroke-width="1.5"/>`).join("") +
      `<circle r="5" fill="#2f9e44"/></g>`).join("") + `</g>`;
}

function nube(x, y, s) {
  return `<g transform="translate(${x},${y}) scale(${s || 1})" fill="#fff" opacity=".95">` +
    `<ellipse cx="0" cy="0" rx="34" ry="16"/><ellipse cx="-22" cy="4" rx="20" ry="13"/><ellipse cx="24" cy="4" rx="22" ry="13"/><ellipse cx="4" cy="-12" rx="20" ry="15"/></g>`;
}

function caja(x, y) {
  return `<g transform="translate(${x},${y})">` +
    `<path d="M0,0 L-30,-58 L160,-58 L190,0 Z" fill="#c08552" stroke="#5b3a1e" stroke-width="3" stroke-linejoin="round"/>` +
    `<rect x="0" y="0" width="190" height="62" rx="4" fill="#d9a066" stroke="#5b3a1e" stroke-width="3"/>` +
    `<path d="M10,20 H180 M10,40 H180" stroke="#b07a44" stroke-width="2"/>` +
    `<rect x="78" y="22" width="34" height="18" rx="3" fill="${ORO}" stroke="${ORO_LINEA}" stroke-width="2"/>` +
    `</g>`;
}

function corona(x, y, s) {
  return `<g transform="translate(${x},${y}) scale(${s || 1})"><path d="M-24,12 L-28,-14 L-14,0 L0,-20 L14,0 L28,-14 L24,12 Z" fill="${ORO}" stroke="${ORO_LINEA}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="0" cy="-20" r="4" fill="#ff6b6b"/><circle cx="-28" cy="-14" r="3.5" fill="#4dabf7"/><circle cx="28" cy="-14" r="3.5" fill="#4dabf7"/></g>`;
}

function mango(x, y, s) {
  return `<g transform="translate(${x},${y}) scale(${s || 1})"><path d="M0,-16 C14,-16 20,-2 16,8 C12,18 -8,20 -14,10 C-20,0 -12,-16 0,-16 Z" fill="#ffa94d" stroke="#d9480f" stroke-width="2"/>` +
    `<path d="M-6,-12 C-2,-8 6,-8 10,-12" fill="none" stroke="#ff6b6b" stroke-width="5" stroke-linecap="round" opacity=".6"/>` +
    `<path d="M2,-16 q4,-8 12,-8 q-4,8 -12,8" fill="#69db7c" stroke="#2b8a3e" stroke-width="1.5"/></g>`;
}

function trofeo(x, y, s) {
  return `<g transform="translate(${x},${y}) scale(${s || 1})">` +
    `<path d="M-22,-50 H22 C22,-20 12,-8 0,-6 C-12,-8 -22,-20 -22,-50 Z" fill="${ORO}" stroke="${ORO_LINEA}" stroke-width="2.5"/>` +
    `<path d="M-22,-44 C-38,-44 -36,-24 -16,-22 M22,-44 C38,-44 36,-24 16,-22" fill="none" stroke="${ORO_LINEA}" stroke-width="3"/>` +
    `<rect x="-5" y="-7" width="10" height="14" fill="${ORO}" stroke="${ORO_LINEA}" stroke-width="2"/>` +
    `<rect x="-18" y="6" width="36" height="10" rx="2" fill="#8d5524" stroke="#5b3a1e" stroke-width="2"/>` +
    estrella(0, -32, 8, "#fff3bf") + `</g>`;
}

function confeti(semilla, cuantos, ancho, alto) {
  let s = semilla || 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const colores = ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#da77f2", "#ff922b"];
  let out = "";
  for (let i = 0; i < cuantos; i++) {
    const x = rnd() * ancho, y = rnd() * alto * 0.7, a = rnd() * 180;
    out += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="8" height="4" rx="1.5" transform="rotate(${a.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${colores[i % colores.length]}"/>`;
  }
  return out;
}

/* ---------------------------------------------------------- fondos */
const FONDOS = {
  dia: () =>
    `<defs><linearGradient id="cielo-dia" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5d8ff"/><stop offset="1" stop-color="#e7f5ff"/></linearGradient></defs>` +
    `<rect width="600" height="320" fill="url(#cielo-dia)"/>` +
    `<g>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M70,60 L70,18" transform="rotate(${a} 70 60)" stroke="#fcc419" stroke-width="5" stroke-linecap="round"/>`).join("")}</g>` +
    `<circle cx="70" cy="60" r="28" fill="#ffd43b" stroke="#fab005" stroke-width="3"/>` +
    nube(250, 55, 1) + nube(440, 85, 0.8) +
    `<path d="M0,230 C90,180 170,190 260,215 C350,240 450,175 600,205 L600,320 L0,320 Z" fill="#8ce99a"/>` +
    `<path d="M0,255 C120,225 240,250 340,240 C450,228 520,245 600,238 L600,320 L0,320 Z" fill="#69db7c"/>`,
  noche: () =>
    `<defs><linearGradient id="cielo-noche" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2b55"/><stop offset="1" stop-color="#3b4d8c"/></linearGradient></defs>` +
    `<rect width="600" height="320" fill="url(#cielo-noche)"/>` +
    [[60, 40], [140, 90], [210, 30], [300, 70], [380, 25], [450, 100], [560, 130], [100, 150], [250, 130]].map(([x, y], i) =>
      i % 3 === 0 ? estrella(x, y, 7, "#fff3bf") : `<circle cx="${x}" cy="${y}" r="2.2" fill="#fff3bf"/>`).join("") +
    `<circle cx="520" cy="62" r="30" fill="#fff3bf"/><circle cx="508" cy="54" r="5" fill="#f8e7a1"/><circle cx="530" cy="74" r="7" fill="#f8e7a1"/>` +
    `<path d="M0,240 C100,200 200,215 300,232 C400,250 480,205 600,222 L600,320 L0,320 Z" fill="#24443f"/>`,
  aula: () =>
    `<rect width="600" height="320" fill="#33416e"/>` +
    `<rect x="380" y="26" width="170" height="140" rx="6" fill="#1c2b55" stroke="#c08552" stroke-width="10"/>` +
    `<path d="M465,26 V166 M380,96 H550" stroke="#c08552" stroke-width="7"/>` +
    `<circle cx="512" cy="60" r="18" fill="#fff3bf"/>` + estrella(415, 55, 5, "#fff3bf") + `<circle cx="430" cy="130" r="2" fill="#fff3bf"/><circle cx="520" cy="135" r="2" fill="#fff3bf"/>` +
    `<rect x="0" y="230" width="600" height="90" fill="#8d5524"/>`,
  feria: () =>
    FONDOS.dia() +
    `<path d="M40,120 L560,120 L540,150 L60,150 Z" fill="#ff8787" stroke="#c92a2a" stroke-width="3"/>` +
    `<path d="M60,120 L60,150 M140,120 L140,150 M220,120 L220,150 M300,120 L300,150 M380,120 L380,150 M460,120 L460,150 M540,120 L540,150" stroke="#fff" stroke-width="18" opacity=".55"/>` +
    `<path d="M64,150 V250 M536,150 V250" stroke="#8d5524" stroke-width="8"/>`,
};

/* El piso de casillas: los personajes viven en un tablero. */
function piso(claro, oscuro) {
  let s = "";
  const filas = 3, cols = 12, y0 = 250, alto = 70 / filas, ancho = 600 / cols;
  for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++) {
    s += `<rect x="${c * ancho}" y="${y0 + f * alto}" width="${ancho + 0.5}" height="${alto + 0.5}" fill="${(f + c) % 2 ? (oscuro || "#c79a6b") : (claro || "#f6e7c8")}"/>`;
  }
  return s + `<rect x="0" y="${y0}" width="600" height="3" fill="#6b4a2e"/>`;
}

function escena(def) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 320" role="img" aria-label="${esc(def.alt)}">` +
    `<clipPath id="recorte-${def.id}"><rect width="600" height="320" rx="22"/></clipPath>` +
    `<g clip-path="url(#recorte-${def.id})">` +
    FONDOS[def.fondo || "dia"]() + (def.piso === false ? "" : piso()) + def.contenido + `</g>` +
    `<rect x="1.5" y="1.5" width="597" height="317" rx="22" fill="none" stroke="#6b4a2e" stroke-width="3"/>` +
    `</svg>`;
}

/* Una pieza suelta, para «une cada pieza con su nombre» y la tapa. */
function piezaSola(tipo, color, opciones) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 145" aria-hidden="true">${pieza(tipo, color, 50, 142, 1, opciones)}</svg>`;
}

module.exports = {
  pieza, perezoso, escena, piezaSola, estrella, corazon, flecha, globo, guarumo, nube, caja, corona, mango, trofeo, confeti, piso, FONDOS,
};
