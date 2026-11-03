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
  const cant = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);

  // Una duración dicha con palabras: «45 s» o «2 min 10 s».
  const dur = (seg) => { seg = Math.max(0, Math.round(Number(seg) || 0)); return seg < 60 ? seg + " s" : Math.floor(seg / 60) + " min" + (seg % 60 ? " " + (seg % 60) + " s" : ""); };

  // Los segundos de un reloj: «1:23:45» o «45:10».
  function reloj(seg) {
    seg = Math.max(0, Math.round(Number(seg) || 0));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    const dos = (n) => (n < 10 ? "0" : "") + n;
    return h ? h + ":" + dos(m) + ":" + dos(s) : m + ":" + dos(s);
  }

  // Qué dice cada línea de la bitácora, con el jugador y su color cuando hay. (El PDF solo trae las letras de Helvetica: sin flechas.)
  function detalleDe(f) {
    const quien = f.jugador ? f.jugador + (f.color ? " (" + color(f.color) + ")" : "") : "";
    if (f.tipo === "resultado") return (f.jugador || "") + ": " + f.resultado + (f.enviado ? " · enviado" : "");
    if (f.tipo === "correccion") return (f.jugador || "") + ": de «" + f.anterior + "» a «" + f.resultado + "»" + (f.enviado ? " · enviado" : "");
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
        detalle: "Blancas (" + t.blancas + "): " + reloj(t.t_blancas) + (t.j_blancas != null ? ", " + cant(t.j_blancas, "jugada", "jugadas") : "") + ". Negras (" + t.negras + "): " + reloj(t.t_negras) + (t.j_negras != null ? ", " + cant(t.j_negras, "jugada", "jugadas") : "") + "." });
    }
    // La llegada de los jugadores, en UNA línea por ronda (no una por jugador): cuántos llegaron y quiénes no.
    const porRonda = new Map();
    for (const p of d.presencia || []) {
      const k = p.tnr + "|" + p.ronda;
      if (!porRonda.has(k)) porRonda.set(k, []);
      porRonda.get(k).push(p);
    }
    for (const filas of porRonda.values()) {
      const no = filas.filter((x) => !x.presente).sort((a, b) => a.mesa - b.mesa);
      const llegaron = filas.length - no.length;
      lineas.push({ cuando: filas.map((x) => x.marcada).sort()[0], tnr: filas[0].tnr, ronda: filas[0].ronda, mesa: null, que: "Presencia", clase: "presencia",
        detalle: "Llegaron " + llegaron + " de " + filas.length + " jugadores." + (no.length ? " No llegaron: " + no.map((x) => (x.jugador || "—") + " (mesa " + x.mesa + ", " + color(x.color) + ")").join("; ") + "." : "") });
    }
    for (const x of d.planillas || []) {
      lineas.push({ cuando: x.subida, tnr: x.tnr, ronda: x.ronda, mesa: x.mesa, que: "Foto de las planillas", clase: "planilla", detalle: "Foto de las dos planillas" + (x.drive_ok ? " (ya está en el Drive)." : " (todavía sin pasar al Drive).") });
    }
    // La hora a la que empezó la ronda en la categoría (la marcó su árbitro: cada categoría puede empezar a una hora distinta).
    for (const i of d.inicios || []) {
      lineas.push({ cuando: i.inicio, tnr: i.tnr, ronda: i.ronda, mesa: null, que: "Inició la ronda", clase: "inicio",
        detalle: "La ronda empezó a las " + F.hora(i.inicio) + (i.arbitro ? " (la marcó " + i.arbitro + ")." : ".") });
    }
    // Las veces que se salió de la pantalla con el modo concentración (no son de una ronda: van en «Sin ronda»).
    const MOTIVO_SALIDA = { oculta: "cambió de pestaña o de aplicación", pantalla_completa: "salió de la pantalla completa", sin_foco: "perdió el foco" };
    for (const x of d.salidas || []) {
      lineas.push({ cuando: x.salio, tnr: x.tnr, ronda: null, mesa: null, que: "Salió de la pantalla", clase: "salida",
        detalle: "Se salió (" + (MOTIVO_SALIDA[x.motivo] || x.motivo) + ")" + (x.volvio ? " y volvió a los " + dur(x.segundos) + "." : " y no volvió a avisar.") });
    }
    for (const l of d.listas || []) {
      lineas.push({ cuando: l.aprobada_en, tnr: tnrDe(l.asignacion_id), ronda: l.ronda, mesa: null, que: "Revisión previa", clase: "lista", detalle: "Aprobó el paso «" + l.paso + "»." });
    }
    for (const f of d.finales || []) {
      lineas.push({ cuando: f.finalizada_en, tnr: tnrDe(f.asignacion_id), ronda: f.ronda, mesa: null, que: "Ronda finalizada", clase: "final", detalle: "Finalizó la ronda " + f.ronda + (f.reabierta ? " (la organización la reabrió)." : ".") });
    }
    for (const v of d.avisos || []) {
      const tnr = tnrDe(v.asignacion_id);
      if (v.tipo === "ayuda" && v.de === "arbitro") lineas.push({ cuando: v.creado, tnr, ronda: v.ronda, mesa: v.mesa, que: "Pedido de ayuda", clase: "ayuda", detalle: (v.mesa ? "Pidió al principal en la mesa " + v.mesa : "Pidió ayuda para él o ella") + (v.texto ? ": «" + v.texto + "»" : "") + (v.estado === "atendido" ? ". Atendido" + (v.atendido_en ? " a las " + F.hora(v.atendido_en) : ".") : ".") });
      else if (v.tipo === "termino") lineas.push({ cuando: v.creado, tnr, ronda: v.ronda, mesa: null, que: "Terminó sus mesas", clase: "termino", detalle: v.texto || "Terminó sus mesas de la ronda." });
      else if (v.tipo === "finalizo") lineas.push({ cuando: v.creado, tnr, ronda: v.ronda, mesa: null, que: "Ronda finalizada", clase: "final", detalle: v.texto || "" });
      else if (v.de === "organizacion" && v.leido_en) lineas.push({ cuando: v.leido_en, tnr, ronda: v.ronda, mesa: v.mesa, que: "Aviso de la organización", clase: "aviso", detalle: "Leyó: «" + (v.texto || "") + "»" });
    }
    lineas.sort(orden);

    const cuenta = (tnr, clase, ronda) => lineas.filter((l) => l.tnr === tnr && l.clase === clase && !l.anulada && (ronda === undefined || l.ronda === ronda)).length;
    const rondasDe = (tnr) => [...new Set(lineas.filter((l) => l.tnr === tnr && l.ronda != null).map((l) => l.ronda))].sort((a, b) => a - b);
    const tnrs = [...new Set(asigs.map((a) => a.tnr))];

    // El resumen de una ronda en una frase: lo que se anotó, sin las cuentas en cero.
    const resumenRonda = (tnr, r) => {
      const partes = [];
      const res = cuenta(tnr, "resultado", r) + cuenta(tnr, "correccion", r);
      if (res) partes.push(cant(res, "resultado", "resultados"));
      const il = cuenta(tnr, "ilegal", r), ir = cuenta(tnr, "irregularidad", r), lv = cuenta(tnr, "levanto", r), ct = cuenta(tnr, "tiempo", r), fo = cuenta(tnr, "planilla", r);
      if (il) partes.push(cant(il, "jugada ilegal", "jugadas ilegales"));
      if (ir) partes.push(cant(ir, "irregularidad", "irregularidades"));
      if (lv) partes.push(cant(lv, "vez que se levantó un jugador", "veces que se levantó un jugador"));
      if (ct) partes.push(cant(ct, "control de tiempos", "controles de tiempos"));
      if (fo) partes.push(cant(fo, "foto de planillas", "fotos de planillas"));
      const ini = lineas.find((l) => l.tnr === tnr && l.ronda === r && l.clase === "inicio"), fin = lineas.find((l) => l.tnr === tnr && l.ronda === r && l.clase === "final" && l.detalle.indexOf("Finalizó") === 0);
      const tiempo = [ini ? "Empezó a las " + F.hora(ini.cuando) : null, fin ? "terminó a las " + F.hora(fin.cuando) : null].filter(Boolean).join(" y ");
      return [tiempo, partes.join(" · ")].filter(Boolean).join(" · ");
    };

    const COL = { encabezados: ["Hora", "Mesa", "Qué", "Detalle"], anchos: [1.1, 0.7, 1.9, 5.3], envolver: true, negritas: [2] };
    const tablaDe = (filas) => Object.assign({ tipo: "tabla", filas: filas.map((l) => [F.hora(l.cuando), l.mesa == null ? "" : String(l.mesa), l.que, l.detalle]) }, COL);

    const b = [];
    b.push({ tipo: "parrafo", texto: "Concluyó sus labores el " + F.fechaHora(d.concluyo) + " y este documento es el registro de todo lo que anotó y le pasó con su enlace en " + cant(tnrs.length, "torneo", "torneos") + ", ronda por ronda y en orden de hora." });

    b.push({ tipo: "titulo", texto: "Torneos que atendió" });
    b.push({
      tipo: "tabla",
      encabezados: ["Torneo", "Mesas", "Rondas", "Result.", "Ilegales", "Irreg.", "Levantó", "Control", "Fotos"],
      anchos: [2.6, 1.1, 1.1, 1.1, 1.2, 1, 1.3, 1.2, 1],
      negritas: [0],
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
        const res = resumenRonda(tnr, r);
        if (res) b.push({ tipo: "nota", texto: res });
        b.push(tablaDe(lineas.filter((l) => l.tnr === tnr && l.ronda === r)));
      }
      if (sueltas.length) {
        b.push({ tipo: "subtitulo", texto: "Sin ronda" });
        b.push(tablaDe(sueltas));
      }
    }
    b.push({ tipo: "nota", texto: "La hora de cada línea es la de Costa Rica. «Enviado» quiere decir que chess-results confirmó el resultado al volver a leerlo. Las anotaciones anuladas quedan en el registro marcadas como «anulada»: la bitácora no se edita ni se borra." });
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
