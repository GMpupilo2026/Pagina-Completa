/* La clasificación de un torneo de «Torneos en Pareo Integral» para
   incrustar en la página de un club o una federación (un <iframe>).

   La página la arma el worker (/incrustar/<id>; ver worker.js): trae el
   torneo ya leído, como JSON que no se ejecuta, y se vuelve a pedir sola cada
   minuto (meta refresh), así que acá no se habla con ningún servidor. La
   clasificación se calcula con los mismos módulos de Pareo Integral
   (js/pareo/), como en torneos-pareo.html.

   En la dirección:  ?ver=ronda    las mesas de la última ronda en vez de la
                                   clasificación (solo individuales);
                     ?n=<1..200>   cuántos puestos (10 si no se dice);
                     ?tema=oscuro  fondo oscuro.

   Ver «La clasificación para incrustar en otra página» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  const E = window.PareoEquipos;
  const V = window.PareoEvento;
  const T = window.PareoTorneo;
  const SITIO = "https://ajedrez-integral.com";
  const RESULTADO = { "1-0": "1 – 0", "0-1": "0 – 1", "=": "½ – ½", "+-": "+ – −", "-+": "− – +", "--": "− – −" };

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "texto") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }
  const puntosTexto = (x) => {
    const n = Math.floor(x), m = x - n;
    return (n || !m ? String(n) : "") + (Math.abs(m - 0.5) < 1e-9 ? "½" : "");
  };
  const nombreDe = (t, id) => ((t.jugadores.find((j) => j.id === id) || {}).nombre || "?");

  const caja = document.getElementById("pi-inc");
  let fila;
  try { fila = JSON.parse(document.getElementById("pi-inc-datos").textContent); } catch (e) { fila = null; }
  if (!caja || !fila || !fila.datos) return;
  const t = fila.datos;
  const p = new URLSearchParams(location.search);
  const cuantos = Math.max(1, Math.min(200, Math.floor(Number(p.get("n"))) || 10));
  const ronda = p.get("ver") === "ronda" && !E.esDeEquipos(t);
  const k = V.rondasCompletas(t);
  const total = t.sistema === "todos" ? T.rondasTodos(t) : Number(t.rondasTotales) || 0;
  const completo = SITIO + "/torneos-pareo.html#t=" + encodeURIComponent(fila.id);

  const partes = [];
  partes.push(el("h1", { texto: fila.nombre }));
  const sub = [fila.evento && fila.evento !== fila.nombre ? fila.evento : "", t.ciudad || fila.lugar || "",
    !t.rondas.length ? "Próximamente" : "Ronda " + t.rondas.length + (total ? " de " + total : "")].filter(Boolean).join(" · ");
  partes.push(el("p", { class: "sub", texto: sub }));

  if (ronda) {
    const r = t.rondas.length - 1;
    if (r < 0) partes.push(el("p", { class: "nota", texto: "Todavía no hay rondas emparejadas." }));
    else {
      const filas = t.rondas[r].mesas.map((m, i) => el("tr", {},
        el("td", { class: "num", texto: V.mesaFisica(t, i) }),
        el("td", { texto: nombreDe(t, m.b) }),
        el("td", { class: "num", texto: m.n == null ? "Libre" : m.r ? RESULTADO[m.r] || m.r : "jugando" }),
        el("td", { texto: m.n == null ? "" : nombreDe(t, m.n) })));
      partes.push(el("table", { id: "pi-inc-tabla" },
        el("caption", { texto: "Ronda " + (r + 1) }),
        el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col", texto: "Mesa" }), el("th", { scope: "col", texto: "Blancas" }),
          el("th", { class: "num", scope: "col", texto: "Resultado" }), el("th", { scope: "col", texto: "Negras" }))),
        el("tbody", {}, filas)));
    }
  } else if (!k) {
    partes.push(el("p", { class: "nota", texto: "Todavía no hay una ronda completa." }));
  } else {
    const filas = V.aplicarDesempate(t, E.clasificacion(Object.assign({}, t, { rondas: t.rondas.slice(0, k) }), t.desempates));
    partes.push(el("table", { id: "pi-inc-tabla" },
      el("caption", { texto: "Clasificación tras la ronda " + k + (k < total ? " (provisional)" : "") }),
      el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col", texto: "Puesto" }), el("th", { scope: "col", texto: "Nombre" }),
        el("th", { class: "num", scope: "col", texto: "Pts" }))),
      el("tbody", {}, filas.slice(0, cuantos).map((f) => {
        const j = t.jugadores.find((x) => x.id === f.id) || {};
        return el("tr", { "data-id": f.id },
          el("td", { class: "num", texto: f.puesto }),
          el("td", {}, j.nombre + (j.titulo ? " (" + j.titulo + ")" : ""), j.institucion && !E.esDeEquipos(t) ? el("span", { class: "inst", texto: j.institucion }) : null),
          el("td", { class: "num fuerte", texto: puntosTexto(f.puntos) }));
      }))));
    if (filas.length > cuantos) partes.push(el("p", { class: "nota", texto: "Los primeros " + cuantos + " de " + filas.length + "." }));
  }
  partes.push(el("p", { class: "pie" },
    el("a", { href: completo, target: "_blank", rel: "noopener", texto: "Ver todo en Pareo Integral" }),
    el("span", { class: "oculto", texto: " (se abre en otra pestaña)" }),
    " · Se pone al día solo cada minuto."));
  caja.replaceChildren(...partes);
})();
