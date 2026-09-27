/* Los ambientes de la sala de las transmisiones (transmision.html).
 *
 * La misma sala —pantalla grande, cartelera, pizarra, quiniela— vestida de
 * siete maneras. Los colores de cada una viven en css/styles.css como
 * variables --esc-* sobre .cine-sala[data-escenario]; acá están los nombres y
 * los textos que cambian con el ambiente. Ver «Los ambientes de la sala» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 * ESTA LISTA ES LA ÚNICA: la usan la sala (el selector «Ambiente») y
 * administración (el ambiente con que abre cada sala). La restricción de la
 * columna salas_torneo.tema repite los mismos id, y
 * herramientas/verificar-escenarios-sala.js comprueba que coincidan.
 *
 * Quien administra elige con qué ambiente abre la sala; quien mira puede
 * cambiarlo, y su elección se queda en ese navegador y para esa sala
 * (localStorage), como el tablero preferido: es de dónde se mira.
 */
(function () {
  "use strict";

  const LISTA = [
    { id: "cine", nombre: "Sala de cine", emoji: "🎬", antetitulo: "En cartelera · transmisión en vivo", pizarra: "Pizarra de posiciones", descripcion: "Marquesina con bombillos, telones rojos y la pizarra verde de tiza." },
    { id: "teatro", nombre: "Teatro", emoji: "🎭", antetitulo: "Función de gala · transmisión en vivo", pizarra: "Programa: posiciones", descripcion: "Terciopelo vino, proscenio dorado y el programa de mano." },
    { id: "salon", nombre: "Salón de actos", emoji: "🏛️", antetitulo: "Acto oficial · transmisión en vivo", pizarra: "Tabla de posiciones", descripcion: "Paneles de madera, telón azul y pizarra blanca." },
    { id: "estadio", nombre: "Estadio", emoji: "🏟️", antetitulo: "En directo desde la arena", pizarra: "Marcador del torneo", descripcion: "Reflectores, gradería llena y marcador de luces." },
    { id: "club", nombre: "Club clásico", emoji: "🕰️", antetitulo: "Velada en el club · transmisión en vivo", pizarra: "Tabla del club", descripcion: "Madera, bibliotecas y la tabla del club en cartulina." },
    { id: "planetario", nombre: "Planetario", emoji: "🔭", antetitulo: "Bajo las estrellas · transmisión en vivo", pizarra: "Constelación de posiciones", descripcion: "Cúpula, cielo estrellado y nebulosas." },
    { id: "arcade", nombre: "Arcade", emoji: "🕹️", antetitulo: "Insert coin · transmisión en vivo", pizarra: "High scores: posiciones", descripcion: "Neón, rejilla en el piso y la tabla de récords." },
  ];
  const POR_OMISION = "cine";

  const porId = (id) => LISTA.find((e) => e.id === id) || null;

  // ------------------------------------------------------------ en la sala

  let clave = null;         // la sala que se está mirando (?torneo=)
  let elegido = false;      // quien mira ya eligió uno para esta sala

  const guardado = () => "sala_ambiente_v1:" + (clave || "-");
  function leer() { try { return localStorage.getItem(guardado()); } catch (e) { return null; } }
  function guardar(id) { try { localStorage.setItem(guardado(), id); } catch (e) { /* sin almacenamiento */ } }

  function aplicar(id) {
    const esc = porId(id) || porId(POR_OMISION);
    const sala = document.querySelector(".cine-sala");
    if (!sala) return;
    sala.dataset.escenario = esc.id;
    const ante = document.getElementById("cine-antetitulo");
    if (ante) ante.textContent = esc.antetitulo;
    const piz = document.getElementById("pizarra-titulo");
    if (piz) piz.textContent = esc.pizarra;
    const sel = document.getElementById("cine-ambiente");
    if (sel) sel.value = esc.id;
  }

  // Al cargar el script, antes de saber nada de la base: si quien mira ya
  // eligió un ambiente para esta sala, se pinta de una (sin parpadeo).
  function montar() {
    const sel = document.getElementById("cine-ambiente");
    if (!sel) return;
    clave = new URLSearchParams(location.search).get("torneo");
    LISTA.forEach((e) => {
      const o = document.createElement("option");
      o.value = e.id;
      o.textContent = e.emoji + " " + e.nombre;
      sel.appendChild(o);
    });
    const mio = leer();
    elegido = !!porId(mio);
    aplicar(elegido ? mio : POR_OMISION);
    sel.addEventListener("change", () => {
      if (!porId(sel.value)) return;
      elegido = true;
      guardar(sel.value);
      aplicar(sel.value);
    });
  }

  // Ya leída la sala: el ambiente que eligió administración, salvo que quien
  // mira haya elegido otro.
  function deLaSala(sala) {
    if (!sala) return;
    if (!clave) clave = sala.clave;
    if (elegido) return;
    const mio = leer();
    if (porId(mio)) { elegido = true; aplicar(mio); return; }
    aplicar(porId(sala.tema) ? sala.tema : POR_OMISION);
  }

  const api = { LISTA, POR_OMISION, porId, aplicar, deLaSala };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  window.EscenariosSala = api;
  // El script va al final del <body>, con el selector ya escrito: se monta de
  // una. Esperar a DOMContentLoaded no sirve: la sala puede llegar antes
  // (deLaSala) y montar() le pisaría el ambiente con el de base.
  montar();
})();
