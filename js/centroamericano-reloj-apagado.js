/* El reloj que se apagó (art. 6.10): la calculadora que usan la tablet del árbitro
   (centroamericano-arbitro.html, en la ventana del control de tiempos) y la organización
   (centroamericano-mesas.html, pestaña «Control de tiempos»). Una sola copia de la pantalla:
   las cuentas son de js/centroamericano-mesas.js (relojApagado, bonosIlegales, ultimoControl).

   CentroamericanoRelojApagado.armar(opciones) devuelve un <form> que se pinta solo:
     estado       objeto que guarda lo escrito (jugadas, reparto, hora marcada, tiempos cambiados);
                  la página lo conserva para que sobreviva a que se vuelva a dibujar
     blancas, negras   los nombres
     lecturas     los controles de tiempos de ESA partida
     anotaciones, anuladas   la bitácora de la mesa (las ilegales y las sanciones salen de ahí)
     mesa         el número de mesa (para filtrar la bitácora)
     inicio       { ms, deDonde } o null: la hora en que empezó la ronda
     antes        un nodo para poner arriba (el selector de mesa de la tablet), o null
     intro        el texto de arriba
     boton        el texto del botón principal ("Anotar en la bitácora", "Mandárselo al árbitro")
     alGuardar    async (datos) => …, con { tB, tN, jB, jN, turno, nota, ocurrio, r }
     alVolver     () => … o null (sin botón «Volver»)
     avisar       (texto, error) => …
     incompleta   true si la página sabe que le faltan anotaciones de la mesa (la tablet trae solo las últimas)
     clase        la clase del <form>

   Ver «El reloj que se apaga» en docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  const C = window.CentroamericanoMesas;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const T = (s) => C.formatoTiempo(s);
  const hora = (iso) => window.HoraCR.hora(iso, { hour: "numeric", minute: "2-digit", second: "2-digit" });

  function el(tag, at, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(at || {})) {
      if (v == null || v === false) continue;
      if (k === "texto") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k === "checked" || k === "disabled" || k === "value") n[k] = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos) if (h != null) n.append(h);
    return n;
  }
  const svg = (tag, at, ...hijos) => { const n = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(at)) n.setAttribute(k, v); n.append(...hijos); return n; };
  const iconoReloj = () => svg("svg", { viewBox: "0 0 24 24", class: "cam-icono", "aria-hidden": "true", focusable: "false", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
    svg("circle", { cx: "12", cy: "12", r: "9" }), svg("path", { d: "M12 7v5l3 2" }));

  // Un reloj de ajedrez dibujado (SVG propio): las dos pantallas con los tiempos propuestos y la palanca levantada
  // del lado de quien tiene el turno, como se ve en la mesa. Es un dibujo: el dato va escrito en las casillas de
  // abajo y en «le toca», así que el lector de pantalla lo salta (aria-hidden).
  function dibujo(tB, tN, turno) {
    const pantalla = (x, texto, clase) => [
      svg("rect", { x, y: 62, width: 124, height: 52, rx: 6, fill: "#0e1222" }),
      svg("rect", { x: x + 5, y: 67, width: 114, height: 42, rx: 3, fill: "#c9d8b6" }),
      svg("text", { x: x + 62, y: 98, "text-anchor": "middle", "font-family": "ui-monospace, 'Courier New', monospace", "font-weight": "700", "font-size": "27", fill: "#18240f", class: clase }, texto)];
    const palanca = (x, arriba) => svg("rect", { x, y: arriba ? 18 : 31, width: 70, height: arriba ? 26 : 13, rx: 5, fill: arriba ? "#e8a33d" : "#7d82a8" });
    const etiqueta = (x, texto) => svg("text", { x, y: 133, "text-anchor": "middle", "font-family": "inherit", "font-weight": "700", "font-size": "12", fill: "#ffffff", "letter-spacing": "1.5" }, texto);
    return svg("svg", { viewBox: "0 0 320 150", class: "cam-reloj-dibujo", "aria-hidden": "true", focusable: "false" },
      palanca(57, turno === "blancas"), palanca(193, turno === "negras"),
      svg("rect", { x: 8, y: 42, width: 304, height: 104, rx: 16, fill: "#2a2f55" }),
      svg("rect", { x: 8, y: 42, width: 304, height: 10, rx: 5, fill: "#3b4173" }),
      svg("circle", { cx: 160, cy: 88, r: 4, fill: "#8d92c4" }),
      ...pantalla(24, T(Math.max(0, tB)), "ra-dibujo-b"), ...pantalla(172, T(Math.max(0, tN)), "ra-dibujo-n"),
      etiqueta(86, "BLANCAS"), etiqueta(234, "NEGRAS"),
      svg("path", { d: turno === "blancas" ? "M146 132l-8-5v10z" : "M174 132l8-5v10z", fill: "#e8a33d" }));
  }

  // Las cuentas, en palabras: cada línea es { texto, ojo } (ojo: un aviso para revisar).
  function cuentas(r) {
    const pct = (x) => Math.round(x * 100) + " %";
    const out = [
      { texto: "Entre los dos les quedan " + T(Math.max(0, r.total)) + " (exacto): " + (r.sinControl ? "desde el inicio pasaron " : "desde el control pasaron ") + T(r.pasaron) + " y se jugaron " + r.jugadas + (r.jugadas === 1 ? " jugada" : " jugadas") + " (+" + T(r.jugadas * C.RITMO.incremento) + " de incremento)." },
      { texto: r.sinControl ? "Esta mesa no tiene ningún control: se reparte mitad y mitad. Pregúntales a los jugadores si les parece justo."
        : r.reparto === "ritmo" ? (r.pesoRitmo < 1 ? "El control es de muy temprano (pocas jugadas): el ritmo pesa poco y el reparto queda cerca de mitad y mitad. " : "")
          + "Lo que pasó se reparte como venían gastando hasta el control: blancas " + pct(r.proporcion.blancas) + " (" + T(r.gastado.blancas) + "), negras " + pct(r.proporcion.negras) + " (" + T(r.gastado.negras) + ")."
        : "Lo que pasó se reparte mitad y mitad: " + T(r.gastado.blancas) + " cada uno." },
    ];
    for (const a of r.ajustes || []) out.push({ texto: "Incluye " + (a.segundos > 0 ? "+" : "−") + T(Math.abs(a.segundos)) + " a las " + a.color + " por " + (a.motivo === "ilegal" ? "la jugada ilegal de su rival (art. " + C.ARTICULO_ILEGAL + ")" : a.color === a.de ? "la sanción de su irregularidad (art. " + C.ARTICULO_SANCION + ")" : "la sanción a su rival por una irregularidad (art. " + C.ARTICULO_SANCION + ")") + ", anotada a las " + hora(new Date(a.ms).toISOString()) });
    if (r.bonosAntes && (r.bonosAntes.blancas || r.bonosAntes.negras) && !r.sinControl) out.push({ texto: "Lo que se dio o quitó antes del control ya estaba en esos relojes: no se cuenta de nuevo, pero sí al ver cómo venía gastando cada uno y en la comprobación con el inicio." });
    if (r.comprobacion) {
      const d = r.comprobacion.diferencia, cuadra = Math.abs(d) <= 120;
      out.push(cuadra ? { texto: "✓ El control cuadra con la hora de inicio (diferencia de " + T(Math.abs(d)) + ")." }
        : { ojo: true, texto: "⚠ El control no cuadra con la hora de inicio por " + T(Math.abs(d)) + (d > 0 ? " de más" : " de menos") + ": ¿la partida empezó tarde, hubo una pausa o el control se anotó mal? Revísalo antes de poner el reloj." });
    }
    if (r.blancas < 0 || r.negras < 0) out.push({ ojo: true, texto: "⚠ Con este cálculo a " + (r.blancas < 0 ? "las blancas" : "las negras") + " ya se les habría acabado el tiempo: decide tú." });
    return out;
  }

  // Lo que queda escrito (en la bitácora de la mesa o en el aviso al árbitro): de dónde salió y si se ajustó.
  function nota(r, ctl, tB, tN) {
    const propuesto = tB === Math.max(0, r.blancas) && tN === Math.max(0, r.negras);
    return ("Reloj apagado (art. 6.10): " + (ctl ? "calculado desde el control de las " + hora(ctl.ocurrio) : "calculado desde el inicio de la ronda")
      + ", reparto " + (r.reparto === "ritmo" ? "según el ritmo (" + Math.round(r.proporcion.blancas * 100) + " % / " + Math.round(r.proporcion.negras * 100) + " %)" : "mitad y mitad")
      + (r.ajustes && r.ajustes.length ? "; incluye " + r.ajustes.map((a) => (a.segundos > 0 ? "+" : "−") + T(Math.abs(a.segundos)) + " a las " + a.color + (a.motivo === "ilegal" ? " (ilegal)" : " (sanción)")).join(", ") : "")
      + (propuesto ? "" : "; propuesto " + T(Math.max(0, r.blancas)) + " / " + T(Math.max(0, r.negras)) + ", ajustado a mano")).slice(0, 500);
  }

  // La hora en que empezó la ronda: la que marcó el árbitro de la categoría o, si no, la del horario.
  function inicioDeLaRonda(ronda, marcadaIso) {
    if (marcadaIso) return { ms: new Date(marcadaIso).getTime(), deDonde: "marcada por el árbitro de la categoría" };
    const H = window.CentroamericanoHorario;
    const ev = H && H.EVENTOS.find((e) => e.ronda === Number(ronda));
    return ev ? { ms: new Date(ev.inicio + ":00-06:00").getTime(), deDonde: "según el horario (el árbitro de la categoría no la marcó)" } : null;
  }

  function armar(o) {
    const st = o.estado;
    const form = el("form", { class: o.clase || "", novalidate: true });
    const bonos = () => C.bonosIlegales(o.anotaciones, o.mesa, o.anuladas);
    const ctl = () => C.ultimoControl(o.lecturas || []);
    const num = (v) => (v === "" || v == null ? NaN : Number(v));
    const calcular = () => {
      const ahora = st.horaMarcada ? new Date(st.horaMarcada).getTime() : Date.now();
      return { ahora, r: C.relojApagado({ control: ctl(), inicio: o.inicio ? o.inicio.ms : null, ahora, jBlancas: num(st.jb), jNegras: num(st.jn), reparto: st.reparto || "ritmo", bonos: bonos() }) };
    };
    const resultado = el("div", { class: "ra-resultado", "aria-live": "polite" });

    function pintarResultado() {
      const { r } = calcular();
      if (st.jb == null || st.jb === "" || st.jn == null || st.jn === "") { resultado.replaceChildren(el("p", { class: "text-sm cam-apagado-falta", texto: "Escribe las jugadas de cada uno para ver el cálculo." })); return; }
      if (r.error) { resultado.replaceChildren(el("p", { class: "cam-aviso-suave", texto: r.error })); return; }
      // Un tiempo cambiado a mano vale mientras el cálculo no cambie; si cambia, vuelve la propuesta.
      const propio = (k) => (st[k] != null && st.para === r.total ? st[k] : null);
      const valor = (k, calc) => { const t = propio(k) != null ? C.leerTiempo(propio(k)) : null; return t === null ? calc : t; };
      const dib = dibujo(valor("tb", r.blancas), valor("tn", r.negras), r.turno);
      const reloj = (color, k, calc) => el("div", { class: "cam-apagado-reloj", "data-color": color },
        el("label", { class: "block text-sm font-bold" }, el("span", { class: "cam-color", "data-color": color, texto: color === "blancas" ? "Blancas" : "Negras" }), r.turno === color ? el("span", { class: "cam-apagado-turno", texto: " · le toca" }) : null,
          el("input", { type: "text", inputmode: "numeric", autocomplete: "off", class: "cam-campo cam-apagado-valor ra-t" + k.slice(1), "aria-label": "Tiempo de las " + color, value: propio(k) != null ? propio(k) : T(Math.max(0, calc)),
            oninput: (e) => { const v = C.ponerDosPuntos ? C.ponerDosPuntos(e.target.value) : e.target.value; if (e.target.value !== v) e.target.value = v; st[k] = v; st.para = r.total;
              const t = C.leerTiempo(v), d = dib.querySelector(k === "tb" ? ".ra-dibujo-b" : ".ra-dibujo-n"); if (d && t !== null) d.textContent = T(t); } })));
      resultado.replaceChildren(dib,
        el("div", { class: "grid grid-cols-2 gap-2 cam-apagado-relojes" }, reloj("blancas", "tb", r.blancas), reloj("negras", "tn", r.negras)),
        el("p", { class: "text-sm", texto: "Pon esto en el reloj nuevo. Si decides otro tiempo, cámbialo en las casillas y el dibujo se actualiza." }),
        el("ul", { class: "text-sm cam-apagado-cuentas", "aria-label": "Las cuentas" }, ...cuentas(r).map((x) => el("li", { class: x.ojo ? "cam-apagado-ojo" : null, texto: x.texto }))));
    }

    function pintar() {
      const c = ctl(), b = bonos();
      const dato = (titulo, texto) => el("li", {}, el("strong", { texto: titulo + ": " }), el("span", { texto }));
      const datos = el("ul", { class: "cam-apagado-datos", "aria-label": "Lo que ya se sabe de esta partida" },
        dato("Ritmo", "90 min + 30 s por jugada"),
        dato("Inicio de la ronda", o.inicio ? hora(new Date(o.inicio.ms).toISOString()) + " (" + o.inicio.deDonde + ")" : "no se sabe"),
        dato("Ilegales y sanciones de tiempo", b.length ? b.map((x) => (x.motivo === "ilegal" ? "Ilegal" : "Irregularidad") + " de las " + x.de + " a las " + hora(new Date(x.ms).toISOString())
          + " (" + (x.segundos > 0 ? "+" : "−") + T(Math.abs(x.segundos)) + " a las " + x.color + (c && x.ms <= new Date(c.ocurrio).getTime() ? ", ya en el control" : ", se cuenta") + ")").join(" · ") : "ninguna"),
        o.incompleta ? el("li", { class: "cam-apagado-ojo", texto: "⚠ La tablet no tiene a mano todas las anotaciones de esta mesa (trae las últimas 60 del árbitro): alguna ilegal o sanción vieja podría faltar en la cuenta. La organización lo puede calcular con la bitácora completa." }) : null,
        dato("Último control", c ? hora(c.ocurrio) + " · Blancas " + T(c.t_blancas) + " (" + c.j_blancas + " jug.) · Negras " + T(c.t_negras) + " (" + c.j_negras + " jug.)" : "ninguno en esta mesa"));
      const jug = (color, k, nombre) => el("label", { class: "block" },
        el("span", { class: "block text-sm font-bold" }, el("span", { class: "cam-color", "data-color": color, texto: color === "blancas" ? "Blancas" : "Negras" }), " ", el("span", { class: "cam-tiempo-nombre", texto: nombre || "" })),
        el("input", { type: "number", min: "0", max: "400", inputmode: "numeric", class: "cam-campo ra-j" + k.slice(1), value: st[k] || "", oninput: (e) => { st[k] = e.target.value; pintarResultado(); } }));
      const opcion = (valor, texto) => el("label", { class: "cam-apagado-opcion" }, el("input", { type: "radio", name: "ra-reparto-" + (o.mesa || 0), value: valor, checked: (st.reparto || "ritmo") === valor, onchange: () => { st.reparto = valor; pintarResultado(); } }), el("span", { texto }));
      const horaDeCalculo = el("div", { class: "cam-hora-control" },
        el("span", { class: "text-sm font-bold", texto: "Hora del cálculo" }),
        el("output", { class: "cam-hora-valor ra-hora", "data-marcada": st.horaMarcada ? "si" : "no", texto: st.horaMarcada ? hora(st.horaMarcada) : "Ahora (márcala al poner el reloj nuevo)" }),
        el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico ra-marcar-hora", onclick: () => { st.horaMarcada = new Date().toISOString(); pintar(); } }, iconoReloj(), el("span", { texto: st.horaMarcada ? "Marcar de nuevo" : "Marcar la hora ahora" })));
      form.replaceChildren(
        o.antes || "",
        el("p", { class: "text-sm", texto: o.intro || "Con el último control de esta mesa se calcula cuánto le queda a cada uno. Es una propuesta: el tiempo lo decide el árbitro (art. 6.10)." }),
        datos,
        el("fieldset", { class: "cam-tiempo-lado" }, el("legend", { texto: "Jugadas que lleva cada uno ahora" }),
          el("div", { class: "grid grid-cols-2 gap-2" }, jug("blancas", "jb", o.blancas), jug("negras", "jn", o.negras))),
        el("fieldset", { class: "cam-apagado-reparto" }, el("legend", { class: "text-sm font-bold", texto: "Lo que pasó desde el control, ¿cómo se reparte?" }),
          opcion("ritmo", "Como venía gastando cada uno"), opcion("iguales", "Mitad y mitad")),
        horaDeCalculo,
        resultado,
        el("div", { class: "cam-acciones" },
          el("button", { type: "submit", class: "cam-btn ra-guardar" }, o.boton),
          o.alVolver ? el("button", { type: "button", class: "cam-btn cam-btn-claro ra-volver", onclick: o.alVolver }, "Volver") : null));
      pintarResultado();
    }

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const { ahora, r } = calcular();
      if (r.error) { o.avisar(r.error, true); return; }
      const tB = C.leerTiempo(form.querySelector(".ra-tb").value), tN = C.leerTiempo(form.querySelector(".ra-tn").value);
      if (tB === null || tN === null) { o.avisar("Escribe el tiempo de cada reloj así: 1:23:45 o 45:10.", true); return; }
      const boton = form.querySelector(".ra-guardar");
      boton.disabled = true;
      try {
        await o.alGuardar({ tB, tN, jB: Number(st.jb), jN: Number(st.jn), turno: r.turno, nota: nota(r, ctl(), tB, tN), ocurrio: new Date(ahora).toISOString(), r });
      } catch (e) {
        o.avisar(e.message, true);
      } finally {
        if (boton.isConnected) boton.disabled = false;
      }
    });
    pintar();
    return form;
  }

  window.CentroamericanoRelojApagado = { armar, dibujo, cuentas, nota, inicioDeLaRonda };
})();
