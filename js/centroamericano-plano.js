/* El plano de la sala de juego del Centroamericano 2026: dónde está cada mesa.
 *
 * El plano se guarda en salas_torneo.plano (la organización lo corrige en
 * centroamericano-mesas.html, pestaña «Plano de la sala», con
 * sala_plano_guardar()) y esta página lo lee con la misma política de la sala.
 * Lo usan las dos páginas, por eso está acá una sola vez:
 *
 *   { v: 1, frente: "…", fondo: "…",
 *     filas: [                      // la 1 es la de adelante (la más cerca de la gradería)
 *       { grupos: [                 // de derecha a izquierda, mirando hacia el fondo
 *           { torneo: "Sub-18 Femenino",              // el texto del enlace de la sala
 *             mesas: [ { t: [1, 2], duda: false } ] } // t: tablero de la derecha, el de la izquierda
 *       ] } ] }
 *
 * Entre un grupo y el siguiente hay un pasillo. Un tablero es el número de
 * mesa de chess-results; una mesa de verdad tiene dos. Lo que se dedujo y
 * nadie confirmó lleva `duda`: el editor lo marca para que se revise, y la
 * página pública no lo distingue (lo que se publica es lo que hay).
 * Ver «El plano de la sala» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const LLAVE_GUARDADO = "cac_plano_v1";
  // Medidas del dibujo (en unidades del SVG): cada mesa, el espacio entre
  // mesas de un mismo grupo, el pasillo entre grupos y cada fila.
  const M = { ancho: 46, alto: 30, junta: 3, pasillo: 20, fila: 40, rotulo: 170, margen: 14, cabeza: 34, pie: 34 };
  // Colores de las mesas por torneo, claros, con la letra oscura (#102a43):
  // todos pasan 7:1 con ella. El color nunca va solo: cada fila dice su torneo.
  const COLORES = ["#fde68a", "#bfdbfe", "#bbf7d0", "#fbcfe8", "#ddd6fe", "#fed7aa", "#a5f3fc", "#e5e7eb", "#fecaca", "#d9f99d", "#c7d2fe", "#f5d0fe"];
  const TINTA = "#102a43";
  const MARCA = "#b91c1c";

  const TEXTOS = {
    es: {
      donde: (f, k) => "📍 En la sala: fila " + f + " · la " + k + ".ª mesa desde la derecha",
      ayuda: (frente, fondo) => "Las filas se cuentan desde " + frente + ", mirando hacia " + fondo + ".",
      fila: (n) => "Fila " + n,
      frente: "Frente",
      fondo: "Fondo",
      dibujo: (n) => "Plano de la sala de juego: " + n + " filas de mesas.",
      dibujoMarca: (f, k) => "Plano de la sala con la mesa marcada en la fila " + f + ", la " + k + ".ª desde la derecha.",
      filaTexto: (n, torneos, desde, hasta) => "Fila " + n + ": " + torneos + (desde ? ", mesas " + desde + " a " + hasta : "") + ".",
      sinPlano: "El plano de la sala todavía no está listo.",
      tablero: (n) => "Mesa " + n,
    },
    en: {
      donde: (f, k) => "📍 In the hall: row " + f + " · table " + k + " from the right",
      ayuda: (frente, fondo) => "Rows are counted from " + frente + ", facing " + fondo + ".",
      fila: (n) => "Row " + n,
      frente: "Front",
      fondo: "Back",
      dibujo: (n) => "Map of the playing hall: " + n + " rows of tables.",
      dibujoMarca: (f, k) => "Map of the hall with the table marked in row " + f + ", " + k + " from the right.",
      filaTexto: (n, torneos, desde, hasta) => "Row " + n + ": " + torneos + (desde ? ", boards " + desde + " to " + hasta : "") + ".",
      sinPlano: "The map of the hall is not ready yet.",
      tablero: (n) => "Board " + n,
    },
  };
  const idioma = () => (["es", "en", "fr"].indexOf(document.documentElement.lang) !== -1 ? document.documentElement.lang : "es");
  // El francés está en js/centroamericano-fr.js (sin él, en español).
  const t = (lang) => {
    const l = lang || idioma();
    if (l === "fr" && window.CentroamericanoFR && window.CentroamericanoFR.plano) return window.CentroamericanoFR.plano;
    return TEXTOS[l] || TEXTOS.es;
  };

  /* ---------------- el plano como datos ---------------- */

  const numero = (v) => (Number.isInteger(v) && v > 0 && v < 1000 ? v : null);

  // Deja el plano con la forma de arriba, sin nada de más: lo que llega de la
  // base (o del editor) se lee siempre por acá.
  function limpiar(p) {
    if (!p || typeof p !== "object" || !Array.isArray(p.filas)) return null;
    const texto = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");
    return {
      v: 1,
      frente: texto(p.frente, 80) || "la cancha libre (la mascota)",
      fondo: texto(p.fondo, 80) || "la bandera de Costa Rica",
      filas: p.filas.slice(0, 60).map((f) => ({
        grupos: (f && Array.isArray(f.grupos) ? f.grupos : []).slice(0, 30).map((g) => ({
          torneo: texto(g && g.torneo, 60),
          mesas: (g && Array.isArray(g.mesas) ? g.mesas : []).slice(0, 60).map((m) => ({
            t: (m && Array.isArray(m.t) ? m.t : []).slice(0, 2).map(numero),
            duda: !!(m && m.duda),
          })),
        })),
      })),
    };
  }

  // Las mesas de una fila en orden, de derecha a izquierda, con su grupo.
  function mesasDeFila(fila) {
    const lista = [];
    fila.grupos.forEach((g, gi) => g.mesas.forEach((m, mi) => lista.push({ g, gi, m, mi })));
    return lista;
  }

  // Dónde está el tablero `n` del torneo `torneo`: la fila (desde adelante) y
  // la mesa contando desde la derecha. Sin plano o sin esa mesa, null.
  function ubicar(plano, torneo, n) {
    const p = limpiar(plano);
    if (!p || !torneo || !numero(n)) return null;
    for (let fi = 0; fi < p.filas.length; fi++) {
      const mesas = mesasDeFila(p.filas[fi]);
      for (let k = 0; k < mesas.length; k++) {
        const x = mesas[k];
        if (x.g.torneo === torneo && x.m.t.indexOf(n) !== -1) return { fila: fi + 1, desdeDerecha: k + 1, mesasEnFila: mesas.length, grupo: x.gi, mesa: x.mi };
      }
    }
    return null;
  }

  // El primer plano, para que la organización lo corrija: una fila por
  // torneo, en el orden dado, con la forma de la sala del Gimnasio Nacional
  // tal como la contó el dueño el 6/11/2026 (la primera fila: una mesa sola,
  // pasillo, dos juntas; las demás siguen con mesas sueltas entre pasillos).
  // Todo lo que no se confirmó sale con su duda. torneos: [{ torneo, tableros }].
  function borrador(torneos, confirmadas) {
    const filas = torneos.map((x, i) => {
      const grupos = [];
      let n = 1;
      const duda = !(confirmadas && confirmadas.indexOf(i) !== -1);
      const mesa = () => { const m = { t: [n, n + 1 <= x.tableros ? n + 1 : null], duda }; n += 2; return m; };
      const formas = [1, 2];
      while (n <= x.tableros) {
        const cuantas = formas.length ? formas.shift() : 1;
        const g = { torneo: x.torneo, mesas: [] };
        for (let k = 0; k < cuantas && n <= x.tableros; k++) g.mesas.push(mesa());
        grupos.push(g);
      }
      return { grupos };
    });
    return limpiar({ filas });
  }

  // Cuántas mesas faltan por revisar.
  function dudas(plano) {
    const p = limpiar(plano);
    if (!p) return 0;
    return p.filas.reduce((s, f) => s + mesasDeFila(f).filter((x) => x.m.duda).length, 0);
  }

  // Lo que está mal y no deja guardar: un tablero repetido en el mismo torneo.
  function problemas(plano) {
    const p = limpiar(plano);
    if (!p) return ["El plano no tiene filas."];
    const vistos = new Map();
    const malos = [];
    p.filas.forEach((f, fi) => mesasDeFila(f).forEach((x) => x.m.t.forEach((n) => {
      if (!n || !x.g.torneo) return;
      const clave = x.g.torneo + "|" + n;
      if (vistos.has(clave)) malos.push("La mesa " + n + " de " + x.g.torneo + " está dos veces (filas " + vistos.get(clave) + " y " + (fi + 1) + ").");
      else vistos.set(clave, fi + 1);
    })));
    return malos;
  }

  // Los torneos de una fila, en orden, y la primera y última mesa de cada uno.
  function resumenFila(fila) {
    const por = new Map();
    mesasDeFila(fila).forEach((x) => {
      if (!x.g.torneo) return;
      const r = por.get(x.g.torneo) || { torneo: x.g.torneo, desde: Infinity, hasta: -Infinity };
      x.m.t.forEach((n) => { if (n) { r.desde = Math.min(r.desde, n); r.hasta = Math.max(r.hasta, n); } });
      por.set(x.g.torneo, r);
    });
    return [...por.values()];
  }

  /* ---------------- el dibujo ---------------- */

  function nodo(tag, attrs, texto) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    if (texto != null) n.textContent = texto;
    return n;
  }

  // El SVG del plano. opciones: marca {torneo, tablero} (la mesa del jugador),
  // chico (para la tarjeta: sin rótulos de torneo), editor (con las dudas y
  // cada mesa tocable: alTocar(fi, gi, mi)), elegida {fi, gi, mi}, zonas
  // (Map «fi-gi-mi» → número de zona: cada mesa con el color de su zona y
  // «Z3» escrito encima, para el reparto de los árbitros).
  function dibujar(plano, opciones) {
    const op = opciones || {};
    const p = limpiar(plano);
    const tx = t();
    if (!p) return null;
    const colores = new Map();
    const color = (torneo) => {
      if (!colores.has(torneo)) colores.set(torneo, COLORES[colores.size % COLORES.length]);
      return colores.get(torneo);
    };
    const anchoFila = (f) => f.grupos.reduce((s, g, gi) => s + g.mesas.length * M.ancho + Math.max(0, g.mesas.length - 1) * M.junta + (gi ? M.pasillo : 0), 0);
    const mas = Math.max(M.ancho, ...p.filas.map(anchoFila));
    const rotulo = op.chico ? 64 : M.rotulo;
    const ancho = M.margen * 2 + rotulo + mas;
    const alto = M.cabeza + p.filas.length * M.fila + M.pie;
    const svg = nodo("svg", { viewBox: "0 0 " + ancho + " " + alto, class: "cac-plano-svg", role: "img", focusable: "false" });
    svg.appendChild(nodo("rect", { x: 0, y: 0, width: ancho, height: alto, rx: 10, fill: "#f8fafc", stroke: "#cbd5e1" }));
    // Arriba el fondo de la sala, abajo el frente (la fila 1).
    svg.appendChild(nodo("text", { x: ancho / 2, y: 22, "text-anchor": "middle", "font-size": 14, "font-weight": 700, fill: TINTA }, tx.fondo + ": " + p.fondo));
    svg.appendChild(nodo("text", { x: ancho / 2, y: alto - 12, "text-anchor": "middle", "font-size": 14, "font-weight": 700, fill: TINTA }, tx.frente + ": " + p.frente));
    let ubicada = null;
    p.filas.forEach((f, fi) => {
      const y = M.cabeza + (p.filas.length - 1 - fi) * M.fila + (M.fila - M.alto) / 2;
      const res = resumenFila(f);
      const nombre = op.chico ? tx.fila(fi + 1) : tx.fila(fi + 1) + (res.length ? " · " + res.map((r) => r.torneo).join(" / ") : "");
      svg.appendChild(nodo("text", { x: M.margen, y: y + M.alto / 2 + 5, "font-size": op.chico ? 13 : 12, "font-weight": 700, fill: TINTA }, nombre));
      // Las mesas van de derecha a izquierda, pegadas al borde derecho.
      let x = ancho - M.margen;
      f.grupos.forEach((g, gi) => {
        if (gi) x -= M.pasillo;
        g.mesas.forEach((m, mi) => {
          if (mi) x -= M.junta;
          x -= M.ancho;
          const marcada = op.marca && g.torneo === op.marca.torneo && m.t.indexOf(op.marca.tablero) !== -1;
          const elegida = op.elegida && op.elegida.fi === fi && op.elegida.gi === gi && op.elegida.mi === mi;
          const zona = op.zonas ? op.zonas.get(fi + "-" + gi + "-" + mi) : null;
          const caja = nodo("g", { class: "cac-plano-mesa" + (marcada ? " cac-plano-marcada" : "") });
          caja.appendChild(nodo("rect", {
            x, y, width: M.ancho, height: M.alto, rx: 4,
            fill: marcada ? TINTA : op.zonas ? (zona ? COLORES[(zona - 1) % COLORES.length] : "#ffffff") : color(g.torneo),
            stroke: marcada ? MARCA : elegida ? MARCA : TINTA,
            "stroke-width": marcada || elegida ? 4 : 1,
            "stroke-dasharray": op.editor && m.duda && !elegida ? "4 3" : "none",
          }));
          // Mirando hacia el fondo, el tablero de la derecha (t[0]) queda a la derecha.
          const rotuloMesa = [m.t[1], m.t[0]].map((n) => (n ? String(n) : "·")).join(" ");
          if (op.zonas) {
            // La zona escrita (el color nunca va solo) y debajo los dos tableros, más chicos.
            caja.appendChild(nodo("text", { x: x + M.ancho / 2, y: y + 13, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: TINTA }, zona ? "Z" + zona : "—"));
            caja.appendChild(nodo("text", { x: x + M.ancho / 2, y: y + 26, "text-anchor": "middle", "font-size": 10, fill: TINTA }, rotuloMesa));
          } else caja.appendChild(nodo("text", { x: x + M.ancho / 2, y: y + M.alto / 2 + 5, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: marcada ? "#ffffff" : TINTA }, rotuloMesa));
          if (op.editor && m.duda) caja.appendChild(nodo("text", { x: x + M.ancho - 6, y: y + 10, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: MARCA }, "?"));
          if (op.editor && op.alTocar) {
            caja.setAttribute("data-mesa", fi + "-" + gi + "-" + mi);
            caja.style.cursor = "pointer";
            caja.addEventListener("click", () => op.alTocar(fi, gi, mi));
          }
          if (marcada) ubicada = ubicar(p, op.marca.torneo, op.marca.tablero);
          svg.appendChild(caja);
        });
      });
    });
    svg.setAttribute("aria-label", ubicada ? tx.dibujoMarca(ubicada.fila, ubicada.desdeDerecha) : tx.dibujo(p.filas.length));
    return svg;
  }

  // La lista en texto de lo mismo que dice el dibujo (para el lector de
  // pantalla y para quien no ve bien los colores).
  function lista(plano) {
    const p = limpiar(plano);
    const tx = t();
    const ul = document.createElement("ul");
    ul.className = "cac-plano-lista";
    if (!p) return ul;
    p.filas.forEach((f, fi) => {
      const res = resumenFila(f);
      if (!res.length) return;
      const li = document.createElement("li");
      li.textContent = res.map((r) => tx.filaTexto(fi + 1, r.torneo, isFinite(r.desde) ? r.desde : null, r.hasta)).join(" ");
      ul.appendChild(li);
    });
    return ul;
  }

  /* ---------------- de la base ---------------- */

  let plano = null;
  let pedido = null;
  try { plano = limpiar(JSON.parse(localStorage.getItem(LLAVE_GUARDADO) || "null")); } catch (e) { plano = null; }

  // Se pide una vez por visita (y se guarda en el aparato para la sala sin
  // internet). Al llegar avisa con «cac-plano», y la tarjeta del jugador se
  // vuelve a pintar con su mesa.
  function cargar(clave) {
    if (pedido) return pedido;
    if (!window.sb || !window.sb.from) return Promise.resolve(plano);
    pedido = (async () => {
      try {
        const { data, error } = await window.sb.from("salas_torneo").select("plano").eq("clave", clave).maybeSingle();
        if (error) throw error;
        plano = limpiar(data && data.plano);
        try { localStorage.setItem(LLAVE_GUARDADO, JSON.stringify(plano)); } catch (e) { /* sin lugar */ }
      } catch (e) { /* sin red: queda el guardado */ }
      document.dispatchEvent(new CustomEvent("cac-plano"));
      return plano;
    })();
    return pedido;
  }

  // Lo que va en la tarjeta del jugador debajo de su mesa: la frase y el plano
  // chico con su mesa marcada. Sin plano o sin esa mesa, null.
  function enTarjeta(torneo, tablero) {
    const u = ubicar(plano, torneo, tablero);
    if (!u) return null;
    const tx = t();
    const caja = document.createElement("div");
    caja.className = "cac-plano-tarjeta";
    const p = document.createElement("p");
    p.className = "cac-plano-donde";
    p.textContent = tx.donde(u.fila, u.desdeDerecha);
    caja.appendChild(p);
    const svg = dibujar(plano, { marca: { torneo, tablero }, chico: true });
    if (svg) caja.appendChild(svg);
    const ayuda = document.createElement("p");
    ayuda.className = "text-xs";
    ayuda.textContent = tx.ayuda(plano.frente, plano.fondo);
    caja.appendChild(ayuda);
    return caja;
  }

  // La ventana «Plano de la sala» de la página pública.
  function pintarVentana() {
    const caja = document.getElementById("plano-contenido");
    if (!caja) return;
    const tx = t();
    if (!plano) { const p = document.createElement("p"); p.className = "font-semibold"; p.textContent = tx.sinPlano; caja.replaceChildren(p); return; }
    const ayuda = document.createElement("p");
    ayuda.className = "font-semibold mb-3";
    ayuda.textContent = tx.ayuda(plano.frente, plano.fondo);
    caja.replaceChildren(ayuda, dibujar(plano, {}), lista(plano));
  }

  window.CentroamericanoPlano = { limpiar, ubicar, borrador, dudas, problemas, resumenFila, mesasDeFila, dibujar, lista, cargar, enTarjeta, pintarVentana, plano: () => plano, poner: (p) => { plano = limpiar(p); }, textos: t };

  // En la página pública: se pide al cargar y la ventana se pinta al abrirse.
  const ventana = document.getElementById("plano");
  if (ventana && ventana.dataset.sala) {
    cargar(ventana.dataset.sala);
    new MutationObserver(() => { if (ventana.open) pintarVentana(); }).observe(ventana, { attributes: true, attributeFilter: ["open"] });
    document.addEventListener("cac-plano", () => { if (ventana.open) pintarVentana(); });
    document.addEventListener("cac-idioma", () => { if (ventana.open) pintarVentana(); });
  }
})();

/*! rev bfb5bbb0d2d82f9f */
