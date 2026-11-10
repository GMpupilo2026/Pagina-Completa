/* El código de sesion.html.

   El reloj de práctica en la clase en vivo (game_state.reloj). Para la Sesión 4
   de «Formación Ajedrez» (uso, configuración y control del reloj): el profe
   pone el reloj arriba del tablero y cada alumno maneja EL SUYO sin salir de la
   clase: lo configura paso a paso con − + ▶‖ ✓ como un reloj digital de
   verdad, lo pone en marcha con la palanca, ve correr los números, sumarse el
   incremento, cambiar de período y caer la bandera. Ver «El reloj de práctica»
   en docs/decisiones/clase-en-vivo.md.

   - Qué va en la base: SOLO que el reloj está puesto y con qué control arranca
     ({id, control: {modo, base, inc, dly, mv, add}}, segundos). Solo el profe
     lo pone (protect_game_state_teacher_columns) y el CHECK
     game_state_reloj_forma rechaza otra forma. `id` cambia con cada envío:
     «Poner de nuevo» hace que todos arranquen de cero con el control nuevo.
   - Lo que hace cada alumno con su reloj NO va a ningún lado: es de ese rato y
     de su pantalla. Los retos cumplidos se guardan en su aparato por envío.
   - El reloj vive en un Shadow DOM: su CSS (la caja, la pantalla de 7
     segmentos, los botones) no choca con el Tailwind de la clase, y sus teclas
     (A / L, Espacio, Enter, ↑ ↓) solo cuentan con el foco dentro del reloj, para
     no pisar los atajos del tablero.
   - Quién lo ve para ponerlo: quien puede_bajar('formacion-ajedrez'), igual que
     las prácticas y las presentaciones de ese curso.

   Como las demás partes de la clase (ver «sesion.js en partes»), es un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js (sb, isTeacher,
   myGameStateId, anunciarALaClase…) solo dentro de funciones. RelojPractica es
   la parte que no toca la clase, para poder probarla sola. */

window.RelojPractica = (function () {
    const pad = (n) => String(n).padStart(2, "0");
    const MODOS = [
        { id: "sin", nombre: "Sin incremento", lcd: "Sin incremento", campos: ["bH", "bM", "bS"] },
        { id: "fischer", nombre: "Incremento (Fischer)", lcd: "Incremento Fischer", campos: ["bH", "bM", "bS", "inc"] },
        { id: "demora", nombre: "Demora (delay)", lcd: "Demora", campos: ["bH", "bM", "bS", "dly"] },
        { id: "periodos", nombre: "Por períodos", lcd: "Por periodos", campos: ["bH", "bM", "mv", "aH", "aM", "inc"] },
    ];
    const ESCENARIOS = [
        { nombre: "90 + 30", sub: "Clásica · Fischer", control: { modo: "fischer", base: 5400, inc: 30, dly: 0, mv: 40, add: 0 } },
        { nombre: "40/90 + 30", sub: "Clásica · períodos, +30 s", control: { modo: "periodos", base: 5400, inc: 30, dly: 0, mv: 40, add: 1800 } },
        { nombre: "15 + 10", sub: "Rápida · Fischer", control: { modo: "fischer", base: 900, inc: 10, dly: 0, mv: 40, add: 0 } },
        { nombre: "10 + 5", sub: "Rápida · Fischer", control: { modo: "fischer", base: 600, inc: 5, dly: 0, mv: 40, add: 0 } },
        { nombre: "3 + 2", sub: "Relámpago · Fischer", control: { modo: "fischer", base: 180, inc: 2, dly: 0, mv: 40, add: 0 } },
        { nombre: "5 + 0", sub: "Relámpago · sin incremento", control: { modo: "sin", base: 300, inc: 0, dly: 0, mv: 40, add: 0 } },
        { nombre: "25 · d5", sub: "Rápida · demora 5 s", control: { modo: "demora", base: 1500, inc: 0, dly: 5, mv: 40, add: 0 } },
    ];
    const RETOS = [
        { texto: "Clásica: 90 minutos con incremento de 30 segundos por jugada.", ok: (c) => c.modo === "fischer" && c.base === 5400 && c.inc === 30 },
        { texto: "Rápida: 15 minutos con incremento de 10 segundos.", ok: (c) => c.modo === "fischer" && c.base === 900 && c.inc === 10 },
        { texto: "Relámpago: 3 minutos con incremento de 2 segundos.", ok: (c) => c.modo === "fischer" && c.base === 180 && c.inc === 2 },
        { texto: "Por períodos: 40 jugadas en 90 min, luego 30 min más, con 30 s por jugada.", ok: (c) => c.modo === "periodos" && c.base === 5400 && c.mv === 40 && c.add === 1800 && c.inc === 30 },
    ];
    const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

    // La misma forma que exige el CHECK de la base: lo demás se trata como «ninguno».
    function validoControl(c) {
        return !!(c && typeof c === "object" && !Array.isArray(c)
            && MODOS.some((m) => m.id === c.modo)
            && entero(c.base, 1, 36000) && entero(c.inc, 0, 60) && entero(c.dly, 0, 60)
            && entero(c.mv, 1, 99) && entero(c.add, 0, 36000));
    }
    function valido(r) {
        return !!(r && typeof r === "object" && !Array.isArray(r)
            && typeof r.id === "string" && /^[a-z0-9-]{4,40}$/.test(r.id) && validoControl(r.control));
    }
    function paraMandar(control) {
        return { id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8), control: Object.assign({}, control) };
    }
    // Fórmula de 60 jugadas: tiempo base (+ el 2.º período si llega antes de la jugada 60) + 60 × incremento.
    function clasificar(c) {
        const inc = c.modo === "demora" ? c.dly : (c.modo === "sin" ? 0 : c.inc);
        const extra = c.modo === "periodos" && c.mv <= 60 ? c.add : 0;
        const min = (c.base + extra + 60 * inc) / 60;
        return { minutos: min, ritmo: min >= 60 ? "Clásica" : (min > 10 ? "Rápida" : "Relámpago") };
    }

    /* ---------- La pantalla de 7 segmentos ---------- */
    const Hs = (y) => `8,${y} 13,${y - 5} 37,${y - 5} 42,${y} 37,${y + 5} 13,${y + 5}`;
    const Vs = (x, y1, y2) => `${x},${y1} ${x + 5},${y1 + 5} ${x + 5},${y2 - 5} ${x},${y2} ${x - 5},${y2 - 5} ${x - 5},${y1 + 5}`;
    const SEG = { a: Hs(5), g: Hs(43), d: Hs(81), f: Vs(5, 8, 40), b: Vs(45, 8, 40), e: Vs(5, 46, 78), c: Vs(45, 46, 78) };
    const DIG = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg", "-": "g", " ": "" };
    function digito(ch) {
        const on = DIG[ch] ?? "";
        let s = '<svg class="d" viewBox="0 0 58 86" aria-hidden="true"><g transform="translate(8,0) skewX(-5)">';
        for (const k of "abcdefg") s += `<polygon points="${SEG[k]}" class="${on.includes(k) ? "on" : "off"}"/>`;
        return s + "</g></svg>";
    }
    const dosPuntos = (tenue) => `<svg class="cl${tenue ? " dim" : ""}" viewBox="0 0 18 86" aria-hidden="true"><circle class="on" cx="10" cy="28" r="4.6"/><circle class="on" cx="7" cy="60" r="4.6"/></svg>`;
    const REY = (lleno) => `<svg class="rey" viewBox="0 0 20 22" aria-hidden="true"><path d="M10 1v5M7.5 3.5h5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3 9c0-2 2-3 4-2l3 3 3-3c2-1 4 0 4 2 0 3-3 6-3 8H6c0-2-3-5-3-8z" fill="${lleno ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"/><path d="M5 19h10v2H5z" fill="currentColor"/></svg>`;
    const BANDERA = '<svg class="rey" viewBox="0 0 20 22" aria-hidden="true"><path d="M4 1v20" stroke="currentColor" stroke-width="2"/><path d="M5 2h12l-3 4 3 4H5z" fill="currentColor"/></svg>';
    const ICONO = {
        marcha: '<svg viewBox="0 0 40 30" aria-hidden="true"><polygon points="12,3 32,15 12,27" fill="currentColor"/></svg>',
        pausa: '<svg viewBox="0 0 40 30" aria-hidden="true"><rect x="11" y="3" width="6" height="24" fill="currentColor"/><rect x="23" y="3" width="6" height="24" fill="currentColor"/></svg>',
        listo: '<svg viewBox="0 0 40 30" aria-hidden="true"><polygon points="3,4 17,15 3,26" fill="none" stroke="currentColor" stroke-width="2"/><rect x="22" y="4" width="5" height="22" fill="none" stroke="currentColor" stroke-width="2"/><rect x="31" y="4" width="5" height="22" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        set: '<svg viewBox="0 0 40 30" aria-hidden="true"><text x="20" y="20" text-anchor="middle" font-family="ui-monospace, monospace" font-weight="700" font-size="13" fill="currentColor">SET</text></svg>',
    };

    const CSS = `
:host{display:block;--fondo:#ffffff;--tinta:#1b1f27;--suave:#5b6474;--linea:#d5dae3;--acento:#2c3f9e;--acento-tinta:#fff;--ok:#1f7a4a;--alerta:#a2560d;--panel:#eef1f7;
  --lcd-tinta:#1a1e17;--lcd-fantasma:rgba(26,30,23,.07);font:400 14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--tinta)}
:host([data-oscuro]){--fondo:#1c2029;--tinta:#e8ebf1;--suave:#9aa3b3;--linea:#2e3441;--acento:#93a5ff;--acento-tinta:#10142a;--ok:#5fd394;--alerta:#f0a85a;--panel:#252c3f}
*{box-sizing:border-box}
.raiz{display:flex;flex-direction:column;gap:12px;outline:none}
.raiz:focus-visible{box-shadow:0 0 0 3px var(--acento);border-radius:12px}
.aparato{width:100%;max-width:760px;margin:0 auto;position:relative;padding-top:clamp(28px,6vw,50px)}
.atras{position:absolute;top:clamp(14px,3vw,28px);left:3.5%;right:3.5%;height:clamp(56px,10vw,92px);z-index:0;background:linear-gradient(180deg,#4a1518,#5e2025);border-radius:clamp(20px,4vw,34px) clamp(20px,4vw,34px) 0 0}
.palanca{position:absolute;top:0;left:10%;right:7%;height:clamp(42px,8vw,72px);display:flex;z-index:1;transition:transform .12s ease-out;transform-origin:50% 100%}
.palanca button{flex:1;border:0;cursor:pointer;padding:0;background:linear-gradient(180deg,#eef2f8 0%,#dde4ee 55%,#c3ccda 100%);box-shadow:inset 0 2px 0 rgba(255,255,255,.9),inset 0 -8px 14px rgba(60,70,90,.12)}
.palanca button:first-child{border-radius:clamp(8px,1.6vw,14px) 4px 0 0}
.palanca button:last-child{border-radius:4px clamp(8px,1.6vw,14px) 0 0}
.palanca .eje{position:absolute;left:50%;top:-4px;width:12%;height:calc(100% + 4px);transform:translateX(-50%);pointer-events:none;background:linear-gradient(180deg,#f3f6fa,#d4dbe6);border-radius:clamp(10px,2vw,18px) clamp(10px,2vw,18px) 0 0;box-shadow:-4px 0 8px rgba(40,50,70,.12),4px 0 8px rgba(40,50,70,.12),inset 0 2px 0 #fff}
.palanca.i{transform:rotate(2.6deg)} .palanca.d{transform:rotate(-2.6deg)}
.palanca button:focus-visible{outline:3px solid var(--acento);outline-offset:2px}
.caja{position:relative;z-index:2;margin-top:clamp(10px,2vw,18px);border-radius:clamp(32px,8vw,68px) clamp(32px,8vw,68px) 20px 20px / clamp(24px,5.5vw,48px) clamp(24px,5.5vw,48px) 20px 20px;
  padding:clamp(16px,3.6vw,34px) clamp(14px,4.2vw,40px) clamp(12px,2.4vw,22px);background:radial-gradient(130% 100% at 50% 0%,#682329 0%,#581d22 50%,#47161a 100%);
  box-shadow:0 20px 34px -12px rgba(40,10,12,.5),inset 0 2px 0 rgba(255,255,255,.10),inset 26px 0 34px -20px rgba(0,0,0,.5),inset -26px 0 34px -20px rgba(0,0,0,.5),inset 0 -12px 20px -10px rgba(0,0,0,.4);
  display:flex;flex-direction:column;gap:clamp(12px,2.8vw,26px)}
.lcd{border:clamp(7px,1.6vw,14px) solid #3a1013;border-radius:clamp(8px,1.4vw,12px);color:var(--lcd-tinta);background:linear-gradient(180deg,#d4d8cb,#c4c9ba);
  box-shadow:inset 0 0 0 2px #b4b9a8,inset 0 5px 10px rgba(0,0,0,.18);display:grid;grid-template-columns:1fr auto 1fr}
.lado{display:flex;align-items:center;justify-content:center;gap:clamp(3px,.8vw,8px);padding:clamp(10px,2.6vw,24px) clamp(5px,1.4vw,14px);min-width:0;grid-row:1}
.lado.izq{grid-column:1} .lado.der{grid-column:3}
.digitos{display:flex;align-items:center;flex:1 1 0;min-width:0}
.digitos svg{display:block;width:0;height:auto;min-width:0}
.digitos svg.d{flex:58 1 0} .digitos svg.cl{flex:18 1 0}
.on{fill:var(--lcd-tinta)} .off{fill:var(--lcd-fantasma)}
.digitos .cl.dim .on{fill:var(--lcd-fantasma)}
.meta{display:flex;flex-direction:column;justify-content:space-between;align-self:stretch;padding-block:2px;font:500 clamp(8px,1.7vw,14px)/1.05 system-ui,sans-serif;letter-spacing:.1em}
.meta .rey{width:clamp(12px,2.4vw,22px);height:auto}
.centro{border-left:1.5px solid rgba(26,30,23,.6);border-right:1.5px solid rgba(26,30,23,.6);display:flex;align-items:center;justify-content:center;padding:0 clamp(7px,2vw,18px);grid-row:1;grid-column:2}
.centro svg{width:clamp(26px,5.2vw,48px);height:auto}
.parpadea{animation:parpadeo 1s steps(1) infinite}
@keyframes parpadeo{50%{opacity:.12}}
.teclas{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;background:#2c0c0f;padding:3px;border-radius:7px;box-shadow:inset 0 2px 5px rgba(0,0,0,.55)}
.teclas .par{display:grid;grid-template-columns:1fr 1fr;position:relative}
.teclas .par::after{content:"";position:absolute;left:50%;top:26%;bottom:26%;width:2px;background:#e9edf6;transform:translateX(-50%);pointer-events:none}
.tecla{border:0;cursor:pointer;padding:0;background:linear-gradient(180deg,#384cb2,#2b3d99 55%,#24348b);height:clamp(34px,6.4vw,56px);display:flex;align-items:center;justify-content:center;border-radius:4px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -2px 0 rgba(0,0,0,.22);transition:transform .05s,filter .05s}
.teclas .par .tecla:first-child{border-radius:4px 0 0 4px} .teclas .par .tecla:last-child{border-radius:0 4px 4px 0}
.tecla:active,.tecla.abajo{transform:translateY(2px);filter:brightness(.88)}
.tecla:focus-visible{outline:3px solid #fff;outline-offset:-3px}
.chip{display:inline-flex;border:2px solid #e9edf6;border-radius:4px;overflow:hidden;height:clamp(20px,3.4vw,30px)}
.chip i{font-style:normal;display:flex;align-items:center;justify-content:center;min-width:clamp(20px,3.4vw,30px);padding:0 clamp(2px,.6vw,5px);font:700 clamp(12px,2.3vw,19px)/1 system-ui,sans-serif;color:#1f2d7a}
.chip i:first-child{background:#f4f6fb} .chip i:last-child{background:#c6cddd}
.chip svg{height:66%;width:auto}
.pie{display:flex;justify-content:space-between;align-items:flex-end;padding:0 clamp(4px,1vw,10px)}
.marca{display:flex;flex-direction:column;font:700 clamp(8px,1.5vw,12px)/1.15 system-ui,sans-serif;letter-spacing:.06em;color:#d9d4d6;text-transform:uppercase}
.marca b{font-size:1.35em}
.placa{display:flex;flex-direction:column;align-items:center;gap:2px}
.placa b{background:#c9ccd3;color:#2b2d33;font:700 clamp(11px,2vw,16px)/1 system-ui,sans-serif;padding:3px clamp(6px,1.2vw,10px);border-radius:2px}
.placa small{color:#d6d0d2;font:600 clamp(10px,1.9vw,15px)/1 system-ui,sans-serif}
.lectura{max-width:760px;width:100%;margin:0 auto;font:600 12px/1.3 ui-monospace,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--suave);display:flex;justify-content:space-between;gap:8px;min-height:1.3em}
.lectura span{flex:1;text-align:center} .lectura .mv{flex:0 0 auto}
.aviso{min-height:2.6em;text-align:center;font-weight:600;display:flex;align-items:center;justify-content:center}
.aviso.alerta{color:var(--alerta)} .aviso.ok{color:var(--ok)}
.barra{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:center;align-items:center;font-size:13px}
.seg{display:inline-flex;border:1px solid var(--linea);border-radius:8px;overflow:hidden;background:var(--fondo)}
.seg button{border:0;background:none;color:var(--tinta);padding:6px 10px;cursor:pointer;font:500 13px system-ui,sans-serif;min-height:34px}
.seg button[aria-pressed="true"]{background:var(--acento);color:var(--acento-tinta)}
.seg button:focus-visible,.boton:focus-visible,.escenario:focus-visible{outline:3px solid var(--acento);outline-offset:2px}
.etiqueta{color:var(--suave);margin-right:6px}
.boton{border:1px solid var(--linea);background:var(--fondo);color:var(--tinta);border-radius:8px;padding:6px 12px;cursor:pointer;font:500 13px system-ui,sans-serif;min-height:34px}
.mesa{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:12px;align-items:start}
@media (max-width:640px){.mesa{grid-template-columns:minmax(0,1fr)}}
.tarjeta{background:var(--panel);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;min-width:0}
.tarjeta h3{margin:0;font:700 15px/1.2 system-ui,sans-serif}
.estado{align-self:flex-start;font:700 11px/1 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;padding:5px 8px;border-radius:999px;background:var(--fondo);color:var(--acento)}
.estado.marcha{color:var(--ok)} .estado.alto{color:var(--alerta)}
.ahora{margin:0;font-weight:600;font-size:15px}
.titulo-pasos{margin:0;font:700 11px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--suave)}
ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px;counter-reset:p}
ol li{counter-increment:p;display:grid;grid-template-columns:24px 1fr;gap:8px;padding:5px 6px;border-radius:8px;color:var(--suave)}
ol li::before{content:counter(p);font:700 11px/20px ui-monospace,monospace;width:20px;height:20px;text-align:center;border-radius:50%;border:1px solid var(--linea)}
ol li.hecho{color:var(--tinta)} ol li.hecho::before{content:"✓";color:var(--acento);border-color:transparent;background:var(--fondo)}
ol li.actual{background:var(--fondo);color:var(--tinta);font-weight:600}
ol li.actual::before{background:var(--acento);color:var(--acento-tinta);border-color:transparent}
.teclado{font-size:12px;color:var(--suave)}
.veredicto{font:800 22px/1 system-ui,sans-serif;color:var(--acento)}
.formula{font:500 12px ui-monospace,monospace;color:var(--suave)}
dl{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0;font-size:13px}
dt{color:var(--suave)} dd{margin:0;font-weight:500}
.escenarios{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
.escenario{border:1px solid var(--linea);background:var(--fondo);color:var(--tinta);border-radius:8px;padding:7px 9px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:1px}
.escenario b{font:800 16px/1 system-ui,sans-serif}
.escenario span{font-size:11px;color:var(--suave)}
.escenario.activo{border-color:var(--acento);box-shadow:inset 0 0 0 1px var(--acento)}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
ul li{display:grid;grid-template-columns:20px 1fr;gap:8px;font-size:13px}
.casilla{width:18px;height:18px;border-radius:4px;border:2px solid var(--linea);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff}
ul li.ok .casilla{background:var(--ok);border-color:var(--ok)} ul li.ok{color:var(--suave)}
@media (prefers-reduced-motion:reduce){.palanca{transition:none}.parpadea{animation-duration:2s}}
`;

    const HTML = `
<div class="raiz" tabindex="-1">
  <div class="aparato">
    <div class="atras"></div>
    <div class="palanca" data-r="palanca">
      <button data-r="izq" aria-label="Palanca, lado izquierdo" title="Palanca izquierda (tecla A)"></button>
      <button data-r="der" aria-label="Palanca, lado derecho" title="Palanca derecha (tecla L)"></button>
      <span class="eje"></span>
    </div>
    <div class="caja">
      <div class="lcd" role="img" aria-label="Pantalla del reloj" data-r="lcd">
        <div class="lado izq" data-r="ladoI"></div>
        <div class="centro" data-r="centro"></div>
        <div class="lado der" data-r="ladoD"></div>
      </div>
      <div class="teclas">
        <div class="par">
          <button class="tecla" data-r="menos" aria-label="Menos" title="Menos (↓)"><span class="chip"><i>−</i><i>♪</i></span></button>
          <button class="tecla" data-r="mas" aria-label="Más" title="Más (↑)"><span class="chip"><i>+</i><i>#</i></span></button>
        </div>
        <button class="tecla" data-r="marcha" aria-label="Iniciar o pausar" title="Iniciar o pausar (Espacio)"><span class="chip"><i><svg viewBox="0 0 30 18" aria-hidden="true"><polygon points="2,2 12,9 2,16" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="16" y="2" width="4" height="14" fill="currentColor"/><rect x="23" y="2" width="4" height="14" fill="currentColor"/></svg></i><i><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3a7 7 0 1 1-6.3 4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 3v4.5H7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 6.5v4l3 2" fill="none" stroke="currentColor" stroke-width="2"/></svg></i></span></button>
        <button class="tecla" data-r="ok" aria-label="Confirmar" title="Confirmar (Enter)"><span class="chip"><i>✓</i><i><svg viewBox="0 0 20 22" aria-hidden="true"><circle cx="10" cy="13" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 2h5M10 2v3.5" stroke="currentColor" stroke-width="2"/><path d="M8.6 9.5l-1 7M12.4 9.5l-1 7M6.6 11.8h7M6 14.4h7" stroke="currentColor" stroke-width="1.4"/></svg></i></span></button>
      </div>
      <div class="pie"><span class="marca"><b>Formación</b>Ajedrez JDE</span><span class="placa"><b>JDE</b><small>2026</small></span></div>
    </div>
  </div>
  <div class="lectura" data-r="lectura"></div>
  <div class="aviso" data-r="aviso" role="status" aria-live="polite"></div>
  <div class="barra">
    <span><span class="etiqueta">Velocidad</span><span class="seg" data-r="velocidad"><button data-v="1" aria-pressed="true">×1</button><button data-v="10" aria-pressed="false">×10</button><button data-v="60" aria-pressed="false">×60</button></span></span>
    <span><span class="etiqueta">Pantalla</span><span class="seg" data-r="formato"><button data-v="seg" aria-pressed="true">Con segundos</button><button data-v="real" aria-pressed="false">Como el reloj real</button></span></span>
    <span><span class="etiqueta">Blancas</span><span class="seg" data-r="blancas"><button data-v="0" aria-pressed="true">Izquierda</button><button data-v="1" aria-pressed="false">Derecha</button></span></span>
    <span><span class="etiqueta">Sonido</span><span class="seg" data-r="sonido"><button data-v="1" aria-pressed="false">Sí</button><button data-v="0" aria-pressed="true">No</button></span></span>
    <button class="boton" data-r="reiniciar">Reiniciar partida</button>
  </div>
  <div class="mesa">
    <div class="tarjeta" aria-live="polite">
      <span class="estado" data-r="estado"></span>
      <p class="ahora" data-r="ahora"></p>
      <p class="titulo-pasos" data-r="tituloPasos"></p>
      <ol data-r="pasos"></ol>
      <p class="teclado">Con el reloj seleccionado: A / L palanca · Espacio ▶‖ · ↓ ↑ − / + · Enter ✓</p>
    </div>
    <div class="tarjeta">
      <h3>Control cargado</h3>
      <div class="veredicto" data-r="veredicto"></div>
      <div class="formula" data-r="formula"></div>
      <dl data-r="datos"></dl>
      <h3>Escenarios</h3>
      <div class="escenarios" data-r="escenarios"></div>
      <h3>Retos</h3>
      <p class="teclado" style="margin:0">Configúralos con los botones del reloj. Se marcan solos al confirmar con ✓.</p>
      <ul data-r="retos"></ul>
    </div>
  </div>
</div>`;

    const F = {
        modo: { etiqueta: "Elige el modo de control", lcd: "Modo", min: 0, max: 3 },
        bH: { etiqueta: "Tiempo base: horas", lcd: "Tiempo base · horas", min: 0, max: 9 },
        bM: { etiqueta: "Tiempo base: minutos", lcd: "Tiempo base · minutos", min: 0, max: 59 },
        bS: { etiqueta: "Tiempo base: segundos", lcd: "Tiempo base · segundos", min: 0, max: 59 },
        inc: { etiqueta: "Incremento por jugada (segundos)", lcd: "Incremento · s", min: 0, max: 60 },
        dly: { etiqueta: "Demora por jugada (segundos)", lcd: "Demora · s", min: 0, max: 60 },
        mv: { etiqueta: "Jugadas del primer período", lcd: "Jugadas 1er periodo", min: 1, max: 99 },
        aH: { etiqueta: "Tiempo que se suma en el 2.º período: horas", lcd: "2o periodo · horas", min: 0, max: 9 },
        aM: { etiqueta: "Tiempo que se suma en el 2.º período: minutos", lcd: "2o periodo · minutos", min: 0, max: 59 },
        LH: { etiqueta: "Izquierda: horas", lcd: "Corregir izq · horas", min: 0, max: 9, lado: 0 },
        LM: { etiqueta: "Izquierda: minutos", lcd: "Corregir izq · min", min: 0, max: 59, lado: 0 },
        LS: { etiqueta: "Izquierda: segundos", lcd: "Corregir izq · seg", min: 0, max: 59, lado: 0 },
        Lmv: { etiqueta: "Izquierda: jugadas hechas", lcd: "Corregir izq · jugadas", min: 0, max: 199, lado: 0 },
        RH: { etiqueta: "Derecha: horas", lcd: "Corregir der · horas", min: 0, max: 9, lado: 1 },
        RM: { etiqueta: "Derecha: minutos", lcd: "Corregir der · min", min: 0, max: 59, lado: 1 },
        RS: { etiqueta: "Derecha: segundos", lcd: "Corregir der · seg", min: 0, max: 59, lado: 1 },
        Rmv: { etiqueta: "Derecha: jugadas hechas", lcd: "Corregir der · jugadas", min: 0, max: 199, lado: 1 },
    };
    const CORREGIR = ["LH", "LM", "LS", "Lmv", "RH", "RM", "RS", "Rmv"];

    /* Monta un reloj en `host`. opciones.clave: dónde guardar los retos cumplidos
       (localStorage), o null. Devuelve {cargar(control), destruir()}. */
    function montar(host, opciones) {
        opciones = opciones || {};
        const sombra = host.shadowRoot || host.attachShadow({ mode: "open" });
        sombra.innerHTML = "<style>" + CSS + "</style>" + HTML;
        const $ = (r) => sombra.querySelector('[data-r="' + r + '"]');
        const raiz = sombra.querySelector(".raiz");
        const indiceModo = (id) => MODOS.findIndex((m) => m.id === id);

        // El tema de la clase (class="dark" en <html>).
        const oscuro = () => host.toggleAttribute("data-oscuro", document.documentElement.classList.contains("dark"));
        oscuro();
        const observador = new MutationObserver(oscuro);
        observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

        let cfg = null; // en milisegundos
        const S = { estado: "listo", t: [0, 0], mv: [0, 0], corre: null, dl: 0, bandera: null, blancas: 0, paso: 0, previo: "listo",
            vel: 1, formato: "seg", sonido: false, E: null, C: null, hechos: new Set() };
        const desdeControl = (c) => ({ modo: c.modo, base: c.base * 1000, inc: c.inc, dly: c.dly, mv: c.mv, add: c.add * 1000 });
        const aControl = (k) => ({ modo: k.modo, base: Math.round(k.base / 1000), inc: k.inc, dly: k.dly, mv: k.mv, add: Math.round(k.add / 1000) });
        function reiniciar() { S.t = [cfg.base, cfg.base]; S.mv = [0, 0]; S.corre = null; S.dl = 0; S.bandera = null; S.estado = "listo"; }

        function leerHechos() {
            S.hechos = new Set();
            if (!opciones.clave) return;
            try { (JSON.parse(localStorage.getItem(opciones.clave) || "[]") || []).forEach((i) => { if (Number.isInteger(i) && RETOS[i]) S.hechos.add(i); }); } catch (e) { /* sin almacenamiento */ }
        }
        function guardarHechos() {
            if (!opciones.clave) return;
            try { localStorage.setItem(opciones.clave, JSON.stringify([...S.hechos])); } catch (e) { /* sin almacenamiento */ }
        }

        const nombreLado = (s) => (s === S.blancas ? "las blancas" : "las negras");
        const nombreLadoM = (s) => (s === S.blancas ? "Las blancas" : "Las negras");

        let audio = null;
        function pitido(ms, f) {
            if (!S.sonido) return;
            try {
                audio = audio || new (window.AudioContext || window.webkitAudioContext)();
                const o = audio.createOscillator(), g = audio.createGain();
                o.type = "square"; o.frequency.value = f || 2200; g.gain.value = 0.04;
                o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + (ms || 60) / 1000);
            } catch (e) { /* sin sonido */ }
        }
        let avisoTimer = null;
        function aviso(texto, tipo) {
            const el = $("aviso");
            el.textContent = texto;
            el.className = "aviso" + (tipo ? " " + tipo : "");
            clearTimeout(avisoTimer);
            avisoTimer = setTimeout(() => { el.textContent = ""; }, 7000);
        }
        const minutos = (ms) => { const m = Math.round(ms / 60000); return m >= 60 && m % 60 === 0 ? (m / 60) + " h" : m + " min"; };

        /* ---------- Lo que hacen los botones ---------- */
        function palanca(s) {
            if (!cfg) return;
            if (S.estado === "config" || S.estado === "corregir") { aviso("Estás configurando. Termina con ✓ o cancela con ▶‖.", "alerta"); return; }
            if (S.estado === "listo") {
                S.corre = 1 - s; S.estado = "marcha"; S.dl = cfg.dly * 1000; pitido();
                if (s === S.blancas) aviso("Ojo: presionaron las blancas y arrancó el reloj de las negras. El que se pone en marcha es el de las blancas (art. 6.5).", "alerta");
                else aviso("En marcha: corre el reloj de las blancas.", "ok");
                return;
            }
            if (S.estado === "pausa") { aviso("El reloj está en pausa: la palanca no responde. Reanuda con ▶‖.", "alerta"); return; }
            if (S.estado === "bandera") { aviso("La bandera ya cayó. Reinicia la partida o presiona ✓ para configurar otro control."); return; }
            if (S.corre !== s) return; // ese lado ya está abajo
            S.mv[s]++;
            if ((cfg.modo === "fischer" || cfg.modo === "periodos") && cfg.inc) S.t[s] += cfg.inc * 1000;
            if (cfg.modo === "periodos" && S.mv[s] === cfg.mv) {
                S.t[s] += cfg.add;
                aviso(nombreLadoM(s) + " completaron la jugada " + cfg.mv + ": se suman " + minutos(cfg.add) + " al empezar el 2.º período.", "ok");
            }
            S.corre = 1 - s; S.dl = cfg.dly * 1000; pitido();
        }
        function marcha() {
            if (!cfg) return;
            if (S.estado === "config") { S.estado = S.previo; aviso("Configuración cancelada. El reloj quedó como estaba."); return; }
            if (S.estado === "corregir") { S.estado = "pausa"; aviso("Corrección cancelada."); return; }
            if (S.estado === "marcha") { S.estado = "pausa"; pitido(40, 1600); aviso("Pausa. Así se detiene el reloj para llamar al árbitro (art. 6.11)."); return; }
            if (S.estado === "pausa") { S.estado = "marcha"; pitido(40, 1600); aviso("Partida reanudada.", "ok"); return; }
            if (S.estado === "listo") { aviso("Para arrancar, las negras presionan su lado de la palanca: así empieza a correr el reloj de las blancas."); return; }
            aviso("La partida terminó por tiempo. Reinicia o presiona ✓ para configurar.");
        }
        function partir(k) {
            const b = Math.round(k.base / 1000), a = Math.round(k.add / 60000);
            return { modo: indiceModo(k.modo), bH: Math.floor(b / 3600), bM: Math.floor(b % 3600 / 60), bS: b % 60, inc: k.inc, dly: k.dly, mv: k.mv, aH: Math.floor(a / 60), aM: a % 60 };
        }
        function juntar(E) {
            const m = MODOS[E.modo].id;
            return { modo: m, base: (E.bH * 3600 + E.bM * 60 + (m === "periodos" ? 0 : E.bS)) * 1000,
                inc: m === "fischer" || m === "periodos" ? E.inc : 0, dly: m === "demora" ? E.dly : 0, mv: E.mv, add: m === "periodos" ? (E.aH * 60 + E.aM) * 60000 : 0 };
        }
        const camposConfig = () => ["modo", ...MODOS[S.E.modo].campos];
        function confirmar() {
            if (!cfg) return;
            if (S.estado === "marcha") { aviso("Primero pausa el reloj con ▶‖. Con el reloj corriendo, ✓ no hace nada.", "alerta"); return; }
            if (S.estado === "listo" || S.estado === "bandera") { S.previo = S.estado; S.estado = "config"; S.paso = 0; S.E = partir(cfg); pitido(30, 2600); return; }
            if (S.estado === "pausa") {
                const ti = Math.ceil(S.t[0] / 1000), td = Math.ceil(S.t[1] / 1000);
                S.C = { LH: Math.floor(ti / 3600), LM: Math.floor(ti % 3600 / 60), LS: ti % 60, Lmv: S.mv[0], RH: Math.floor(td / 3600), RM: Math.floor(td % 3600 / 60), RS: td % 60, Rmv: S.mv[1] };
                S.estado = "corregir"; S.paso = 0; pitido(30, 2600);
                aviso("Modo corrección: ajusta tiempos y jugadas de cada lado, como hace el árbitro (art. 6.10).");
                return;
            }
            if (S.estado === "config") {
                const lista = camposConfig(); pitido(30, 2600);
                S.paso++;
                if (S.paso >= lista.length) {
                    const nuevo = juntar(S.E);
                    if (nuevo.base <= 0) { S.paso = lista.indexOf("bM"); aviso("El tiempo base no puede ser cero. Sube los minutos.", "alerta"); return; }
                    cfg = nuevo; reiniciar(); marcarEscenario();
                    const c = aControl(cfg);
                    const logro = RETOS.findIndex((r, i) => !S.hechos.has(i) && r.ok(c));
                    if (logro >= 0) { S.hechos.add(logro); guardarHechos(); pintarRetos(); aviso("¡Reto " + (logro + 1) + " logrado! El reloj quedó listo: las negras presionan su lado para arrancar.", "ok"); }
                    else aviso("Configuración guardada. Las negras presionan su lado de la palanca para arrancar.", "ok");
                }
                return;
            }
            if (S.estado === "corregir") {
                pitido(30, 2600); S.paso++;
                if (S.paso >= CORREGIR.length) {
                    const C = S.C;
                    S.t = [(C.LH * 3600 + C.LM * 60 + C.LS) * 1000, (C.RH * 3600 + C.RM * 60 + C.RS) * 1000]; S.mv = [C.Lmv, C.Rmv];
                    S.estado = "pausa"; aviso("Tiempos corregidos. Reanuda con ▶‖ cuando el árbitro lo indique.", "ok");
                }
            }
        }
        function cambiar(d) {
            let obj, clave;
            if (S.estado === "config") { obj = S.E; clave = camposConfig()[S.paso]; }
            else if (S.estado === "corregir") { obj = S.C; clave = CORREGIR[S.paso]; }
            else { aviso("− y + cambian valores solo mientras configuras. Entra con ✓ (con el reloj detenido)."); return; }
            const f = F[clave], n = f.max - f.min + 1;
            obj[clave] = ((obj[clave] - f.min + d) % n + n) % n + f.min;
            pitido(15, 3000);
        }

        /* ---------- Pintar ---------- */
        function formatear(ms) {
            const tot = Math.ceil(Math.max(0, ms) / 1000), h = Math.floor(tot / 3600), m = Math.floor(tot % 3600 / 60), s = tot % 60;
            if (S.formato === "real") {
                if (ms >= 20 * 60e3) return { texto: h + ":" + pad(m), unidad: ["hrs", "min"] };
                return { texto: pad(h * 60 + m) + ":" + pad(s), unidad: ["min", "sec"] };
            }
            return { texto: h + ":" + pad(m) + ":" + pad(s), unidad: ["h·m", "seg"] };
        }
        const cache = {};
        function poner(r, html) { if (cache[r] !== html) { cache[r] = html; $(r).innerHTML = html; } }
        function htmlLado(sp) {
            const ch = [...sp.texto], ancho = (c) => (c === ":" ? 18 : 58);
            const total = ch.reduce((a, c) => a + ancho(c), 0);
            let d = "", i = 0;
            while (i < ch.length) {
                if (sp.parpadea && i === sp.parpadea[0]) {
                    let tramo = "", w = 0;
                    for (let j = sp.parpadea[0]; j <= sp.parpadea[1]; j++) { tramo += ch[j] === ":" ? dosPuntos(false) : digito(ch[j]); w += ancho(ch[j]); }
                    d += `<span class="parpadea digitos" style="flex:${w} 1 0">${tramo}</span>`; i = sp.parpadea[1] + 1; continue;
                }
                d += ch[i] === ":" ? dosPuntos(sp.tenue) : digito(ch[i]); i++;
            }
            const icono = sp.bandera ? `<span class="parpadea">${BANDERA}</span>` : REY(!sp.blanco);
            return `<div class="digitos" style="max-width:${total}px">${d}</div><div class="meta"><span>${sp.unidad[0]}<br>${sp.unidad[1]}</span>${icono}</div>`;
        }
        function pintarPantalla() {
            const lados = [{}, {}]; let lectura = "", centro = ICONO.listo;
            const blanco = (s) => s === S.blancas;
            if (S.estado === "config") {
                const E = S.E, k = camposConfig()[S.paso]; centro = ICONO.set;
                let sp;
                if (k === "modo") sp = { texto: " " + (E.modo + 1), parpadea: [0, 1], unidad: ["op-", "ción"] };
                else if (k === "bH" || k === "bM" || k === "bS") sp = { texto: E.bH + ":" + pad(E.bM) + ":" + pad(E.bS), parpadea: k === "bH" ? [0, 0] : k === "bM" ? [2, 3] : [5, 6], unidad: ["h·m", "seg"] };
                else if (k === "inc" || k === "dly") sp = { texto: Math.floor(E[k] / 60) + ":" + pad(E[k] % 60), parpadea: [0, 3], unidad: ["min", "sec"] };
                else if (k === "mv") sp = { texto: pad(E.mv), parpadea: [0, 1], unidad: ["ju-", "gadas"] };
                else sp = { texto: E.aH + ":" + pad(E.aM) + ":00", parpadea: k === "aH" ? [0, 0] : [2, 3], unidad: ["h·m", "seg"] };
                lados[0] = Object.assign({}, sp, { blanco: blanco(0) }); lados[1] = Object.assign({}, sp, { blanco: blanco(1) });
                lectura = "<span>Pantalla: " + (k === "modo" ? "Modo " + (E.modo + 1) + "/4 · " + MODOS[E.modo].lcd : F[k].lcd) + "</span>";
            } else if (S.estado === "corregir") {
                const C = S.C, k = CORREGIR[S.paso], f = F[k]; centro = ICONO.set;
                [0, 1].forEach((s) => {
                    const p = s ? "R" : "L";
                    let parp = null;
                    if (f.lado === s) parp = k.endsWith("H") ? [0, 0] : k.endsWith("M") ? [2, 3] : k.endsWith("S") ? [5, 6] : null;
                    lados[s] = { texto: C[p + "H"] + ":" + pad(C[p + "M"]) + ":" + pad(C[p + "S"]), parpadea: parp, unidad: ["h·m", "seg"], blanco: blanco(s) };
                });
                const mv = (s) => { const kk = (s ? "R" : "L") + "mv"; return k === kk ? `<b class="parpadea">#${C[kk]}</b>` : "#" + C[kk]; };
                lectura = `<span class="mv">${mv(0)}</span><span>Pantalla: ${f.lcd}</span><span class="mv">${mv(1)}</span>`;
            } else {
                [0, 1].forEach((s) => {
                    const ft = formatear(S.t[s]), corre = S.estado === "marcha" && S.corre === s;
                    lados[s] = { texto: ft.texto, unidad: ft.unidad, blanco: blanco(s), tenue: corre && Math.floor(S.t[s] / 500) % 2 === 1, bandera: S.bandera === s };
                });
                if (S.estado === "marcha") centro = ICONO.marcha; else if (S.estado === "pausa" || S.estado === "bandera") centro = ICONO.pausa;
                let medio = MODOS[indiceModo(cfg.modo)].lcd;
                if (cfg.modo === "fischer") medio += " +" + cfg.inc + "s";
                if (cfg.modo === "periodos") medio = cfg.mv + " jug · +" + minutos(cfg.add) + " · +" + cfg.inc + "s";
                if (cfg.modo === "demora") { medio = "Demora " + cfg.dly + "s"; if (S.estado === "marcha" || S.estado === "pausa") medio += " · quedan " + Math.ceil(S.dl / 1000); }
                if (S.estado === "pausa") medio = "Pausa · " + medio;
                if (S.estado === "bandera") medio = "Bandera";
                lectura = `<span class="mv">#${S.mv[0]}</span><span>${medio}</span><span class="mv">#${S.mv[1]}</span>`;
            }
            poner("ladoI", htmlLado(lados[0]));
            poner("ladoD", htmlLado(lados[1]));
            poner("centro", centro);
            poner("lectura", lectura);
            const p = $("palanca");
            const cls = S.corre === null || S.estado === "listo" || S.estado === "config" ? "" : (S.corre === 0 ? " i" : " d");
            if (p.className !== "palanca" + cls) p.className = "palanca" + cls;
        }
        function pintarGuia() {
            let estado = "", clase = "", ahora = "", titulo = "", items = [], actual = -1;
            const m = S.estado === "config" ? MODOS[S.E.modo] : MODOS[indiceModo(cfg.modo)];
            const pasosDe = (mo) => ["Con el reloj detenido, presiona ✓ para entrar a configurar", "Con − / + elige el modo (" + mo.nombre + ") y confirma con ✓",
                ...mo.campos.map((k) => F[k].etiqueta + ": ajústalo con − / + y confirma con ✓"), "Listo: las negras presionan su lado y corre el reloj de las blancas"];
            if (S.estado === "config") {
                const k = camposConfig()[S.paso];
                estado = "Configurando · paso " + (S.paso + 2) + " de " + (camposConfig().length + 2);
                ahora = k === "modo" ? "Usa − o + para elegir el modo. Ahora: " + m.nombre + ". Confirma con ✓."
                    : F[k].etiqueta + ". Cambia el valor que parpadea con − o + (mantén presionado para ir rápido) y confirma con ✓.";
                titulo = "Cómo se configura: " + m.nombre; items = pasosDe(m); actual = S.paso + 1;
            } else if (S.estado === "corregir") {
                estado = "Corrección del árbitro"; clase = "alto";
                ahora = F[CORREGIR[S.paso]].etiqueta + ". Ajusta con − / + y confirma con ✓. ▶‖ cancela sin cambiar nada.";
                titulo = "Corregir tiempos a mitad de partida (art. 6.10)";
                items = ["Pausa el reloj con ▶‖", "Presiona ✓ para entrar a corrección", ...CORREGIR.map((k) => F[k].etiqueta), "Reanuda con ▶‖"]; actual = S.paso + 2;
            } else {
                titulo = "Para configurar este control a mano (" + m.nombre + ")"; items = pasosDe(m);
                if (S.estado === "listo") { estado = "Listo para empezar"; ahora = "El reloj está listo. Las negras presionan su lado de la palanca y empieza a correr el tiempo de las blancas."; }
                if (S.estado === "marcha") {
                    estado = "En marcha · juegan " + nombreLado(S.corre); clase = "marcha";
                    ahora = cfg.modo === "demora" ? "Corre el reloj de " + nombreLado(S.corre) + ". Primero se consume la demora de " + cfg.dly + " s; después baja el tiempo principal."
                        : "Corre el reloj de " + nombreLado(S.corre) + ". Al mover, presionan su lado: su reloj se detiene"
                          + (cfg.inc && (cfg.modo === "fischer" || cfg.modo === "periodos") ? ", se le suman " + cfg.inc + " s" : "") + " y arranca el del rival.";
                }
                if (S.estado === "pausa") { estado = "En pausa"; clase = "alto"; ahora = "Reloj detenido. ▶‖ reanuda. ✓ abre la corrección de tiempos y jugadas, como cuando el árbitro arregla un reloj mal puesto."; }
                if (S.estado === "bandera") { estado = "Cayó la bandera"; clase = "alto"; ahora = "Se le agotó el tiempo a " + nombreLado(S.bandera) + ". Antes de declarar la partida, verifica si el rival tiene material para dar mate con alguna serie de jugadas legales; si no, son tablas (art. 6.9)."; }
            }
            const html = items.map((t, i) => `<li class="${i === actual ? "actual" : (actual >= 0 && i < actual ? "hecho" : "")}">${t}</li>`).join("");
            const clave = estado + ahora + titulo + html;
            if (cache.guia === clave) return;
            cache.guia = clave;
            const e = $("estado"); e.textContent = estado; e.className = "estado" + (clase ? " " + clase : "");
            $("ahora").textContent = ahora; $("tituloPasos").textContent = titulo; $("pasos").innerHTML = html;
        }
        const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
        function hms(ms) { const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h ? h + " h " + pad(m) + " min" + (s ? " " + pad(s) + " s" : "") : m + " min" + (s ? " " + pad(s) + " s" : ""); }
        function pintarClase() {
            const c = aControl(cfg), r = clasificar(c);
            const inc = c.modo === "demora" ? c.dly : (c.modo === "sin" ? 0 : c.inc);
            const extra = c.modo === "periodos" && c.mv <= 60 ? c.add / 60 : 0;
            let f = num(c.base / 60) + " min" + (extra ? " + " + num(extra) + " min" : "") + (inc ? " + 60 × " + inc + " s" : "") + " = " + num(r.minutos) + " min";
            const filas = [["Modo", MODOS[indiceModo(c.modo)].nombre], ["Tiempo base", hms(cfg.base)]];
            if (c.modo === "fischer" || c.modo === "periodos") filas.push(["Incremento", c.inc + " s por jugada"]);
            if (c.modo === "demora") filas.push(["Demora", c.dly + " s por jugada"]);
            if (c.modo === "periodos") filas.push(["2.º período", "+" + minutos(cfg.add) + " al completar la jugada " + c.mv]);
            filas.push(["Anotar", r.ritmo === "Clásica"
                ? (inc >= 30 && c.modo !== "demora" ? "Obligatoria toda la partida: con incremento de 30 s o más no se puede dejar de anotar (art. 8.4)." : "Obligatoria. Con menos de 5 min en su reloj puede dejar de anotar (art. 8.4).")
                : "No es obligatorio anotar en rápidas ni relámpago (Anexos A y B)."]);
            const clave = r.ritmo + f + JSON.stringify(filas);
            if (cache.clase === clave) return;
            cache.clase = clave;
            $("veredicto").textContent = r.ritmo;
            $("formula").textContent = "Fórmula de 60 jugadas: " + f + (c.modo === "demora" ? " (la demora se cuenta igual)" : "");
            const dl = $("datos"); dl.replaceChildren();
            filas.forEach(([a, b]) => { const dt = document.createElement("dt"); dt.textContent = a; const dd = document.createElement("dd"); dd.textContent = b; dl.append(dt, dd); });
        }
        function pintarEscenarios() {
            const caja = $("escenarios"); caja.replaceChildren();
            ESCENARIOS.forEach((e, i) => {
                const b = document.createElement("button");
                b.type = "button"; b.className = "escenario"; b.dataset.i = String(i);
                const t = document.createElement("b"); t.textContent = e.nombre;
                const s = document.createElement("span"); s.textContent = e.sub;
                b.append(t, s);
                b.addEventListener("click", () => {
                    if (S.estado === "marcha") { aviso("Pausa o termina la partida antes de cambiar el control.", "alerta"); return; }
                    cfg = desdeControl(e.control); reiniciar(); marcarEscenario();
                    aviso("Cargado " + e.nombre + " (" + e.sub + "). La guía muestra los pasos para dejarlo así con los botones.", "ok");
                });
                caja.appendChild(b);
            });
            marcarEscenario();
        }
        function marcarEscenario() {
            if (!cfg) return;
            const c = aControl(cfg);
            sombra.querySelectorAll(".escenario").forEach((b) => {
                const e = ESCENARIOS[+b.dataset.i].control;
                b.classList.toggle("activo", e.modo === c.modo && e.base === c.base && e.inc === c.inc && e.dly === c.dly && (e.modo !== "periodos" || (e.mv === c.mv && e.add === c.add)));
            });
        }
        function pintarRetos() {
            const ul = $("retos"); ul.replaceChildren();
            RETOS.forEach((r, i) => {
                const li = document.createElement("li"); if (S.hechos.has(i)) li.className = "ok";
                const c = document.createElement("span"); c.className = "casilla"; c.textContent = S.hechos.has(i) ? "✓" : "";
                const t = document.createElement("span"); t.textContent = r.texto + (S.hechos.has(i) ? " (logrado)" : "");
                li.append(c, t); ul.appendChild(li);
            });
        }

        /* ---------- Enganchar ---------- */
        $("izq").addEventListener("click", () => palanca(0));
        $("der").addEventListener("click", () => palanca(1));
        $("marcha").addEventListener("click", marcha);
        $("ok").addEventListener("click", confirmar);
        function repetible(el, fn) {
            let t1 = null, t2 = null;
            const parar = () => { clearTimeout(t1); clearInterval(t2); el.classList.remove("abajo"); };
            el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.focus(); el.classList.add("abajo"); fn(); t1 = setTimeout(() => { t2 = setInterval(fn, 85); }, 420); });
            ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, parar));
            el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); fn(); } });
        }
        repetible($("menos"), () => cambiar(-1));
        repetible($("mas"), () => cambiar(1));
        function segmentado(r, fn) {
            const caja = $(r);
            caja.addEventListener("click", (e) => {
                const b = e.target.closest("button"); if (!b) return;
                caja.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fn(b.dataset.v);
            });
        }
        segmentado("velocidad", (v) => { S.vel = +v; });
        segmentado("formato", (v) => { S.formato = v; if (v === "real") aviso("Como el reloj real: con 20 minutos o más muestra horas y minutos; por debajo de 20 minutos, minutos y segundos."); });
        segmentado("blancas", (v) => { S.blancas = +v; });
        segmentado("sonido", (v) => { S.sonido = v === "1"; });
        $("reiniciar").addEventListener("click", () => { if (!cfg) return; reiniciar(); aviso("Partida reiniciada con el mismo control."); });
        // Tocar el reloj lo selecciona: así sus teclas funcionan sin pisar las del tablero.
        raiz.addEventListener("pointerdown", (e) => { if (!e.target.closest("button")) raiz.focus({ preventScroll: true }); });
        raiz.addEventListener("keydown", (e) => {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            const t = e.target, enBoton = t && t.tagName === "BUTTON";
            const golpe = (r) => { const el = $(r); el.classList.add("abajo"); setTimeout(() => el.classList.remove("abajo"), 110); };
            const k = e.key.toLowerCase();
            if (k === "a" || e.code === "ShiftLeft") { e.stopPropagation(); palanca(0); }
            else if (k === "l" || e.code === "ShiftRight") { e.stopPropagation(); palanca(1); }
            else if (e.code === "Space" && !enBoton) { e.preventDefault(); e.stopPropagation(); golpe("marcha"); marcha(); }
            else if (k === "enter" && !enBoton) { e.preventDefault(); e.stopPropagation(); golpe("ok"); confirmar(); }
            else if (k === "arrowup") { e.preventDefault(); e.stopPropagation(); golpe("mas"); cambiar(1); }
            else if (k === "arrowdown") { e.preventDefault(); e.stopPropagation(); golpe("menos"); cambiar(-1); }
        });

        // Un temporizador y no requestAnimationFrame: con la pestaña de atrás el reloj sigue
        // contando (y la bandera cae a su hora), como uno de verdad.
        let ultimo = performance.now(), vivo = true, ciclo = null;
        function paso(dt) {
            const r = S.corre;
            if (cfg.modo === "demora" && S.dl > 0) { const u = Math.min(S.dl, dt); S.dl -= u; dt -= u; }
            S.t[r] -= dt;
            if (S.t[r] <= 0) {
                S.t[r] = 0; S.estado = "bandera"; S.bandera = r; pitido(600, 1800);
                aviso("Cayó la bandera de " + nombreLado(r) + ". ¿El rival puede dar mate con alguna serie de jugadas legales? Si no, son tablas (art. 6.9).", "alerta");
            }
        }
        function cuadro() {
            if (!vivo) return;
            const t = performance.now(), dt = (t - ultimo) * S.vel; ultimo = t;
            if (cfg) {
                if (S.estado === "marcha") paso(dt);
                pintarPantalla(); pintarGuia(); pintarClase();
            }
        }

        function cargar(control, clave) {
            if (!validoControl(control)) return;
            if (clave !== undefined) opciones.clave = clave;
            cfg = desdeControl(control);
            reiniciar(); leerHechos(); pintarRetos(); marcarEscenario();
            $("aviso").textContent = "";
        }
        pintarEscenarios(); pintarRetos();
        ciclo = setInterval(cuadro, 50);
        return {
            cargar,
            destruir() { vivo = false; clearInterval(ciclo); observador.disconnect(); clearTimeout(avisoTimer); },
        };
    }

    return { MODOS, ESCENARIOS, RETOS, valido, validoControl, paraMandar, clasificar, montar };
})();

/* ---------- La clase: lo que llega de game_state ---------- */
let relojActual = null;      // {id, control} o null
let relojMontado = null;     // lo que devuelve RelojPractica.montar
let relojPermiso = false;

function pintarReloj(r) {
    const antes = relojActual;
    relojActual = RelojPractica.valido(r) ? r : null;
    const tarjeta = document.getElementById("reloj-tarjeta");
    pintarRelojProfe();
    if (!tarjeta) return;
    if (!relojActual || esObservador) {
        tarjeta.hidden = true;
        if (relojMontado) { relojMontado.destruir(); relojMontado = null; }
        if (antes && !relojActual && !isTeacher) anunciarALaClase("reloj", null);
        return;
    }
    tarjeta.hidden = false;
    if (antes && antes.id === relojActual.id && relojMontado) return; // el mismo envío: el reloj de cada uno sigue como va
    const clave = "clase_reloj_v1:" + (boardOwnerId || "") + ":" + relojActual.id;
    if (!relojMontado) relojMontado = RelojPractica.montar(document.getElementById("reloj-host"), { clave });
    relojMontado.cargar(relojActual.control, clave);
    if (!isTeacher) {
        anunciarALaClase("reloj", relojActual.id, "Tu profe puso el reloj de práctica en tu pantalla, arriba del tablero. Es tuyo: configúralo con sus botones y ponlo en marcha con la palanca.");
    }
}

/* ---------- El profe ---------- */
let relojCargando = false;
async function cargarRelojProfe() {
    if (!isTeacher || relojPermiso || relojCargando) return;
    const caja = document.getElementById("reloj-caja");
    if (!caja) return;
    relojCargando = true;
    try {
        const { data, error } = await sb.rpc("puede_bajar", { p_producto: "formacion-ajedrez", p_basta_acceso: false });
        if (error) throw error;
        relojPermiso = data === true;
    } catch (e) {
        console.error("No se pudo revisar el permiso del reloj de práctica:", e);
    }
    relojCargando = false;
    if (!relojPermiso) return;
    const sel = document.getElementById("reloj-select");
    if (!sel.options.length) {
        RelojPractica.ESCENARIOS.forEach((e, k) => {
            const o = document.createElement("option");
            o.value = String(k);
            o.textContent = e.nombre + " · " + e.sub;
            sel.appendChild(o);
        });
    }
    caja.hidden = false;
    pintarRelojProfe();
}

function pintarRelojProfe() {
    const quitar = document.getElementById("reloj-quitar-btn");
    if (!quitar) return;
    const hay = isTeacher && !!relojActual;
    quitar.hidden = !hay;
    document.getElementById("reloj-mandar-btn").textContent = hay ? "Ponerlo de nuevo con este control (todos arrancan de cero)" : "Poner el reloj en la clase";
    document.getElementById("reloj-enviado").textContent = hay
        ? "Puesto en la clase: " + RelojPractica.clasificar(relojActual.control).ritmo + " · cada alumno lo ve arriba del tablero y maneja el suyo."
        : "";
}

async function mandarReloj() {
    const aviso = document.getElementById("reloj-aviso");
    const k = parseInt(document.getElementById("reloj-select").value, 10);
    const esc = RelojPractica.ESCENARIOS[k];
    if (!esc || !myGameStateId) return;
    const nuevo = RelojPractica.paraMandar(esc.control);
    if (!RelojPractica.valido(nuevo)) { aviso.textContent = "Ese control no tiene la forma que la base acepta."; return; }
    aviso.textContent = "Poniendo el reloj…";
    const { data, error } = await sb.from("game_state").update({ reloj: nuevo }).eq("id", myGameStateId).select("reloj").single();
    if (error) { console.error(error); aviso.textContent = "No se pudo poner el reloj. Vuelve a intentarlo."; return; }
    aviso.textContent = "";
    pintarReloj(data && data.reloj ? data.reloj : nuevo);
}

async function quitarReloj() {
    const aviso = document.getElementById("reloj-aviso");
    const { error } = await sb.from("game_state").update({ reloj: null }).eq("id", myGameStateId);
    if (error) { console.error(error); aviso.textContent = "No se pudo quitar el reloj. Vuelve a intentarlo."; return; }
    aviso.textContent = "";
    pintarReloj(null);
}

if (document.getElementById("reloj-tarjeta")) {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    on("reloj-mandar-btn", () => mandarReloj());
    on("reloj-quitar-btn", () => quitarReloj());
}

/*! rev bfb5bbb0d2d82f9f */
