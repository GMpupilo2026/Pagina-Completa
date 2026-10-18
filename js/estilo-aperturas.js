/* ===== Ajedrez Integral — Qué aperturas le quedan a un estilo =====
 *
 * La prueba de estilo (js/estilo-perfil.js) dice qué tipo de juego prefiere
 * una persona en cuatro ejes: atacar o maniobrar, abrir o cerrar, cambiar o
 * mantener piezas, quedarse con el material o darlo por la iniciativa (las
 * pruebas de la versión 1 traen solo los tres primeros, y se recomienda con
 * esos). Este archivo cruza eso con las aperturas del banco de
 * «Aperturas y celadas» (js/aperturas-lineas.js, una sola copia de las
 * líneas) y propone una con blancas, una defensa contra 1.e4 y una contra
 * 1.d4, cada una con su porqué y una alternativa.
 *
 * El carácter de cada apertura (bloque MEDIDO) NO se pone a ojo: lo mide
 * herramientas/estilo-aperturas-medir.js, con las mismas medidas de la
 * prueba, en las partidas de maestros del repositorio que pasan por ella.
 * `car` va de −1 a +1 contra las demás aperturas del mismo color; `base` dice
 * si se midió la variante misma o, por falta de partidas, su familia (las
 * jugadas hasta donde alcanzaron). Ese bloque no se edita a mano.
 *
 * Lo que pesa en la recomendación, y por qué:
 *   - El estilo, eje por eje, con el peso de lo seguro que es: un eje medido
 *     con un margen ancho («sin definir todavía») casi no cuenta.
 *   - La teoría que pide (`nivel` de la línea, el mismo de «Aperturas y
 *     celadas») contra lo que la persona puede sostener: su Elo, el tiempo
 *     que estudia y el ritmo en que juega. Una línea de más nivel no se
 *     descarta: se castiga, porque contra 1.d4 hay una sola de nivel 1.
 *   - La que ya juega: si le queda casi igual de bien que la mejor, se le dice
 *     que siga con la suya. Cambiar de apertura cuesta meses.
 *   - Cómo le va en sus partidas según el tipo de partida (`contexto.rendimiento`,
 *     de js/estilo-partidas.js; solo abrir o cerrar y cambiar o mantener, y
 *     solo si la diferencia no es del azar): lo que le gusta pesa 70 % y lo
 *     que le rinde 30 %. Y aunque la prueba haya dejado ese eje sin definir,
 *     el eje pesa al menos 0,5: lo que se ve en 30 partidas o más es un dato.
 *
 *   EstiloAperturas.recomendar(perfil, contexto) → { blancas, e4, d4 }
 *     cada uno { principal, alternativa, mantener } con { id, nombre,
 *     apertura, jugadas, porque: [frases], ajuste }
 *   EstiloAperturas.medidaDe(id) → la fila de MEDIDO
 */
(function () {
  "use strict";

  /* MEDIDO-INICIO: generado por herramientas/estilo-aperturas-medir.js — no se edita a mano. */
  const MEDIDO = [
    {"id":"espanola-cerrada","color":"w","contra":null,"n":328,"define":["e4","e5","Nf3","Nc6","Bb5","a6","Ba4"],"base":"variante","media":{"ataque":1.54,"estructura":0.21,"cambios":11.28,"material":-0.02},"car":{"ataque":-0.35,"estructura":-0.71,"cambios":-0.59,"material":0.21}},
    {"id":"espanola-cambio","color":"w","contra":null,"n":19,"define":["e4","e5","Nf3","Nc6","Bb5","a6","Bxc6"],"base":"variante","media":{"ataque":2.54,"estructura":1.25,"cambios":28.89,"material":0.08},"car":{"ataque":1,"estructura":0.34,"cambios":1,"material":0.59}},
    {"id":"italiana-giuoco","color":"w","contra":null,"n":99,"define":["e4","e5","Nf3","Nc6","Bc4","Bc5","c3"],"base":"variante","media":{"ataque":1.79,"estructura":0.59,"cambios":13.78,"material":-0.17},"car":{"ataque":0.01,"estructura":-0.33,"cambios":-0.27,"material":-0.35}},
    {"id":"escocesa","color":"w","contra":null,"n":63,"define":["e4","e5","Nf3","Nc6","d4","exd4","Nxd4"],"base":"variante","media":{"ataque":2.1,"estructura":1.81,"cambios":21.29,"material":0.16},"car":{"ataque":0.46,"estructura":0.91,"cambios":0.68,"material":0.89}},
    {"id":"petrov","color":"b","contra":"e4","n":113,"define":["e4","e5","Nf3","Nf6"],"base":"variante","media":{"ataque":1.69,"estructura":1.14,"cambios":17.45,"material":-0.03},"car":{"ataque":0.44,"estructura":0.25,"cambios":0.53,"material":-0.16}},
    {"id":"gambito-de-rey","color":"w","contra":null,"n":15,"define":["e4","e5","f4"],"base":"variante","media":{"ataque":2.3,"estructura":1.91,"cambios":22,"material":-0.35},"car":{"ataque":0.75,"estructura":1,"cambios":0.77,"material":-1}},
    {"id":"siciliana-najdorf","color":"b","contra":"e4","n":308,"define":["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6"],"base":"variante","media":{"ataque":1.3,"estructura":0.88,"cambios":13.45,"material":0.02},"car":{"ataque":-0.33,"estructura":0.03,"cambios":-0.24,"material":0}},
    {"id":"siciliana-dragon","color":"b","contra":"e4","n":76,"define":["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6"],"base":"variante","media":{"ataque":2.13,"estructura":1.3,"cambios":16.01,"material":0.01},"car":{"ataque":1,"estructura":0.39,"cambios":0.25,"material":-0.03}},
    {"id":"siciliana-cerrada","color":"w","contra":null,"n":25,"define":["e4","c5","Nc3","Nc6","g3"],"base":"variante","media":{"ataque":1.37,"estructura":0.28,"cambios":9.28,"material":-0.01},"car":{"ataque":-0.6,"estructura":-0.64,"cambios":-0.84,"material":0.25}},
    {"id":"francesa-avance","color":"b","contra":"e4","n":125,"define":["e4","e6","d4","d5","e5"],"base":"variante","media":{"ataque":1.16,"estructura":0.19,"cambios":12.44,"material":0.18},"car":{"ataque":-0.61,"estructura":-0.55,"cambios":-0.44,"material":0.49}},
    {"id":"francesa-tarrasch","color":"w","contra":null,"n":120,"define":["e4","e6","d4","d5","Nd2"],"base":"variante","media":{"ataque":2.25,"estructura":1.39,"cambios":16.08,"material":-0.13},"car":{"ataque":0.68,"estructura":0.49,"cambios":0.02,"material":-0.2}},
    {"id":"caro-kann-clasica","color":"b","contra":"e4","n":107,"define":["e4","c6","d4","d5","Nc3"],"base":"variante","media":{"ataque":1.73,"estructura":1.36,"cambios":16.85,"material":0.03},"car":{"ataque":0.52,"estructura":0.44,"cambios":0.42,"material":0.03}},
    {"id":"caro-kann-avance","color":"b","contra":"e4","n":206,"define":["e4","c6","d4","d5","e5"],"base":"variante","media":{"ataque":1.34,"estructura":0.08,"cambios":15.98,"material":-0.02},"car":{"ataque":-0.25,"estructura":-0.64,"cambios":0.25,"material":-0.13}},
    {"id":"escandinava","color":"b","contra":"e4","n":109,"define":["e4","d5"],"base":"variante","media":{"ataque":1.65,"estructura":1.23,"cambios":15.85,"material":-0.03},"car":{"ataque":0.36,"estructura":0.33,"cambios":0.22,"material":-0.16}},
    {"id":"pirc","color":"b","contra":"e4","n":183,"define":["e4","d6"],"base":"variante","media":{"ataque":1.29,"estructura":0.46,"cambios":15.1,"material":0.03},"car":{"ataque":-0.35,"estructura":-0.32,"cambios":0.08,"material":0.03}},
    {"id":"alekhine","color":"b","contra":"e4","n":57,"define":["e4","Nf6"],"base":"variante","media":{"ataque":1.39,"estructura":0.86,"cambios":15.91,"material":0.07},"car":{"ataque":-0.16,"estructura":0.02,"cambios":0.23,"material":0.15}},
    {"id":"gambito-dama-declinado","color":"b","contra":"d4","n":279,"define":["d4","d5","c4","e6","Nc3","Nf6"],"base":"variante","media":{"ataque":1.42,"estructura":0.84,"cambios":13.37,"material":0.02},"car":{"ataque":-0.1,"estructura":0,"cambios":-0.26,"material":0}},
    {"id":"eslava","color":"b","contra":"d4","n":20,"define":["d4","d5","c4","c6","Nf3","Nf6","Nc3","dxc4"],"base":"variante","media":{"ataque":1.33,"estructura":1.2,"cambios":11.95,"material":0.39},"car":{"ataque":-0.27,"estructura":0.3,"cambios":-0.53,"material":1}},
    {"id":"nimzoindia","color":"b","contra":"d4","n":362,"define":["d4","Nf6","c4","e6","Nc3"],"base":"variante","media":{"ataque":1.52,"estructura":0.84,"cambios":13.5,"material":-0.01},"car":{"ataque":0.1,"estructura":0,"cambios":-0.23,"material":-0.09}},
    {"id":"india-de-rey","color":"b","contra":"d4","n":187,"define":["d4","Nf6","c4","g6","Nc3","Bg7"],"base":"variante","media":{"ataque":1.65,"estructura":-0.33,"cambios":9.78,"material":-0.04},"car":{"ataque":0.36,"estructura":-0.99,"cambios":-0.96,"material":-0.19}},
    {"id":"grunfeld","color":"b","contra":"d4","n":74,"define":["d4","Nf6","c4","g6","Nc3","d5"],"base":"variante","media":{"ataque":1.61,"estructura":1.65,"cambios":19.36,"material":-0.1},"car":{"ataque":0.28,"estructura":0.68,"cambios":0.9,"material":-0.37}},
    {"id":"india-de-dama","color":"b","contra":"d4","n":113,"define":["d4","Nf6","c4","e6","Nf3","b6"],"base":"variante","media":{"ataque":1.15,"estructura":0.66,"cambios":11.81,"material":0.06},"car":{"ataque":-0.63,"estructura":-0.15,"cambios":-0.56,"material":0.12}},
    {"id":"sistema-londres","color":"w","contra":null,"n":58,"define":["d4","d5","Nf3","Nf6","Bf4"],"base":"variante","media":{"ataque":1.75,"estructura":0.67,"cambios":18.47,"material":0.04},"car":{"ataque":-0.05,"estructura":-0.24,"cambios":0.32,"material":0.44}},
    {"id":"holandesa","color":"b","contra":"d4","n":0,"define":["d4","f5","g3","Nf6","Bg2","e6"],"base":null},
    {"id":"inglesa","color":"w","contra":null,"n":147,"define":["c4","e5"],"base":"variante","media":{"ataque":1.34,"estructura":0.77,"cambios":13.97,"material":0.01},"car":{"ataque":-0.64,"estructura":-0.14,"cambios":-0.25,"material":0.32}},
    {"id":"vienesa","color":"w","contra":null,"n":63,"define":["e4","e5","Nc3"],"base":"variante","media":{"ataque":1.78,"estructura":1.1,"cambios":17.57,"material":0.02},"car":{"ataque":0,"estructura":0.19,"cambios":0.21,"material":0.36}},
    {"id":"gambito-evans","color":"w","contra":null,"n":0,"define":["e4","e5","Nf3","Nc6","Bc4","Bc5","b4"],"base":null},
    {"id":"ataque-indio-de-rey","color":"w","contra":null,"n":150,"define":["Nf3","d5","g3"],"base":"variante","media":{"ataque":1.33,"estructura":0.83,"cambios":14.46,"material":-0.13},"car":{"ataque":-0.66,"estructura":-0.08,"cambios":-0.19,"material":-0.2}},
    {"id":"colle","color":"w","contra":null,"n":66,"define":["d4","d5","Nf3","Nf6","e3"],"base":"variante","media":{"ataque":1.72,"estructura":0.69,"cambios":13.55,"material":0.01},"car":{"ataque":-0.09,"estructura":-0.22,"cambios":-0.3,"material":0.32}},
    {"id":"alapin","color":"w","contra":null,"n":162,"define":["e4","c5","c3"],"base":"variante","media":{"ataque":1.95,"estructura":1.67,"cambios":17.44,"material":-0.04},"car":{"ataque":0.25,"estructura":0.77,"cambios":0.19,"material":0.14}},
    {"id":"trompowsky","color":"w","contra":null,"n":51,"define":["d4","Nf6","Bg5"],"base":"variante","media":{"ataque":1.72,"estructura":0.26,"cambios":17.25,"material":0},"car":{"ataque":-0.09,"estructura":-0.66,"cambios":0.17,"material":0.29}},
    {"id":"reti","color":"w","contra":null,"n":47,"define":["Nf3","d5","c4"],"base":"variante","media":{"ataque":1.25,"estructura":1.15,"cambios":12.49,"material":0.02},"car":{"ataque":-0.77,"estructura":0.24,"cambios":-0.44,"material":0.36}},
    {"id":"catalana","color":"w","contra":null,"n":91,"define":["d4","Nf6","c4","e6","g3"],"base":"variante","media":{"ataque":1.55,"estructura":0.72,"cambios":14.15,"material":-0.24},"car":{"ataque":-0.34,"estructura":-0.19,"cambios":-0.23,"material":-0.61}},
    {"id":"gambito-escoces","color":"w","contra":null,"n":24,"define":["e4","e5","Nf3","Nc6","d4","exd4","Bc4"],"base":"variante","media":{"ataque":2.13,"estructura":1.71,"cambios":15.96,"material":-0.34},"car":{"ataque":0.51,"estructura":0.81,"cambios":0,"material":-0.99}},
    {"id":"philidor","color":"b","contra":"e4","n":27,"define":["e4","e5","Nf3","d6"],"base":"variante","media":{"ataque":1.17,"estructura":0.64,"cambios":13.52,"material":0.06},"car":{"ataque":-0.59,"estructura":-0.17,"cambios":-0.23,"material":0.12}},
    {"id":"gambito-dama-aceptado","color":"b","contra":"d4","n":71,"define":["d4","d5","c4","dxc4"],"base":"variante","media":{"ataque":1.54,"estructura":1.89,"cambios":17.56,"material":0.25},"car":{"ataque":0.14,"estructura":0.89,"cambios":0.56,"material":0.71}},
    {"id":"semieslava","color":"b","contra":"d4","n":87,"define":["d4","d5","c4","c6","Nf3","Nf6","Nc3","e6"],"base":"variante","media":{"ataque":1.51,"estructura":0.74,"cambios":12.84,"material":0.1},"car":{"ataque":0.08,"estructura":-0.08,"cambios":-0.36,"material":0.25}},
    {"id":"benoni-moderna","color":"b","contra":"d4","n":0,"define":["d4","Nf6","c4","c5","d5","e6"],"base":null},
    {"id":"siciliana-abierta","color":"w","contra":null,"n":58,"define":["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6","Be2"],"base":"variante","media":{"ataque":1.45,"estructura":0.41,"cambios":12.31,"material":0},"car":{"ataque":-0.48,"estructura":-0.51,"cambios":-0.46,"material":0.29}},
    {"id":"smith-morra","color":"w","contra":null,"n":32,"define":["e4","c5","d4"],"base":"variante","media":{"ataque":1.89,"estructura":1.09,"cambios":12.91,"material":-0.37},"car":{"ataque":0.16,"estructura":0.18,"cambios":-0.38,"material":-1}},
    {"id":"cuatro-caballos","color":"w","contra":null,"n":96,"define":["e4","e5","Nf3","Nc6","Nc3"],"base":"variante","media":{"ataque":2.07,"estructura":1.03,"cambios":20.17,"material":-0.09},"car":{"ataque":0.42,"estructura":0.12,"cambios":0.54,"material":-0.05}},
    {"id":"gambito-danes","color":"w","contra":null,"n":21,"define":["e4","e5","d4"],"base":"variante","media":{"ataque":2.1,"estructura":1.38,"cambios":16.9,"material":-0.18},"car":{"ataque":0.46,"estructura":0.48,"cambios":0.12,"material":-0.39}},
    {"id":"berlin","color":"b","contra":"e4","n":67,"define":["e4","e5","Nf3","Nc6","Bb5","Nf6"],"base":"variante","media":{"ataque":1.54,"estructura":1.01,"cambios":19.9,"material":0.08},"car":{"ataque":0.14,"estructura":0.14,"cambios":1,"material":0.18}},
    {"id":"inglesa-simetrica","color":"b","contra":"c4","n":89,"define":["c4","c5"],"base":"variante","media":{"ataque":1.6,"estructura":0.65,"cambios":13.92,"material":-0.01},"car":{"ataque":0.26,"estructura":-0.16,"cambios":-0.15,"material":-0.09}},
    {"id":"benko","color":"b","contra":"d4","n":32,"define":["d4","Nf6","c4","c5","d5","b5"],"base":"variante","media":{"ataque":1.48,"estructura":1.45,"cambios":13.97,"material":-0.67},"car":{"ataque":0.02,"estructura":0.51,"cambios":-0.14,"material":-1}},
    {"id":"francesa-winawer","color":"b","contra":"e4","n":228,"define":["e4","e6","d4","d5","Nc3"],"base":"variante","media":{"ataque":1.45,"estructura":0.4,"cambios":16.71,"material":0.08},"car":{"ataque":-0.04,"estructura":-0.37,"cambios":0.39,"material":0.18}},
    {"id":"defensa-moderna","color":"b","contra":"e4","n":65,"define":["e4","g6"],"base":"variante","media":{"ataque":1.23,"estructura":0.31,"cambios":13.38,"material":0.05},"car":{"ataque":-0.47,"estructura":-0.45,"cambios":-0.26,"material":0.09}},
    {"id":"stonewall","color":"w","contra":null,"n":0,"define":["d4","d5","e3"],"base":null},
    {"id":"gambito-budapest","color":"b","contra":"d4","n":0,"define":["d4","Nf6","c4","e5"],"base":null},
    {"id":"ponziani","color":"w","contra":null,"n":0,"define":["e4","e5","Nf3","Nc6","c3"],"base":null},
    {"id":"apertura-alfil","color":"w","contra":null,"n":40,"define":["e4","e5","Bc4"],"base":"variante","media":{"ataque":2.26,"estructura":0.65,"cambios":18.05,"material":-0.17},"car":{"ataque":0.7,"estructura":-0.26,"cambios":0.27,"material":-0.35}},
    {"id":"bird","color":"w","contra":null,"n":66,"define":["f4"],"base":"variante","media":{"ataque":1.57,"estructura":0.28,"cambios":13.27,"material":-0.01},"car":{"ataque":-0.31,"estructura":-0.64,"cambios":-0.34,"material":0.25}},
    {"id":"grand-prix","color":"w","contra":null,"n":28,"define":["e4","c5","Nc3","Nc6","f4"],"base":"variante","media":{"ataque":1.48,"estructura":0.48,"cambios":13.93,"material":-0.1},"car":{"ataque":-0.44,"estructura":-0.44,"cambios":-0.26,"material":-0.09}},
    {"id":"siciliana-sveshnikov","color":"b","contra":"e4","n":120,"define":["e4","c5","Nf3","Nc6","d4","cxd4","Nxd4","Nf6"],"base":"variante","media":{"ataque":1.46,"estructura":0.81,"cambios":14.64,"material":0.03},"car":{"ataque":-0.02,"estructura":-0.03,"cambios":-0.01,"material":0.03}},
    {"id":"siciliana-kan","color":"b","contra":"e4","n":83,"define":["e4","c5","Nf3","e6","d4","cxd4","Nxd4","a6"],"base":"variante","media":{"ataque":1.17,"estructura":1.15,"cambios":12.31,"material":0.04},"car":{"ataque":-0.59,"estructura":0.26,"cambios":-0.46,"material":0.06}},
    {"id":"bogoindia","color":"b","contra":"d4","n":60,"define":["d4","Nf6","c4","e6","Nf3","Bb4+"],"base":"variante","media":{"ataque":1,"estructura":0.45,"cambios":14.13,"material":0.05},"car":{"ataque":-0.93,"estructura":-0.33,"cambios":-0.11,"material":0.09}},
    {"id":"india-antigua","color":"b","contra":"d4","n":34,"define":["d4","Nf6","c4","d6"],"base":"variante","media":{"ataque":1.25,"estructura":-0.67,"cambios":8.62,"material":0.01},"car":{"ataque":-0.43,"estructura":-1,"cambios":-1,"material":-0.03}},
    {"id":"holandesa-leningrado","color":"b","contra":"d4","n":0,"define":["d4","f5","g3","Nf6","Bg2","g6"],"base":null},
    {"id":"ataque-torre","color":"w","contra":null,"n":406,"define":["d4","Nf6","Nf3"],"base":"variante","media":{"ataque":1.58,"estructura":0.72,"cambios":13.89,"material":-0.01},"car":{"ataque":-0.29,"estructura":-0.19,"cambios":-0.26,"material":0.25}},
    {"id":"larsen","color":"w","contra":null,"n":58,"define":["b3"],"base":"variante","media":{"ataque":1.51,"estructura":0.63,"cambios":15.21,"material":0.04},"car":{"ataque":-0.4,"estructura":-0.28,"cambios":-0.09,"material":0.44}},
    {"id":"defensa-tarrasch","color":"b","contra":"d4","n":17,"define":["d4","d5","c4","e6","Nc3","c5"],"base":"variante","media":{"ataque":2.02,"estructura":2.12,"cambios":18.12,"material":-0.21},"car":{"ataque":1,"estructura":1,"cambios":0.66,"material":-0.71}},
    {"id":"dragon-acelerado","color":"b","contra":"e4","n":87,"define":["e4","c5","Nf3","Nc6","d4","cxd4","Nxd4","g6"],"base":"variante","media":{"ataque":1.63,"estructura":1.27,"cambios":18.3,"material":0.04},"car":{"ataque":0.32,"estructura":0.36,"cambios":0.7,"material":0.06}},
    {"id":"defensa-nimzowitsch","color":"b","contra":"e4","n":33,"define":["e4","Nc6"],"base":"variante","media":{"ataque":1.8,"estructura":0.3,"cambios":15,"material":0.14},"car":{"ataque":0.66,"estructura":-0.46,"cambios":0.06,"material":0.37}},
    {"id":"siciliana-taimanov","color":"b","contra":"e4","n":99,"define":["e4","c5","Nf3","e6","d4","cxd4","Nxd4","Nc6"],"base":"variante","media":{"ataque":1.29,"estructura":1.17,"cambios":13.99,"material":0.02},"car":{"ataque":-0.35,"estructura":0.28,"cambios":-0.14,"material":0}}
  ];
  /* MEDIDO-FIN */

  const EJES = ["ataque", "estructura", "cambios", "material"];
  const GRUPOS = {
    blancas: { color: "w", contra: null, titulo: "Con blancas" },
    e4: { color: "b", contra: "e4", titulo: "Con negras, contra 1.e4" },
    d4: { color: "b", contra: "d4", titulo: "Con negras, contra 1.d4" },
  };
  // Si la que ya juega queda a menos de esto de la mejor, se le dice que siga.
  const MARGEN_MANTENER = 0.15;
  const CASTIGO_NIVEL = 0.5;
  const PESO_RINDE = 0.3, RINDE_PLENO = 0.2, PESO_MINIMO_RINDE = 0.5;

  const lineas = () => {
    const A = (typeof window !== "undefined" && window.AperturasLineas)
      || (typeof require === "function" ? require("./aperturas-lineas.js") : null);
    return A ? A.LINEAS : [];
  };
  const medidaDe = (id) => MEDIDO.find((m) => m.id === id) || null;

  /* Hasta qué nivel de teoría conviene: por el Elo (si no se sabe, el del
     medio), uno menos si estudia poco y uno menos si juega rápido. */
  function nivelQueConviene(ctx) {
    const elo = ctx && ctx.elo;
    let n = elo == null ? 2 : elo < 1200 ? 1 : elo < 1700 ? 2 : 3;
    if (ctx && ctx.estudio === "poco") n -= 1;
    if (ctx && (ctx.ritmo === "bala" || ctx.ritmo === "blitz")) n -= 1;
    return Math.max(1, n);
  }

  /* Cuánto le pesa cada eje: lo seguro que es (1 − el ancho de su margen). */
  function pesos(perfil) {
    const out = {};
    for (const e of EJES) {
      const x = perfil && perfil[e];
      out[e] = x ? Math.max(0.05, 1 - (x.hi - x.lo)) : 0;
    }
    return out;
  }
  const tendencia = (x) => Math.max(-1, Math.min(1, 2 * x.p - 1));

  /* Lo que le rinde en un eje, de −1 a +1 (+1: le va mejor en el primer
     polo, abrir o cambiar), o null si no cuenta. Una diferencia de 20
     puntos de cada 100 ya es el máximo. */
  function rinde(rend, e) {
    const x = rend && rend.ejes && rend.ejes[e];
    return x && x.cuenta ? Math.max(-1, Math.min(1, x.d / RINDE_PLENO)) : null;
  }

  /* Hacia dónde apunta cada eje y cuánto pesa: el estilo, y lo que rinde. */
  function objetivos(perfil, rend) {
    const w = pesos(perfil);
    const out = {};
    for (const e of EJES) {
      const r = rinde(rend, e);
      const hay = !!(perfil && perfil[e]);
      if (!hay && r == null) continue;
      const t = hay ? tendencia(perfil[e]) : 0;
      out[e] = r == null ? { t, w: w[e] } : { t: (1 - PESO_RINDE) * t + PESO_RINDE * r, w: Math.max(w[e] || 0, PESO_MINIMO_RINDE) };
    }
    return out;
  }

  /* La distancia entre el estilo y una apertura: lo que se aleja en cada eje,
     pesado por lo seguro que es ese eje, más el castigo por la teoría de más. */
  function distancia(perfil, m, nivel, tope, rend) {
    const obj = objetivos(perfil, rend);
    let d = 0, total = 0;
    for (const [e, o] of Object.entries(obj)) {
      if (m.car[e] == null) continue;
      d += o.w * (o.t - m.car[e]) ** 2;
      total += o.w;
    }
    d = total ? d / total : 0;
    return d + CASTIGO_NIVEL * Math.max(0, nivel - tope);
  }

  const FRASE = {
    ataque: { mas: "se ataca al rey más que en la mayoría de las aperturas", menos: "se ataca menos al rey: es un juego de maniobras" },
    estructura: { mas: "el juego queda más abierto que en la mayoría", menos: "el centro queda más cerrado que en la mayoría" },
    cambios: { mas: "se cambian más piezas antes de la jugada 20", menos: "las piezas se quedan en el tablero más tiempo" },
    material: { mas: "se sale de la apertura con el material completo más que en la mayoría", menos: "se da material (casi siempre un peón) por la iniciativa más que en la mayoría" },
  };
  const GUSTA = {
    ataque: { mas: "te gusta atacar al rey", menos: "prefieres maniobrar" },
    estructura: { mas: "prefieres el juego abierto", menos: "prefieres el juego cerrado" },
    cambios: { mas: "te gusta cambiar piezas", menos: "prefieres mantener las piezas" },
    material: { mas: "prefieres quedarte con el material", menos: "te gusta dar material por la iniciativa" },
  };

  const RINDE_FRASE = {
    estructura: { mas: "cuando el juego queda abierto", menos: "cuando el juego queda cerrado", masAp: "lo deja más abierto", menosAp: "lo deja más cerrado" },
    cambios: { mas: "cuando se cambian muchas piezas", menos: "cuando las piezas se quedan en el tablero", masAp: "cambia más piezas", menosAp: "guarda más las piezas" },
  };
  const pctTxt = (x) => Math.round(100 * x) + " %";

  /* El porqué: los ejes que más pesan en los que el estilo y la apertura van
     para el mismo lado, con el dato de dónde sale. */
  function porque(perfil, m, linea, tope, rend) {
    const w = pesos(perfil);
    const frases = [];
    const ejes = EJES.filter((e) => perfil && perfil[e]).sort((a, b) => w[b] - w[a]);
    for (const e of ejes) {
      const t = tendencia(perfil[e]);
      if (Math.abs(t) < 0.2 || Math.abs(m.car[e]) < 0.2 || w[e] < 0.2) continue;
      const lado = m.car[e] > 0 ? "mas" : "menos";
      if ((t > 0) !== (m.car[e] > 0)) continue;
      frases.push("Encaja contigo: " + GUSTA[e][lado] + ", y en esta apertura " + FRASE[e][lado] + ".");
    }
    // Lo que le rinde, con sus números: solo si la apertura va para ese lado.
    for (const e of Object.keys(RINDE_FRASE)) {
      const r = rinde(rend, e);
      if (r == null || Math.abs(m.car[e]) < 0.2 || (r > 0) !== (m.car[e] > 0)) continue;
      const x = rend.ejes[e];
      const [mejor, peor] = r > 0 ? [x.alto, x.bajo] : [x.bajo, x.alto];
      frases.push(`En tus partidas te va mejor ${RINDE_FRASE[e][r > 0 ? "mas" : "menos"]}: ${pctTxt(mejor.puntos)} de los puntos en ${mejor.n} partidas, contra ${pctTxt(peor.puntos)} en ${peor.n}; y esta apertura ${RINDE_FRASE[e][m.car[e] > 0 ? "masAp" : "menosAp"]} que la mayoría.`);
    }
    if (!frases.length) frases.push("Es la que menos choca con tu estilo, aunque ningún eje la pide con fuerza.");
    const origen = m.base === "variante"
      ? `Medido en ${m.n} partidas de maestros que pasan por esta variante.`
      : `Medido en ${m.n} partidas de maestros de su familia (hasta ${m.base.length} medias jugadas): de la variante exacta hay pocas.`;
    frases.push(origen);
    if (linea.nivel > tope) frases.push("Pide más teoría de la que te conviene ahora: si la eliges, apréndela de a poco en Aperturas y celadas.");
    return frases;
  }

  function opcion(perfil, m, linea, tope, rend) {
    return {
      id: linea.id, nombre: linea.nombre, apertura: linea.apertura, jugadas: linea.jugadas.slice(),
      nivel: linea.nivel, porque: porque(perfil, m, linea, tope, rend),
      ajuste: Math.round(100 * Math.max(0, 1 - distancia(perfil, m, linea.nivel, tope, rend) / 4)),
    };
  }

  function recomendar(perfil, contexto) {
    const ctx = contexto || {};
    const tope = nivelQueConviene(ctx);
    const rend = ctx.rendimiento || null;
    const todas = lineas().filter((l) => l.tipo === "apertura");
    const out = {};
    for (const [g, def] of Object.entries(GRUPOS)) {
      const cand = todas.filter((l) => l.color === def.color && (!def.contra || l.jugadas[0] === def.contra))
        .map((l) => ({ l, m: medidaDe(l.id) }))
        .filter((x) => x.m && x.m.n && x.m.car)
        .map((x) => Object.assign(x, { d: distancia(perfil, x.m, x.l.nivel, tope, rend) }))
        .sort((a, b) => a.d - b.d || a.l.id.localeCompare(b.l.id));
      if (!cand.length) { out[g] = null; continue; }
      const mejor = cand[0];
      // La alternativa, de otra familia: dos variantes de la española no son dos opciones.
      const otra = cand.find((x) => x.l.apertura !== mejor.l.apertura) || cand[1] || null;
      const actualId = ctx.actual && ctx.actual[g];
      const actual = actualId ? cand.find((x) => x.l.id === actualId) : null;
      const mantener = !!(actual && actual.d <= mejor.d + MARGEN_MANTENER);
      out[g] = {
        titulo: def.titulo,
        principal: opcion(perfil, (mantener ? actual : mejor).m, (mantener ? actual : mejor).l, tope, rend),
        alternativa: (() => {
          const alt = mantener ? (mejor.l.id === actual.l.id ? otra : mejor) : otra;
          return alt ? opcion(perfil, alt.m, alt.l, tope, rend) : null;
        })(),
        mantener,
        actual: actual ? actual.l.id : null,
      };
    }
    return out;
  }

  const api = { MEDIDO, EJES, GRUPOS, MARGEN_MANTENER, PESO_RINDE, nivelQueConviene, rinde, objetivos, distancia, recomendar, medidaDe };
  if (typeof window !== "undefined") window.EstiloAperturas = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
