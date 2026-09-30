#!/usr/bin/env node
/*
 * Comprueba `respaldo-storage.js` y `restaurar-storage.js` contra un Storage
 * de mentira (un servidor http local que contesta como la API de Supabase).
 * No necesita red, ni navegador, ni claves.
 *
 * Lo que tiene que pasar, porque cada cosa es un respaldo a medias que no da
 * ningún error:
 *   - baja las subcarpetas, no solo lo de la raíz;
 *   - pagina: una carpeta con más archivos que una página sale entera;
 *   - los bytes llegan iguales (binario, nombres con espacios y tildes);
 *   - si una descarga llega cortada, el respaldo FALLA;
 *   - al restaurar, un bucket privado vuelve privado;
 *   - al restaurar, no pisa lo que ya está (salvo con --pisar);
 *   - un respaldo dañado no se sube.
 *
 *   node herramientas/verificar-respaldo-storage.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");

const HERR = __dirname;
let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fallos++; };

/* ---------------------------------------------------------- Storage de mentira */
function storage() {
  const buckets = new Map(); // id -> { conf, archivos: Map(ruta -> {buf, tipo}) }
  let cortar = null;         // ruta cuya descarga llega cortada
  const CLAVE = "clave-de-prueba";

  const srv = http.createServer((req, res) => {
    const partes = [];
    req.on("data", (d) => partes.push(d));
    req.on("end", () => {
      const cuerpo = Buffer.concat(partes);
      const json = (st, o) => { res.writeHead(st, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.headers.apikey !== CLAVE || req.headers.authorization !== `Bearer ${CLAVE}`) return json(401, { message: "sin clave" });
      const u = new URL(req.url, "http://x");
      const p = u.pathname;

      if (p === "/storage/v1/bucket" && req.method === "GET") {
        return json(200, [...buckets.values()].map((b) => b.conf));
      }
      if (p === "/storage/v1/bucket" && req.method === "POST") {
        const c = JSON.parse(cuerpo);
        buckets.set(c.id, { conf: c, archivos: new Map() });
        return json(200, { name: c.id });
      }
      let m = p.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
      if (m && req.method === "POST") {
        const b = buckets.get(decodeURIComponent(m[1]));
        const { prefix, limit, offset } = JSON.parse(cuerpo);
        const pre = prefix ? prefix + "/" : "";
        const vistos = new Map();
        for (const [ruta, a] of b.archivos) {
          if (!ruta.startsWith(pre)) continue;
          const resto = ruta.slice(pre.length);
          const i = resto.indexOf("/");
          if (i >= 0) vistos.set(resto.slice(0, i), { name: resto.slice(0, i), id: null, metadata: null });
          else vistos.set(resto, { name: resto, id: crypto.randomUUID(), metadata: { size: a.buf.length, mimetype: a.tipo } });
        }
        const lista = [...vistos.values()].sort((x, y) => x.name.localeCompare(y.name));
        return json(200, lista.slice(offset, offset + limit));
      }
      m = p.match(/^\/storage\/v1\/object\/authenticated\/([^/]+)\/(.+)$/);
      if (m && req.method === "GET") {
        const ruta = m[2].split("/").map(decodeURIComponent).join("/");
        const a = buckets.get(decodeURIComponent(m[1])).archivos.get(ruta);
        if (!a) return json(404, { message: "no está" });
        res.writeHead(200, { "Content-Type": a.tipo });
        return res.end(ruta === cortar ? a.buf.subarray(0, a.buf.length - 3) : a.buf);
      }
      m = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
      if (m && req.method === "POST") {
        const b = buckets.get(decodeURIComponent(m[1]));
        const ruta = m[2].split("/").map(decodeURIComponent).join("/");
        if (b.archivos.has(ruta) && req.headers["x-upsert"] !== "true") return json(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        b.archivos.set(ruta, { buf: cuerpo, tipo: req.headers["content-type"] });
        return json(200, { Key: ruta });
      }
      json(404, { message: `no sé ${req.method} ${p}` });
    });
  });
  return {
    CLAVE, buckets, srv,
    cortar: (r) => { cortar = r; },
    poner(bucket, conf) { buckets.set(bucket, { conf: Object.assign({ id: bucket, name: bucket }, conf), archivos: new Map() }); },
    archivo(bucket, ruta, buf, tipo = "application/octet-stream") { buckets.get(bucket).archivos.set(ruta, { buf, tipo }); },
  };
}

// Asíncrono a propósito: con spawnSync el proceso se queda esperando al
// script y el Storage de mentira, que vive en este mismo proceso, no contesta.
function correr(script, env, args = []) {
  return new Promise((listo) => {
    const h = spawn(process.execPath, [path.join(HERR, script), ...args], { env: Object.assign({}, process.env, env) });
    let salida = "";
    h.stdout.on("data", (d) => { salida += d; });
    h.stderr.on("data", (d) => { salida += d; });
    h.on("close", (codigo) => listo({ codigo, salida }));
  });
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "respaldo-storage-"));
  const origen = storage();
  await new Promise((r) => origen.srv.listen(0, "127.0.0.1", r));
  const URL_O = `http://127.0.0.1:${origen.srv.address().port}`;

  const binario = crypto.randomBytes(5000);
  origen.poner("academia-marca", { public: true, file_size_limit: 524288, allowed_mime_types: ["image/png"] });
  origen.poner("justificaciones", { public: false, file_size_limit: 5242880, allowed_mime_types: null });
  origen.poner("vacio", { public: false });
  origen.archivo("academia-marca", "logo.png", binario, "image/png");
  // 5 archivos en una carpeta, con página de 2: sin paginar saldrían 2.
  for (let i = 1; i <= 5; i++) origen.archivo("justificaciones", `alumno-1/2026/nota ${i}.pdf`, Buffer.from(`pdf ${i}`), "application/pdf");
  origen.archivo("justificaciones", "alumno-2/constancia médica #1.pdf", Buffer.from("tildes"), "application/pdf");

  const env = { SUPABASE_URL: URL_O + "/", SUPABASE_SERVICE_ROLE_KEY: origen.CLAVE, RESPALDOS_DIR: tmp, STORAGE_PAGINA: "2" };

  console.log("\nRespaldo");
  const sinClave = await correr("respaldo-storage.js", { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" });
  ok(sinClave.codigo === 1 && /Faltan SUPABASE_URL/.test(sinClave.salida), "sin la URL o la clave, se niega y lo dice");

  const r1 = await correr("respaldo-storage.js", env);
  ok(r1.codigo === 0, `termina bien${r1.codigo ? ": " + r1.salida : ""}`);
  const carpeta = fs.readdirSync(tmp).filter((f) => f.startsWith("storage-")).map((f) => path.join(tmp, f))[0];
  const man = carpeta && JSON.parse(fs.readFileSync(path.join(carpeta, "manifiesto.json"), "utf8"));
  const j = man && man.buckets.find((b) => b.id === "justificaciones");
  ok(man && man.buckets.length === 3, "están los tres buckets en el manifiesto, también el vacío");
  ok(j && j.archivos.length === 6, `las subcarpetas y todas las páginas: ${j ? j.archivos.length : 0} de 6 justificaciones`);
  ok(j && j.public === false && man.buckets.find((b) => b.id === "academia-marca").public === true, "guarda si cada bucket es público o privado");
  ok(carpeta && Buffer.compare(fs.readFileSync(path.join(carpeta, "academia-marca", "logo.png")), binario) === 0, "el archivo binario llega igual, byte a byte");
  ok(carpeta && fs.existsSync(path.join(carpeta, "justificaciones", "alumno-2", "constancia médica #1.pdf")), "un nombre con espacio, tilde y «#» se baja bien");

  origen.cortar("alumno-1/2026/nota 3.pdf");
  const r2 = await correr("respaldo-storage.js", Object.assign({}, env, { RESPALDOS_DIR: path.join(tmp, "cortado") }));
  ok(r2.codigo === 1 && /nota 3\.pdf/.test(r2.salida), "si una descarga llega cortada, el respaldo falla y dice cuál");
  origen.cortar(null);

  console.log("\nRestauración");
  const destino = storage();
  await new Promise((r) => destino.srv.listen(0, "127.0.0.1", r));
  const envD = { SUPABASE_URL: `http://127.0.0.1:${destino.srv.address().port}`, SUPABASE_SERVICE_ROLE_KEY: destino.CLAVE };

  const r3 = await correr("restaurar-storage.js", envD, [carpeta]);
  ok(r3.codigo === 0, `sube todo a un proyecto vacío${r3.codigo ? ": " + r3.salida : ""}`);
  const bj = destino.buckets.get("justificaciones");
  ok(bj && bj.conf.public === false, "el bucket privado vuelve PRIVADO");
  ok(bj && bj.conf.file_size_limit === 5242880, "con su tamaño máximo");
  ok(bj && bj.archivos.size === 6, "con sus seis archivos");
  const logo = destino.buckets.get("academia-marca");
  ok(logo && Buffer.compare(logo.archivos.get("logo.png").buf, binario) === 0 && logo.archivos.get("logo.png").tipo === "image/png", "el logo vuelve igual y con su tipo");

  destino.archivo("academia-marca", "logo.png", Buffer.from("más nuevo"), "image/png");
  const r4 = await correr("restaurar-storage.js", envD, [carpeta]);
  ok(r4.codigo === 0 && destino.buckets.get("academia-marca").archivos.get("logo.png").buf.toString() === "más nuevo", "sin --pisar, no reemplaza lo que ya está");
  const r5 = await correr("restaurar-storage.js", envD, [carpeta, "--pisar"]);
  ok(r5.codigo === 0 && Buffer.compare(destino.buckets.get("academia-marca").archivos.get("logo.png").buf, binario) === 0, "con --pisar, sí");

  fs.writeFileSync(path.join(carpeta, "justificaciones", "alumno-1", "2026", "nota 1.pdf"), "dañado");
  const antes = destino.buckets.get("justificaciones").archivos.size;
  destino.buckets.delete("vacio");
  const r6 = await correr("restaurar-storage.js", envD, [carpeta, "--pisar"]);
  ok(r6.codigo === 1 && /dañado/.test(r6.salida) && !destino.buckets.has("vacio") && destino.buckets.get("justificaciones").archivos.size === antes,
    "un respaldo dañado no se sube: ni un archivo ni un bucket");

  origen.srv.close(); destino.srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
