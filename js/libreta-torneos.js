/* libreta-torneos.html: «Mi libreta de torneos».
 *
 * Las partidas de torneo en tablero que el alumno anotó de su planilla
 * (partidas_torneo, desde «Tus propios errores»), agrupadas por torneo: los
 * puntos, cómo cambió su Elo oficial, cada partida con su ronda, lo que
 * encontró el motor y lo que pensaba en cada jugada (sus comentarios).
 *
 *   - El alumno ve la suya y comenta sus jugadas (solo `comentarios`: las
 *     jugadas no se editan, el permiso de la base es por columna).
 *   - ?alumno=<id>: la de un alumno, para su profesor, quien lo supervisa y
 *     administración (lo que se ve lo decide la RLS). Solo lectura. Quien da
 *     clase puede llevar los errores de una partida a un plan de clase.
 *   - Quien da clase sin ?alumno=: las últimas partidas que anotaron sus
 *     alumnos (adonde lleva el aviso al celular y «Lo urgente» de su panel).
 *
 * Todo lo que escribe una persona (el torneo, los comentarios) va por
 * textContent. Ver «Mi libreta de torneos» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const E = window.ErroresPropios;
  const ZONA = "America/Costa_Rica";
  const SAN = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?$/;
  const MAX_COMENTARIO = 500;
  const sanEs = (s) => (window.TiposReglas ? TiposReglas.sanEs(s) : s);
  const el = (tag, cls, texto) => { const x = document.createElement(tag); if (cls) x.className = cls; if (texto != null) x.textContent = texto; return x; };

  // Un día de calendario («2026-10-04») a mediodía en Costa Rica: no se corre.
  const dia = (f, largo) => /^\d{4}-\d{2}-\d{2}$/.test(f || "")
    ? new Date(f + "T18:00:00Z").toLocaleDateString("es-CR", { day: "numeric", month: largo ? "long" : "short", year: "numeric", timeZone: ZONA }) : "";
  const momento = (iso) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: ZONA });
  const jugadaNum = (i, san) => (i % 2 === 0 ? (i / 2 + 1) + "." : Math.floor(i / 2) + 1 + "…") + sanEs(san);

  // Cómo terminó, dicho a quien mira (tú / él).
  function resultadoDe(p, tu) {
    if (p.resultado === "1/2-1/2") return "tablas";
    if (p.resultado === "*") return "sin resultado";
    const gano = (p.resultado === "1-0") === (p.color === "w");
    return gano ? (tu ? "ganaste" : "ganó") : (tu ? "perdiste" : "perdió");
  }
  function puntosDe(p) {
    if (p.resultado === "1/2-1/2") return 0.5;
    if (p.resultado === "*") return null;
    return (p.resultado === "1-0") === (p.color === "w") ? 1 : 0;
  }
  const medio = (n) => { const e = Math.floor(n); const m = n - e >= 0.5; return (e || !m ? String(e) : "") + (m ? "½" : ""); };

  /* El Elo oficial antes y después del torneo (elo_historial, una fila por
     mes): el de la lista del mes en que empezó y el de la primera lista
     después del mes en que terminó (la FIDE publica el 1.º de cada mes). */
  function eloDelTorneo(historial, desde, hasta, campo) {
    const mes = (f) => f.slice(0, 7) + "-01";
    const con = historial.filter((h) => Number.isFinite(h[campo]));
    const antes = con.filter((h) => h.periodo <= mes(desde)).pop();
    const despues = con.find((h) => h.periodo > mes(hasta));
    return antes && despues ? { antes: antes[campo], despues: despues[campo] } : null;
  }

  // Los ejercicios de «Tus propios errores» de cada partida, por su id:
  // «torneo-<id>-<media jugada>».
  function erroresPorPartida(ejercicios) {
    const por = {};
    (ejercicios || []).forEach((x) => {
      const m = /^torneo-([0-9a-f-]{36})-(\d+)$/.exec(x.id);
      if (!m) return;
      (por[m[1]] = por[m[1]] || []).push(Object.assign({ ply: Number(m[2]) }, x));
    });
    Object.values(por).forEach((l) => l.sort((a, b) => a.ply - b.ply));
    return por;
  }

  // Los comentarios guardados, solo los que tienen forma (los escribió el
  // navegador del alumno): {"<media jugada, desde 1>": "texto"}.
  function comentariosDe(p, total) {
    const out = {};
    const c = p.comentarios && typeof p.comentarios === "object" ? p.comentarios : {};
    Object.keys(c).forEach((k) => {
      const n = Number(k);
      if (Number.isInteger(n) && n >= 1 && n <= total && typeof c[k] === "string" && c[k].trim()) out[n] = c[k].trim().slice(0, MAX_COMENTARIO);
    });
    return out;
  }

  // Las notas del visor: lo que pensaba y lo que dijo el motor, por jugada.
  function notasDe(jug, comentarios, errores, tu) {
    return jug.map((san, i) => {
      const partes = [];
      if (comentarios[i + 1]) partes.push((tu ? "Lo que pensabas: «" : "Lo que pensaba: «") + comentarios[i + 1] + "»");
      const e = errores.find((x) => x.ply === i);
      if (e) partes.push("El motor: " + (e.nivel === 2 ? "se " + (tu ? "te" : "le") + " escapó la ventaja" : (tu ? "regalaste" : "regaló")) +
        ". Lo bueno era " + e.buenas.map(sanEs).join(" o ") + ".");
      return partes.join(" ");
    });
  }

  function pintarPartida(p, ctx) {
    const jug = (Array.isArray(p.jugadas) ? p.jugadas : []).filter((x) => typeof x === "string" && SAN.test(x));
    const errores = ctx.errores[p.id] || [];
    let comentarios = comentariosDe(p, jug.length);
    const li = el("li", "border-t border-brand-100 dark:border-brand-800 pt-4 scroll-mt-28");
    li.id = "partida-" + p.id;
    const nErr = ctx.conErrores ? errores.length : (Number.isInteger(p.errores) ? p.errores : null);
    li.appendChild(el("p", "font-semibold text-brand-800 dark:text-white", [
      p.ronda ? "Ronda " + p.ronda : null, dia(p.fecha), p.color === "w" ? "con blancas" : "con negras", resultadoDe(p, ctx.tu),
      Number.isInteger(p.rival_elo) ? "rival de " + p.rival_elo + " Elo" : null,
      Math.ceil(jug.length / 2) + (jug.length > 2 ? " jugadas" : " jugada"),
    ].filter(Boolean).join(" · ")));
    li.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300",
      nErr === null ? "Todavía no se revisó con el motor." : nErr === 0 ? "El motor no encontró errores grandes." : "El motor encontró " + (nErr === 1 ? "1 error" : nErr + " errores") + "."));

    // Lo que pensaba, a la vista (también al imprimir).
    const lista = el("ul", "mt-2 space-y-1 text-sm text-brand-700 dark:text-brand-100");
    lista.dataset.comentarios = "";
    const pintarLista = () => {
      lista.replaceChildren();
      Object.keys(comentarios).map(Number).sort((a, b) => a - b).forEach((n) => {
        const x = el("li");
        x.append(el("span", "font-mono font-semibold", jugadaNum(n - 1, jug[n - 1]) + ": "), document.createTextNode("«" + comentarios[n] + "»"));
        lista.appendChild(x);
      });
      lista.hidden = !lista.childElementCount;
    };
    pintarLista();
    li.appendChild(lista);

    // La partida en el tablero, con lo que pensaba y lo que dijo el motor.
    const det = el("details", "mt-2 print:hidden");
    det.appendChild(el("summary", "cursor-pointer text-sm font-semibold text-accent-700 dark:text-accent-400 underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
      ctx.tu ? "Ver la partida y comentar lo que pensabas" : "Ver la partida en el tablero"));
    const cuerpo = el("div", "mt-3 grid md:grid-cols-2 gap-4 items-start");
    const caja = el("div", "min-w-0");
    cuerpo.appendChild(caja);
    det.appendChild(cuerpo);
    let visor = null;
    det.addEventListener("toggle", () => {
      if (!det.open || visor || !window.VisorLinea) return;
      let form = null;
      visor = VisorLinea.montar(caja, { nombre: "Tablero de la partida", alCambiar: (i) => form && form.mostrar(i) });
      if (ctx.tu) form = formularioComentario(p, jug, () => comentarios, (nuevos) => {
        comentarios = nuevos;
        pintarLista();
        visor.cargar(jug, { en: visor.indice, notas: notasDe(jug, comentarios, errores, true) });
      }, cuerpo);
      visor.cargar(jug, { en: 0, notas: notasDe(jug, comentarios, errores, ctx.tu), titulo: p.evento || "Tu partida" });
    });
    li.appendChild(det);

    // Llevar sus errores a la clase: quien da clase, mirando a su alumno.
    if (!ctx.tu && ctx.daClase && errores.length && window.PlanClase && E) li.appendChild(botonPlan(p, errores, ctx));
    return li;
  }

  /* Comentar la jugada en que está el tablero. Se guarda la UNIÓN con lo que
     ya había (solo cambia esa jugada) y queda lo que la base devuelve. */
  function formularioComentario(p, jug, actuales, alGuardar, padre) {
    const f = el("form", "min-w-0 flex flex-col gap-2");
    f.noValidate = true;
    f.dataset.comentar = "";
    const etiqueta = el("label", "text-sm font-semibold text-brand-700 dark:text-brand-200");
    const area = el("textarea", "border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100");
    area.rows = 4; area.maxLength = MAX_COMENTARIO; area.id = "comentario-" + p.id;
    etiqueta.htmlFor = area.id;
    const ayuda = el("p", "text-xs text-brand-500 dark:text-brand-300", "Qué pensabas, qué temías, qué querías hacer. A tu profe le sirve para entender por qué jugaste así.");
    const guardar = el("button", "self-start bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50", "Guardar lo que pensabas");
    guardar.type = "submit";
    const estado = el("p", "text-sm text-brand-600 dark:text-brand-300");
    estado.setAttribute("role", "status");
    f.append(etiqueta, area, ayuda, guardar, estado);
    padre.appendChild(f);
    let indice = 0;
    f.mostrar = (i) => {
      indice = i;
      const hay = i > 0;
      etiqueta.textContent = hay ? "Lo que pensabas en " + jugadaNum(i - 1, jug[i - 1]) : "Avanza a una jugada para comentarla";
      area.disabled = guardar.disabled = !hay;
      area.value = hay ? (actuales()[i] || "") : "";
      estado.textContent = "";
    };
    f.mostrar(0);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!indice) return;
      const texto = area.value.trim().slice(0, MAX_COMENTARIO);
      const nuevos = {};
      const antes = actuales();
      Object.keys(antes).forEach((k) => { nuevos[k] = antes[k]; });
      if (texto) nuevos[indice] = texto; else delete nuevos[indice];
      guardar.disabled = true;
      estado.textContent = "Guardando…";
      const { data, error } = await sb.from("partidas_torneo").update({ comentarios: nuevos }).eq("id", p.id).select("comentarios").maybeSingle();
      guardar.disabled = false;
      if (error || !data) { estado.textContent = "No se pudo guardar. Revisa tu conexión e intenta de nuevo."; return; }
      const quedan = comentariosDe({ comentarios: data.comentarios }, jug.length);
      const ya = indice;
      alGuardar(quedan);
      f.mostrar(ya);
      estado.textContent = texto ? "Guardado." : "Comentario borrado.";
    });
    return f;
  }

  function botonPlan(p, errores, ctx) {
    const caja = el("div", "mt-2 print:hidden");
    const btn = el("button", "text-sm font-semibold px-4 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
    btn.type = "button";
    btn.append(el("span", null, "📋 "), document.createTextNode(errores.length === 1 ? "Llevar su error a un plan de clase" : "Llevar sus " + errores.length + " errores a un plan de clase"));
    btn.firstChild.setAttribute("aria-hidden", "true");
    const msg = el("p", "text-sm mt-2 text-brand-600 dark:text-brand-300");
    msg.setAttribute("role", "status");
    msg.dataset.planEstado = "";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      msg.textContent = "Armando el plan…";
      try {
        const T = window.PreparacionTactica ? PreparacionTactica.TEMAS : null;
        const plan = await E.llevarAPlan(sb, PlanClase, ctx.yo,
          "Errores de " + ctx.nombre + " en su partida" + (p.evento ? " de «" + p.evento + "»" : " de torneo") + " (" + dia(p.fecha) + ")", errores, { TEMAS: T, sanEs });
        msg.textContent = "Listo: el plan quedó en tus Planes de clase. ";
        const a = el("a", "font-semibold text-accent-700 dark:text-accent-400 underline", "Abrir el plan");
        a.href = "planes.html?plan=" + encodeURIComponent(plan.id);
        msg.appendChild(a);
      } catch (e) {
        console.error(e);
        msg.textContent = "No se pudo armar el plan. Intenta de nuevo en un momento.";
        btn.disabled = false;
      }
    });
    caja.append(btn, msg);
    return caja;
  }

  function pintarTorneo(nombre, partidas, ctx) {
    const sec = el("section", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6 break-inside-avoid");
    sec.appendChild(el("h2", "font-serif text-xl font-bold text-brand-800 dark:text-white", nombre));
    const fechas = partidas.map((p) => p.fecha).sort();
    const desde = fechas[0], hasta = fechas[fechas.length - 1];
    sec.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", desde === hasta ? dia(desde, true) : "Del " + dia(desde, true) + " al " + dia(hasta, true)));
    const con = partidas.map(puntosDe).filter((x) => x !== null);
    const suma = con.reduce((a, b) => a + b, 0);
    const g = con.filter((x) => x === 1).length, t = con.filter((x) => x === 0.5).length, pe = con.filter((x) => x === 0).length;
    const sinRes = partidas.length - con.length;
    const resumen = el("p", "mt-2 text-brand-800 dark:text-white");
    resumen.dataset.puntos = "";
    resumen.append(el("strong", null, (ctx.tu ? "Hiciste " : "Hizo ") + medio(suma) + " de " + con.length + (con.length === 1 ? " punto" : " puntos")),
      document.createTextNode(" (" + [g + (g === 1 ? " ganada" : " ganadas"), t + " tablas", pe + (pe === 1 ? " perdida" : " perdidas")].join(", ") + ")" +
        (sinRes ? " · " + sinRes + (sinRes === 1 ? " partida sin resultado" : " partidas sin resultado") : "") + "."));
    sec.appendChild(resumen);
    const elos = [["fide_estandar", "Elo FIDE"], ["nacional", "Elo Nacional"]].map(([campo, etiqueta]) => {
      const e = eloDelTorneo(ctx.historial, desde, hasta, campo);
      if (!e) return null;
      const d = e.despues - e.antes;
      return etiqueta + ": " + e.antes + " → " + e.despues + " (" + (d > 0 ? "+" : d < 0 ? "−" : "±") + Math.abs(d) + ")";
    }).filter(Boolean);
    if (elos.length) { const x = el("p", "text-sm text-brand-700 dark:text-brand-200", elos.join(" · ") + "."); x.dataset.elo = ""; sec.appendChild(x); }
    const ul = el("ul", "mt-4 space-y-4");
    partidas.slice().sort((a, b) => (a.ronda || 99) - (b.ronda || 99) || (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
      .forEach((p) => ul.appendChild(pintarPartida(p, ctx)));
    sec.appendChild(ul);
    return sec;
  }

  async function pintarLibreta(alumno, yo, perfil) {
    const tu = alumno === yo;
    let nombre = perfil.full_name || "";
    if (!tu) {
      const { data } = await sb.from("profiles").select("id, full_name").eq("id", alumno).maybeSingle();
      if (!data) return false;
      nombre = data.full_name || "este alumno";
    }
    const [partidas, historial, estado] = await Promise.all([
      sb.from("partidas_torneo").select("id, evento, ronda, fecha, color, resultado, rival_elo, jugadas, comentarios, errores, created_at")
        .eq("student_id", alumno).order("fecha", { ascending: false }).range(0, 199),
      sb.from("elo_historial").select("periodo, fide_estandar, nacional").eq("student_id", alumno).order("periodo", { ascending: true }).range(0, 299),
      E ? sb.from("training_state").select("key, value").eq("student_id", alumno).in("key", [E.CLAVE_EJERCICIOS]) : Promise.resolve({ data: [] }),
    ]);
    if (partidas.error) throw partidas.error;
    const ejercicios = E && !estado.error ? E.deFilas(estado.data).ejercicios : [];
    const ctx = {
      tu, yo, nombre,
      daClase: !tu && perfil.role === "profesor" && !perfil._persona,
      historial: historial.error ? [] : (historial.data || []),
      errores: erroresPorPartida(ejercicios),
      conErrores: !estado.error && !!E,
    };
    $("titulo").replaceChildren(el("span", null, "📒 "), document.createTextNode(tu ? "Mi libreta de torneos" : "Libreta de torneos de " + nombre));
    $("titulo").firstChild.setAttribute("aria-hidden", "true");
    document.title = (tu ? "Mi libreta de torneos" : "Libreta de " + nombre) + " — Ajedrez Integral";
    const filas = partidas.data || [];
    $("subtitulo").textContent = filas.length
      ? (tu ? "Tus " : "Sus ") + filas.length + (filas.length === 1 ? " partida de torneo" : " partidas de torneo") + ", por torneo."
      : "";
    if (!filas.length) {
      $("vacia").hidden = false;
      $("vacia").textContent = tu
        ? "Todavía no anotaste ninguna partida de torneo. Se anotan en Habilidades → «Tus propios errores» → «¿Jugaste en un torneo en tablero?», a mano o con una foto de tu planilla."
        : "Todavía no anotó ninguna partida de torneo.";
      if (tu) { const a = el("a", "block mt-3 font-semibold text-accent-700 dark:text-accent-400 underline", "Anotar una partida →"); a.href = "entreno/tipos.html#errores"; $("vacia").appendChild(a); }
    }
    // Por torneo: el nombre sin mayúsculas ni espacios de más; sin nombre, aparte.
    const grupos = new Map();
    filas.forEach((p) => {
      const clave = String(p.evento || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!grupos.has(clave)) grupos.set(clave, { nombre: String(p.evento || "").trim() || "Partidas sin torneo anotado", partidas: [] });
      grupos.get(clave).partidas.push(p);
    });
    const orden = [...grupos.values()].sort((a, b) => {
      const ua = a.partidas.map((p) => p.fecha).sort().pop(), ub = b.partidas.map((p) => p.fecha).sort().pop();
      return ua < ub ? 1 : ua > ub ? -1 : 0;
    });
    orden.forEach((g) => $("torneos").appendChild(pintarTorneo(g.nombre, g.partidas, ctx)));
    $("app").classList.remove("hidden");
    return true;
  }

  // Quien da clase (o administra), sin ?alumno=: lo último que anotaron.
  async function pintarAlumnos(yo) {
    const { data, error } = await sb.from("partidas_torneo").select("id, student_id, evento, fecha, color, resultado, errores, created_at")
      .neq("student_id", yo).order("created_at", { ascending: false }).range(0, 29);
    $("alumnos").classList.remove("hidden");
    if (error || !data || !data.length) { $("alumnos-vacia").hidden = false; return; }
    const ids = [...new Set(data.map((p) => p.student_id))];
    const { data: perfiles } = await sb.from("profiles").select("id, full_name").in("id", ids);
    const nombre = {};
    (perfiles || []).forEach((x) => { nombre[x.id] = x.full_name || "Sin nombre"; });
    data.forEach((p) => {
      const li = el("li");
      const a = el("a", "block bg-white dark:bg-brand-900 rounded-xl shadow-sm px-5 py-4 hover:ring-2 hover:ring-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
      a.href = "libreta-torneos.html?alumno=" + encodeURIComponent(p.student_id) + "#partida-" + encodeURIComponent(p.id);
      a.appendChild(el("p", "font-semibold text-brand-800 dark:text-white", (nombre[p.student_id] || "Un alumno") + (p.evento ? " · " + p.evento : "")));
      a.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", [
        dia(p.fecha), resultadoDe(p, false) + (p.color === "w" ? " con blancas" : " con negras"),
        Number.isInteger(p.errores) ? (p.errores === 1 ? "1 error del motor" : p.errores + " errores del motor") : "sin revisar todavía",
        "anotada el " + momento(p.created_at),
      ].join(" · ")));
      li.appendChild(a);
      $("alumnos-lista").appendChild(li);
    });
  }

  async function init() {
    const { data } = await sb.auth.getSession();
    const sesion = data && data.session;
    if (!sesion) { location.href = "login.html?next=" + encodeURIComponent("libreta-torneos.html" + location.search); return; }
    const yo = sesion.user.id;
    const { data: perfil } = await sb.from("profiles").select("id, role, is_admin, full_name").eq("id", yo).maybeSingle();
    const p = perfil || { id: yo, role: "alumno" };
    const pedido = new URLSearchParams(location.search).get("alumno");
    const alumno = pedido && /^[0-9a-f-]{36}$/.test(pedido) ? pedido : null;
    $("imprimir").addEventListener("click", () => window.print());
    try {
      if (!alumno && (p.role === "profesor" || p.is_admin)) await pintarAlumnos(yo);
      else if (!(await pintarLibreta(alumno || yo, yo, p))) $("no-esta").classList.remove("hidden");
    } catch (e) {
      console.error(e);
      $("no-esta").classList.remove("hidden");
    }
    $("loading").classList.add("hidden");
    // Desde el aviso: #partida-<id> lleva a esa partida.
    const destino = /^#partida-[0-9a-f-]{36}$/.test(location.hash) ? document.querySelector(location.hash) : null;
    if (destino) destino.scrollIntoView({ block: "start" });
  }

  init();
})();
