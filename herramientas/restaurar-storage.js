#!/usr/bin/env node
/*
 * Vuelve a subir a Storage un respaldo hecho con `respaldo-storage.js`.
 *
 *   SUPABASE_URL='https://<ref>.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='…' \
 *     node herramientas/restaurar-storage.js respaldos/storage-<fecha>
 *
 * - Crea los buckets que falten con la MISMA configuración (público o no,
 *   tamaño máximo, tipos permitidos). Un bucket privado recreado como público
 *   dejaría las justificaciones a la vista de cualquiera sin ningún error.
 *   Si el bucket ya existe y su configuración es otra, avisa y no lo toca.
 * - NO pisa un archivo que ya está: si hoy hay uno con esa ruta, es más nuevo
 *   que el respaldo. Con `--pisar` sí los reemplaza.
 * - Antes de subir, comprueba el sha256 de cada archivo contra el manifiesto:
 *   un respaldo dañado no se sube.
 *
 * Las políticas de Storage (quién lee qué) NO van acá: son de la base y
 * vuelven con las migraciones.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { cabeceras, pedir, rutaUrl, sha256 } = require("./respaldo-storage");

async function main(argv) {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const carpeta = argv.find((a) => !a.startsWith("--"));
  const pisar = argv.includes("--pisar");
  if (!url || !clave || !carpeta) {
    console.error("Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node herramientas/restaurar-storage.js respaldos/storage-<fecha> [--pisar]");
    process.exit(1);
  }
  const manifiesto = JSON.parse(fs.readFileSync(path.join(carpeta, "manifiesto.json"), "utf8"));

  // Primero se comprueba TODO el respaldo; un archivo dañado a la mitad dejaría
  // la restauración a medias.
  for (const b of manifiesto.buckets) {
    for (const a of b.archivos) {
      const local = path.join(carpeta, b.id, a.ruta);
      if (!fs.existsSync(local)) throw new Error(`falta ${b.id}/${a.ruta} en el respaldo`);
      if (sha256(fs.readFileSync(local)) !== a.sha256) throw new Error(`${b.id}/${a.ruta} está dañado (el sha256 no cuadra)`);
    }
  }

  const existentes = await (await pedir(`${url}/storage/v1/bucket`, { headers: cabeceras(clave) })).json();
  let subidos = 0, saltados = 0;

  for (const b of manifiesto.buckets) {
    const hoy = existentes.find((e) => e.id === b.id);
    if (!hoy) {
      await pedir(`${url}/storage/v1/bucket`, {
        method: "POST",
        headers: cabeceras(clave, { "Content-Type": "application/json" }),
        body: JSON.stringify({ id: b.id, name: b.id, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types }),
      });
      console.log(`${b.id}: bucket creado (${b.public ? "público" : "privado"})`);
    } else if (!!hoy.public !== b.public) {
      console.warn(`⚠ ${b.id}: hoy es ${hoy.public ? "público" : "privado"} y en el respaldo era ${b.public ? "público" : "privado"}. No se cambia: revísalo a mano.`);
    }

    for (const a of b.archivos) {
      const r = await fetch(`${url}/storage/v1/object/${encodeURIComponent(b.id)}/${rutaUrl(a.ruta)}`, {
        method: "POST",
        headers: cabeceras(clave, { "Content-Type": a.tipo || "application/octet-stream", "x-upsert": pisar ? "true" : "false" }),
        body: fs.readFileSync(path.join(carpeta, b.id, a.ruta)),
      });
      if (r.ok) { subidos++; continue; }
      const cuerpo = await r.text().catch(() => "");
      // Storage contesta 409 (o 400 con «Duplicate»/«already exists») cuando ya está.
      if (!pisar && (r.status === 409 || /duplicate|already exists/i.test(cuerpo))) { saltados++; continue; }
      throw new Error(`${b.id}/${a.ruta} → ${r.status} ${cuerpo.slice(0, 200)}`);
    }
  }
  console.log(`\n✓ ${subidos} archivo(s) subidos${saltados ? `, ${saltados} ya estaban y no se tocaron (--pisar para reemplazarlos)` : ""}.`);
  return { subidos, saltados };
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}

module.exports = { main };
