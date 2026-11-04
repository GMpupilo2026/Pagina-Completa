/* El código de inscripcion-metropolitano.html: la inscripción pública (sin
 * cuenta) al XLVII Torneo Internacional Metropolitano 2026 de la FCA.
 *
 * Se inscriben jugadores, entrenadores y acompañantes, de a uno o en GRUPO:
 * en la de grupo, un delegado llena primero sus datos y después agrega a
 * cada persona, en el mismo formulario y con un solo pago. Cada persona es
 * una tarjeta (`Persona`, abajo) con lo suyo:
 *   - el ID FIDE (jugadores; el entrenador si tiene): mientras escribe el
 *     nombre o el ID se busca en la lista de FIDE —por la Edge Function
 *     `pareo-listas-elo`, la misma de Pareo Integral, porque ratings.fide.com
 *     no deja leerse desde el navegador— y toca su nombre. Eso llena el ID, la
 *     federación, el título y los tres Elo. Sin ID FIDE, se piden los datos
 *     para tramitarlo;
 *   - en qué torneo juega: se habilitan los que puede según su Elo estándar y
 *     su año de nacimiento (js/metropolitano-reglas.js); si puede varios, elige;
 *   - logística, condición, foto tamaño pasaporte y el permiso (aparte, no
 *     obligatorio) para usar su nombre y su foto en la publicidad.
 * «Revisar la inscripción» enseña el GAFETE de cada persona
 * (js/metropolitano-gafete.js) con su resumen, y quien inscribe confirma.
 * Recién ahí se suben los archivos y se manda todo junto a
 * public.metropolitano_inscribir(), que vuelve a comprobar y calcular todo y
 * guarda a todo el grupo o a nadie.
 *
 * Lo que se decide acá es cortesía; quien decide es la base. Ver «La
 * inscripción del Metropolitano 2026» en docs/decisiones/cuentas-y-formularios.md.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const R = window.MetropolitanoReglas;
  const BUCKET = "metropolitano-2026";
  const hoy = window.HoraCR.hoy();
  const plazo = R.abierto(hoy);
  const ROJO = "text-red-700 dark:text-red-400";
  const CLASE_CAMPO = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2.5 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const estilar = (raiz) => raiz.querySelectorAll("[data-campo]").forEach((el) => { el.className = CLASE_CAMPO; });
  estilar(document);

  /* ===================== El plazo ===================== */
  if (!plazo.blitz) {
    $("formulario").classList.add("hidden");
    $("cerrado").classList.remove("hidden");
    return;
  }
  $("aviso-plazo").textContent = !plazo.clasicos
    ? "Los torneos clásicos ya cerraron (el 20 de diciembre). Todavía se reciben jugadores para el blitz, hasta el 26 de diciembre."
    : plazo.recargo
      ? "La inscripción regular cerró el 16 de diciembre: hasta el 20, los clásicos llevan el 30 % de recargo de las bases."
      : "La inscripción regular cierra el 16 de diciembre; del 17 al 20 lleva un 30 % de recargo. El blitz se recibe hasta el 26.";

  /* ===================== Países ===================== */
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "region" });
    const nombres = new Set();
    Object.values(window.GafetesBanderas.FIDE).forEach((iso) => {
      if (iso.length !== 2) return;
      const n = dn.of(iso.toUpperCase());
      if (n && n.toUpperCase() !== iso.toUpperCase()) nombres.add(n);
    });
    [...nombres].sort((a, b) => a.localeCompare(b, "es")).forEach((n) => {
      const o = document.createElement("option"); o.value = n; $("paises").append(o);
    });
  } catch (e) { /* sin la lista, se escribe a mano */ }

  // Las federaciones de FIDE, con el nombre del país que sabe decir el navegador.
  const FEDERACIONES = (() => {
    let dn = null;
    try { dn = new Intl.DisplayNames(["es"], { type: "region" }); } catch (e) { /* sin nombres */ }
    return Object.entries(window.GafetesBanderas.FIDE).map(([cod, iso]) => {
      let n = cod;
      try { if (dn && iso.length === 2) n = dn.of(iso.toUpperCase()) || cod; } catch (e) { /* el código */ }
      return [cod, ({ ENG: "Inglaterra", SCO: "Escocia", WLS: "Gales" })[cod] || n];
    }).sort((a, b) => a[1].localeCompare(b[1], "es"));
  })();
  const AST = ' <span class="text-red-700 dark:text-red-400" aria-hidden="true">*</span>';
  const NOMBRE_DOC = { cedula: "Cédula", dimex: "DIMEX", pasaporte: "Pasaporte", otro: "Documento" };
  const fechaLarga = (d) => (d ? window.HoraCR.fecha(d + "T12:00:00-06:00", { day: "numeric", month: "long", year: "numeric" }) : "");
  const cacheFide = new Map();

  /* ===================== Una persona: su tarjeta ===================== */
  let siguiente = 0;
  const personas = [];
  const esGrupo = () => document.querySelector('input[name="modo"]:checked').value === "grupo";

  /* El HTML de la tarjeta es fijo: lo único que cambia es `k`, el prefijo de
     los id que arma esta página («p1», «p2»…). Ningún dato que escribe una
     persona entra por acá; los valores se ponen después, con .value y
     textContent. */
  function plantilla(k) {
    const id = (x) => k + "-" + x;
    return `
      <header class="px-4 py-3 flex items-center gap-3">
        <span class="font-semibold grow" data-titulo></span>
        <button type="button" data-quitar class="hidden text-sm underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded">Quitar</button>
      </header>
      <div class="p-4 sm:p-5 space-y-6">
        <div><label for="${id("rol")}" class="block text-sm font-semibold mb-1">Se inscribe como${AST}</label><select id="${id("rol")}" data-campo data-rol></select></div>

        <div data-bloque-fide class="space-y-3">
          <p class="font-semibold" data-fide-pregunta>ID FIDE</p>
          <div class="flex flex-wrap gap-4"><label class="flex items-center gap-2"><input type="radio" name="${id("fide")}" value="si" checked> Tiene ID FIDE</label><label class="flex items-center gap-2"><input type="radio" name="${id("fide")}" value="no"> No tiene ID FIDE</label></div>
          <div data-caja-fide class="space-y-3">
            <div><label for="${id("buscar")}" class="block text-sm font-semibold mb-1">Escribe el nombre (apellido primero) o el ID FIDE${AST}</label>
              <input id="${id("buscar")}" data-campo data-buscar type="search" autocomplete="off" placeholder="Ejemplo: Mora, Ana  —  o  6400000" aria-describedby="${id("buscar-ayuda")}">
              <p id="${id("buscar-ayuda")}" class="text-xs text-brand-500 dark:text-brand-300 mt-1">Buscamos en la lista oficial de FIDE mientras escribes. Toca el nombre para elegirlo.</p></div>
            <p data-estado-fide class="text-sm" role="status" aria-live="polite"></p>
            <ul data-resultados class="space-y-2" aria-label="Jugadores encontrados en la lista de FIDE"></ul>
            <div data-elegido class="hidden rounded-xl border-2 border-accent-500 bg-accent-50 dark:bg-brand-950 p-4" tabindex="-1" aria-live="polite"></div>
          </div>
          <div data-sin-fide class="hidden rounded-xl bg-brand-50 dark:bg-brand-950 p-4 text-sm text-brand-700 dark:text-brand-200 space-y-3">
            <div><label for="${id("fed")}" class="block text-sm font-semibold mb-1">¿De qué país es su federación?${AST}</label><select id="${id("fed")}" data-campo data-federacion></select></div>
            <p data-fed-cr><strong>Es de Costa Rica: la FCA le tramita el ID FIDE</strong> con su nombre completo, cédula, fecha de nacimiento y correo, que se llenan abajo. Sin ID FIDE juega el Metropolitano B, el U14 o el blitz.</p>
            <p data-fed-fuera class="hidden font-semibold ${ROJO}">Para jugar necesita ID FIDE, y fuera de Costa Rica lo tramita su propia federación, no la FCA. Escríbale cuanto antes a su federación para que se lo pida a FIDE; la inscripción se puede mandar ya, y el ID se agrega cuando lo tenga.</p>
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-4">
          <div><label for="${id("nombre")}" class="block text-sm font-semibold mb-1">Nombre(s)${AST}</label><input id="${id("nombre")}" data-campo data-c="nombre" maxlength="80" autocomplete="off"></div>
          <div><label for="${id("apellidos")}" class="block text-sm font-semibold mb-1">Apellidos${AST}</label><input id="${id("apellidos")}" data-campo data-c="apellidos" maxlength="80" autocomplete="off"></div>
          <div><label for="${id("nacimiento")}" class="block text-sm font-semibold mb-1">Fecha de nacimiento${AST}</label><input id="${id("nacimiento")}" data-campo data-c="nacimiento" type="date" min="1920-01-01" max="2022-12-31"><p data-aviso-nac class="text-xs mt-1 ${ROJO}" aria-live="polite"></p></div>
          <div><label for="${id("sexo")}" class="block text-sm font-semibold mb-1">Sexo${AST}</label><select id="${id("sexo")}" data-campo data-c="sexo"><option value="">Elige…</option><option value="f">Femenino</option><option value="m">Masculino</option></select></div>
          <div><label for="${id("nacionalidad")}" class="block text-sm font-semibold mb-1">Nacionalidad${AST}</label><input id="${id("nacionalidad")}" data-campo data-c="nacionalidad" list="paises" maxlength="60" value="Costa Rica"></div>
          <div><label for="${id("pais")}" class="block text-sm font-semibold mb-1">País donde vive${AST}</label><input id="${id("pais")}" data-campo data-c="pais_residencia" list="paises" maxlength="60" value="Costa Rica"></div>
          <div><label for="${id("doctipo")}" class="block text-sm font-semibold mb-1">Documento de identidad${AST}</label><select id="${id("doctipo")}" data-campo data-c="documento_tipo"><option value="cedula">Cédula de Costa Rica</option><option value="dimex">DIMEX (residente en Costa Rica)</option><option value="pasaporte">Pasaporte</option><option value="otro">Documento de identidad de otro país</option></select></div>
          <div><label for="${id("doc")}" class="block text-sm font-semibold mb-1">Número de documento${AST}</label><input id="${id("doc")}" data-campo data-c="documento" maxlength="30" placeholder="1-2345-0678"></div>
          <div><label for="${id("correo")}" class="block text-sm font-semibold mb-1">Correo electrónico<span data-ast-contacto>${AST}</span></label><input id="${id("correo")}" data-campo data-c="correo" type="email" maxlength="120"></div>
          <div><label for="${id("tel")}" class="block text-sm font-semibold mb-1">Teléfono o WhatsApp, con el código del país<span data-ast-contacto>${AST}</span></label><input id="${id("tel")}" data-campo data-c="telefono" type="tel" maxlength="25" placeholder="+506 8888 1234"></div>
          <div class="sm:col-span-2"><label for="${id("club")}" class="block text-sm font-semibold mb-1">Club, academia o colegio</label><input id="${id("club")}" data-campo data-c="club" maxlength="100"></div>
        </div>
        <p data-nota-contacto class="hidden text-xs text-brand-500 dark:text-brand-300">En un grupo, el correo y el teléfono de cada integrante son opcionales: la organización le escribe al delegado.</p>

        <div data-caja-responsable class="hidden rounded-xl border border-brand-200 dark:border-brand-700 p-4 space-y-3">
          <p class="font-semibold">Es menor de edad: su madre, padre o la persona responsable en el torneo</p>
          <div class="grid sm:grid-cols-2 gap-4">
            <div><label for="${id("rnom")}" class="block text-sm font-semibold mb-1">Nombre completo${AST}</label><input id="${id("rnom")}" data-campo data-c="resp_nombre" maxlength="100"></div>
            <div><label for="${id("rpar")}" class="block text-sm font-semibold mb-1">Parentesco</label><input id="${id("rpar")}" data-campo data-c="resp_parentesco" maxlength="40" placeholder="Madre, padre, entrenador…"></div>
            <div><label for="${id("rdoc")}" class="block text-sm font-semibold mb-1">Documento</label><input id="${id("rdoc")}" data-campo data-c="resp_documento" maxlength="30"></div>
            <div><label for="${id("rtel")}" class="block text-sm font-semibold mb-1">Teléfono${AST}</label><input id="${id("rtel")}" data-campo data-c="resp_telefono" type="tel" maxlength="25"></div>
          </div>
        </div>

        <div class="rounded-xl border border-brand-200 dark:border-brand-700 p-4 space-y-3">
          <p class="font-semibold">Contacto para una emergencia</p>
          <div class="grid sm:grid-cols-3 gap-4">
            <div><label for="${id("enom")}" class="block text-sm font-semibold mb-1">Nombre${AST}</label><input id="${id("enom")}" data-campo data-c="emer_nombre" maxlength="100"></div>
            <div><label for="${id("epar")}" class="block text-sm font-semibold mb-1">Parentesco</label><input id="${id("epar")}" data-campo data-c="emer_parentesco" maxlength="40"></div>
            <div><label for="${id("etel")}" class="block text-sm font-semibold mb-1">Teléfono${AST}</label><input id="${id("etel")}" data-campo data-c="emer_telefono" type="tel" maxlength="25"></div>
          </div>
        </div>

        <div data-bloque-torneos class="space-y-3">
          <p class="font-semibold">En qué torneo juega</p>
          <p class="text-sm text-brand-600 dark:text-brand-300">Se habilitan los que puede jugar según su Elo FIDE estándar y su fecha de nacimiento. A, B y U14 se juegan a la vez: se elige uno. El blitz se suma aparte.</p>
          <div data-clasicos class="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Torneo clásico"></div>
          <label class="metro-opcion"><input type="checkbox" data-blitz class="mt-1 h-5 w-5"><span><span class="font-semibold block">Sumar el Metropolitano Blitz</span><span class="text-sm text-brand-600 dark:text-brand-300">3 min + 2 s · 30 de diciembre, 16:00 · abierto a todos</span></span></label>
        </div>

        <div class="space-y-4">
          <p class="font-semibold">Viaje, hospedaje y alimentación</p>
          <div class="grid sm:grid-cols-3 gap-4">
            <div><label for="${id("lleg")}" class="block text-sm font-semibold mb-1">Día de llegada</label><input id="${id("lleg")}" data-campo data-c="llegada" type="date" min="2026-12-15" max="2027-01-05"></div>
            <div><label for="${id("sal")}" class="block text-sm font-semibold mb-1">Día de salida</label><input id="${id("sal")}" data-campo data-c="salida" type="date" min="2026-12-15" max="2027-01-05"></div>
            <div><label for="${id("vuelo")}" class="block text-sm font-semibold mb-1">Vuelo o medio de llegada</label><input id="${id("vuelo")}" data-campo data-c="vuelo" maxlength="60" placeholder="AV 123, 14:30"></div>
          </div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-c="traslado"> Necesita traslado del aeropuerto</label>
          <div class="flex flex-wrap items-center gap-4"><span class="text-sm font-semibold">¿Necesita hospedaje?</span><label class="flex items-center gap-2"><input type="radio" name="${id("hosp")}" value="no" checked> No</label><label class="flex items-center gap-2"><input type="radio" name="${id("hosp")}" value="si"> Sí</label></div>
          <div data-caja-hosp class="hidden grid sm:grid-cols-2 gap-4">
            <div><label for="${id("hdes")}" class="block text-sm font-semibold mb-1">Desde (noche de llegada)${AST}</label><input id="${id("hdes")}" data-campo data-c="hospedaje_desde" type="date" min="2026-12-20" max="2027-01-02" value="2026-12-25"></div>
            <div><label for="${id("hhas")}" class="block text-sm font-semibold mb-1">Hasta (día de salida)${AST}</label><input id="${id("hhas")}" data-campo data-c="hospedaje_hasta" type="date" min="2026-12-21" max="2027-01-03" value="2026-12-31"></div>
            <div><label for="${id("hab")}" class="block text-sm font-semibold mb-1">Habitación</label><select id="${id("hab")}" data-campo data-c="habitacion"><option value="individual">Individual</option><option value="doble">Doble</option><option value="compartida">Compartida con su grupo</option></select></div>
            <div><label for="${id("acomp")}" class="block text-sm font-semibold mb-1">Acompañantes que no se inscriben aparte</label><input id="${id("acomp")}" data-campo data-c="acompanantes" type="number" min="0" max="6" value="0"></div>
          </div>
          <div class="flex flex-wrap items-center gap-4"><span class="text-sm font-semibold">Alimentación:</span>
            <label class="flex items-center gap-2"><input type="checkbox" data-comida value="desayuno"> Desayuno</label>
            <label class="flex items-center gap-2"><input type="checkbox" data-comida value="almuerzo"> Almuerzo</label>
            <label class="flex items-center gap-2"><input type="checkbox" data-comida value="cena"> Cena</label></div>
          <p class="text-xs text-brand-500 dark:text-brand-300">Si no se marca ninguna, queda como «no requiere alimentación». El hospedaje y la alimentación son una solicitud: la organización confirma la disponibilidad y el costo por correo (a los GM, IM y WGM se les dan sin costo, como dicen las bases).</p>
          <div data-caja-comidas class="hidden grid sm:grid-cols-2 gap-4">
            <div><label for="${id("cdes")}" class="block text-sm font-semibold mb-1">Desde${AST}</label><input id="${id("cdes")}" data-campo data-c="comidas_desde" type="date" min="2026-12-20" max="2027-01-03" value="2026-12-26"></div>
            <div><label for="${id("chas")}" class="block text-sm font-semibold mb-1">Hasta${AST}</label><input id="${id("chas")}" data-campo data-c="comidas_hasta" type="date" min="2026-12-20" max="2027-01-03" value="2026-12-30"></div>
            <div class="sm:col-span-2"><label for="${id("dieta")}" class="block text-sm font-semibold mb-1">Dieta especial o alergias</label><input id="${id("dieta")}" data-campo data-c="dieta" maxlength="300" placeholder="Vegetariana, sin gluten, alergia a los mariscos…"></div>
          </div>
        </div>

        <div class="space-y-2">
          <p class="font-semibold">Condición y accesibilidad</p>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" data-condicion value="sordo" class="mt-1"> <span>Atleta sordo (opta por el premio de mejor atleta sordo del Metropolitano B)</span></label>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" data-condicion value="ciego" class="mt-1"> <span>Atleta ciego o de baja visión (opta por el premio de mejor atleta ciego o de baja visión)</span></label>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" data-condicion value="silla" class="mt-1"> <span>Usa silla de ruedas o necesita una mesa accesible</span></label>
          <p data-aviso-condicion class="hidden text-xs text-brand-600 dark:text-brand-300">Para optar por esos premios hay que estar validado antes por la asociación: sordos, adas.costarica@gmail.com (8333-2510, solo texto o video en LESCO); ciegos y baja visión, ADAES, adaescr@gmail.com (6021-0579).</p>
          <div><label for="${id("acc")}" class="block text-sm font-semibold mb-1">¿Algo más que necesite? (tablero para ciegos, intérprete, otra)</label><input id="${id("acc")}" data-campo data-c="accesibilidad" maxlength="300"></div>
        </div>

        <div class="space-y-2">
          <p class="font-semibold">Foto tamaño pasaporte${AST}</p>
          <p class="text-sm text-brand-600 dark:text-brand-300">De frente, de los hombros hacia arriba, con fondo claro y sin lentes oscuros ni gorra. Va en el gafete.</p>
          <label for="${id("foto")}" class="metro-boton inline-block cursor-pointer">📷 Elegir la foto<input id="${id("foto")}" data-foto type="file" accept="image/*" class="sr-only"></label>
          <ul data-foto-lista class="flex flex-wrap gap-3"></ul>
          <p data-foto-estado class="text-xs text-brand-500 dark:text-brand-300" aria-live="polite"></p>
        </div>

        <label class="flex items-start gap-3 rounded-xl bg-brand-50 dark:bg-brand-950 p-4 text-sm"><input type="checkbox" data-c="acepta_publicidad" class="mt-1 h-4 w-4 shrink-0"> <span><strong>Permiso para publicidad (opcional):</strong> <span data-texto-publicidad></span></span></label>
      </div>`;
  }

  function Persona(opciones) {
    const k = "p" + (++siguiente);
    const el = document.createElement("section");
    el.className = "metro-persona";
    el.innerHTML = plantilla(k);
    estilar(el);
    const q = (s) => el.querySelector(s);
    const c = (nombre) => el.querySelector('[data-c="' + nombre + '"]');
    const yo = { el, k, esDelegado: !!opciones.esDelegado, elegido: null, clasico: null, tocado: false, foto: null, fotoImg: null, codigo: null };

    // Los roles que puede tener esta tarjeta.
    const roles = yo.esDelegado ? ["delegado", "jugador", "entrenador"] : ["jugador", "entrenador", "acompanante"];
    const selRol = q("[data-rol]");
    roles.forEach((r) => {
      const o = document.createElement("option"); o.value = r;
      o.textContent = r === "delegado" ? "Delegado (no juega)" : r === "jugador" && yo.esDelegado ? "Delegado que también juega" : r === "entrenador" && yo.esDelegado ? "Delegado y entrenador" : R.ROLES[r].nombre;
      selRol.append(o);
    });
    selRol.value = roles.includes(opciones.rol) ? opciones.rol : roles[0];
    yo.rol = () => selRol.value;

    const sinFide = () => el.querySelector('input[name="' + k + '-fide"]:checked').value === "no";
    yo.sinFide = sinFide;
    const hospeda = () => el.querySelector('input[name="' + k + '-hosp"]:checked').value === "si";
    const comidas = () => [...el.querySelectorAll("[data-comida]:checked")].map((x) => x.value);
    const condicion = () => [...el.querySelectorAll("[data-condicion]:checked")].map((x) => x.value);
    const v = (n) => { const x = c(n); return x ? String(x.value || "").trim() : ""; };
    yo.v = v;

    /* ---------- la federación de quien no tiene ID FIDE ---------- */
    const selFed = q("[data-federacion]");
    FEDERACIONES.forEach(([cod, nombre]) => { const o = document.createElement("option"); o.value = cod; o.textContent = nombre + " (" + cod + ")"; selFed.append(o); });
    selFed.value = "CRC";

    /* ---------- el ID FIDE ---------- */
    let espera = null, turno = 0;
    const buscarEl = q("[data-buscar]");
    buscarEl.addEventListener("input", () => {
      clearTimeout(espera);
      const t = buscarEl.value.replace(/\s+/g, " ").trim();
      if (t.length < 3) { q("[data-resultados]").textContent = ""; q("[data-estado-fide]").textContent = t ? "Escribe al menos 3 letras." : ""; return; }
      q("[data-estado-fide]").textContent = "Buscando en la lista de FIDE…";
      espera = setTimeout(() => buscar(t), 650);
    });
    buscarEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { const b = q("[data-resultados] button"); if (b) { e.preventDefault(); b.focus(); } }
      if (e.key === "Enter") e.preventDefault();
    });
    async function buscar(t) {
      const mio = ++turno;
      let r = cacheFide.get(t.toLowerCase());
      if (!r) { r = await window.PareoEloNacional.buscarEnLista("fide", t); if (r && r.ok) cacheFide.set(t.toLowerCase(), r); }
      if (mio !== turno) return;
      const lista = q("[data-resultados]"), est = q("[data-estado-fide]");
      lista.textContent = "";
      if (!r || !r.ok) { est.textContent = (r && r.error) || "No se pudo buscar en FIDE. Revisa la conexión e intenta de nuevo."; return; }
      if (!r.filas.length) { est.textContent = "No aparece con ese nombre. Prueba solo con el primer apellido, o con el ID FIDE. Si no tiene, marca «No tiene ID FIDE»."; return; }
      est.textContent = r.filas.length === 1 ? "1 jugador encontrado. Tócalo para elegirlo."
        : r.filas.length + " jugadores encontrados" + (r.hayMas ? " (hay más: escribe más del nombre)" : "") + ". Toca el que es.";
      r.filas.forEach((f) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "w-full text-left rounded-xl border border-brand-200 dark:border-brand-700 hover:border-accent-500 hover:bg-accent-50 dark:hover:bg-brand-800 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        const n = document.createElement("span"); n.className = "block font-semibold"; n.textContent = (f.titulo ? f.titulo + " " : "") + f.nombre;
        const d = document.createElement("span"); d.className = "block text-xs text-brand-600 dark:text-brand-300";
        d.textContent = [f.fed, "ID " + f.fideId, f.nacimiento ? "nacido en " + f.nacimiento : null,
          "Estándar " + (f.estandar || "sin Elo"), "Rápido " + (f.rapido || "—"), "Blitz " + (f.blitz || "—")].filter(Boolean).join(" · ");
        b.append(n, d);
        b.addEventListener("click", () => elegir(f));
        b.addEventListener("keydown", (e) => {
          const todos = [...lista.querySelectorAll("button")], i = todos.indexOf(b);
          if (e.key === "ArrowDown" && todos[i + 1]) { e.preventDefault(); todos[i + 1].focus(); }
          if (e.key === "ArrowUp") { e.preventDefault(); (todos[i - 1] || buscarEl).focus(); }
        });
        li.append(b); lista.append(li);
      });
    }
    function elegir(f) {
      yo.elegido = f;
      q("[data-resultados]").textContent = ""; q("[data-estado-fide]").textContent = "";
      buscarEl.value = f.fideId;
      const [ap, no] = String(f.nombre).split(",").map((x) => (x || "").trim());
      if (no) { c("nombre").value = no; c("apellidos").value = ap; } else if (!c("apellidos").value) c("apellidos").value = ap;
      pintarElegido(); recalcular();
      q("[data-elegido]").focus();
    }
    function pintarElegido() {
      const caja = q("[data-elegido]"), f = yo.elegido;
      caja.textContent = ""; caja.classList.toggle("hidden", !f);
      if (!f) return;
      const t = document.createElement("p"); t.className = "font-bold text-brand-800 dark:text-white";
      t.textContent = "✓ Elegido: " + (f.titulo ? f.titulo + " " : "") + f.nombre;
      const d = document.createElement("p"); d.className = "text-sm mt-1";
      d.textContent = "ID FIDE " + f.fideId + " · " + f.fed + (f.nacimiento ? " · nacido en " + f.nacimiento : "")
        + " · Elo estándar " + (f.estandar || "sin Elo") + ", rápido " + (f.rapido || "—") + ", blitz " + (f.blitz || "—");
      const b = document.createElement("button"); b.type = "button";
      b.className = "mt-2 text-sm underline font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
      b.textContent = "No es esta persona: buscar otra vez";
      b.addEventListener("click", () => { yo.elegido = null; pintarElegido(); recalcular(); buscarEl.value = ""; buscarEl.focus(); });
      caja.append(t, d, b);
    }
    el.querySelectorAll('input[name="' + k + '-fide"]').forEach((r) => r.addEventListener("change", () => {
      if (sinFide()) { yo.elegido = null; pintarElegido(); }
      recalcular();
    }));

    /* ---------- torneos, edad y lo que se ve según el rol ---------- */
    const eloEstandar = () => (sinFide() || !yo.elegido ? null : yo.elegido.estandar || null);
    yo.titulo = () => (sinFide() || !yo.elegido ? "" : yo.elegido.titulo || "");
    yo.torneos = () => (yo.rol() !== "jugador" ? [] : [yo.clasico, q("[data-blitz]").checked ? "BLITZ" : null].filter(Boolean));

    function pintarClasicos(eleg) {
      const caja = q("[data-clasicos]");
      caja.textContent = "";
      const opciones = ["A", "B", "U14", null];
      if (yo.clasico && (!plazo.clasicos || !eleg.si.includes(yo.clasico))) yo.clasico = null;
      opciones.forEach((t) => {
        const T = t ? R.TORNEOS[t] : null;
        const puede = !t || (plazo.clasicos && eleg.si.includes(t));
        const porque = !t ? "" : !plazo.clasicos ? "La inscripción de los clásicos cerró el 20 de diciembre." : eleg.no[t] || "";
        const l = document.createElement("label"); l.className = "metro-opcion";
        const r = document.createElement("input"); r.type = "radio"; r.name = k + "-clasico"; r.value = t || ""; r.className = "mt-1 h-5 w-5";
        r.disabled = !puede; r.checked = (yo.clasico || null) === t;
        r.addEventListener("change", () => { yo.clasico = t; yo.tocado = true; recalcular(); });
        const s = document.createElement("span");
        const n = document.createElement("span"); n.className = "font-semibold block"; n.textContent = T ? T.nombre : "Ningún clásico (solo el blitz)";
        const d = document.createElement("span"); d.className = "block text-sm text-brand-600 dark:text-brand-300";
        d.textContent = T ? T.ritmo + " · " + T.quien : "Si solo viene a jugar el blitz del 30 de diciembre.";
        s.append(n, d);
        if (!puede && porque) { const no = document.createElement("span"); no.className = "block text-sm font-semibold mt-1 " + ROJO; no.textContent = "No disponible: " + porque; s.append(no); }
        l.append(r, s); caja.append(l);
      });
      const posibles = opciones.filter((t) => t && plazo.clasicos && eleg.si.includes(t));
      if (!yo.clasico && posibles.length === 1 && !yo.tocado) {
        yo.clasico = posibles[0];
        caja.querySelector('input[value="' + posibles[0] + '"]').checked = true;
      }
    }

    function recalcular() {
      const rol = yo.rol();
      const juega = rol === "jugador";
      const fideSi = juega || rol === "entrenador";
      q("[data-bloque-fide]").classList.toggle("hidden", !fideSi);
      q("[data-fide-pregunta]").textContent = juega ? "ID FIDE" : "ID FIDE (si tiene)";
      if (!fideSi && !sinFide()) el.querySelector('input[name="' + k + '-fide"][value="no"]').checked = true;
      q("[data-caja-fide]").classList.toggle("hidden", sinFide());
      q("[data-sin-fide]").classList.toggle("hidden", !(sinFide() && juega));
      q("[data-fed-cr]").classList.toggle("hidden", selFed.value !== "CRC");
      q("[data-fed-fuera]").classList.toggle("hidden", selFed.value === "CRC");
      q("[data-bloque-torneos]").classList.toggle("hidden", !juega);
      const contactoOpcional = esGrupo() && !yo.esDelegado;
      el.querySelectorAll("[data-ast-contacto]").forEach((x) => x.classList.toggle("hidden", contactoOpcional));
      q("[data-nota-contacto]").classList.toggle("hidden", !contactoOpcional);

      const nac = v("nacimiento");
      const anioFide = !sinFide() && yo.elegido ? yo.elegido.nacimiento : null;
      q("[data-aviso-nac]").textContent = anioFide && nac && Number(nac.slice(0, 4)) !== anioFide ? "En FIDE aparece nacido en " + anioFide + ". Revisa la fecha." : "";
      const e = R.edad(nac, R.INICIO);
      q("[data-caja-responsable]").classList.toggle("hidden", !(e !== null && e < 18));
      if (juega) {
        pintarClasicos(R.elegibles(eloEstandar(), nac || anioFide || null));
        if (!plazo.clasicos) q("[data-blitz]").checked = true;
      }
      q("[data-caja-hosp]").classList.toggle("hidden", !hospeda());
      q("[data-caja-comidas]").classList.toggle("hidden", !comidas().length);
      q("[data-aviso-condicion]").classList.toggle("hidden", !condicion().some((x) => x === "sordo" || x === "ciego"));
      q("[data-texto-publicidad]").textContent = esGrupo() && !yo.esDelegado
        ? "esta persona (o su madre o padre, si es menor) autoriza que la FCA y Ajedrez Integral usen su nombre y su foto en la publicidad del torneo: redes sociales, afiches, la página y la prensa."
        : "autorizo que la FCA y Ajedrez Integral usen el nombre y la foto de esta persona en la publicidad del torneo: redes sociales, afiches, la página y la prensa.";
      pintarTitulo();
      totales();
    }
    yo.recalcular = recalcular;

    function pintarTitulo() {
      const n = [v("nombre"), v("apellidos")].filter(Boolean).join(" ");
      const i = personas.indexOf(yo) + 1;
      const rol = yo.rol();
      const queEs = yo.esDelegado ? (rol === "delegado" ? "Delegado" : rol === "jugador" ? "Delegado y jugador" : "Delegado y entrenador")
        : R.rolDe(rol, v("sexo"));
      const torneo = rol === "jugador" && yo.torneos().length ? " · " + yo.torneos().map((t) => R.TORNEOS[t].corto).join(" + ") : "";
      q("[data-titulo]").textContent = (esGrupo() ? i + ". " : "") + (n || "Persona sin nombre todavía") + " — " + queEs + torneo;
      q("[data-quitar]").classList.toggle("hidden", !esGrupo() || yo.esDelegado);
      q("[data-quitar]").setAttribute("aria-label", "Quitar a " + (n || "esta persona") + " de la inscripción");
    }

    el.addEventListener("input", (ev) => { if (ev.target.matches('[data-c="nombre"], [data-c="apellidos"]')) pintarTitulo(); });
    el.addEventListener("change", (ev) => { if (!ev.target.matches("[data-foto]")) recalcular(); });
    c("pais_residencia").addEventListener("change", () => {
      if (!/^costa rica$/i.test(v("pais_residencia")) && c("documento_tipo").value === "cedula") c("documento_tipo").value = "pasaporte";
    });
    q("[data-quitar]").addEventListener("click", async () => {
      const n = [v("nombre"), v("apellidos")].filter(Boolean).join(" ") || "esta persona";
      if (!(await window.Avisos.confirmar("Se quita a " + n + " de la inscripción, con todo lo que llenaste de ella.", { titulo: "¿Quitar a " + n + "?", aceptar: "Quitar de la inscripción", peligro: true }))) return;
      personas.splice(personas.indexOf(yo), 1);
      el.remove();
      personas.forEach((p) => p.recalcular());
      $("agregar").querySelector("button").focus();
    });

    /* ---------- la foto ---------- */
    const inFoto = q("[data-foto]");
    inFoto.addEventListener("change", async () => {
      const a = inFoto.files[0];
      inFoto.value = "";
      if (!a) return;
      const estado = q("[data-foto-estado]");
      if (!/^image\//.test(a.type)) { estado.textContent = "«" + a.name + "» no sirve: sube una foto (JPG o PNG)."; return; }
      if (yo.foto && yo.foto.url) URL.revokeObjectURL(yo.foto.url);
      yo.foto = { archivo: a, url: URL.createObjectURL(a), ruta: null };
      yo.fotoImg = null;
      try { const img = new Image(); img.src = yo.foto.url; await img.decode(); yo.fotoImg = img; }
      catch (e) { estado.textContent = "No se pudo leer esa foto. Prueba con otra (JPG o PNG)."; yo.foto = null; return; }
      const lista = q("[data-foto-lista]"); lista.textContent = "";
      const li = document.createElement("li");
      const img = document.createElement("img"); img.src = yo.foto.url; img.alt = "Vista previa de la foto"; img.className = "w-24 h-32 object-cover rounded-lg border border-brand-200 dark:border-brand-700";
      li.append(img); lista.append(li);
      estado.textContent = "Elegida: " + a.name;
    });

    /* ---------- copiar lo del delegado a una persona nueva ---------- */
    yo.copiarDe = (otra) => {
      ["nacionalidad", "pais_residencia", "club", "llegada", "salida", "vuelo", "hospedaje_desde", "hospedaje_hasta", "habitacion", "comidas_desde", "comidas_hasta", "documento_tipo"]
        .forEach((n) => { if (c(n) && otra.el.querySelector('[data-c="' + n + '"]')) c(n).value = otra.el.querySelector('[data-c="' + n + '"]').value; });
      c("traslado").checked = otra.el.querySelector('[data-c="traslado"]').checked;
      el.querySelector('input[name="' + k + '-hosp"][value="' + (otra.hospeda() ? "si" : "no") + '"]').checked = true;
      const suyas = otra.comidas();
      el.querySelectorAll("[data-comida]").forEach((x) => { x.checked = suyas.includes(x.value); });
      // Para una emergencia, si no se dice otra cosa, se llama al delegado.
      c("emer_nombre").value = [otra.v("nombre"), otra.v("apellidos")].filter(Boolean).join(" ");
      c("emer_parentesco").value = "Delegado";
      c("emer_telefono").value = otra.v("telefono");
      if (c("habitacion").value === "individual") c("habitacion").value = "compartida";
    };
    yo.hospeda = hospeda; yo.comidas = comidas;

    /* ---------- lo que se manda, y lo que falta ---------- */
    yo.armar = (metodo) => {
      const rol = yo.rol(), nac = v("nacimiento"), e = R.edad(nac, R.INICIO);
      const f = sinFide() ? null : yo.elegido;
      const errores = [];
      const contactoObligatorio = !esGrupo() || yo.esDelegado;
      const falta = (campo, texto) => errores.push([campo, texto]);
      if ((rol === "jugador" || rol === "entrenador") && !sinFide() && !f) falta(buscarEl, "Busca y elige el nombre en la lista de FIDE, o marca «No tiene ID FIDE».");
      if (!v("nombre") || !v("apellidos")) falta(c(!v("nombre") ? "nombre" : "apellidos"), "Falta el nombre completo.");
      if (!nac) falta(c("nacimiento"), "Falta la fecha de nacimiento.");
      if (!v("sexo")) falta(c("sexo"), "Falta el sexo.");
      if (v("nacionalidad").length < 2 || v("pais_residencia").length < 2) falta(c("nacionalidad"), "Falta la nacionalidad o el país donde vive.");
      if (v("documento").length < 4) falta(c("documento"), "Falta el número de documento.");
      if ((contactoObligatorio || v("correo")) && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v("correo"))) falta(c("correo"), "Revisa el correo electrónico.");
      if ((contactoObligatorio || v("telefono")) && v("telefono").replace(/\D/g, "").length < 7) falta(c("telefono"), "Revisa el teléfono.");
      if (e !== null && e < 18 && (!v("resp_nombre") || !v("resp_telefono"))) falta(c("resp_nombre"), "Es menor de edad: faltan el nombre y el teléfono de la persona responsable.");
      if (!v("emer_nombre") || !v("emer_telefono")) falta(c("emer_nombre"), "Falta el contacto para una emergencia.");
      if (rol === "jugador" && !yo.torneos().length) falta(q("[data-blitz]"), "Elige al menos un torneo.");
      if (hospeda() && (!v("hospedaje_desde") || !v("hospedaje_hasta") || v("hospedaje_desde") >= v("hospedaje_hasta"))) falta(c("hospedaje_desde"), "Revisa las fechas del hospedaje.");
      if (comidas().length && (!v("comidas_desde") || !v("comidas_hasta") || v("comidas_desde") > v("comidas_hasta"))) falta(c("comidas_desde"), "Revisa los días de la alimentación.");
      if (!yo.foto) falta(inFoto, "Falta la foto tamaño pasaporte.");
      const datos = {
        rol, es_delegado: yo.esDelegado,
        sin_fide: !f, fide_id: f ? f.fideId : null, federacion: f ? f.fed : (rol === "jugador" ? selFed.value : null), titulo: f ? f.titulo : "",
        elo_estandar: f ? f.estandar : null, elo_rapido: f ? f.rapido : null, elo_blitz: f ? f.blitz : null,
        nombre: v("nombre"), apellidos: v("apellidos"), sexo: v("sexo"), nacimiento: nac,
        nacionalidad: v("nacionalidad"), pais_residencia: v("pais_residencia"),
        documento_tipo: v("documento_tipo"), documento: v("documento"), correo: v("correo"), telefono: v("telefono"), club: v("club"),
        torneos: yo.torneos(),
        responsable: e !== null && e < 18 ? { nombre: v("resp_nombre"), parentesco: v("resp_parentesco"), documento: v("resp_documento"), telefono: v("resp_telefono") } : null,
        emergencia: { nombre: v("emer_nombre"), parentesco: v("emer_parentesco"), telefono: v("emer_telefono") },
        viaje: (v("llegada") || v("salida") || v("vuelo") || c("traslado").checked) ? { llegada: v("llegada"), salida: v("salida"), vuelo: v("vuelo"), traslado: c("traslado").checked } : null,
        hospedaje: hospeda(), hospedaje_desde: hospeda() ? v("hospedaje_desde") : null, hospedaje_hasta: hospeda() ? v("hospedaje_hasta") : null,
        habitacion: hospeda() ? v("habitacion") : null, acompanantes: hospeda() ? Number(v("acompanantes")) || 0 : 0,
        comidas: comidas(), comidas_desde: comidas().length ? v("comidas_desde") : null, comidas_hasta: comidas().length ? v("comidas_hasta") : null,
        dieta: v("dieta"), condicion: condicion(), accesibilidad: v("accesibilidad"),
        acepta_publicidad: c("acepta_publicidad").checked,
      };
      const precio = R.precio({ rol, torneos: datos.torneos, metodo: metodo || "dolares", hoy, nacimiento: nac, titulo: datos.titulo });
      return { errores, datos, precio };
    };

    recalcular();
    return yo;
  }

  /* ===================== Las personas de la inscripción ===================== */
  function agregar(rol) {
    const delegado = personas[0];
    const p = Persona({ rol, esDelegado: esGrupo() && personas.length === 0 });
    personas.push(p);
    $("personas").append(p.el);
    if (esGrupo() && delegado && p !== delegado) p.copiarDe(delegado);
    personas.forEach((x) => x.recalcular());
    return p;
  }

  function cambiarModo() {
    const grupo = esGrupo();
    $("caja-grupo").classList.toggle("hidden", !grupo);
    $("agregar").classList.toggle("hidden", !grupo);
    // Se empieza de nuevo: la primera tarjeta cambia de papel (delegado o no).
    personas.splice(0).forEach((p) => p.el.remove());
    agregar(grupo ? "delegado" : "jugador");
  }
  document.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener("change", async (ev) => {
    const lleno = personas.some((p) => p.v("nombre") || p.v("apellidos") || p.foto);
    if (lleno && !(await window.Avisos.confirmar("Al cambiar la forma de inscribirse se empieza de nuevo y se borra lo que llenaste de cada persona.", { titulo: "¿Empezar de nuevo?", aceptar: "Cambiar y empezar de nuevo" }))) {
      document.querySelector('input[name="modo"][value="' + (ev.target.value === "grupo" ? "individual" : "grupo") + '"]').checked = true;
      return;
    }
    cambiarModo();
  }));
  $("agregar").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-agregar]");
    if (!b) return;
    if (personas.length >= R.MAX_GRUPO) { window.Avisos.avisar("Un grupo lleva hasta " + R.MAX_GRUPO + " personas. Para más, haz otra inscripción de grupo.", { tipo: "error" }); return; }
    const p = agregar(b.dataset.agregar);
    p.el.scrollIntoView({ block: "start", behavior: "smooth" });
    p.el.querySelector("select").focus({ preventScroll: true });
  });

  /* ===================== El total y el pago ===================== */
  let metodo = null;
  function totales() {
    if (!personas.length) return null;
    const lineas = [], avisos = new Set();
    let usd = 0, gratisTodo = true;
    personas.forEach((p, i) => {
      const { datos, precio } = p.armar(metodo);
      const quien = [datos.nombre, datos.apellidos].filter(Boolean).join(" ") || "Persona " + (i + 1);
      if (datos.rol === "jugador" && datos.torneos.length) {
        precio.lineas.forEach((l) => lineas.push(quien + " — " + l.texto + ": " + R.dinero(l.usd)));
        precio.avisos.forEach((a) => avisos.add(a));
      } else if (datos.rol !== "jugador") lineas.push(quien + " — " + (p.esDelegado ? "delegado" : R.rolDe(datos.rol, datos.sexo).toLowerCase()) + ": sin costo de inscripción");
      usd += precio.usd;
      if (datos.rol === "jugador" && !precio.gratis) gratisTodo = false;
    });
    usd = Math.round(usd * 100) / 100;
    const crc = Math.round(usd * R.TIPO_CAMBIO);
    const caja = $("total"); caja.textContent = "";
    const ul = document.createElement("ul"); ul.className = "text-sm space-y-1";
    lineas.forEach((l) => { const li = document.createElement("li"); li.textContent = l; ul.append(li); });
    const tot = document.createElement("p"); tot.className = "font-bold text-lg mt-2";
    const enColones = metodo && R.METODOS[metodo].moneda === "CRC";
    tot.textContent = usd === 0 ? "Total: sin costo" : "Total: " + R.dinero(usd) + (enColones ? " = " + R.colones(crc) + " (a ₡" + R.TIPO_CAMBIO + " por dólar)" : "");
    caja.append(ul, tot);
    if (usd > 0) { const av = document.createElement("p"); av.className = "text-xs text-brand-500 dark:text-brand-300 mt-1"; av.textContent = [...avisos].join(" "); caja.append(av); }
    $("con-pago").classList.toggle("hidden", usd === 0);
    pintarMetodos(usd, crc);
    $("cuenta-personas").textContent = "(" + (personas.length === 1 ? "1 persona" : personas.length + " personas") + " hasta ahora)";
    return { usd, crc, lineas, gratisTodo };
  }

  function pintarMetodos(usd, crc) {
    const caja = $("metodos");
    if (!caja.childElementCount) {
      Object.entries(R.METODOS).forEach(([k, M]) => {
        const l = document.createElement("label"); l.className = "metro-opcion items-center";
        const r = document.createElement("input"); r.type = "radio"; r.name = "metodo"; r.value = k; r.className = "h-5 w-5";
        r.addEventListener("change", () => { metodo = k; totales(); });
        const s = document.createElement("span"); s.className = "font-semibold"; s.textContent = M.nombre;
        l.append(r, s); caja.append(l);
      });
    }
    const d = $("datos-metodo"); d.textContent = ""; d.classList.toggle("hidden", !metodo);
    if (!metodo) return;
    const M = R.METODOS[metodo];
    const t = document.createElement("p"); t.className = "font-semibold mb-1";
    t.textContent = "Paga " + (M.moneda === "CRC" ? R.colones(crc) : R.dinero(usd)) + " por " + M.nombre + ":";
    const ul = document.createElement("ul"); ul.className = "space-y-0.5";
    M.datos.forEach((x) => { const li = document.createElement("li"); li.textContent = x; ul.append(li); });
    d.append(t, ul);
  }

  $("quiere-factura").addEventListener("change", () => $("caja-factura").classList.toggle("hidden", !$("quiere-factura").checked));

  let comprobante = null;
  $("comprobante").addEventListener("change", () => {
    const a = $("comprobante").files[0];
    $("comprobante").value = "";
    if (!a) return;
    const est = $("comprobante-estado"), lista = $("comprobante-lista");
    if (!/^image\//.test(a.type) && !/\.pdf$/i.test(a.name)) { est.textContent = "«" + a.name + "» no sirve: sube una foto o un PDF."; return; }
    if (a.size > 10 * 1024 * 1024 && !/^image\//.test(a.type)) { est.textContent = "«" + a.name + "» pesa más de 10 MB."; return; }
    if (comprobante && comprobante.url) URL.revokeObjectURL(comprobante.url);
    comprobante = { archivo: a, url: /^image\//.test(a.type) ? URL.createObjectURL(a) : null, ruta: null };
    lista.textContent = "";
    const li = document.createElement("li");
    if (comprobante.url) { const img = document.createElement("img"); img.src = comprobante.url; img.alt = "Vista previa de " + a.name; img.className = "w-24 h-24 object-cover rounded-lg border border-brand-200 dark:border-brand-700"; li.append(img); }
    else { const s = document.createElement("span"); s.className = "inline-block px-3 py-2 rounded-lg border border-brand-200 dark:border-brand-700 text-xs"; s.textContent = "📄 " + a.name; li.append(s); }
    lista.append(li);
    est.textContent = "Elegido: " + a.name;
  });

  /* ===================== Revisar ===================== */
  let envio = null;   // { personas: [{ p, datos, precio }], total }

  $("formulario").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("msg").textContent = "";
    const errores = [];
    if (esGrupo() && !$("delegacion").value.trim()) errores.push([$("delegacion"), "Falta el nombre de la delegación."]);
    if (esGrupo() && personas.length < 2) errores.push([$("agregar").querySelector("button"), "Agrega al menos a una persona a la delegación."]);
    const lista = personas.map((p, i) => {
      const r = p.armar(metodo);
      const quien = esGrupo() ? (i + 1) + ". " + ([r.datos.nombre, r.datos.apellidos].filter(Boolean).join(" ") || "persona sin nombre") + ": " : "";
      r.errores.forEach(([campo, t]) => errores.push([campo, quien + t]));
      return Object.assign({ p }, r);
    });
    const t = totales();
    if (t.usd > 0 && !metodo) errores.push([$("metodos"), "Elige cómo pagaste."]);
    if (t.usd > 0 && !comprobante) errores.push([$("comprobante"), "Falta el comprobante de pago."]);
    if (!$("acepta-reglamento").checked || !$("acepta-imagen").checked || !$("acepta-datos").checked) errores.push([$("acepta-reglamento"), "Falta marcar las tres casillas del final."]);
    if (errores.length) {
      $("msg").textContent = errores[0][1] + (errores.length > 1 ? " (y " + (errores.length - 1) + " cosa" + (errores.length > 2 ? "s" : "") + " más)" : "");
      const el = errores[0][0];
      if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); (el.querySelector && el.querySelector("input, button") || el).focus({ preventScroll: true }); }
      return;
    }
    envio = { personas: lista, total: t };
    await mostrarResumen();
  });

  function resumenDe(d, p) {
    const filas = [
      ["Se inscribe como", p.esDelegado ? (d.rol === "delegado" ? "Delegado" : d.rol === "jugador" ? "Delegado y jugador" : "Delegado y entrenador") : R.rolDe(d.rol, d.sexo)],
      ["ID FIDE", d.sin_fide ? (d.rol !== "jugador" ? "No tiene" : d.federacion === "CRC" ? "No tiene: la FCA lo tramita" : "No tiene: lo tramita su federación (" + d.federacion + ")") : d.fide_id + (d.titulo ? " (" + d.titulo + ")" : "") + " · " + d.federacion],
    ];
    if (d.rol === "jugador") {
      if (!d.sin_fide) filas.push(["Elo FIDE", "Estándar " + (d.elo_estandar || "sin Elo") + " · Rápido " + (d.elo_rapido || "—") + " · Blitz " + (d.elo_blitz || "—")]);
      filas.push(["Torneos", d.torneos.map((t) => R.TORNEOS[t].nombre + " (" + R.TORNEOS[t].ritmo + ")").join(" y ")]);
    }
    filas.push(
      ["Nacimiento", fechaLarga(d.nacimiento) + " (" + R.edad(d.nacimiento, R.INICIO) + " años al 26 de diciembre)"],
      ["Nacionalidad / vive en", d.nacionalidad + " / " + d.pais_residencia],
      [NOMBRE_DOC[d.documento_tipo], d.documento],
      ["Contacto", [d.correo, d.telefono].filter(Boolean).join(" · ") || "Por medio del delegado"],
    );
    if (d.responsable) filas.push(["Responsable", d.responsable.nombre + " · " + d.responsable.telefono]);
    filas.push(
      ["Emergencias", d.emergencia.nombre + (d.emergencia.parentesco ? " (" + d.emergencia.parentesco + ")" : "") + " · " + d.emergencia.telefono],
      ["Hospedaje", d.hospedaje ? "Del " + fechaLarga(d.hospedaje_desde) + " al " + fechaLarga(d.hospedaje_hasta) + ", habitación " + d.habitacion + (d.acompanantes ? ", con " + d.acompanantes + " acompañante" + (d.acompanantes > 1 ? "s" : "") : "") : "No requiere"],
      ["Alimentación", d.comidas.length ? d.comidas.join(", ") + " del " + fechaLarga(d.comidas_desde) + " al " + fechaLarga(d.comidas_hasta) + (d.dieta ? " · " + d.dieta : "") : "No requiere"],
    );
    if (d.viaje) filas.push(["Viaje", [d.viaje.llegada && "llega el " + fechaLarga(d.viaje.llegada), d.viaje.salida && "sale el " + fechaLarga(d.viaje.salida), d.viaje.vuelo, d.viaje.traslado && "con traslado del aeropuerto"].filter(Boolean).join(", ")]);
    if (d.condicion.length || d.accesibilidad) filas.push(["Condición", [...d.condicion.map((c) => ({ sordo: "atleta sordo", ciego: "atleta ciego o de baja visión", silla: "silla de ruedas" })[c]), d.accesibilidad].filter(Boolean).join(", ")]);
    filas.push(["Publicidad", d.acepta_publicidad ? "Autoriza el uso de su nombre y su foto" : "No autoriza el uso de su nombre ni de su foto"]);
    const dl = document.createElement("dl"); dl.className = "grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm";
    filas.forEach(([k, x]) => {
      const dv = document.createElement("div");
      const dt = document.createElement("dt"); dt.className = "text-xs font-semibold uppercase tracking-wide text-brand-500 dark:text-brand-300"; dt.textContent = k;
      const dd = document.createElement("dd"); dd.className = "text-brand-800 dark:text-brand-100"; dd.textContent = x;
      dv.append(dt, dd); dl.append(dv);
    });
    return dl;
  }

  async function mostrarResumen() {
    $("formulario").classList.add("hidden");
    $("resumen").classList.remove("hidden");
    $("validar").classList.remove("hidden");
    $("listo").classList.add("hidden");
    $("confirmo").checked = false;
    $("msg-enviar").textContent = "";
    const primero = envio.personas[0].datos;
    const varios = envio.personas.length > 1;
    $("resumen-titulo").textContent = varios ? "Bienvenidos al Torneo Metropolitano 2026"
      : (primero.sexo === "f" ? "Bienvenida" : "Bienvenido") + " al Torneo Metropolitano 2026";
    $("resumen-sub").textContent = varios
      ? "Esta es la información resumida de la delegación " + $("delegacion").value.trim() + ": " + envio.personas.length + " personas. Revisa a cada una: así queda su inscripción y así sale su gafete."
      : "Esta es tu información resumida. Revísala bien: así queda la inscripción y así sale el gafete.";
    $("confirmo-texto").textContent = varios ? "Revisé la información de cada persona y está correcta." : "Revisé la información y está correcta.";
    const caja = $("resumen-personas"); caja.textContent = "";
    envio.personas.forEach((x, i) => {
      const art = document.createElement("article"); art.className = "metro-persona";
      const h = document.createElement("header"); h.className = "px-4 py-3 font-semibold";
      h.textContent = (varios ? (i + 1) + ". " : "") + x.datos.nombre + " " + x.datos.apellidos;
      const cuerpo = document.createElement("div"); cuerpo.className = "p-4 space-y-4";
      const g = document.createElement("div"); g.className = "grid grid-cols-2 gap-3 max-w-md mx-auto";
      x.lienzos = ["Frente", "Dorso"].map((lado) => {
        const fig = document.createElement("figure");
        const cv = document.createElement("canvas"); cv.setAttribute("role", "img"); cv.className = "w-full h-auto rounded-lg shadow border border-brand-200 dark:border-brand-700 bg-white";
        const cap = document.createElement("figcaption"); cap.className = "text-xs text-center text-brand-500 dark:text-brand-300 mt-1"; cap.textContent = lado;
        fig.append(cv, cap); g.append(fig);
        return cv;
      });
      x.error = document.createElement("p"); x.error.className = "hidden text-sm " + ROJO; x.error.setAttribute("role", "alert");
      cuerpo.append(g, x.error, resumenDe(x.datos, x.p));
      art.append(h, cuerpo); caja.append(art);
    });
    const tot = $("resumen-total"); tot.textContent = "";
    envio.total.lineas.forEach((l) => { const p = document.createElement("p"); p.textContent = l; tot.append(p); });
    const t = document.createElement("p"); t.className = "font-bold mt-2";
    t.textContent = envio.total.usd === 0 ? "Total: sin costo" : "Total: " + R.dinero(envio.total.usd) + (R.METODOS[metodo].moneda === "CRC" ? " = " + R.colones(envio.total.crc) : "") + " por " + R.METODOS[metodo].nombre;
    tot.append(t);
    $("resumen").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
    await pintarGafetes();
  }

  async function pintarGafetes() {
    for (const x of envio.personas) {
      x.error.classList.add("hidden");
      try {
        await window.MetropolitanoGafete.dibujar(Object.assign({}, x.datos, { codigo: x.p.codigo, delegacion: esGrupo() ? $("delegacion").value.trim() : null }), x.p.fotoImg, x.lienzos[0], x.lienzos[1]);
      } catch (e) {
        x.error.textContent = "No se pudo dibujar el gafete (" + (e.message || e) + "). La inscripción se puede mandar igual.";
        x.error.classList.remove("hidden");
      }
    }
  }

  $("corregir").addEventListener("click", () => {
    $("resumen").classList.add("hidden");
    $("formulario").classList.remove("hidden");
    $("revisar").focus();
  });

  /* ===================== Enviar ===================== */
  async function subir(x, carpeta) {
    if (x.ruta) return x.ruta;
    const listo = await window.Adjuntos.preparar(x.archivo, carpeta === "foto");
    const ext = (/\.([a-z0-9]+)$/.exec(listo.nombre) || [])[1];
    if (!["jpg", "png", "webp", "pdf"].includes(ext)) throw new Error("«" + x.archivo.name + "» no es una foto ni un PDF.");
    const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
    const ruta = carpeta + "/" + id + "/" + listo.nombre;
    const { error } = await window.sb.storage.from(BUCKET).upload(ruta, listo.blob, { contentType: listo.tipo, upsert: false });
    if (error) throw new Error("No se pudo subir «" + x.archivo.name + "». Revisa la conexión e intenta de nuevo.");
    x.ruta = ruta;
    return ruta;
  }

  let enviando = false;
  $("enviar").addEventListener("click", async () => {
    if (enviando) return;
    const msg = $("msg-enviar");
    msg.className = "text-sm";
    if (!$("confirmo").checked) { msg.className = "text-sm " + ROJO; msg.textContent = "Marca que revisaste la información y está correcta."; $("confirmo").focus(); return; }
    enviando = true; $("enviar").disabled = true;
    try {
      const lista = [];
      for (const [i, x] of envio.personas.entries()) {
        msg.textContent = "Subiendo la foto " + (envio.personas.length > 1 ? (i + 1) + " de " + envio.personas.length : "") + "…";
        lista.push(Object.assign({}, x.datos, { foto: await subir(x.p.foto, "foto") }));
      }
      let rutaComp = null;
      if (envio.total.usd > 0) { msg.textContent = "Subiendo el comprobante…"; rutaComp = await subir(comprobante, "comprobante"); }
      msg.textContent = "Enviando la inscripción…";
      const p = {
        modo: esGrupo() ? "grupo" : "individual", delegacion: esGrupo() ? $("delegacion").value.trim() : null,
        personas: lista, pago_metodo: envio.total.usd > 0 ? metodo : null, comprobante: rutaComp,
        pago_referencia: $("referencia").value.trim(), pago_fecha: $("pago_fecha").value || null,
        factura: $("quiere-factura").checked && envio.total.usd > 0 ? { nombre: $("fac_nombre").value.trim(), identificacion: $("fac_id").value.trim(), correo: $("fac_correo").value.trim() } : null,
        acepta_reglamento: $("acepta-reglamento").checked, acepta_imagen: $("acepta-imagen").checked, acepta_datos: $("acepta-datos").checked,
        validado: true,
      };
      const { data, error } = await window.sb.rpc("metropolitano_inscribir", { p });
      if (error || !data || !data.ok) throw new Error((data && data.error) || "No se pudo enviar. Revisa la conexión e intenta de nuevo.");
      (data.personas || [{ codigo: data.codigo }]).forEach((r, i) => { if (envio.personas[i]) envio.personas[i].p.codigo = r.codigo; });
      $("validar").classList.add("hidden");
      $("listo").classList.remove("hidden");
      const varios = envio.personas.length > 1;
      $("listo-texto").textContent = varios ? "¡Quedó inscrita la delegación! " + envio.personas.length + " personas." : "¡Quedó la inscripción! El código es " + data.codigo + ".";
      const ul = $("listo-codigos"); ul.textContent = "";
      if (varios) envio.personas.forEach((x) => { const li = document.createElement("li"); li.textContent = x.p.codigo + " — " + x.datos.nombre + " " + x.datos.apellidos; ul.append(li); });
      const correo = envio.personas[0].datos.correo;
      $("listo-pago").textContent = Number(data.monto_usd) > 0
        ? "La organización revisa el comprobante de " + R.dinero(Number(data.monto_usd)) + " y escribe a " + correo + ". Lleven el gafete (impreso o en el celular) el día del torneo."
        : "La inscripción no tiene costo. Lleven el gafete (impreso o en el celular) el día del torneo.";
      msg.textContent = "";
      await pintarGafetes();
      $("bajar-gafete").focus();
    } catch (e) {
      msg.className = "text-sm " + ROJO;
      msg.textContent = e.message || String(e);
    } finally {
      enviando = false; $("enviar").disabled = false;
    }
  });

  $("bajar-gafete").addEventListener("click", async () => {
    const b = $("bajar-gafete"); b.disabled = true;
    try {
      const del = esGrupo() ? $("delegacion").value.trim() : null;
      const lista = envio.personas.map((x) => ({ x: Object.assign({}, x.datos, { codigo: x.p.codigo, delegacion: del }), foto: x.p.fotoImg }));
      const bytes = await window.MetropolitanoGafete.pdfDe(lista, "Gafetes Metropolitano 2026");
      const primero = envio.personas[0].datos;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      a.download = "Gafete" + (lista.length > 1 ? "s" : "") + " Metropolitano 2026 - " + window.Adjuntos.nombreSeguro(del || primero.nombre + " " + primero.apellidos) + ".pdf";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (e) {
      window.Avisos.avisar("No se pudo armar el PDF de los gafetes: " + (e.message || e), { tipo: "error" });
    } finally { b.disabled = false; }
  });
  $("otra").addEventListener("click", () => { location.href = location.pathname; });

  cambiarModo();
})();
