/* Cómo usó el tiempo cada jugador en una partida: cuánto pensó cada jugada
 * (barras) y, si hubo reloj, cuánto le quedaba (líneas). Lo usan la cámara
 * que lee el tablero (camara-tablero.html, con el reloj de la cámara o el de
 * la mesa leído de la imagen) y quien mira la partida (tablero-vivo.html),
 * para revisarla en clase: dónde se apuró, dónde se quedó sin tiempo. Una
 * sola copia del dibujo.
 *
 * El color nunca va solo: las blancas son barras con borde y línea entera,
 * las negras barras rellenas y línea cortada, y todo está escrito en el
 * resumen y en la tabla (para el lector de pantalla). Se dibuja con
 * `currentColor`: el contraste es el del texto de la página.
 *
 *   GraficoTiempo.pintar(contenedor, { jugadas: ["e4", …] (SAN), tiempos: [ms|null],
 *                                      restan: [{ w, b }|null] (opcional), primero: "w"|"b", escribir: (san) → texto })
 *   GraficoTiempo.resumen(datos) → el texto del resumen
 */
(function (G) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const reloj = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(ss).padStart(2, "0");
  };
  // De quién es la jugada i (si la partida empezó con las negras, `primero` = "b").
  const colorDe = (i, primero) => ((i % 2 === 0) === (primero !== "b") ? "w" : "b");
  const numero = (i, primero) => Math.floor((i + (primero === "b" ? 1 : 0)) / 2) + 1;
  const nombre = (d, i) => numero(i, d.primero) + (colorDe(i, d.primero) === "w" ? ". " : "… ") + (d.escribir ? d.escribir(d.jugadas[i]) : d.jugadas[i]);

  function resumen(d) {
    const partes = [];
    for (const c of ["w", "b"]) {
      const suyas = d.tiempos.map((ms, i) => ({ ms, i })).filter((x) => colorDe(x.i, d.primero) === c && Number.isFinite(x.ms));
      if (!suyas.length) continue;
      const total = suyas.reduce((s, x) => s + x.ms, 0), larga = suyas.reduce((a, b) => (b.ms > a.ms ? b : a));
      partes.push((c === "w" ? "Las blancas" : "Las negras") + " pensaron " + reloj(total) + " en total; la jugada más larga, " + nombre(d, larga.i) + " (" + reloj(larga.ms) + ").");
    }
    const r = (d.restan || []).filter(Boolean).pop();
    if (r) partes.push("Al final les quedaba: blancas " + reloj(r.w) + ", negras " + reloj(r.b) + ".");
    return partes.join(" ") || "Todavía no hay jugadas con su tiempo.";
  }

  const el = (tag, attrs, padre) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (padre) padre.append(e); return e; };

  function barras(d) {
    const n = d.tiempos.length, paso = 10, W = Math.max(300, n * paso + 40), H = 130, abajo = 110, arriba = 14;
    const max = Math.max(1000, ...d.tiempos.filter(Number.isFinite));
    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Cuánto pensó cada jugada", class: "w-full h-auto" });
    el("line", { x1: 36, y1: abajo, x2: W - 2, y2: abajo, stroke: "currentColor", "stroke-width": 1 }, svg);
    const t = el("text", { x: 2, y: arriba + 4, "font-size": 10, fill: "currentColor" }, svg); t.textContent = reloj(max);
    const t0 = el("text", { x: 2, y: abajo, "font-size": 10, fill: "currentColor" }, svg); t0.textContent = "0:00";
    d.tiempos.forEach((ms, i) => {
      if (!Number.isFinite(ms)) return;
      const h = Math.max(1, (abajo - arriba) * ms / max), x = 40 + i * paso;
      const blancas = colorDe(i, d.primero) === "w";
      const b = el("rect", { x, y: abajo - h, width: paso - 3, height: h, stroke: "currentColor", "stroke-width": 1, fill: blancas ? "none" : "currentColor" }, svg);
      const titulo = el("title", {}, b); titulo.textContent = nombre(d, i) + ": " + reloj(ms);
    });
    // La jugada cada 10, abajo.
    for (let i = 0; i < n; i += 20) { const x = el("text", { x: 40 + i * paso, y: H - 4, "font-size": 10, fill: "currentColor" }, svg); x.textContent = String(numero(i, d.primero)); }
    return svg;
  }

  function lineas(d) {
    const pts = (d.restan || []).slice(0, d.tiempos.length).map((r, i) => (r ? { r, i } : null)).filter(Boolean);
    if (pts.length < 2) return null;
    const paso = 10, W = Math.max(300, d.tiempos.length * paso + 40), H = 120, abajo = 100, arriba = 10;
    const max = Math.max(1000, ...pts.flatMap((p) => [p.r.w, p.r.b]));
    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Cuánto le quedaba en el reloj a cada uno", class: "w-full h-auto mt-2" });
    el("line", { x1: 36, y1: abajo, x2: W - 2, y2: abajo, stroke: "currentColor", "stroke-width": 1 }, svg);
    const t = el("text", { x: 2, y: arriba + 4, "font-size": 10, fill: "currentColor" }, svg); t.textContent = reloj(max);
    for (const c of ["w", "b"]) {
      const puntos = pts.map((p) => (40 + p.i * paso + 3) + "," + (abajo - (abajo - arriba) * p.r[c] / max)).join(" ");
      el("polyline", { points: puntos, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": c === "w" ? "" : "5 4", "data-color": c }, svg);
    }
    return svg;
  }

  function pintar(caja, d) {
    d = Object.assign({ jugadas: [], tiempos: [], restan: [], primero: "w" }, d);
    caja.textContent = "";
    const hay = d.tiempos.some(Number.isFinite);
    const p = document.createElement("p");
    p.className = "text-sm";
    p.dataset.resumen = "";
    p.textContent = resumen(d);
    caja.append(p);
    if (!hay) return;
    const leyenda = document.createElement("p");
    leyenda.className = "text-xs mt-1";
    leyenda.textContent = "Cuánto pensó cada jugada: las blancas, barras con borde; las negras, barras rellenas.";
    caja.append(leyenda, barras(d));
    const l = lineas(d);
    if (l) {
      const ll = document.createElement("p");
      ll.className = "text-xs mt-2";
      ll.textContent = "Cuánto le quedaba en el reloj: las blancas, línea entera; las negras, línea cortada.";
      caja.append(ll, l);
    }
    // La tabla, para el lector de pantalla (lo mismo que el dibujo, escrito).
    const tabla = document.createElement("table");
    tabla.className = "sr-only";
    const cap = document.createElement("caption"); cap.textContent = "El tiempo de cada jugada"; tabla.append(cap);
    const cab = document.createElement("tr");
    for (const x of ["Jugada", "Pensó", "Le quedaba"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = x; cab.append(th); }
    tabla.append(cab);
    d.tiempos.forEach((ms, i) => {
      const tr = document.createElement("tr"), r = d.restan && d.restan[i], c = colorDe(i, d.primero);
      for (const x of [nombre(d, i), Number.isFinite(ms) ? reloj(ms) : "—", r ? reloj(r[c]) : "—"]) { const td = document.createElement("td"); td.textContent = x; tr.append(td); }
      tabla.append(tr);
    });
    caja.append(tabla);
  }

  const api = { pintar, resumen };
  if (typeof window !== "undefined") window.GraficoTiempo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
