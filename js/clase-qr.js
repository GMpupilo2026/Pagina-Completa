/* El código de sesion.html.

   Entrar desde el celular con un código QR: en el proyector, «📱 Código para
   entrar» muestra un código grande que abre sesion.html?profe=<id> en el
   celular del alumno (ClaseElegida lo usa para entrar a la clase de ESTE
   profe, si es uno de los suyos). Ver «Entrar desde el celular con un código
   QR» en docs/decisiones/clase-en-vivo.md.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js. La librería del QR (js/vendor/qrcode.js)
   se pide recién al mostrarlo: solo la usa el proyector. */

window.EntrarConQr = (function () {
    function enlace(origen, profesorId) {
        return String(origen).replace(/\/+$/, "") + "/sesion.html?profe=" + encodeURIComponent(profesorId);
    }

    // Los módulos del código (true = negro), con corrección de errores M: aguanta
    // un proyector con reflejos o un poco desenfocado.
    function modulos(texto) {
        const qr = window.qrcode(0, "M");
        qr.addData(texto);
        qr.make();
        const n = qr.getModuleCount();
        const filas = [];
        for (let y = 0; y < n; y++) {
            const fila = [];
            for (let x = 0; x < n; x++) fila.push(qr.isDark(y, x));
            filas.push(fila);
        }
        return filas;
    }

    /* El dibujo, armado con el DOM (nada de innerHTML). Lleva su margen blanco
       de 4 módulos, que es parte del código: sin él la cámara no lo encuentra. */
    function svg(texto) {
        const m = modulos(texto);
        const n = m.length, borde = 4, lado = n + borde * 2;
        const NS = "http://www.w3.org/2000/svg";
        const s = document.createElementNS(NS, "svg");
        s.setAttribute("viewBox", "0 0 " + lado + " " + lado);
        s.setAttribute("width", "100%");
        s.setAttribute("height", "100%");
        s.setAttribute("shape-rendering", "crispEdges");
        s.setAttribute("role", "img");
        s.setAttribute("aria-label", "Código QR para entrar a la clase desde el celular");
        const fondo = document.createElementNS(NS, "rect");
        fondo.setAttribute("width", String(lado));
        fondo.setAttribute("height", String(lado));
        fondo.setAttribute("fill", "#ffffff");
        let d = "";
        m.forEach((fila, y) => fila.forEach((negro, x) => { if (negro) d += "M" + (x + borde) + " " + (y + borde) + "h1v1h-1z"; }));
        const puntos = document.createElementNS(NS, "path");
        puntos.setAttribute("d", d);
        puntos.setAttribute("fill", "#000000");
        s.append(fondo, puntos);
        return s;
    }

    return { enlace, modulos, svg };
})();

let cargaDelQr = null;
function cargarLibreriaQr() {
    if (window.qrcode) return Promise.resolve();
    if (!cargaDelQr) {
        cargaDelQr = new Promise((listo, fallo) => {
            const s = document.createElement("script");
            s.src = "js/vendor/qrcode.js";
            s.addEventListener("load", listo);
            s.addEventListener("error", () => { cargaDelQr = null; fallo(new Error("No cargó la librería del código QR")); });
            document.head.appendChild(s);
        });
    }
    return cargaDelQr;
}

async function mostrarQrDeEntrada(ver) {
    const caja = document.getElementById("entrar-qr-caja");
    const btn = document.getElementById("proyector-qr-btn");
    if (ver) {
        try { await cargarLibreriaQr(); } catch (e) {
            console.error(e);
            setStatus("No se pudo armar el código QR: revisa la conexión y vuelve a intentarlo.");
            return;
        }
        document.getElementById("entrar-qr-dibujo").replaceChildren(EntrarConQr.svg(EntrarConQr.enlace(location.origin, boardOwnerId)));
        // Escrita, sin el id: quien la teclea entra igual a la clase que está abierta.
        document.getElementById("entrar-qr-direccion").textContent = location.host + "/sesion.html";
        pintarQuienesEntraron();
    }
    caja.hidden = !ver;
    btn.setAttribute("aria-expanded", String(ver));
    btn.textContent = ver ? "Ocultar el código" : "📱 Código para entrar";
}

// Cuántos ya están adentro: el profe ve que el código funciona sin ir a la otra ventana.
function pintarQuienesEntraron() {
    const linea = document.getElementById("entrar-qr-cuenta");
    if (!linea) return;
    const n = onlineStudents.size;
    linea.textContent = n === 0 ? "Todavía no entró nadie." : n === 1 ? "Ya entró 1 alumno." : "Ya entraron " + n + " alumnos.";
}

if (document.getElementById("proyector-qr-btn")) {
    document.getElementById("proyector-qr-btn").addEventListener("click", () => {
        mostrarQrDeEntrada(document.getElementById("entrar-qr-caja").hidden);
    });
}
