/* Lo que hace falta para cerrar un libro impreso con Chromium: pegar la tapa
 * (que se imprime aparte, sin márgenes ni pie) con el cuerpo, estampar la
 * marca de agua en cada página del cuerpo y proteger el archivo.
 *
 * Vive acá porque lo usan dos libros —el del diagnóstico
 * (herramientas/diagnostico-libro.js) y «Ponte a prueba»
 * (herramientas/libro-examen-pdf.js)—, y una segunda copia se iría separando
 * de la primera a la primera corrección.
 *
 * Las dos cosas las hace pypdf (pip install pypdf): Chromium no sabe ni
 * estampar una página encima de otra ni cifrar.
 */
"use strict";
const fs = require("fs");
const { execFileSync } = require("child_process");

/* La marca de agua NO se pone con CSS (position: fixed): Chromium la repite en
   todas las páginas pero al paginar no respeta el centrado, y termina corrida
   y cortada. Va en su propia hoja y se estampa encima de cada página del
   cuerpo. La tapa no la lleva: ya tiene el logo en grande. */
/* Sin tapa (tapa = null, como un cuadernillo de examen), la marca va en todas
   las páginas. */
function unir(tapa, cuerpo, marca, destino) {
  const guion = `
import sys, zlib
from pypdf import PdfReader, PdfWriter
from pypdf.generic import StreamObject, NameObject
tapa, cuerpo, marca, destino = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
escritor = PdfWriter()
for archivo in (tapa, cuerpo):
    if archivo:
        escritor.append_pages_from_reader(PdfReader(archivo))
sello = PdfReader(marca).pages[0]
for n, pagina in enumerate(escritor.pages):
    if n == 0 and tapa:
        continue
    pagina.merge_page(sello, over=True)

# Estampar deja el contenido de cada página SIN comprimir. Se vuelve a
# comprimir a mano...
for pagina in escritor.pages:
    flujo = StreamObject()
    flujo._data = zlib.compress(pagina.get_contents().get_data(), 9)
    flujo[NameObject("/Filter")] = NameObject("/FlateDecode")
    pagina[NameObject("/Contents")] = escritor._add_object(flujo)
escritor.write(destino)

# ...y se clona el resultado, que es lo que de verdad tira los flujos viejos:
# quedan sueltos pero el escritor los sigue guardando, y clonar solo copia lo
# que cuelga del catálogo.
PdfWriter(clone_from=destino).write(destino)
print("marca de agua en", len(escritor.pages) - (1 if tapa else 0), "páginas")
`;
  try {
    console.log(String(execFileSync("python3", ["-c", guion, tapa || "", cuerpo, marca, destino], { stdio: ["ignore", "pipe", "pipe"] })).trim());
  } catch (e) {
    console.error("\nNo se pudieron unir tapa y cuerpo. Falta pypdf: pip install pypdf");
    console.error(String(e.stderr || "").trim().split("\n").slice(-3).join("\n"));
    process.exit(1);
  }
}

/* Se abre sin contraseña, pero no se puede editar ni copiar sin la clave de
   propietario. La extracción de texto queda habilitada a propósito: bloquearla
   deja el libro fuera del alcance de quien lo lee con lector de pantalla, y no
   es lo que se quiere evitar.

   datos: { clave, autor, titulo, asunto, imprimir }
     imprimir  true deja imprimir. Un libro de examen se contesta en papel; el
               libro del diagnóstico, que trae las respuestas a la vista, no. */
function proteger(archivo, datos) {
  const guion = `
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions as P

archivo, clave, autor, titulo, asunto, imprimir = sys.argv[1:7]
escritor = PdfWriter()
escritor.append_pages_from_reader(PdfReader(archivo))
escritor.add_metadata({
    "/Title": titulo,
    "/Author": autor,
    "/Subject": asunto,
    "/Creator": "Ajedrez Integral",
    "/Producer": "Ajedrez Integral",
})
permisos = P.EXTRACT_TEXT_AND_GRAPHICS
if imprimir == "1":
    permisos |= P.PRINT | P.PRINT_TO_REPRESENTATION
escritor.encrypt(user_password="", owner_password=clave, permissions_flag=permisos, algorithm="AES-256")
with open(archivo, "wb") as f:
    escritor.write(f)
`;
  try {
    execFileSync("python3", ["-c", guion, archivo, datos.clave, datos.autor, datos.titulo, datos.asunto, datos.imprimir ? "1" : "0"],
      { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    console.error("\nNo se pudo proteger el PDF. Falta pypdf: pip install pypdf");
    console.error(String(e.stderr || "").trim().split("\n").slice(-3).join("\n"));
    fs.unlinkSync(archivo);   // mejor sin archivo que con uno sin proteger
    process.exit(1);
  }
  console.log(`Protegido: se abre sin contraseña, no se puede copiar${datos.imprimir ? "" : " ni imprimir"}.`);
}

module.exports = { unir, proteger };
