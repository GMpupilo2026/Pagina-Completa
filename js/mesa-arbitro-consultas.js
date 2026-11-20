/* Las consultas del árbitro que no dependen de ningún torneo: corregir un reloj
   (art. 6.10) y lo que dice el reglamento de una irregularidad.

   Salieron de la mesa de «Dirijo solo» (mesa-arbitro.html#solo, retirada el
   19/11/2026 al quedar UNA sola mesa del árbitro) para que no se perdieran: la
   entrada de la mesa las ofrece a cualquiera, y la tablet las usa con el ritmo
   de su torneo. Las cuentas y las reglas son de js/mesa-arbitro.js (MesaArbitro:
   corregirReloj, reglaIrregularidad, modalidad); acá solo van los cuadros, con
   js/avisos.js. Ver «Una sola Mesa del árbitro» en docs/decisiones/juegos-y-torneos.md.

     MesaConsultas.ritmo(clave)                → el ritmo recordado en este aparato (o null)
     MesaConsultas.cambiarRitmo(clave)         → pide el ritmo y lo recuerda; da el nuevo o null
     MesaConsultas.reloj({ ritmo, donde, bonos, anotar })
         anotar(resumen, articulo): si viene, el último paso ofrece «Anotar en la bitácora».
     MesaConsultas.reglamento({ ritmo }) */
(function () {
  "use strict";
  const M = window.MesaArbitro;
  if (!M || !window.Avisos) return;

  // El ritmo es de cada torneo y lo escribe el árbitro. Se recuerda en este aparato (localStorage, por clave): es una
  // comodidad, no un dato que deba durar. La misma clave que usaba la mesa de antes, para no perder lo ya escrito.
  const CLAVE_RITMO = "mesa_arbitro_ritmo_v1";
  const enMemoria = {}; // si el aparato no deja guardar (ventana privada), vale mientras la página esté abierta
  function guardados() {
    try { const x = JSON.parse(localStorage.getItem(CLAVE_RITMO) || "{}"); return x && typeof x === "object" ? x : {}; } catch (e) { return {}; }
  }
  const ritmo = (clave) => M.ritmoValido(guardados()[clave || "general"]) || enMemoria[clave || "general"] || null;

  const enteroDe = (v) => (String(v == null ? "" : v).trim() === "" ? null : /^\d{1,4}$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN);
  // Un tiempo escrito: «1240», «12:40» o «1:05:30» (los dos puntos se ponen solos).
  const tiempoDe = (v) => (String(v || "").trim() === "" ? null : M.leerTiempo(M.ponerDosPuntos(v)));
  // «9:05» → la hora de hoy en Costa Rica, en milisegundos (Costa Rica no cambia de hora: siempre −06:00).
  function horaDeHoy(v) {
    const x = /^(\d{1,2}):?(\d{2})$/.exec(String(v || "").trim());
    if (!x || Number(x[1]) > 23 || Number(x[2]) > 59) return null;
    return Date.parse(window.HoraCR.hoy() + "T" + x[1].padStart(2, "0") + ":" + x[2] + ":00-06:00");
  }

  async function cambiarRitmo(clave) {
    const k = clave || "general";
    const r = ritmo(k) || M.RITMO_POR_DEFECTO;
    let previo = { inicial: String(r.inicial / 60), incremento: String(r.incremento), jugada: r.control ? String(r.control.jugada) : "", agrega: r.control ? String(r.control.agrega / 60) : "" }, error = "";
    for (;;) {
      const v = await Avisos.formulario({
        titulo: "Ritmo del torneo",
        texto: (error ? error + "\n\n" : "") + "Con el ritmo se calcula el reloj y el tiempo que da una jugada ilegal (2 minutos en clásico; 1 en rápidas y blitz, apéndice A.3). Queda recordado en este aparato.",
        campos: [
          { nombre: "inicial", etiqueta: "Tiempo inicial (minutos)", inputmode: "numeric", valor: previo.inicial },
          { nombre: "incremento", etiqueta: "Incremento por jugada (segundos; 0 si no hay)", inputmode: "numeric", valor: previo.incremento },
          { nombre: "jugada", etiqueta: "Segundo período: al completar la jugada… (vacío si no hay)", inputmode: "numeric", valor: previo.jugada },
          { nombre: "agrega", etiqueta: "…se suman (minutos)", inputmode: "numeric", valor: previo.agrega },
        ],
        aceptar: "Guardar el ritmo",
      });
      if (v === null) return null;
      previo = v;
      const ini = enteroDe(v.inicial), inc = enteroDe(v.incremento) == null ? 0 : enteroDe(v.incremento), jug = enteroDe(v.jugada), agr = enteroDe(v.agrega);
      const control = jug == null && agr == null ? null : { jugada: jug, agrega: agr == null || Number.isNaN(agr) ? NaN : agr * 60 };
      const nuevo = M.ritmoValido({ inicial: ini == null ? NaN : ini * 60, incremento: inc, control });
      if (!nuevo) { error = control && (control.jugada == null || Number.isNaN(control.agrega)) ? "Para el segundo período hacen falta las dos cosas: la jugada y los minutos que se suman." : "Revisa los números: el tiempo inicial va de 1 a 360 minutos y el incremento de 0 a 600 segundos."; continue; }
      const todos = guardados();
      todos[k] = nuevo;
      try { localStorage.setItem(CLAVE_RITMO, JSON.stringify(todos)); }
      catch (e) { enMemoria[k] = nuevo; Avisos.avisar("No se pudo recordar el ritmo en este aparato: se usa solo mientras la página esté abierta.", { tipo: "error" }); }
      return nuevo;
    }
  }

  // Corregir el reloj de una mesa (o solo consultar). Tres pasos: qué pasó, los datos y el resultado, que el árbitro puede
  // ajustar antes de anotarlo. Las Leyes dejan los tiempos a su mejor criterio (art. 6.10.1 y 6.10.2).
  async function reloj(o) {
    const op = o || {};
    const r0 = op.ritmo || M.RITMO_POR_DEFECTO;
    const donde = op.donde ? " · " + op.donde : "";
    const c = await Avisos.formulario({
      titulo: "Corregir el reloj" + donde,
      texto: "Ritmo: " + M.textoRitmo(r0) + (op.ritmo ? "" : " (sin confirmar: si no es el de tu torneo, cámbialo antes)") + ".\n\nLas Leyes dejan los tiempos al mejor criterio del árbitro (art. 6.10): te doy un número con las cuentas a la vista, y lo puedes cambiar.",
      campos: [{ nombre: "caso", etiqueta: "¿Qué pasó con el reloj?", tipo: "select", valor: "control", opciones: M.CASOS_RELOJ.map((x) => [x.id, x.texto]) }],
      aceptar: "Seguir",
    });
    if (c === null) return null;
    const caso = c.caso;
    const AYUDA_T = "Como se lee en el reloj: 1240 o 12:40; 1:05:30 si pasa de una hora.";
    const campos = (v) => {
      const lista = [];
      if (caso === "apagado") lista.push({ nombre: "inicio", etiqueta: "Hora en que empezó la ronda (hora de Costa Rica)", inputmode: "numeric", valor: v.inicio, ayuda: "Por ejemplo 9:00 o 14:30." });
      lista.push({ nombre: "jb", etiqueta: "Jugadas completadas por las blancas", inputmode: "numeric", valor: v.jb },
        { nombre: "jn", etiqueta: "Jugadas completadas por las negras", inputmode: "numeric", valor: v.jn, ayuda: "Las que ya pulsaron el reloj. Las blancas llevan las mismas que las negras o una más." });
      if (caso === "apagado") {
        lista.push({ nombre: "tb", etiqueta: "Si todavía se lee: reloj de las blancas (vacío si no)", inputmode: "numeric", valor: v.tb, ayuda: AYUDA_T },
          { nombre: "tn", etiqueta: "Si todavía se lee: reloj de las negras (vacío si no)", inputmode: "numeric", valor: v.tn });
      } else {
        lista.push({ nombre: "tb", etiqueta: "Lo que marca ahora el reloj de las blancas", inputmode: "numeric", valor: v.tb, ayuda: AYUDA_T },
          { nombre: "tn", etiqueta: "Lo que marca ahora el reloj de las negras", inputmode: "numeric", valor: v.tn });
      }
      if (caso === "programado") lista.push({ nombre: "pini", etiqueta: "Tiempo inicial que se programó (minutos)", inputmode: "numeric", valor: v.pini },
        { nombre: "pinc", etiqueta: "Incremento que se programó (segundos; 0 si no había)", inputmode: "numeric", valor: v.pinc });
      return lista;
    };
    let v = { inicio: "", jb: "", jn: "", tb: "", tn: "", pini: "", pinc: "0" }, error = "", res = null;
    for (;;) {
      const r = await Avisos.formulario({ titulo: (M.CASOS_RELOJ.find((x) => x.id === caso) || {}).texto + donde, texto: error || "Escribe lo que ves en la mesa.", campos: campos(v), aceptar: "Calcular" });
      if (r === null) return null;
      v = Object.assign(v, r);
      const jB = enteroDe(r.jb), jN = enteroDe(r.jn);
      const datos = { ritmo: r0, jBlancas: jB == null ? NaN : jB, jNegras: jN == null ? NaN : jN };
      if (caso === "apagado") {
        const ahora = Date.now(), inicio = horaDeHoy(r.inicio);
        if (inicio == null) { error = "Escribe la hora de inicio como 9:00 o 14:30."; continue; }
        if (inicio > ahora) { error = "Esa hora todavía no llega hoy: revisa la hora de inicio."; continue; }
        const lb = tiempoDe(r.tb), ln = tiempoDe(r.tn);
        if ((String(r.tb || "").trim() && lb == null) || (String(r.tn || "").trim() && ln == null)) { error = "No entendí lo que marca el reloj. " + AYUDA_T; continue; }
        Object.assign(datos, { inicioMs: inicio, ahoraMs: ahora, bonos: op.bonos || [],
          visto: lb != null || ln != null ? { blancas: lb == null ? NaN : lb, negras: ln == null ? NaN : ln } : null });
      } else {
        Object.assign(datos, { tBlancas: tiempoDe(r.tb), tNegras: tiempoDe(r.tn) });
        if (datos.tBlancas == null || datos.tNegras == null) { error = "No entendí lo que marca el reloj. " + AYUDA_T; continue; }
        if (caso === "programado") datos.programado = { inicial: enteroDe(r.pini) == null || Number.isNaN(enteroDe(r.pini)) ? NaN : enteroDe(r.pini) * 60, incremento: enteroDe(r.pinc) == null ? 0 : enteroDe(r.pinc) };
      }
      res = M.corregirReloj(caso, datos);
      if (res.error) { error = res.error; continue; }
      break;
    }
    const anotable = typeof op.anotar === "function";
    const texto = ["Pon blancas " + M.formatoTiempo(res.blancas) + " y negras " + M.formatoTiempo(res.negras) + " (art. " + res.articulo + ").", "Cómo se calculó:", ...res.pasos.map((x) => "• " + x)]
      .concat(res.avisos.length ? ["", ...res.avisos.map((x) => "⚠ " + x)] : []).join("\n");
    let vista = { tb: M.formatoTiempo(res.blancas), tn: M.formatoTiempo(res.negras) }, problema = "";
    for (;;) {
      const f = await Avisos.formulario({
        titulo: "El reloj" + donde, texto: (problema ? problema + "\n\n" : "") + texto,
        campos: [{ nombre: "tb", etiqueta: "Blancas (cámbialo si tu criterio es otro)", inputmode: "numeric", valor: vista.tb, ayuda: AYUDA_T },
          { nombre: "tn", etiqueta: "Negras", inputmode: "numeric", valor: vista.tn }],
        aceptar: anotable ? "Anotar en la bitácora" : "Listo", cancelar: anotable ? "Cerrar sin anotar" : false,
      });
      if (f === null || !anotable) return res;
      const b = tiempoDe(f.tb), n = tiempoDe(f.tn);
      vista = f;
      if (b == null || n == null) { problema = "No entendí uno de los tiempos. " + AYUDA_T; continue; }
      const ajustado = b !== res.blancas || n !== res.negras;
      const linea = ajustado
        ? res.resumen.replace(/: blancas .*?, negras .*?,/, ": blancas " + M.formatoTiempo(b) + ", negras " + M.formatoTiempo(n) + ",") + " Ajustado por el árbitro; el cálculo daba blancas " + M.formatoTiempo(res.blancas) + " y negras " + M.formatoTiempo(res.negras) + "."
        : res.resumen;
      await op.anotar(linea.slice(0, 2000), res.articulo);
      return res;
    }
  }

  // Lo que dice el reglamento de una irregularidad, sin anotar nada.
  async function reglamento(o) {
    const r0 = (o && o.ritmo) || M.RITMO_POR_DEFECTO;
    const r = await Avisos.formulario({ titulo: "Lo que dice el reglamento", texto: "Elige la irregularidad. No se anota nada.", campos: [{ nombre: "tipo", etiqueta: "¿Qué pasó?", tipo: "select", valor: "otra", opciones: M.TIPOS_IRREGULARIDAD.map((t) => [t.id, t.id === "otra" ? "Otra (la escala de sanciones del 12.9)" : t.texto]) }], aceptar: "Ver lo que dice" });
    if (r === null) return;
    const regla = M.reglaIrregularidad(r.tipo, { modalidad: M.modalidad(r0) });
    const s = M.SANCIONES.find((x) => x.id === regla.sugerida);
    await Avisos.alerta(regla.texto + "\n\nLo que se suele aplicar: " + (s ? s.texto : "el árbitro decide") + ".", { titulo: (M.TIPOS_IRREGULARIDAD.find((t) => t.id === r.tipo) || {}).texto || "Irregularidad" });
  }

  window.MesaConsultas = { ritmo, cambiarRitmo, reloj, reglamento };
})();

/*! rev bfb5bbb0d2d82f9f */
