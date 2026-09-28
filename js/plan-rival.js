/* plan-rival.html: el plan contra un rival que el profesor le mandó al alumno.
 *
 * Con ?id=, un plan: la lista de jugadas (la misma de preparacion-rivales.html,
 * de js/preparacion-pintar.js) y el tablero para recorrer cada línea
 * (js/visor-linea.js). Sin ?id=, la lista de los planes que le mandaron.
 *
 * Qué ve el alumno lo decide la RLS de planes_rival_alumno: su plan, y nada del
 * análisis del que salió (ver «Mandar el plan al alumno y a la clase: etapa 4»
 * en docs/decisiones/paneles.md). Acá no hay Stockfish: lo que dijo el motor
 * de cada jugada del plan ya viene en sus notas, y bajar un motor de varios
 * megas en el celular del alumno para eso no se justifica.
 */
(function () {
  "use strict";

  const L = window.PreparacionLineas;
  const P = window.PreparacionPintar;
  const $ = (id) => document.getElementById(id);
  const LADO = { conBlancas: "con blancas", conNegras: "con negras" };

  function fecha(iso) {
    return new Date(iso).toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "long", year: "numeric" });
  }

  // El plan guardado, con la forma del resultado del análisis: así lo leen
  // igual lineaDelPlan(), planAPgn() y el pintor.
  function comoResultado(fila) {
    const r = { rival: fila.rival, motor: (fila.plan && fila.plan.motor) || null };
    r[fila.lado] = { plan: (fila.plan && fila.plan.plan) || [] };
    return r;
  }

  function bajarPgn(r, lado) {
    const texto = L.planAPgn(r, lado);
    if (!texto) return;
    const nombre = "plan-" + String(r.rival).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + (lado === "conBlancas" ? "blancas" : "negras") + ".pgn";
    const url = URL.createObjectURL(new Blob([texto], { type: "application/x-chess-pgn" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Avisos.avisar("Plan bajado: " + nombre);
  }

  function pintarPlan(fila) {
    const r = comoResultado(fila);
    const lado = fila.lado;
    document.title = "Tu plan contra " + fila.rival + " — Ajedrez Integral";
    $("titulo").textContent = "Tu plan contra " + fila.rival;
    $("subtitulo").textContent = "Con " + (lado === "conBlancas" ? "blancas" : "negras") + " · te lo mandaron el " + fecha(fila.created_at) + ".";
    if (fila.nota) { $("nota").textContent = fila.nota; $("nota-caja").hidden = false; }

    const visor = VisorLinea.montar($("visor"), { nombre: "Tablero del plan" });
    const abrir = (camino, origen, enfocar) => {
      const l = L.lineaDelPlan(r, camino);
      visor.cargar(l.sec, { en: l.en, notas: l.notas, titulo: L.lineaEs(l.sec.slice(0, l.en)) });
      if (enfocar) {
        // En el celular el tablero está debajo del plan: se baja hasta él.
        $("visor-caja").scrollIntoView({ block: "start" });
        visor.enfocar();
      }
    };
    $("plan").appendChild(P.plan(r[lado].plan, { alVerLinea: (camino, origen) => abrir(camino, origen, true) }));
    $("bajar-pgn").addEventListener("click", () => bajarPgn(r, lado));
    // Arranca en la línea principal, en la posición de salida.
    const principal = L.lineasDelPlan(r[lado].plan)[0];
    if (principal) {
      const l = L.lineaDelPlan(r, principal);
      visor.cargar(l.sec, { en: 0, notas: l.notas, titulo: "La línea principal" });
    }
    $("app").classList.remove("hidden");
  }

  async function pintarLista(yo) {
    const { data, error } = await sb.from("planes_rival_alumno").select("id, rival, lado, created_at")
      .eq("alumno_id", yo).order("created_at", { ascending: false }).range(0, 199);
    $("lista").classList.remove("hidden");
    const ul = $("lista-planes");
    if (error || !data || !data.length) { $("lista-vacia").hidden = false; return; }
    for (const p of data) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "plan-rival.html?id=" + encodeURIComponent(p.id);
      a.className = "block bg-white dark:bg-brand-900 rounded-xl shadow-sm px-5 py-4 hover:ring-2 hover:ring-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
      const t = document.createElement("p");
      t.className = "font-semibold text-brand-800 dark:text-white";
      t.textContent = "Contra " + p.rival + ", " + (LADO[p.lado] || "");
      const f = document.createElement("p");
      f.className = "text-sm text-brand-500 dark:text-brand-300";
      f.textContent = "Te lo mandaron el " + fecha(p.created_at);
      a.append(t, f);
      li.appendChild(a);
      ul.appendChild(li);
    }
  }

  async function init() {
    const { data } = await sb.auth.getSession();
    const sesion = data && data.session;
    if (!sesion) { location.href = "login.html?next=" + encodeURIComponent("plan-rival.html" + location.search); return; }
    const id = new URLSearchParams(location.search).get("id");
    if (!id) {
      await pintarLista(sesion.user.id);
      $("loading").classList.add("hidden");
      return;
    }
    const { data: fila, error } = await sb.from("planes_rival_alumno")
      .select("id, rival, lado, plan, nota, created_at").eq("id", id).maybeSingle();
    $("loading").classList.add("hidden");
    if (error || !fila) { $("no-esta").classList.remove("hidden"); return; }
    pintarPlan(fila);
  }

  init();
})();
