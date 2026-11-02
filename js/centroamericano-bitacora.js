/* La bitácora del árbitro en PDF (centroamericano-arbitro.html): lo que el árbitro baja cuando toca «Ya terminé mis labores».

   Arma el DOCUMENTO que entiende js/reporte-pdf.js (`ReportePDF.generar`), que le pone la marca de agua de Ajedrez Integral
   en todas las páginas. Este archivo no toca el navegador (las horas se las da quien lo llama, en hora de Costa Rica), así que
   se prueba en Node: herramientas/verificar-centroamericano-mesas.js.

   Los datos son los de la acción «bitacora» de la Edge Function centroamericano-mesa: SOLO lo de los enlaces de ese árbitro (los
   torneos que atendió, todas sus rondas): resultados, correcciones, ilegales, irregularidades, veces que se levantó un jugador,
   controles de tiempos (con la hora que marcó), quién llegó y quién no, fotos de planillas, revisión previa, rondas finalizadas,
   pedidos de ayuda y avisos que leyó. Va ordenado por torneo y por ronda, cada ronda en orden de hora.

       CentroamericanoBitacora.armar(datos, { hora, fechaHora }) -> documento para ReportePDF.generar
       CentroamericanoBitacora.nombreArchivo(datos)              -> «bitacora-arbitro-ana-arbitra-centroamericano-2026.pdf» */
(function (raiz) {
  "use strict";

  const TIPO = { resultado: "Resultado", correccion: "Corrección", ilegal: "Jugada ilegal", irregularidad: "Irregularidad", incidencia: "Incidencia", nota: "Nota" };
  const color = (c) => (c === "negras" ? "negras" : "blancas");
  const nota = (f, art) => f.tipo === "nota" && f.articulo === art;

  // Los segundos de un reloj: «1:23:45» o «45:10».
  function reloj(seg) {
    seg = Math.max(0, Math.round(Number(seg) || 0));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    const dos = (n) => (n < 10 ? "0" : "") + n;
    return h ? h + ":" + dos(m) + ":" + dos(s) : m + ":" + dos(s);
  }

  // Qué dice cada línea de la bitácora, con el jugador y su color cuando hay.
  function detalleDe(f) {
    const quien = f.jugador ? f.jugador + (f.color ? " (" + color(f.color) + ")" : "") : "";
    if (f.tipo === "resultado") return (f.jugador || "") + " → " + f.resultado + (f.enviado ? " · enviado a chess-results" : "");
    if (f.tipo === "correccion") return (f.jugador || "") + ": de «" + f.anterior + "» a «" + f.resultado + "»" + (f.enviado ? " · enviado a chess-results" : "");
    if (f.tipo === "ilegal" || f.tipo === "irregularidad") return quien + (f.texto ? ": " + f.texto : "") + (f.articulo ? " (art. " + f.articulo + ")" : "");
    if (nota(f, "Levantó")) return quien + " se levantó de la mesa";
    if (f.tipo === "anulacion") return "Anula una anotación de " + (f.jugador || "");
    return f.texto || "";
  }
  const etiquetaDe = (f) => (nota(f, "Levantó") ? "Se levantó" : TIPO[f.tipo] || f.tipo);

  function armar(d, F) {
    F = F || { hora: (x) => String(x), fechaHora: (x) => String(x) };
    const asigs = d.asignaciones || [];
    const nombreTorneo = (tnr) => { const t = (d.torneos || []).find((x) => x.tnr === tnr); return t ? t.nombre : tnr; };
    const tnrDe = (id) => { const a = asigs.find((x) => x.id === id); return a ? a.tnr : null; };
    const anuladas = new Set((d.registro || []).filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula));
    const reg = (d.registro || []).filter((f) => f.tipo !== "anulacion" && !(nota(f, "Control de tiempos")));
    const orden = (a, b) => String(a.cuando).localeCompare(String(b.cuando));

    // Todo lo que le pasó, como líneas { cuando, tnr, ronda, mesa, que, detalle }.
    const lineas = [];
    for (const f of reg) {
      lineas.push({ cuando: f.ocurrio, tnr: f.tnr, ronda: f.ronda, mesa: f.mesa, que: etiquetaDe(f) + (anuladas.has(f.id) ? " (anulada)" : ""), detalle: detalleDe(f), clase: nota(f, "Levantó") ? "levanto" : f.tipo, anulada: anuladas.has(f.id) });
    }
    for (const t of d.tiempos || []) {
      lineas.push({ cuando: t.ocurrio, tnr: t.tnr, ronda: t.ronda, mesa: t.mesa, que: "Control de tiempos", clase: "tiempo",
        detalle: "Blancas (" + t.blancas + "): " + reloj(t.t_blancas) + (t.j_blancas != null ? ", " + t.j_blancas + " jugadas" : "") + " · Negras (" + t.negras + "): " + reloj(t.t_negras) + (t.j_negras != null ? ", " + t.j_negras + " jugadas" : "") });
    }
    for (const p of d.presencia || []) {
      lineas.push({ cuando: p.marcada, tnr: p.tnr, ronda: p.ronda, mesa: p.mesa, que: "Presencia", clase: "presencia", detalle: (p.jugador || "") + " (" + color(p.color) + "): " + (p.presente ? "llegó" : "no ha llegado") });
    }
    for (const x of d.planillas || []) {
      lineas.push({ cuando: x.subida, tnr: x.tnr, ronda: x.ronda, mesa: x.mesa, que: "Foto de las planillas", clase: "planilla", detalle: "Foto de las dos planillas" + (x.drive_ok ? " (ya está en el Drive)" : " (todavía sin pasar al Drive)") });
    }
    for (const l of d.listas || []) {
      lineas.push({ cuando: l.aprobada_en, tnr: tnrDe(l.asignacion_id), ronda: l.ronda, mesa: null, que: "Revisión previa", clase: "lista", detalle: "Aprobó el paso «" + l.paso + "»" });
    }
    for (const f of d.finales || []) {
      lineas.push({ cuando: f.finalizada_en, tnr: tnrDe(f.asignacion_id), ronda: f.ronda, mesa: null, que: "Ronda finalizada", clase: "final", detalle: "Finalizó la ronda " + f.ronda + (f.reabierta ? " (la organización la reabrió)" : "") });
    }
    for (const v of d.avisos || []) {
      const tnr = tnrDe(v.asignacion_id);
      if (v.tipo === "ayuda" && v.de === "arbitro") lineas.push({ cuando: v.creado, tnr, ronda: v.ronda, mesa: v.mesa, que: "Pedido de ayuda", clase: "ayuda", detalle: (v.mesa ? "Pidió al principal en la mesa " + v.mesa : "Pidió ayuda para él o ella") + (v.texto ? ": «" + v.texto + "»" : "") + (v.estado === "atendido" ? " · atendido" + (v.atendido_en ? " a las " + F.hora(v.atendido_en) : "") : "") });
      else if (v.tipo === "termino") lineas.push({ cuando: v.creado, tnr, ronda: v.ronda, mesa: null, que: "Terminó sus mesas", clase: "termino", detalle: v.texto || "Terminó sus mesas de la ronda" });
      else if (v.tipo === "finalizo") lineas.push({ cuando: v.creado, tnr, ronda: v.ronda, mesa: null, que: "Ronda finalizada", clase: "final", detalle: v.texto || "" });
      else if (v.de === "organizacion" && v.leido_en) lineas.push({ cuando: v.leido_en, tnr, ronda: v.ronda, mesa: v.mesa, que: "Aviso de la organización", clase: "aviso", detalle: "Leyó: «" + (v.texto || "") + "»" });
    }
    lineas.sort(orden);

    const cuenta = (tnr, clase) => lineas.filter((l) => l.tnr === tnr && l.clase === clase && !l.anulada).length;
    const rondasDe = (tnr) => [...new Set(lineas.filter((l) => l.tnr === tnr && l.ronda != null).map((l) => l.ronda))].sort((a, b) => a - b);
    const tnrs = [...new Set(asigs.map((a) => a.tnr))];

    const b = [];
    b.push({ tipo: "parrafo", texto: "Concluyó sus labores (" + F.fechaHora(d.concluyo) + "). Este documento es el registro de todo lo que anotó y le pasó con su enlace: " + tnrs.length + (tnrs.length === 1 ? " torneo" : " torneos") + ", " + lineas.length + " líneas en total." });

    b.push({ tipo: "titulo", texto: "Torneos que atendió" });
    b.push({
      tipo: "tabla",
      encabezados: ["Torneo", "Mesas", "Rondas", "Result.", "Ilegales", "Irreg.", "Levantó", "Control", "Fotos"],
      anchos: [2.4, 1.1, 1.1, 1.1, 1.2, 1, 1.3, 1.2, 1],
      filas: tnrs.map((tnr) => {
        const a = asigs.filter((x) => x.tnr === tnr);
        return [nombreTorneo(tnr), a.map((x) => x.mesa_desde + " a " + x.mesa_hasta).join(", "), rondasDe(tnr).join(", ") || "—",
          String(cuenta(tnr, "resultado") + cuenta(tnr, "correccion")), String(cuenta(tnr, "ilegal")), String(cuenta(tnr, "irregularidad")),
          String(cuenta(tnr, "levanto")), String(cuenta(tnr, "tiempo")), String(cuenta(tnr, "planilla"))];
      }),
    });

    for (const tnr of tnrs) {
      b.push({ tipo: "titulo", texto: nombreTorneo(tnr) });
      const rondas = rondasDe(tnr);
      const sueltas = lineas.filter((l) => l.tnr === tnr && l.ronda == null);   // lo que no es de una ronda (un pedido de ayuda general)
      if (!rondas.length && !sueltas.length) { b.push({ tipo: "parrafo", texto: "No anotó nada en este torneo." }); continue; }
      for (const r of rondas) {
        b.push({ tipo: "subtitulo", texto: "Ronda " + r });
        const de = lineas.filter((l) => l.tnr === tnr && l.ronda === r);
        b.push({ tipo: "tabla", encabezados: ["Hora", "Mesa", "Qué", "Detalle"], anchos: [1.2, 0.8, 2.2, 5],
          filas: de.map((l) => [F.hora(l.cuando), l.mesa == null ? "" : String(l.mesa), l.que, l.detalle]) });
      }
      if (sueltas.length) {
        b.push({ tipo: "subtitulo", texto: "Sin ronda" });
        b.push({ tipo: "tabla", encabezados: ["Hora", "Mesa", "Qué", "Detalle"], anchos: [1.2, 0.8, 2.2, 5],
          filas: sueltas.map((l) => [F.hora(l.cuando), l.mesa == null ? "" : String(l.mesa), l.que, l.detalle]) });
      }
    }
    b.push({ tipo: "nota", texto: "La hora de cada línea es la de Costa Rica. Las anotaciones anuladas quedan en el registro marcadas como «anulada»: la bitácora no se edita ni se borra." });
    return {
      titulo: "Bitácora del árbitro",
      subtitulo: (d.arbitro || "Árbitro") + " · Centroamericano 2026 · generada el " + F.fechaHora(d.generado),
      pie: "Centroamericano 2026 · Ajedrez Integral · ajedrez-integral.com",
      bloques: b, fotos: [],
    };
  }

  function nombreArchivo(d) {
    const base = String((d && d.arbitro) || "arbitro").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "arbitro";
    return "bitacora-arbitro-" + base + "-centroamericano-2026.pdf";
  }

  const api = { armar, nombreArchivo, detalleDe, reloj };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CentroamericanoBitacora = api;
})(typeof self !== "undefined" ? self : this);
