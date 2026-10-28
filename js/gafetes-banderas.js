/* Ajedrez Integral — qué bandera lleva cada gafete (gafetes.html).
 *
 * En una lista de inscritos el país viene casi siempre con el código de su
 * federación en FIDE («CRC», «TTO», «ARU»), que NO es el código ISO de su
 * bandera: Costa Rica es CRC en FIDE y «cr» en ISO, Aruba ARU y «aw». Acá
 * está esa tabla, a mano, una vez. Cuando la celda trae el nombre del país
 * («Costa Rica», «Trinidad and Tobago») se reconoce también, en español y en
 * inglés, por los nombres que el mismo navegador sabe decir
 * (Intl.DisplayNames): no hay una segunda lista de nombres que mantener.
 *
 * Los dibujos son los de flag-icons (MIT), copiados a img/banderas/ por
 * herramientas/gafetes-banderas.js —solo los de esta tabla—; no se editan a
 * mano. Inglaterra, Escocia y Gales juegan por separado en FIDE y tienen la
 * suya (gb-eng, gb-sct, gb-wls).
 *
 * Se carga en la página y también desde node (el script que copia los
 * dibujos y el verificador), por eso termina en module.exports si existe.
 */
(function (raiz) {
  "use strict";

  const FIDE = {
    AFG: "af", ALB: "al", ALG: "dz", AND: "ad", ANG: "ao", ANT: "ag", ARG: "ar", ARM: "am", ARU: "aw", AUS: "au",
    AUT: "at", AZE: "az", BAH: "bs", BAN: "bd", BAR: "bb", BDI: "bi", BEL: "be", BER: "bm", BHU: "bt", BIH: "ba",
    BIZ: "bz", BLR: "by", BOL: "bo", BOT: "bw", BRA: "br", BRN: "bh", BRU: "bn", BUL: "bg", BUR: "bf", CAF: "cf",
    CAM: "kh", CAN: "ca", CAY: "ky", CHA: "td", CHI: "cl", CHN: "cn", CIV: "ci", CMR: "cm", COD: "cd", COL: "co",
    COM: "km", CPV: "cv", CRC: "cr", CRO: "hr", CUB: "cu", CUR: "cw", CYP: "cy", CZE: "cz", DEN: "dk", DJI: "dj",
    DMA: "dm", DOM: "do", ECU: "ec", EGY: "eg", ENG: "gb-eng", ERI: "er", ESA: "sv", ESP: "es", EST: "ee", ETH: "et",
    FAI: "fo", FIJ: "fj", FIN: "fi", FRA: "fr", GAB: "ga", GAM: "gm", GCI: "gg", GEO: "ge", GEQ: "gq", GER: "de",
    GHA: "gh", GRE: "gr", GRN: "gd", GUA: "gt", GUM: "gu", GUY: "gy", HAI: "ht", HKG: "hk", HON: "hn", HUN: "hu",
    INA: "id", IND: "in", IOM: "im", IRI: "ir", IRL: "ie", IRQ: "iq", ISL: "is", ISR: "il", ISV: "vi", ITA: "it",
    IVB: "vg", JAM: "jm", JCI: "je", JOR: "jo", JPN: "jp", KAZ: "kz", KEN: "ke", KGZ: "kg", KOR: "kr", KOS: "xk",
    KSA: "sa", KUW: "kw", LAO: "la", LAT: "lv", LBA: "ly", LBN: "lb", LBR: "lr", LCA: "lc", LES: "ls", LIE: "li",
    LTU: "lt", LUX: "lu", MAC: "mo", MAD: "mg", MAR: "ma", MAS: "my", MAW: "mw", MDA: "md", MDV: "mv", MEX: "mx",
    MGL: "mn", MKD: "mk", MLI: "ml", MLT: "mt", MNC: "mc", MNE: "me", MOZ: "mz", MRI: "mu", MTN: "mr", MYA: "mm",
    NAM: "na", NCA: "ni", NED: "nl", NEP: "np", NGR: "ng", NIG: "ne", NOR: "no", NRU: "nr", NZL: "nz", OMA: "om",
    PAK: "pk", PAN: "pa", PAR: "py", PER: "pe", PHI: "ph", PLE: "ps", PLW: "pw", PNG: "pg", POL: "pl", POR: "pt",
    PUR: "pr", QAT: "qa", ROU: "ro", RSA: "za", RUS: "ru", RWA: "rw", SCO: "gb-sct", SEN: "sn", SEY: "sc", SGP: "sg",
    SKN: "kn", SLE: "sl", SLO: "si", SMR: "sm", SOL: "sb", SOM: "so", SRB: "rs", SRI: "lk", SSD: "ss", STP: "st",
    SUD: "sd", SUI: "ch", SUR: "sr", SVK: "sk", SWE: "se", SWZ: "sz", SYR: "sy", TAN: "tz", THA: "th", TJK: "tj",
    TKM: "tm", TLS: "tl", TOG: "tg", TPE: "tw", TTO: "tt", TUN: "tn", TUR: "tr", UAE: "ae", UGA: "ug", UKR: "ua",
    URU: "uy", USA: "us", UZB: "uz", VAN: "vu", VEN: "ve", VIE: "vn", VIN: "vc", WLS: "gb-wls", YEM: "ye", ZAM: "zm",
    ZIM: "zw",
  };
  const ISOS = new Set(Object.values(FIDE));

  // «Trinidad y Tobago» y «trinidad and tobago» → «trinidad tobago».
  const plano = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(y|and|the|de|del|la|las|los|of|islas?|islands?)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

  let porNombre = null;
  function nombres() {
    if (porNombre) return porNombre;
    porNombre = new Map();
    if (typeof Intl === "undefined" || !Intl.DisplayNames) return porNombre;
    for (const idioma of ["es", "en"]) {
      let dn;
      try { dn = new Intl.DisplayNames([idioma], { type: "region" }); } catch (e) { continue; }
      for (const iso of ISOS) {
        if (iso.includes("-")) continue;
        const n = dn.of(iso.toUpperCase());
        if (n && n.toUpperCase() !== iso.toUpperCase()) porNombre.set(plano(n), iso);
      }
    }
    porNombre.set(plano("Inglaterra"), "gb-eng").set(plano("England"), "gb-eng");
    porNombre.set(plano("Escocia"), "gb-sct").set(plano("Scotland"), "gb-sct");
    porNombre.set(plano("Gales"), "gb-wls").set(plano("Wales"), "gb-wls");
    return porNombre;
  }

  /* El dibujo que corresponde a lo que dice la celda, o null si no hay uno:
     el código de FIDE, un código ISO de dos letras o el nombre del país. */
  function iso(texto) {
    const t = String(texto || "").trim();
    if (!t) return null;
    const mayus = t.toUpperCase();
    if (FIDE[mayus]) return FIDE[mayus];
    if (/^[a-z]{2}$/i.test(t) && ISOS.has(t.toLowerCase())) return t.toLowerCase();
    return nombres().get(plano(t)) || null;
  }

  const api = { FIDE, iso, ruta: (codigoIso) => "img/banderas/" + codigoIso + ".svg" };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.GafetesBanderas = api;
})(typeof window !== "undefined" ? window : this);
