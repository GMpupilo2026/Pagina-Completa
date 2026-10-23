/* Achicar un logo antes de guardarlo: al lado mayor que se pida (512 px si no
 * se dice) y en WebP, o PNG si el navegador no sabe, conservando la
 * transparencia. Lo usan dos pantallas: el logo de una academia
 * (academias.html) y el de quien organiza un torneo en Pareo Integral
 * (pareo.html, que lo guarda en base64). Escrito una sola vez para que los
 * dos achiquen igual.
 *
 *   ImagenAchicar.logo(archivo, lado?)    → Promise<Blob>
 *   ImagenAchicar.comoDatos(blob)         → Promise<"data:image/…;base64,…">
 */
(function () {
    "use strict";

    function logo(archivo, lado) {
        const maximo = lado || 512;
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(archivo);
            img.onload = () => {
                const mayor = Math.max(img.naturalWidth, img.naturalHeight) || 1;
                const k = Math.min(1, maximo / mayor);
                const cv = document.createElement("canvas");
                cv.width = Math.max(1, Math.round(img.naturalWidth * k));
                cv.height = Math.max(1, Math.round(img.naturalHeight * k));
                cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
                URL.revokeObjectURL(url);
                cv.toBlob((b) => {
                    if (b && b.type === "image/webp") return resolve(b);
                    cv.toBlob((p) => p ? resolve(p) : reject(new Error("No se pudo leer la imagen.")), "image/png");
                }, "image/webp", 0.9);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Esa imagen no se pudo abrir.")); };
            img.src = url;
        });
    }

    function comoDatos(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error("No se pudo leer la imagen."));
            r.readAsDataURL(blob);
        });
    }

    window.ImagenAchicar = { logo, comoDatos };
})();
