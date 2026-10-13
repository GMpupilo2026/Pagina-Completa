# Guía para escribir el contenido de un año (grado)

Se arma un **Programa de Estudio de Ajedrez** por cada año escolar de Costa Rica
(1.° a 11.°), con la estructura de los programas del Ministerio de Educación
Pública (MEP), y un **planeamiento diario** con las 200 lecciones del curso
lectivo. El autor es **Oscar Angulo Cubero**, maestro de ajedrez costarricense.
Tú escribes el contenido de UN año en un archivo JSON; un script lo convierte en
dos documentos Word. No escribas Word ni Python: solo el JSON.

## Cómo tiene que sonar (muy importante)

El texto tiene que leerse como escrito por un docente costarricense con años de
aula, no por una máquina. Reglas duras:

- Español de Costa Rica. Tuteo cuando se le habla al estudiante («mueve tu
  torre»), NUNCA voseo («mové», «podés», «tenés» están prohibidos). En las
  indicaciones para el docente se usa la tercera persona o el infinitivo
  («La persona docente coloca…», «Colocar en la pizarra…»). Lenguaje inclusivo
  al estilo MEP: «la persona estudiante», «el estudiantado», «la persona docente».
  Vocabulario: pizarra, cuaderno, recreo, grupo, colegio/escuela, computadora,
  celular, «tablero mural» (el tablero grande colgado en la pizarra).
- PROHIBIDO: la raya larga «—» (usa coma, dos puntos o paréntesis), emojis,
  signos «¡» de entusiasmo de vendedor, frases de relleno («es importante
  destacar», «en este sentido», «cabe mencionar», «sin duda», «fascinante»,
  «emocionante viaje», «mundo del ajedrez», «potenciar», «de manera lúdica y
  significativa», «empoderar»), tríadas de adjetivos, y empezar varias
  actividades seguidas con la misma palabra.
- Concreto siempre: qué pieza, qué casillas, cuántos minutos, qué dice la
  persona docente, qué hace el estudiantado en parejas, qué se anota. Nada de
  «se realizan actividades para reforzar el tema». Si se juega un minijuego,
  di cómo se coloca y quién gana.
- Variar la redacción de un día a otro. Dos días seguidos sobre el mismo tema
  tienen que hacer cosas distintas (introducir, practicar, jugar, evaluar).
- Frases cortas y directas, como las de un planeamiento real.

## Ajedrez: nada inventado

- **No inventes posiciones con un resultado prometido** («mate en 2 con las
  blancas en…»). Para ejercicios concretos remite a la fuente: «Manual 5 de
  Russek, ejercicios 21 a 30», «Ajedrez en el aula 2, unidad 7», o a patrones
  con nombre que existen (mate del pasillo, mate de Légal, mate del pastor,
  mate de la escalera, posición de Lucena, posición de Philidor, regla del
  cuadrado, oposición, maniobra de Réti, sacrificio griego en h7).
- Sí puedes describir montajes de minijuego sin resultado prometido («cada
  bando con sus 8 peones en la fila de siempre; gana quien corone primero»;
  «torre blanca en a1 contra cuatro peones negros en la séptima fila»).
- Las partidas que se citen deben ser reales: usa las de la lista de fuentes
  (Manual 2, 3 y 4) con jugadores, lugar y año tal como aparecen.
- Las reglas, según las Leyes del Ajedrez de la FIDE.

## Fuentes (los materiales de referencia del autor)

Ver `fuentes.md` (resumen de los 8 manuales). Cítalas en «materiales» o en el
texto cuando corresponda, por su nombre corto:
- «Ajedrez en el aula 1», «Ajedrez en el aula 2», «Ajedrez en el aula 3»
  (Anguix, Ballester, Bueno y Gascó).
- «Manual 1» a «Manual 5» (Guil Russek): 1 Reglas del juego, 2 Principios
  básicos, 3 Elementos técnicos, 4 Partidas selectas, 5 Ejercicios tácticos.

## Estructura MEP que hay que respetar

- Calendario: 40 semanas, 5 días por semana = **200 lecciones** de 40 minutos.
  I semestre: semanas 1 a 20 (días 1 a 100). II semestre: semanas 21 a 40
  (días 101 a 200). Día d está en la semana ceil(d/5).
- **6 unidades** por año: unidades 1 a 3 en el I semestre, 4 a 6 en el II.
  Cada unidad ocupa un rango de días continuo; los rangos cubren 1..200 sin
  huecos.
- Cada lección sigue los **cuatro momentos de la mediación pedagógica**:
  Focalización (5 min), Exploración (15 min), Contrastación (10 min) y
  Aplicación (10 min).
  - Focalización: despertar interés y recuperar lo previo (pregunta, reto,
    historia corta, adivinanza).
  - Exploración: el estudiantado prueba, manipula, juega, descubre.
  - Contrastación: se confronta lo hallado con la explicación de la persona
    docente, la regla o la fuente; se corrige y se nombra el concepto.
  - Aplicación: se usa lo aprendido en una tarea nueva, partida, minijuego o
    ejercicio; cierre con una pregunta o salida.
- Evaluación según el Reglamento de Evaluación de los Aprendizajes:
  diagnóstica (al inicio), formativa (casi todos los días) y sumativa
  (trabajo cotidiano, tareas, prueba de ejecución, proyecto en III ciclo y
  Diversificada). Instrumentos: lista de cotejo, escala de desempeño (rúbrica
  con niveles Inicial, Intermedio y Avanzado), registro anecdótico, portafolio,
  autoevaluación, coevaluación.
- Días fijos:
  - Días 1 a 3: evaluación diagnóstica (con juegos, no con examen frío).
  - Al cerrar cada unidad, un día de evaluación sumativa de la unidad
    (trabajo cotidiano con escala de desempeño o prueba de ejecución).
  - Días 97 a 100: prueba de ejecución del I semestre, devolución y
    actividad de cierre. Días 196 a 200: prueba de ejecución final,
    presentación del proyecto, festival o torneo de cierre y autoevaluación.
  - Unos 8 a 10 días por año marcados `"flex": true` (refuerzo o
    ampliación): son los que la persona docente puede saltarse si el
    calendario real trae menos días (feriados, actos cívicos, el calendario
    2027 que se está reduciendo). Repártelos (uno o dos por unidad), nunca en
    días de evaluación sumativa.
  - Tareas: unas 12 a 20 en el año (campo "tarea"), cortas y posibles para
    la edad; en I ciclo pueden ser «jugar con alguien de la familia y contar
    quién ganó».
- Proyecto: en I y II ciclos, un **proyecto de aula** por semestre sencillo;
  en III ciclo y Diversificada, un **proyecto** por semestre con avances
  fechados (días concretos) que vale nota.
- Ejes transversales del MEP (usar sus nombres exactos): «Cultura ambiental
  para el desarrollo sostenible», «Educación integral de la sexualidad»,
  «Educación para la salud», «Vivencia de los derechos humanos para la
  democracia y la paz». Valores: respeto, responsabilidad, honestidad,
  solidaridad, perseverancia, tolerancia, juego limpio.
- Habilidades del marco de la Transformación Curricular del MEP («Educar para
  una nueva ciudadanía»), usar estos nombres exactos: Pensamiento sistémico,
  Pensamiento crítico, Aprender a aprender, Resolución de problemas,
  Creatividad e innovación, Ciudadanía global y local, Responsabilidad
  personal y social, Estilos de vida saludables, Vida y carrera, Colaboración,
  Comunicación, Apropiación de tecnologías digitales, Manejo de la información.

## El JSON (un archivo por año, `grado-N.json`)

```json
{
  "grado": 1,
  "nombre": "Primer año",
  "ciclo": "I Ciclo de la Educación General Básica",
  "edad": "6 a 7 años",
  "presentacion": ["párrafo", "párrafo"],          // 2 o 3 párrafos sobre este año: qué se espera, de dónde viene la persona estudiante y adónde va
  "perfil_salida": ["Al finalizar primer año, la persona estudiante ...", "..."],   // 6 a 9
  "conocimientos_previos": ["..."],                // 3 a 6: qué se supone que trae
  "unidades": [
    {
      "n": 1,
      "titulo": "El tablero y sus caminos",
      "dias": [1, 33],                            // rango inclusivo
      "proposito": "un párrafo",
      "eje": "Vivencia de los derechos humanos para la democracia y la paz",
      "valores": ["respeto", "responsabilidad"],
      "aprendizajes": [                           // 3 o 4 por unidad
        {
          "ae": "Reconocer el tablero de ajedrez como un espacio de 64 casillas organizado en filas, columnas y diagonales.",
          "habilidad": "Pensamiento sistémico",
          "indicador_habilidad": "Identifica las partes de un sistema (el tablero) y cómo se relacionan.",
          "contenidos": {
            "conceptuales": ["..."],
            "procedimentales": ["..."],
            "actitudinales": ["..."]
          },
          "estrategias": ["2 a 4 estrategias de mediación concretas"],
          "niveles": {
            "inicial": "Menciona ...",
            "intermedio": "Describe ...",
            "avanzado": "Aplica ..."
          }
        }
      ]
    }
  ],
  "proyectos": [
    {"semestre": 1, "titulo": "...", "descripcion": "párrafo", "producto": "...", "avances": [{"dia": 40, "que": "..."}], "criterios": ["...", "..."]},
    {"semestre": 2, "...": "..."}
  ],
  "instrumentos": [                              // 3 instrumentos del año, listos para usar
    {"nombre": "Escala de desempeño: prueba de ejecución del I semestre",
     "tipo": "Escala de desempeño",
     "criterios": [{"criterio": "...", "inicial": "...", "intermedio": "...", "avanzado": "..."}]},   // 4 a 6 criterios
    {"nombre": "Lista de cotejo: ...", "tipo": "Lista de cotejo", "items": ["...", "..."]}           // 8 a 12 ítems
  ],
  "dias": [
    {
      "d": 1,
      "u": 1,
      "tema": "Bienvenida y diagnóstico: ¿qué sabemos del ajedrez?",
      "ae": "1.1",                                 // unidad.número de aprendizaje esperado al que apunta
      "objetivo": "una frase",
      "foc": "Focalización, 1 a 3 frases",
      "exp": "Exploración, 2 a 4 frases",
      "con": "Contrastación, 1 a 3 frases",
      "apl": "Aplicación, 1 a 3 frases",
      "eval": {"tipo": "Diagnóstica|Formativa|Sumativa", "como": "qué se observa y con qué instrumento"},
      "mat": "materiales, corto",
      "tarea": "opcional, solo si hay tarea ese día",
      "flex": true                                 // opcional, solo en días de refuerzo
    }
  ]
}
```

Largo esperado por día: entre 90 y 150 palabras sumando todos los campos.
Exactamente 200 días, d = 1..200 en orden, cada uno con su unidad correcta.
Valida el JSON al terminar con python (`json.load`) y comprueba: 200 días,
d consecutivos, `u` coincide con el rango de su unidad, `ae` existe en la
unidad, tipos de evaluación válidos, días 1-3 diagnósticos, sin «—», sin
voseo (busca «podés», «tenés», «mové», «jugá», «hacé», «sabés», «querés»,
«vos»).
