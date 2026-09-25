/*
 * La marca de la academia: su logo y su color en el encabezado de la Academia.
 *
 * Quién la ve lo decide public.mi_marca_academia(): quien es de UNA sola
 * academia (miembro o supervisor). Con dos o más se ve Ajedrez Integral, la
 * misma decisión que el remitente de los correos: no hay forma de saber cuál.
 * La excepción es quien SUPERVISA dos o más: las ve de una en una (la
 * «academia activa») y lleva la marca de la que tiene abierta, con la franja
 * para cambiarla (montarSelectorAcademia).
 *
 * El color pinta el FONDO del encabezado, con el nombre en blanco encima. La
 * base solo acepta colores que den 4.5 de contraste contra el blanco
 * (public.color_con_texto_blanco), y la regla se repite acá —contrasteConBlanco()—
 * para que academias.html lo diga antes de guardar.
 *
 * El tema de la plataforma que eligió el alumno MANDA sobre el color de la
 * academia: es su pantalla, igual que su color de casillas le gana al tema.
 * El logo y el nombre sí se ven siempre.
 *
 * La marca se guarda en localStorage con el id de quien la recibió, para
 * pintarla enseguida en la siguiente página en vez de parpadear del azul al
 * color de la academia. Si entra otra cuenta, no se usa.
 *
 * Como la burbuja, se agrega a decenas de páginas que ya funcionaban: todo lo
 * que falle se queda en una línea de consola y el encabezado queda como estaba.
 */
(function () {
  // Se carga dos veces en academias.html (en el <head> y al final): una basta.
  if (typeof window !== "undefined" && window.MarcaAcademia) return;
  var CLAVE = "academia_marca_v1";
  var BUCKET = "academia-marca";

  function luminancia(hex) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }

  /* El contraste del texto blanco sobre ese color, o null si no es un color. */
  function contrasteConBlanco(hex) {
    var l = luminancia(hex);
    return l == null ? null : 1.05 / (l + 0.05);
  }

  function urlDelLogo(path, base) {
    base = base || (typeof window !== "undefined" && window.SUPABASE_URL) || "";
    if (!path || !base) return "";
    return base + "/storage/v1/object/public/" + BUCKET + "/" +
      String(path).split("/").map(encodeURIComponent).join("/");
  }

  function temaElegido() {
    try {
      var t = localStorage.getItem("plataforma_tema_v1");
      return !!t && t !== "clasico";
    } catch (e) { return false; }
  }

  /* Pinta la marca en el encabezado de la Academia (el enlace #marca-enlace
     que pone herramientas/academia-cabecera.py). */
  var original = null;

  function aplicar(marca) {
    var enlace = document.getElementById("marca-enlace");
    var header = document.getElementById("header");
    if (!enlace) return false;
    if (original == null) original = enlace.innerHTML;
    if (!marca || !marca.nombre) {
      // Sin marca vuelve el encabezado de siempre (dejó de ser de esa academia).
      enlace.innerHTML = original;
      delete enlace.dataset.academia;
      if (header) header.style.backgroundColor = "";
      return false;
    }

    var caja = document.createElement("span");
    caja.className = "flex items-center gap-2 min-w-0";
    var logo = urlDelLogo(marca.logo_path);
    if (logo) {
      var img = document.createElement("img");
      img.src = logo;
      // El nombre va escrito al lado: el logo es decoración y no se lee dos veces.
      img.alt = "";
      img.className = "h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg bg-white/95 p-1 shrink-0";
      img.addEventListener("error", function () { img.remove(); });
      caja.appendChild(img);
    } else {
      var pieza = document.createElement("span");
      pieza.className = "text-3xl";
      pieza.setAttribute("aria-hidden", "true");
      pieza.textContent = "♟️";
      caja.appendChild(pieza);
    }
    var nombre = document.createElement("span");
    nombre.className = "font-serif text-lg md:text-2xl font-bold tracking-tight truncate";
    nombre.textContent = marca.nombre;
    caja.appendChild(nombre);
    var sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = " — panel de la Academia";
    caja.appendChild(sr);
    enlace.replaceChildren(caja);
    enlace.dataset.academia = marca.academia_id || "";

    if (header) {
      var c = contrasteConBlanco(marca.color);
      if (c != null && c >= 4.5 && !temaElegido()) header.style.backgroundColor = marca.color;
      else header.style.backgroundColor = "";
    }
    return true;
  }

  function guardada(uid) {
    try {
      var g = JSON.parse(localStorage.getItem(CLAVE) || "null");
      return g && g.uid === uid ? g.marca : undefined;
    } catch (e) { return undefined; }
  }

  function guardar(uid, marca) {
    try { localStorage.setItem(CLAVE, JSON.stringify({ uid: uid, marca: marca || null })); } catch (e) { /* sin almacenamiento, se pide cada vez */ }
  }

  async function init() {
    var sb = window.sb;
    if (!sb || !sb.auth || !document.getElementById("marca-enlace")) return;
    var r = await sb.auth.getSession();
    var sesion = r && r.data && r.data.session;
    if (!sesion) return;
    var uid = sesion.user.id;

    var antes = guardada(uid);
    if (antes) aplicar(antes);

    var pedidos = await Promise.all([sb.rpc("mi_marca_academia"), sb.rpc("mis_academias_supervisadas")]);
    var res = pedidos[0];
    if (!res.error) {
      var fila = Array.isArray(res.data) ? res.data[0] : res.data;
      var marca = fila && fila.nombre ? fila : null;
      guardar(uid, marca);
      if (marca || antes) aplicar(marca);
    }
    var sup = pedidos[1];
    if (!sup.error && Array.isArray(sup.data) && sup.data.length > 1) montarSelectorAcademia(sb, uid, sup.data);
  }

  /* Quien supervisa DOS o más academias las ve de una en una: la «academia
     activa». Quien la acota es la base (interno.academia_activa(): sus
     supervisados, su RLS y sus cuentas salen solo de esa academia); esta
     franja dice cuál es y deja cambiarla. Sin elegir, la base toma la
     primera por nombre, así que nunca hay un «todas juntas» que las mezcle. */
  function montarSelectorAcademia(sb, uid, academias) {
    if (document.getElementById("academia-activa-barra")) return;
    var activa = academias.find(function (a) { return a.activa; }) || academias[0];
    var barra = document.createElement("div");
    barra.id = "academia-activa-barra";
    barra.setAttribute("role", "region");
    barra.setAttribute("aria-label", "Academia que estás viendo");
    barra.className = "bg-brand-100 dark:bg-brand-900 border-b border-brand-200 dark:border-brand-700 text-sm text-brand-800 dark:text-brand-100 px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2";
    var texto = document.createElement("p");
    texto.textContent = "🏫 Estás viendo solo " + (activa.nombre || "esta academia")
      + ": sus profesores, sus alumnos, sus cobros y sus informes.";
    var etiqueta = document.createElement("label");
    etiqueta.setAttribute("for", "academia-activa-sel");
    etiqueta.className = "font-semibold";
    etiqueta.textContent = "Cambiar de academia:";
    var sel = document.createElement("select");
    sel.id = "academia-activa-sel";
    sel.className = "px-2 py-1 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-sm text-brand-800 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    academias.forEach(function (a) {
      var o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.nombre || "Sin nombre";
      sel.appendChild(o);
    });
    sel.value = activa.id;
    sel.addEventListener("change", async function () {
      sel.disabled = true;
      var r = await sb.rpc("elegir_academia_activa", { p_academia: sel.value });
      if (r.error) {
        sel.disabled = false;
        sel.value = activa.id;
        if (window.Avisos) window.Avisos.avisar("No se pudo cambiar de academia: " + r.error.message, { tipo: "error" });
        return;
      }
      // La marca guardada era la de la otra academia: se vuelve a pedir.
      guardar(uid, undefined);
      location.reload();
    });
    barra.append(texto, etiqueta, sel);
    var main = document.querySelector("main") || document.body;
    main.parentNode.insertBefore(barra, main);
  }

  function arrancar() {
    Promise.resolve().then(init).catch(function (e) {
      console.warn("La marca de la academia no se pudo pintar:", e && e.message);
    });
  }

  var api = { contrasteConBlanco: contrasteConBlanco, urlDelLogo: urlDelLogo, aplicar: aplicar, montarSelectorAcademia: montarSelectorAcademia, BUCKET: BUCKET };
  if (typeof window !== "undefined") {
    window.MarcaAcademia = api;
    if (typeof document !== "undefined" && !window.__marcaAcademiaSinArranque) {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
      else arrancar();
    }
  }
  if (typeof module !== "undefined") module.exports = api;
})();
