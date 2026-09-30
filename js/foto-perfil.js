/**
 * La foto de perfil: subirla, quitarla y pintarla donde antes iba la inicial.
 *
 * Las fotos viven en el bucket PRIVADO `fotos-perfil` (son de personas, muchas
 * menores de edad), una carpeta por cuenta. No hay dirección pública: se pide
 * una dirección firmada que dura una hora, y la base solo la da a quien ya
 * puede ver ese perfil (la política de storage pregunta por `profiles`, que
 * pasa por su RLS). Ver «La foto de perfil» en docs/decisiones/permisos-y-roles.md.
 *
 * - `urls(ids)` → Map id → dirección, para pintar una lista. Dos pedidos en
 *   total, no uno por persona: las rutas de `profiles` y las firmas de todas.
 * - Las firmas se guardan en sessionStorage hasta poco antes de vencer: la
 *   misma dirección de página en página deja que el navegador use la foto que
 *   ya bajó, en vez de bajarla otra vez con cada firma nueva.
 * - `pintar(caja, url, inicial)` pone la foto; si no hay, o no carga, la
 *   inicial de siempre. La foto es decoración (alt=""): el nombre va escrito al
 *   lado en todos lados donde se usa.
 * - `subir(uid, archivo)` la recorta en un cuadrado de 320 px y la vuelve a
 *   codificar en el navegador: pesa poco y, de paso, pierde los datos EXIF
 *   (entre ellos, el lugar donde se tomó).
 *
 * Al cambiar, avisa con el evento `foto-perfil:cambio` en window, para que lo
 * que ya estaba pintado en la página se actualice sin recargar.
 */
window.FotoPerfil = (function () {
  "use strict";

  var BUCKET = "fotos-perfil";
  var LADO = 320;
  var DURA = 3600;            // segundos que vale una firma
  var MARGEN = 5 * 60 * 1000; // se pide otra si le quedan menos de 5 minutos
  var CLAVE = "fotos_perfil_firmas_v1";
  var MAX_ORIGINAL = 15 * 1024 * 1024;
  var MAX_FINAL = 300 * 1024; // el límite del bucket

  function cliente() { return window.sb; }

  function leerCache() {
    try { return JSON.parse(sessionStorage.getItem(CLAVE) || "{}") || {}; } catch (e) { return {}; }
  }
  function guardarCache(c) {
    try { sessionStorage.setItem(CLAVE, JSON.stringify(c)); } catch (e) { }
  }

  /* Rutas → direcciones firmadas, con la memoria de la sesión. */
  async function firmar(rutas) {
    var sb = cliente();
    var out = new Map();
    rutas = Array.from(new Set((rutas || []).filter(Boolean)));
    if (!rutas.length || !sb || !sb.storage) return out;
    var cache = leerCache();
    var ahora = Date.now();
    var faltan = [];
    rutas.forEach(function (r) {
      var c = cache[r];
      if (c && c.u && c.e - MARGEN > ahora) out.set(r, c.u);
      else faltan.push(r);
    });
    if (faltan.length) {
      var firmadas = await enCola(faltan);
      faltan.forEach(function (r) { if (firmadas.has(r)) out.set(r, firmadas.get(r)); });
    }
    return out;
  }

  /* Lo que se pide en el mismo momento sale en UN pedido: una tabla que pinta
     cada fila por su cuenta (admin.js) no hace cincuenta viajes. */
  var cola = null;
  function enCola(rutas) {
    if (!cola) {
      var esta = cola = { rutas: new Set() };
      esta.promesa = Promise.resolve().then(function () {
        cola = null;
        return firmarYa(Array.from(esta.rutas));
      });
    }
    rutas.forEach(function (r) { cola.rutas.add(r); });
    return cola.promesa;
  }
  async function firmarYa(rutas) {
    var out = new Map();
    var ahora = Date.now();
    try {
      var res = await cliente().storage.from(BUCKET).createSignedUrls(rutas, DURA);
      var cache = leerCache();
      (res && res.data || []).forEach(function (f) {
        if (!f || f.error || !f.signedUrl || !f.path) return;
        out.set(f.path, f.signedUrl);
        cache[f.path] = { u: f.signedUrl, e: ahora + DURA * 1000 };
      });
      // Lo vencido se va, para que la memoria no crezca sin fin.
      Object.keys(cache).forEach(function (k) { if (!cache[k] || cache[k].e <= ahora) delete cache[k]; });
      guardarCache(cache);
    } catch (e) {
      console.warn("No se pudieron pedir las fotos:", e && e.message);
    }
    return out;
  }

  /* ids de personas → Map id → dirección (solo las que tienen foto y se
     pueden ver). `conocidas` es opcional: {id: foto_path} que la página ya
     tiene, para no volver a pedírselas a la base. */
  async function urls(ids, conocidas) {
    var sb = cliente();
    var out = new Map();
    ids = Array.from(new Set((ids || []).filter(Boolean)));
    if (!ids.length || !sb) return out;
    var rutaDe = new Map();
    var pedir = [];
    ids.forEach(function (id) {
      if (conocidas && Object.prototype.hasOwnProperty.call(conocidas, id)) {
        if (conocidas[id]) rutaDe.set(id, conocidas[id]);
      } else pedir.push(id);
    });
    // De cien en cien: un .in() largo no cabe en la dirección del pedido.
    for (var i = 0; i < pedir.length; i += 100) {
      try {
        var r = await sb.from("profiles").select("id, foto_path").in("id", pedir.slice(i, i + 100));
        (r && r.data || []).forEach(function (p) { if (p.foto_path) rutaDe.set(p.id, p.foto_path); });
      } catch (e) {
        console.warn("No se pudieron leer las fotos:", e && e.message);
      }
    }
    var firmas = await firmar(Array.from(rutaDe.values()));
    rutaDe.forEach(function (ruta, id) { if (firmas.has(ruta)) out.set(id, firmas.get(ruta)); });
    return out;
  }

  /* Para las pantallas que se vuelven a pintar a cada rato (la clase en vivo
     repinta la lista de conectados con cada latido de presencia): la
     dirección de cada persona se recuerda en la página, así repintar no pide
     nada y la foto sale en el mismo instante, sin parpadear con la inicial.
     Los ids pedidos en el mismo momento salen en UNA lectura de profiles. */
  var memoria = new Map();   // id -> Promise<dirección | "">
  var resueltas = new Map(); // id -> dirección | "" (ya llegó)
  var colaIds = null;
  function direccionDe(id) {
    if (memoria.has(id)) return memoria.get(id);
    if (!colaIds) {
      var esta = colaIds = { ids: new Set() };
      esta.promesa = Promise.resolve().then(function () {
        colaIds = null;
        return urls(Array.from(esta.ids));
      });
    }
    colaIds.ids.add(id);
    var p = colaIds.promesa.then(function (m) {
      var u = m.get(id) || "";
      resueltas.set(id, u);
      return u;
    }, function () { memoria.delete(id); return ""; });
    memoria.set(id, p);
    return p;
  }
  function olvidarDe(id) { memoria.delete(id); resueltas.delete(id); }

  /* Pone en `caja` la foto de la persona `id` (o su inicial mientras llega, y
     si no tiene). Devuelve la promesa de que quedó pintada. */
  function poner(caja, id, nombre) {
    if (!caja) return Promise.resolve();
    if (!id) { pintar(caja, "", nombre); return Promise.resolve(); }
    caja.dataset.fotoDe = id;
    if (resueltas.has(id)) { pintar(caja, resueltas.get(id), nombre); return Promise.resolve(); }
    pintar(caja, "", nombre);
    return direccionDe(id).then(function (u) {
      // Si mientras tanto la caja pasó a ser de otra persona, no se toca.
      if (u && caja.dataset.fotoDe === id) pintar(caja, u, nombre);
    });
  }

  /* Una caja redonda nueva, lista para poner(): la foto es decoración
     (aria-hidden) porque el nombre siempre va escrito al lado. `clases` da el
     tamaño y el color de fondo de la inicial. */
  function avatar(id, nombre, clases) {
    var caja = document.createElement("span");
    caja.setAttribute("aria-hidden", "true");
    caja.className = (clases || "w-7 h-7 text-xs") +
      " rounded-full bg-brand-700 text-white flex items-center justify-center font-bold shrink-0 overflow-hidden";
    poner(caja, id, nombre);
    return caja;
  }

  async function url(id, ruta) {
    var c = {};
    if (ruta !== undefined) c[id] = ruta;
    return (await urls([id], ruta !== undefined ? c : null)).get(id) || "";
  }

  /* La foto dentro de la caja redonda del avatar; sin foto, la inicial.
     La inicial NO va como texto: va en data-inicial y la dibuja el CSS
     (before:content-[attr(data-inicial)]). Como texto se colaba en el
     textContent de lo que la rodea —«BTu profe le dio la palabra a Beto»—,
     que es lo que se copia y lo que leen otras partes de la página. */
  var CLASE_INICIAL = "before:content-[attr(data-inicial)]";
  function pintar(caja, direccion, inicial) {
    if (!caja) return;
    var letra = String(inicial || "").trim().charAt(0).toUpperCase();
    var ponerLetra = function () { caja.textContent = ""; caja.dataset.inicial = letra; };
    caja.classList.add("overflow-hidden", CLASE_INICIAL);
    if (!direccion) { ponerLetra(); return; }
    caja.textContent = "";
    delete caja.dataset.inicial;
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.className = "w-full h-full object-cover";
    img.addEventListener("error", ponerLetra, { once: true });
    img.src = direccion;
    caja.appendChild(img);
  }

  function azar() {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, function (x) { return (x % 36).toString(36); }).join("");
  }

  function cargarImagen(archivo) {
    if (window.createImageBitmap) {
      return createImageBitmap(archivo, { imageOrientation: "from-image" })
        .catch(function () { return createImageBitmap(archivo); });
    }
    return new Promise(function (ok, mal) {
      var u = URL.createObjectURL(archivo);
      var im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); ok(im); };
      im.onerror = function () { URL.revokeObjectURL(u); mal(new Error("imagen")); };
      im.src = u;
    });
  }

  /* Archivo elegido → JPEG cuadrado de 320 px, recortado al centro. */
  async function preparar(archivo) {
    if (!archivo || !/^image\//.test(archivo.type || "")) {
      throw new Error("Elige una imagen (JPG, PNG o WebP).");
    }
    if (archivo.size > MAX_ORIGINAL) throw new Error("Esa imagen pesa demasiado. Elige una de menos de 15 MB.");
    var im;
    try { im = await cargarImagen(archivo); }
    catch (e) { throw new Error("No se pudo abrir esa imagen. Prueba con otra (JPG o PNG)."); }
    var ancho = im.width, alto = im.height;
    if (!ancho || !alto) throw new Error("No se pudo abrir esa imagen. Prueba con otra (JPG o PNG).");
    var lado = Math.min(ancho, alto);
    var lienzo = document.createElement("canvas");
    lienzo.width = LADO; lienzo.height = LADO;
    var ctx = lienzo.getContext("2d");
    // Fondo blanco: un PNG transparente en JPEG quedaría negro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LADO, LADO);
    ctx.drawImage(im, (ancho - lado) / 2, (alto - lado) / 2, lado, lado, 0, 0, LADO, LADO);
    if (im.close) im.close();
    var calidades = [0.86, 0.75, 0.6];
    for (var i = 0; i < calidades.length; i++) {
      var blob = await new Promise(function (ok) { lienzo.toBlob(ok, "image/jpeg", calidades[i]); });
      if (blob && blob.size <= MAX_FINAL) return blob;
    }
    throw new Error("No se pudo achicar esa imagen. Prueba con otra.");
  }

  function avisarCambio(id, ruta) {
    olvidarDe(id);
    if (window.MiPerfil && window.MiPerfil.olvidar) window.MiPerfil.olvidar();
    try { window.dispatchEvent(new CustomEvent("foto-perfil:cambio", { detail: { id: id, ruta: ruta || null } })); } catch (e) { }
  }

  /* Sube la foto, la guarda en el perfil (con la versión de la política que se
     aceptó) y borra la anterior. Devuelve la ruta nueva. */
  async function subir(uid, archivo, rutaVieja) {
    var sb = cliente();
    var version = window.LegalVersion && window.LegalVersion.PRIVACIDAD;
    var blob = await preparar(archivo);
    var ruta = uid + "/foto-" + azar() + ".jpg";
    var carpeta = sb.storage.from(BUCKET);
    var sub = await carpeta.upload(ruta, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    if (sub.error) throw new Error("La foto no se pudo subir: " + sub.error.message);
    var g = await sb.rpc("guardar_mi_foto", { p_ruta: ruta, p_version_privacidad: version });
    if (g.error || g.data !== ruta) {
      await carpeta.remove([ruta]).catch(function () { });
      throw new Error((g.error && g.error.message) || "La foto no quedó guardada. Vuelve a intentarlo.");
    }
    if (rutaVieja && rutaVieja !== ruta) await carpeta.remove([rutaVieja]).catch(function () { });
    avisarCambio(uid, ruta);
    return ruta;
  }

  /* Quita la foto (la propia, o cualquiera si administra) y borra el archivo. */
  async function quitar(persona) {
    var sb = cliente();
    var q = await sb.rpc("quitar_foto", { p_persona: persona });
    if (q.error) throw new Error(q.error.message);
    if (q.data) await sb.storage.from(BUCKET).remove([q.data]).catch(function () { });
    avisarCambio(persona, null);
  }

  return { BUCKET: BUCKET, urls: urls, url: url, firmar: firmar, pintar: pintar, poner: poner, avatar: avatar, preparar: preparar, subir: subir, quitar: quitar };
})();
