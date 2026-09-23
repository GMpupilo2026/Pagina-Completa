/**
 * Los ritmos de juego (el tiempo de cada jugador más el incremento por jugada).
 *
 * Estaban escritos dos veces —en torneos.html y en juegos.html— y ya se habían
 * separado: una partida amistosa podía ser 3+0 y un torneo no. Ahora la lista
 * vive acá y la usan los tres lugares que eligen un ritmo: crear un torneo,
 * cambiarle el tiempo a uno que ya existe y armar una partida (o un reto).
 *
 * Se agrupan por lo que son —bala, relámpago, rápidas, clásica—, que es como
 * se piensa un ritmo, y al final va «Personalizado»: minutos y segundos a mano,
 * para lo que no esté en la lista. Los topes (de 30 s a 3 horas, hasta 3 min de
 * incremento) los hace cumplir también la base; acá solo se dicen antes.
 */
(function () {
  "use strict";

  const GRUPOS = [
    { titulo: null, ritmos: [["none", null, 0]] },
    { titulo: "Bala", ritmos: [["1+0", 60, 0], ["1+1", 60, 1], ["2+1", 120, 1]] },
    { titulo: "Relámpago", ritmos: [["3+0", 180, 0], ["3+2", 180, 2], ["5+0", 300, 0], ["5+3", 300, 3]] },
    { titulo: "Rápidas", ritmos: [["10+0", 600, 0], ["10+5", 600, 5], ["15+10", 900, 10]] },
    { titulo: "Clásica", ritmos: [["30+0", 1800, 0], ["30+20", 1800, 20]] },
  ];

  const LISTA = [];
  GRUPOS.forEach((g) => g.ritmos.forEach(([id, initial, increment]) => {
    LISTA.push({ id: id, initial: initial, increment: increment, label: etiqueta(initial, increment) });
  }));

  const MIN_SEGUNDOS = 30, MAX_SEGUNDOS = 10800, MAX_INCREMENTO = 180;

  function etiqueta(initial, increment) {
    if (initial === null || initial === undefined) return "Sin límite";
    const min = Math.floor(initial / 60), seg = initial % 60;
    let base = min ? min + " min" : "";
    if (seg) base += (base ? " " : "") + seg + " seg";
    if (!increment) return min && !seg ? min + (min === 1 ? " minuto" : " minutos") : base;
    return base + " + " + increment + " seg";
  }

  function buscar(initial, increment) {
    return LISTA.find((r) => r.initial === (initial === undefined ? null : initial) && r.increment === (increment || 0)) || null;
  }

  // Monta el selector (con sus grupos) y los dos campos del ritmo personalizado,
  // que se destapan solo al elegir «Personalizado». Devuelve cómo leerlo.
  function montar(select, opciones) {
    opciones = opciones || {};
    const doc = select.ownerDocument;
    select.innerHTML = "";
    GRUPOS.forEach((g) => {
      const padre = g.titulo ? doc.createElement("optgroup") : select;
      if (g.titulo) { padre.label = g.titulo; select.appendChild(padre); }
      g.ritmos.forEach(([id]) => {
        const r = LISTA.find((x) => x.id === id);
        const o = doc.createElement("option");
        o.value = r.id; o.textContent = r.label;
        padre.appendChild(o);
      });
    });
    const otro = doc.createElement("option");
    otro.value = "otro"; otro.textContent = "Personalizado…";
    select.appendChild(otro);

    const base = select.id || "ritmo";
    const caja = doc.createElement("div");
    caja.className = "grid grid-cols-2 gap-2 mt-2";
    caja.hidden = true;
    const clases = select.className;
    caja.innerHTML =
      '<div><label for="' + base + '-min" class="block text-xs font-medium text-brand-500 dark:text-brand-300 mb-1">Minutos</label>' +
      '<input id="' + base + '-min" type="number" min="0.5" max="180" step="0.5" inputmode="decimal" class="' + clases + '"></div>' +
      '<div><label for="' + base + '-inc" class="block text-xs font-medium text-brand-500 dark:text-brand-300 mb-1">Segundos por jugada</label>' +
      '<input id="' + base + '-inc" type="number" min="0" max="180" step="1" inputmode="numeric" class="' + clases + '"></div>';
    select.insertAdjacentElement("afterend", caja);
    const campoMin = caja.querySelector("#" + base + "-min");
    const campoInc = caja.querySelector("#" + base + "-inc");

    function sincronizar() { caja.hidden = select.value !== "otro"; }
    select.addEventListener("change", sincronizar);

    function poner(initial, increment) {
      const r = buscar(initial, increment);
      if (r) { select.value = r.id; }
      else {
        select.value = "otro";
        campoMin.value = String(initial / 60);
        campoInc.value = String(increment || 0);
      }
      sincronizar();
    }

    // { initial, increment, label } o { error } con qué está mal, en palabras.
    function leer() {
      if (select.value !== "otro") {
        const r = LISTA.find((x) => x.id === select.value) || LISTA[0];
        return { initial: r.initial, increment: r.increment, label: r.label };
      }
      const min = Number(String(campoMin.value).replace(",", "."));
      const inc = Number(String(campoInc.value || "0").replace(",", "."));
      if (!isFinite(min) || campoMin.value === "") return { error: "Escribe cuántos minutos tiene cada jugador." };
      const initial = Math.round(min * 60);
      if (initial < MIN_SEGUNDOS || initial > MAX_SEGUNDOS) return { error: "Cada jugador tiene que tener entre medio minuto y 180 minutos." };
      if (!isFinite(inc) || inc < 0 || inc > MAX_INCREMENTO || Math.round(inc) !== inc) return { error: "El incremento va de 0 a 180 segundos, en números enteros." };
      return { initial: initial, increment: inc, label: etiqueta(initial, inc) };
    }

    if (opciones.valor) select.value = opciones.valor;
    sincronizar();
    return { leer: leer, poner: poner, caja: caja };
  }

  window.Ritmos = { LISTA: LISTA, etiqueta: etiqueta, buscar: buscar, montar: montar };
})();
