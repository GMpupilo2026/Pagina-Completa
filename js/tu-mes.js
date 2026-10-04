/* «Tu mes en ajedrez»: lo que el alumno entrenó en un mes, contra el anterior,
   con un texto listo para compartir con la familia.

   Una sola copia para las dos pantallas que lo usan:
   - logros.html lo pinta entero, con el mes que se elige (‹ ›) y «Compartir».
   - «Hoy te toca» (js/hoy-te-toca.js), los primeros días de cada mes, avisa
     que el mes que pasó ya tiene su resumen y lleva hasta acá.

   La cuenta la hace la base: entreno_mi_mes(p_mes) (SECURITY INVOKER, días y
   meses de Costa Rica; un día cuenta con 5 ejercicios, como la racha). Acá
   solo se escribe. Ver «Tu mes en ajedrez» en docs/decisiones/entrenamiento.md.

       TuMes.montar(document.getElementById("mes-body"), { mes: "2026-09" });
       TuMes.pedir("2026-09")      → la fila de la base (o null)
       TuMes.textos(fila)          → { titulo, lineas, compartir }            */
window.TuMes = (function () {
  "use strict";

  const ZONA = "America/Costa_Rica";
  const MESES_ATRAS = 24;
  const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  // El mes en curso en Costa Rica, «2026-10».
  function mesDeHoy() {
    return new Date().toLocaleDateString("en-CA", { timeZone: ZONA }).slice(0, 7);
  }
  // «2026-09» + n meses. Pura cuenta de calendario.
  function sumarMeses(mes, n) {
    const [y, m] = mes.split("-").map(Number);
    const t = y * 12 + (m - 1) + n;
    return Math.floor(t / 12) + "-" + String((t % 12) + 1).padStart(2, "0");
  }
  // «septiembre de 2026». El día 15 a mediodía de Costa Rica: el mes no se corre.
  function nombreMes(mes, conAnio) {
    const d = new Date(mes + "-15T12:00:00-06:00");
    return d.toLocaleDateString("es-CR", conAnio === false
      ? { month: "long", timeZone: ZONA }
      : { month: "long", year: "numeric", timeZone: ZONA });
  }
  function nombreDia(dia) {
    const d = new Date(String(dia) + "T12:00:00-06:00");
    return d.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", timeZone: ZONA });
  }

  async function pedir(mes) {
    if (!window.sb || !MES_RE.test(mes)) return null;
    try {
      const { data, error } = await sb.rpc("entreno_mi_mes", { p_mes: mes + "-01" });
      if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
      return data;
    } catch (e) { return null; }
  }

  const fmt = (n) => new Intl.NumberFormat("es-CR").format(Number(n) || 0);
  const plural = (n, uno, varios) => `${fmt(n)} ${Number(n) === 1 ? uno : varios}`;
  const nombreActividad = (a) => window.TiempoSecciones ? TiempoSecciones.describir(a).nombre : a;

  /* Lo que se dice de un mes. Un número suelto no dice nada: cada uno va con
     lo que significa, y lo que no hay no se menciona («0 % limpios» de un mes
     sin ejercicios que digan cómo salieron sería mentira). */
  function textos(r) {
    const mes = r && MES_RE.test(r.mes) ? r.mes : mesDeHoy();
    const titulo = "Tu " + nombreMes(mes) + " en ajedrez";
    const n = Number(r && r.ejercicios) || 0;
    if (!n) {
      return { titulo, vacio: true, lineas: ["Este mes todavía no tiene ejercicios. Con 5 en un día, ese día ya cuenta."], compartir: "" };
    }
    const lineas = [];
    lineas.push(`${plural(n, "ejercicio", "ejercicios")} en ${plural(r.dias_con_algo, "día", "días")} de práctica.`);
    if (r.dias_activos) {
      let t = `${plural(r.dias_activos, "día contó", "días contaron")} para la racha (5 o más ejercicios)`;
      if (r.racha_mejor > 1) t += `, con una racha de ${fmt(r.racha_mejor)} días seguidos`;
      lineas.push(t + ".");
    }
    const ant = Number(r.anterior) || 0;
    if (ant) {
      const dif = n - ant;
      lineas.push(dif > 0 ? `${fmt(dif)} más que el mes anterior (${fmt(ant)}).`
        : dif < 0 ? `El mes anterior fueron ${fmt(ant)}.`
        : `Igual que el mes anterior (${fmt(ant)}).`);
    } else lineas.push("El mes anterior no hubo ejercicios: este es el primero.");
    if (r.con_como_salio) {
      lineas.push(`${Math.round(100 * r.limpios / r.con_como_salio)} % salieron sin error ni pista (de ${fmt(r.con_como_salio)} que lo dicen).`);
    }
    const por = r.por_actividad && typeof r.por_actividad === "object" ? r.por_actividad : {};
    const top = Object.keys(por).sort((a, b) => por[b] - por[a] || a.localeCompare(b)).slice(0, 3);
    if (top.length) lineas.push("Lo más entrenado: " + top.map((a) => `${nombreActividad(a)} (${fmt(por[a])})`).join(", ") + ".");
    if (r.mejor_dia && r.mejor_dia.n > 1) lineas.push(`El mejor día: el ${nombreDia(r.mejor_dia.dia)}, con ${fmt(r.mejor_dia.n)} ejercicios.`);
    // Las líneas no dicen «tú» ni «él»: las mismas sirven en pantalla (las lee
    // el alumno) y para compartir (las lee la familia).
    const compartir = "♟️ " + titulo.replace(/^Tu /, "Mi ") + " (Ajedrez Integral)\n" + lineas.map((l) => "• " + l).join("\n");
    return { titulo, vacio: false, lineas, compartir };
  }

  /* El mes que se pide en la dirección (?mes=AAAA-MM), si es uno que se puede
     mirar; si no, el de hoy. */
  function mesInicial(op) {
    const hoy = mesDeHoy();
    let m = op && op.mes;
    if (!m) { try { m = new URLSearchParams(location.search).get("mes"); } catch (e) { m = null; } }
    if (!m || !MES_RE.test(m) || m > hoy || m < sumarMeses(hoy, -MESES_ATRAS)) return hoy;
    return m;
  }

  function montar(caja, op) {
    if (!caja) return;
    const hoy = mesDeHoy();
    let mes = mesInicial(op);
    caja.innerHTML = `
      <h2 id="mes-titulo" class="font-serif text-lg font-bold text-brand-800 dark:text-white" aria-live="polite"></h2>
      <div class="flex flex-wrap items-center gap-2 mt-2 mb-3">
        <button type="button" data-mes="-1" class="px-3 py-1 rounded-lg border border-brand-200 dark:border-brand-700 text-sm text-brand-800 dark:text-white hover:bg-brand-50 dark:hover:bg-brand-800 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"><span aria-hidden="true">‹ </span>Mes anterior</button>
        <button type="button" data-mes="1" class="px-3 py-1 rounded-lg border border-brand-200 dark:border-brand-700 text-sm text-brand-800 dark:text-white hover:bg-brand-50 dark:hover:bg-brand-800 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">Mes siguiente<span aria-hidden="true"> ›</span></button>
      </div>
      <ul id="mes-lineas" class="list-disc pl-5 space-y-1 text-sm text-brand-700 dark:text-brand-100"></ul>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" id="mes-compartir" class="bg-brand-800 hover:bg-brand-900 dark:bg-brand-700 dark:hover:bg-brand-600 text-white font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" hidden><span aria-hidden="true">📤 </span>Compartir mi mes</button>
        <p id="mes-msg" class="text-xs text-brand-600 dark:text-brand-300" role="status" aria-live="polite"></p>
      </div>`;
    const titulo = caja.querySelector("#mes-titulo");
    const lista = caja.querySelector("#mes-lineas");
    const btnCompartir = caja.querySelector("#mes-compartir");
    const msg = caja.querySelector("#mes-msg");
    const antes = caja.querySelector('[data-mes="-1"]');
    const despues = caja.querySelector('[data-mes="1"]');
    let texto = "";
    let pedido = 0;

    async function pintar() {
      const este = ++pedido;
      antes.disabled = mes <= sumarMeses(hoy, -MESES_ATRAS);
      despues.disabled = mes >= hoy;
      titulo.textContent = "Tu " + nombreMes(mes) + " en ajedrez";
      lista.replaceChildren();
      msg.textContent = "";
      btnCompartir.hidden = true;
      const r = await pedir(mes);
      if (este !== pedido) return;   // ya se pidió otro mes
      if (!r) { msg.textContent = "No se pudo cargar este mes. Vuelve a intentarlo más tarde."; return; }
      const t = textos(r);
      t.lineas.forEach((l) => { const li = document.createElement("li"); li.textContent = l; lista.appendChild(li); });
      texto = t.compartir;
      btnCompartir.hidden = t.vacio;
    }
    antes.addEventListener("click", () => { mes = sumarMeses(mes, -1); pintar(); });
    despues.addEventListener("click", () => { mes = sumarMeses(mes, 1); pintar(); });
    // Compartir: el del celular si hay; si no, se copia. Nada se manda a ningún lado.
    btnCompartir.addEventListener("click", async () => {
      if (!texto) return;
      if (navigator.share) {
        try { await navigator.share({ text: texto }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      try {
        await navigator.clipboard.writeText(texto);
        msg.textContent = "Copiado: ya lo puedes pegar en un mensaje.";
      } catch (e) {
        msg.textContent = "No se pudo copiar. Puedes seleccionar el texto de arriba.";
      }
    });
    return pintar();
  }

  return { montar, pedir, textos, mesDeHoy, sumarMeses, nombreMes };
})();
