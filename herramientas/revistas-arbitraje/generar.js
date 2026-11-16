/* Genera las revistas «Arbitraje de Ajedrez» actualizadas en PDF.
   Uso:  node herramientas/revistas-arbitraje/generar.js 3 8 11
         node herramientas/revistas-arbitraje/generar.js todas
         MUESTRA=1 node herramientas/revistas-arbitraje/generar.js 3   (solo la portada, en PNG)
   Cada número vive en noNN/ (meta.json + cuerpo.html, y capturas/ si las lleva; el N.º 1, en no01/armar.py
   con su template.html). El PDF sale a descargas/aula-arbitraje/revista-NN.pdf;
   después: node herramientas/aula-portadas.js (las portadas de las fichas).
   Necesita playwright y chess.js (npm install) y python con pypdf.
   Ver LEEME.md y «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { Chess } = require("chess.js");
const { ILUSTRACIONES } = require("./ilustraciones.js");
const { MARCA_AGUA } = require("../lib/marca-agua.js");

const AQUI = __dirname;
const RAIZ = path.resolve(AQUI, "..", "..");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const TEMPORAL = path.join(os.tmpdir(), "revistas-arbitraje");
const css = fs.readFileSync(path.join(AQUI, "estilo.css"), "utf8");
const b64 = (f) => "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, f)).toString("base64");
const LOGO = b64("img/logo-marca.png");
const MARCA = b64(MARCA_AGUA);
const AUTOR = "IA Oscar Angulo Cubero";

/* La ilustración del número, en el centro de la portada. Si trae un tablero,
   su FEN se valida igual que los del cuerpo. */
function ilustracion(n) {
    const ilus = ILUSTRACIONES[n];
    if (!ilus) return "";
    if (ilus.fen && !new Chess().validate_fen(ilus.fen).valid) throw new Error("FEN de la ilustración del N.º " + n + " no válido: " + ilus.fen);
    return '<div class="ilus">' + ilus.dibujo() + "</div>";
}

/* Tableros: <div class="tablero" data-fen="..." data-pie="..."></div> → diagrama.
   El FEN se valida con chess.js: una posición ilegal detiene la generación.
   Blancas = símbolos huecos y negras = llenos, los dos en negro, con el
   selector de texto U+FE0E: sin él Chromium usa la fuente de emojis a color. */
const G = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const H = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
function tableros(cuerpo, errores) {
    return cuerpo.replace(/<div class="tablero" data-fen="([^"]+)"(?: data-pie="([^"]*)")?\s*><\/div>/g, (m, fen, pie) => {
        const v = new Chess().validate_fen(fen);
        if (!v.valid) errores.push("FEN no válido (" + v.error + "): " + fen);
        let h = '<figure class="board"><div class="grid">';
        fen.split(" ")[0].split("/").forEach((fila, r) => {
            const sq = [];
            for (const ch of fila) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) sq.push(""); else sq.push(ch); }
            sq.forEach((p, c) => {
                const blanca = p && p === p.toUpperCase();
                const cls = ((r + c) % 2 ? "d" : "l") + (p ? " pz" : "");
                h += '<span class="' + cls + '">' + (p ? (blanca ? H : G)[p.toLowerCase()] + "︎" : "") + "</span>";
            });
        });
        return h + '</div><div class="files">' + "abcdefgh".split("").map((x) => "<i>" + x + "</i>").join("") + "</div>" + (pie ? "<figcaption>" + pie + "</figcaption>" : "") + "</figure>";
    });
}

const ESTILO_ILUS = ".cover .ilus { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 6mm 0 4mm; position: relative; z-index: 1; }\n.cover .ilus svg { width: 122mm; height: auto; max-height: 100mm; }\n.cover .toc { margin-top: auto; position: relative; z-index: 1; }";

/* El HTML completo de un número (portada + presentación + cuerpo). */
function armarHtml(n, dir) {
    if (n === 1) {
        /* El N.º 1 se hizo antes del generador común: lo arma no01/armar.py. */
        const salida = path.join(dir, "base.html");
        execFileSync(PYTHON, [path.join(AQUI, "no01", "armar.py"), salida], { stdio: "inherit" });
        let html = fs.readFileSync(salida, "utf8");
        const kicker = '<div class="kicker" style="color:#cfdcf3">Revista especializada</div>';
        if (!html.includes(kicker) || !html.includes('<div class="toc">')) throw new Error("La plantilla del N.º 1 cambió: no se encuentra dónde poner el logo o la ilustración.");
        html = html.replace(kicker, '<img src="' + LOGO + '" alt="Ajedrez Integral" style="position:absolute;top:18mm;right:18mm;height:16mm;width:auto">\n  ' + kicker)
            .replace('<div class="toc">', ilustracion(1) + '\n  <div class="toc">')
            .replace(".cover .toc { margin-top: auto; }", ESTILO_ILUS);
        return html;
    }
    const carpeta = path.join(AQUI, "no" + String(n).padStart(2, "0"));
    const meta = JSON.parse(fs.readFileSync(path.join(carpeta, "meta.json"), "utf8"));
    const errores = [];
    let cuerpo = tableros(fs.readFileSync(path.join(carpeta, "cuerpo.html"), "utf8"), errores);
    if (/class="tablero"/.test(cuerpo)) errores.push("Quedó un tablero sin convertir (revisa el formato del div).");
    if (/claude|anthropic|chatgpt|inteligencia artificial/i.test(cuerpo + JSON.stringify(meta))) errores.push("El texto menciona IA o un asistente.");
    /* Capturas: <img src="capturas/archivo.png"> de noNN/capturas/ se incrustan en el PDF. */
    cuerpo = cuerpo.replace(/<img src="(capturas\/[^"]+\.(png|jpg))"/g, (m, rel, ext) => {
        const f = path.join(carpeta, rel);
        if (!fs.existsSync(f)) { errores.push("Falta la captura " + rel); return m; }
        return '<img src="data:image/' + (ext === "jpg" ? "jpeg" : "png") + ";base64," + fs.readFileSync(f).toString("base64") + '"';
    });
    if (errores.length) throw new Error("N.º " + n + ":\n" + errores.join("\n"));
    /* Un número especial (meta.especial) no es una revista vieja actualizada:
       es nuevo, de Ajedrez Integral, y no lleva la tabla de cambios. */
    const esp = meta.especial;
    const portada = `
<section class="cover">
  <img src="${LOGO}" alt="Ajedrez Integral" style="position:absolute;top:18mm;right:18mm;height:16mm;width:auto">
  <div class="kicker" style="color:#cfdcf3">Revista especializada</div>
  <h1 class="mast"><small>Arbitraje de</small>Ajedrez</h1>
  <div class="issue"><span>Número <b>${n}</b></span><span>·</span><span>${esp ? esp.edicion : "Edición revisada y actualizada · noviembre 2026"}</span></div>
  <div class="issue" style="margin-top:6px"><span>${esp ? "Autor" : "Revisión y actualización"}: <b>${AUTOR}</b></span></div>
  <div><span class="stamp">${esp ? esp.sello : "Actualizada a la normativa FIDE vigente"}</span></div>
  <div class="bigpiece">♞</div>
  ${ilustracion(n)}
  <div class="toc">${meta.temas.map((t) => `<div><span class="t">${t.titulo}</span><span class="d">${t.desc || ""}</span></div>`).join("")}</div>
</section>`;
    const dirFilas = esp ? [["Autor", AUTOR + " · Árbitro Internacional · Ajedrez Integral"]]
        : (meta.directorio || [["Director (edición original)", "Santiago García Ramos · Árbitro Internacional"]])
            .concat([["Revisión y actualización 2026", AUTOR + " · Árbitro Internacional · Ajedrez Integral"]]);
    const cambios = esp ? "" : `
  <div class="box new" style="margin-top:14px"><p><b>Sobre esta edición revisada (noviembre 2026), por ${AUTOR}.</b> El número ${n} se publicó en ${meta.fecha_original}. Esta edición conserva los temas y el enfoque didáctico, pero revisa cada artículo contra la normativa FIDE vigente hoy:</p></div>
  <table><tr><th style="width:24%">Tema</th><th style="width:38%">Edición original</th><th>Edición actualizada</th></tr>
  ${meta.cambios.map((c) => `<tr><td>${c[0]}</td><td>${c[1]}</td><td>${c[2]}</td></tr>`).join("")}
  </table>`;
    const presentacion = `
<section class="page">
  <div class="kicker">Presentación</div>
  <h2 class="sec">${meta.titulo_presentacion || "Sobre esta edición"}</h2>
  ${meta.presentacion || ""}${cambios}
  <table class="dir" style="width:auto;margin-top:6px">${dirFilas.map((d) => `<tr><td><b>${d[0]}</b></td><td>${d[1]}</td></tr>`).join("")}</table>
</section>`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Arbitraje de Ajedrez N.º ${n}</title><style>${css}</style></head><body>${portada}${presentacion}${cuerpo}</body></html>`;
}

const SOLO_PORTADA = "<style>@page{size:A4;margin:0} .page{display:none!important} .cover{margin:0!important;height:297mm!important}</style>";
const SOLO_CUERPO = "<style>@page{size:A4;margin:16mm 15mm 18mm 15mm} .cover{display:none!important} section.cover + section.page{page-break-before:auto!important;break-before:auto!important}</style>";
const HOJA_MARCA = '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html,body{margin:0;width:210mm;height:297mm}.sello{position:absolute;left:52.5mm;top:109mm;width:105mm;transform:rotate(-15deg);opacity:.11}.sello img{display:block;width:105mm;height:auto}</style></head><body><div class="sello"><img src="' + MARCA + '" alt=""></div></body></html>';

async function generar(b, n) {
    const nn = String(n).padStart(2, "0");
    const dir = path.join(TEMPORAL, "no" + nn);
    fs.mkdirSync(dir, { recursive: true });
    const html = armarHtml(n, dir);
    if (process.env.MUESTRA) {
        const p = await b.newPage({ viewport: { width: 794, height: 1123 } });
        await p.setContent(html.replace("</style>", "</style>" + SOLO_PORTADA), { waitUntil: "load" });
        const png = path.join(TEMPORAL, "portada-" + nn + ".png");
        await p.screenshot({ path: png, clip: { x: 0, y: 0, width: 794, height: 1123 } });
        await p.close();
        return console.log("Muestra:", png);
    }
    const imprimir = async (extra, destino, pie) => {
        const p = await b.newPage();
        await p.setContent(html.replace("</style>", "</style>" + extra), { waitUntil: "load" });
        await p.pdf(Object.assign({ path: destino, format: "A4", printBackground: true }, pie ? {
            margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" }, displayHeaderFooter: true, headerTemplate: "<div></div>",
            footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#829ab1;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;"><span>Ajedrez Integral · Revista Arbitraje de Ajedrez N.º ${n}</span><span style="font-weight:700;color:#627d98;">${AUTOR}</span><span class="pageNumber"></span></div>`,
        } : { margin: { top: 0, bottom: 0, left: 0, right: 0 } }));
        await p.close();
    };
    await imprimir(SOLO_PORTADA, path.join(dir, "_portada.pdf"), false);
    await imprimir(SOLO_CUERPO, path.join(dir, "_cuerpo.pdf"), true);
    const m = await b.newPage();
    await m.setContent(HOJA_MARCA, { waitUntil: "load" });
    await m.pdf({ path: path.join(dir, "_marca.pdf"), format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    await m.close();
    const salida = path.join(RAIZ, "descargas", "aula-arbitraje", "revista-" + nn + ".pdf");
    /* Une portada y cuerpo, pone la marca de agua encima de cada página y los metadatos. */
    execFileSync(PYTHON, ["-c", `
import sys
from pypdf import PdfReader, PdfWriter
d, salida, n = sys.argv[1], sys.argv[2], sys.argv[3]
w = PdfWriter()
for f in ("_portada.pdf", "_cuerpo.pdf"):
    for p in PdfReader(d + "/" + f).pages: w.add_page(p)
marca = PdfReader(d + "/_marca.pdf").pages[0]
for p in w.pages: p.merge_page(marca, over=True)
w.add_metadata({"/Title": "Arbitraje de Ajedrez N.º " + n + " — Edición revisada y actualizada", "/Author": "IA Oscar Angulo Cubero", "/Creator": "Ajedrez Integral", "/Producer": "Ajedrez Integral"})
with open(salida, "wb") as f: w.write(f)
print("N.º " + n + ": " + str(len(w.pages)) + " páginas")
`, dir, salida, String(n)], { stdio: "inherit" });
}

(async () => {
    const args = process.argv.slice(2);
    if (!args.length) { console.error("Uso: node herramientas/revistas-arbitraje/generar.js <número…|todas>"); process.exit(2); }
    const total = fs.readdirSync(AQUI).filter((d) => /^no\d\d$/.test(d)).length;
    const numeros = args.includes("todas") ? Array.from({ length: total }, (_, i) => i + 1) : args.map((a) => parseInt(String(a).replace(/^no/, ""), 10));
    if (numeros.some((n) => !(n >= 1 && n <= total))) { console.error("Números del 1 al " + total + "."); process.exit(2); }
    const b = await chromium.launch();
    try {
        for (const n of numeros) await generar(b, n);
    } finally {
        await b.close();
    }
    if (!process.env.MUESTRA) console.log("Listo. Ahora: node herramientas/aula-portadas.js");
})().catch((e) => { console.error(e.message || e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
