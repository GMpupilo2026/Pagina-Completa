/* La organización conecta la transmisión privada sin atraso para los árbitros (centroamericano-mesas.html, pestaña
   «Clave de chess-results», sección «La transmisión sin atraso para los árbitros»). Todo pasa por la Edge Function
   centroamericano-mesas-vivo con la sesión de quien organiza (tengo_herramienta 'mesa-arbitro'): «conectar» prueba la
   clave y la transmisión contra Lichess y solo entonces las guarda cifradas; la clave no vuelve nunca a la pantalla.
   Ver «La transmisión sin atraso para los árbitros» en docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  if (!$("vivo")) return;

  async function llamar(accion, cuerpo) {
    let { data, error } = await window.sb.functions.invoke("centroamericano-mesas-vivo", { body: Object.assign({ action: accion }, cuerpo || {}) });
    if (error && error.context && typeof error.context.json === "function") {
      try { const j = await error.context.json(); if (j && j.error) error = new Error(j.error); } catch (e) { /* sin cuerpo */ }
    }
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    return data || {};
  }

  function pintar(d) {
    const lista = $("vivo-torneos");
    lista.replaceChildren();
    $("vivo-quitar").hidden = !d.conectada;
    if (!d.conectada) { $("vivo-estado").textContent = "Sin conectar: los árbitros no ven el botón «Mis mesas en vivo»."; return; }
    $("vivo-estado").textContent = d.error ? "⚠ Conectada, pero Lichess no la abre ahora: " + d.error
      : "✓ Conectada" + (d.actualizado ? " desde el " + window.HoraCR.fechaHora(d.actualizado) : "") + ". Los árbitros ya tienen «Mis mesas en vivo» en su tablet.";
    for (const t of d.torneos || []) {
      const li = document.createElement("li");
      li.textContent = t.nombre + ": " + t.rondas + (t.rondas === 1 ? " ronda" : " rondas") + (t.conAtraso.length ? " · ⚠ con atraso en la ronda " + t.conAtraso.join(", ") + " (debe ir en 0)" : " · sin atraso");
      lista.append(li);
    }
  }

  // Los tableros por LiveChess: qué categorías tienen su enlace (sin mostrar el enlace) y pegar la tabla de la
  // organización de tableros. Lo prueba y lo guarda la función (centroamericano_livechess, que solo ella lee).
  async function livechess() {
    try {
      const d = await llamar("livechess");
      const lista = $("livechess-lista");
      lista.replaceChildren();
      for (const t of (d.torneos || []).filter((x) => !x.prueba)) {
        const li = document.createElement("li");
        li.textContent = (t.conectado ? "✓ " : "— ") + t.nombre + ": " + (t.conectado ? "tableros " + (t.tableros || "todos") + (t.actualizado ? " (desde el " + window.HoraCR.fechaHora(t.actualizado) + ")" : "") : "sin enlace de LiveChess");
        lista.append(li);
      }
    } catch (e) { $("livechess-estado").textContent = "No se pudo leer: " + e.message; }
  }
  $("livechess-guardar").addEventListener("click", async () => {
    const texto = $("livechess-texto").value.trim();
    if (!texto) { $("livechess-estado").textContent = "Pega la tabla: un renglón por categoría con sus tableros y su enlace."; return; }
    $("livechess-guardar").disabled = true;
    $("livechess-estado").textContent = "Probando cada enlace con LiveChess…";
    try {
      const d = await llamar("livechess_guardar", { texto });
      $("livechess-texto").value = "";
      $("livechess-estado").textContent = (d.guardados === 1 ? "Se guardó 1 categoría." : "Se guardaron " + d.guardados + " categorías.") + (d.errores.length ? " Revisa: " + d.errores.join(" ") : "");
      await livechess();
    } catch (e) {
      $("livechess-estado").textContent = "No se guardó: " + e.message;
    } finally {
      $("livechess-guardar").disabled = false;
    }
  });

  async function estado() {
    try { pintar(await llamar("estado")); } catch (e) { $("vivo-estado").textContent = "No se pudo leer el estado: " + e.message; }
  }

  $("vivo-conectar").addEventListener("click", async () => {
    const enlace = $("vivo-enlace").value.trim(), token = $("vivo-token").value.trim();
    if (!enlace || !token) { $("vivo-estado").textContent = "Pega el enlace de la transmisión privada y la clave de Lichess."; return; }
    $("vivo-conectar").disabled = true;
    $("vivo-estado").textContent = "Probando con Lichess…";
    try {
      const d = await llamar("conectar", { enlace, token });
      $("vivo-token").value = "";
      pintar(Object.assign({ actualizado: new Date().toISOString() }, d));
      Avisos.avisar("Transmisión sin atraso conectada: los árbitros ya la ven en su tablet.", { tipo: "ok" });
    } catch (e) {
      $("vivo-estado").textContent = "No se conectó: " + e.message;
    } finally {
      $("vivo-conectar").disabled = false;
    }
  });

  $("vivo-quitar").addEventListener("click", async () => {
    const si = await Avisos.confirmar("Los árbitros dejan de ver sus mesas en vivo. La transmisión en Lichess no se toca.", { titulo: "¿Desconectar la transmisión sin atraso?", aceptar: "Desconectar" });
    if (!si) return;
    try { pintar(await llamar("quitar")); } catch (e) { $("vivo-estado").textContent = "No se pudo desconectar: " + e.message; }
  });

  // Se lee cuando la pestaña de las claves se muestra (con el ratón, las flechas o Inicio/Fin), no antes: cada
  // lectura le pregunta a Lichess.
  const panel = $("panel-claves");
  const alMostrarse = () => { if (!panel.hidden && !$("vivo-estado").textContent) { estado(); livechess(); } };
  new MutationObserver(alMostrarse).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  alMostrarse();
})();

/*! rev bfb5bbb0d2d82f9f */
