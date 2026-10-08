/* ===== Ajedrez Integral — Regalos y bromas con Puntos Ajedrez =====
 *
 * Desde la tienda de puntos, un alumno compra algo para un compañero de
 * clase: una tarjeta (estrella, flores, trofeo…), un premio de la tienda
 * (un accesorio, puntos dobles…) o una broma (confeti, un patito, el tablero
 * arcoíris…, ver js/bromas.js). Y decide si quiere recibir bromas y de quién.
 *
 * «Compañero» lo decide la base: mismo profesor Y misma academia
 * (es_companero(), lo mismo que los retos de ejercicios). La lista que se
 * ofrece es la que la RLS de profiles le deja ver a un alumno —sus
 * compañeros—, y regalar_premio()/mandar_broma() lo vuelven a comprobar.
 * Nada de texto libre: el mensaje se elige de una lista (frases_regalo),
 * porque muchos son menores de edad.
 *
 * Uso (lo llama js/puntos.js):
 *   const r = await PuntosRegalos.regalar({ sb, alumnoId, premio });
 *       // null si canceló; { saldo } o { error }
 *   PuntosRegalos.montarAjustesBromas(caja, { sb, alumnoId });
 *
 * Ver «Retos, marcador, regalos y bromas» en docs/decisiones/puntos-y-premios.md.
 */
window.PuntosRegalos = (function () {
  "use strict";

  const FECHA = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "short" });
  const NOMBRE_BROMA = { payaso: "un gorro de payaso", patito: "un patito", arcoiris: "el tablero arcoíris", confeti: "confeti", globo: "un globo" };

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function msg(e, otro) { return (e && e.message) || otro; }

  async function companeros(sb, alumnoId) {
    const { data, error } = await sb.from("profiles").select("id, full_name, role")
      .eq("role", "alumno").neq("id", alumnoId).order("full_name");
    if (error) throw error;
    return (data || []).filter((p) => p.id !== alumnoId);
  }

  async function frases(sb, uso) {
    const { data, error } = await sb.from("frases_regalo").select("clave, texto, uso").eq("uso", uso).order("orden");
    if (error) throw error;
    return data || [];
  }

  /* Elegir a quién y con qué mensaje, y mandarlo. Un regalo lleva mensaje
     opcional; el globo, frase obligatoria; las demás bromas, ninguna. */
  async function regalar(opciones) {
    const { sb, alumnoId, premio } = opciones;
    const esBroma = premio.categoria === "broma";
    const conFrase = !esBroma || (premio.parametros && premio.parametros.tipo === "globo");
    let gente, lista;
    try {
      [gente, lista] = await Promise.all([
        companeros(sb, alumnoId),
        conFrase ? frases(sb, esBroma ? "broma" : "regalo") : Promise.resolve([]),
      ]);
    } catch (e) {
      return { error: "No se pudo cargar la lista de tus compañeros." };
    }
    if (!gente.length) {
      return { error: "Todavía no tienes compañeros de clase a quien mandarle algo." };
    }
    const campos = [{
      nombre: "para", etiqueta: "¿Para quién?", tipo: "select",
      opciones: gente.map((p) => [p.id, p.full_name || "Compañero sin nombre"]),
    }];
    if (conFrase) {
      const ops = lista.map((f) => [f.clave, f.texto]);
      campos.push({
        nombre: "mensaje", etiqueta: esBroma ? "La frase del globo" : "Tu mensaje", tipo: "select",
        opciones: esBroma ? ops : [["", "Sin mensaje"]].concat(ops),
        ayuda: "Los mensajes son de una lista, para que nadie reciba algo que no quiera leer.",
      });
    }
    const costo = premio.costo_puntos + (premio.costo_puntos === 1 ? " punto" : " puntos");
    const r = await window.Avisos.formulario({
      titulo: (esBroma ? "Mandar " : "Regalar ") + premio.nombre,
      texto: esBroma
        ? "Tu compañero va a ver que se la mandaste tú. Cuesta " + costo + "."
        : "Le llega a tu compañero con tu nombre. Cuesta " + costo + ".",
      campos,
      aceptar: (esBroma ? "Mandar la broma" : "Regalar") + " (" + costo + ")",
    });
    if (!r || !r.para) return null;
    const args = esBroma
      ? { p_premio_id: premio.id, p_para: r.para, p_frase: r.mensaje || null }
      : { p_premio_id: premio.id, p_para: r.para, p_mensaje: r.mensaje || null };
    const { data, error } = await sb.rpc(esBroma ? "mandar_broma" : "regalar_premio", args);
    if (error) return { error: msg(error, esBroma ? "No se pudo mandar la broma." : "No se pudo hacer el regalo.") };
    const fila = Array.isArray(data) ? data[0] : data;
    const nombre = (gente.find((p) => p.id === r.para) || {}).full_name || "tu compañero";
    return { saldo: fila ? fila.saldo_restante : null, para: nombre };
  }

  /* «Bromas»: recibirlas o no, y bloquear a quien se pasó. Lo que guarda la
     base (bromas_preferencias, bromas_bloqueos) solo lo lee cada uno de sí
     mismo; quien manda nunca sabe por qué no pudo. */
  function montarAjustesBromas(contenedor, opciones) {
    const { sb, alumnoId } = opciones;
    contenedor.replaceChildren();
    const h = el("h3", "text-lg font-bold text-brand-800 dark:text-white", "Tus bromas");
    const ayuda = el("p", "text-xs text-brand-500 dark:text-brand-300 mt-0.5",
      "Las bromas nunca te tocan en un examen, en la clase en vivo ni en un torneo, y siempre dicen quién las mandó.");
    const fila = el("label", "mt-3 flex items-center gap-2 text-sm text-brand-800 dark:text-white");
    const casilla = el("input", "h-4 w-4 rounded border-brand-300 text-accent-600 focus:ring-accent-400");
    casilla.type = "checkbox";
    casilla.id = "bromas-recibir";
    casilla.disabled = true;
    fila.append(casilla, document.createTextNode("Quiero recibir bromas de mis compañeros"));
    const estado = el("p", "text-xs mt-1 min-h-[1rem] text-brand-500 dark:text-brand-300");
    estado.setAttribute("aria-live", "polite");
    const subt = el("h4", "mt-4 text-sm font-semibold text-brand-800 dark:text-white", "Las últimas que te mandaron");
    const lista = el("ul", "mt-2 space-y-2");
    contenedor.append(h, ayuda, fila, estado, subt, lista);

    casilla.addEventListener("change", async () => {
      casilla.disabled = true;
      const { error } = await sb.rpc("bromas_configurar", { p_no_recibir: !casilla.checked });
      casilla.disabled = false;
      if (error) { casilla.checked = !casilla.checked; estado.textContent = "No se pudo guardar."; return; }
      estado.textContent = casilla.checked ? "Listo: tus compañeros te pueden mandar bromas." : "Listo: ya nadie te puede mandar bromas.";
    });

    async function cargar() {
      const [pref, bloq, recibidas] = await Promise.all([
        sb.from("bromas_preferencias").select("no_recibir").eq("alumno_id", alumnoId).maybeSingle(),
        sb.from("bromas_bloqueos").select("bloqueado_id").eq("alumno_id", alumnoId),
        sb.from("bromas").select("id, de_id, tipo, created_at").eq("para_id", alumnoId).order("created_at", { ascending: false }).limit(10),
      ]);
      casilla.checked = !(pref && pref.data && pref.data.no_recibir);
      casilla.disabled = false;
      const bloqueados = new Set(((bloq && bloq.data) || []).map((b) => b.bloqueado_id));
      const filas = (recibidas && recibidas.data) || [];
      const ids = Array.from(new Set(filas.map((b) => b.de_id)));
      const nombres = new Map();
      if (ids.length) {
        const { data } = await sb.from("profiles").select("id, full_name").in("id", ids);
        (data || []).forEach((p) => nombres.set(p.id, p.full_name || "Un compañero"));
      }
      lista.replaceChildren();
      if (!filas.length) {
        lista.appendChild(el("li", "text-sm text-brand-500 dark:text-brand-300", "Nadie te ha mandado bromas todavía."));
        return;
      }
      filas.forEach((b) => {
        const li = el("li", "flex items-center gap-3 rounded-lg border border-brand-100 dark:border-brand-700 px-3 py-2 text-sm");
        li.setAttribute("data-broma-recibida", b.id);
        const quien = nombres.get(b.de_id) || "Un compañero";
        const t = el("span", "flex-1 min-w-0 break-words text-brand-800 dark:text-white",
          quien + " te mandó " + (NOMBRE_BROMA[b.tipo] || "una broma") + " · " + FECHA.format(new Date(b.created_at)));
        const bloqueado = bloqueados.has(b.de_id);
        const btn = el("button", "shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
          bloqueado ? "Desbloquear" : "No más bromas de " + quien.split(" ")[0]);
        btn.type = "button";
        btn.setAttribute("aria-label", (bloqueado ? "Volver a recibir bromas de " : "No recibir más bromas de ") + quien);
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          const { error } = await sb.rpc("bromas_bloquear", { p_persona: b.de_id, p_bloquear: !bloqueado });
          if (error) { btn.disabled = false; estado.textContent = "No se pudo guardar."; return; }
          estado.textContent = bloqueado ? quien + " te puede volver a mandar bromas." : quien + " ya no te puede mandar bromas.";
          cargar();
        });
        li.append(t, btn);
        lista.appendChild(li);
      });
    }
    cargar().catch(() => { estado.textContent = "No se pudieron cargar tus bromas."; });
    return { cargar };
  }

  return { regalar, montarAjustesBromas };
})();
