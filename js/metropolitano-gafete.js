/* Ajedrez Integral — el gafete del Metropolitano 2026.
 *
 * Es el mismo gafete de gafetes.html (el del Centroamericano 2026): lo dibuja
 * js/gafetes-dibujo.js —la misma función para la pantalla y para el PDF de la
 * imprenta— y lo arma js/gafetes-pdf.js. Acá solo vive el DISEÑO del
 * Metropolitano (título, colores por torneo, horario del dorso) y cómo se
 * pasa una inscripción a la «fila» que el dibujo entiende. Lo usan la
 * inscripción (la persona lo ve y lo valida antes de mandar, y lo descarga
 * después) y la lista de inscritos de administración.
 *
 * Diferencia con gafetes.html: este lleva la FOTO tamaño pasaporte de la
 * persona (`g.foto`, en el marco que en el del Centroamericano ocupaba la
 * mascota).
 */
window.MetropolitanoGafete = (function () {
  "use strict";
  const R = () => window.MetropolitanoReglas;
  const D = () => window.GafetesDibujo;
  // El QR lleva a la página con toda la información del torneo, no al PDF:
  // desde ahí se abren las bases encima, sin salir del sitio.
  const INFO = "https://ajedrez-integral.com/metropolitano-2026";

  let diseno = null, recursos = null;

  async function aDatos(ruta) {
    const blob = await (await fetch(ruta)).blob();
    return new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => mal(fr.error); fr.readAsDataURL(blob); });
  }

  function horarioDe(torneos) {
    const filas = [];
    const clasico = torneos.find((t) => t !== "BLITZ");
    if (clasico) filas.push(...R().HORARIOS[clasico]);
    if (torneos.includes("BLITZ")) filas.push(...R().HORARIOS.BLITZ);
    if (!filas.length) return [];
    return [["Reunión técnica", "25/12", "19:00"], ...filas, ["Premiación", "30/12", ""]].slice(0, 16);
  }

  // El diseño: el del Centroamericano con la marca de las bases del
  // Metropolitano (su logo, el de la FCA, las hojas abajo y sus colores).
  async function disenoDe(torneos) {
    if (!diseno) {
      const colores = {}, etiquetas = {};
      for (const [k, t] of Object.entries(R().TORNEOS)) { colores[k.toLowerCase()] = t.color; etiquetas[k.toLowerCase()] = t.nombre; }
      for (const [k, r] of Object.entries(R().ROLES)) if (r.color) { colores[k] = r.color; etiquetas[k] = r.nombre; }
      diseno = {
        version: 1, nombreDiseno: "Metropolitano 2026", aprobado: true,
        tamano: { ancho: 100, alto: 140 },
        imagenes: {},
        titulo: { texto: "XLVII TORNEO INTERNACIONAL\nMETROPOLITANO 2026\nESTADIO NACIONAL, COSTA RICA", color: "#1d134d" },
        nombre: { linea1: "{Apellidos}", linea2: "{Nombre}", propio: true },
        detalles: ["{Detalle1}", "{Detalle2}", "{Detalle3}"],
        bandera: { plantilla: "{Federación}", texto: true },
        franja: { plantilla: "{Rol}" },
        iconos: [{ columna: "", dibujo: "telefono", imagen: null }, { columna: "", dibujo: "camara", imagen: null }],
        colores: { columna: "Color", valores: colores, etiquetas, omision: "#043576" },
        dorso: { vertical: "{Rol}", repetirLogos: true, qr: INFO, qrMarca: true, encabezados: ["Actividad", "Fecha", "Hora"], horario: [] },
        codigo: { plantilla: "{Código}", sinCodigoSi: "" },
        fuentes: { titulo: { id: "league-spartan" }, texto: { id: "quicksand" } },
        salida: { separarPor: "" },
      };
      for (const [id, ruta] of [["logoIzq", "img/metropolitano-2026/logo.png"], ["logoDer", "img/fca-logo.png"], ["cintaFrente", "img/metropolitano-2026/hojas-abajo.jpg"]]) {
        try { diseno.imagenes[id] = { nombre: ruta.split("/").pop(), datos: await aDatos(ruta) }; } catch (e) { /* sin esa imagen */ }
      }
    }
    return Object.assign({}, diseno, { dorso: Object.assign({}, diseno.dorso, { horario: horarioDe(torneos) }) });
  }

  /* De una inscripción (como la manda la página o como la lee la base) a la
     fila del gafete. El jugador lleva su torneo en la franja; los demás, su
     rol. */
  function filaDe(x) {
    const rol = x.rol || "jugador";
    const torneos = rol === "jugador" ? (x.torneos || []) : [];
    const clasico = torneos.find((t) => t !== "BLITZ");
    let franja, color;
    if (rol === "jugador") {
      franja = clasico ? R().TORNEOS[clasico].nombre + (torneos.includes("BLITZ") ? " + Blitz" : "") : R().TORNEOS.BLITZ.nombre;
      color = (clasico || "BLITZ").toLowerCase();
    } else {
      franja = R().rolDe(rol, x.sexo);
      color = rol;
    }
    const detalles = [];
    if (x.fide_id) detalles.push("FIDE ID: " + x.fide_id);
    else if (rol === "jugador" && x.sin_fide) detalles.push("FIDE ID: en trámite");
    if (rol === "jugador") detalles.push(x.elo_estandar ? "Elo FIDE: " + x.elo_estandar : (x.sin_fide ? "" : "Elo FIDE: sin Elo"));
    else if (x.es_delegado && rol !== "delegado") detalles.push("Delegado del grupo");
    if (x.delegacion) detalles.push(x.delegacion);
    else if (x.club) detalles.push(x.club);
    const d = detalles.filter(Boolean);
    return {
      Apellidos: x.apellidos || "", Nombre: x.nombre || "",
      "FIDE ID": x.fide_id || "",
      Elo: x.elo_estandar ? String(x.elo_estandar) : "",
      Club: x.club || "",
      Detalle1: d[0] || "", Detalle2: d[1] || "", Detalle3: d[2] || "",
      // La bandera: la federación de FIDE o, sin FIDE, la nacionalidad.
      "Federación": x.federacion || x.nacionalidad || "",
      Rol: franja,
      Color: color,
      "Código": x.codigo || "",
    };
  }

  // En el dorso, el horario de su torneo; a quien no juega, el del A y el blitz.
  const torneosDelDorso = (x) => ((x.rol || "jugador") === "jugador" ? (x.torneos || []) : ["A", "BLITZ"]);

  async function preparar(x, foto) {
    const d = await disenoDe(torneosDelDorso(x));
    if (!recursos) recursos = await D().preparar(d);
    const g = D().gafetes(d, [filaDe(x)])[0];
    if (foto) { g.foto = foto; g.fotoClave = "foto"; }
    return { d, g };
  }

  // Pinta las dos caras en dos <canvas> (la vista previa).
  // (La etiqueta del lienzo dice lo que el gafete dice, para quien no lo ve.)
  async function dibujar(x, foto, lienzoFrente, lienzoDorso) {
    const { d, g } = await preparar(x, foto);
    const frente = await D().cara(d, recursos, g, "frente");
    const dorso = await D().cara(d, recursos, g, "dorso");
    const css = lienzoFrente.parentElement.clientWidth || 280;
    const px = (css / d.tamano.ancho) * (window.devicePixelRatio || 1);
    D().pintar(lienzoFrente, d, frente, px);
    D().pintar(lienzoDorso, d, dorso, px);
    const quien = [x.nombre, x.apellidos].filter(Boolean).join(" ");
    lienzoFrente.setAttribute("aria-label", "Frente del gafete de " + quien + ", con su foto: " + filaDe(x).Rol + (x.fide_id ? ", FIDE ID " + x.fide_id : ""));
    lienzoDorso.setAttribute("aria-label", "Dorso del gafete: el horario de " + filaDe(x).Rol + (x.codigo ? ", código " + x.codigo : ""));
    return [...new Set([...frente.avisos, ...dorso.avisos])];
  }

  /* El PDF de uno o varios gafetes (frente y dorso de cada uno), como el de
     la imprenta. `lista` es [{ x, foto }]; un grupo sale en un solo PDF. */
  async function pdf(x, foto) { return pdfDe([{ x, foto }], "Gafete Metropolitano 2026 - " + [x.nombre, x.apellidos].join(" ")); }
  async function pdfDe(lista, titulo) {
    let doc = null;
    for (const it of lista) {
      const { d, g } = await preparar(it.x, it.foto);
      if (!doc) doc = window.GafetesPdf.nuevo(d.tamano.ancho, d.tamano.alto, titulo || "Gafetes Metropolitano 2026");
      if (it.foto) g.fotoClave = "foto-" + lista.indexOf(it);
      for (const lado of ["frente", "dorso"]) {
        const c = await D().cara(d, recursos, g, lado);
        await doc.agregar({ clave: c.clave, ...(await D().fondoJpeg(d, c, 300)), textos: c.textos });
      }
    }
    return doc.cerrar();
  }

  return { filaDe, dibujar, pdf, pdfDe, horarioDe };
})();
