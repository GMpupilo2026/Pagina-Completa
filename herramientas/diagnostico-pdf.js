/* ===== Generador del cuadernillo imprimible del diagnóstico =====
 *
 * Arma diagnostico-de-nivel.pdf a partir de los MISMOS datos que usa el sitio
 * (js/diagnostico-items.js y js/plan-entrenamiento.js): la prueba en papel y la
 * de pantalla no pueden separarse. Si se tocan los ítems, las áreas o los
 * niveles, hay que volver a correrlo para que el PDF deje de mentir.
 *
 * Cómo se corre (necesita Node y Chromium por Playwright, que no son parte del
 * sitio: son solo para generar el archivo):
 *
 *     npm install playwright        # una vez, en cualquier carpeta temporal
 *     node herramientas/diagnostico-pdf.js
 *
 * Deja el PDF en la raíz del repositorio y un HTML intermedio en /tmp por si
 * hay que revisar la maqueta en el navegador. Con CHROMIUM=/ruta/al/chrome se
 * le puede indicar un Chromium ya instalado.
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
global.window = {};
eval(fs.readFileSync(path.join(RAIZ, "js/diagnostico-items.js"), "utf8"));
eval(fs.readFileSync(path.join(RAIZ, "js/plan-entrenamiento.js"), "utf8"));
/* El banco tiene más ítems de los que entran en una prueba: el cuadernillo
   lleva UNA de las formas posibles, sorteada con semilla fija para que volver
   a correr el generador dé exactamente el mismo papel (misma prueba, mismas
   respuestas en la hoja de corrección). Cambiar SEMILLA saca otra versión de
   la prueba, útil para tener dos formas distintas en un mismo grupo. */
const SEMILLA = Number(process.env.SEMILLA || 20260101);
const ITEMS = global.window.DiagnosticoPrueba.armar([], SEMILLA);
const BANCO = global.window.DIAGNOSTICO_ITEMS;
const PE = global.window.PlanEntrenamiento;

const GLYPH = { w: { p:"♙", n:"♘", b:"♗", r:"♖", q:"♕", k:"♔" }, b: { p:"♟", n:"♞", b:"♝", r:"♜", q:"♛", k:"♚" } };
const FILES = ["a","b","c","d","e","f","g","h"];

function piezasDeFen(fen) {
  const filas = fen.split(" ")[0].split("/");
  const mapa = {};
  filas.forEach((fila, i) => {
    let col = 0;
    for (const c of fila) {
      if (/\d/.test(c)) { col += +c; continue; }
      const sq = FILES[col] + (8 - i);
      mapa[sq] = { color: c === c.toUpperCase() ? "w" : "b", tipo: c.toLowerCase() };
      col++;
    }
  });
  return mapa;
}

function diagrama(fen, turno) {
  const piezas = piezasDeFen(fen);
  let html = '<div class="diagrama"><table class="tablero">';
  for (let r = 8; r >= 1; r--) {
    html += `<tr><td class="coord">${r}</td>`;
    FILES.forEach((f, i) => {
      const sq = f + r;
      const clara = (i + r - 1) % 2 === 1;
      const p = piezas[sq];
      html += `<td class="${clara ? "clara" : "oscura"}">${p ? `<span class="${p.color === "w" ? "blanca" : "negra"}">${GLYPH[p.color][p.tipo]}</span>` : ""}</td>`;
    });
    html += "</tr>";
  }
  html += '<tr><td class="coord"></td>' + FILES.map((f) => `<td class="coord">${f}</td>`).join("") + "</tr>";
  html += `</table><p class="turno">${turno}</p></div>`;
  return html;
}

const LETRAS = ["A", "B", "C", "D"];

/* En papel las opciones también van barajadas —si la correcta fuera siempre la A,
   la prueba se aprobaría marcando la primera—, pero con un orden fijo y repetible:
   sale del identificador del ítem, así que el cuadernillo y su hoja de corrección
   siempre coinciden y dos impresiones son idénticas. */
function semilla(texto) {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return h;
}
// Reparto parejo: la correcta cae en A, B, C y D por turnos a lo largo del
// cuadernillo, y las demás opciones se ordenan con una baraja repetible.
const POSICION_CORRECTA = {};
ITEMS.filter((i) => i.opciones).forEach((item, i) => { POSICION_CORRECTA[item.id] = i % 4; });

function ordenDe(item) {
  const destino = POSICION_CORRECTA[item.id];
  const otras = item.opciones.map((_, i) => i).filter((i) => i !== item.correcta);
  let s = semilla(item.id);
  for (let i = otras.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [otras[i], otras[j]] = [otras[j], otras[i]];
  }
  const salida = [];
  for (let pos = 0; pos < item.opciones.length; pos++) {
    salida.push(pos === destino ? item.correcta : otras.shift());
  }
  return salida;
}

const areaDe = (id) => PE.AREA_POR_ID[id];

function bloqueItem(item, n) {
  const a = areaDe(item.area);
  const turno = item.tipo === "opcion_tablero"
    ? (item.fen.split(" ")[1] === "b" ? "Juegan las negras" : "Juegan las blancas")
    : "Juegan las blancas";
  let respuesta = "";
  if (item.tipo === "opcion" || item.tipo === "opcion_tablero") {
    respuesta = '<ol class="opciones">' + ordenDe(item).map((original, i) => `<li><span class="casilla-resp">${LETRAS[i]}</span> ${item.opciones[original]}</li>`).join("") +
      '<li class="no-se"><span class="casilla-resp">?</span> No lo sé todavía</li></ol>';
  } else if (item.tipo === "jugada") {
    respuesta = '<p class="linea">Escribe la jugada (casilla de salida y de llegada): <span class="raya"></span></p>' +
      '<p class="linea no-se">…o marca aquí si no la sabes: <span class="casilla-resp">?</span></p>';
  } else if (item.tipo === "casilla") {
    respuesta = '<p class="linea">Escribe la casilla: <span class="raya corta"></span></p>' +
      '<p class="linea no-se">…o marca aquí si no la sabes: <span class="casilla-resp">?</span></p>';
  }
  return `<section class="item">
      <p class="etiqueta">${n}. <span class="area">${a.emoji} ${a.nombre}</span> · dificultad ${"★".repeat(item.peso)}</p>
      <p class="enunciado">${item.enunciado}</p>
      ${item.fen ? diagrama(item.fen, turno) : ""}
      ${respuesta}
    </section>`;
}

function respuestaCorrecta(item) {
  if (item.tipo === "jugada") {
    // Algunos ítems aceptan más de una jugada para el mismo enunciado (ver
    // `alternas` en js/diagnostico-items.js): se listan todas, separadas por "o".
    return [item.solucion].concat(item.alternas || [])
      .map((j) => `${j.from}–${j.to}${j.promotion ? "=D" : ""}`)
      .join(" o ");
  }
  if (item.tipo === "casilla") return item.solucion;
  return LETRAS[ordenDe(item).indexOf(item.correcta)];
}

const TOTAL_PUNTOS = ITEMS.reduce((s, i) => s + i.peso, 0);
const porArea = {};
ITEMS.forEach((i, idx) => { (porArea[i.area] = porArea[i.area] || []).push({ item: i, n: idx + 1 }); });

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Diagnóstico de nivel — Ajedrez Integral</title>
<style>
  @page { size: A4; margin: 16mm 14mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", Arial, sans-serif; color: #102a43; font-size: 10.5pt; line-height: 1.45; margin: 0; }
  h1, h2, h3 { font-family: "DejaVu Serif", Georgia, serif; color: #0a1f33; margin: 0 0 6px; }
  h1 { font-size: 24pt; }
  h2 { font-size: 14pt; border-bottom: 2px solid #de911d; padding-bottom: 4px; margin: 0 0 12px; }
  h3 { font-size: 11.5pt; margin: 14px 0 6px; }
  p { margin: 0 0 6px; }
  .apagado { color: #627d98; }
  .portada { height: 245mm; display: flex; flex-direction: column; justify-content: center; }
  .marca { font-size: 12pt; letter-spacing: .18em; text-transform: uppercase; color: #de911d; font-weight: 700; }
  .datos { margin-top: 26mm; border-top: 1px solid #bcccdc; padding-top: 8mm; }
  .datos div { margin-bottom: 7mm; }
  .raya { display: inline-block; border-bottom: 1px solid #627d98; min-width: 38mm; height: 1em; }
  .raya.larga { min-width: 90mm; }
  .raya.corta { min-width: 22mm; }
  .pagina { page-break-before: always; }
  .item { page-break-inside: avoid; margin-bottom: 7mm; padding-bottom: 4mm; border-bottom: 1px solid #e6ecf2; }
  .etiqueta { font-size: 8.5pt; color: #627d98; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
  .etiqueta .area { color: #334e68; font-weight: 700; }
  .enunciado { font-weight: 600; margin-bottom: 5px; }
  .opciones { list-style: none; padding: 0; margin: 4px 0 0; }
  .opciones li { margin-bottom: 3px; padding-left: 2px; }
  .no-se { color: #627d98; font-style: italic; }
  .casilla-resp { display: inline-block; width: 5.5mm; height: 5.5mm; border: 1px solid #486581; border-radius: 2px; text-align: center; font-size: 8.5pt; line-height: 5.2mm; margin-right: 4px; font-weight: 700; }
  .diagrama { margin: 5px 0 7px; }
  table.tablero { border-collapse: collapse; }
  table.tablero td { width: 7.2mm; height: 7.2mm; text-align: center; vertical-align: middle; font-size: 14pt; line-height: 1; }
  table.tablero td.clara { background: #f0f4f8; border: .3pt solid #9fb3c8; }
  table.tablero td.oscura { background: #bcccdc; border: .3pt solid #9fb3c8; }
  table.tablero td.coord { background: none; border: none; font-size: 7pt; color: #627d98; width: 4mm; height: 4mm; }
  /* Convención del diagrama impreso: las piezas blancas son las figuras huecas y
     las negras las rellenas, ambas en tinta oscura. Pintar de blanco las blancas
     las borra sobre casilla clara al imprimir. */
  .blanca, .negra { color: #102a43; }
  .turno { font-size: 8pt; color: #627d98; margin: 2px 0 0; }
  .linea { margin-top: 6px; }
  table.datos-tabla { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  table.datos-tabla th, table.datos-tabla td { border: .5pt solid #bcccdc; padding: 3.5px 6px; text-align: left; }
  table.datos-tabla th { background: #f0f4f8; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; color: #334e68; }
  table.datos-tabla td.num { text-align: center; width: 14mm; }
  .aviso { background: #fdf6e6; border-left: 3px solid #de911d; padding: 7px 10px; font-size: 9.5pt; margin: 8px 0 12px; }
  .dos-columnas { column-count: 2; column-gap: 8mm; }
  .area-plan { break-inside: avoid; margin-bottom: 6mm; }
  .area-plan ul { margin: 3px 0 0; padding-left: 16px; }
  .area-plan li { margin-bottom: 2px; }
  footer { position: fixed; bottom: -8mm; left: 0; right: 0; font-size: 7.5pt; color: #9fb3c8; }
  /* Marca de agua: el cuadernillo trae las respuestas, así que es material
     docente y no se entrega al alumno. Va en position:fixed —igual que el pie—
     para que Chromium la repita en TODAS las páginas, y por debajo del texto
     (el contenido lleva z-index 1) para no estorbar la lectura ni al imprimir. */
  .marca-agua { position: fixed; inset: 0; z-index: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .marca-agua span { transform: rotate(-30deg); font-family: "DejaVu Serif", Georgia, serif; font-size: 24pt; font-weight: 700; letter-spacing: .08em; color: #bcccdc; opacity: .45; white-space: nowrap; text-transform: uppercase; }
  body > *:not(.marca-agua) { position: relative; z-index: 1; }
</style></head><body>

<div class="marca-agua" aria-hidden="true"><span>Ajedrez Integral · uso docente</span></div>

<div class="portada">
  <p class="marca">Ajedrez Integral · Academia</p>
  <h1>Diagnóstico de nivel</h1>
  <p style="font-size:12pt; max-width:130mm; color:#334e68;">Prueba de 56 ejercicios que mide ocho áreas del juego —de las reglas a los finales— en cinco escalones de dificultad, y devuelve un nivel estimado y un plan de estudio de cuatro semanas.</p>
  <p class="apagado" style="max-width:130mm; margin-top:6mm;">Versión imprimible de la prueba que los alumnos hacen en línea en Entrenamiento › Aprende › Asignaciones. Las ${ITEMS.length} posiciones y respuestas salen del mismo banco de ${BANCO.length} ejercicios del sitio, verificadas con motor. En línea las preguntas se sortean cada vez; este cuadernillo es una de esas formas, con el mismo reparto por áreas y los mismos ${TOTAL_PUNTOS} puntos.</p>
  <p class="apagado" style="max-width:130mm; margin-top:4mm; font-weight:700; color:#334e68;">Material docente: incluye las respuestas y la hoja de corrección. No se le entrega al alumno.</p>
  <div class="datos">
    <div>Alumno: <span class="raya larga"></span></div>
    <div>Fecha: <span class="raya"></span> &nbsp;&nbsp; Grupo: <span class="raya"></span></div>
    <div>Aplicó: <span class="raya larga"></span></div>
    <div style="margin-top:9mm;">Resultado: <span class="raya corta"></span> / ${TOTAL_PUNTOS} puntos &nbsp;&nbsp; Porcentaje: <span class="raya corta"></span> &nbsp;&nbsp; Nivel: <span class="raya"></span></div>
  </div>
</div>

<div class="pagina">
  <h2>Cómo se aplica</h2>
  <div class="aviso"><strong>Si no lo sabe, que lo diga.</strong> Cada ejercicio tiene la casilla "No lo sé todavía": vale lo mismo que fallar (cero puntos) pero se cuenta aparte, y cambia el plan. Un error es algo mal aprendido que hay que corregir; un "no lo sé" es un hueco que hay que enseñar. Conviene decírselo al alumno antes de empezar: adivinar infla el resultado y le devuelve un plan que no le sirve.</div>
  <div class="aviso"><strong>Sin ayuda y sin mover piezas.</strong> El alumno responde de corrido, sin decirle si acierta: la corrección se hace al final, entre los dos. En todas las posiciones juegan las blancas salvo que el ejercicio diga lo contrario, y el tablero se mira siempre desde el lado blanco.</div>
  <p><strong>Tiempo:</strong> unos 20 minutos. No es una prueba de velocidad; si un alumno se traba en un ejercicio, que lo deje en blanco y siga.</p>
  <p><strong>Puntuación:</strong> cada ejercicio vale 1, 2 o 3 puntos según su dificultad (las estrellas junto al enunciado). El total de la prueba son ${TOTAL_PUNTOS} puntos. Lo que importa no es el total, sino el porcentaje de cada área: ahí está lo que hay que estudiar.</p>
  <p><strong>Qué mide cada área:</strong></p>
  <table class="datos-tabla" style="margin-top:6px;">
    <tr><th>Área</th><th>Qué mide</th><th class="num">Puntos</th></tr>
    ${PE.AREAS.map((a) => `<tr><td><strong>${a.emoji} ${a.nombre}</strong></td><td>${a.mide}</td><td class="num">${porArea[a.id].reduce((s, x) => s + x.item.peso, 0)}</td></tr>`).join("")}
  </table>
  <p class="apagado" style="margin-top:8px; font-size:9pt;">El nivel estimado orienta el estudio y la elección de material: no es un rating oficial ni sustituye los resultados de torneo.</p>
</div>

${PE.AREAS.map((a, i) => `<div class="pagina">
  <h2>${a.emoji} ${a.nombre}</h2>
  ${porArea[a.id].map((x) => bloqueItem(x.item, x.n)).join("")}
</div>`).join("")}

<div class="pagina">
  <h2>Hoja de corrección</h2>
  <p class="apagado">Respuestas correctas y valor de cada ejercicio. Marca el punto solo si la respuesta es exactamente la indicada.</p>
  <table class="datos-tabla" style="margin-top:8px;">
    <tr><th class="num">#</th><th>Área</th><th>Respuesta correcta</th><th class="num">Vale</th><th class="num">Logró</th><th class="num">No sabía</th></tr>
    ${ITEMS.map((it, i) => `<tr><td class="num">${i + 1}</td><td>${areaDe(it.area).nombre}</td><td><strong>${respuestaCorrecta(it)}</strong></td><td class="num">${it.peso}</td><td class="num"></td><td class="num"></td></tr>`).join("")}
  </table>
</div>

<div class="pagina">
  <h2>Resultado por área</h2>
  <p class="apagado">Suma los puntos logrados de cada área y calcula su porcentaje. Las áreas por debajo del 60% son las que mandan en el plan.</p>
  <table class="datos-tabla" style="margin-top:8px;">
    <tr><th>Área</th><th class="num">Logrado</th><th class="num">De</th><th class="num">%</th><th>Lectura</th></tr>
    ${PE.AREAS.map((a) => `<tr><td><strong>${a.emoji} ${a.nombre}</strong></td><td class="num"></td><td class="num">${porArea[a.id].reduce((s, x) => s + x.item.peso, 0)}</td><td class="num"></td><td class="apagado" style="font-size:8.5pt;">menos de 60%: ${a.flojo.split(".")[0].toLowerCase()}</td></tr>`).join("")}
    <tr><td><strong>Total</strong></td><td class="num"></td><td class="num">${TOTAL_PUNTOS}</td><td class="num"></td><td></td></tr>
  </table>

  <h3>Aciertos por escalón de dificultad</h3>
  <p class="apagado">Aquí sale el nivel. Cuenta los aciertos de cada escalón (las estrellas que lleva cada ejercicio) y saca su porcentaje.</p>
  <table class="datos-tabla" style="margin-top:6px;">
    <tr><th>Escalón</th><th class="num">Ejercicios</th><th class="num">Acertó</th><th class="num">%</th><th>¿Superado? (60% o más)</th></tr>
    ${[1, 2, 3, 4, 5].map((w) => `<tr><td><strong>${"★".repeat(w)}</strong></td><td class="num">${ITEMS.filter((i) => i.peso === w).length}</td><td class="num"></td><td class="num"></td><td><span class="casilla-resp"></span> sí &nbsp; <span class="casilla-resp"></span> no</td></tr>`).join("")}
  </table>

  <h3>Nivel estimado</h3>
  <div class="aviso">El nivel es <strong>el escalón más alto superado</strong> —60% de aciertos o más en ese escalón, y el promedio de los anteriores también en 60%—, no el porcentaje total de la prueba. Contar solo aciertos hace que quien responde bien todo lo fácil salga con nota de experto sin haber resuelto nada difícil.</div>
  <table class="datos-tabla">
    <tr><th>Escalón alcanzado</th><th>Nivel</th><th>Fuerza orientativa</th><th>Qué toca</th></tr>
    ${PE.NIVELES.map((n) => `<tr><td>${n.escalon === 0 ? "ninguno" : "hasta " + "★".repeat(n.escalon)}</td><td><strong>${n.etiqueta}</strong></td><td>${n.rango}</td><td style="font-size:9pt;">${n.descripcion}</td></tr>`).join("")}
  </table>
</div>

<div class="pagina">
  <h2>Del diagnóstico al plan</h2>
  <p>Una sola área por semana, empezando por la más floja: dos focos a la vez no se sostienen. Las áreas fuertes se mantienen con diez minutos por sesión. A las cuatro semanas se repite la prueba y se compara área por área.</p>
  <table class="datos-tabla" style="margin:8px 0 10px;">
    <tr><th>Semana</th><th>Área elegida</th><th>Meta comprobable</th></tr>
    <tr><td class="num">1</td><td><span class="raya"></span></td><td><span class="raya larga"></span></td></tr>
    <tr><td class="num">2</td><td><span class="raya"></span></td><td><span class="raya larga"></span></td></tr>
    <tr><td class="num">3</td><td><span class="raya"></span></td><td><span class="raya larga"></span></td></tr>
    <tr><td class="num">4</td><td>Juntar todo y volver a medir</td><td>Repetir el diagnóstico y comparar</td></tr>
  </table>
  <h3>Qué hacer en cada área</h3>
  <div>
    ${PE.AREAS.map((a) => `<div class="area-plan">
      <p style="margin-bottom:2px;"><strong>${a.emoji} ${a.nombre}</strong></p>
      <ul>${a.tareas.map((t) => `<li>${t}</li>`).join("")}</ul>
      <p class="apagado" style="font-size:8.5pt; margin-top:2px;">Material: ${a.recursos.map((r) => r.texto).join(" · ")}</p>
    </div>`).join("")}
  </div>
  <p class="apagado" style="font-size:8.5pt; margin-top:6mm;">Ajedrez Integral · el mismo diagnóstico, corregido solo y con el plan ya armado, está en el sitio: Entrenamiento › Aprende › Asignaciones.</p>
</div>

</body></html>`;

const htmlTemporal = path.join(require("os").tmpdir(), "diagnostico-imprimible.html");
fs.writeFileSync(htmlTemporal, html);
console.log(`Maqueta: ${htmlTemporal} · ${ITEMS.length} ítems · ${TOTAL_PUNTOS} puntos`);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const pagina = await navegador.newPage();
  await pagina.goto("file://" + htmlTemporal, { waitUntil: "load" });
  const destino = path.join(RAIZ, "diagnostico-de-nivel.pdf");
  await pagina.pdf({
    path: destino,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "14mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: '<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 14mm;display:flex;justify-content:space-between;"><span>Ajedrez Integral · Diagnóstico de nivel · uso docente</span><span class="pageNumber"></span></div>',
  });
  await navegador.close();
  console.log("PDF listo:", destino);
})();
