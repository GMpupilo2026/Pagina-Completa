"""Deja un PDF adaptado (letra grande y etiquetado) en regla con PDF/UA-1.

Lo llama datosAdaptado() de pdf-armar.js después de que Chromium arma el PDF
con `tagged: true`. Chromium etiqueta lo que está en el árbol de accesibilidad
(títulos, párrafos, listas), pero lo que va con aria-hidden —los dibujos, los
tableros— y el pie con el número de página quedan SIN MARCAR: ni etiquetados
ni como Artifact. veraPDF lo rechaza (PDF/UA-1, 7.1-3: «el contenido se marca
como Artifact o se etiqueta») y un lector de pantalla puede leer ese contenido
suelto. Acá:

  - todo lo que se pinta fuera de una secuencia marcada se envuelve en
    /Artifact BMC … EMC, sin tocar lo etiquetado (sus MCID quedan iguales);
  - se pone el XMP con el identificador de PDF/UA (pdfuaid:part 1) y el
    título (7.1-8 y 7.1-10), el idioma, el título a la vista y los datos.

Se clona el documento entero (clone_from): copiando página por página se
pierde el árbol de etiquetas sin ningún error.

    python3 herramientas/lib/pdf-adaptado.py archivo.pdf autor título asunto
"""
import sys
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (BooleanObject, ContentStream, DecodedStreamObject,
                           DictionaryObject, NameObject, TextStringObject)

# Lo que arma un trazado y lo que lo pinta (o lo usa de recorte, con «n»).
CONSTRUYE = {b"m", b"l", b"c", b"v", b"y", b"h", b"re"}
PINTA = {b"S", b"s", b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*", b"n"}
# Lo que se pinta de una vez: una imagen o un formulario, un sombreado.
SUELTO = {b"Do", b"sh", b"INLINE IMAGE"}
# Lo que escribe texto, dentro de BT … ET.
ESCRIBE = {b"Tj", b"TJ", b"'", b'"'}
ABRE = {b"BMC", b"BDC"}
ARTIFACT_ABRE = ([NameObject("/Artifact")], b"BMC")
ARTIFACT_CIERRA = ([], b"EMC")


def marcar(ops):
    """Envuelve en Artifact lo que se pinta fuera de toda secuencia marcada.

    Las unidades que se envuelven no parten nada a la mitad: un trazado desde
    su primera construcción hasta su pintura (con el recorte W/W* de por
    medio), una imagen, o un texto entero de BT a ET. Si un BT trae adentro
    algo etiquetado, se envuelve cada escritura suelta y no el bloque: una
    secuencia marcada no puede cruzar el borde de un objeto de texto."""
    salida = []
    nivel = 0  # profundidad de secuencias marcadas
    i = 0
    n = len(ops)
    while i < n:
        operandos, op = ops[i]
        if nivel > 0:
            if op in ABRE:
                nivel += 1
            elif op == b"EMC":
                nivel -= 1
            salida.append(ops[i])
            i += 1
            continue
        if op in ABRE:
            nivel += 1
            salida.append(ops[i])
            i += 1
        elif op in CONSTRUYE:
            j = i
            while j < n and ops[j][1] not in PINTA and ops[j][1] not in ABRE:
                j += 1
            if j < n and ops[j][1] in PINTA:
                salida.append(ARTIFACT_ABRE)
                salida.extend(ops[i:j + 1])
                salida.append(ARTIFACT_CIERRA)
                i = j + 1
            else:
                salida.append(ops[i])
                i += 1
        elif op in SUELTO:
            salida.extend([ARTIFACT_ABRE, ops[i], ARTIFACT_CIERRA])
            i += 1
        elif op == b"BT":
            j = i
            while j < n and ops[j][1] != b"ET":
                j += 1
            bloque = ops[i:j + 1]
            if any(o in ABRE for _, o in bloque):
                # Hay algo etiquetado adentro: cada escritura suelta, aparte.
                salida.append(ops[i])
                sub = 0
                for k in range(i + 1, j + 1):
                    o = ops[k][1]
                    if o in ABRE:
                        sub += 1
                    elif o == b"EMC":
                        sub -= 1
                    if sub == 0 and o in ESCRIBE:
                        salida.extend([ARTIFACT_ABRE, ops[k], ARTIFACT_CIERRA])
                    else:
                        salida.append(ops[k])
            elif any(o in ESCRIBE for _, o in bloque):
                salida.append(ARTIFACT_ABRE)
                salida.extend(bloque)
                salida.append(ARTIFACT_CIERRA)
            else:
                salida.extend(bloque)
            i = j + 1
        else:
            salida.append(ops[i])
            i += 1
    return salida


def xmp(titulo, autor, asunto):
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    t, a, s = escape(titulo), escape(autor), escape(asunto)
    return f"""<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">{t}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>{a}</rdf:li></rdf:Seq></dc:creator>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">{s}</rdf:li></rdf:Alt></dc:description>
   <dc:language><rdf:Bag><rdf:li>es-CR</rdf:li></rdf:Bag></dc:language>
   <pdf:Producer>Ajedrez Integral</pdf:Producer>
   <xmp:CreatorTool>Ajedrez Integral</xmp:CreatorTool>
   <xmp:ModifyDate>{ahora}</xmp:ModifyDate>
   <pdfuaid:part>1</pdfuaid:part>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>""".encode("utf-8")


def main():
    archivo, autor, titulo, asunto = sys.argv[1:5]
    escritor = PdfWriter(clone_from=PdfReader(archivo))

    for pagina in escritor.pages:
        contenido = pagina.get_contents()
        if contenido is None:
            continue
        cs = ContentStream(contenido, escritor)
        cs.operations = marcar(cs.operations)
        pagina.replace_contents(cs)
        pagina.compress_content_streams()

    raiz = escritor._root_object
    raiz[NameObject("/Lang")] = TextStringObject("es-CR")
    prefs = raiz.get("/ViewerPreferences")
    prefs = prefs.get_object() if prefs is not None else DictionaryObject()
    prefs[NameObject("/DisplayDocTitle")] = BooleanObject(True)
    raiz[NameObject("/ViewerPreferences")] = prefs
    raiz[NameObject("/PageMode")] = NameObject("/UseOutlines")

    meta = DecodedStreamObject()
    meta.set_data(xmp(titulo, autor, asunto))
    meta[NameObject("/Type")] = NameObject("/Metadata")
    meta[NameObject("/Subtype")] = NameObject("/XML")
    raiz[NameObject("/Metadata")] = escritor._add_object(meta)

    escritor.add_metadata({
        "/Title": titulo,
        "/Author": autor,
        "/Subject": asunto,
        "/Creator": "Ajedrez Integral",
        "/Producer": "Ajedrez Integral",
    })
    escritor.compress_identical_objects()
    with open(archivo, "wb") as f:
        escritor.write(f)


if __name__ == "__main__":
    main()
