/* Lo que el alumno juega de verdad en Lichess y Chess.com, para su profe.
 *
 * El alumno pone sus usuarios en Configuración y su navegador baja sus
 * partidas públicas (js/preparacion-descarga.js) y las analiza con el MISMO
 * análisis de la preparación de rivales (js/preparacion-analisis.js), aplicado
 * a él: qué abre con blancas, qué contesta con negras, dónde rinde, dónde no,
 * dónde improvisa. El resultado se guarda en `analisis_partidas_alumno` (una
 * fila por alumno, sin las partidas) y su profe lo ve en Informes, al lado de
 * «Mi repertorio» y comparado con él: lo que preparó contra lo que juega.
 *
 * - No se inventa ningún criterio nuevo: los puntos fuertes y débiles son los
 *   del análisis (líneas con 5 o más puntos y z ≥ 1,28 sobre su promedio con
 *   ese color), con sus mismas frases.
 * - Se guarda solo lo que se pinta (`reducir`): el análisis entero trae el
 *   libro y la táctica, que acá no se usan y lo harían diez veces más pesado.
 * - Las dos cuentas son la misma persona: la de Chess.com se renombra como la
 *   de Lichess antes de analizar (unirCuentas).
 * Ver «Lo que juega en Lichess y Chess.com» en docs/decisiones/informes.md.
 *
 *   AnalisisAlumno.analizar({ lichess, chesscom, maximo, alAvanzar }) → r (reducido)
 *   AnalisisAlumno.guardar(sb, alumnoId, { lichess, chesscom }, r)
 *   AnalisisAlumno.cruce(r, repertorio) → frases: su repertorio contra lo que juega
 *   AnalisisAlumno.montarProfe(contenedor, { sb, alumnoId, nombre, puedeEscribir })
 */
(function () {
  "use strict";

  const MAXIMO = 300;   // por cuenta: las más nuevas, que son las que dicen qué juega hoy
  const USUARIO = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;
  const MODULOS = ["vendor/chess.js", "preparacion-lineas.js", "preparacion-posiciones.js", "preparacion-tactica.js",
    "preparacion-libro.js", "preparacion-estructuras.js", "preparacion-analisis.js", "preparacion-descarga.js"];

  let cargando = null;
  function cargarModulos() {
    if (window.PreparacionAnalisis && window.PreparacionDescarga) return Promise.resolve();
    if (cargando) return cargando;
    const base = new URL("js/", document.baseURI);
    cargando = MODULOS.reduce((p, nombre) => p.then(() => {
      if (nombre === "vendor/chess.js" && typeof window.Chess !== "undefined") return null;
      if (document.querySelector('script[data-analisis-cargado="' + nombre + '"]')) return null;
      return new Promise((ok, mal) => {
        const sc = document.createElement("script");
        sc.src = new URL(nombre, base).href;
        sc.dataset.analisisCargado = nombre;
        sc.onload = ok;
        sc.onerror = () => mal(new Error("no se pudo cargar " + nombre));
        document.body.appendChild(sc);
      });
    }), Promise.resolve()).catch((e) => { cargando = null; throw e; });
    return cargando;
  }

  // Lo que se guarda: lo que se pinta, nada más.
  function reducir(r) {
    if (!r || r.vacio) return r;
    const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
    return Object.assign(pick(r, ["version", "rival", "generado", "total", "totalRival", "minimo", "fechas", "elo",
      "global", "porColor", "porRitmo", "principal", "reciente"]), {
      repertorio: {
        blancas: (r.repertorio && r.repertorio.blancas || []).slice(0, 6),
        negras: (r.repertorio && r.repertorio.negras || []).slice(0, 6).map((x) => Object.assign({}, x, { respuestas: (x.respuestas || []).slice(0, 4) })),
      },
      fuertes: (r.fuertes || []).slice(0, 6),
      debiles: (r.debiles || []).slice(0, 6),
      improvisa: (r.improvisa || []).slice(0, 4),
      foda: { fortalezas: (r.foda && r.foda.fortalezas) || [], debilidades: (r.foda && r.foda.debilidades) || [] },
    });
  }

  async function analizar(o) {
    await cargarModulos();
    const D = window.PreparacionDescarga, A = window.PreparacionAnalisis;
    const cuentas = [["lichess", o.lichess], ["chesscom", o.chesscom]].filter(([, u]) => u);
    if (!cuentas.length) throw Object.assign(new Error("Escribe al menos un usuario."), { paraMostrar: true });
    const principal = cuentas[0][1];
    let texto = "";
    for (const [sitio, usuario] of cuentas) {
      const t = await D.descargar({ sitio, usuario, maximo: o.maximo || MAXIMO,
        alAvanzar: (n) => o.alAvanzar && o.alAvanzar((sitio === "lichess" ? "Lichess" : "Chess.com") + ": " + n + (n === 1 ? " partida" : " partidas")) });
      texto += (texto ? "\n\n" : "") + (usuario === principal ? t : D.unirCuentas(t, usuario, principal));
    }
    if (o.alAvanzar) o.alAvanzar("Analizando…");
    const partidas = A.leerPgn(texto);
    if (!partidas.length) throw Object.assign(new Error("No se encontraron partidas públicas de esa cuenta."), { paraMostrar: true });
    const r = A.analizar(partidas, principal, { reciente: true });
    if (!r) throw Object.assign(new Error("En las partidas bajadas no aparece «" + principal + "»."), { paraMostrar: true });
    return reducir(r);
  }

  async function guardar(sb, alumnoId, cuentas, r) {
    const fila = { alumno_id: alumnoId, lichess: cuentas.lichess || null, chesscom: cuentas.chesscom || null,
      analisis: r || null, partidas: r ? r.total || 0 : null };
    const { error } = await sb.from("analisis_partidas_alumno").upsert(fila, { onConflict: "alumno_id" });
    if (error) throw error;
  }

  /* ---------------- lo que se dice ---------------- */
  const L = () => (typeof window !== "undefined" && window.PreparacionLineas)
    || (typeof require === "function" ? require("./preparacion-lineas.js") : null);
  const sanEs = (san) => (L() ? L().sanEs(san) : san);
  const lineaEs = (sec) => (L() ? L().lineaEs(sec) : (sec || []).join(" "));
  const pct = (x) => Math.round((x || 0) * 100) + " %";
  const colorEs = (c) => (c === "w" ? "blancas" : "negras");

  /* Su repertorio contra lo que juega. Con blancas, su primera jugada; con
     negras, su respuesta a cada primera jugada del rival que preparó. Solo se
     afirma lo que alcanza la muestra: con menos del mínimo del análisis, «pocas
     partidas para decirlo». */
  function cruce(r, repertorio) {
    if (!r || r.vacio || !Array.isArray(repertorio)) return [];
    const frases = [];
    const minimo = Math.max(3, r.minimo || 3);
    const propias = (color) => repertorio.filter((f) => f.color === color && Array.isArray(f.jugadas));
    const blancas = propias("w");
    if (blancas.length) {
      const suyas = [...new Set(blancas.map((f) => f.jugadas[0]))];
      const reales = (r.repertorio && r.repertorio.blancas) || [];
      const total = reales.reduce((s, x) => s + x.n, 0);
      const top = reales[0];
      if (total < minimo || !top) frases.push({ tipo: "pocas", texto: "Con blancas: muy pocas partidas para comparar con su repertorio." });
      else {
        const usada = reales.filter((x) => suyas.includes(x.san)).reduce((s, x) => s + x.n, 0);
        const quePrepara = suyas.map((s) => "1." + sanEs(s)).join(" o ");
        frases.push(usada / total >= 0.5
          ? { tipo: "coincide", texto: `Con blancas preparó ${quePrepara}, y es lo que juega: ${pct(usada / total)} de sus ${total} partidas.` }
          : { tipo: "distinto", texto: `Con blancas preparó ${quePrepara}, pero en sus partidas abre sobre todo 1.${sanEs(top.san)} (${pct(top.n / total)} de ${total}); `
              + (usada ? `${quePrepara} sale en el ${pct(usada / total)}.` : `${quePrepara} no aparece en sus partidas.`) });
      }
    }
    const negras = propias("b");
    const contra = [...new Set(negras.map((f) => f.jugadas[0]))];
    contra.forEach((jug) => {
      const suyas = [...new Set(negras.filter((f) => f.jugadas[0] === jug && f.jugadas[1]).map((f) => f.jugadas[1]))];
      const real = ((r.repertorio && r.repertorio.negras) || []).find((x) => x.contra === jug);
      const que = suyas.map((s) => "1…" + sanEs(s)).join(" o ");
      if (!real || real.n < minimo) {
        frases.push({ tipo: "pocas", texto: `Contra 1.${sanEs(jug)} preparó ${que}: en sus partidas hay muy pocas con 1.${sanEs(jug)} para saber si la juega.` });
        return;
      }
      const resp = real.respuestas || [];
      const usada = resp.filter((x) => suyas.includes(x.san)).reduce((s, x) => s + x.n, 0);
      const top = resp[0];
      frases.push(usada / real.n >= 0.5
        ? { tipo: "coincide", texto: `Contra 1.${sanEs(jug)} preparó ${que}, y es lo que contesta: ${pct(usada / real.n)} de ${real.n} partidas.` }
        : { tipo: "distinto", texto: `Contra 1.${sanEs(jug)} preparó ${que}, pero contesta sobre todo 1…${sanEs(top.san)} (${pct(top.n / real.n)} de ${real.n}).` });
    });
    return frases;
  }

  function improvisaEs(x) {
    return "Con " + colorEs(x.color) + ", después de " + lineaEs(x.sec) + " no tiene una jugada fija: la más usada, "
      + sanEs(x.opciones[0].san) + ", sale solo el " + Math.round(100 * x.reparto) + " % de las veces.";
  }

  /* ---------------- la pantalla del profe (Informes) ---------------- */
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  const H3 = "text-sm font-semibold text-brand-800 dark:text-white mt-4 mb-1";
  const TXT = "text-sm text-brand-700 dark:text-brand-200";
  const SUB = "text-xs text-brand-450 dark:text-brand-350";
  const BOTON = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60";
  const CAMPO = "w-40 px-3 py-2 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  function lista(items, clase) {
    const ul = el("ul", "list-disc pl-5 space-y-1 " + TXT + (clase ? " " + clase : ""));
    items.forEach((t) => ul.appendChild(el("li", null, t)));
    return ul;
  }

  function pintarAnalisis(caja, r) {
    if (!r || r.vacio) { caja.appendChild(el("p", TXT, "En sus partidas no hubo suficiente para analizar.")); return; }
    caja.appendChild(el("p", SUB, `${r.total} partidas` + (r.fechas && r.fechas.desde ? `, del ${String(r.fechas.desde).slice(0, 10)} al ${String(r.fechas.hasta).slice(0, 10)}` : "")
      + (r.global ? ` · saca ${pct(r.global.puntos)} en total` : "")
      + (r.porColor && r.porColor.w && r.porColor.b ? ` (${pct(r.porColor.w.puntos)} con blancas, ${pct(r.porColor.b.puntos)} con negras)` : "")
      + (r.elo && r.elo.reciente ? ` · Elo en línea ≈${r.elo.reciente}` : "") + "."));
    const bl = (r.repertorio && r.repertorio.blancas) || [];
    if (bl.length) {
      caja.appendChild(el("h3", H3, "Con blancas abre"));
      caja.appendChild(lista(bl.slice(0, 3).map((x) => `1.${sanEs(x.san)}: ${x.n} partidas (${pct(x.reparto)}), saca ${pct(x.puntos)}.`)));
    }
    const ng = (r.repertorio && r.repertorio.negras) || [];
    if (ng.length) {
      caja.appendChild(el("h3", H3, "Con negras contesta"));
      caja.appendChild(lista(ng.slice(0, 3).map((x) => `A 1.${sanEs(x.contra)} (${x.n} partidas): `
        + (x.respuestas || []).slice(0, 2).map((y) => `1…${sanEs(y.san)} ${pct(y.reparto)}, saca ${pct(y.puntos)}`).join("; ") + ".")));
    }
    const F = (r.foda && r.foda.fortalezas) || [];
    caja.appendChild(el("h3", H3, "Puntos fuertes"));
    caja.appendChild(F.length ? lista(F) : el("p", SUB, "Con estas partidas no hay ninguna línea que le vaya claramente mejor que su promedio."));
    const D = ((r.foda && r.foda.debilidades) || []).concat((r.improvisa || []).map(improvisaEs));
    caja.appendChild(el("h3", H3, "Puntos débiles"));
    caja.appendChild(D.length ? lista(D) : el("p", SUB, "Con estas partidas no hay ninguna línea que le vaya claramente peor que su promedio."));
  }

  async function montarProfe(contenedor, o) {
    if (!contenedor || !o || !o.sb || !o.alumnoId) return;
    const turno = String(Math.random());
    contenedor.dataset.turno = turno;
    const vigente = () => contenedor.dataset.turno === turno;
    contenedor.textContent = "";
    const estado = el("p", SUB, "Cargando…");
    estado.setAttribute("role", "status");
    contenedor.appendChild(estado);
    // Las jugadas se dicen como en el resto de la preparación (PreparacionLineas).
    await cargarModulos().catch(() => {});
    const [a, rep] = await Promise.all([
      o.sb.from("analisis_partidas_alumno").select("alumno_id, lichess, chesscom, analisis, partidas, analizado_at").eq("alumno_id", o.alumnoId).maybeSingle(),
      o.sb.from("repertorio").select("id, color, nombre, jugadas").eq("alumno_id", o.alumnoId).order("created_at", { ascending: true }),
    ]);
    if (!vigente()) return;
    contenedor.textContent = "";
    const fila = a && a.data;
    const lineas = (rep && rep.data) || [];
    // Las líneas de «Mi repertorio» (las arma él en Aperturas y celadas).
    contenedor.appendChild(el("h3", H3.replace("mt-4", "mt-0"), "Lo que preparó en «Mi repertorio»"));
    if (!lineas.length) contenedor.appendChild(el("p", SUB, "Todavía no armó líneas en Aperturas y celadas → Mi repertorio."));
    else {
      ["w", "b"].forEach((c) => {
        const suyas = lineas.filter((f) => f.color === c);
        if (!suyas.length) return;
        contenedor.appendChild(el("p", TXT + " font-medium mt-2", "Con " + colorEs(c) + ":"));
        contenedor.appendChild(lista(suyas.map((f) => f.nombre + ": " + lineaEs(f.jugadas))));
      });
    }
    // Lo que juega en Lichess y Chess.com.
    const titulo = el("h3", H3, "Lo que juega en Lichess y Chess.com");
    contenedor.appendChild(titulo);
    const cuentas = fila ? [fila.lichess && ("Lichess: " + fila.lichess), fila.chesscom && ("Chess.com: " + fila.chesscom)].filter(Boolean).join(" · ") : "";
    if (fila && fila.analisis) {
      contenedor.appendChild(el("p", SUB, cuentas + (fila.analizado_at ? " · analizado el " + new Date(fila.analizado_at).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }) : "")));
      const cr = cruce(fila.analisis, lineas);
      if (cr.length) {
        contenedor.appendChild(el("p", TXT + " font-medium mt-2", "Su repertorio contra lo que juega:"));
        const ul = lista(cr.map((x) => x.texto));
        ul.setAttribute("data-analisis-cruce", "");
        contenedor.appendChild(ul);
      }
      const caja = el("div");
      caja.setAttribute("data-analisis-resultado", "");
      pintarAnalisis(caja, fila.analisis);
      contenedor.appendChild(caja);
    } else {
      contenedor.appendChild(el("p", SUB, fila ? cuentas + " · todavía sin analizar." : "Todavía no puso sus usuarios: el alumno los carga en Configuración, o puedes escribirlos aquí."));
    }
    if (!o.puedeEscribir) return;
    // Volver a analizar (o poner los usuarios): con el navegador de quien mira.
    const form = el("div", "flex flex-wrap items-end gap-2 mt-3");
    const campo = (id, etiqueta, valor) => {
      const d = el("div");
      const lab = el("label", "block text-xs font-semibold text-brand-500 dark:text-brand-300 mb-1", etiqueta);
      lab.htmlFor = id;
      const inp = el("input", CAMPO);
      inp.id = id; inp.type = "text"; inp.autocomplete = "off"; inp.maxLength = 30; inp.value = valor || "";
      d.append(lab, inp);
      form.appendChild(d);
      return inp;
    };
    const li = campo("analisis-lichess", "Usuario de Lichess", fila && fila.lichess);
    const cc = campo("analisis-chesscom", "Usuario de Chess.com", fila && fila.chesscom);
    const btn = el("button", BOTON, fila && fila.analisis ? "Volver a analizar" : "Analizar sus partidas");
    btn.type = "button";
    btn.setAttribute("data-analisis-analizar", "");
    form.appendChild(btn);
    const msg = el("p", SUB + " w-full");
    msg.setAttribute("role", "status");
    form.appendChild(msg);
    contenedor.appendChild(form);
    btn.addEventListener("click", async () => {
      const cuentasN = { lichess: li.value.trim().replace(/^@/, ""), chesscom: cc.value.trim().replace(/^@/, "") };
      if (!cuentasN.lichess && !cuentasN.chesscom) { msg.textContent = "Escribe al menos un usuario."; return; }
      if ([cuentasN.lichess, cuentasN.chesscom].some((u) => u && !USUARIO.test(u))) { msg.textContent = "Un usuario lleva solo letras, números, guion o guion bajo."; return; }
      btn.disabled = true;
      try {
        const r = await analizar(Object.assign({ alAvanzar: (t) => { msg.textContent = t; } }, cuentasN));
        await guardar(o.sb, o.alumnoId, cuentasN, r);
        msg.textContent = "";
        if (window.Avisos) Avisos.avisar(`Listo: se analizaron ${r.total} partidas de ${o.nombre || "tu alumno"}.`);
        montarProfe(contenedor, o);
      } catch (e) {
        msg.textContent = (e && e.paraMostrar ? e.message : "No se pudo analizar: " + (e && e.message ? e.message : e));
        btn.disabled = false;
      }
    });
  }

  const api = { MAXIMO, USUARIO, cargarModulos, reducir, analizar, guardar, cruce, improvisaEs, montarProfe };
  if (typeof window !== "undefined") window.AnalisisAlumno = api;
  if (typeof module !== "undefined") module.exports = api;
})();
