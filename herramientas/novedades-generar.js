#!/usr/bin/env node
/* Arma data/novedades.json —la lista de todo lo que se le hizo al sitio desde
 * el primer commit— leyendo la historia de git de `main`.
 *
 *     git fetch origin main        # (en una copia superficial: --unshallow)
 *     node herramientas/novedades-generar.js
 *
 * La lista NO se escribe a mano: una bitácora escrita aparte de la historia
 * se va quedando atrás a la primera tanda que se olvide de anotarse, y nadie
 * se entera. La historia de git ya dice qué se hizo y cuándo; esto solo la
 * pone en un formato que lee novedades.html.
 *
 * Se toma SOLO el título de cada cambio, nunca el cuerpo. El archivo queda
 * servido como cualquier otro del sitio y los cuerpos de los PR explican el
 * modelo de permisos por dentro —la misma razón por la que CLAUDE.md y
 * supabase/ están en .assetsignore—.
 *
 * Se recorre con --first-parent: un cambio es lo que entró a `main`, no cada
 * commit intermedio de su rama. Los «Merge pull request #N from …» del
 * principio no dicen nada, así que se usa la primera línea de su cuerpo, que
 * es el título del PR.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "data", "novedades.json");

function git(args) {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") {
  console.error("✗ La copia de git es superficial: falta la historia vieja.\n  Corre antes: git fetch --unshallow origin main");
  process.exit(1);
}

let rama = "origin/main";
try { git(["rev-parse", "--verify", "--quiet", rama]); } catch (e) { rama = "HEAD"; }

// Separadores que no aparecen en un mensaje de commit.
const SEP = "\x1f", FIN = "\x1e";
const crudo = git(["log", rama, "--first-parent", `--format=%h${SEP}%cI${SEP}%s${SEP}%b${FIN}`]);

const cambios = [];
for (const bloque of crudo.split(FIN)) {
  const partes = bloque.replace(/^\n+/, "").split(SEP);
  if (partes.length < 4) continue;
  const [hash, fecha, asunto, cuerpo] = partes;
  let titulo = asunto.trim();
  let pr = null;
  const merge = titulo.match(/^Merge pull request #(\d+)/);
  if (merge) {
    pr = Number(merge[1]);
    titulo = (cuerpo.split("\n").map((l) => l.trim()).find(Boolean) || titulo);
  } else {
    const m = titulo.match(/\s*\(#(\d+)\)\s*$/);
    if (m) { pr = Number(m[1]); titulo = titulo.slice(0, m.index).trim(); }
  }
  cambios.push({ hash, fecha, titulo, pr });
}

/* Los títulos se pintan en el sitio, así que valen las reglas de su español:
 * alguno viejo trae voseo («te transformás»). Se pasan por el MISMO corrector
 * de verificar-voseo.py —una segunda tabla de verbos acá se separaría de la
 * primera— sin tocar la historia de git, que queda como se escribió. */
const corregidos = JSON.parse(execFileSync("python3", ["-c", [
  "import json, sys, importlib.util",
  "spec = importlib.util.spec_from_file_location('v', sys.argv[1])",
  "v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)",
  "print(json.dumps([v.arreglar(t)[0] for t in json.load(sys.stdin)]))",
].join("\n"), path.join(__dirname, "verificar-voseo.py")], { input: JSON.stringify(cambios.map((c) => c.titulo)), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
cambios.forEach((c, i) => { c.titulo = corregidos[i]; });

if (!cambios.length) { console.error("✗ No salió ningún cambio de la historia."); process.exit(1); }

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, JSON.stringify({ cambios }, null, 1) + "\n");
console.log(`✓ ${cambios.length} cambios, del ${cambios[cambios.length - 1].fecha.slice(0, 10)} al ${cambios[0].fecha.slice(0, 10)} → data/novedades.json`);
