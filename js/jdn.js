/* jdn.html: la ficha de inscripción y consentimiento de los JDN 2027.
 *
 * El formulario arma los datos, js/jdn-consentimiento.js llena la plantilla
 * del ICODER y la Edge Function jdn-drive guarda la ficha, la foto y la cédula
 * en una carpeta con el nombre de la persona dentro de «JDN 2027». La ficha se
 * descarga también aquí mismo, para imprimirla sin esperar al Drive.
 *
 * Las imágenes se pasan a JPEG en el navegador (las pide así el ICODER) y se
 * achican a 2000 px por lado: una foto de celular de 6 MB pasa a ~500 KB, y
 * así el envío cabe holgado en lo que acepta la función.
 *
 * La categoría sale del año de nacimiento (JDNConsentimiento.categoria) y se
 * muestra al escribir la fecha; ser menor de edad abre los datos del tutor, y
 * ser menor de 12 pide la certificación de nacimiento en vez de la cédula. Ver
 * «La ficha de los JDN 2027» en docs/decisiones/cuentas-y-formularios.md.
 *
 * ATLETA O ENTRENADOR. Cada uno llena su consentimiento (PLANTILLA). Al
 * entrenador no se le pide categoría, tutor ni la condición de paratleta. El
 * comité que representa va en «Nombre del equipo» de la ficha y decide la
 * carpeta del Drive: JDN 2027 / <comité> / <Atletas|Entrenadores> /
 * <Mujeres|Hombres> / <persona>, con la hoja «Resumen» del comité.
 *
 * Al terminar, quien llena solo puede descargar la ficha: los enlaces al Drive
 * no se muestran a nadie (tampoco a quien administra, que entra al Drive por su
 * cuenta).
 *
 * DOS MODOS. La página es pública: sin cuenta (o con una que no administra) la
 * llena la familia, «Enviar la ficha» manda a la función sin sesión y la
 * función la pasa por el freno de los envíos públicos. Con la sesión de quien
 * administra aparece «El Drive» (conectar el puente); la función le exige el
 * aal2 e is_admin.
 */
(function () {
  "use strict";

  const J = window.JDNConsentimiento;
  const $ = (id) => document.getElementById(id);
  const FUNCION = window.SUPABASE_URL + "/functions/v1/jdn-drive";
  // Cada rol tiene su consentimiento del ICODER.
  const PLANTILLA = {
    atleta: "documentos/jdn/consentimiento-jdn-2027.docx",
    entrenador: "documentos/jdn/consentimiento-entrenador-jdn-2027.docx",
  };
  const LADO_MAX = 2000;
  const DOCS = {
    foto: "Fotografía",
    frente: "Cédula frente",
    reverso: "Cédula reverso",
    certificacion: "Certificación de nacimiento",
  };

  const SESION_CERRADA = "Tu sesión se cerró (por ejemplo, porque saliste en otra pestaña o en otro aparato). Vuelve a entrar en otra pestaña y prueba de nuevo aquí: lo que llenaste no se pierde.";
  let esAdmin = false;
  let conectado = false;
  let ultimaFicha = null;   // { bytes, nombre } de la última que se armó

  /* ------------------------------------------------------------ la función */

  /* El token se pide en cada llamada, no se guarda al abrir la página: dura
     una hora, y supabase-js lo renueva en su almacenamiento, no en una
     variable nuestra. Con la página abierta más de una hora, «Guardar»
     mandaba el token vencido. */
  async function llamar(accion, datos) {
    const headers = { "Content-Type": "application/json", "apikey": window.SUPABASE_ANON_KEY };
    // Sin cuenta no hay token que mandar: la función recibe el envío por su
    // puerta pública (con el freno).
    if (esAdmin) {
      const { data } = await sb.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (!token) throw new Error(SESION_CERRADA);
      headers.Authorization = "Bearer " + token;
    }
    const res = await fetch(FUNCION, {
      method: "POST",
      headers,
      body: JSON.stringify(Object.assign({ action: accion }, datos || {})),
    });
    const r = await res.json().catch(() => ({}));
    // Un 401 es la sesión: vencida o cerrada en otro aparato («Cerrar sesión»
    // cierra todas las de la cuenta, pero esta pestaña conserva un token que
    // parece bueno hasta que vence).
    if (esAdmin && res.status === 401 && !/segundo paso/.test(r.error || "")) throw new Error(SESION_CERRADA);
    if (!res.ok || r.error && accion !== "estado") throw new Error(r.error || "El servidor no contestó. Intenta de nuevo.");
    return r;
  }

  function pintarDrive(r) {
    const p = $("drive-estado");
    p.textContent = "";
    conectado = !!(r && r.conectado);
    if (conectado) {
      p.append("Conectado: las fichas se guardan en ");
      const a = document.createElement("a");
      a.href = r.url || "#";
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "underline font-semibold hover:text-accent-600";
      a.textContent = "«" + (r.carpeta || "JDN 2027") + "»";
      p.append(a, ".");
    } else {
      p.textContent = r && r.error === SESION_CERRADA ? SESION_CERRADA
        : r && r.error
        ? "El Drive no contesta (" + r.error + "). Vuelve a conectarlo abajo, o descarga la ficha sin guardarla."
        : "Todavía no está conectado el Drive. Conéctalo abajo; mientras tanto puedes descargar la ficha sin guardarla.";
      $("drive-conectar").open = true;
    }
    $("jdn-guardar").disabled = !conectado;
    $("jdn-guardar").classList.toggle("opacity-50", !conectado);
  }

  async function revisarDrive() {
    try {
      pintarDrive(await llamar("estado"));
    } catch (e) {
      pintarDrive({ conectado: false, error: e.message });
    }
  }

  async function conectar(ev) {
    ev.preventDefault();
    const msg = $("drive-msg");
    const b = $("drive-probar");
    b.disabled = true;
    msg.className = "text-sm mt-2 text-brand-600 dark:text-brand-200";
    msg.textContent = "Probando la conexión…";
    try {
      const r = await llamar("conectar", { url: $("drive-url").value.trim(), secreto: $("drive-secreto").value.trim() });
      $("drive-secreto").value = "";
      msg.className = "text-sm mt-2 text-green-800 dark:text-green-300";
      msg.textContent = "Listo: el Drive contestó y quedó conectado.";
      pintarDrive(r);
      $("drive-conectar").open = false;
    } catch (e) {
      msg.className = "text-sm mt-2 text-red-700 dark:text-red-300";
      msg.textContent = e.message;
    } finally {
      b.disabled = false;
    }
  }

  /* ------------------------------------------------------------ el formulario */

  function opciones(select, lista) {
    select.textContent = "";
    const vacia = document.createElement("option");
    vacia.value = "";
    vacia.textContent = "Elige…";
    select.append(vacia);
    for (const v of lista) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v.charAt(0).toUpperCase() + v.slice(1);
      select.append(o);
    }
  }

  function casillas(caja, nombre, lista, marcadas) {
    for (const v of lista) {
      const l = document.createElement("label");
      l.className = "flex items-center gap-2";
      const i = document.createElement("input");
      i.type = "checkbox";
      i.name = nombre;
      i.value = v;
      i.checked = !!marcadas;
      i.className = "h-4 w-4 rounded text-accent-500 focus:ring-accent-500";
      l.append(i, " " + v.charAt(0).toUpperCase() + v.slice(1));
      caja.append(l);
    }
  }

  const radio = (nombre) => (document.querySelector('input[name="' + nombre + '"]:checked') || {}).value || "";
  const marcadas = (nombre) => [...document.querySelectorAll('input[name="' + nombre + '"]:checked')].map((i) => i.value);
  const hoy = () => window.HoraCR.hoy();

  function datos() {
    const d = {};
    document.querySelectorAll(".jdn-campo").forEach((c) => { d[c.name] = c.value.trim(); });
    d.rol = radio("rol");
    d.condicion = radio("condicion");
    d.sexo = radio("sexo");
    d.lateralidad = radio("lateralidad");
    d.perroGuia = radio("perroGuia");
    d.discapacidad = marcadas("discapacidad");
    return d;
  }

  const esEntrenador = () => radio("rol") === "entrenador";
  const edadDe = () => J.edad($("f-nacimiento").value, hoy());
  const esMenor = () => { const e = edadDe(); return !esEntrenador() && e != null && e < 18; };
  const pideCertificacion = () => { const e = edadDe(); return !esEntrenador() && e != null && e < 12; };

  // Lo que depende de otras respuestas: la categoría, el tutor, la
  // certificación y la caja de paratleta.
  function actualizar() {
    const ent = esEntrenador();
    $("caja-condicion").hidden = ent;
    $("caja-categoria").hidden = ent;
    // Las fechas posibles de un atleta son las de las categorías; un
    // entrenador puede haber nacido cuando sea.
    if (ent) { $("f-nacimiento").removeAttribute("min"); $("f-nacimiento").removeAttribute("max"); }
    else { $("f-nacimiento").min = "2007-01-01"; $("f-nacimiento").max = "2020-12-31"; }
    document.querySelectorAll(".jdn-quien").forEach((s) => { s.textContent = ent ? "del entrenador" : "del atleta"; });
    const nac = $("f-nacimiento").value;
    const cat = J.categoria(nac);
    const e = edadDe();
    $("jdn-categoria").textContent = !nac ? "Escribe la fecha de nacimiento."
      : cat ? cat.codigo + " (nacidos de " + cat.desde + " a " + cat.hasta + ")" + (e != null ? " · " + e + " años" : "")
      : "Fuera de las categorías de ajedrez: hay que haber nacido entre 2007 y 2020.";

    const menor = esMenor();
    $("caja-tutor").hidden = !menor;
    $("jdn-mismo-tutor").hidden = !menor;

    const cert = pideCertificacion();
    $("caja-certificacion").hidden = !cert;
    document.querySelectorAll(".jdn-oblig").forEach((s) => { s.hidden = cert; });

    $("caja-paratleta").hidden = ent || radio("condicion") !== "paratleta";
  }

  // El teléfono es de 8 números: lo que no es número no entra (tampoco al
  // pegar «8888-1234»). Sin maxlength en el campo: cortaría «8888-1234» en
  // «8888-123» ANTES de quitarle el guion.
  function soloNumeros() {
    const t = $("f-telefono");
    const limpio = t.value.replace(/\D/g, "").slice(0, 8);
    if (limpio !== t.value) t.value = limpio;
  }

  function mismoTutor() {
    $("f-beneficiarioNombre").value = $("f-tutorNombre").value;
    $("f-beneficiarioCedula").value = $("f-tutorCedula").value;
    const par = { madre: "Madre", padre: "Padre" }[$("f-tutorCondicion").value];
    if (par) $("f-parentesco").value = par;
  }

  /* ------------------------------------------------------------ las imágenes */

  // Una imagen cualquiera → JPEG de hasta 2000 px por lado, con su tamaño
  // (la fotografía va también dentro de la ficha).
  async function aJpeg(archivo) {
    let img;
    try {
      img = await createImageBitmap(archivo);
    } catch (e) {
      throw new Error("No se pudo abrir «" + archivo.name + "». Usa una foto en JPG o PNG.");
    }
    const k = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * k);
    lienzo.height = Math.round(img.height * k);
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#fff";   // un PNG transparente no queda negro en JPEG
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.9));
    if (!blob) throw new Error("No se pudo convertir «" + archivo.name + "» a JPEG.");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ancho: lienzo.width, alto: lienzo.height };
  }

  function base64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function vistaPrevia(input) {
    const img = input.parentElement.querySelector(".jdn-vista");
    const f = input.files && input.files[0];
    if (img.src) URL.revokeObjectURL(img.src);
    if (!f || !/^image\//.test(f.type)) { img.hidden = true; img.removeAttribute("src"); return; }
    img.src = URL.createObjectURL(f);
    img.alt = "Vista previa: " + input.labels[0].textContent.replace("*", "").trim();
    img.hidden = false;
  }

  // Los documentos que pide esta persona, en el orden en que se guardan.
  function documentosPedidos() {
    const cert = pideCertificacion();
    return [
      { clave: "foto", obligatorio: true },
      { clave: "frente", obligatorio: !cert },
      { clave: "reverso", obligatorio: !cert },
      { clave: "certificacion", obligatorio: cert, visible: cert },
    ].filter((x) => x.visible !== false);
  }

  /* ------------------------------------------------------------ armar y guardar */

  function falta(texto, foco) {
    $("jdn-error").textContent = texto;
    if (foco) foco.focus();
    return null;
  }

  // `foto`: { bytes, ancho, alto } en JPEG, o null (la ficha sale sin foto).
  async function armarFicha(d, foto) {
    const res = await fetch(PLANTILLA[d.rol] || PLANTILLA.atleta);
    if (!res.ok) throw new Error("No se pudo leer la plantilla de la ficha.");
    const bytes = await J.generar(await res.arrayBuffer(), d, hoy(), foto);
    const que = d.rol === "entrenador" ? "Ficha entrenador JDN 2027 - " : "Ficha JDN 2027 - ";
    return { bytes, nombre: que + J.nombreArchivo(d.nombre) + ".docx" };
  }

  async function fotoElegida() {
    const f = $("f-foto").files && $("f-foto").files[0];
    return f ? aJpeg(f) : null;
  }

  function descargar(ficha) {
    const url = URL.createObjectURL(new Blob([ficha.bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }));
    const a = document.createElement("a");
    a.href = url;
    a.download = ficha.nombre;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // Lo que falta, o null si está todo. `conDocumentos`: para el Drive.
  function revisar(d, conDocumentos) {
    $("jdn-error").textContent = "";
    const faltan = J.validar(d, hoy());
    if (faltan.length) return falta("Falta: " + faltan.join("; ") + ".", null) || faltan;
    if (conDocumentos) {
      for (const x of documentosPedidos()) {
        const input = $("f-" + x.clave);
        if (x.obligatorio && !(input.files && input.files[0])) {
          return falta("Falta la imagen: " + DOCS[x.clave].toLowerCase() + ".", input) || ["doc"];
        }
      }
      if (!$("jdn-acepto").checked) return falta("Falta marcar que la persona entregó los datos y acepta la Política de privacidad.", $("jdn-acepto")) || ["acepto"];
    }
    return null;
  }

  async function soloFicha() {
    const d = datos();
    if (revisar(d, false)) return;
    try {
      ultimaFicha = await armarFicha(d, await fotoElegida());
      descargar(ultimaFicha);
      $("jdn-progreso").textContent = "La ficha se descargó. No se guardó en el Drive.";
    } catch (e) {
      falta(e.message, null);
    }
  }

  async function guardar(ev) {
    ev.preventDefault();
    if (esAdmin && !conectado) return falta("El Drive no está conectado: conéctalo arriba, o usa «Solo descargar la ficha».", $("drive-conectar").querySelector("summary"));
    const d = datos();
    if (revisar(d, true)) return;

    const boton = $("jdn-guardar");
    const progreso = $("jdn-progreso");
    boton.disabled = true;
    try {
      progreso.textContent = "Preparando las imágenes…";
      const nombre = J.nombreArchivo(d.nombre);
      const imagenes = [];
      let foto = null;
      for (const x of documentosPedidos()) {
        const f = $("f-" + x.clave).files[0];
        if (!f) continue;
        if (f.type === "application/pdf") {
          imagenes.push({ nombre: DOCS[x.clave] + " - " + nombre + ".pdf", tipo: "application/pdf", base64: base64(new Uint8Array(await f.arrayBuffer())) });
        } else {
          const jpg = await aJpeg(f);
          if (x.clave === "foto") foto = jpg;
          imagenes.push({ nombre: DOCS[x.clave] + " - " + nombre + ".jpg", tipo: "image/jpeg", base64: base64(jpg.bytes) });
        }
      }

      progreso.textContent = "Armando la ficha…";
      ultimaFicha = await armarFicha(d, foto);
      const archivos = [{ nombre: ultimaFicha.nombre, tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64: base64(ultimaFicha.bytes), ficha: true }].concat(imagenes);

      progreso.textContent = "Guardando en el Drive… (puede tardar un minuto)";
      const r = await llamar("guardar", {
        modo: esAdmin ? "admin" : "publico",
        correo: d.correo,
        persona: nombre,
        comite: d.comite,
        rol: d.rol,
        sexo: d.sexo,
        resumen: resumen(d),
        archivos,
        privacidad_version: window.LegalVersion.PRIVACIDAD,
      });
      progreso.textContent = "";
      descargar(ultimaFicha);
      mostrarListo(d, nombre);
    } catch (e) {
      progreso.textContent = "";
      falta(e.message, null);
    } finally {
      boton.disabled = false;
    }
  }

  // La fila de la hoja «Resumen» del comité: lo justo para saber quién ya
  // mandó su ficha y cómo ubicarlo.
  function resumen(d) {
    const cat = d.rol === "entrenador" ? null : J.categoria(d.nacimiento);
    return {
      nombre: d.nombre,
      rol: d.rol === "entrenador" ? "Entrenador(a)" : (d.condicion === "paratleta" ? "Paratleta" : "Atleta"),
      sexo: d.sexo === "mujer" ? "Mujer" : "Hombre",
      categoria: cat ? cat.codigo : "",
      identificacion: d.identificacion,
      nacimiento: d.nacimiento,
      telefono: d.telefono,
      correo: d.correo,
      canton: d.canton,
    };
  }

  // Lo único que queda por hacer es descargar la ficha: el Drive es de la
  // academia, y quien administra lo abre por su lado.
  function mostrarListo(d, nombre) {
    $("jdn-form").hidden = true;
    $("listo-titulo").textContent = esAdmin ? "Ficha guardada" : "Ficha enviada";
    $("listo-texto").textContent = "La academia recibió la ficha de " + nombre + " (" + d.comite + ") con sus documentos. " +
      "La ficha llena se descargó en este aparato: imprímela y fírmala a mano" +
      (esMenor() ? " (que la firme también la madre, el padre o el tutor)" : "") +
      ". Si no se descargó, usa «Descargar la ficha».";
    $("jdn-listo").hidden = false;
    $("jdn-listo").focus();
  }

  function otra() {
    $("jdn-form").reset();
    document.querySelectorAll(".jdn-archivo").forEach(vistaPrevia);
    $("jdn-listo").hidden = true;
    $("jdn-form").hidden = false;
    $("jdn-error").textContent = "";
    actualizar();
    $("f-nombre").focus();
  }

  /* ------------------------------------------------------------ arranque */

  function armar() {
    document.querySelectorAll("select[data-opciones]").forEach((s) => opciones(s, J.OPCIONES[s.dataset.opciones]));
    casillas($("jdn-discapacidad"), "discapacidad", J.OPCIONES.discapacidad, false);

    $("jdn-form").addEventListener("input", actualizar);
    $("jdn-form").addEventListener("change", actualizar);
    $("jdn-form").addEventListener("submit", guardar);
    document.querySelectorAll(".jdn-archivo").forEach((i) => i.addEventListener("change", () => vistaPrevia(i)));
    $("jdn-solo-ficha").addEventListener("click", soloFicha);
    $("jdn-mismo-tutor").addEventListener("click", mismoTutor);
    $("f-telefono").addEventListener("input", soloNumeros);
    $("drive-form").addEventListener("submit", conectar);
    $("listo-descargar").addEventListener("click", () => { if (ultimaFicha) descargar(ultimaFicha); });
    $("jdn-otra").addEventListener("click", otra);
    actualizar();
  }

  // Quien administra ve «El Drive»; cualquier otra persona, el formulario
  // solo. Lo que cada una puede hacer lo decide la función, no esto.
  async function iniciar() {
    try {
      const { data } = await sb.auth.getSession();
      const sesion = data && data.session;
      if (sesion) {
        const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", sesion.user.id).maybeSingle();
        esAdmin = !!(perfil && perfil.is_admin);
      }
    } catch (e) { esAdmin = false; }
    $("loading").classList.add("hidden");
    $("app").classList.remove("hidden");
    armar();
    if (esAdmin) {
      $("caja-drive").hidden = false;
      $("jdn-guardar").textContent = "Guardar en el Drive";
      revisarDrive();
    }
  }

  iniciar();
})();
