#!/usr/bin/env bash
# Compila bbpPairings a WebAssembly para Pareo Integral (pareo.html).
#
# bbpPairings (Jeremy Bierema, licencia Apache 2.0) es el motor del Sistema
# Holandés de FIDE que usan programas avalados por FIDE. Pareo Integral no
# reescribe el Holandés: le pasa el torneo en TRF y lee los emparejamientos.
# Ver «Pareo Integral» en docs/decisiones/juegos-y-torneos.md.
#
# Lo que deja en js/vendor/bbppairings/ NO se edita a mano: se vuelve a correr
# este script. El commit está fijado abajo; cambiarlo es actualizar el motor, y
# después hay que correr `node herramientas/verificar-todo.js pareo`.
#
# Necesita Emscripten (em++ en el PATH; ver https://emscripten.org). En el CI
# no se compila: se usa lo que está commiteado, y verificar-pareo.js comprueba
# que dé las mismas respuestas que las pruebas del propio bbpPairings.
#
#   bash herramientas/pareo-motor-compilar.sh [carpeta-con-bbpPairings]
set -euo pipefail

COMMIT=8f9e3c5ffdc4d7a08a33d31c6fb49b4e7acef4d5
REPO=https://github.com/BieremaBoyzProgramming/bbpPairings.git
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="$RAIZ/js/vendor/bbppairings"

command -v em++ >/dev/null || { echo "Falta em++ (Emscripten) en el PATH." >&2; exit 1; }

FUENTE="${1:-}"
if [ -z "$FUENTE" ]; then
  FUENTE="$(mktemp -d)/bbpPairings"
  git clone --quiet "$REPO" "$FUENTE"
fi
git -C "$FUENTE" checkout --quiet "$COMMIT"

OBJ="$(mktemp -d)"
# Se compila entero. Burstein queda adentro porque -DOMIT_BURSTEIN no compila en
# este commit (trf.cpp lo nombra igual), pero la página nunca lo pide: FIDE no
# avaló esa parte de bbpPairings. El comprobador (-c) y el generador de torneos al azar (-g) SÍ van: son los dos
# servicios públicos que FIDE pide para avalar un programa.
FLAGS=(-std=c++20 -O3 -DNDEBUG -Wno-deprecated-declarations -fwasm-exceptions
       "-DVERSION_INFO=\"bbpPairings ${COMMIT:0:7}\"" -I"$FUENTE/src")
OBJETOS=()
while IFS= read -r cpp; do
  o="$OBJ/$(echo "${cpp#$FUENTE/src/}" | tr '/' '_').o"
  em++ "${FLAGS[@]}" -c "$cpp" -o "$o"
  OBJETOS+=("$o")
done < <(find "$FUENTE/src" -name '*.cpp' | sort)

mkdir -p "$DESTINO"
# Una instancia nueva por pedido (MODULARIZE + callMain): main() lee y escribe
# archivos, y así cada emparejamiento arranca de cero, sin restos del anterior.
em++ "${OBJETOS[@]}" -O3 -fwasm-exceptions \
  -sMODULARIZE=1 -sEXPORT_NAME=crearBbpPairings \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sFORCE_FILESYSTEM=1 \
  -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker,node \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS \
  -o "$DESTINO/bbppairings.js"

cp "$FUENTE/LICENSE.txt" "$DESTINO/LICENSE.txt"
cp "$FUENTE/Apache-2.0.txt" "$DESTINO/Apache-2.0.txt"
cat > "$DESTINO/LEEME.txt" <<EOF
bbpPairings, compilado a WebAssembly para Pareo Integral (ajedrez-integral.com).

Fuente:   $REPO
Commit:   $COMMIT
Licencia: Apache 2.0 (Apache-2.0.txt), Copyright 2016-2026 Jeremy Bierema.
Cambios:  ninguno al código. Pareo Integral usa solo el Sistema Holandés (--dutch).
Se arma con herramientas/pareo-motor-compilar.sh.
EOF
rm -rf "$OBJ"
ls -la "$DESTINO"
