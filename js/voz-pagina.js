/* ===== Ajedrez Integral — «Activar voz» en todo el sitio =====
 *
 * Todo lo que una página avisa ya se escribe en regiones vivas (`aria-live`,
 * `role="status"`): «Se jugó torre david 1», «¡El profesor te dio el control!»,
 * «Ana te retó a una partida», «Guardado»… Un lector de pantalla las lee solas.
 * Pero quien ve poco muchas veces NO usa lector: agranda la letra y se acerca a
 * la pantalla, y lo que cambia no se entera. El botón 🔇/🗣️ del encabezado
 * hace que el propio navegador (Web Speech API, `BlindNotation.speak`) diga en
 * voz alta esas mismas regiones, en cualquier página, y las jugadas de sus
 * tableros (ver «Las jugadas del tablero», más abajo).
 *
 * Lo carga js/adaptive-mode.js (que ya está en todas las páginas con el
 * encabezado del sitio), así que una página nueva lo tiene sin hacer nada. No
 * sale en las páginas que traen su propio botón de voz (`#speech-toggle-btn`,
 * `#btn-voz`: Mates, Aprender, las partidas de Juegos, Sonar…): esas ya dicen
 * cada jugada a su manera, y dos botones para lo mismo es uno de más. La
 * preferencia es la misma (`oscarSpeechMode_v1`): quien la enciende en un
 * lado la tiene encendida en todos.
 *
 * Tres decisiones que no conviene deshacer:
 *
 * 1. SE LEE LO QUE YA SE ANUNCIA, NO UNA LISTA PROPIA. No hay un segundo juego
 *    de textos «para la voz»: se escuchan las regiones vivas de la página con un
 *    MutationObserver. Un aviso nuevo, si se escribe en una región viva (como
 *    debe, para el lector), se oye también acá sin tocar nada.
 *
 * 2. SOLO LO QUE ESTÁ A LA VISTA DE ESA PERSONA. Una región dentro de un panel
 *    escondido (el del profe, cuando entra un alumno) no habla, igual que no la
 *    leería un lector. La excepción es el aviso del recuadro de comandos
 *    (`.cc-msg`): fuera del Modo Adaptado el recuadro no se ve, pero sus avisos
 *    son justo las jugadas del profesor en la clase, lo primero que necesita
 *    oír quien ve poco. Ahí manda que se vea el lugar donde está montado.
 *
 * 3. LO QUE LLEGA JUNTO SE DICE EN FILA, NO CORTADO. `BlindNotation.speak`
 *    normal corta la frase anterior; acá se encola (`encolar: true`), para que
 *    la jugada del profe y el «te dio el control» se oigan los dos. Si se
 *    acumulan más de tres, se corta todo y se dice lo último: oír avisos viejos
 *    con un minuto de atraso es peor que perderse uno. Lo `assertive` corta.
 *
 * Y para que no hable de más:
 *   - una región que se vuelve a escribir con el MISMO texto (un cartel que se
 *     repinta con cada eco de Realtime) no se repite; sí si antes quedó vacía o
 *     escondida. Las `sr-only` existen solo para anunciar: esas se dicen siempre;
 *   - una región que cambia solo en los números (una cuenta atrás, un reloj) se
 *     dice como mucho cada 10 segundos;
 *   - lo que ya estaba escrito al cargar no se dice: se empieza a escuchar
 *     cuando `#app` se destapa (las páginas de la Academia lo esconden hasta
 *     tener sus datos) y lo que aparece en el primer segundo y medio se cuenta
 *     como parte de la página, no como aviso.
 *
 * El nombre del botón dice para quién es («solo si no usas lector de
 * pantalla»): con lector encendido, esta voz habla encima de la suya. Esa parte
 * la pone `BlindNotation.setupSpeechToggle`, igual que en Entrenamiento.
 */
window.VozPagina = (function () {
  "use strict";

  var REGION = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]';
  var MAX_LARGO = 400;
  var MAX_EN_FILA = 3;
  var CALMA_AL_CARGAR = 1500;
  var CADA_CUANTO_NUMEROS = 10000;

  var ultimo = new WeakMap();   // región → último texto dicho ("" si quedó vacía/escondida)
  var ultimoMolde = new WeakMap();   // región → { molde (sin números), en }
  var pendientes = new Set();
  var temporizador = null;
  var enFila = 0;
  var observador = null;
  var raizActual = null;

  function limpio(t) { return String(t || "").replace(/\s+/g, " ").trim(); }
  function hablando() { return !!(window.BlindNotation && BlindNotation.isSpeechEnabled()); }

  function seVe(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function") return el.checkVisibility();
    return !!(el.offsetParent || el.getClientRects().length);
  }

  /* El aviso del recuadro de comandos se juzga por dónde está montado: fuera del
     Modo Adaptado la caja es display:none, pero la jugada del profe se dice. */
  function visible(region) {
    if (region.classList.contains("cc-msg")) {
      var caja = region.closest(".cc-caja");
      return seVe(caja && caja.parentElement);
    }
    return seVe(region);
  }

  function recortar(t) {
    if (t.length <= MAX_LARGO) return t;
    var corte = t.lastIndexOf(". ", MAX_LARGO);
    return (corte > 80 ? t.slice(0, corte + 1) : t.slice(0, MAX_LARGO) + "…");
  }

  function decir(texto, urgente, escrito) {
    if (!hablando()) return;
    if (urgente || enFila >= MAX_EN_FILA) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
      enFila = 0;
    }
    var dicho = BlindNotation.speak(texto, {
      encolar: true,
      igualA: escrito,
      alTerminar: function () { enFila = Math.max(0, enFila - 1); },
    });
    if (dicho) enFila += 1;
  }

  function regionDe(nodo) {
    var el = nodo && (nodo.nodeType === 1 ? nodo : nodo.parentElement);
    return el ? el.closest(REGION) : null;
  }

  /* En el momento del cambio: si la región quedó vacía o escondida, se olvida lo
     último que dijo, para que el mismo aviso se vuelva a oír cuando reaparezca. */
  function anotar(region) {
    if (!region) return;
    if (!limpio(region.textContent) || !visible(region)) ultimo.set(region, "");
    pendientes.add(region);
    if (!temporizador) temporizador = setTimeout(leerPendientes, 150);
  }

  function leerPendientes() {
    temporizador = null;
    var regiones = Array.from(pendientes);
    pendientes.clear();
    if (!hablando()) return;
    regiones.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    var ahora = Date.now();
    regiones.forEach(function (region) {
      var texto = limpio(region.textContent);
      if (!texto || !visible(region)) { ultimo.set(region, ""); return; }
      var siempre = region.classList.contains("sr-only");
      if (!siempre && ultimo.get(region) === texto) return;
      /* Un reloj o una cuenta atrás: el mismo texto con otro número. */
      var molde = texto.replace(/\d+/g, "#");
      var antes = ultimoMolde.get(region);
      if (antes && antes.molde === molde && molde !== texto && ahora - antes.en < CADA_CUANTO_NUMEROS) {
        ultimo.set(region, texto);
        return;
      }
      ultimo.set(region, texto);
      ultimoMolde.set(region, { molde: molde, en: ahora });
      var urgente = region.getAttribute("aria-live") === "assertive" || region.getAttribute("role") === "alert";
      if (DICE_JUGADA.test(texto)) jugadaDichaEn = ahora;
      /* La respuesta del recuadro de comandos se dice entera: ahí se pide
         «posición», y cortarla a los 400 caracteres dejaba a las negras sin
         decir. Lo demás se recorta (listas largas que se repintan). */
      var entero = region.classList.contains("cc-msg");
      decir(entero ? jugadasEnPalabras(texto) : recortar(jugadasEnPalabras(texto)), urgente, texto);
    });
  }

  /* ---- Las jugadas escritas en un aviso, dichas en palabras ----
     Los avisos de los ejercicios escriben la jugada como se ve en una planilla
     («Dxf7+ es legal, pero…», «Elegiste e4.», «Jugaste O-O»), y la voz del
     navegador la deletrea: «de equis efe siete más». Acá se dice como en el
     resto del sitio: «dama captura felix 7 jaque», «eva 4», «enroque corto».
     Solo las letras en español (R D T A C), que son las que se ven en el sitio:
     la R en inglés es torre y en español es rey, y el sitio habla español. */
  var LETRA = { R: "rey", D: "dama", T: "torre", A: "alfil", C: "caballo" };
  var JUGADA_ESCRITA = /(^|[^0-9A-Za-zÁÉÍÓÚáéíóúÑñ])([RDTAC]?)([a-h]?[1-8]?)(x?)([a-h][1-8])(=[DTAC])?([+#]?)(?=$|[^0-9A-Za-zÁÉÍÓÚáéíóúÑñ])/g;
  function jugadasEnPalabras(texto) {
    if (!BlindNotation.squareSpoken) return texto;
    return texto
      .replace(/(^|[^A-Za-z0-9-])O-O-O([+#]?)/g, function (m, a, j) { return a + "enroque largo" + (j === "#" ? " jaque mate" : j ? " jaque" : ""); })
      .replace(/(^|[^A-Za-z0-9-])O-O(?!-)([+#]?)/g, function (m, a, j) { return a + "enroque corto" + (j === "#" ? " jaque mate" : j ? " jaque" : ""); })
      .replace(JUGADA_ESCRITA, function (m, antes, pieza, desde, x, destino, corona, jaque) {
        var partes = [];
        if (pieza) partes.push(LETRA[pieza]);
        if (desde) partes.push(/^[a-h]/.test(desde) ? BlindNotation.squareSpoken(desde[0] + "1").replace(/ 1$/, "") + desde.slice(1) : desde);
        if (x) partes.push("captura");
        partes.push(BlindNotation.squareSpoken(destino));
        if (corona) partes.push("corona " + LETRA[corona[1]]);
        if (jaque) partes.push(jaque === "#" ? "jaque mate" : "jaque");
        return antes + partes.join(" ");
      });
  }

  /* ---- Las jugadas del tablero ----
     Cada tablero del sitio ya dice en el aria-label de cada casilla qué hay en
     ella («Casilla e4: caballo blanco», «eva 4, torre blanca»): es lo que lee el
     lector al recorrerlo. Acá se compara esa foto antes y después de un cambio y
     se dice qué se movió: «Caballo blanco de gustav 1 a felix 3». Así sirve para
     todos los tableros (la clase, Juegos, los ejemplos de los artículos…) sin
     que cada uno tenga que avisar, y lo que el tablero oculta (piezas escondidas,
     la niebla) tampoco se dice, porque su casilla tampoco lo cuenta.
     - Si una región ya dijo la jugada («Se jugó…», «Jugaste…», «El motor
       jugó…»), el tablero se calla: la misma jugada no se oye dos veces.
     - Las miniaturas no hablan (menos de 180 px): en el panel del profe hay una
       por alumno, y se oirían todas a la vez.
     - Un tablero con las piezas ocultas, o que las vuelve a mostrar, no dice
       nada: pasar de todo a nada no es una jugada. */
  /* Sin \b al final: en JavaScript la «ó» no cuenta como letra, y «jugó» no
     calzaba nunca. */
  var DICE_JUGADA = /\bjug(?:ó|o|aste|aron)(?![a-záéíóúñ])|se deshizo|posición nueva|cambió la línea/i;
  var TABLERO_MIN = 180;
  var jugadaDichaEn = 0;
  var tableros = new WeakSet();
  var fotos = new WeakMap();   // tablero → { casilla: "caballo blanco" | "" | null (no se sabe) }
  var temporizadorTableros = null;

  function raizDeTablero(casilla) {
    var el = casilla.parentElement;
    while (el && el !== document.body) {
      if (tableros.has(el)) return el;
      if (el.querySelectorAll("[data-square][aria-label]").length >= 32) { tableros.add(el); return el; }
      el = el.parentElement;
    }
    return null;
  }

  /* Lo que hay en la casilla, según su nombre: "" vacía, null si no se sabe. */
  function piezaDe(etiqueta) {
    var t = limpio(etiqueta).toLowerCase();
    var i = t.indexOf(":");
    var resto = i >= 0 ? t.slice(i + 1) : (t.indexOf(",") >= 0 ? t.slice(t.indexOf(",") + 1) : "");
    resto = resto.split(",")[0].trim();
    if (!resto || /oculta|cubierta|niebla/.test(resto)) return null;
    if (/^(casilla )?vac[ií]a$/.test(resto)) return "";
    return resto;
  }

  function fotoDeTableros() {
    var porTablero = new Map();
    document.querySelectorAll("[data-square][aria-label]").forEach(function (c) {
      var t = raizDeTablero(c);
      if (!t) return;
      if (!porTablero.has(t)) porTablero.set(t, {});
      porTablero.get(t)[c.getAttribute("data-square")] = piezaDe(c.getAttribute("aria-label"));
    });
    return porTablero;
  }

  function casillaDicha(sq) {
    return /^[a-h][1-8]$/.test(sq) && BlindNotation.squareSpoken ? BlindNotation.squareSpoken(sq) : sq;
  }
  function mayuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /* Qué se movió entre dos fotos del mismo tablero, en una frase (o null). */
  function describirJugada(antes, despues) {
    var sale = [], entra = [], cambia = [], piezasAntes = 0, piezasDespues = 0;
    Object.keys(despues).forEach(function (sq) {
      var a = antes[sq], d = despues[sq];
      if (a) piezasAntes += 1;
      if (d) piezasDespues += 1;
      if (a === null || d === null || a === undefined || a === d) return;
      if (a && !d) sale.push(sq);
      else if (!a && d) entra.push(sq);
      else cambia.push(sq);
    });
    var total = sale.length + entra.length + cambia.length;
    if (!total || !piezasAntes || !piezasDespues) return null;
    if (sale.length === 1 && entra.length + cambia.length === 1) {
      var de = sale[0], a2 = entra[0] || cambia[0];
      var pieza = despues[a2], movida = antes[de];
      var frase = mayuscula(movida) + " de " + casillaDicha(de) + " a " + casillaDicha(a2);
      if (cambia.length) frase += ", captura " + antes[a2];
      if (/^pe[oó]n/.test(movida) && !/^pe[oó]n/.test(pieza)) frase += ", corona " + pieza.split(" ")[0];
      return frase + ".";
    }
    if (sale.length === 2 && entra.length === 2 && !cambia.length) {
      var rey = sale.filter(function (sq) { return /^rey\b/.test(antes[sq]); })[0];
      if (rey) {
        var color = antes[rey].replace(/^rey\s*/, "");
        return "Enroque" + (color ? " de " + (/blanc/.test(color) ? "las blancas" : /negr/.test(color) ? "las negras" : color) : "") + ".";
      }
    }
    if (sale.length === 2 && entra.length === 1 && !cambia.length) {
      var llega = entra[0], vino = sale.filter(function (sq) { return antes[sq] === despues[llega]; })[0];
      var comida = sale.filter(function (sq) { return sq !== vino; })[0];
      if (vino && comida) {
        return mayuscula(despues[llega]) + " de " + casillaDicha(vino) + " a " + casillaDicha(llega)
          + ", captura " + antes[comida] + " al paso.";
      }
    }
    if (!sale.length && entra.length === 1 && !cambia.length) {
      return "Se puso " + despues[entra[0]] + " en " + casillaDicha(entra[0]) + ".";
    }
    return total > 2 ? "Cambió la posición del tablero." : null;
  }

  function revisarTableros(callar) {
    temporizadorTableros = null;
    /* Si hay avisos de una región esperando a leerse, van primero: pueden ser la
       jugada dicha («Se jugó…»), y entonces el tablero se calla. El temporizador
       del tablero lo arranca CUALQUIER cambio de la página, así que a veces
       vencía justo antes que el de las regiones y la jugada se oía dos veces
       (una por el tablero, otra por el aviso). */
    if (temporizador && !callar) { temporizadorTableros = setTimeout(revisarTableros, 200); return; }
    var ahora = Date.now();
    actualizarBotonPosicion();
    fotoDeTableros().forEach(function (despues, tablero) {
      var antes = fotos.get(tablero);
      fotos.set(tablero, despues);
      if (callar || !antes || !hablando()) return;
      if (!seVe(tablero) || tablero.getBoundingClientRect().width < TABLERO_MIN) return;
      if (tablero.closest('[aria-hidden="true"]')) return;
      var frase = describirJugada(antes, despues);
      if (!frase || ahora - jugadaDichaEn < 1500) return;
      decir(frase, false);
    });
  }

  /* ---- «Decir la posición», a pedido ----
     Con la voz encendida y un tablero a la vista, en el encabezado, junto al
     🗣️, aparece un ♙ que dice la posición entera del tablero más grande que
     se ve:
     «Blancas: rey en eva 1; torres en anna 1 y hector 1… Negras: …». Se arma
     con lo mismo que las jugadas —lo que dice cada casilla—, así que lo que el
     tablero oculta tampoco se cuenta acá. Solo se ve mientras la voz está
     encendida y hay un tablero: a quien no la usa no le cambia nada.
     Fuera del Modo Adaptado era la única forma de pedirla: el recuadro donde se
     escribe «posición» y la tecla z del tablero son del Modo Adaptado. */
  var ORDEN = ["rey", "dama", "torre", "alfil", "caballo", "peón"];
  var PLURAL = { rey: "reyes", "peón": "peones", alfil: "alfiles" };
  function lista(xs) { return xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1]; }

  function posicionDicha(foto) {
    var casillas = Object.keys(foto).sort(function (a, b) {
      return a[0] === b[0] ? a.slice(1) - b.slice(1) : (a < b ? -1 : 1);
    });
    var desconocidas = casillas.filter(function (sq) { return foto[sq] === null; }).length;
    if (desconocidas === casillas.length) return "Las piezas están ocultas: el tablero no dice qué hay.";
    var bandos = { Blancas: {}, Negras: {} }, otras = {};
    casillas.forEach(function (sq) {
      var p = foto[sq];
      if (!p) return;
      var bando = /\bblanc/.test(p) ? "Blancas" : /\bnegr/.test(p) ? "Negras" : null;
      var nombre = bando ? p.replace(/\s+(blanc|negr)\S*.*$/, "") : p;
      var grupo = bando ? bandos[bando] : otras;
      (grupo[nombre] = grupo[nombre] || []).push(casillaDicha(sq));
    });
    function decirGrupo(g) {
      var nombres = Object.keys(g).sort(function (a, b) {
        var ia = ORDEN.indexOf(a), ib = ORDEN.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      return nombres.map(function (n) {
        var cs = g[n];
        return (cs.length > 1 ? (PLURAL[n] || n + "s") : n) + " en " + lista(cs);
      }).join("; ");
    }
    var partes = ["Blancas", "Negras"].map(function (b) {
      return b + ": " + (decirGrupo(bandos[b]) || "sin piezas") + ".";
    });
    if (Object.keys(otras).length) partes.push(mayuscula(decirGrupo(otras)) + ".");
    if (desconocidas) partes.push("Hay casillas que no se ven.");
    return partes.join(" ");
  }

  /* El tablero que se está mirando: el más grande de los que se ven. */
  function tableroPrincipal() {
    var mejor = null, area = 0;
    fotoDeTableros().forEach(function (foto, t) {
      if (!seVe(t) || t.closest('[aria-hidden="true"]')) return;
      var r = t.getBoundingClientRect();
      if (r.width < TABLERO_MIN || r.width * r.height <= area) return;
      mejor = { tablero: t, foto: foto };
      area = r.width * r.height;
    });
    return mejor;
  }

  var botonPosicion = null;
  function asegurarBotonPosicion() {
    if (botonPosicion) return botonPosicion;
    botonPosicion = document.createElement("button");
    botonPosicion.type = "button";
    botonPosicion.id = "voz-posicion";
    botonPosicion.hidden = true;
    botonPosicion.setAttribute("aria-label", "Decir la posición del tablero");
    botonPosicion.title = "Decir en voz alta la posición entera del tablero";
    /* «♙» y no «♟️»: el emoji sale negro sobre el azul del encabezado y no se
       ve; este se dibuja como letra, con el blanco de sus vecinos. */
    botonPosicion.innerHTML = '<span aria-hidden="true" style="font-size:1.4em;line-height:1;font-family:\'Segoe UI Symbol\',\'DejaVu Sans\',sans-serif">♙</span>';
    botonPosicion.addEventListener("click", function () {
      var t = tableroPrincipal();
      if (!t || !window.BlindNotation) return;
      BlindNotation.speak(posicionDicha(t.foto));
    });
    /* En el encabezado, junto al 🗣️ y con su misma forma: el encabezado queda
       siempre arriba y no tapa nada. Fijo sobre la página, en el celular tapaba
       casillas del tablero. */
    var voz = document.getElementById("voz-toggle");
    if (voz && voz.parentElement) {
      botonPosicion.className = voz.className;
      voz.after(botonPosicion);
    } else {
      botonPosicion.style.cssText = "position:fixed;left:1rem;bottom:1rem;z-index:45;min-height:44px;min-width:44px;" +
        "border-radius:.75rem;border:2px solid #f0b429;background:#102a43;color:#fff;font-size:1.25rem";
      document.body.appendChild(botonPosicion);
    }
    return botonPosicion;
  }
  function actualizarBotonPosicion() {
    var hay = hablando() && !!tableroPrincipal();
    if (!hay && !botonPosicion) return;
    asegurarBotonPosicion().hidden = !hay;
  }

  /* Espera a que el tablero termine de pintarse y a que una región que diga la
     jugada tenga tiempo de decirla primero. */
  function tableroCambio() {
    if (!temporizadorTableros) temporizadorTableros = setTimeout(revisarTableros, 400);
  }

  function alCambiar(registros) {
    if (!hablando()) return;
    tableroCambio();
    registros.forEach(function (r) {
      if (r.type === "attributes" && r.attributeName === "aria-label") return;   // una casilla que cambia de pieza: la mira revisarTableros
      if (r.type === "attributes") {
        /* Algo que aparece o desaparece (hidden, la clase "hidden"): cuentan las
           regiones de adentro y la región que lo contiene. */
        var el = r.target;
        if (el.matches && el.matches(REGION)) anotar(el);
        if (el.querySelectorAll) el.querySelectorAll(REGION).forEach(anotar);
        anotar(regionDe(el.parentElement));
        return;
      }
      anotar(regionDe(r.target));
      /* Una caja nueva que YA es región viva (el aviso de «Partida asignada», que
         se agrega entero al <body>): la región no es el padre, es lo que llegó. */
      r.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches(REGION)) anotar(n);
        n.querySelectorAll(REGION).forEach(anotar);
      });
    });
  }

  /* Lo que ya está escrito al encender (o al aparecer la página) no se dice: se
     anota como dicho. Si no, al cargar se oirían de golpe todos los carteles. */
  function tomarFoto(raiz) {
    raiz.querySelectorAll(REGION).forEach(function (reg) {
      ultimo.set(reg, visible(reg) ? limpio(reg.textContent) : "");
    });
    revisarTableros(true);
  }

  /* Se empieza a escuchar cuando la página ya se ve: `#app` se destapa después
     de pintar todo, y ese destape no es un aviso. */
  function escuchar(raiz) {
    if (observador || !raiz) return;
    var app = document.getElementById("app");
    if (app && raiz.contains(app) && !seVe(app)) {
      var espera = new MutationObserver(function () {
        if (!seVe(app)) return;
        espera.disconnect();
        escuchar(raiz);
      });
      espera.observe(app, { attributes: true, attributeFilter: ["hidden", "class"] });
      return;
    }
    tomarFoto(raiz);
    var empezo = Date.now();
    observador = new MutationObserver(function (registros) {
      /* Con la voz apagada no se mira nada: al encenderla se toma la foto. */
      if (Date.now() - empezo < CALMA_AL_CARGAR) { if (hablando()) tomarFoto(raiz); return; }
      alCambiar(registros);
    });
    observador.observe(raiz, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["hidden", "class", "aria-label"],
    });
    /* Lo que terminó de llegar justo en la calma también es parte de la página. */
    setTimeout(function () { if (hablando()) tomarFoto(raiz); }, CALMA_AL_CARGAR + 50);
  }

  /* `boton`: el elemento del botón (o su id). `opts.claseTexto` le pone una
     clase a la palabra (el encabezado lo deja solo en ícono, como sus vecinos). */
  function montar(boton, raiz, opts) {
    opts = opts || {};
    if (!window.BlindNotation || !BlindNotation.setupSpeechToggle) return false;
    var btn = typeof boton === "string" ? document.getElementById(boton) : boton;
    if (!btn || !btn.id) return false;
    raizActual = raiz || document.body;
    var pintar = BlindNotation.setupSpeechToggle(btn.id, function () { return true; },
      { claseTexto: opts.claseTexto });
    if (!pintar) { btn.hidden = true; return false; }   // el navegador no sabe hablar
    escuchar(raizActual);
    btn.addEventListener("click", function () {
      enFila = 0;
      actualizarBotonPosicion();
      if (!hablando()) return;
      tomarFoto(raizActual);
      BlindNotation.speak("Voz activada. Te voy a decir en voz alta los avisos de esta página.");
    });
    return true;
  }

  /* ---- El botón del encabezado ----
     Va junto al del Modo Adaptado (o al del modo oscuro), con su misma forma. */
  var PROPIOS = "#speech-toggle-btn, #btn-voz";

  function cargar(src, listo) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = listo;
    document.head.appendChild(s);
  }

  function enElEncabezado(base) {
    if (document.getElementById("voz-toggle") || document.querySelector(PROPIOS)) return;
    if (!("speechSynthesis" in window)) return;
    var vecino = document.getElementById("adaptive-toggle") || document.getElementById("theme-toggle");
    if (!vecino || !vecino.parentElement) return;
    function poner() {
      if (document.getElementById("voz-toggle")) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.id = "voz-toggle";
      btn.className = (document.getElementById("theme-toggle") || vecino).className;
      vecino.parentElement.insertBefore(btn, vecino);
      montar(btn, document.body, { claseTexto: "sr-only" });
    }
    if (window.BlindNotation && BlindNotation.setupSpeechToggle) poner();
    else cargar(base + "blind-notation.js", poner);
  }

  return { montar: montar, enElEncabezado: enElEncabezado, posicionDicha: posicionDicha };
})();
