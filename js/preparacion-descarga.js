/* Preparación de rivales: bajar las partidas públicas de un usuario de Lichess
 * o de Chess.com, directo desde el navegador de quien prepara. También lo usa
 * «Tus propios errores» (js/entreno-tipos-mas.js) para traer las del alumno.
 *
 * Las dos APIs son públicas, sin clave, y aceptan pedidos desde otra página
 * (CORS). Lo único que sale de acá es el nombre de usuario que se escribió; las
 * partidas llegan en PGN y se analizan igual que un archivo. `_headers` las
 * deja pasar en connect-src (lichess.org y api.chess.com), y las dos están en
 * la lista de proveedores de privacidad.html.
 *
 *   descargar({ sitio, usuario, maximo, alAvanzar, senal }) → texto PGN
 *   cuentasDe("pedro1, @pedro_2")  → ["pedro1", "pedro_2"] (las otras cuentas)
 *   unirCuentas(texto, "pedro1", "PedroP") → el PGN con «pedro1» como «PedroP»
 *
 * Varias cuentas del mismo rival (en Lichess y en Chess.com, o dos en el mismo
 * sitio) se bajan una tras otra y se juntan con el nombre de la primera: para
 * el análisis son un solo jugador. Ver «Varias cuentas del rival».
 *
 * Lichess entrega las partidas en un solo flujo, las más nuevas primero, a unas
 * 20 por segundo sin cuenta: se va leyendo de a pedazos para decir cuántas van.
 * Se piden con los relojes ([%clk]), que js/preparacion-analisis.js guarda por
 * jugada.
 * Chess.com las guarda por mes: se pide la lista de meses y se baja un mes por
 * vez, del más nuevo al más viejo, hasta juntar las pedidas. Uno por vez y no
 * todos juntos: así lo pide Chess.com, y en paralelo corta con 429.
 * Ver «Bajar las partidas de Lichess o Chess.com» en docs/decisiones/paneles.md.
 */
(function () {
  "use strict";

  const USUARIO_VALIDO = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;

  function error(texto) { const e = new Error(texto); e.paraMostrar = true; return e; }

  function contarPartidas(texto) {
    const m = texto.match(/^\[Event /gm);
    return m ? m.length : 0;
  }

  // Corta el PGN después de la partida número `n`.
  function primeras(texto, n) {
    let vistas = 0;
    const re = /^\[Event /gm;
    let m;
    while ((m = re.exec(texto))) {
      vistas += 1;
      if (vistas === n + 1) return texto.slice(0, m.index);
    }
    return texto;
  }

  async function lichess(usuario, maximo, alAvanzar, senal) {
    // Con relojes: dicen cómo usa el tiempo (etapa 2). Sin evaluaciones ni
    // nombre de apertura, que el análisis no usa y hacen más pesado el flujo.
    const q = new URLSearchParams({ clocks: "true", evals: "false", opening: "false", literate: "false" });
    if (maximo) q.set("max", String(maximo));
    const r = await fetch("https://lichess.org/api/games/user/" + encodeURIComponent(usuario) + "?" + q.toString(), {
      headers: { Accept: "application/x-chess-pgn" }, signal: senal,
    });
    if (r.status === 404) throw error("No existe el usuario «" + usuario + "» en Lichess.");
    if (r.status === 429) throw error("Lichess pide esperar un minuto antes de volver a bajar partidas.");
    if (!r.ok) throw error("Lichess no contestó (error " + r.status + "). Vuelve a intentarlo en un rato.");
    if (!r.body || !r.body.getReader) {
      const t = await r.text();
      alAvanzar(contarPartidas(t));
      return t;
    }
    const lector = r.body.getReader();
    const deco = new TextDecoder();
    let texto = "";
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      texto += deco.decode(value, { stream: true });
      const n = contarPartidas(texto);
      // Si se para, sirve lo que llegó, sin la última: puede estar a medias.
      api.ultimoTexto = primeras(texto, Math.max(0, n - 1));
      alAvanzar(n);
    }
    texto += deco.decode();
    alAvanzar(contarPartidas(texto));
    return texto;
  }

  async function chesscom(usuario, maximo, alAvanzar, senal) {
    const base = "https://api.chess.com/pub/player/" + encodeURIComponent(usuario.toLowerCase());
    const r = await fetch(base + "/games/archives", { signal: senal });
    if (r.status === 404) throw error("No existe el usuario «" + usuario + "» en Chess.com.");
    if (r.status === 429) throw error("Chess.com pide esperar un momento antes de volver a bajar partidas.");
    if (!r.ok) throw error("Chess.com no contestó (error " + r.status + "). Vuelve a intentarlo en un rato.");
    const datos = await r.json();
    // Los meses vienen del más viejo al más nuevo: se recorren al revés.
    const meses = (datos.archives || []).filter((u) => /^https:\/\/api\.chess\.com\/pub\/player\/[^/]+\/games\/\d{4}\/\d{2}$/.test(u)).reverse();
    if (!meses.length) throw error("«" + usuario + "» no tiene partidas públicas en Chess.com.");
    const partes = [];
    let total = 0;
    for (let i = 0; i < meses.length; i++) {
      const rm = await fetch(meses[i] + "/pgn", { signal: senal });
      if (rm.status === 429) throw error("Chess.com pidió esperar. Se bajaron " + total + " partidas; vuelve a intentarlo en un momento.");
      if (!rm.ok) continue;
      const t = await rm.text();
      partes.push(t);
      total += contarPartidas(t);
      api.ultimoTexto = partes.join("\n\n");
      alAvanzar(total, i + 1, meses.length);
      if (maximo && total >= maximo) break;
    }
    const texto = partes.join("\n\n");
    return maximo ? primeras(texto, maximo) : texto;
  }

  async function descargar(o) {
    api.ultimoTexto = "";
    const usuario = String(o.usuario || "").trim().replace(/^@/, "");
    if (!USUARIO_VALIDO.test(usuario)) throw error("Escribe el nombre de usuario tal como sale en su perfil: letras, números, guion o guion bajo.");
    const avanzar = o.alAvanzar || (() => {});
    if (o.sitio === "lichess") return lichess(usuario, o.maximo, avanzar, o.senal);
    if (o.sitio === "chesscom") return chesscom(usuario, o.maximo, avanzar, o.senal);
    throw error("Elige Lichess o Chess.com.");
  }

  // `ultimoTexto`: las partidas completas que ya llegaron, para analizar lo
  // bajado si se para a la mitad.
  // Las otras cuentas, escritas separadas por coma o espacio, sin @ y sin repetir.
  function cuentasDe(texto) {
    const vistas = new Set();
    return String(texto || "").split(/[\s,;]+/).map((x) => x.replace(/^@/, "")).filter((x) => {
      const k = x.toLowerCase();
      if (!x || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
  }

  // En las etiquetas de jugador, el usuario de otra cuenta pasa a llamarse
  // como la principal (sin distinguir mayúsculas: Lichess y Chess.com no las
  // distinguen). El usuario ya pasó por USUARIO_VALIDO: no trae nada que
  // escapar salvo el guion.
  function unirCuentas(texto, otro, principal) {
    const re = new RegExp('^\\[(White|Black) "' + otro.replace(/-/g, "\\-") + '"\\]', "gim");
    return texto.replace(re, (m, lado) => "[" + lado + ' "' + principal + '"]');
  }

  const api = { descargar, contarPartidas, primeras, cuentasDe, unirCuentas, USUARIO_VALIDO, ultimoTexto: "" };
  window.PreparacionDescarga = api;
})();
