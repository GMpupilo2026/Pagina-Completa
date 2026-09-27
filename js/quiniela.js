/* La quiniela de resultados de la sala de cine (transmision.html).
 *
 * Todo pasa por la Edge Function quiniela: la base no se lee desde acá (sus
 * tablas no dejan). Ver «La quiniela de resultados» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   Quiniela.iniciar(sala)   la sala ya leída de salas_torneo (con quiniela = true)
 *
 * Al anotarse, la función devuelve un código que se guarda en este navegador
 * (localStorage): con él se cambian los pronósticos. Si el navegador no deja
 * guardar, la quiniela funciona igual mientras la página esté abierta.
 */
(function () {
  "use strict";

  const CADA_MS = 60000;
  const PRONOSTICOS = [["1-0", "Ganan blancas"], ["½-½", "Tablas"], ["0-1", "Ganan negras"]];
  const $ = (id) => document.getElementById(id);

  let sala = null;
  let token = null;
  let datos = null;
  let temporizador = null;
  let enviando = false;
  let volverA = null;     // «partida|pronóstico» del botón que tenía el foco al guardar

  const clave = () => "quiniela_v1:" + sala.clave;
  function leerToken() { try { return localStorage.getItem(clave()); } catch (e) { return null; } }
  function guardarToken(t) { try { if (t) localStorage.setItem(clave(), t); else localStorage.removeItem(clave()); } catch (e) { /* sin almacenamiento */ } }

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  async function llamar(cuerpo) {
    const { data, error } = await sb.functions.invoke("quiniela", { body: Object.assign({ clave: sala.clave }, cuerpo) });
    if (error) {
      // La función contesta los errores esperados con 200 y { error }; esto es
      // la función caída o la sala sin quiniela (404).
      let mensaje = "No pudimos conectarnos con la quiniela ahora mismo.";
      try { const cuerpoError = await error.context.json(); if (cuerpoError && cuerpoError.error) mensaje = cuerpoError.error; } catch (e) { /* sin cuerpo */ }
      throw new Error(mensaje);
    }
    return data || {};
  }

  function hora(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("es-CR", { timeZone: "America/Costa_Rica", weekday: "long", hour: "numeric", minute: "2-digit" });
  }

  // ---------------------------------------------------------------- pintar

  function pintarTabla() {
    const cuerpo = $("quiniela-tabla");
    cuerpo.innerHTML = "";
    const filas = (datos && datos.tabla) || [];
    $("quiniela-tabla-vacia").classList.toggle("hidden", filas.length > 0);
    filas.forEach((f) => {
      const tr = el("tr", "pizarra-linea");
      // Medalla solo con aciertos: con 0, el puesto es de la lista, no un podio.
      tr.appendChild(el("td", "py-2 pr-2 whitespace-nowrap", (f.aciertos > 0 && f.puesto <= 3 ? ["🥇", "🥈", "🥉"][f.puesto - 1] + " " : "") + f.puesto));
      const th = el("th", "py-2 pr-2 font-semibold text-left", f.nombre);
      th.scope = "row";
      tr.appendChild(th);
      tr.appendChild(el("td", "py-2 pr-2 text-right font-bold pizarra-puntos", String(f.aciertos)));
      tr.appendChild(el("td", "py-2 text-right pizarra-tenue", String(f.resueltos)));
      cuerpo.appendChild(tr);
    });
  }

  function textoDe(p) { return (PRONOSTICOS.find((x) => x[0] === p) || [p, p])[1]; }

  function pintarPartida(ronda, p, mios) {
    const li = el("li", "rounded-xl border border-brand-700 bg-brand-950/60 p-3 sm:p-4");
    const titulo = el("p", "text-sm text-white");
    const mesa = el("span", "font-semibold", "Mesa " + p.mesa + ": ");
    titulo.appendChild(mesa);
    titulo.appendChild(document.createTextNode(p.blancas + " (blancas) – " + p.negras + " (negras)"));
    li.appendChild(titulo);
    const mio = mios[p.id];
    if (p.cerrada) {
      const t = el("p", "text-sm text-brand-200 mt-2");
      let texto = mio ? "Tu pronóstico: " + textoDe(mio) + "." : "No pronosticaste esta partida.";
      if (p.resultado) {
        texto += " Resultado: " + p.resultado + " (" + textoDe(p.resultado).toLowerCase() + ").";
        if (mio) texto += mio === p.resultado ? " ✓ Acertaste." : " ✗ No acertaste.";
      } else {
        texto += " Ya empezó: los pronósticos se cerraron.";
      }
      t.textContent = texto;
      li.appendChild(t);
      return li;
    }
    const grupo = el("div", "flex flex-wrap gap-2 mt-3");
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", "Tu pronóstico para la mesa " + p.mesa + " de la " + ronda.nombre.toLowerCase());
    PRONOSTICOS.forEach(([valor, texto]) => {
      const b = el("button", "cine-ronda px-3 py-1.5 rounded-full text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950 disabled:opacity-60", texto);
      b.type = "button";
      b.dataset.partida = p.id;
      b.dataset.pronostico = valor;
      b.setAttribute("aria-pressed", String(mio === valor));
      b.addEventListener("click", () => pronosticar(p, valor));
      grupo.appendChild(b);
    });
    li.appendChild(grupo);
    return li;
  }

  function pintarMia() {
    const yo = datos && datos.yo;
    $("quiniela-cargando").classList.add("hidden");
    $("quiniela-unirse").classList.toggle("hidden", !!yo);
    $("quiniela-mia").classList.toggle("hidden", !yo);
    if (!yo) return;
    $("quiniela-quien").textContent = "Participas como " + yo.nombre + ". Puedes cambiar tus pronósticos hasta que empiece cada ronda.";
    const caja = $("quiniela-rondas");
    // El foco se devuelve al mismo botón después de redibujar.
    const a = document.activeElement;
    // (Mientras guarda, el botón está desactivado y pierde el foco: por eso
    // pronosticar() anota en volverA a cuál hay que volver.)
    const enfocado = volverA || (a && caja.contains(a) && a.dataset.partida ? a.dataset.partida + "|" + a.dataset.pronostico : null);
    volverA = null;
    caja.innerHTML = "";
    const rondas = (datos.rondas || []).filter((r) => r.partidas.length);
    if (!rondas.length) {
      caja.appendChild(el("p", "text-brand-200 text-sm", "Todavía no hay partidas pareadas. Aparecen aquí apenas se publiquen los pareos."));
      return;
    }
    // Primero las rondas que se pueden pronosticar, después las cerradas.
    const abiertas = rondas.filter((r) => r.partidas.some((p) => !p.cerrada));
    const cerradas = rondas.filter((r) => !r.partidas.some((p) => !p.cerrada)).reverse();
    abiertas.concat(cerradas).forEach((r) => {
      const bloque = el("section", "");
      const abierta = r.partidas.some((p) => !p.cerrada);
      const h = el("h3", "font-serif text-lg font-bold text-white mb-1", r.nombre);
      bloque.appendChild(h);
      bloque.appendChild(el("p", "text-xs text-brand-200 mb-3",
        abierta ? (r.cierra_en ? "Se cierra al empezar la ronda (" + hora(r.cierra_en) + ")" : "Se cierra al empezar cada partida.") : "Cerrada."));
      const ul = el("ul", "space-y-2");
      r.partidas.forEach((p) => ul.appendChild(pintarPartida(r, p, yo.pronosticos || {})));
      bloque.appendChild(ul);
      caja.appendChild(bloque);
    });
    if (enfocado) {
      const [partida, pron] = enfocado.split("|");
      const b = caja.querySelector('button[data-partida="' + CSS.escape(partida) + '"][data-pronostico="' + CSS.escape(pron) + '"]');
      if (b) b.focus();
    }
  }

  function pintar() {
    pintarTabla();
    pintarMia();
  }

  // ---------------------------------------------------------------- acciones

  async function actualizar() {
    clearTimeout(temporizador);
    if (!document.hidden) {
      try {
        datos = await llamar({ accion: "estado", token: token || undefined });
        // El código que había en el navegador ya no vale (la quiniela se borró
        // o se reinició): se olvida y se vuelve a pedir que se anote.
        if (token && !datos.yo) { token = null; guardarToken(null); }
        pintar();
      } catch (e) {
        console.error(e);
        $("quiniela-cargando").textContent = e.message + " Se vuelve a intentar sola en un rato.";
      }
    }
    temporizador = setTimeout(actualizar, CADA_MS);
  }

  async function unirse(ev) {
    ev.preventDefault();
    if (enviando) return;
    const msg = $("quiniela-unirse-msg");
    const nombre = $("quiniela-nombre").value.trim();
    const correo = $("quiniela-correo").value.trim();
    if (nombre.length < 2) { msg.textContent = "Escribe tu nombre."; $("quiniela-nombre").focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { msg.textContent = "Revisa el correo: tiene que ser como nombre@ejemplo.com."; $("quiniela-correo").focus(); return; }
    if (!$("quiniela-acepto").checked) { msg.textContent = "Para participar tienes que aceptar la Política de privacidad."; $("quiniela-acepto").focus(); return; }
    enviando = true;
    $("quiniela-entrar").disabled = true;
    msg.textContent = "Anotándote…";
    try {
      const r = await llamar({ accion: "unirse", nombre, correo, privacidad: window.LegalVersion && LegalVersion.PRIVACIDAD });
      if (r.error || !r.token) { msg.textContent = r.error || "No se pudo anotar. Intenta de nuevo."; return; }
      token = r.token;
      guardarToken(token);
      msg.textContent = "";
      await actualizar();
      $("quiniela-quien").setAttribute("tabindex", "-1");
      $("quiniela-quien").focus();
    } catch (e) {
      msg.textContent = e.message;
    } finally {
      enviando = false;
      $("quiniela-entrar").disabled = false;
    }
  }

  async function pronosticar(p, valor) {
    const msg = $("quiniela-msg");
    const botones = document.querySelectorAll('#quiniela-rondas button[data-partida="' + CSS.escape(p.id) + '"]');
    volverA = p.id + "|" + valor;
    botones.forEach((b) => { b.disabled = true; });
    try {
      const r = await llamar({ accion: "pronosticar", token, partida: p.id, pronostico: valor });
      if (r.error) {
        msg.textContent = r.error;
      } else {
        datos.yo.pronosticos[p.id] = valor;
        msg.textContent = "Guardado: mesa " + p.mesa + ", " + textoDe(valor).toLowerCase() + ".";
      }
      await actualizar();
    } catch (e) {
      msg.textContent = e.message;
      botones.forEach((b) => { b.disabled = false; });
    }
  }

  function iniciar(s) {
    if (!s || !s.quiniela) return;
    sala = s;
    token = leerToken();
    $("quiniela").classList.remove("hidden");
    $("quiniela-unirse").addEventListener("submit", unirse);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) actualizar(); });
    actualizar();
  }

  window.Quiniela = { iniciar };
})();
