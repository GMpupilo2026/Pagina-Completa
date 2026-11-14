/* La mesa de cada jugador, iluminada sobre la foto de la sala. Lo pidió el
 * dueño el 14/11/2026 para Tacho Chess 2: «que se le ilumine o se le marque
 * como más notable en cuál es la mesa donde tiene que ir a sentarse».
 *
 * Dónde está cada mesa en la foto lo marcó el dueño mesa por mesa (no se
 * adivina: depende de cómo numeró el gimnasio), y va en
 * `TorneoPagina.mesasSala` de la configuración del torneo:
 *   { foto: [ancho, alto],                // los píxeles de la foto
 *     torneos: [{ nombre, color, fondo, niveles: [...],
 *                 mesas: [[número, x, y], ...] }] }   // x, y en píxeles de la foto
 * Un torneo de Pareo cae en el de `torneos` con más jugadores de sus niveles
 * (el grupo de cada jugador es su nivel), así no depende de cómo se escriba
 * el nombre del torneo en Pareo.
 *
 * - En la tarjeta de «Busca a tu jugador» (js/centroamericano-vivo.js llama a
 *   `enTarjeta`): «Tu mesa en la sala» con la foto ACERCADA a su mesa y un
 *   anillo que late en el color de su torneo, con el número.
 * - En «Pareos de la ronda» (js/torneo-pareos.js): «Ver dónde queda» en cada
 *   mesa abre la misma foto acercada.
 * - En «La sala de juego» (js/torneo-sala.js llama a `enSala`): la foto entera
 *   con todas las mesas numeradas, en el color de su torneo.
 * El color nunca va solo: la frase dice el torneo, el color y el número.
 * Ver «La mesa iluminada en la foto» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";
  const CONFIG = (window.TorneoPagina && window.TorneoPagina.mesasSala) || null;
  if (!CONFIG || !Array.isArray(CONFIG.torneos) || !CONFIG.torneos.length) return;
  const [ANCHO, ALTO] = CONFIG.foto;
  const FOTO = document.querySelector("img.cac-sala-foto");
  const SRC = FOTO ? FOTO.getAttribute("src") : "";
  const ZOOM = 2.6;

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  // El torneo de la configuración que corresponde a un torneo de los datos:
  // el que tiene más jugadores de sus niveles.
  function torneoDe(tor) {
    if (!tor || !Array.isArray(tor.jugadores)) return null;
    let mejor = null, cuantos = 0;
    CONFIG.torneos.forEach((t) => {
      const n = tor.jugadores.filter((j) => t.niveles.includes(j.grupo)).length;
      if (n > cuantos) { mejor = t; cuantos = n; }
    });
    return mejor;
  }
  function ubicar(tor, mesa) {
    const t = torneoDe(tor);
    const m = t && t.mesas.find((x) => x[0] === Number(mesa));
    return m ? { t, n: m[0], x: m[1] / ANCHO, y: m[2] / ALTO } : null;
  }

  // La foto acercada a un punto, con el anillo encima. La foto mide ZOOM
  // veces la caja y se corre para que el punto quede al centro, sin dejar
  // bordes vacíos (en las orillas, el anillo se corre del centro).
  function cerca(u) {
    const caja = el("div", "cac-salafoto-cerca");
    const ancho = ZOOM * 100;
    const izq = Math.min(0, Math.max(100 - ancho, 50 - u.x * ancho));
    const arr = Math.min(0, Math.max(100 - ancho, 50 - u.y * ancho));
    const img = el("img", "");
    img.src = SRC; img.alt = ""; img.width = ANCHO; img.height = ALTO; img.loading = "lazy";
    img.style.width = ancho + "%"; img.style.left = izq + "%"; img.style.top = arr + "%";
    caja.appendChild(img);
    const anillo = el("span", "cac-salafoto-anillo", String(u.n));
    anillo.setAttribute("aria-hidden", "true");
    anillo.style.left = (izq + u.x * ancho) + "%";
    anillo.style.top = (arr + u.y * ancho) + "%";
    anillo.style.setProperty("--zona", u.t.fondo);
    caja.appendChild(anillo);
    return caja;
  }

  const frase = (u) => "Mesa " + u.n + " de la zona " + u.t.color + " (" + u.t.nombre + ")";

  // Lo que va en la tarjeta del jugador: la frase y la foto acercada.
  function enTarjeta(texto, mesa, tor) {
    const u = ubicar(tor, mesa);
    if (!u || !SRC) return null;
    const caja = el("div", "cac-salafoto-tarjeta");
    caja.appendChild(el("p", "cac-salafoto-donde", "📍 Tu mesa en la sala: " + frase(u)));
    const foto = cerca(u);
    foto.setAttribute("role", "img");
    foto.setAttribute("aria-label", "Foto del gimnasio desde la gradería con la mesa " + u.n + " de la zona " + u.t.color + " marcada con un anillo.");
    caja.appendChild(foto);
    caja.appendChild(el("p", "text-xs", "La foto es desde la gradería: tu mesa es la del anillo."));
    return caja;
  }

  // Para «Pareos de la ronda»: un botón que abre y cierra la foto acercada.
  function boton(tor, mesa) {
    const u = ubicar(tor, mesa);
    if (!u || !SRC) return null;
    const caja = el("div", "cac-salafoto-pareo");
    const b = el("button", "cac-salafoto-ver", "Ver dónde queda la mesa " + u.n);
    b.type = "button";
    b.setAttribute("aria-expanded", "false");
    let foto = null;
    b.addEventListener("click", () => {
      const abrir = !foto;
      if (abrir) {
        foto = cerca(u);
        foto.setAttribute("role", "img");
        foto.setAttribute("aria-label", frase(u) + ", marcada con un anillo en la foto del gimnasio.");
        caja.appendChild(foto);
      } else { foto.remove(); foto = null; }
      b.setAttribute("aria-expanded", String(abrir));
      b.textContent = (abrir ? "Ocultar la foto de la mesa " : "Ver dónde queda la mesa ") + u.n;
    });
    caja.appendChild(b);
    return caja;
  }

  // «La sala de juego»: la foto entera con todas las mesas numeradas. En el
  // celular la foto se agranda y se desliza de lado (dentro de su marco),
  // porque 41 números en 360 píxeles no se leen.
  function enSala() {
    const foto = document.querySelector("#sala img.cac-sala-foto");
    if (!foto || foto.closest(".cac-salafoto-marco")) return;
    const marco = el("div", "cac-salafoto-marco");
    const lienzo = el("div", "cac-salafoto-lienzo");
    foto.replaceWith(marco);
    marco.appendChild(lienzo);
    lienzo.appendChild(foto);
    CONFIG.torneos.forEach((t) => t.mesas.forEach(([n, x, y]) => {
      const p = el("span", "cac-salafoto-punto", String(n));
      p.setAttribute("aria-hidden", "true");
      p.style.left = (x / ANCHO * 100) + "%";
      p.style.top = (y / ALTO * 100) + "%";
      p.style.background = t.fondo;
      lienzo.appendChild(p);
    }));
    const ley = el("ul", "cac-salafoto-leyenda");
    ley.setAttribute("aria-label", "Las mesas de cada torneo en la foto");
    CONFIG.torneos.forEach((t) => {
      const nums = t.mesas.map((m) => m[0]).sort((a, b) => a - b);
      const li = el("li", "");
      const muestra = el("span", "cac-salafoto-muestra");
      muestra.setAttribute("aria-hidden", "true");
      muestra.style.background = t.fondo;
      li.append(muestra, el("span", "", "Zona " + t.color + ": " + t.nombre + (nums.length ? ", mesas " + nums[0] + " a " + nums[nums.length - 1] : "")));
      ley.appendChild(li);
    });
    const desliza = el("p", "cac-salafoto-desliza text-xs", "Desliza la foto de lado para ver todas las mesas.");
    marco.after(desliza);
    desliza.after(ley);
    // Al abrir la ventana, la foto centrada en las mesas (en el celular se
    // ve solo una parte); el aviso de deslizar, solo si hay algo que deslizar.
    const xs = CONFIG.torneos.flatMap((t) => t.mesas.map((m) => m[1] / ANCHO));
    const medio = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0.5;
    const centrar = () => {
      const sobra = lienzo.scrollWidth - marco.clientWidth;
      desliza.hidden = sobra < 4;
      if (sobra > 0) marco.scrollLeft = Math.max(0, Math.min(sobra, medio * lienzo.scrollWidth - marco.clientWidth / 2));
    };
    document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest('a[href="#sala"]')) requestAnimationFrame(() => requestAnimationFrame(centrar)); });
    window.addEventListener("resize", centrar);
    requestAnimationFrame(centrar);
  }

  window.TorneoSalaFoto = { torneoDe, ubicar, enTarjeta, boton, enSala };
})();

/*! rev bfb5bbb0d2d82f9f */
