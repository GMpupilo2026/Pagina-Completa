#!/usr/bin/env node
/*
 * Respalda los ARCHIVOS de Storage (logos de academias, adjuntos de
 * formularios, justificaciones), que ni las copias diarias de Supabase ni
 * `respaldo-datos.sh` cubren: esas guardan la fila que describe el archivo,
 * no el archivo. Si se borra un adjunto, restaurar una copia de la base no lo
 * devuelve. Ver «Lo que las copias diarias no cubren» en RESTAURAR.md.
 *
 *   SUPABASE_URL='https://<ref>.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='…' \
 *     node herramientas/respaldo-storage.js
 *
 * La clave es la service_role (o la «secret key», sb_secret_…) del panel:
 * Project Settings › API Keys. Lee TODOS los buckets, también los privados, así
 * que va por variable de entorno y nunca en un archivo del repositorio: una
 * clave en el repositorio es una clave publicada.
 *
 * Deja `respaldos/storage-<fecha>/<bucket>/<ruta>` y un `manifiesto.json` con
 * el tamaño y el sha256 de cada archivo (y la configuración de cada bucket,
 * para volver a crearlo igual). `respaldos/` está en .gitignore y en
 * .assetsignore: adentro van justificaciones médicas y adjuntos de menores.
 *
 * Un respaldo que se corta a la mitad no da ningún error —la carpeta está, los
 * archivos se ven—, así que al terminar se vuelve a LEER cada archivo del
 * disco y se compara contra lo que dijo Storage. Si no cuadra, sale con error.
 *
 * Se restaura con `herramientas/restaurar-storage.js`.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Storage lista de a 1000 como máximo; se pide menos y se pagina siempre,
// igual que con PostgREST: una carpeta con más de lo que cabe en una página
// se respaldaría a medias sin ningún aviso.
const PAGINA = Number(process.env.STORAGE_PAGINA) || 100;

function config() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !clave) {
    console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. Ver el encabezado de este archivo.");
    process.exit(1);
  }
  return { url, clave };
}

// La clave va en `apikey`. La service_role vieja es un JWT y va también como
// Bearer; la «secret key» nueva (sb_secret_…) NO es un JWT, y Storage la
// rechaza en Authorization con «Invalid Compact JWS»: con ella, solo `apikey`
// (la puerta de Supabase arma el token por dentro).
const cabeceras = (clave, extra) => Object.assign(
  { apikey: clave },
  clave.startsWith("sb_") ? {} : { Authorization: `Bearer ${clave}` },
  extra || {});

// Cada tramo de la ruta va codificado por separado: la «/» separa carpetas y
// un nombre con espacios, tildes o «#» se pediría mal si se codifica entero.
const rutaUrl = (ruta) => ruta.split("/").map(encodeURIComponent).join("/");

async function pedir(url, opciones) {
  const r = await fetch(url, opciones);
  if (!r.ok) {
    const cuerpo = await r.text().catch(() => "");
    throw new Error(`${opciones && opciones.method || "GET"} ${url} → ${r.status} ${cuerpo.slice(0, 200)}`);
  }
  return r;
}

async function buckets({ url, clave }) {
  const r = await pedir(`${url}/storage/v1/bucket`, { headers: cabeceras(clave) });
  return r.json();
}

/* Recorre un bucket entero. Una entrada sin `id` es una carpeta (Storage no
   tiene carpetas de verdad: es el prefijo de otras rutas) y se baja a ella. */
async function listar({ url, clave }, bucket, prefijo = "") {
  const archivos = [];
  for (let offset = 0; ; offset += PAGINA) {
    const r = await pedir(`${url}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: cabeceras(clave, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: prefijo, limit: PAGINA, offset, sortBy: { column: "name", order: "asc" } }),
    });
    const lote = await r.json();
    for (const e of lote) {
      const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
      if (e.id == null) archivos.push(...await listar({ url, clave }, bucket, ruta));
      else archivos.push({ ruta, tamano: e.metadata && Number(e.metadata.size), tipo: e.metadata && e.metadata.mimetype });
    }
    if (lote.length < PAGINA) break;
  }
  return archivos;
}

async function bajar({ url, clave }, bucket, ruta) {
  const r = await pedir(`${url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${rutaUrl(ruta)}`, {
    headers: cabeceras(clave),
  });
  return Buffer.from(await r.arrayBuffer());
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function main() {
  const cx = config();
  const raiz = process.env.RESPALDOS_DIR || path.join(__dirname, "..", "respaldos");
  const fecha = new Date().toLocaleString("sv-SE", { timeZone: "America/Costa_Rica" }).slice(0, 16).replace(/[ :]/g, "-");
  const destino = path.join(raiz, `storage-${fecha}`);
  fs.mkdirSync(destino, { recursive: true });

  const manifiesto = { proyecto: cx.url, fecha: new Date().toISOString(), buckets: [] };
  let total = 0, bytes = 0;

  for (const b of await buckets(cx)) {
    const archivos = await listar(cx, b.id);
    console.log(`${b.id}: ${archivos.length} archivo(s)`);
    const entrada = {
      id: b.id, public: !!b.public,
      file_size_limit: b.file_size_limit ?? null,
      allowed_mime_types: b.allowed_mime_types ?? null,
      archivos: [],
    };
    for (const a of archivos) {
      // La ruta viene de Storage, no de este script: un «..» la sacaría de la
      // carpeta del respaldo.
      const local = path.join(destino, b.id, a.ruta);
      if (!local.startsWith(path.join(destino, b.id) + path.sep)) throw new Error(`ruta rara en ${b.id}: ${a.ruta}`);
      const buf = await bajar(cx, b.id, a.ruta);
      if (Number.isFinite(a.tamano) && buf.length !== a.tamano) {
        throw new Error(`${b.id}/${a.ruta}: Storage dice ${a.tamano} bytes y llegaron ${buf.length}`);
      }
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, buf);
      entrada.archivos.push({ ruta: a.ruta, tamano: buf.length, tipo: a.tipo || null, sha256: sha256(buf) });
      total++; bytes += buf.length;
    }
    manifiesto.buckets.push(entrada);
  }
  fs.writeFileSync(path.join(destino, "manifiesto.json"), JSON.stringify(manifiesto, null, 2));

  // Comprobación: lo que quedó en el disco es lo que dice el manifiesto.
  let malos = 0;
  for (const b of manifiesto.buckets) {
    for (const a of b.archivos) {
      const local = path.join(destino, b.id, a.ruta);
      if (!fs.existsSync(local) || sha256(fs.readFileSync(local)) !== a.sha256) {
        console.error(`✗ ${b.id}/${a.ruta} no quedó bien en el disco`);
        malos++;
      }
    }
  }
  if (malos) { console.error(`✗ ${malos} archivo(s) mal: este respaldo NO sirve.`); process.exit(1); }

  console.log(`\n✓ ${total} archivo(s), ${(bytes / 1024).toFixed(0)} kB, en ${path.relative(process.cwd(), destino) || destino}`);
  console.log("  Para comparar contra la base (tienen que salir los mismos números):");
  console.log("    select bucket_id, count(*), sum((metadata->>'size')::bigint)");
  console.log("    from storage.objects group by 1 order by 1;");
  console.log("\nConviene guardar una copia FUERA de esta computadora: un respaldo que vive en el");
  console.log("mismo lugar que lo respaldado no es un respaldo.");
  return destino;
}

if (require.main === module) {
  main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}

module.exports = { main, listar, rutaUrl, cabeceras, pedir, sha256 };
