/* Juegos Estudiantiles MEP: las cuatro fases de los JDE y la normativa de
   cada año, en UNA sola lista. La usan jde-arbitro.html (modo árbitro) y
   juegos-estudiantiles.html (la página pública), así un año nuevo —2027…— se
   agrega en un solo lugar y las dos páginas lo ven igual. Ver «Juegos
   Estudiantiles MEP, modo árbitro» en docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";

  // Las mismas cuatro etapas que ya usa «Ajedrez estudiantil en Costa Rica»
  // (js/ajedrez-estudiantil.js): institucional, regional e interregional se
  // juegan por región; la final es nacional y no tiene región.
  const FASES = [
    { id: "institucional", nombre: "Institucional (o circuital)" },
    { id: "regional", nombre: "Regional" },
    { id: "interregional", nombre: "Interregional" },
    { id: "nacional", nombre: "Nacional (final)" },
  ];

  const RAMAS = [
    { id: "", nombre: "Sin dividir" },
    { id: "masculina", nombre: "Masculina" },
    { id: "femenina", nombre: "Femenina" },
    { id: "mixta", nombre: "Mixta" },
  ];

  // Un año nuevo se agrega acá, con su normativa cuando el MEP la publique;
  // el resto de las dos páginas no cambia. `normativa` queda en null mientras
  // no se tenga el enlace o el archivo de ese año.
  const ANIOS = [
    {
      anio: 2026,
      normativa: {
        nombre: "Normativa de los Juegos Deportivos Estudiantiles 2026 (MEP)",
        // Copia servida por el propio sitio (documentos/jde/), igual que las
        // fichas de los JDN en documentos/jdn/: así no depende de que el
        // dominio del MEP esté disponible.
        url: "documentos/jde/normativa-pjde-2026.pdf",
      },
    },
  ];

  function anios() {
    return ANIOS.map((a) => a.anio).sort((a, b) => b - a);
  }
  function anioMasReciente() {
    return Math.max(...ANIOS.map((a) => a.anio));
  }
  function normativaDe(anio) {
    const a = ANIOS.find((x) => x.anio === Number(anio));
    return (a && a.normativa) || null;
  }
  function faseNombre(id) {
    const f = FASES.find((x) => x.id === id);
    return f ? f.nombre : id;
  }
  function ramaNombre(id) {
    const r = RAMAS.find((x) => x.id === (id || ""));
    return r ? r.nombre : id;
  }

  window.JdeFases = { FASES, RAMAS, ANIOS, anios, anioMasReciente, normativaDe, faseNombre, ramaNombre };
})();
