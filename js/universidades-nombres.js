/* Ajedrez Integral — el nombre de una universidad como lo escribe
   chess-results → un solo nombre. Lo usan universidades.html (por
   js/jdn-comites.js) y torneos-universitarios.html: una sola lista de
   variantes para las dos. Ver «Resultados universitarios por universidad» en
   docs/decisiones/juegos-y-torneos.md.

     UniversidadesNombres.universidad(nombre, esEquipo) → "UCR", "TEC",
       "UNAH (Honduras)"…; "" si no dice universidad (un país solo, vacío).
     UniversidadesNombres.conocida(nombre) → si es una de la lista.
*/
(function (raiz) {
    "use strict";
    const sinTilde = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()).replace(/\bDe\b/g, "de");

    /* La universidad como la escribe chess-results → un solo nombre: la sigla
       con que se la conoce, y el país si no es de Costa Rica. Las sedes y los
       recintos («UCR Grecia», «TEC Alajuela», «UNA Omar Dengo») cuentan para
       su universidad. «UNA» sola es la de Costa Rica (en los JUDUCA, la de
       Nicaragua y la de Honduras vienen con su país o su nombre). Un país
       solo («NIC») no dice la universidad: queda vacío y se deduce. */
    const UNIVERSIDADES = [
        [/^(una\s*(-\s*)?(nca|nicaragua)|universidad nacional agraria)\b/, "UNA (Nicaragua)"],
        [/^(una catacamas|unag|universidad (nacional )?de agricultura)\b/, "UNAG (Honduras)"],
        [/^(ucr|sur ucr|universidad de costa rica)\b/, "UCR"],
        [/^(tec|itcr|itc|it|tecnologico de costa rica|instituto tecnologico)\b/, "TEC"],
        [/^(uned|une|universidad estatal a distancia)\b/, "UNED"],
        [/^(utn|universidad tecnica nacional)\b/, "UTN"],
        [/^cuc\b/, "CUC"],
        [/^(ula|u ?latina|ulatina|universidad latina)\b/, "ULatina"],
        [/^earth\b/, "EARTH"],
        [/^(unibe|u\.? iberoamericana|universidad iberoamericana)\b/, "UNIBE"],
        [/^uaca\b/, "UACA"],
        [/^uisil\b/, "UISIL"],
        [/^cenfotec\b/, "CENFOTEC"],
        [/^lead\b/, "LEAD University"],
        [/^ucimed\b/, "UCIMED"],
        [/^(universidad )?castro carazo\b/, "U. Castro Carazo"],
        [/^universidad santa lucia\b/, "U. Santa Lucía"],
        [/^(unah|universidad (nacional )?autonoma de hondura)/, "UNAH (Honduras)"],
        [/^(upn[-_ ]?fm|universidad pedagogica)/, "UPNFM (Honduras)"],
        [/^unan\W*(managua|mga)\b/, "UNAN-Managua (Nicaragua)"],
        [/^unan\W*leon\b/, "UNAN-León (Nicaragua)"],
        [/^(uni|universidad nacional de ingenieria)\b/, "UNI (Nicaragua)"],
        [/^(usac|universidad de san carlos)\b/, "USAC (Guatemala)"],
        [/^(ues|u\.? ?(de )?el salvador|universidad (de )?el salvador|universidad del salvador)\b/, "UES (El Salvador)"],
        [/^(utp|universidad tecnologica de panama)\b/, "UTP (Panamá)"],
        [/^(up|universidad de panama)\b/, "UP (Panamá)"],
        [/^udelas\b/, "UDELAS (Panamá)"],
        [/^umip\b/, "UMIP (Panamá)"],
        [/chiriqui/, "UNACHI (Panamá)"],
        // Al final: «Universidad Nacional» también empieza otros nombres.
        [/^(una|universidad nacional( de costa rica)?)\b/, "UNA"],
    ];
    const PAISES = /^(crc|cri|nic|nca|pan|gua|hon|esa|slv|biz)$/;
    function universidad(nombre, esEquipo) {
        const crudo = String(nombre || "").trim();
        let s = sinTilde(crudo).toLowerCase().replace(/\s+/g, " ").trim();
        if (!s || PAISES.test(s)) return "";
        for (const [re, n] of UNIVERSIDADES.slice(0, 2)) if (re.test(s)) return n;
        // El país del final: «UCR (CRC)», «UCR - CRC», «( HON )», «- Panama».
        s = s.replace(/\s*\(\s*[a-z]{3}\s*\)$/, "").replace(/\s+-\s+(crc|nca|pan|gua|hon|honduras|panama)$/, "").trim();
        if (esEquipo) { let a; do { a = s; s = s.replace(/\s+(femenino|masculino|\d{1,2}|[a-z])$/, ""); } while (s !== a); }
        for (const [re, n] of UNIVERSIDADES) if (re.test(s)) return n;
        return titulo(sinTilde(crudo).replace(/\s+/g, " "));
    }

    // Si un nombre es una de las universidades de la lista (y no un club o un
    // lugar que quedó con su nombre).
    const CONOCIDAS = new Set(UNIVERSIDADES.map((x) => x[1]));
    const conocida = (n) => CONOCIDAS.has(n);

    raiz.UniversidadesNombres = { universidad, conocida };
})(typeof self !== "undefined" ? self : this);
