/* «Hoy en el torneo» (#hoy) en las páginas de torneo hechas con la plantilla
 * (herramientas/torneo-universitario.js) cuando el torneo todavía no se
 * juega: hoy, jdn-pz-2026.html. Es el de js/centroamericano.js, solo en
 * español: con las horas del calendario —el data-inicio de cada fila de
 * #calendario, en hora de Costa Rica, y data-minutos, lo que dura— dice la
 * cuenta regresiva antes del torneo, lo que se juega ahora y lo que sigue
 * durante, y el cierre después (los textos de cierre, de
 * window.TorneoPagina.hoy). Una sola copia de las horas: la tabla. Se vuelve
 * a pintar cada 30 segundos.
 *
 * La cuenta regresiva a la próxima ronda (#hoy-reloj): los números cambian
 * cada segundo y no se leen en voz alta; para el lector de pantalla, una
 * frase que cambia cada minuto.
 *
 * Cuando js/centroamericano.js pase a una sola copia (ver «La página del
 * Metropolitano 2026» en docs/decisiones/cuentas-y-formularios.md), este se
 * junta con ese. Ver «La de la Eliminatoria Cantonal JDN de Pérez Zeledón»
 * en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const ZONA = "America/Costa_Rica";
  const $ = (id) => document.getElementById(id);
  const CIERRE = (window.TorneoPagina && window.TorneoPagina.hoy) || {};
  const T = {
    cuenta: "Cuenta regresiva", hoy: "Hoy en el torneo",
    termino: CIERRE.termino || "El torneo terminó", gracias: CIERRE.gracias || "¡Gracias por jugar!", final: CIERRE.final || "",
    faltan: (n, u) => "Faltan " + n + " " + u, dias: ["día", "días"], horas: ["hora", "horas"], minutos: ["minuto", "minutos"],
    empieza: (ev, cuando) => "Empieza con «" + ev + "», " + cuando + ".",
    ahora: (ev) => "Ahora: " + ev, proximo: (ev) => "Lo próximo: " + ev,
    empezo: (h) => "Empezó a las " + h + ".", despues: (ev, cuando) => " Después: " + ev + ", " + cuando + ".",
    cuando: (cuando, falta) => cuando.charAt(0).toUpperCase() + cuando.slice(1) + " (faltan " + falta + ").",
    hoyA: (h) => "hoy a las " + h, mananaA: (d, h) => "mañana, " + d + ", a las " + h, diaA: (d, h) => "el " + d + " a las " + h,
    zona: "hora de Costa Rica",
    reloj: (n, cuando) => "Faltan para la ronda " + n + " (" + cuando + "):", relojCorto: "Faltan:",
    relojTexto: (n, falta) => "Faltan " + falta + " para la ronda " + n + ".",
    unidades: { d: ["día", "días"], h: ["hora", "horas"], m: ["min", "min"], s: ["seg", "seg"] },
  };

  const limpio = (s) => String(s || "").replace(/\s+/g, " ").trim();

  function eventos() {
    return [...document.querySelectorAll("#calendario tr[data-inicio]")].map((tr) => {
      const inicio = new Date(tr.dataset.inicio + ":00-06:00");   // Costa Rica no tiene horario de verano
      const fin = new Date(inicio.getTime() + (Number(tr.dataset.minutos) || 60) * 60000);
      return { tr, inicio, fin, nombre: () => limpio(tr.querySelector("th").textContent) };
    }).filter((e) => !isNaN(e.inicio)).sort((a, b) => a.inicio - b.inicio);
  }

  const plural = (n, par) => n + " " + (n === 1 ? par[0] : par[1]);
  const diaCR = (d) => d.toLocaleDateString("en-CA", { timeZone: ZONA });
  const hora = (d) => d.toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", timeZone: ZONA });
  // «domingo 22 de noviembre», sin la coma que pone es-CR.
  const dia = (d) => d.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA }).replace(",", "");

  function cuando(d, ahora) {
    const hoy = diaCR(ahora), ese = diaCR(d);
    const manana = diaCR(new Date(ahora.getTime() + 24 * 3600000));
    if (ese === hoy) return T.hoyA(hora(d));
    if (ese === manana) return T.mananaA(dia(d), hora(d));
    return T.diaA(dia(d), hora(d));
  }

  function falta(ms) {
    const min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return plural(min, T.minutos);
    const h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }

  function pintarHoy() {
    const caja = $("hoy");
    if (!caja) return;
    const evs = eventos();
    if (!evs.length) return;
    const ahora = new Date();
    const primero = evs[0], ultimo = evs[evs.length - 1];
    let etiqueta, principal, detalle;
    if (ahora < primero.inicio) {
      const ms = primero.inicio - ahora;
      const dias = Math.floor(ms / 86400000);
      const horas = Math.floor(ms / 3600000), mins = Math.max(1, Math.round(ms / 60000));
      etiqueta = T.cuenta;
      principal = dias >= 2 ? T.faltan(dias, T.dias[1])
        : ms >= 3600000 ? T.faltan(horas, horas === 1 ? T.horas[0] : T.horas[1])
        : T.faltan(mins, mins === 1 ? T.minutos[0] : T.minutos[1]);
      detalle = T.empieza(primero.nombre(), cuando(primero.inicio, ahora) + " (" + T.zona + ")");
    } else if (ahora >= ultimo.fin) {
      etiqueta = T.termino;
      principal = T.gracias;
      detalle = T.final;
    } else {
      etiqueta = T.hoy;
      const enCurso = evs.filter((e) => e.inicio <= ahora && ahora < e.fin).pop();
      const siguiente = evs.find((e) => e.inicio > ahora);
      if (enCurso) {
        principal = T.ahora(enCurso.nombre());
        detalle = T.empezo(hora(enCurso.inicio)) + (siguiente ? T.despues(siguiente.nombre(), cuando(siguiente.inicio, ahora)) : "");
      } else {
        principal = T.proximo(siguiente.nombre());
        // Si lo próximo es una ronda, cuánto falta lo dice el reloj de abajo.
        const c = cuando(siguiente.inicio, ahora);
        detalle = siguiente.tr.dataset.ronda ? c.charAt(0).toUpperCase() + c.slice(1) + "." : T.cuando(c, falta(siguiente.inicio - ahora));
      }
    }
    pintarReloj(evs, ahora);
    $("hoy-etiqueta").textContent = etiqueta;
    $("hoy-principal").textContent = principal;
    // «8:00 a. m.» ya trae su punto: no se le pone otro.
    $("hoy-detalle").textContent = detalle.replace(/\.\./g, ".");
    caja.dataset.estado = ahora < primero.inicio ? "antes" : ahora >= ultimo.fin ? "despues" : "durante";
  }

  let relojMeta = null;
  function pintarReloj(evs, ahora) {
    const caja = $("hoy-reloj");
    if (!caja) return;
    const r = evs.find((e) => e.tr.dataset.ronda && e.inicio > ahora);
    relojMeta = r ? { inicio: r.inicio, n: r.tr.dataset.ronda } : null;
    caja.hidden = !r;
    if (!r) return;
    // Si arriba ya dice que lo próximo es esta ronda y cuándo, el reloj no lo repite.
    const enCurso = evs.some((e) => e.inicio <= ahora && ahora < e.fin);
    const esLoProximo = ahora >= evs[0].inicio && !enCurso && evs.find((e) => e.inicio > ahora) === r;
    caja.querySelector("[data-reloj-etiqueta]").textContent = esLoProximo ? T.relojCorto : T.reloj(r.tr.dataset.ronda, cuando(r.inicio, ahora));
    tic();
  }

  const dos = (n) => String(n).padStart(2, "0");
  function tic() {
    const caja = $("hoy-reloj");
    if (!caja || !relojMeta || caja.hidden) return;
    const { inicio, n } = relojMeta;
    const ms = inicio - new Date();
    if (ms <= 0) { pintarHoy(); return; }
    const seg = Math.floor(ms / 1000);
    const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    const partes = (d ? [[d, T.unidades.d]] : []).concat([[h, T.unidades.h], [m, T.unidades.m], [s, T.unidades.s]]);
    const cifras = caja.querySelector("[data-reloj-cifras]");
    if (cifras.dataset.firma !== String(partes.length)) {
      cifras.replaceChildren(...partes.map(() => {
        const c = document.createElement("span");
        c.className = "cac-hoy-reloj-casilla";
        const numero = document.createElement("span");
        numero.className = "cac-hoy-reloj-numero";
        const unidad = document.createElement("span");
        unidad.className = "cac-hoy-reloj-unidad";
        c.append(numero, unidad);
        return c;
      }));
      cifras.dataset.firma = String(partes.length);
    }
    [...cifras.children].forEach((c, i) => {
      const [v, u] = partes[i];
      c.firstChild.textContent = i === 0 && d ? String(v) : dos(v);
      c.lastChild.textContent = v === 1 ? u[0] : u[1];
    });
    // La frase, solo cuando cambia el minuto.
    const texto = T.relojTexto(n, (d ? plural(d, T.dias) + ", " : "") + (h ? plural(h, T.horas) + ", " : "") + plural(m, T.minutos));
    const sr = caja.querySelector("[data-reloj-texto]");
    if (sr.textContent !== texto) sr.textContent = texto;
  }

  pintarHoy();
  setInterval(pintarHoy, 30000);
  setInterval(tic, 1000);
})();

/*! rev bfb5bbb0d2d82f9f */
