/* Ajedrez Integral — las reglas del XLVII Torneo Internacional Metropolitano
 * 2026 (FCA), tal como las dicen sus bases
 * (fcacostarica.com/wp-content/uploads/2026/08/Bases-Metropolitano-2026-2.pdf).
 *
 * Una sola copia de las reglas en el navegador: la usan la inscripción
 * (inscripcion-metropolitano.html), la lista de inscritos
 * (metropolitano-inscritos.html) y el verificador. Lo que se decide acá es
 * CORTESÍA —decirle a la persona en qué puede jugar y cuánto paga antes de
 * mandar—. Quien decide de verdad es la base: public.metropolitano_inscribir()
 * vuelve a calcular la categoría y el monto con las mismas cifras, y
 * herramientas/verificar-metropolitano.js comprueba que las dos copias digan
 * lo mismo. Ver «La inscripción del Metropolitano 2026» en
 * docs/decisiones/cuentas-y-formularios.md.
 *
 * Todas las fechas son días de calendario en hora de Costa Rica
 * («AAAA-MM-DD»): se comparan como texto, nunca con new Date().
 */
(function (raiz) {
  "use strict";

  /* Los colores son los de las hojas de las bases del Metropolitano, cada
     uno con 4,5:1 o más contra el blanco (la franja del gafete lleva letra
     blanca). */
  const TORNEOS = {
    A: { nombre: "Metropolitano A", corto: "A", clasico: true, ritmo: "90 min + 30 s", usd: 75, paypal: 79.88, color: "#043576",
      quien: "1900 o más de Elo FIDE estándar" },
    B: { nombre: "Metropolitano B", corto: "B", clasico: true, ritmo: "60 min + 30 s", usd: 45, paypal: 47.93, color: "#377746",
      quien: "menos de 1900 de Elo FIDE estándar, o sin Elo" },
    U14: { nombre: "Metropolitano U14", corto: "U14", clasico: true, ritmo: "30 min + 30 s", usd: 35, paypal: 37.28, color: "#d01c58",
      quien: "nacidos desde el 1 de enero de 2012" },
    BLITZ: { nombre: "Metropolitano Blitz", corto: "Blitz", clasico: false, ritmo: "3 min + 2 s", usd: 12, paypal: 12.78, color: "#085ba4",
      quien: "abierto a todos (30 de diciembre, 16:00)" },
  };

  /* Quién se inscribe. Solo el jugador juega y paga; los demás se inscriben
     para su gafete, su acceso a la sala y la logística (hospedaje, comidas).
     El delegado solo existe en la inscripción de grupo: es quien la llena. */
  const ROLES = {
    jugador: { nombre: "Jugador", femenino: "Jugadora", color: null },
    entrenador: { nombre: "Entrenador", femenino: "Entrenadora", color: "#0e7c86" },
    acompanante: { nombre: "Acompañante", femenino: "Acompañante", color: "#5f6604" },
    delegado: { nombre: "Delegado", femenino: "Delegada", color: "#1d134d" },
    // El árbitro se inscribe como el entrenador (no juega ni paga) para su
    // gafete y para pedir hospedaje y alimentación. Blanco sobre este
    // marrón: 9,4 a 1.
    arbitro: { nombre: "Árbitro", femenino: "Árbitra", color: "#7a2e0e" },
  };
  const rolDe = (rol, sexo) => (ROLES[rol] ? (sexo === "f" ? ROLES[rol].femenino : ROLES[rol].nombre) : "");
  const MAX_GRUPO = 80;

  const ELO_A = 1900;
  const NACIDOS_U14_DESDE = 2012;
  const INICIO = "2026-12-26";            // primer día de juego: ahí se cuenta la edad
  const CIERRE_REGULAR = "2026-12-16";    // hasta este día, sin recargo
  const CIERRE_CLASICOS = "2026-12-20";   // del 17 al 20, con el 30 % de recargo
  const CIERRE_BLITZ = "2026-12-26";
  const RECARGO = 0.30;
  const EDAD_SENIOR = 65;                 // «mayores de 65 años»: 10 % en los clásicos, contados por año
  const ANIO_TORNEO = 2026;
  const DESCUENTO_SENIOR = 0.10;
  const TITULOS_GRATIS = ["GM", "IM", "WGM"];
  const TIPO_CAMBIO = 460;                // colones por dólar, según las bases
  const IVA = 0.13;                       // con factura electrónica: lo paga quien se inscribe

  /* La factura electrónica de Costa Rica (Hacienda): los datos del receptor.
     El número va sin guiones; cada tipo tiene su largo. */
  const FACTURA_TIPOS = {
    fisica: { nombre: "Cédula física", patron: /^\d{9}$/, ayuda: "9 dígitos, sin guiones: 105430678" },
    juridica: { nombre: "Cédula jurídica", patron: /^\d{10}$/, ayuda: "10 dígitos, sin guiones: 3002291916" },
    dimex: { nombre: "DIMEX", patron: /^\d{11,12}$/, ayuda: "11 o 12 dígitos" },
    nite: { nombre: "NITE", patron: /^\d{10}$/, ayuda: "10 dígitos" },
    extranjero: { nombre: "Extranjero no domiciliado", patron: /^[A-Za-z0-9]{4,20}$/, ayuda: "pasaporte o identificación de su país, sin espacios" },
  };

  const METODOS = {
    colones: { nombre: "Transferencia en colones (BCR)", moneda: "CRC",
      datos: ["Cuenta: 903694719", "IBAN: CR45010200009036947191", "A nombre de: Federación Costarricense de Ajedrez (FCA)", "Cédula jurídica: 3002291916"] },
    dolares: { nombre: "Transferencia en dólares (BCR)", moneda: "USD",
      datos: ["Cuenta: 925556045", "IBAN: CR83010200009255560451", "A nombre de: Federación Costarricense de Ajedrez (FCA)", "Cédula jurídica: 3002291916"] },
    paypal: { nombre: "PayPal", moneda: "USD",
      datos: ["Correo: tesoreria@fcacostarica.com", "A nombre de: Federación Costarricense de Ajedrez"] },
    sinpe: { nombre: "SINPE Móvil", moneda: "CRC",
      datos: ["Número: 7179-4947", "Solo desde una cuenta de Costa Rica"] },
  };

  const HORARIOS = {
    A: [["Ronda 1", "26/12", "9:00"], ["Ronda 2", "26/12", "16:00"], ["Ronda 3", "27/12", "9:00"], ["Ronda 4", "27/12", "16:00"],
      ["Ronda 5", "28/12", "9:00"], ["Ronda 6", "28/12", "16:00"], ["Ronda 7", "29/12", "9:00"], ["Ronda 8", "29/12", "16:00"],
      ["Ronda 9", "30/12", "9:00"]],
    B: [["Ronda 1", "26/12", "10:00"], ["Ronda 2", "26/12", "15:00"], ["Ronda 3", "27/12", "10:00"], ["Ronda 4", "27/12", "15:00"],
      ["Ronda 5", "28/12", "10:00"], ["Ronda 6", "28/12", "15:00"], ["Ronda 7", "29/12", "10:00"], ["Ronda 8", "29/12", "15:00"],
      ["Ronda 9", "30/12", "10:00"]],
    U14: [["Ronda 1", "27/12", "9:00"], ["Ronda 2", "27/12", "13:00"], ["Ronda 3", "27/12", "16:00"], ["Ronda 4", "28/12", "9:00"],
      ["Ronda 5", "28/12", "13:00"], ["Ronda 6", "29/12", "9:00"], ["Ronda 7", "29/12", "13:00"], ["Ronda 8", "29/12", "16:00"],
      ["Ronda 9", "30/12", "9:00"]],
    BLITZ: [["Blitz", "30/12", "16:00"]],
  };

  /* Los premios, como los dicen las bases (en dólares). No se acumulan: a
     quien gana dos se le da el más alto. Para dar el de una categoría tiene
     que haber al menos 4 inscritos en ella, que hayan jugado al menos 6
     partidas. Los de atleta sordo y ciego piden la validación previa de su
     asociación. */
  const PREMIOS = {
    A: [["1.er lugar", 700], ["2.º lugar", 600], ["3.er lugar", 400], ["Mejor femenina", 250], ["Mejor senior +50", 250]],
    B: [["1.er lugar", 400], ["2.º lugar", 250], ["3.er lugar", 150], ["Mejor femenina", 200], ["Mejor senior +50", 200],
      ["Mejor atleta sordo", 75], ["Mejor atleta ciego o de baja visión", 75]],
    U14: [["1.er lugar", 200], ["2.º lugar", 150], ["3.er lugar", 100], ["Mejor U10", 60], ["Mejor femenina U10", 50], ["2.º mejor U10", 50]],
    BLITZ: [["1.er lugar", 200], ["2.º lugar", 100], ["3.er lugar", 75], ["Mejor U2200", 75], ["Mejor U2000", 75], ["Mejor U1600", 75],
      ["Mejor U14", 75], ["Mejor U10", 75], ["Mejor femenina", 75], ["Mejor senior +50", 75]],
  };

  /* Las rondas con su día y su hora de verdad (hora de Costa Rica, UTC−6 todo
     el año): para la cuenta regresiva y «Agregar a mi calendario». Cuánto
     dura cada una es lo que se le aparta en el calendario, no una regla. */
  const DURACION_HORAS = { A: 5, B: 4, U14: 2, BLITZ: 3 };
  function rondas(torneo) {
    return (HORARIOS[torneo] || []).map(([nombre, dm, hora], i) => {
      const [d, m] = dm.split("/");
      const [h, mi] = hora.split(":");
      const inicio = "2026-" + m + "-" + d + "T" + h.padStart(2, "0") + ":" + mi + ":00-06:00";
      const fin = new Date(new Date(inicio).getTime() + DURACION_HORAS[torneo] * 3600000).toISOString();
      return { torneo, numero: i + 1, nombre, inicio, fin };
    });
  }

  const anio = (diaISO) => (diaISO && /^\d{4}-\d{2}-\d{2}$/.test(diaISO) ? Number(diaISO.slice(0, 4)) : null);

  // Años cumplidos el día `al` (los dos, «AAAA-MM-DD»).
  function edad(nacimiento, al) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento || "")) return null;
    const ref = al || INICIO;
    let e = anio(ref) - anio(nacimiento);
    if (ref.slice(5) < nacimiento.slice(5)) e -= 1;
    return e;
  }

  /* En qué torneo clásico puede jugar. `estandar` es el Elo FIDE estándar
     (null sin Elo); `nacimiento` la fecha o, si solo se sabe el año (la
     búsqueda de FIDE trae el año), un número. Devuelve las claves y, por
     cada una que no, el porqué. */
  function elegibles(estandar, nacimiento) {
    const a = typeof nacimiento === "number" ? nacimiento : anio(nacimiento);
    const elo = Number.isFinite(estandar) && estandar > 0 ? estandar : null;
    const si = [], no = {};
    if (elo !== null && elo >= ELO_A) si.push("A");
    else no.A = elo === null ? "Pide Elo FIDE estándar de " + ELO_A + " o más, y no tienes Elo FIDE." : "Pide " + ELO_A + " o más de Elo FIDE estándar; tienes " + elo + ".";
    if (elo === null || elo < ELO_A) si.push("B");
    else no.B = "Es para menos de " + ELO_A + " de Elo FIDE estándar; tienes " + elo + ".";
    if (a !== null && a >= NACIDOS_U14_DESDE) si.push("U14");
    else no.U14 = a === null ? "Falta la fecha de nacimiento." : "Es para nacidos desde el 1 de enero de " + NACIDOS_U14_DESDE + ".";
    si.push("BLITZ");
    return { si, no };
  }

  // Si todavía se recibe cada tipo de torneo el día `hoy` (hora de Costa Rica).
  function abierto(hoy) {
    return { clasicos: hoy <= CIERRE_CLASICOS, blitz: hoy <= CIERRE_BLITZ, recargo: hoy > CIERRE_REGULAR && hoy <= CIERRE_CLASICOS };
  }

  const redondear = (x) => Math.round(x * 100) / 100;

  /* Lo que paga: { lineas: [{ torneo, texto, usd }], usd, crc, gratis,
     moneda, avisos }. `torneos` es la lista elegida (["A", "BLITZ"]),
     `metodo` una clave de METODOS. */
  function precio(o) {
    const torneos = o.rol && o.rol !== "jugador" ? [] : (o.torneos || []), metodo = o.metodo || "dolares";
    const hoy = o.hoy, est = abierto(hoy);
    const titulado = TITULOS_GRATIS.includes(String(o.titulo || "").toUpperCase());
    // Senior se cuenta por AÑO, desde el 1 de enero (lo decidió la FCA):
    // quien cumple 65 en 2026, o sea, nacidos en 1961 o antes.
    const senior = anio(o.nacimiento) !== null && ANIO_TORNEO - anio(o.nacimiento) >= EDAD_SENIOR;
    const lineas = [], avisos = [];
    let total = 0;
    for (const t of torneos) {
      const T = TORNEOS[t];
      if (!T) continue;
      let monto = metodo === "paypal" ? T.paypal : T.usd;
      const notas = [];
      if (T.clasico && est.recargo) { monto = monto * (1 + RECARGO); notas.push("+30 % por inscripción tardía"); }
      if (T.clasico && senior) { monto = monto * (1 - DESCUENTO_SENIOR); notas.push("−10 % senior"); }
      if (titulado) { monto = 0; notas.push("gratis por título " + String(o.titulo).toUpperCase()); }
      monto = redondear(monto);
      total += monto;
      lineas.push({ torneo: t, texto: T.nombre + (notas.length ? " (" + notas.join(", ") + ")" : ""), usd: monto });
    }
    total = redondear(total);
    // El código de descuento que genera administración (una sola vez): baja
    // lo de esta persona en su porcentaje, antes del IVA. Las mismas cuentas
    // que metropolitano_inscribir() en la base.
    const descuento = Number(o.descuento) || 0;
    if (descuento > 0 && total > 0) {
      const menos = redondear(total * descuento / 100);
      lineas.push({ torneo: "CODIGO", texto: "Código de descuento (−" + descuento + " %)", usd: -menos });
      total = redondear(total - menos);
    }
    // El parqueo (lo ofrece administración con su precio): se suma después
    // del código de descuento, que es de la inscripción, y antes del IVA. Las
    // mismas cuentas que metropolitano_inscribir() en la base.
    const parqueo = redondear(Number(o.parqueo) || 0);
    if (parqueo > 0) {
      lineas.push({ torneo: "PARQUEO", texto: "Parqueo" + (o.placa ? " (placa " + o.placa + ")" : ""), usd: parqueo });
      total = redondear(total + parqueo);
    }
    // Con factura electrónica, el IVA lo asume quien se inscribe (lo decidió
    // la FCA): el 13 % sobre lo de esta persona, redondeado a céntimos.
    const subtotal = total;
    const iva = o.factura && subtotal > 0 ? redondear(subtotal * IVA) : 0;
    total = redondear(subtotal + iva);
    const M = METODOS[metodo] || METODOS.dolares;
    if (metodo === "paypal") avisos.push("El monto de PayPal ya trae su comisión, como dicen las bases.");
    else avisos.push("La comisión de la transferencia la cubre quien se inscribe.");
    return { lineas, subtotal, iva, usd: total, crc: Math.round(total * TIPO_CAMBIO), moneda: M.moneda, gratis: titulado, senior, recargo: est.recargo, avisos };
  }

  const dinero = (usd) => "$" + usd.toFixed(2);
  const colones = (crc) => "₡" + crc.toLocaleString("es-CR");

  const api = {
    TORNEOS, METODOS, HORARIOS, PREMIOS, rondas, ROLES, rolDe, MAX_GRUPO, ELO_A, NACIDOS_U14_DESDE, INICIO, CIERRE_REGULAR, CIERRE_CLASICOS, CIERRE_BLITZ,
    RECARGO, EDAD_SENIOR, ANIO_TORNEO, DESCUENTO_SENIOR, TITULOS_GRATIS, TIPO_CAMBIO, IVA, FACTURA_TIPOS,
    edad, elegibles, abierto, precio, dinero, colones,
  };
  raiz.MetropolitanoReglas = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
