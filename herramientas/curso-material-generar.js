/* La parte que imprime: toma lo que arma curso-material.js y escribe los
 * archivos. Ver ese archivo para qué se genera y de dónde sale el contenido.
 *
 *     npm install playwright && pip install pypdf
 *     node herramientas/curso-material-generar.js [curso] [--solo N]
 *
 * Con --solo-accesible rehace únicamente los HTML accesibles y no toca ningún
 * PDF (ni necesita playwright ni pypdf): el cuadernillo sale distinto byte por
 * byte en cada corrida, así que un retoque del HTML no tiene por qué mover 186
 * archivos binarios.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const M = require("./curso-material.js");
const { lecciones, posiciones, partidas } = require("./lib/leer-curso.js");

const CHROME = process.env.CHROME_PATH || undefined;
const LOGO_MARCA = path.join(RAIZ, "img", "logo-oscar-angulo-marca.png");

/* El catálogo da el título bonito de cada curso. */
const CATALOGO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", "catalogo.json"), "utf8"));
function cursoDe(slug) {
  const lista = Array.isArray(CATALOGO) ? CATALOGO : (CATALOGO.cursos || []);
  const c = lista.find((x) => x.slug === slug);
  return { slug, titulo: (c && c.titulo) || slug };
}

/* La marca de agua se estampa con pypdf y no con CSS: probado con
   position:fixed, al paginar Chromium no respeta el centrado y la marca sale
   corrida y cortada por el borde (es la misma lección de arbitraje-pdf.js). */
const htmlMarca = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; height: 100%; }
  .sello { height: 100vh; display: flex; align-items: center; justify-content: center; }
  .sello img { width: 105mm; opacity: .07; }
</style></head><body>
  <div class="sello"><img src="data:image/png;base64,${fs.readFileSync(LOGO_MARCA).toString("base64")}" alt=""></div>
</body></html>`;

/* Sella la marca en todas las páginas, recomprime y clona. Sin recomprimir,
   mezclar deja el contenido de cada página sin comprimir y el archivo se va a
   megabytes; sin clonar, los flujos viejos quedan sueltos pero guardados. */
const GUION_SELLAR = `
import sys, zlib
from pypdf import PdfReader, PdfWriter
from pypdf.generic import StreamObject, NameObject
cuerpo, marca, destino = sys.argv[1], sys.argv[2], sys.argv[3]
escritor = PdfWriter()
escritor.append_pages_from_reader(PdfReader(cuerpo))
sello = PdfReader(marca).pages[0]
for pagina in escritor.pages:
    pagina.merge_page(sello, over=True)
for pagina in escritor.pages:
    flujo = StreamObject()
    flujo._data = zlib.compress(pagina.get_contents().get_data(), 9)
    flujo[NameObject("/Filter")] = NameObject("/FlateDecode")
    pagina[NameObject("/Contents")] = escritor._add_object(flujo)
escritor.write(destino)
PdfWriter(clone_from=destino).write(destino)
print(len(escritor.pages))
`;

/* Chromium no sabe proteger el PDF, así que se vuelve a escribir con pypdf:
   se abre sin contraseña, pero no se puede imprimir, copiar ni editar. La
   extracción de texto para lectores de pantalla queda habilitada a propósito:
   bloquearla dejaría el material fuera del alcance de quien lo lee así, que es
   justamente a quien esta tanda quiere incluir. */
const GUION_PROTEGER = `
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions
archivo, clave, autor, titulo, tema = sys.argv[1:6]
escritor = PdfWriter()
escritor.append_pages_from_reader(PdfReader(archivo))
escritor.add_metadata({
    "/Title": titulo, "/Author": autor, "/Subject": tema,
    "/Creator": "Ajedrez Integral", "/Producer": "Ajedrez Integral",
})
escritor.encrypt(user_password="", owner_password=clave,
                 permissions_flag=UserAccessPermissions.EXTRACT_TEXT_AND_GRAPHICS,
                 algorithm="AES-256")
with open(archivo, "wb") as f:
    escritor.write(f)
print("ok")
`;

function python(guion, args, queHacia) {
  try {
    return String(execFileSync("python3", ["-c", guion, ...args], { stdio: ["ignore", "pipe", "pipe"] })).trim();
  } catch (e) {
    console.error(`\nNo se pudo ${queHacia}. ¿Falta pypdf?  pip install pypdf`);
    console.error(String(e.stderr || "").trim().split("\n").slice(-3).join("\n"));
    process.exit(1);
  }
}

(async () => {
  // "--solo N" se come su propio número: sin esto, el N quedaba tomado como
  // si fuera el nombre de un curso.
  const crudo = process.argv.slice(2);
  const args = [];
  let soloN = null;
  // "--solo-accesible" rehace SOLO el HTML accesible. El cuadernillo en PDF se
  // vuelve a imprimir byte por byte distinto cada vez (lleva la fecha adentro),
  // así que tocar una línea del HTML no tiene por qué mover 186 archivos
  // binarios. Sin esta puerta, la tentación es editarlos a mano.
  let soloAccesible = false;
  for (let i = 0; i < crudo.length; i++) {
    if (crudo[i] === "--solo") { soloN = Number(crudo[++i]); continue; }
    if (crudo[i] === "--solo-accesible") { soloAccesible = true; continue; }
    if (crudo[i].startsWith("--")) continue;
    args.push(crudo[i]);
  }
  const cursos = args.length ? args : M.CURSOS;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "material-"));
  let navegador = null, pagina = null, pdfMarca = null;
  if (!soloAccesible) {
    const archivoMarca = path.join(tmp, "marca.html");
    fs.writeFileSync(archivoMarca, htmlMarca);
    navegador = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
    pagina = await navegador.newPage();
    await pagina.goto("file://" + archivoMarca, { waitUntil: "load" });
    pdfMarca = path.join(tmp, "marca.pdf");
    await pagina.pdf({ path: pdfMarca, format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  }

  // Todas las posiciones verificadas de la Academia, con el curso del que
  // viene cada una: es el fondo del que sacan ejemplo los cursos que no
  // tienen archivo de posiciones propio.
  const acervo = [];
  M.CURSOS.forEach((s) => {
    const c = cursoDe(s);
    posiciones(s).forEach((p) => acervo.push(Object.assign({}, p, { deCurso: c.titulo })));
  });
  console.log(`Fondo de la Academia: ${acervo.length} posiciones verificadas\n`);

  let hechos = 0, paginas = 0;
  for (const slug of cursos) {
    const curso = cursoDe(slug);
    const lista = lecciones(slug);
    const todas = posiciones(slug);
    const partidasCurso = partidas(slug);
    const destino = path.join(RAIZ, "cursos", "recursos", slug);
    fs.mkdirSync(destino, { recursive: true });
    let conPosiciones = 0;

    for (const leccion of lista) {
      if (soloN && leccion.n !== soloN) continue;
      const conceptos = M.conceptosDe(leccion, slug);
      const partida = M.partidaDe(leccion, partidasCurso);
      // Si la lección ES una partida comentada, los ejemplos son sus propias
      // jugadas comentadas, no posiciones sueltas que se le parezcan.
      const posics = partida && partida.comentadas.length
        ? partida.comentadas.slice(0, 3).map((m) => ({
            fen: m.fen, titulo: `Después de ${m.n}${m.color === "w" ? "." : "..."}${m.san}`,
            pregunta: "", comentario: m.comentario, linea: "", resultado: "",
          }))
        : M.posicionesDe(leccion, todas, acervo);
      if (posics.length) conPosiciones += 1;
      const base = String(leccion.n).padStart(2, "0") + "-" + M.slugDe(leccion.titulo) + "-material";

      // --- el cuadernillo
      if (!soloAccesible) {
      const htmlTmp = path.join(tmp, base + ".html");
      fs.writeFileSync(htmlTmp, M.cuadernilloHtml(curso, leccion, conceptos, posics, partida));
      await pagina.goto("file://" + htmlTmp, { waitUntil: "load" });
      const pdfTmp = path.join(tmp, base + ".pdf");
      await pagina.pdf({
        path: pdfTmp, format: "A4", printBackground: true,
        displayHeaderFooter: true, headerTemplate: "<div></div>",
        footerTemplate: `<div style="width:100%;font-family:Georgia,serif;font-size:7pt;color:#627d98;padding:0 16mm;display:flex;justify-content:space-between;">
            <span>${M.AUTOR} · Ajedrez Integral · uso docente</span>
            <span class="pageNumber"></span></div>`,
        margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
      });
      const n = python(GUION_SELLAR, [pdfTmp, pdfMarca, pdfTmp], "poner la marca de agua");
      const pdfFinal = path.join(destino, base + ".pdf");
      fs.copyFileSync(pdfTmp, pdfFinal);
      python(GUION_PROTEGER, [pdfFinal, M.CLAVE_PROPIETARIO, M.AUTOR,
        `${leccion.titulo} — ${curso.titulo}`, "Material de estudio de la Academia de Ajedrez Integral"],
        "proteger el PDF");
      paginas += Number(n) || 0;
      }

      // --- la versión accesible
      fs.writeFileSync(path.join(destino, base + "-accesible.html"),
        M.accesibleHtml(curso, leccion, conceptos, posics, partida));

      hechos += 1;
      process.stdout.write(`\r  ${slug}: ${hechos} lecciones…`.padEnd(70));
    }
    process.stdout.write(`\r  ${slug.padEnd(28)} ${lista.length} lecciones · ${conPosiciones} con ejemplos del curso\n`);
  }

  if (navegador) await navegador.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(soloAccesible
    ? `\n${hechos} lecciones · ${hechos} archivos accesibles (el PDF no se tocó)`
    : `\n${hechos} lecciones · ${hechos * 2} archivos · ${paginas} páginas de PDF`);
})();
