/* La ficha de inscripción y consentimiento de los Juegos Deportivos Nacionales
 * 2027 (ICODER), llena con los datos del formulario de jdn.html.
 *
 * LA PLANTILLA ES LA DEL ICODER, NO UNA COPIA ARMADA ACÁ:
 * material/jdn/consentimiento-jdn-2027.docx es el CONSENTIMIENTO.docx de la
 * carpeta «JDN 2027» del Drive, tal cual. Se abre (un .docx es un ZIP), se
 * escriben los datos en su document.xml y se vuelve a empaquetar. Así el
 * documento que se imprime es el oficial, con su logo y su letra; uno «parecido»
 * lo puede rechazar el Comité Cantonal. Si el ICODER cambia el formulario, se
 * reemplaza ese archivo y `verificar-jdn.js` dice qué ancla ya no está.
 *
 * Los datos van DESPUÉS del texto de cada pregunta, en un trozo subrayado, y las
 * opciones se marcan cambiando «( )» por «(X)». La fecha y las firmas quedan en
 * blanco: se firman en papel, a mano (el documento mismo dice que una firma
 * pegada como imagen no vale).
 *
 * LA CATEGORÍA SALE DEL AÑO DE NACIMIENTO, con la tabla de ajedrez de la
 * convocatoria (U-12: 2015 a 2020; U-16: 2011 a 2014; U-20: 2007 a 2010), no de
 * la edad de hoy: es lo que mira el ICODER. Ver «La ficha de los JDN 2027» en
 * docs/decisiones/cuentas-y-formularios.md.
 *
 * Corre igual en Node (verificar-jdn.js): no toca el DOM.
 */
(function (raiz) {
  "use strict";

  const CATEGORIAS = [
    { codigo: "U-12", edades: "7 a 12 años", desde: 2015, hasta: 2020 },
    { codigo: "U-16", edades: "13 a 16 años", desde: 2011, hasta: 2014 },
    { codigo: "U-20", edades: "17 a 20 años", desde: 2007, hasta: 2010 },
  ];

  // Las pruebas que van en la ficha, siempre las mismas: las elige el
  // entrenador, no la familia.
  const PRUEBAS = ["Clásico", "Rápido", "Relámpago"];

  // Las opciones de cada pregunta, escritas como en la plantilla (sin «( )»).
  const OPCIONES = {
    condicion: ["atleta", "paratleta"],
    tipoDocumento: ["Nacional", "Residente", "Pasaporte", "Residencia Temporal", "Refugiado", "Nacionalizado"],
    estadoCivil: ["Soltero(a)", "Casado(a)", "Divorciado(a)", "Separado(a)", "Viudo(a)", "Unión de hecho", "Desconocido"],
    sexo: ["hombre", "mujer"],
    lateralidad: ["Derecho", "Izquierdo"],
    parentesco: ["cónyuge", "Hijos", "Madre", "Padre", "Hermanos", "Patrono", "Otros"],
    discapacidad: [
      "Deterioro de la fuerza muscular", "Deterioro en el rango de movimiento pasivo",
      "Discapacidad en las extremidades", "Diferencia de longitud en las piernas", "Baja estatura",
      "Hipertonía", "Ataxia", "Atetosis", "Discapacidad visual", "Discapacidad intelectual",
    ],
    perroGuia: ["sí", "no"],
    silla: ["Convencional", "Deportiva", "Eléctrica"],
    tutorCondicion: ["padre", "madre", "tutor legal"],
    // Quien acompaña a la persona menor de edad si tiene que denunciar: el
    // entrenador. La plantilla dice «delegado – subdelegado»; la academia
    // inscribe a sus atletas con su entrenador (lo decidió el dueño del sitio).
    autorizadoRol: ["entrenador"],
  };

  /* ------------------------------------------------------------ fechas */

  // «2012-03-09» → [2012, 3, 9]. Un día de calendario no se lee con new Date().
  function partesDia(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }

  function edad(nacimiento, hoy) {
    const n = partesDia(nacimiento), h = partesDia(hoy);
    if (!n || !h) return null;
    let e = h[0] - n[0];
    if (h[1] < n[1] || (h[1] === n[1] && h[2] < n[2])) e -= 1;
    return e;
  }

  function categoria(nacimiento) {
    const n = partesDia(nacimiento);
    if (!n) return null;
    return CATEGORIAS.find((c) => n[0] >= c.desde && n[0] <= c.hasta) || null;
  }

  // «09/03/2012», como lo pide la ficha (día/mes/año).
  function diaMesAnio(iso) {
    const n = partesDia(iso);
    return n ? String(n[2]).padStart(2, "0") + "/" + String(n[1]).padStart(2, "0") + "/" + n[0] : "";
  }

  /* ------------------------------------------------------------ los datos */

  const limpio = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();

  // Lo que hace falta para que la ficha no lleve espacios en blanco (la
  // plantilla lo exige). Devuelve la lista de lo que falta, en palabras.
  function validar(d, hoy) {
    const f = [];
    const pide = (campo, nombre) => { if (!limpio(d[campo])) f.push(nombre); };
    const elige = (campo, lista, nombre) => { if (!lista.includes(d[campo])) f.push(nombre); };
    elige("condicion", OPCIONES.condicion, "si es atleta o paratleta");
    pide("identificacion", "el número de identificación");
    elige("tipoDocumento", OPCIONES.tipoDocumento, "el tipo de documento");
    pide("nombre", "el nombre y apellidos");
    if (!partesDia(d.nacimiento)) f.push("la fecha de nacimiento");
    else if (!categoria(d.nacimiento)) {
      f.push("una fecha de nacimiento entre 2007 y 2020 (las categorías de ajedrez son U-12, U-16 y U-20)");
    }
    pide("nacionalidad", "la nacionalidad");
    elige("estadoCivil", OPCIONES.estadoCivil, "el estado civil");
    pide("telefono", "el teléfono");
    elige("sexo", OPCIONES.sexo, "el sexo biológico");
    elige("lateralidad", OPCIONES.lateralidad, "la lateralidad");
    pide("correo", "el correo electrónico");
    pide("escolaridad", "la escolaridad");
    pide("provincia", "la provincia");
    pide("canton", "el cantón");
    pide("distrito", "el distrito");
    pide("direccion", "la dirección exacta");
    pide("beneficiarioCedula", "la cédula del beneficiario de la póliza");
    pide("beneficiarioNombre", "el nombre del beneficiario de la póliza");
    elige("parentesco", OPCIONES.parentesco, "el parentesco del beneficiario");
    if (d.condicion === "paratleta") {
      if (!(d.discapacidad || []).some((x) => OPCIONES.discapacidad.includes(x))) f.push("el tipo de discapacidad");
      elige("perroGuia", OPCIONES.perroGuia, "si usa perro guía");
    }
    const e = edad(d.nacimiento, hoy);
    if (e != null && e < 18) {
      pide("tutorNombre", "el nombre del padre, madre o tutor");
      pide("tutorEstadoCivil", "el estado civil del tutor");
      pide("tutorProfesion", "la profesión del tutor");
      pide("tutorCedula", "la cédula del tutor");
      elige("tutorCondicion", OPCIONES.tutorCondicion, "si el tutor es padre, madre o tutor legal");
      pide("autorizadoNombre", "el entrenador al que autoriza el tutor");
    }
    return f;
  }

  /* ------------------------------------------------------------ el XML */

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const desc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

  // Arial 10 como el resto de la ficha, sin negrita y subrayado: se ve escrito
  // en la raya, y no se confunde con el texto del formulario.
  const RPR_DATO = '<w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>' +
    '<w:b w:val="0"/><w:bCs w:val="0"/><w:i w:val="0"/><w:iCs w:val="0"/><w:color w:val="000000"/>' +
    '<w:sz w:val="20"/><w:szCs w:val="20"/><w:u w:val="single"/></w:rPr>';
  const runDato = (t) => '<w:r>' + RPR_DATO + '<w:t xml:space="preserve">' + esc(t) + "</w:t></w:r>";

  function error(que) { throw new Error("La plantilla de la ficha no tiene " + que + ": ¿cambió el formulario del ICODER?"); }

  // El párrafo (de primer nivel) que tiene `ancla` en su texto: [inicio, fin).
  function parrafo(xml, ancla) {
    const i = xml.indexOf(esc(ancla));
    if (i < 0) error("«" + ancla + "»");
    const ini = Math.max(xml.lastIndexOf("<w:p ", i), xml.lastIndexOf("<w:p>", i));
    const fin = xml.indexOf("</w:p>", i);
    if (ini < 0 || fin < 0) error("el párrafo de «" + ancla + "»");
    return [ini, fin + 6];
  }

  function enParrafo(xml, ancla, fn) {
    const [a, z] = parrafo(xml, ancla);
    return xml.slice(0, a) + fn(xml.slice(a, z)) + xml.slice(z);
  }

  /* Escribe `valor` en el párrafo de `ancla`, en el run número `vez` (desde 1)
     que contiene `buscar`: lo parte en (antes)(buscar)(DATO)(después), o
     (antes)(DATO)(después) si `reemplaza`. El resto del run conserva su letra. */
  function poner(xml, ancla, buscar, valor, opciones) {
    const op = opciones || {};
    const vez = op.vez || 1;
    return enParrafo(xml, ancla, (p) => {
      const runs = /<w:r[ >][\s\S]*?<\/w:r>/g;
      let m, n = 0;
      while ((m = runs.exec(p))) {
        const run = m[0];
        const t = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/.exec(run);
        if (!t) continue;
        const texto = desc(t[1]);
        const k = texto.indexOf(buscar);
        if (k < 0 || ++n < vez) continue;
        const rpr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run) || [""])[0];
        const trozo = (s) => (s ? '<w:r>' + rpr + '<w:t xml:space="preserve">' + esc(s) + "</w:t></w:r>" : "");
        const antes = texto.slice(0, k) + (op.reemplaza ? "" : buscar);
        let despues = texto.slice(k + buscar.length);
        // Los espacios que hacían de raya ya no hacen falta: con el dato
        // escrito, empujarían «Cantón» y «Distrito» a otra línea.
        if (op.recorta) despues = despues.replace(/^\s{4,}/, "     ");
        const v = limpio(valor);
        const dato = op.reemplaza ? v : (/\s$/.test(antes) ? "" : " ") + v;
        const nuevo = trozo(antes) + runDato(dato) + trozo(despues && !/^\s/.test(despues) && !op.reemplaza ? " " + despues : despues);
        return p.slice(0, m.index) + nuevo + p.slice(m.index + run.length);
      }
      return error("«" + buscar + "» junto a «" + ancla + "»");
    });
  }

  /* Marca «(X)» en la opción `opcion` del párrafo de `ancla`. Entre los
     paréntesis y la opción puede haber espacios y cambios de run (la plantilla
     parte «( )» y «Deterioro en el rango…» en runs distintos). */
  function marcar(xml, ancla, opcion) {
    return enParrafo(xml, ancla, (p) => {
      const re = new RegExp("\\(\\s*\\)((?:\\s|<[^>]+>)*" + escRe(esc(opcion)) + ")(?![A-Za-zÁÉÍÓÚáéíóúÑñ])");
      if (!re.test(p)) error("la opción «" + opcion + "» junto a «" + ancla + "»");
      return p.replace(re, "(X)$1");
    });
  }

  // Cambia un trozo de texto del formulario, sin dato (los paréntesis de
  // «Yo (indicar nombre…) mayor», que ya no van cuando está el nombre).
  function retocar(xml, ancla, viejo, nuevo) {
    return enParrafo(xml, ancla, (p) => {
      if (!p.includes(viejo)) error("«" + viejo + "» junto a «" + ancla + "»");
      return p.replace(viejo, nuevo);
    });
  }

  // Lo que va en el recuadro de las pruebas (un cuadro de texto de la plantilla).
  function enRecuadro(xml, texto) {
    const i = xml.indexOf("<w:txbxContent>");
    if (i < 0) error("el recuadro de las pruebas");
    const fin = xml.indexOf("</w:p>", i);
    return xml.slice(0, fin) + runDato(texto).replace('<w:u w:val="single"/>', "") + xml.slice(fin);
  }


  // document.xml de la plantilla → el mismo, con los datos de `d`.
  function llenar(xml, d, hoy) {
    let x = xml;
    const cat = categoria(d.nacimiento);

    x = marcar(x, "Mi persona en condición de", d.condicion);

    const e = edad(d.nacimiento, hoy);
    if (e != null && e < 18) {
      x = retocar(x, "indicar nombre completo y calidades", ">Yo (<", ">Yo <");
      x = poner(x, "indicar nombre completo y calidades", "indicar nombre completo y calidades", d.tutorNombre, { reemplaza: true });
      x = retocar(x, ") mayor, ", ">) mayor, <", ">, mayor, <");
      x = poner(x, "indicar estado civil", "indicar estado civil", d.tutorEstadoCivil, { reemplaza: true });
      x = poner(x, "indicar profesión", "indicar profesión", d.tutorProfesion, { reemplaza: true });
      x = poner(x, "cédula de identidad ____", "_______________", d.tutorCedula, { reemplaza: true });
      x = poner(x, "en mi condición de (padre- madre-tutor)", "(padre- madre-tutor)", d.tutorCondicion, { reemplaza: true });
      x = poner(x, "patria potestad del atleta", "__________________", d.nombre, { reemplaza: true });
      x = poner(x, "autorizo a ____", "______________ (definir si delegado – subdelegado –)",
        limpio(d.autorizadoNombre) + " (entrenador)", { reemplaza: true });
    }

    x = poner(x, "1-Indique el deporte", "1-Indique el deporte en el cual se inscribe:", "Ajedrez");
    // El comité, la rama y las pruebas son del entrenador (la pregunta 20 lo
    // dice: «información suministrada por el entrenador»): la familia no los
    // llena. El comité queda en blanco para que lo escriba él; las pruebas
    // van las tres de siempre.
    if (limpio(d.comite)) x = poner(x, "2-Indique el nombre del Comité", "con el cual se inscribe:", d.comite);
    x = poner(x, "4-Número de identificación", ":", d.identificacion);
    x = marcar(x, "5-Tipo de documento", d.tipoDocumento);
    x = poner(x, "6-Nombre y apellidos", "6-Nombre y apellidos: ", d.nombre);
    x = poner(x, "7-Fecha de nacimiento", ": ", diaMesAnio(d.nacimiento));
    x = poner(x, "8-Nacionalidad", ": ", d.nacionalidad);
    // El estado civil está en dos párrafos: las dos últimas opciones van solas.
    x = marcar(x, ["Unión de hecho", "Desconocido"].includes(d.estadoCivil) ? "( ) Unión de hecho" : "9-Estado civil", d.estadoCivil);
    x = poner(x, "10-Teléfono", "10-Teléfono del atleta o tutor: ", d.telefono);
    x = marcar(x, "11-Sexo biológico", d.sexo);
    x = marcar(x, "12-Lateralidad", d.lateralidad);
    x = poner(x, "13-Correo electrónico", ":", d.correo);
    x = poner(x, "14-Escolaridad", ":", d.escolaridad);
    // Provincia, cantón y distrito comparten párrafo: de atrás para adelante,
    // para que el dato escrito no corra la cuenta de los «:».
    x = poner(x, "Provincia", ":", d.distrito, { vez: 3, recorta: true });
    x = poner(x, "Provincia", ":", d.canton, { vez: 2, recorta: true });
    x = poner(x, "Provincia", ":", d.provincia, { vez: 1, recorta: true });
    x = poner(x, "Dirección exacta", ": ", d.direccion);
    x = poner(x, "16-Número de cédula", ": ", d.beneficiarioCedula);
    x = poner(x, "17-Nombre y apellidos del beneficiario", ":", d.beneficiarioNombre);
    x = marcar(x, "18-Parentesco", d.parentesco);

    if (d.condicion === "paratleta") {
      for (const t of d.discapacidad || []) x = marcar(x, "Tipo de discapacidad", t);
      x = marcar(x, "Perro guía", d.perroGuia);
      if (OPCIONES.silla.includes(d.silla)) x = marcar(x, "Perro guía", d.silla);
    }

    x = poner(x, "Categoría Deportiva", ":", "Individual. Ajedrez " + (cat ? cat.codigo : ""));
    x = poner(x, "Deportes de conjunto indicar", ":", "No aplica (ajedrez)");
    x = poner(x, "Nombre del equipo:", "Nombre del equipo:", "No aplica");
    x = enRecuadro(x, "Ajedrez " + (cat ? cat.codigo : "") + ": " + PRUEBAS.join(", ") + ".");
    return x;
  }

  /* ------------------------------------------------------------ el archivo */

  // Los bytes de la plantilla → los del .docx lleno. Usa el lector de ZIP de
  // js/reporte-excel.js y el empaquetador de js/reporte-docx.js.
  async function generar(plantilla, d, hoy) {
    const buf = plantilla instanceof ArrayBuffer ? plantilla
      : plantilla.buffer.slice(plantilla.byteOffset, plantilla.byteOffset + plantilla.byteLength);
    const zip = await raiz.ReporteExcel.abrirZip(buf);
    const salida = new raiz.ReporteDOCX.Zip();
    for (const n of zip.nombres()) {
      if (n.endsWith("/")) continue;
      if (n === "word/document.xml") salida.agregar(n, llenar(await zip.texto(n), d, hoy));
      else salida.agregar(n, await zip.bytes(n));
    }
    return salida.cerrar();
  }

  // El nombre de la carpeta y de los archivos: el de la persona, sin lo que
  // Drive o una computadora no aceptan en un nombre de archivo.
  function nombreArchivo(nombre) {
    return limpio(nombre).replace(/[\\/:*?"<>|#%]/g, "").slice(0, 120);
  }

  const api = { CATEGORIAS, PRUEBAS, OPCIONES, edad, categoria, diaMesAnio, validar, llenar, generar, nombreArchivo };
  raiz.JDNConsentimiento = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
