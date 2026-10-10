/**
 * Ajedrez Integral — la franja de la región en el panel del alumno.
 *
 * Para las cuentas del taller «Formación Ajedrez» del MEP: cada asesor ve
 * arriba de su panel el dibujo de su Dirección Regional, con el nombre y, en
 * pequeño, lo que muestra («La Basílica de los Ángeles frente al Irazú»). Los
 * dos asesores nacionales ven el mapa de Costa Rica con las 27 regionales, y
 * debajo un «¿Qué regional es cada punto?» que abre el mapa grande numerado.
 *
 * Qué fondo le toca a cada cuenta lo guarda la base (`fondos_region`, lo fija
 * administración con `fondos_region_fijar()`). Sin fila no se pinta nada, y una
 * clave que este archivo no conoce tampoco: así una cuenta cualquiera ve su
 * panel como siempre.
 *
 * Los dibujos son SVG propios armados con piezas comunes (cielo, cerros,
 * volcán, iglesia…), sin fotos ni nada copiado. El contorno del mapa y las
 * sedes son aproximados: es un dibujo, no cartografía.
 *
 * El nombre y la leyenda van DEBAJO del dibujo, no encima: encima tapaban
 * parte de él en el celular. Ver «La franja de la región» en
 * docs/decisiones/paneles.md.
 *
 * Se autoarranca. Lo carga clases.html.
 */
(function () {
  "use strict";

  /* ---------- piezas de dibujo (lienzo de 360 × 150, el suelo abajo) ---------- */
  const r1 = (n) => Math.round(n * 10) / 10;
  const cielo = (id, a, b) => `<defs><linearGradient id="c${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="360" height="150" fill="url(#c${id})"/>`;
  const sol = (x, y, r = 14, c = "#fff3c4") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
  const nube = (x, y, s = 1) => `<g fill="#ffffff" opacity=".85" transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="16" ry="6"/><ellipse cx="12" cy="-5" rx="11" ry="7"/><ellipse cx="24" cy="0" rx="13" ry="5"/></g>`;
  const volcan = (izq, der, cx, cy, c, ancho = 26) => { const a = ancho / 2;
    return `<path d="M${izq} 150 L${cx - a} ${cy} L${cx + a} ${cy} L${der} 150 Z" fill="${c}"/><path d="M${cx - a} ${cy} L${cx + a} ${cy} L${cx + a - 5} ${cy + 6} L${cx - a + 5} ${cy + 6} Z" fill="#000" opacity=".2"/>`; };
  const humo = (x, y, c = "#ffffff", o = 0.7) => `<g fill="${c}" opacity="${o}"><circle cx="${x}" cy="${y}" r="6"/><circle cx="${x + 9}" cy="${y - 9}" r="8"/><circle cx="${x + 21}" cy="${y - 16}" r="9"/></g>`;
  const cerro = (y, c, amp = 14, fase = 0) => `<path d="M0 ${y} Q${90 + fase} ${y - amp} 180 ${y} T360 ${y} V150 H0 Z" fill="${c}"/>`;
  const mar = (y, c1, c2) => `<rect y="${y}" width="360" height="${150 - y}" fill="${c1}"/><rect y="${y}" width="360" height="4" fill="${c2}"/>`;
  const arena = (y, c = "#f1dca7") => `<path d="M0 ${y} Q180 ${y - 10} 360 ${y + 4} V150 H0 Z" fill="${c}"/>`;
  const rio = (y, c = "#4c9cc2") => `<path d="M0 ${y} C80 ${y - 12} 150 ${y + 8} 230 ${y - 5} S320 ${y - 14} 360 ${y - 7} V150 H0 Z" fill="${c}"/><path d="M20 ${y + 7} C90 ${y - 2} 160 ${y + 14} 240 ${y + 2}" stroke="#e8f4f8" stroke-width="1.6" fill="none" opacity=".6"/>`;
  const pino = (x, y, s = 1, c = "#2e6234") => `<path d="M${r1(x - 9 * s)} ${y} L${x} ${r1(y - 24 * s)} L${r1(x + 9 * s)} ${y} Z" fill="${c}"/>`;
  const arbol = (x, y, s = 1, c = "#3f8a4a", fruta) =>
    `<rect x="${r1(x - 2 * s)}" y="${r1(y - 14 * s)}" width="${r1(4 * s)}" height="${r1(14 * s)}" fill="#6b4a32"/><circle cx="${x}" cy="${r1(y - 21 * s)}" r="${r1(11 * s)}" fill="${c}"/>` +
    (fruta ? [[-5, -22], [4, -17], [5, -26], [-3, -15]].map(([dx, dy]) => `<circle cx="${r1(x + dx * s)}" cy="${r1(y + dy * s)}" r="${r1(1.8 * s)}" fill="${fruta}"/>`).join("") : "");
  const palmera = (x, y, s = 1) => { const tx = x + 6 * s, ty = y - 60 * s;
    return `<path d="M${x} ${y} C${r1(x + 4 * s)} ${r1(y - 22 * s)} ${r1(x + 2 * s)} ${r1(y - 40 * s)} ${r1(tx)} ${r1(ty)}" stroke="#6b4a32" stroke-width="${r1(5 * s)}" fill="none"/><g fill="#2f7a46">` +
      [[-13, 2, -20], [13, 2, 20], [-9, -5, -55], [9, -5, 55]].map(([dx, dy, g]) => { const cx = r1(tx + dx * s), cy = r1(ty + dy * s);
        return `<ellipse cx="${cx}" cy="${cy}" rx="${r1(15 * s)}" ry="${r1(4.5 * s)}" transform="rotate(${g} ${cx} ${cy})"/>`; }).join("") + `</g>`; };
  const vaca = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-14" y="-17" width="28" height="12" rx="5" fill="#f4f1ea"/><rect x="12" y="-21" width="9" height="8" rx="3" fill="#f4f1ea"/><circle cx="-5" cy="-12" r="3" fill="#2b2b2b"/><circle cx="5" cy="-9" r="2.5" fill="#2b2b2b"/><g fill="#3b3b3b"><rect x="-11" y="-6" width="3" height="6"/><rect x="-4" y="-6" width="3" height="6"/><rect x="4" y="-6" width="3" height="6"/><rect x="9" y="-6" width="3" height="6"/></g></g>`;
  const ave = (x, y, s = 1, c = "#2b3a4a") => `<path d="M${x} ${y} q${5 * s} ${-5 * s} ${10 * s} 0 q${5 * s} ${-5 * s} ${10 * s} 0" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  const eolica = (x, y, alto, giro = 0, claro = "#f4f6f7", borde = "#9fb0b8", luz = null) => { const top = y - alto, aspa = alto * 0.45;
    let t = `<path d="M${r1(x - 1.8)} ${y} L${r1(x - 0.8)} ${top} L${r1(x + 0.8)} ${top} L${r1(x + 1.8)} ${y} Z" fill="${claro}" stroke="${borde}" stroke-width=".5"/>`;
    for (let i = 0; i < 3; i++) { const a = ((giro + i * 120) * Math.PI) / 180, px = r1(x + aspa * Math.sin(a)), py = r1(top - aspa * Math.cos(a));
      t += `<path d="M${x} ${top} L${px} ${py}" stroke="${borde}" stroke-width="3.2" stroke-linecap="round"/><path d="M${x} ${top} L${px} ${py}" stroke="${claro}" stroke-width="2" stroke-linecap="round"/>`; }
    return t + `<circle cx="${x}" cy="${top}" r="2.2" fill="${luz || claro}" stroke="${borde}" stroke-width=".5"/>`; };
  const casita = (x, y, c = "#f2e6d0", t = "#b5533c") => `<rect x="${x - 7}" y="${y - 9}" width="14" height="9" fill="${c}"/><path d="M${x - 9} ${y - 9} L${x} ${y - 16} L${x + 9} ${y - 9} Z" fill="${t}"/>`;

  const iglesia = (x, y, s = 1, muro = "#f4f0e8", techo = "#b04a3a") => { const w = 50 * s, h = 36 * s;
    return `<rect x="${r1(x - w / 2)}" y="${r1(y - h)}" width="${r1(w)}" height="${r1(h)}" fill="${muro}"/>` +
      `<rect x="${r1(x - 7 * s)}" y="${r1(y - h - 34 * s)}" width="${r1(14 * s)}" height="${r1(34 * s)}" fill="${muro}"/>` +
      `<path d="M${r1(x - w / 2 - 3 * s)} ${r1(y - h)} L${x} ${r1(y - h - 14 * s)} L${r1(x + w / 2 + 3 * s)} ${r1(y - h)} Z" fill="${techo}"/>` +
      `<path d="M${r1(x - 9 * s)} ${r1(y - h - 34 * s)} L${x} ${r1(y - h - 46 * s)} L${r1(x + 9 * s)} ${r1(y - h - 34 * s)} Z" fill="${techo}"/>` +
      `<circle cx="${x}" cy="${r1(y - h - 25 * s)}" r="${r1(3 * s)}" fill="#9fb0bb"/>` +
      `<path d="M${r1(x - 6 * s)} ${y} V${r1(y - 14 * s)} a${r1(6 * s)} ${r1(6 * s)} 0 0 1 ${r1(12 * s)} 0 V${y} Z" fill="#7d5c40"/>`; };

  /* ---------- el mapa de Costa Rica: contorno y sedes aproximados (longitud, latitud), es un boceto ---------- */
  const CR_CONTORNO = [
    [-85.70, 11.07], [-85.62, 11.20], [-85.20, 11.05], [-84.90, 10.95], [-84.68, 11.08], [-84.35, 10.98], [-84.20, 10.80],
    [-83.95, 10.72], [-83.78, 10.80], [-83.66, 10.93], [-83.60, 10.84], [-83.52, 10.65], [-83.48, 10.55], [-83.33, 10.30], [-83.10, 10.08],
    [-83.03, 9.99], [-82.85, 9.75], [-82.72, 9.66], [-82.56, 9.57], [-82.85, 9.35], [-82.93, 9.10], [-82.83, 8.85],
    [-82.85, 8.55], [-82.92, 8.30], [-82.88, 8.04], [-83.05, 8.30], [-83.15, 8.40], [-83.20, 8.55], [-83.17, 8.64],
    [-83.35, 8.72], [-83.30, 8.53], [-83.29, 8.38], [-83.45, 8.44], [-83.60, 8.50], [-83.72, 8.68], [-83.55, 8.90],
    [-83.74, 9.15], [-83.86, 9.25], [-84.16, 9.43], [-84.33, 9.50], [-84.63, 9.62], [-84.63, 9.78], [-84.72, 9.92],
    [-84.84, 9.98], [-84.95, 10.07], [-85.10, 10.15], [-85.22, 10.25], [-85.15, 10.00], [-85.05, 9.88], [-84.93, 9.82],
    [-85.02, 9.73], [-85.07, 9.65], [-85.11, 9.56], [-85.17, 9.65], [-85.53, 9.87], [-85.66, 9.98], [-85.80, 10.15],
    [-85.84, 10.30], [-85.86, 10.38], [-85.75, 10.55], [-85.68, 10.62], [-85.80, 10.80], [-85.95, 10.90], [-85.75, 10.95],
  ];
  const CR_SEDES = {
    alajuela: [-84.21, 10.02], canas: [-85.09, 10.43], cartago: [-83.92, 9.86], "central-pacifico": [-84.66, 9.99],
    coto: [-82.94, 8.65], desamparados: [-84.06, 9.90], guapiles: [-83.78, 10.21], "grande-terraba": [-83.33, 9.17],
    heredia: [-84.12, 10.00], liberia: [-85.44, 10.63], limon: [-83.03, 9.99], "los-santos": [-84.03, 9.66],
    nicoya: [-85.45, 10.15], "norte-norte": [-85.02, 10.90], occidente: [-84.47, 10.09], peninsular: [-85.05, 9.83],
    "perez-zeledon": [-83.70, 9.37], puntarenas: [-84.83, 9.98], puriscal: [-84.31, 9.85], "san-carlos": [-84.43, 10.32],
    "santa-cruz": [-85.58, 10.26], sarapiqui: [-84.01, 10.46], "sj-central": [-84.08, 9.93], "sj-norte": [-84.05, 9.95],
    "sj-oeste": [-84.14, 9.92], sula: [-82.83, 9.63], turrialba: [-83.68, 9.90],
  };
  // Las del Valle Central quedan una encima de otra: en el mapa grande van en un recuadro ampliado.
  const VALLE_CENTRAL = ["alajuela", "heredia", "sj-norte", "sj-central", "sj-oeste", "desamparados"];

  const DIBUJOS = {
    alajuela: (id) => cielo(id, "#bfe3f3", "#eef7fb") + sol(302, 30) + nube(50, 34) +
      volcan(10, 350, 178, 56, "#7f8f86", 70) + humo(190, 48, "#ffffff", 0.6) +
      cerro(118, "#6aa85f", 12) + cerro(132, "#4f8f4c", 10, 40) +
      arbol(66, 146, 1.4, "#3e8b43", "#f2a03d") + arbol(112, 148, 1.15, "#468f45", "#f2a03d") + arbol(292, 146, 1.3, "#3e8b43", "#f2a03d"),

    canas: (id) => cielo(id, "#f6e7b8", "#fbf4dc") + sol(64, 34, 15, "#fff1b0") +
      cerro(102, "#9bb7a8", 10) + cerro(116, "#d7c27a", 6) + cerro(128, "#c4ae62", 8, 60) + rio(140, "#4c9cc2") +
      arbol(250, 126, 1.1, "#6f9a4f") + arbol(312, 122, 0.9, "#6f9a4f") + vaca(110, 128) + vaca(160, 131, 0.85),

    cartago: (id) => cielo(id, "#b9dcef", "#eaf5fa") + sol(300, 34, 14, "#fff6d8") +
      `<path d="M30 116 L150 44 L176 38 L202 44 L330 116 Z" fill="#7d8b90"/><path d="M150 44 L176 38 L202 44 L192 51 L160 51 Z" fill="#5b686d"/>` +
      `<circle cx="181" cy="28" r="6" fill="#ffffff" opacity=".75"/><circle cx="190" cy="20" r="8" fill="#ffffff" opacity=".6"/>` +
      `<path d="M0 122 Q90 100 180 120 T360 112 V150 H0 Z" fill="#62a05c"/><path d="M0 134 Q120 118 240 134 T360 130 V150 H0 Z" fill="#46804a"/>` +
      `<g transform="translate(152 70)"><rect x="-2" y="34" width="64" height="46" fill="#f5f1ea"/><path d="M-6 34 H66 L61 28 H-1 Z" fill="#e3ddd2"/>` +
      `<rect x="22" y="4" width="16" height="30" fill="#f5f1ea"/><path d="M20 4 H40 L30 -10 Z" fill="#c9a24b"/><rect x="27" y="12" width="6" height="9" rx="3" fill="#9fb0bb"/>` +
      `<rect x="5" y="44" width="8" height="13" rx="4" fill="#9fb0bb"/><rect x="47" y="44" width="8" height="13" rx="4" fill="#9fb0bb"/><path d="M23 80 V64 a7 7 0 0 1 14 0 V80 Z" fill="#7d5c40"/></g>`,

    "central-pacifico": (id) => {
      let t = cielo(id, "#a9d8ee", "#e8f5fb") + nube(250, 30) + cerro(98, "#5d9b62", 14) +
        `<rect y="112" width="360" height="38" fill="#6f8f6a"/><path d="M0 120 C90 114 200 126 360 118" stroke="#8fae88" stroke-width="2" fill="none"/>` +
        `<rect x="0" y="100" width="360" height="7" fill="#8d969b"/><rect x="0" y="92" width="360" height="2" fill="#6f777c"/>`;
      for (let i = 10; i < 360; i += 24) t += `<rect x="${i}" y="92" width="2" height="8" fill="#6f777c"/>`;
      for (const px of [70, 190, 310]) t += `<rect x="${px - 5}" y="107" width="10" height="43" fill="#7c858a"/>`;
      const croc = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-34 0 Q-20 -7 0 -6 Q20 -7 30 -3 L42 -2 L30 1 Q10 4 -10 3 Q-24 3 -34 0 Z" fill="#3f5a3a"/><g fill="#2f472c"><circle cx="-14" cy="-6" r="1.6"/><circle cx="-6" cy="-6.5" r="1.6"/><circle cx="2" cy="-6.5" r="1.6"/><circle cx="10" cy="-6" r="1.6"/></g><circle cx="26" cy="-4.5" r="1.3" fill="#e9d36a"/></g>`;
      return t + croc(125, 134, 1) + croc(250, 142, 0.8);
    },

    coto: (id) => cielo(id, "#a7d7ea", "#e6f4f8") + nube(70, 30) + cerro(94, "#3f7f52", 18) + mar(104, "#2f86a6", "#47a0c0") +
      arena(130, "#cdb98a") + [36, 84, 132, 236, 284, 332].map((x, i) => palmera(x, 150, 0.62 + (i % 2) * 0.06)).join(""),

    desamparados: (id) => cielo(id, "#c4dff0", "#f0f7fb") + nube(270, 30) + cerro(94, "#7aa77a", 18) + cerro(110, "#5f9466", 14, 30) +
      casita(40, 112) + casita(66, 108, "#e8eef2", "#5f7f9f") + casita(286, 110, "#f6e4c4") + casita(316, 112, "#e8eef2") +
      cerro(132, "#4f8456", 6, 60) + iglesia(180, 142, 1.1, "#f3efe6", "#b24a3a"),

    guapiles: (id) => {
      const banano = (x, y) => `<rect x="${x - 3}" y="${y - 40}" width="6" height="40" fill="#7a8f3a"/>` +
        [[-16, -44, -35], [16, -44, 35], [-12, -52, -70], [12, -52, 70], [0, -56, 0]].map(([dx, dy, g]) => `<ellipse cx="${x + dx}" cy="${y + dy}" rx="18" ry="6" fill="#4f9a3c" transform="rotate(${g} ${x + dx} ${y + dy})"/>`).join("") +
        `<path d="M${x + 4} ${y - 34} q8 6 2 16 q-8 -6 -2 -16 Z" fill="#c9c23a"/>`;
      const tortuga = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cx="-22" cy="-2" rx="6" ry="3" fill="#6b7a5a" transform="rotate(-25 -22 -2)"/><ellipse cx="22" cy="-2" rx="6" ry="3" fill="#6b7a5a" transform="rotate(25 22 -2)"/><ellipse cx="0" cy="-6" rx="20" ry="11" fill="#7b6a3f"/><path d="M-10 -6 H10 M0 -15 V3 M-14 -11 L14 -1 M14 -11 L-14 -1" stroke="#5f512f" stroke-width="1"/><circle cx="24" cy="-8" r="5" fill="#6b7a5a"/></g>`;
      return cielo(id, "#bfe6e0", "#eef8f5") + cerro(98, "#2f7a4a", 16) + cerro(114, "#3f8f52", 10, 50) + arena(134, "#e9d6a4") +
        banano(56, 136) + banano(104, 138) + banano(306, 136) + tortuga(206, 144);
    },

    "grande-terraba": (id) => {
      const mascara = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-14 -16 L-22 -38 L-6 -22 Z M14 -16 L22 -38 L6 -22 Z" fill="#f2efe6"/>` +
        `<ellipse cx="0" cy="0" rx="20" ry="24" fill="#c0392b"/><path d="M-20 -6 Q0 -16 20 -6" stroke="#1f1f1f" stroke-width="3" fill="none"/>` +
        `<ellipse cx="-8" cy="-2" rx="5" ry="4" fill="#f2efe6"/><ellipse cx="8" cy="-2" rx="5" ry="4" fill="#f2efe6"/><circle cx="-8" cy="-2" r="2" fill="#1f1f1f"/><circle cx="8" cy="-2" r="2" fill="#1f1f1f"/>` +
        `<path d="M0 2 L-4 10 H4 Z" fill="#8e2a1f"/><rect x="-10" y="13" width="20" height="5" rx="2" fill="#f2efe6"/><path d="M-10 15.5 H10 M-5 13 V18 M0 13 V18 M5 13 V18" stroke="#1f1f1f" stroke-width=".8"/></g>`;
      return cielo(id, "#d6e8d0", "#f3f8ef") + sol(120, 30, 12, "#fff6d0") + cerro(96, "#4d8a55", 16) + cerro(112, "#3f7a49", 10, 40) +
        pino(40, 120, 1.1) + pino(66, 122, 0.9) + pino(92, 120, 1.2) + rio(134, "#5aa3c4") + mascara(262, 104);
    },

    heredia: (id) => {
      let t = cielo(id, "#c7e2f2", "#f2f8fb") + nube(60, 28) + cerro(98, "#6f9f6a", 16) + cerro(118, "#4f8a4c", 10, 50);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 18; i++) {
        const cx = 10 + i * 20 + (r % 2) * 10, cy = 124 + r * 9;
        t += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#2f6f36"/>` + ((i + r) % 3 === 0 ? `<circle cx="${cx + 2}" cy="${cy + 1}" r="1.2" fill="#c0392b"/>` : "");
      }
      const x = 180, y = 132, c = "#c9a66b", o = "#a8854d";
      t += `<rect x="${x - 20}" y="${y - 56}" width="40" height="56" fill="${c}"/><rect x="${x - 24}" y="${y - 62}" width="48" height="8" fill="${o}"/>`;
      for (let i = 0; i < 5; i++) t += `<rect x="${x - 24 + i * 10.5}" y="${y - 70}" width="6" height="8" fill="${o}"/>`;
      return t + `<rect x="${x - 2}" y="${y - 44}" width="4" height="12" fill="#5a4a36"/><rect x="${x - 13}" y="${y - 30}" width="3" height="9" fill="#5a4a36"/><rect x="${x + 10}" y="${y - 30}" width="3" height="9" fill="#5a4a36"/><path d="M${x - 7} ${y} V${y - 12} a7 7 0 0 1 14 0 V${y} Z" fill="#5a4a36"/>`;
    },

    liberia: (id) => cielo(id, "#f4d79a", "#fbefd2") + sol(70, 30, 14, "#fff1b8") + volcan(170, 360, 276, 70, "#8a8f7a", 40) + humo(284, 64, "#ffffff", 0.5) +
      cerro(118, "#d9bf6a", 6) + cerro(132, "#c9a94f", 6, 70) +
      `<rect x="106" y="98" width="8" height="34" fill="#6b4a32"/><path d="M108 102 L92 92 M112 102 L128 92" stroke="#6b4a32" stroke-width="3"/>` +
      `<ellipse cx="110" cy="86" rx="58" ry="15" fill="#4f7d3a"/><ellipse cx="90" cy="80" rx="26" ry="9" fill="#5f8f45"/><ellipse cx="134" cy="82" rx="24" ry="8" fill="#5f8f45"/>` +
      vaca(236, 138, 0.75) + vaca(268, 141, 0.65),

    limon: (id) => {
      let t = cielo(id, "#9fdcea", "#e6f7fa") + sol(300, 28, 12, "#fff3c4") + mar(94, "#1fa3b8", "#4cc0cf") + arena(124, "#f3e2b0") +
        palmera(40, 148, 1) + palmera(328, 148, 0.9) + `<path d="M0 10 Q180 46 360 10" stroke="#5a3a22" stroke-width="1" fill="none"/>`;
      const colores = ["#d9302c", "#f2c230", "#2f9e5b", "#2f7fc1"];
      for (let i = 0; i < 15; i++) { const bx = 8 + i * 24, tt = (bx + 6) / 360, by = r1(10 + 36 * tt * (1 - tt));
        t += `<path d="M${bx} ${by} l12 0 l-6 11 Z" fill="${colores[i % 4]}"/>`; }
      return t;
    },

    "los-santos": (id) => {
      let t = cielo(id, "#d3e6ee", "#f4f8f8") + cerro(88, "#9dbdb0", 16) + cerro(104, "#5f9a6f", 14, 40) + cerro(122, "#3f8048", 10, 10);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 18; i++) {
        const cx = 10 + i * 20 + (r % 2) * 10, cy = 126 + r * 9;
        t += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#2f6f36"/>` + ((i + r) % 3 === 0 ? `<circle cx="${cx + 2}" cy="${cy + 1}" r="1.2" fill="#c0392b"/>` : "");
      }
      const x = 276, y = 70;
      return t + `<path d="M${x - 46} ${y + 6} Q${x} ${y} ${x + 46} ${y + 4}" stroke="#6b4a32" stroke-width="4" fill="none"/>` +
        `<path d="M${x - 2} ${y + 6} C${x - 6} ${y + 30} ${x + 2} ${y + 44} ${x - 8} ${y + 58}" stroke="#2f9e5b" stroke-width="3" fill="none"/>` +
        `<path d="M${x + 2} ${y + 6} C${x + 4} ${y + 30} ${x + 10} ${y + 42} ${x + 4} ${y + 56}" stroke="#2f9e5b" stroke-width="3" fill="none"/>` +
        `<ellipse cx="${x}" cy="${y - 6}" rx="8" ry="12" fill="#1f8a4c"/><ellipse cx="${x + 2}" cy="${y}" rx="5" ry="7" fill="#d23a2f"/>` +
        `<circle cx="${x}" cy="${y - 18}" r="6" fill="#1f8a4c"/><path d="M${x + 5} ${y - 18} l4 1.5 l-4 1.5 Z" fill="#e8c23a"/><circle cx="${x + 2}" cy="${y - 19}" r="1.2" fill="#111"/>`;
    },

    nicoya: (id) => { const x = 180, y = 138;
      return cielo(id, "#f0dcae", "#fbf2dc") + sol(296, 30, 13, "#fff4c8") + cerro(108, "#a3b77a", 10) + cerro(130, "#c9b27a", 4, 40) +
        arbol(48, 140, 1.3, "#5f8f45") + arbol(316, 140, 1.2, "#5f8f45") +
        `<path d="M${x - 70} ${y - 34} L${x - 60} ${y - 46} H${x + 60} L${x + 70} ${y - 34} Z" fill="#b5533c"/><rect x="${x - 66}" y="${y - 34}" width="132" height="34" fill="#f6f2ea"/>` +
        `<path d="M${x - 16} ${y - 46} V${y - 70} Q${x} ${y - 82} ${x + 16} ${y - 70} V${y - 46} Z" fill="#f6f2ea"/>` +
        `<path d="M${x - 6} ${y - 58} a6 6 0 0 1 12 0 V${y - 52} H${x - 6} Z" fill="#4a4036"/><circle cx="${x}" cy="${y - 54}" r="3" fill="#c9a24b"/>` +
        `<path d="M${x - 9} ${y} V${y - 18} a9 9 0 0 1 18 0 V${y} Z" fill="#6f4f36"/><rect x="${x - 50}" y="${y - 24}" width="8" height="12" fill="#6f4f36"/><rect x="${x + 42}" y="${y - 24}" width="8" height="12" fill="#6f4f36"/>`; },

    "norte-norte": (id) => {
      let t = cielo(id, "#cfe5e8", "#f3f8f6") + cerro(104, "#4c8a5a", 6) + `<rect y="110" width="360" height="40" fill="#6fa9b8"/>` +
        `<path d="M10 122 H80 M140 130 H230 M260 120 H340" stroke="#a9d1dc" stroke-width="2"/>`;
      for (const x of [20, 28, 36, 300, 308, 318, 330]) t += `<path d="M${x} 150 Q${x + 2} 130 ${x - 3} 116" stroke="#3f7d45" stroke-width="2" fill="none"/>`;
      const x = 150, y = 140;
      t += `<path d="M${x} ${y} L${x} ${y - 14} M${x + 4} ${y} L${x + 3} ${y - 14}" stroke="#d9a441" stroke-width="1.4"/><ellipse cx="${x + 2}" cy="${y - 18}" rx="9" ry="5" fill="#ffffff"/>` +
        `<path d="M${x + 8} ${y - 20} C${x + 14} ${y - 28} ${x + 6} ${y - 32} ${x + 12} ${y - 38}" stroke="#ffffff" stroke-width="3" fill="none"/><path d="M${x + 12} ${y - 39} l8 1.5 l-8 1.5 Z" fill="#d9a441"/>`;
      return t + ave(200, 40) + ave(228, 30, 0.8) + ave(252, 46, 0.9) + ave(90, 52, 0.7);
    },

    occidente: (id) => {
      const x = 180, y = 140, rojo = "#b8322a", claro = "#e9e4dc";
      let t = cielo(id, "#c5e1f1", "#f2f8fb") + nube(250, 26) + cerro(104, "#6aa36a", 14) + cerro(130, "#558f55", 6, 40) +
        `<rect x="${x - 34}" y="${y - 50}" width="68" height="50" fill="${rojo}"/><path d="M${x - 34} ${y - 50} L${x} ${y - 66} L${x + 34} ${y - 50} Z" fill="${rojo}"/>` +
        [-1, 1].map((l) => { const tx = x + l * 34; return `<rect x="${tx - 10}" y="${y - 84}" width="20" height="84" fill="${rojo}"/><path d="M${tx - 12} ${y - 84} L${tx} ${y - 104} L${tx + 12} ${y - 84} Z" fill="#8f241e"/><rect x="${tx - 4}" y="${y - 76}" width="8" height="12" rx="4" fill="${claro}"/>`; }).join("") +
        `<path d="M${x - 8} ${y} V${y - 18} a8 8 0 0 1 16 0 V${y} Z" fill="#5a1f1a"/><circle cx="${x}" cy="${y - 38}" r="7" fill="${claro}"/><path d="M${x - 34} ${y - 50} H${x + 34}" stroke="${claro}" stroke-width="2"/>`;
      const cx = 282, cy = 118, r = 22, colores = ["#d9302c", "#f2c230", "#2f7fc1", "#2f9e5b"];
      t += `<rect x="${cx - 18}" y="${cy - 30}" width="66" height="18" fill="#d9302c"/><path d="M${cx - 18} ${cy - 24} H${cx + 48} M${cx - 18} ${cy - 18} H${cx + 48}" stroke="#f2c230" stroke-width="2"/><path d="M${cx + 48} ${cy - 16} L${cx + 82} ${cy - 10}" stroke="#7a5230" stroke-width="3"/>`;
      for (let i = 0; i < 8; i++) { const a1 = (i * Math.PI) / 4, a2 = ((i + 1) * Math.PI) / 4;
        t += `<path d="M${cx} ${cy} L${r1(cx + r * Math.cos(a1))} ${r1(cy + r * Math.sin(a1))} A${r} ${r} 0 0 1 ${r1(cx + r * Math.cos(a2))} ${r1(cy + r * Math.sin(a2))} Z" fill="${colores[i % 4]}"/>`; }
      return t + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#5a3a22" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="6" fill="#f6f0e2" stroke="#5a3a22" stroke-width="2"/>`;
    },

    peninsular: (id) => cielo(id, "#a8dcef", "#e8f6fb") + sol(300, 28, 12, "#fff3c4") + mar(98, "#2b9cc0", "#58b8d6") +
      `<path d="M0 30 L120 30 Q160 40 170 150 L0 150 Z" fill="#2f6f3f"/><path d="M0 30 L120 30 Q138 34 146 50 L0 50 Z" fill="#3f8a4a"/>` +
      `<g fill="#4f9a52">` + [[10, 28, 12], [32, 24, 14], [58, 27, 12], [84, 23, 14], [108, 27, 11]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("") + `</g>` +
      `<rect x="122" y="42" width="16" height="90" fill="#eaf6fb" opacity=".9"/><path d="M126 50 V128 M133 46 V130" stroke="#bfe2ef" stroke-width="2"/>` +
      `<ellipse cx="132" cy="138" rx="24" ry="6" fill="#6fc0da"/>` +
      `<path d="M168 128 Q260 118 360 126 V150 H168 Z" fill="#f1dca7"/>` + palmera(318, 140, 0.8),

    "perez-zeledon": (id) => cielo(id, "#b9d9ee", "#eef6fb") + nube(40, 26) +
      `<path d="M0 150 L60 104 L96 76 L118 88 L150 50 L172 64 L196 36 L226 70 L262 58 L320 110 L360 120 V150 Z" fill="#7d8073"/>` +
      `<path d="M196 36 L206 58 L190 80 M150 50 L158 70 L144 90" stroke="#a3a698" stroke-width="3" fill="none"/>` +
      `<ellipse cx="236" cy="96" rx="12" ry="3" fill="#6fb4d0"/>` +
      cerro(122, "#5f9a58", 10) + cerro(138, "#4a8547", 8, 60) +
      `<path d="M96 150 C130 142 150 140 178 138 S236 132 268 128 S330 124 360 125" stroke="#5aa3c4" stroke-width="4" fill="none" stroke-linecap="round"/>` +
      casita(150, 132) + casita(168, 130, "#e8eef2", "#5f7f9f") + casita(186, 132, "#f6e4c4") + casita(204, 129) + casita(222, 131, "#e8eef2") +
      pino(30, 140, 1) + pino(52, 142, 0.8) + pino(320, 140, 1.1),

    puntarenas: (id) => cielo(id, "#f1a35f", "#f8d7a0") + sol(252, 90, 24, "#f9d76b") + mar(92, "#2c7aa3", "#3f94bf") +
      `<rect x="236" y="102" width="32" height="3" rx="1.5" fill="#f9d76b" opacity=".8"/><rect x="242" y="110" width="20" height="3" rx="1.5" fill="#f9d76b" opacity=".6"/>` +
      `<path d="M58 91 H112 L107 96 H63 Z" fill="#f4f4f2"/><rect x="70" y="85" width="28" height="6" fill="#f4f4f2"/><rect x="80" y="80" width="10" height="5" fill="#f4f4f2"/>` +
      `<rect x="0" y="108" width="206" height="6" fill="#6b4a32"/><g fill="#5a3c28">` + [12, 52, 92, 132, 172, 200].map((x) => `<rect x="${x}" y="114" width="4" height="16"/>`).join("") + `</g>` +
      palmera(318, 150, 1.05),

    puriscal: (id) => { const x = 170, y = 140, gris = "#a59f94";
      return cielo(id, "#cfe1ec", "#f4f8fa") + nube(280, 30) + cerro(96, "#6f9d6a", 20) + cerro(116, "#548a58", 14, 30) + cerro(136, "#467a4a", 6, 70) +
        `<path d="M${x - 40} ${y} V${y - 44} L${x - 30} ${y - 44} L${x - 22} ${y - 50} L${x - 10} ${y - 40} L${x + 4} ${y - 52} L${x + 20} ${y - 44} H${x + 40} V${y} Z" fill="${gris}"/>` +
        `<rect x="${x + 16}" y="${y - 92}" width="18" height="48" fill="${gris}"/><path d="M${x + 14} ${y - 92} L${x + 25} ${y - 108} L${x + 36} ${y - 92} Z" fill="#8a8479"/>` +
        `<path d="M${x - 4} ${y - 52} L${x + 2} ${y - 36} L${x - 4} ${y - 24} L${x + 3} ${y - 10}" stroke="#4f4a43" stroke-width="2" fill="none"/>` +
        `<path d="M${x - 26} ${y} V${y - 18} a8 8 0 0 1 16 0 V${y} Z" fill="#5f574d"/><rect x="${x + 21}" y="${y - 84}" width="8" height="12" rx="4" fill="#5f574d"/>` +
        `<g fill="#5d9a52"><circle cx="${x - 40}" cy="${y - 4}" r="6"/><circle cx="${x + 40}" cy="${y - 6}" r="7"/><circle cx="${x + 8}" cy="${y - 50}" r="3.5"/></g>` +
        // la paila de chicharrones al fuego
        `<g fill="#7a7068"><rect x="262" y="138" width="9" height="9" rx="2"/><rect x="309" y="138" width="9" height="9" rx="2"/></g>` +
        `<path d="M276 147 L281 135 L285 143 L290 131 L295 143 L299 135 L304 147 Z" fill="#f08a24"/><path d="M283 147 L287 139 L290 144 L293 139 L297 147 Z" fill="#f7c948"/>` +
        `<path d="M250 118 H330 Q327 134 290 137 Q253 134 250 118 Z" fill="#2b2b2b"/><ellipse cx="290" cy="118" rx="40" ry="6" fill="#3d3a37"/>` +
        `<g fill="#b8692a">` + [[266, 116, 8, 4, -10], [281, 114, 9, 4.5, 15], [297, 115, 8, 4, -20], [313, 116, 8, 4, 10]].map(([cx, cy, rx, ry, g]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${g} ${cx} ${cy})"/>`).join("") + `</g>` +
        `<g fill="#d99a45">` + [[273, 113, 6, 3, 20], [289, 112, 7, 3.5, -15], [305, 112, 6, 3, 25]].map(([cx, cy, rx, ry, g]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${g} ${cx} ${cy})"/>`).join("") + `</g>` +
        `<path d="M318 110 L336 92" stroke="#8a5a32" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M276 104 q-4 -6 0 -12 q4 -6 0 -12 M296 102 q-4 -6 0 -12 q4 -6 0 -12" stroke="#ffffff" stroke-width="1.6" fill="none" opacity=".7"/>`; },

    "san-carlos": (id) => cielo(id, "#bfe2f2", "#eef7fb") + nube(40, 30) +
      `<path d="M106 150 L195 34 L205 34 L294 150 Z" fill="#5f6a62"/><path d="M195 34 L205 34 L222 60 L184 60 Z" fill="#4c564f"/>` + humo(200, 26, "#ffffff", 0.65) +
      cerro(122, "#79b05f", 8) + cerro(136, "#5f9a4c", 6, 50) +
      `<path d="M0 132 H360" stroke="#8a6a4a" stroke-width="1.5"/>` + [20, 70, 120, 240, 290, 340].map((x) => `<rect x="${x}" y="126" width="2" height="10" fill="#8a6a4a"/>`).join("") +
      vaca(78, 146) + vaca(276, 148, 0.85),

    "santa-cruz": (id) => {
      let t = cielo(id, "#f3d39a", "#fbefd8") + sol(300, 28, 13, "#fff3c4") + cerro(110, "#c9b07a", 8) + cerro(126, "#d9bf8a", 4, 40);
      const x = 130, y = 142;
      t += `<path d="M${x - 60} ${y} L${x - 52} ${y - 30} M${x + 60} ${y} L${x + 52} ${y - 30}" stroke="#6b4a32" stroke-width="4"/><path d="M${x - 64} ${y - 30} L${x + 64} ${y - 38}" stroke="#6b4a32" stroke-width="5"/>`;
      for (let i = 0; i < 11; i++) { const alto = 30 - i * 1.6; t += `<rect x="${x - 56 + i * 11}" y="${r1(y - 34 - i * 0.7 - alto / 2)}" width="8" height="${r1(alto)}" rx="2" fill="${i % 2 ? "#b77a3c" : "#c98d4b"}"/>`; }
      const v = 262, w = 140;
      return t + `<ellipse cx="${v}" cy="${w - 20}" rx="22" ry="20" fill="#e6c8a0"/><rect x="${v - 10}" y="${w - 46}" width="20" height="10" fill="#e6c8a0"/><ellipse cx="${v}" cy="${w - 46}" rx="12" ry="3" fill="#c9a77c"/>` +
        `<path d="M${v - 20} ${w - 26} H${v + 20} M${v - 21} ${w - 15} H${v + 21}" stroke="#1f1f1f" stroke-width="2"/><path d="M${v - 16} ${w - 20} l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4 l4 -4" stroke="#b5533c" stroke-width="2" fill="none"/>`;
    },

    sarapiqui: (id) => {
      let t = cielo(id, "#c2e3d8", "#eef8f3") + cerro(94, "#2e7346", 18);
      for (const [x, s] of [[20, 1.2], [56, 1], [90, 1.3], [128, 1.1], [180, 1.2], [214, 1]]) t += arbol(x, 124, s, "#2f7a40");
      t += rio(132, "#4fa3c4");
      const x = 280, y = 120;
      return t + `<ellipse cx="${x}" cy="${y + 4}" rx="34" ry="9" fill="#2f7d3c"/><path d="M${x - 34} ${y + 4} H${x + 34}" stroke="#4f9d55" stroke-width="1"/>` +
        `<ellipse cx="${x}" cy="${y - 4}" rx="11" ry="8" fill="#5cb85c"/><circle cx="${x - 6}" cy="${y - 11}" r="4" fill="#5cb85c"/><circle cx="${x + 6}" cy="${y - 11}" r="4" fill="#5cb85c"/>` +
        `<circle cx="${x - 6}" cy="${y - 11}" r="2.6" fill="#d9302c"/><circle cx="${x + 6}" cy="${y - 11}" r="2.6" fill="#d9302c"/><circle cx="${x - 6}" cy="${y - 11}" r="1" fill="#111"/><circle cx="${x + 6}" cy="${y - 11}" r="1" fill="#111"/>` +
        `<path d="M${x - 10} ${y + 1} l-6 4 M${x + 10} ${y + 1} l6 4" stroke="#f08a24" stroke-width="2.4" stroke-linecap="round"/>`;
    },

    "sj-central": (id) => { const x = 180, y = 134, piedra = "#efe7d6", sombra = "#d8ccb4";
      let t = cielo(id, "#c9def0", "#f1f6fb") + nube(40, 28) + nube(290, 22, 0.8) + `<rect y="${y}" width="360" height="16" fill="#d8d2c4"/>` +
        arbol(36, 136, 1.3, "#4f8a4c") + arbol(326, 136, 1.3, "#4f8a4c") +
        `<rect x="${x - 70}" y="${y - 6}" width="140" height="6" fill="${sombra}"/><rect x="${x - 64}" y="${y - 52}" width="128" height="46" fill="${piedra}"/>` +
        `<path d="M${x - 70} ${y - 52} L${x} ${y - 74} L${x + 70} ${y - 52} Z" fill="${piedra}"/><path d="M${x - 50} ${y - 56} L${x} ${y - 70} L${x + 50} ${y - 56} Z" fill="${sombra}"/><path d="M${x - 70} ${y - 52} H${x + 70}" stroke="${sombra}" stroke-width="3"/>`;
      for (let i = 0; i < 6; i++) t += `<rect x="${x - 54 + i * 20}" y="${y - 50}" width="7" height="44" fill="${sombra}"/>`;
      return t + `<g fill="#b9a27a"><rect x="${x - 3}" y="${y - 86}" width="6" height="12"/><rect x="${x - 67}" y="${y - 62}" width="5" height="10"/><rect x="${x + 62}" y="${y - 62}" width="5" height="10"/></g>`; },

    "sj-norte": (id) => { const x = 180, y = 140, gris = "#9aa3ab", osc = "#6f7880";
      return cielo(id, "#cfe0ee", "#f3f7fb") + nube(60, 28) + cerro(104, "#6d9d72", 16) + cerro(128, "#5a8d60", 6, 40) +
        `<rect x="${x - 36}" y="${y - 54}" width="72" height="54" fill="${gris}"/><path d="M${x - 36} ${y - 54} L${x} ${y - 74} L${x + 36} ${y - 54} Z" fill="${osc}"/>` +
        `<rect x="${x - 10}" y="${y - 100}" width="20" height="46" fill="${gris}"/><path d="M${x - 11} ${y - 100} L${x} ${y - 128} L${x + 11} ${y - 100} Z" fill="${osc}"/>` +
        [-1, 1].map((l) => `<path d="M${x + l * 36 - 5} ${y - 54} L${x + l * 36} ${y - 72} L${x + l * 36 + 5} ${y - 54} Z" fill="${osc}"/>`).join("") +
        `<circle cx="${x}" cy="${y - 40}" r="8" fill="#c7d2dc" stroke="${osc}" stroke-width="1.5"/><path d="M${x - 8} ${y} V${y - 16} L${x} ${y - 26} L${x + 8} ${y - 16} V${y} Z" fill="#4f565c"/>` +
        `<path d="M${x - 26} ${y - 14} V${y - 30} L${x - 22} ${y - 36} L${x - 18} ${y - 30} V${y - 14} Z M${x + 18} ${y - 14} V${y - 30} L${x + 22} ${y - 36} L${x + 26} ${y - 30} V${y - 14} Z" fill="#4f565c"/>` +
        `<path d="M${x - 6} ${y - 86} L${x} ${y - 94} L${x + 6} ${y - 86} V${y - 76} H${x - 6} Z" fill="#4f565c"/>`; },

    "sj-oeste": (id) => { let t = cielo(id, "#2b3a67", "#7a7fb3") + `<circle cx="270" cy="44" r="22" fill="#f6efc8"/>` +
        `<g fill="#1d2340" transform="translate(262 46)"><path d="M-22 6 L24 -2" stroke="#1d2340" stroke-width="2.4"/><path d="M24 -2 l9 -5 l-2 7 l7 2 l-9 1 Z"/><path d="M-6 4 q-3 -10 4 -15 l8 4 q3 7 -1 12 Z"/><path d="M-4 -10 l-7 -1 l11 -12 l4 12 Z"/></g>` +
        [[158, 93, 36, 15], [190, 99, 36, 55], [222, 105, 32, 95]].map(([x, y, alto, giro]) => eolica(x, y, alto, giro, "#c9d1dc", "#1d2340", "#e5484d")).join("") +
        cerro(96, "#2f4f45", 22) + cerro(116, "#3e6656", 14, 40) + cerro(136, "#2e4f42", 6, 70);
      for (const [x, y] of [[40, 128], [62, 132], [86, 126], [120, 134], [210, 130], [236, 134], [300, 128], [328, 132]]) t += `<rect x="${x}" y="${y}" width="4" height="3" fill="#f2c230"/>`;
      return t + [30, 70, 130, 330].map((x, i) => `<circle cx="${x}" cy="${18 + (i % 2) * 14}" r="1.2" fill="#ffffff"/>`).join(""); },

    sula: (id) => { const x = 130, y = 140;
      return cielo(id, "#cde8dc", "#f1f8f3") + nube(260, 26) + cerro(98, "#3a7d4c", 16) + cerro(124, "#4c9257", 8, 40) +
        `<path d="M${x - 34} ${y} L${x} ${y - 66} L${x + 34} ${y} Z" fill="#b8955a"/>` +
        [16, 32, 48].map((d) => `<path d="M${r1(x - 34 * d / 66)} ${y - 66 + d} H${r1(x + 34 * d / 66)}" stroke="#8f6f3c" stroke-width="1.5"/>`).join("") +
        `<path d="M${x - 6} ${y} V${y - 14} H${x + 6} V${y} Z" fill="#5a4026"/><path d="M${x} ${y - 66} V${y - 74}" stroke="#8f6f3c" stroke-width="2"/>` +
        `<rect x="257" y="${y - 50}" width="6" height="50" fill="#6b4a32"/><circle cx="260" cy="${y - 58}" r="20" fill="#3f8a4a"/><circle cx="246" cy="${y - 48}" r="12" fill="#357a40"/><circle cx="274" cy="${y - 48}" r="12" fill="#357a40"/>` +
        [[-7, -30, "#d98b2b"], [7, -22, "#c2541f"], [-5, -14, "#e0a83a"]].map(([dx, dy, c]) => `<ellipse cx="${260 + dx}" cy="${y + dy}" rx="4" ry="7" fill="${c}"/>`).join(""); },

    // El contorno y las sedes son aproximados (longitud, latitud a ojo de mapa): es un boceto.
    nacional: (id) => {
      const P = (lon, lat) => `${r1(108 + (lon + 85.95) * 42.4)} ${r1(6 + (11.22 - lat) * 43)}`;
      return cielo(id, "#bfe3f2", "#9cd0e6") +
        `<path d="M${CR_CONTORNO.map(([lo, la]) => P(lo, la)).join(" L")} Z" fill="#6aa85f" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>` +
        Object.entries(CR_SEDES).map(([clave, [lo, la]]) => { const [x, y] = P(lo, la).split(" ");
          return `<circle cx="${x}" cy="${y}" r="2.4" fill="#de911d" stroke="#ffffff" stroke-width=".8"><title>${FONDOS[clave].nombre}</title></circle>`; }).join("") +
        `<text x="24" y="132" font-size="10" font-style="italic" fill="#235f7c">Océano Pacífico</text><text x="270" y="32" font-size="10" font-style="italic" fill="#235f7c">Mar Caribe</text>` +
        `<g transform="translate(46 40)" fill="#235f7c"><path d="M0 -14 L3 0 L0 14 L-3 0 Z"/><path d="M-14 0 L0 -3 L14 0 L0 3 Z" opacity=".6"/><text x="-3.5" y="-17" font-size="9">N</text></g>`;
    },

    "escuela-laboratorio": (id) => {
      const engranaje = (cx, cy, r, dientes, c) => { let d = "";
        for (let i = 0; i < dientes * 2; i++) { const a1 = (i * Math.PI) / dientes, a2 = ((i + 1) * Math.PI) / dientes, rr = i % 2 === 0 ? r : r * 0.78;
          d += `${i === 0 ? "M" : "L"}${r1(cx + rr * Math.cos(a1))} ${r1(cy + rr * Math.sin(a1))} L${r1(cx + rr * Math.cos(a2))} ${r1(cy + rr * Math.sin(a2))} `; }
        return `<path d="${d}Z" fill="${c}"/><circle cx="${cx}" cy="${cy}" r="${r1(r * 0.32)}" fill="#e9eef1"/>`; };
      let t = cielo(id, "#c8e3f2", "#f1f8fb") + nube(210, 24) + cerro(112, "#6aa36a", 10) + cerro(134, "#558f55", 6, 40) +
        `<rect x="66" y="40" width="3" height="100" fill="#8a8f94"/>` +
        `<rect x="69" y="42" width="40" height="4" fill="#002b7f"/><rect x="69" y="46" width="40" height="4" fill="#ffffff"/><rect x="69" y="50" width="40" height="8" fill="#ce1126"/>` +
        `<rect x="69" y="58" width="40" height="4" fill="#ffffff"/><rect x="69" y="62" width="40" height="4" fill="#002b7f"/>` +
        `<path d="M124 96 L136 80 H284 L296 96 Z" fill="#c8643a"/><rect x="130" y="96" width="160" height="44" fill="#f4efe6"/>`;
      for (const x of [140, 162, 184, 236, 258, 280]) t += `<rect x="${x - 7}" y="106" width="14" height="12" fill="#9fc3dc" stroke="#d8cfbf" stroke-width="1.5"/>`;
      return t + `<rect x="196" y="100" width="28" height="8" rx="1.5" fill="#1f4f8f"/><path d="M201 140 V118 H219 V140 Z" fill="#7d5c40"/>` +
        arbol(112, 142, 1.1, "#4f8a4c") + engranaje(318, 102, 22, 8, "#5f6b75") + engranaje(344, 127, 12, 6, "#8a96a0");
    },

    turrialba: (id) => cielo(id, "#cde2e6", "#eef5f1") +
      `<path d="M50 112 L168 48 L196 44 L224 48 L340 112 Z" fill="#6e6965"/><path d="M168 48 L196 44 L224 48 L214 55 L178 55 Z" fill="#524d4a"/>` +
      `<g fill="#9b9692" opacity=".85"><circle cx="200" cy="34" r="8"/><circle cx="212" cy="22" r="11"/><circle cx="228" cy="12" r="13"/><circle cx="248" cy="8" r="10"/></g>` +
      `<path d="M0 116 Q70 96 140 114 T280 108 T360 112 V150 H0 Z" fill="#3f7d45"/>` +
      pino(38, 118) + pino(72, 116, 1.1) + pino(302, 112) + pino(332, 114, 0.9) +
      `<path d="M0 136 C80 122 150 144 230 130 S320 120 360 128 V150 H0 Z" fill="#4c9cc2"/><path d="M0 142 C90 130 160 150 240 138 S330 130 360 136" stroke="#e6f3f8" stroke-width="2" fill="none" opacity=".7"/>` +
      `<ellipse cx="150" cy="138" rx="13" ry="4" fill="#f2c230"/><circle cx="144" cy="134" r="2.5" fill="#d9483b"/><circle cx="152" cy="133" r="2.5" fill="#d9483b"/><circle cx="160" cy="134" r="2.5" fill="#d9483b"/>`,
  };

  /* ---------- cada fondo: su nombre y lo que muestra (en el orden de la lista del MEP) ---------- */
  const FONDOS = {
    alajuela: { nombre: "Alajuela", leyenda: "Volcán Poás y los mangos del parque" },
    canas: { nombre: "Cañas", leyenda: "Llanura guanacasteca, ganado y el río Corobicí" },
    cartago: { nombre: "Cartago", leyenda: "La Basílica de los Ángeles frente al Irazú" },
    "central-pacifico": { nombre: "Central del Pacífico", leyenda: "El puente de los cocodrilos del río Tárcoles" },
    coto: { nombre: "Coto", leyenda: "Golfo Dulce y las palmas" },
    desamparados: { nombre: "Desamparados", leyenda: "Los cerros del sur y su iglesia" },
    guapiles: { nombre: "Guápiles", leyenda: "Bananales y las tortugas de Tortuguero" },
    "grande-terraba": { nombre: "Grande de Térraba", leyenda: "La máscara boruca y el río Térraba" },
    heredia: { nombre: "Heredia", leyenda: "El Fortín entre cafetales" },
    liberia: { nombre: "Liberia", leyenda: "El árbol de guanacaste y el Rincón de la Vieja" },
    limon: { nombre: "Limón", leyenda: "El Caribe, las palmeras y el Carnaval" },
    "los-santos": { nombre: "Los Santos", leyenda: "Café de altura y el quetzal" },
    nicoya: { nombre: "Nicoya", leyenda: "La iglesia colonial de San Blas" },
    "norte-norte": { nombre: "Norte–Norte", leyenda: "El humedal de Caño Negro y sus aves" },
    occidente: { nombre: "Occidente", leyenda: "La iglesia de metal de Grecia y una carreta de Sarchí" },
    peninsular: { nombre: "Peninsular", leyenda: "Las cataratas de Montezuma y la playa" },
    "perez-zeledon": { nombre: "Pérez Zeledón", leyenda: "El cerro Chirripó sobre el Valle del General" },
    puntarenas: { nombre: "Puntarenas", leyenda: "El muelle al atardecer en el golfo" },
    puriscal: { nombre: "Puriscal", leyenda: "La iglesia vieja, los cerros y sus chicharrones" },
    "san-carlos": { nombre: "San Carlos", leyenda: "El volcán Arenal y las lecherías" },
    "santa-cruz": { nombre: "Santa Cruz", leyenda: "La marimba y la cerámica de Guaitil" },
    sarapiqui: { nombre: "Sarapiquí", leyenda: "El río, la selva y la rana de ojos rojos" },
    "sj-central": { nombre: "SJ Central", leyenda: "El Teatro Nacional" },
    "sj-norte": { nombre: "SJ Norte", leyenda: "La iglesia de Coronado" },
    "sj-oeste": { nombre: "SJ Oeste", leyenda: "Los cerros de Escazú, la leyenda de sus brujas y las eólicas de Salitral" },
    sula: { nombre: "Sulá", leyenda: "La casa cónica bribri y el cacao" },
    turrialba: { nombre: "Turrialba", leyenda: "El volcán Turrialba y el río Pacuare" },
    nacional: { nombre: "Nacional", titulo: "Asesoría Nacional del MEP", leyenda: "Costa Rica con sus 27 Direcciones Regionales" },
    "escuela-laboratorio": { nombre: "Escuela Laboratorio", titulo: "Escuela Laboratorio", leyenda: "La escuela, la bandera y el engranaje de la enseñanza técnica" },
  };
  // Las 27 regionales, numeradas en este orden en el mapa grande (el mismo del PDF de revisión).
  const REGIONALES = Object.keys(FONDOS).filter((c) => CR_SEDES[c]);

  const titulo = (clave) => FONDOS[clave].titulo || "Dirección Regional de " + FONDOS[clave].nombre;

  let cuenta = 0;
  function svg(clave) {
    cuenta += 1;
    return `<svg viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice" class="block w-full h-full" role="img" aria-label="${FONDOS[clave].leyenda}">${DIBUJOS[clave]("fr" + cuenta)}</svg>`;
  }

  /* ---------- el mapa grande: cada regional con su número; las del Valle Central, en un recuadro ---------- */
  function mapaGrande() {
    const numero = (clave) => REGIONALES.indexOf(clave) + 1;
    const P = (lon, lat) => [r1(29 + (lon + 85.95) * 147.75), r1(36 + (11.22 - lat) * 150)];
    const punto = ([x, y], clave) => `<g><title>${numero(clave)}. ${FONDOS[clave].nombre}</title>` +
      `<circle cx="${x}" cy="${y}" r="9" fill="#102a43" stroke="#ffffff" stroke-width="1.5"/>` +
      `<text x="${x}" y="${r1(y + 3.5)}" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">${numero(clave)}</text></g>`;
    const V = { lonMin: -84.25, lonMax: -84.01, latMin: 9.87, latMax: 10.05 };
    const [vx1, vy1] = P(V.lonMin, V.latMax), [vx2, vy2] = P(V.lonMax, V.latMin);
    const caja = { x: 22, y: 320, w: 240, h: 192 }, k = 760;
    const Q = (lon, lat) => [r1(caja.x + 24 + (lon - V.lonMin) * k * 0.985), r1(caja.y + 42 + (V.latMax - lat) * k)];
    let t = `<rect width="560" height="530" fill="#cfe8f3"/>` +
      `<path d="M${CR_CONTORNO.map(([lo, la]) => P(lo, la).join(" ")).join(" L")} Z" fill="#7fb874" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>` +
      `<g font-size="11" letter-spacing="2" fill="#5a6f7c"><text x="110" y="24">NICARAGUA</text><text x="494" y="440">PANAMÁ</text></g>` +
      `<g font-size="13" font-style="italic" fill="#235f7c"><text x="296" y="492">Océano Pacífico</text><text x="420" y="120">Mar Caribe</text></g>` +
      `<rect x="${vx1 - 5}" y="${vy1 - 5}" width="${r1(vx2 - vx1 + 10)}" height="${r1(vy2 - vy1 + 10)}" rx="5" fill="none" stroke="#102a43" stroke-width="1.5" stroke-dasharray="4 3"/>` +
      `<path d="M${vx1 - 5} ${r1(vy2 + 5)} L${caja.x + caja.w} ${caja.y}" stroke="#102a43" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    t += REGIONALES.filter((c) => !VALLE_CENTRAL.includes(c)).map((c) => punto(P(...CR_SEDES[c]), c)).join("");
    t += `<rect x="${caja.x}" y="${caja.y}" width="${caja.w}" height="${caja.h}" rx="10" fill="#e6f1e1" stroke="#102a43" stroke-width="1.5"/>` +
      `<text x="${caja.x + 12}" y="${caja.y + 22}" font-size="12" font-weight="700" fill="#102a43">Valle Central (ampliado)</text>` +
      VALLE_CENTRAL.map((c) => punto(Q(...CR_SEDES[c]), c)).join("");
    const lista = REGIONALES.map((c) =>
      `<li class="flex items-center gap-2 py-0.5 break-inside-avoid"><span class="inline-grid place-items-center min-w-[1.5rem] h-6 rounded-full bg-brand-800 text-white dark:bg-brand-200 dark:text-brand-900 text-xs font-bold">${numero(c)}</span>${FONDOS[c].nombre}${VALLE_CENTRAL.includes(c) ? ` <span class="text-xs text-brand-500 dark:text-brand-300">· recuadro</span>` : ""}</li>`).join("");
    return `<div class="rounded-xl overflow-hidden border border-brand-100 dark:border-brand-800"><svg viewBox="0 0 560 530" class="block w-full h-auto" role="img" aria-label="Mapa de Costa Rica con las 27 Direcciones Regionales numeradas">${t}</svg></div>` +
      `<ol id="fondo-region-lista" class="columns-2 gap-6 text-sm text-brand-800 dark:text-brand-100">${lista}</ol>`;
  }

  /** Pinta la franja de esa clave en el contenedor (la sección de clases.html).
   *  Todo el HTML sale de este archivo: la clave de la base solo elige uno de FONDOS. */
  function pintar(cont, clave) {
    const f = FONDOS[clave];
    cont.innerHTML =
      `<div class="md:flex">` +
        `<div class="md:w-96 md:shrink-0 aspect-[12/5]">${svg(clave)}</div>` +
        `<div class="p-4 md:p-6 flex flex-col justify-center gap-1 min-w-0">` +
          `<h2 id="fondo-region-titulo" class="font-serif text-lg md:text-xl font-bold text-brand-800 dark:text-white">${titulo(clave)}</h2>` +
          `<p id="fondo-region-leyenda" class="text-sm text-brand-500 dark:text-brand-300">${f.leyenda}</p>` +
        `</div>` +
      `</div>` +
      (clave === "nacional"
        ? `<details id="fondo-region-mapa" class="border-t border-brand-100 dark:border-brand-800">` +
            `<summary class="cursor-pointer px-4 md:px-6 py-3 text-sm font-semibold text-brand-700 dark:text-brand-200 rounded-b-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">¿Qué regional es cada punto?</summary>` +
            `<div class="px-4 md:px-6 pb-5 grid gap-5 md:grid-cols-[minmax(0,32rem)_1fr] items-start">${mapaGrande()}</div>` +
          `</details>`
        : "");
    cont.hidden = false;
  }

  async function arrancar() {
    const cont = document.getElementById("fondo-region");
    const sb = window.sb;
    if (!cont || !sb || !sb.auth || typeof sb.from !== "function") return;
    const { data: ses } = await sb.auth.getSession();
    const uid = ses && ses.session && ses.session.user && ses.session.user.id;
    if (!uid) return;
    const { data, error } = await sb.from("fondos_region").select("fondo").eq("persona_id", uid).maybeSingle();
    if (error || !data || !Object.prototype.hasOwnProperty.call(FONDOS, data.fondo)) return;
    pintar(cont, data.fondo);
  }

  window.FondoRegion = { claves: Object.keys(FONDOS), titulo, svg, pintar };

  function inicio() {
    arrancar().catch((e) => console.warn("fondo-region:", e && e.message ? e.message : e));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio);
  else inicio();
})();
