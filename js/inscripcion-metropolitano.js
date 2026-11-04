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
        <div class="flex flex-wrap items-center gap-4" role="radiogroup" aria-label="¿De dónde viene?"><span class="text-sm font-semibold">¿De dónde viene?${AST}</span><label class="flex items-center gap-2"><input type="radio" name="${id("origen")}" value="cr" checked> De Costa Rica</label><label class="flex items-center gap-2"><input type="radio" name="${id("origen")}" value="fuera"> De otro país</label></div>

        <div data-bloque-fide class="space-y-3">
          <p class="font-semibold" data-fide-pregunta>ID FIDE</p>
          <div class="flex flex-wrap gap-4"><label class="flex items-center gap-2"><input type="radio" name="${id("fide")}" value="si" checked> Tiene ID FIDE</label><label class="flex items-center gap-2"><input type="radio" name="${id("fide")}" value="no"> No tiene ID FIDE</label></div>
          <p data-origen-ayuda class="text-sm rounded-xl bg-brand-50 dark:bg-brand-950 p-3"></p>
          <div data-caja-fide class="space-y-3">
            <div data-caja-buscar><label for="${id("buscar")}" class="block text-sm font-semibold mb-1"><span data-buscar-etiqueta>Escribe el nombre (apellido primero) o el ID FIDE</span>${AST}</label>
              <input id="${id("buscar")}" data-campo data-buscar type="search" autocomplete="off" placeholder="Ejemplo: Mora, Ana  —  o  6400000" aria-describedby="${id("buscar-ayuda")}">
              <p id="${id("buscar-ayuda")}" class="text-xs text-brand-500 dark:text-brand-300 mt-1" data-buscar-ayuda>Buscamos en la lista oficial de FIDE mientras escribes. Toca el nombre para elegirlo.</p></div>
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
          <div><label for="${id("nombre")}" class="block text-sm font-semibold mb-1">Nombre(s)${AST}</label><input id="${id("nombre")}" data-campo data-c="nombre" maxlength="80" autocomplete="off" aria-describedby="${id("nombre-fide")}"></div>
          <div><label for="${id("apellidos")}" class="block text-sm font-semibold mb-1">Apellidos${AST}</label><input id="${id("apellidos")}" data-campo data-c="apellidos" maxlength="80" autocomplete="off" aria-describedby="${id("nombre-fide")}"></div>
          <p id="${id("nombre-fide")}" data-nombre-bloqueado class="hidden sm:col-span-2 text-sm font-semibold">🔒 El nombre y los apellidos son los de FIDE para el ID elegido, y no se pueden cambiar: así salen en el torneo. Si no es esta persona, busque otro ID arriba.</p>
          <div data-caja-nombre-fide class="sm:col-span-2 hidden space-y-2">
            <p data-estado-nombre class="text-sm" role="status" aria-live="polite"></p>
            <ul data-resultados-nombre class="space-y-2" aria-label="Jugadores de FIDE con ese nombre"></ul>
          </div>
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
          <!-- El código de descuento que da la organización (rifas, inscripciones donadas): vale una vez. -->
          <div data-caja-codigo class="space-y-1">
            <label for="${id("cod")}" class="block text-sm font-semibold">¿Tiene un código de descuento?</label>
            <div class="flex flex-wrap gap-2"><input id="${id("cod")}" data-campo data-codigo-entrada maxlength="13" placeholder="MET-XXXX-XXXX" autocomplete="off" autocapitalize="characters" class="max-w-[14rem]"><button type="button" data-codigo-aplicar class="metro-boton">Aplicar el código</button></div>
            <p data-codigo-estado class="text-sm" aria-live="polite"></p>
          </div>
        </div>

        <div class="space-y-4">
          <p class="font-semibold" data-titulo-viaje>Viaje, hospedaje y alimentación</p>
          <!-- De Costa Rica no se pide el viaje: la provincia y el cantón, para las estadísticas. -->
          <div data-caja-procedencia class="grid sm:grid-cols-2 gap-4">
            <div><label for="${id("prov")}" class="block text-sm font-semibold mb-1">Provincia donde vive${AST}</label><select id="${id("prov")}" data-campo data-c="provincia"></select></div>
            <div><label for="${id("cant")}" class="block text-sm font-semibold mb-1">Cantón${AST}</label><select id="${id("cant")}" data-campo data-c="canton"></select></div>
          </div>
          <!-- GM, IM y WGM: la organización les da hospedaje y alimentación; de afuera, se pide solo el viaje. -->
          <div data-caja-titulado class="hidden rounded-xl border-l-4 border-accent-500 bg-accent-50 dark:bg-brand-950 p-4 text-sm space-y-1"><p class="font-semibold"><span aria-hidden="true">🏆 </span>Invitado titulado</p><p data-titulado-texto></p></div>
          <div data-caja-viaje class="space-y-4">
          <div class="grid sm:grid-cols-3 gap-4">
            <div><label for="${id("lleg")}" class="block text-sm font-semibold mb-1">Día de llegada<span data-ast-viaje class="hidden">${AST}</span></label><input id="${id("lleg")}" data-campo data-c="llegada" type="date" min="2026-12-15" max="2027-01-05"></div>
            <div><label for="${id("sal")}" class="block text-sm font-semibold mb-1">Día de salida<span data-ast-viaje class="hidden">${AST}</span></label><input id="${id("sal")}" data-campo data-c="salida" type="date" min="2026-12-15" max="2027-01-05"></div>
            <div><label for="${id("vuelo")}" class="block text-sm font-semibold mb-1">Vuelo o medio de llegada<span data-ast-viaje class="hidden">${AST}</span></label><input id="${id("vuelo")}" data-campo data-c="vuelo" maxlength="60" placeholder="AV 123, 14:30"></div>
          </div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-c="traslado"> Necesita transporte del aeropuerto al Estadio Nacional</label>
          <div data-caja-docs class="hidden grid sm:grid-cols-2 gap-4">
            <div><p class="text-sm font-semibold mb-1">Foto del tiquete aéreo${AST}</p><label for="${id("tiq")}" class="metro-boton inline-block cursor-pointer">🎫 Elegir el tiquete<input id="${id("tiq")}" data-doc="tiquete" type="file" accept="image/*,.pdf" class="sr-only"></label><p data-doc-estado="tiquete" class="text-xs mt-1" aria-live="polite"></p></div>
            <div><p class="text-sm font-semibold mb-1">Foto del pasaporte${AST}</p><label for="${id("pas")}" class="metro-boton inline-block cursor-pointer">🛂 Elegir el pasaporte<input id="${id("pas")}" data-doc="pasaporte" type="file" accept="image/*,.pdf" class="sr-only"></label><p data-doc-estado="pasaporte" class="text-xs mt-1" aria-live="polite"></p></div>
          </div>
          </div>
          <div data-caja-hosp-alim class="space-y-4">
          <div class="flex flex-wrap items-center gap-4"><span class="text-sm font-semibold">¿Necesita hospedaje?</span><label class="flex items-center gap-2"><input type="radio" name="${id("hosp")}" value="no" checked> No</label><label class="flex items-center gap-2"><input type="radio" name="${id("hosp")}" value="si"> Sí</label></div>
          <div data-caja-hosp class="hidden grid sm:grid-cols-2 gap-4">
            <div><label for="${id("hdes")}" class="block text-sm font-semibold mb-1">Desde (noche de llegada)${AST}</label><input id="${id("hdes")}" data-campo data-c="hospedaje_desde" type="date" min="2026-12-20" max="2027-01-02" value="2026-12-25"></div>
            <div><label for="${id("hhas")}" class="block text-sm font-semibold mb-1">Hasta (día de salida)${AST}</label><input id="${id("hhas")}" data-campo data-c="hospedaje_hasta" type="date" min="2026-12-21" max="2027-01-03" value="2026-12-31"></div>
            <div class="sm:col-span-2 rounded-xl border-l-4 border-accent-500 bg-accent-50 dark:bg-brand-950 p-3 text-sm"><p class="font-semibold">Las habitaciones no son individuales: son compartidas.</p><p class="mt-1">La organización asigna con quién se comparte, y procura ubicar juntas a las familias y a las delegaciones.</p></div>
            <div><label for="${id("hab")}" class="block text-sm font-semibold mb-1">¿Con quién prefiere compartir?</label><select id="${id("hab")}" data-campo data-c="habitacion"><option value="organizacion">Con quien asigne la organización</option><option value="compartida">Con su familia, su delegación o sus acompañantes</option></select></div>
            <div><label for="${id("acomp")}" class="block text-sm font-semibold mb-1">Acompañantes que vienen con esta persona y no se inscriben aparte</label><input id="${id("acomp")}" data-campo data-c="acompanantes" type="number" min="0" max="6" value="0"></div>
            <div data-acomp-lista class="sm:col-span-2 space-y-3"></div>
            <label class="sm:col-span-2 flex items-start gap-3 text-sm"><input type="checkbox" data-c="acepta_compartir" class="mt-1 h-4 w-4 shrink-0"> <span>Acepto que la habitación es compartida y que puede tocarme compartirla con otras personas que asigne la organización.${AST}</span></label>
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
    // GM, IM y WGM que juegan: la organización les da hospedaje y alimentación (las bases).
    function esTitulado() { return yo.rol() === "jugador" && !sinFide() && !!yo.elegido && R.TITULOS_GRATIS.includes(String(yo.elegido.titulo || "").toUpperCase()); }
    yo.titulado = esTitulado;
    const hospeda = () => !esTitulado() && el.querySelector('input[name="' + k + '-hosp"]:checked').value === "si";
    const comidas = () => (esTitulado() ? [] : [...el.querySelectorAll("[data-comida]:checked")].map((x) => x.value));
    const condicion = () => [...el.querySelectorAll("[data-condicion]:checked")].map((x) => x.value);
    const v = (n) => { const x = c(n); return x ? String(x.value || "").trim() : ""; };
    yo.v = v;

    /* ---------- la federación de quien no tiene ID FIDE ---------- */
    const selFed = q("[data-federacion]");
    { const o = document.createElement("option"); o.value = ""; o.textContent = "Elige el país…"; selFed.append(o); }
    FEDERACIONES.forEach(([cod, nombre]) => { const o = document.createElement("option"); o.value = cod; o.textContent = nombre + " (" + cod + ")"; selFed.append(o); });
    selFed.value = "CRC";

    /* ---------- de dónde viene: cómo se busca en FIDE ----------
       De Costa Rica: casi nadie sabe su ID FIDE, así que se escribe el nombre
       y el ID se busca y se carga solo (el buscador queda de respaldo si no
       aparece). De otro país: primero el ID FIDE, y el nombre se llena con el
       de FIDE y queda bloqueado, para que salga el nombre real del jugador. */
    const deAfuera = () => el.querySelector('input[name="' + k + '-origen"]:checked').value === "fuera";
    // La provincia y el cantón de quien viene de Costa Rica (TSE, js/division-territorial.js).
    const DIV = window.DivisionTerritorial || [];
    const lista = (sel, xs, primera) => {
      const antes = sel.value; sel.textContent = "";
      const o0 = document.createElement("option"); o0.value = ""; o0.textContent = primera; sel.append(o0);
      xs.forEach((x) => { const o = document.createElement("option"); o.value = x; o.textContent = x; sel.append(o); });
      if (xs.includes(antes)) sel.value = antes;
    };
    const cantones = () => { const pr = DIV.find((x) => x.provincia === c("provincia").value); lista(c("canton"), pr ? pr.cantones.map((x) => x.canton) : [], pr ? "Elige el cantón…" : "Primero la provincia"); };
    lista(c("provincia"), DIV.map((x) => x.provincia), "Elige la provincia…");
    cantones();
    c("provincia").addEventListener("change", cantones);
    c("acompanantes").addEventListener("input", () => pintarAcompanantes());
    /* Los acompañantes que vienen con la persona: los datos de cada uno, para
       el registro completo (y la exoneración los cubre también). */
    const ACOMP = [["nombre", "Nombre completo", "text", 100], ["documento", "Cédula o pasaporte", "text", 30], ["nacimiento", "Fecha de nacimiento", "date", 10], ["parentesco", "Parentesco", "text", 40]];
    function pintarAcompanantes() {
      const caja = q("[data-acomp-lista]");
      const n = hospeda() ? Math.max(0, Math.min(6, Number(v("acompanantes")) || 0)) : 0;
      const ya = [...caja.querySelectorAll("[data-acomp]")];
      ya.slice(n).forEach((x) => x.remove());
      for (let i = ya.length; i < n; i++) {
        const fs = document.createElement("fieldset");
        fs.dataset.acomp = String(i);
        fs.className = "rounded-xl border border-brand-200 dark:border-brand-700 p-3 grid sm:grid-cols-2 gap-3";
        const lg = document.createElement("legend"); lg.className = "px-1 text-sm font-semibold"; lg.textContent = "Acompañante " + (i + 1);
        fs.append(lg);
        ACOMP.forEach(([campo, etiqueta, tipo, max]) => {
          const d = document.createElement("div");
          const l = document.createElement("label"); l.className = "block text-sm font-semibold mb-1"; l.htmlFor = k + "-ac" + i + "-" + campo;
          l.textContent = etiqueta;
          if (campo !== "parentesco") { const ast = document.createElement("span"); ast.className = "text-red-700 dark:text-red-400"; ast.textContent = " *"; l.append(ast); }
          const inp = document.createElement("input"); inp.id = l.htmlFor; inp.type = tipo; inp.maxLength = max; inp.dataset.acompCampo = campo; inp.dataset.campo = "";
          if (tipo === "date") { inp.min = "1920-01-01"; inp.max = "2026-12-31"; }
          if (campo === "parentesco") inp.placeholder = "Madre, padre, hermano…";
          d.append(l, inp); fs.append(d);
        });
        estilar(fs);
        caja.append(fs);
      }
    }
    yo.acompanantes = () => [...q("[data-acomp-lista]").querySelectorAll("[data-acomp]")].map((fs) => {
      const o = {}; fs.querySelectorAll("[data-acomp-campo]").forEach((x) => { o[x.dataset.acompCampo] = x.value.trim(); }); return o;
    });
    yo.ponerProcedencia = (prov, cant) => { c("provincia").value = prov || ""; cantones(); c("canton").value = cant || ""; };
    yo.deAfuera = deAfuera;
    let sinResultadoPorNombre = false;
    function bloquearNombre(si) {
      [c("nombre"), c("apellidos")].forEach((x) => { x.readOnly = si; x.classList.toggle("metro-bloqueado", si); });
      q("[data-nombre-bloqueado]").classList.toggle("hidden", !si);
    }
    el.querySelectorAll('input[name="' + k + '-origen"]').forEach((r) => r.addEventListener("change", () => {
      const afuera = deAfuera();
      yo.elegido = null; pintarElegido(); bloquearNombre(false);
      buscarEl.value = ""; q("[data-resultados]").textContent = ""; q("[data-estado-fide]").textContent = "";
      q("[data-caja-nombre-fide]").classList.add("hidden"); sinResultadoPorNombre = false;
      if (afuera) {
        ["nacionalidad", "pais_residencia"].forEach((n) => { if (/^costa rica$/i.test(v(n))) c(n).value = ""; });
        if (c("documento_tipo").value === "cedula") c("documento_tipo").value = "pasaporte";
        if (selFed.value === "CRC") selFed.value = "";
      } else {
        ["nacionalidad", "pais_residencia"].forEach((n) => { if (!v(n)) c(n).value = "Costa Rica"; });
        if (!selFed.value) selFed.value = "CRC";
      }
      recalcular();
    }));

    /* ---------- el ID FIDE ---------- */
    let espera = null, turno = 0;
    const buscarEl = q("[data-buscar]");
    buscarEl.addEventListener("input", () => {
      clearTimeout(espera);
      if (deAfuera()) {
        // De otro país: solo el número del ID FIDE.
        const id = buscarEl.value.replace(/\D+/g, "").slice(0, 12);
        if (buscarEl.value !== id) buscarEl.value = id;
        if (id.length < 4) { q("[data-resultados]").textContent = ""; q("[data-estado-fide]").textContent = id ? "Escribe el número completo del ID FIDE." : ""; return; }
        q("[data-estado-fide]").textContent = "Buscando el ID FIDE " + id + "…";
        espera = setTimeout(() => buscar(id), 650);
        return;
      }
      const t = buscarEl.value.replace(/\s+/g, " ").trim();
      if (t.length < 3) { q("[data-resultados]").textContent = ""; q("[data-estado-fide]").textContent = t ? "Escribe al menos 3 letras." : ""; return; }
      q("[data-estado-fide]").textContent = "Buscando en la lista de FIDE…";
      espera = setTimeout(() => buscar(t), 650);
    });
    buscarEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { const b = q("[data-resultados] button"); if (b) { e.preventDefault(); b.focus(); } }
      if (e.key === "Enter") e.preventDefault();
    });
    /* Busca en FIDE. `desdeNombre`: la buscó escribir el nombre y los
       apellidos (no el buscador); si hay UNA sola persona se carga sola, y lo
       encontrado se enseña debajo de los nombres. */
    async function buscar(t, desdeNombre) {
      const mio = ++turno;
      let r = cacheFide.get(t.toLowerCase());
      if (!r) { r = await window.PareoEloNacional.buscarEnLista("fide", t); if (r && r.ok) cacheFide.set(t.toLowerCase(), r); }
      if (mio !== turno) return;
      const lista = q(desdeNombre ? "[data-resultados-nombre]" : "[data-resultados]"), est = q(desdeNombre ? "[data-estado-nombre]" : "[data-estado-fide]");
      lista.textContent = "";
      if (desdeNombre) q("[data-caja-nombre-fide]").classList.remove("hidden");
      if (!r || !r.ok) { est.textContent = (r && r.error) || "No se pudo buscar en FIDE. Revisa la conexión e intenta de nuevo."; return; }
      if (desdeNombre && r.filas.length === 1) { elegir(r.filas[0], true); return; }
      if (!desdeNombre && deAfuera()) {
        // Un ID es una persona: la del número exacto, o nadie.
        const exacto = r.filas.find((f) => String(f.fideId) === t);
        if (exacto) { elegir(exacto, false); return; }
        est.textContent = "No hay ningún jugador con el ID FIDE " + t + ". Revisa el número en ratings.fide.com; si no tiene ID FIDE, marca «No tiene ID FIDE».";
        return;
      }
      if (desdeNombre && !r.filas.length) { sinResultadoPorNombre = true; recalcular(); }
      if (!r.filas.length) {
        est.textContent = desdeNombre
          ? "No aparece en FIDE con ese nombre y apellidos. Si tiene ID FIDE, búsquelo en el buscador de arriba por el primer apellido o por el número; si no tiene, marque «No tiene ID FIDE»."
          : "No aparece con ese nombre. Prueba solo con el primer apellido, o con el ID FIDE. Si no tiene, marca «No tiene ID FIDE».";
        return;
      }
      est.textContent = r.filas.length === 1 ? "1 jugador encontrado. Tócalo para elegirlo."
        : (desdeNombre ? "En FIDE hay " + r.filas.length + " personas con ese nombre" : r.filas.length + " jugadores encontrados")
          + (r.hayMas ? " (hay más: escribe más del nombre)" : "") + ". Toca el que es.";
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
        b.addEventListener("click", () => elegir(f, desdeNombre));
        b.addEventListener("keydown", (e) => {
          const todos = [...lista.querySelectorAll("button")], i = todos.indexOf(b);
          if (e.key === "ArrowDown" && todos[i + 1]) { e.preventDefault(); todos[i + 1].focus(); }
          if (e.key === "ArrowUp") { e.preventDefault(); (todos[i - 1] || (desdeNombre ? c("apellidos") : buscarEl)).focus(); }
        });
        li.append(b); lista.append(li);
      });
    }
    function elegir(f, desdeNombre) {
      yo.elegido = f;
      q("[data-resultados]").textContent = ""; q("[data-estado-fide]").textContent = "";
      q("[data-resultados-nombre]").textContent = "";
      buscarEl.value = f.fideId;
      // Si lo escribió la persona, su nombre se queda como lo escribió (FIDE
      // no lleva tildes: «Jimenez» por «Jiménez»). Desde el buscador, se llena.
      const [ap, no] = String(f.nombre).split(",").map((x) => (x || "").trim());
      if (deAfuera()) {
        // De otro país: el nombre es el de FIDE, y no se cambia.
        c("nombre").value = no || ""; c("apellidos").value = ap || "";
        bloquearNombre(true);
      } else if (!desdeNombre) {
        if (no) { c("nombre").value = no; c("apellidos").value = ap; } else if (!c("apellidos").value) c("apellidos").value = ap;
      }
      const est = q("[data-estado-nombre]");
      est.textContent = "✓ ID FIDE " + f.fideId + " cargado: " + (f.titulo ? f.titulo + " " : "") + f.nombre + " · " + f.fed
        + (f.nacimiento ? " · nacido en " + f.nacimiento : "") + " · Elo estándar " + (f.estandar || "sin Elo") + ". Si no es esta persona, búsquela arriba.";
      pintarTitulo();
      q("[data-caja-nombre-fide]").classList.remove("hidden");
      pintarElegido(); recalcular();
      if (!desdeNombre) q("[data-elegido]").focus();
    }

    // Al escribir el nombre y los apellidos se busca solo en FIDE, como
    // «Apellidos, Nombre» (lo que mejor encuentra su buscador) y sin tildes.
    let esperaNombre = null;
    const buscarPorNombre = () => {
      clearTimeout(esperaNombre);
      const rol = yo.rol();
      if (yo.elegido || sinFide() || deAfuera() || (rol !== "jugador" && rol !== "entrenador")) return;
      sinResultadoPorNombre = false;
      const limpio = (x) => v(x).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z ,.'-]+/g, " ").replace(/\s+/g, " ").trim();
      const nom = limpio("nombre"), ape = limpio("apellidos");
      if (nom.length < 2 || ape.length < 2) { q("[data-caja-nombre-fide]").classList.add("hidden"); return; }
      q("[data-caja-nombre-fide]").classList.remove("hidden");
      q("[data-estado-nombre]").textContent = "Buscando su ID FIDE…";
      esperaNombre = setTimeout(() => buscar(ape + ", " + nom, true), 800);
    };
    c("nombre").addEventListener("input", buscarPorNombre);
    c("apellidos").addEventListener("input", buscarPorNombre);
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
      b.addEventListener("click", () => {
        yo.elegido = null; pintarElegido(); q("[data-caja-nombre-fide]").classList.add("hidden");
        if (deAfuera()) { bloquearNombre(false); c("nombre").value = ""; c("apellidos").value = ""; }
        else sinResultadoPorNombre = true;
        recalcular(); buscarEl.value = ""; buscarEl.focus();
      });
      caja.append(t, d, b);
    }
    el.querySelectorAll('input[name="' + k + '-fide"]').forEach((r) => r.addEventListener("change", () => {
      if (sinFide()) { yo.elegido = null; pintarElegido(); bloquearNombre(false); }
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
      const afuera = deAfuera();
      const tit = esTitulado();
      q("[data-caja-procedencia]").classList.toggle("hidden", afuera);
      q("[data-caja-viaje]").classList.toggle("hidden", !afuera);
      q("[data-caja-hosp-alim]").classList.toggle("hidden", tit);
      q("[data-caja-titulado]").classList.toggle("hidden", !tit);
      q("[data-caja-docs]").classList.toggle("hidden", !(tit && afuera));
      el.querySelectorAll("[data-ast-viaje]").forEach((x) => x.classList.toggle("hidden", !(tit && afuera)));
      if (tit) q("[data-titulado-texto]").textContent = "Como " + yo.elegido.titulo + ", no paga la inscripción y la organización le da el hospedaje y la alimentación"
        + (afuera ? " según las fechas de su vuelo. Solo necesitamos su viaje: los días de llegada y de salida como en el tiquete, el número de vuelo, la foto del tiquete aéreo y la del pasaporte, y si necesita transporte del aeropuerto al Estadio Nacional."
          : ". La organización lo coordina con usted por correo.");
      q("[data-titulo-viaje]").textContent = tit ? (afuera ? "Su viaje" : "De dónde viene")
        : afuera ? "Viaje, hospedaje y alimentación" : "De dónde viene, hospedaje y alimentación";
      q("[data-origen-ayuda]").textContent = sinFide() ? "" : afuera
        ? "Escribe primero el ID FIDE (el número): el nombre se llena solo, tal como aparece en FIDE, y no se puede cambiar."
        : "Escribe el nombre y los apellidos abajo, como en la cédula: el ID FIDE se busca y se carga solo.";
      q("[data-origen-ayuda]").classList.toggle("hidden", sinFide());
      // De Costa Rica, el buscador es solo el respaldo: aparece si por el nombre no se encontró.
      q("[data-caja-buscar]").classList.toggle("hidden", !afuera && !sinResultadoPorNombre);
      q("[data-buscar-etiqueta]").textContent = afuera ? "ID FIDE (el número)" : "¿No aparece? Búsquelo por el primer apellido o por el ID FIDE";
      buscarEl.inputMode = afuera ? "numeric" : "text";
      buscarEl.placeholder = afuera ? "Ejemplo: 3500000" : "Ejemplo: Mora, Ana  —  o  6400000";
      q("[data-buscar-ayuda]").textContent = afuera ? "Está en el perfil del jugador en ratings.fide.com." : "Buscamos en la lista oficial de FIDE mientras escribes. Toca el nombre para elegirlo.";
      q("[data-sin-fide]").classList.toggle("hidden", !(sinFide() && juega));
      q("[data-fed-cr]").classList.toggle("hidden", selFed.value !== "CRC");
      q("[data-fed-fuera]").classList.toggle("hidden", selFed.value === "CRC");
      q("[data-bloque-torneos]").classList.toggle("hidden", !juega);
      q("[data-caja-codigo]").classList.toggle("hidden", !juega || esTitulado());
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
      pintarAcompanantes();
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

    /* ---------- el código de descuento ---------- */
    yo.codigo = null;   // { codigo, porcentaje } ya comprobado con la base
    const entradaCodigo = q("[data-codigo-entrada]"), estadoCodigo = q("[data-codigo-estado]");
    function pintarCodigo() {
      estadoCodigo.textContent = "";
      if (!yo.codigo) return;
      const t = document.createElement("span"); t.className = "font-semibold";
      t.textContent = "✓ Código " + yo.codigo.codigo + ": " + (yo.codigo.porcentaje === 100 ? "la inscripción no tiene costo." : yo.codigo.porcentaje + " % de descuento.");
      const b = document.createElement("button"); b.type = "button"; b.className = "ml-2 underline text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded"; b.textContent = "Quitar el código";
      b.addEventListener("click", () => { yo.codigo = null; entradaCodigo.value = ""; entradaCodigo.disabled = false; pintarCodigo(); recalcular(); entradaCodigo.focus(); });
      estadoCodigo.append(t, b);
    }
    q("[data-codigo-aplicar]").addEventListener("click", async () => {
      const cod = entradaCodigo.value.trim().toUpperCase();
      if (!/^MET-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cod)) { estadoCodigo.textContent = "El código tiene la forma MET-XXXX-XXXX."; return; }
      if (personas.some((p) => p !== yo && p.codigo && p.codigo.codigo === cod)) { estadoCodigo.textContent = "Ese código ya está en otra persona de esta inscripción: vale una sola vez."; return; }
      estadoCodigo.textContent = "Revisando el código…";
      const { data, error } = await window.sb.rpc("metropolitano_codigo_ver", { p_codigo: cod });
      if (error || !data || !data.ok) { estadoCodigo.textContent = (data && data.error) || "No se pudo revisar el código. Intenta de nuevo."; return; }
      yo.codigo = { codigo: data.codigo, porcentaje: data.porcentaje };
      entradaCodigo.value = data.codigo; entradaCodigo.disabled = true;
      pintarCodigo(); recalcular();
    });

    /* ---------- el tiquete y el pasaporte (titulados de afuera) ---------- */
    yo.docs = { tiquete: null, pasaporte: null };
    el.querySelectorAll("[data-doc]").forEach((inp) => inp.addEventListener("change", () => {
      const a = inp.files[0], cual = inp.dataset.doc;
      inp.value = "";
      if (!a) return;
      const est = q('[data-doc-estado="' + cual + '"]');
      if (!/^image\//.test(a.type) && !/\.pdf$/i.test(a.name)) { est.textContent = "«" + a.name + "» no sirve: sube una foto o un PDF."; return; }
      yo.docs[cual] = { archivo: a, ruta: null };
      est.textContent = "Elegido: " + a.name;
    }));

    /* ---------- copiar lo del delegado a una persona nueva ---------- */
    yo.copiarDe = (otra) => {
      ["nacionalidad", "pais_residencia", "club", "llegada", "salida", "vuelo", "hospedaje_desde", "hospedaje_hasta", "habitacion", "comidas_desde", "comidas_hasta", "documento_tipo"]
        .forEach((n) => { if (c(n) && otra.el.querySelector('[data-c="' + n + '"]')) c(n).value = otra.el.querySelector('[data-c="' + n + '"]').value; });
      c("traslado").checked = otra.el.querySelector('[data-c="traslado"]').checked;
      el.querySelector('input[name="' + k + '-origen"][value="' + (otra.deAfuera() ? "fuera" : "cr") + '"]').checked = true;
      yo.ponerProcedencia(otra.v("provincia"), otra.v("canton"));
      el.querySelector('input[name="' + k + '-hosp"][value="' + (otra.hospeda() ? "si" : "no") + '"]').checked = true;
      const suyas = otra.comidas();
      el.querySelectorAll("[data-comida]").forEach((x) => { x.checked = suyas.includes(x.value); });
      // Para una emergencia, si no se dice otra cosa, se llama al delegado.
      c("emer_nombre").value = [otra.v("nombre"), otra.v("apellidos")].filter(Boolean).join(" ");
      c("emer_parentesco").value = "Delegado";
      c("emer_telefono").value = otra.v("telefono");
      if (c("habitacion").value === "organizacion") c("habitacion").value = "compartida";
    };
    yo.hospeda = hospeda; yo.comidas = comidas;

    /* ---------- lo que se manda, y lo que falta ---------- */
    yo.armar = (metodo) => {
      const rol = yo.rol(), nac = v("nacimiento"), e = R.edad(nac, R.INICIO);
      const f = sinFide() ? null : yo.elegido;
      const errores = [];
      const contactoObligatorio = !esGrupo() || yo.esDelegado;
      const falta = (campo, texto) => errores.push([campo, texto]);
      if ((rol === "jugador" || rol === "entrenador") && !sinFide() && !f) falta(deAfuera() ? buscarEl : c("apellidos"), deAfuera()
        ? "Escribe el ID FIDE para cargar el nombre, o marca «No tiene ID FIDE»."
        : "Escribe el nombre y los apellidos para cargar el ID FIDE y elige a la persona, o marca «No tiene ID FIDE».");
      if (rol === "jugador" && sinFide() && !selFed.value) falta(selFed, "Elige el país de su federación.");
      if (!v("nombre") || !v("apellidos")) falta(c(!v("nombre") ? "nombre" : "apellidos"), "Falta el nombre completo.");
      if (!nac) falta(c("nacimiento"), "Falta la fecha de nacimiento.");
      if (!v("sexo")) falta(c("sexo"), "Falta el sexo.");
      if (v("nacionalidad").length < 2 || v("pais_residencia").length < 2) falta(c("nacionalidad"), "Falta la nacionalidad o el país donde vive.");
      if (v("documento").length < 4) falta(c("documento"), "Falta el número de documento.");
      if (!deAfuera() && (!v("provincia") || !v("canton"))) falta(c(!v("provincia") ? "provincia" : "canton"), "Falta la provincia o el cantón donde vive.");
      if ((contactoObligatorio || v("correo")) && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v("correo"))) falta(c("correo"), "Revisa el correo electrónico.");
      if ((contactoObligatorio || v("telefono")) && v("telefono").replace(/\D/g, "").length < 7) falta(c("telefono"), "Revisa el teléfono.");
      if (e !== null && e < 18 && (!v("resp_nombre") || !v("resp_telefono"))) falta(c("resp_nombre"), "Es menor de edad: faltan el nombre y el teléfono de la persona responsable.");
      if (!v("emer_nombre") || !v("emer_telefono")) falta(c("emer_nombre"), "Falta el contacto para una emergencia.");
      if (rol === "jugador" && !yo.torneos().length) falta(q("[data-blitz]"), "Elige al menos un torneo.");
      if (hospeda() && (!v("hospedaje_desde") || !v("hospedaje_hasta") || v("hospedaje_desde") >= v("hospedaje_hasta"))) falta(c("hospedaje_desde"), "Revisa las fechas del hospedaje.");
      if (hospeda() && !c("acepta_compartir").checked) falta(c("acepta_compartir"), "Falta aceptar que la habitación es compartida.");
      if (hospeda()) yo.acompanantes().forEach((a, i) => {
        if (a.nombre.length < 5 || a.documento.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(a.nacimiento || "")) {
          falta(q('[data-acomp="' + i + '"] input'), "Faltan los datos del acompañante " + (i + 1) + ": nombre completo, documento y fecha de nacimiento.");
        }
      });
      if (comidas().length && (!v("comidas_desde") || !v("comidas_hasta") || v("comidas_desde") > v("comidas_hasta"))) falta(c("comidas_desde"), "Revisa los días de la alimentación.");
      if (!yo.foto) falta(inFoto, "Falta la foto tamaño pasaporte.");
      if (esTitulado() && deAfuera()) {
        if (!v("llegada") || !v("salida") || v("salida") <= v("llegada") || v("vuelo").length < 3) falta(c("llegada"), "Faltan los datos del vuelo: el día de llegada, el de salida y el número de vuelo.");
        if (!yo.docs.tiquete) falta(q('[data-doc="tiquete"]'), "Falta la foto del tiquete aéreo.");
        if (!yo.docs.pasaporte) falta(q('[data-doc="pasaporte"]'), "Falta la foto del pasaporte.");
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v("correo")) || v("telefono").replace(/\D/g, "").length < 7) falta(c("correo"), "Faltan su correo y su teléfono, para coordinar el viaje.");
      }
      const datos = {
        rol, es_delegado: yo.esDelegado,
        sin_fide: !f, fide_id: f ? f.fideId : null, nombre_fide: f ? f.nombre : null, federacion: f ? f.fed : (rol === "jugador" ? selFed.value : null), titulo: f ? f.titulo : "",
        elo_estandar: f ? f.estandar : null, elo_rapido: f ? f.rapido : null, elo_blitz: f ? f.blitz : null,
        nombre: v("nombre"), apellidos: v("apellidos"), sexo: v("sexo"), nacimiento: nac,
        nacionalidad: v("nacionalidad"), pais_residencia: v("pais_residencia"),
        documento_tipo: v("documento_tipo"), documento: v("documento"), correo: v("correo"), telefono: v("telefono"), club: v("club"),
        torneos: yo.torneos(),
        responsable: e !== null && e < 18 ? { nombre: v("resp_nombre"), parentesco: v("resp_parentesco"), documento: v("resp_documento"), telefono: v("resp_telefono") } : null,
        emergencia: { nombre: v("emer_nombre"), parentesco: v("emer_parentesco"), telefono: v("emer_telefono") },
        // El viaje, solo de quien viene de otro país; de Costa Rica, la provincia y el cantón.
        viaje: deAfuera() && (v("llegada") || v("salida") || v("vuelo") || c("traslado").checked) ? { llegada: v("llegada"), salida: v("salida"), vuelo: v("vuelo"), traslado: c("traslado").checked } : null,
        provincia: deAfuera() ? null : v("provincia"), canton: deAfuera() ? null : v("canton"),
        hospedaje: hospeda(), hospedaje_desde: hospeda() ? v("hospedaje_desde") : null, hospedaje_hasta: hospeda() ? v("hospedaje_hasta") : null,
        habitacion: hospeda() ? v("habitacion") : null, acompanantes: hospeda() ? Number(v("acompanantes")) || 0 : 0,
        acepta_compartir: hospeda() && c("acepta_compartir").checked, acompanantes_detalle: hospeda() ? yo.acompanantes() : [],
        origen: deAfuera() ? "fuera" : "cr",
        comidas: comidas(), comidas_desde: comidas().length ? v("comidas_desde") : null, comidas_hasta: comidas().length ? v("comidas_hasta") : null,
        dieta: v("dieta"), condicion: condicion(), accesibilidad: v("accesibilidad"),
        acepta_publicidad: c("acepta_publicidad").checked,
      };
      const precio = R.precio({ rol, torneos: datos.torneos, metodo: metodo || "dolares", hoy, nacimiento: nac, titulo: datos.titulo, factura: quiereFactura(),
        descuento: yo.codigo && !esTitulado() ? yo.codigo.porcentaje : 0 });
      const conCodigo = !!yo.codigo && rol === "jugador" && datos.torneos.length > 0 && !esTitulado();
      datos.codigo = conCodigo ? yo.codigo.codigo : null;
      datos.codigo_pct = conCodigo ? yo.codigo.porcentaje : null;
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
  /* «Seguro y responsabilidad»: a los nacionales se les pide la póliza que
     cubre el evento; el seguro de viaje, solo si en la inscripción viene
     alguien de otro país. La base guarda cuál de los dos textos se aceptó
     (exoneracion_version). */
  function pintarSeguro() {
    const caja = $("acepta-seguro-texto");
    if (!caja) return;
    const afuera = personas.some((p) => p.deAfuera());
    const fuerte = document.createElement("strong"); fuerte.textContent = "Seguro y responsabilidad.";
    const ast = document.createElement("span"); ast.className = "text-red-700 dark:text-red-400"; ast.textContent = "*";
    caja.textContent = "";
    caja.append(fuerte, " Declaro que cada persona de esta inscripción, y cada acompañante que se anota con ella, cuenta con una póliza de seguro vigente que la cubre durante todo el evento —de gastos médicos y de accidentes—"
      + (afuera ? " y, quien viene de otro país, además con un seguro de viaje que la cubre durante toda su estadía en Costa Rica," : "")
      + " y que el costo de esa póliza no corre por cuenta de la organización. Cada persona participa por su propia voluntad y asume los riesgos propios de la competencia, "
      + (afuera ? "del viaje, del hospedaje y de la estadía" : "de los traslados y del hospedaje")
      + ". Por eso eximo a la Federación Costarricense de Ajedrez, a la organización del torneo, a su cuerpo arbitral y a Ajedrez Integral de toda responsabilidad por accidentes, lesiones, enfermedades, pérdidas, robos o daños a las personas o a sus pertenencias, antes, durante o después de las rondas, también en el hospedaje, y renuncio a cobrarles gastos médicos, de traslado, indemnizaciones o cualquier otro costo, y a demandarlos por esos hechos, salvo en lo que la ley no permita renunciar. Si inscribo a un menor de edad, acepto esto como su madre, padre o persona encargada, o con su autorización. ", ast);
  }

  function totales() {
    pintarSeguro();
    if (!personas.length) return null;
    const lineas = [], avisos = new Set();
    let usd = 0, iva = 0, gratisTodo = true;
    personas.forEach((p, i) => {
      const { datos, precio } = p.armar(metodo);
      const quien = [datos.nombre, datos.apellidos].filter(Boolean).join(" ") || "Persona " + (i + 1);
      if (datos.rol === "jugador" && datos.torneos.length) {
        precio.lineas.forEach((l) => lineas.push(quien + " — " + l.texto + ": " + R.dinero(l.usd)));
        precio.avisos.forEach((a) => avisos.add(a));
      } else if (datos.rol !== "jugador") lineas.push(quien + " — " + (p.esDelegado ? "delegado" : R.rolDe(datos.rol, datos.sexo).toLowerCase()) + ": sin costo de inscripción");
      usd += precio.usd;
      iva += precio.iva;
      if (datos.rol === "jugador" && !precio.gratis) gratisTodo = false;
    });
    usd = Math.round(usd * 100) / 100;
    iva = Math.round(iva * 100) / 100;
    if (iva > 0) lineas.push("IVA del 13 % (factura electrónica): " + R.dinero(iva));
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
    // Sin nada que cobrar no hay factura que pedir.
    $("caja-factura-todo").classList.toggle("hidden", usd === 0 && iva === 0);
    return { usd, crc, iva, lineas, gratisTodo };
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

  /* ---------- la factura electrónica (Hacienda) ---------- */
  const quiereFactura = () => $("quiere-factura").checked;
  Object.entries(R.FACTURA_TIPOS).forEach(([k, T]) => { const o = document.createElement("option"); o.value = k; o.textContent = T.nombre; $("fac_tipo").append(o); });
  const opciones = (sel, lista, primera) => {
    sel.textContent = "";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = primera; sel.append(o0);
    lista.forEach((x) => { const o = document.createElement("option"); o.value = x; o.textContent = x; sel.append(o); });
  };
  const DT = window.DivisionTerritorial || [];
  opciones($("fac_provincia"), DT.map((x) => x.provincia), "Elige la provincia…");
  opciones($("fac_canton"), [], "Primero la provincia");
  opciones($("fac_distrito"), [], "Primero el cantón");
  const provinciaDe = () => DT.find((x) => x.provincia === $("fac_provincia").value);
  $("fac_provincia").addEventListener("change", () => {
    const pr = provinciaDe();
    opciones($("fac_canton"), pr ? pr.cantones.map((c) => c.canton) : [], pr ? "Elige el cantón…" : "Primero la provincia");
    opciones($("fac_distrito"), [], "Primero el cantón");
  });
  $("fac_canton").addEventListener("change", () => {
    const pr = provinciaDe(), ca = pr && pr.cantones.find((c) => c.canton === $("fac_canton").value);
    opciones($("fac_distrito"), ca ? ca.distritos : [], ca ? "Elige el distrito…" : "Primero el cantón");
  });
  function tipoFactura() {
    const T = R.FACTURA_TIPOS[$("fac_tipo").value];
    $("fac_id_ayuda").textContent = T ? T.ayuda : "";
    $("fac_direccion").classList.toggle("hidden", $("fac_tipo").value === "extranjero");
  }
  $("fac_tipo").addEventListener("change", tipoFactura);
  tipoFactura();
  $("quiere-factura").addEventListener("change", () => { $("caja-factura").classList.toggle("hidden", !quiereFactura()); totales(); });
  const datosFactura = () => ({
    tipo: $("fac_tipo").value, identificacion: $("fac_id").value.replace(/[\s-]/g, ""), nombre: $("fac_nombre").value.trim(),
    comercial: $("fac_comercial").value.trim(), correo: $("fac_correo").value.trim(), correo_copia: $("fac_copia").value.trim(),
    telefono: $("fac_tel").value.trim(), actividad: $("fac_actividad").value.trim(),
    provincia: $("fac_tipo").value === "extranjero" ? "" : $("fac_provincia").value, canton: $("fac_tipo").value === "extranjero" ? "" : $("fac_canton").value,
    distrito: $("fac_tipo").value === "extranjero" ? "" : $("fac_distrito").value, senas: $("fac_tipo").value === "extranjero" ? "" : $("fac_senas").value.trim(),
  });
  // Lo mismo que revisa interno.metropolitano_factura(), dicho antes de mandar.
  function erroresFactura() {
    const f = datosFactura(), T = R.FACTURA_TIPOS[f.tipo], e = [];
    const correoBueno = (x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x);
    if (!T) e.push([$("fac_tipo"), "Factura: elige el tipo de identificación."]);
    else if (!T.patron.test(f.identificacion)) e.push([$("fac_id"), "Factura: revisa el número de identificación (" + T.ayuda + ")."]);
    if (f.nombre.length < 2) e.push([$("fac_nombre"), "Factura: falta el nombre o la razón social."]);
    if (!correoBueno(f.correo)) e.push([$("fac_correo"), "Factura: revisa el correo para recibirla."]);
    if (f.correo_copia && !correoBueno(f.correo_copia)) e.push([$("fac_copia"), "Factura: revisa el correo de copia."]);
    if (f.telefono && !/^\d{8,15}$/.test(f.telefono.replace(/\D/g, ""))) e.push([$("fac_tel"), "Factura: revisa el teléfono."]);
    if (f.actividad && !/^[0-9.]{4,10}$/.test(f.actividad)) e.push([$("fac_actividad"), "Factura: revisa el código de actividad económica."]);
    if (f.tipo !== "extranjero" && (!f.provincia || !f.canton || !f.distrito || !f.senas)) e.push([$("fac_provincia"), "Factura: falta la dirección (provincia, cantón, distrito y otras señas)."]);
    return e;
  }

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
    if (t.usd > 0 && quiereFactura()) errores.push(...erroresFactura());
    if (!$("acepta-reglamento").checked || !$("acepta-imagen").checked || !$("acepta-seguro").checked || !$("acepta-datos").checked) errores.push([$("acepta-reglamento"), "Falta marcar las cuatro casillas del final."]);
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
      if (d.codigo) filas.push(["Código de descuento", d.codigo + (d.codigo_pct === 100 ? ": inscripción sin costo" : ": " + d.codigo_pct + " % de descuento")]);
    }
    filas.push(
      ["Nacimiento", fechaLarga(d.nacimiento) + " (" + R.edad(d.nacimiento, R.INICIO) + " años al 26 de diciembre)"],
      ["Nacionalidad / vive en", d.nacionalidad + " / " + d.pais_residencia],
      [NOMBRE_DOC[d.documento_tipo], d.documento],
      ["Contacto", [d.correo, d.telefono].filter(Boolean).join(" · ") || "Por medio del delegado"],
    );
    if (d.responsable) filas.push(["Responsable", d.responsable.nombre + " · " + d.responsable.telefono]);
    filas.push(["Emergencias", d.emergencia.nombre + (d.emergencia.parentesco ? " (" + d.emergencia.parentesco + ")" : "") + " · " + d.emergencia.telefono]);
    if (p.titulado()) filas.push(["Hospedaje y alimentación", "Los da la organización" + (d.viaje && d.viaje.llegada ? ", del " + fechaLarga(d.viaje.llegada) + " al " + fechaLarga(d.viaje.salida) + ", según su vuelo" : "")]);
    else filas.push(
      ["Hospedaje", d.hospedaje ? "Del " + fechaLarga(d.hospedaje_desde) + " al " + fechaLarga(d.hospedaje_hasta) + ", en habitación compartida "
        + (d.habitacion === "compartida" ? "con su familia, su delegación o sus acompañantes" : "con quien asigne la organización")
        + (d.acompanantes_detalle.length ? ". Acompañantes: " + d.acompanantes_detalle.map((a) => a.nombre + (a.parentesco ? " (" + a.parentesco + ")" : "")).join(", ") : "") : "No requiere"],
      ["Alimentación", d.comidas.length ? d.comidas.join(", ") + " del " + fechaLarga(d.comidas_desde) + " al " + fechaLarga(d.comidas_hasta) + (d.dieta ? " · " + d.dieta : "") : "No requiere"],
    );
    if (d.provincia) filas.push(["Viene de", d.canton + ", " + d.provincia]);
    if (d.viaje) filas.push(["Viaje", [d.viaje.llegada && "llega el " + fechaLarga(d.viaje.llegada), d.viaje.salida && "sale el " + fechaLarga(d.viaje.salida), d.viaje.vuelo, d.viaje.traslado && "con transporte del aeropuerto al Estadio Nacional"].filter(Boolean).join(", ")]);
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
    if (envio.total.iva > 0) {
      const f = datosFactura(), T = R.FACTURA_TIPOS[f.tipo];
      const fp = document.createElement("p"); fp.className = "mt-2";
      fp.textContent = "Factura electrónica a nombre de " + f.nombre + " (" + T.nombre + " " + f.identificacion + "), a " + f.correo
        + (f.tipo !== "extranjero" ? ". Dirección: " + [f.distrito, f.canton, f.provincia].join(", ") + ", " + f.senas : "") + ".";
      tot.append(fp);
    }
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
        const extra = { foto: await subir(x.p.foto, "foto") };
        if (x.p.titulado() && x.p.deAfuera()) {
          msg.textContent = "Subiendo el tiquete y el pasaporte…";
          extra.tiquete = await subir(x.p.docs.tiquete, "documento");
          extra.pasaporte = await subir(x.p.docs.pasaporte, "documento");
        }
        lista.push(Object.assign({}, x.datos, extra));
      }
      let rutaComp = null;
      if (envio.total.usd > 0) { msg.textContent = "Subiendo el comprobante…"; rutaComp = await subir(comprobante, "comprobante"); }
      msg.textContent = "Enviando la inscripción…";
      const p = {
        modo: esGrupo() ? "grupo" : "individual", delegacion: esGrupo() ? $("delegacion").value.trim() : null,
        personas: lista, pago_metodo: envio.total.usd > 0 ? metodo : null, comprobante: rutaComp,
        pago_referencia: $("referencia").value.trim(), pago_fecha: $("pago_fecha").value || null,
        factura: quiereFactura() && envio.total.usd > 0 ? datosFactura() : null,
        acepta_reglamento: $("acepta-reglamento").checked, acepta_imagen: $("acepta-imagen").checked, acepta_seguro: $("acepta-seguro").checked, acepta_datos: $("acepta-datos").checked,
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
