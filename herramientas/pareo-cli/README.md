# Pareo Integral — command-line version

Pareo Integral is a free chess tournament pairing program (FIDE Dutch System)
published by Ajedrez Integral at <https://ajedrez-integral.com/pareo.html>.
This package is its command-line version, meant for batch testing (for
example, by FIDE testers). It runs **the same engine and the same code** as the
web page, so both always give the same answers.

*La versión en español está en `LEEME.md`.*

## Requirements

[Node.js](https://nodejs.org) 18 or later. Nothing else: the pairing engine is
included as WebAssembly.

## Usage

The syntax for pairing, checking and generating is the one of JaVaFo and
bbpPairings.

```
node pareo.js --dutch TOURNAMENT.trf -p [OUTPUT]
```
Pairs the next round. The TRF must include the total number of rounds
(`142` or `XXR`) and may mark who does not play the next round (`0000 - H`,
`Z` or `F` in its column). Output: the number of boards, then one line per
board, `white black` by pairing number (`0` = pairing-allocated bye), in board
order.

```
node pareo.js --dutch TOURNAMENT.trf -c [-l [CHECKLIST]]
```
Free Pairing Checker: re-pairs every round with the Dutch System and lists
every difference with the pairings in the file. No differences means every
round matches.

```
node pareo.js --dutch [CONFIG] -g -o OUTPUT.trf [-s SEED] [-l [CHECKLIST]]
```
Random Tournament Generator: builds a whole tournament with random results,
paired with the Dutch System. The configuration file is the one of JaVaFo /
bbpPairings. Note: the same seed gives a different tournament than the native
bbpPairings executable, because the random number generator of the C++
library differs; the pairings themselves are identical.

```
node pareo.js standings TOURNAMENT.trf [--tiebreaks BH-C1,BH,SB] [--csv] [--lang en|es]
```
Standings with the tie-breaks of FIDE regulation C.07 (2026 version), in the
order given. `node pareo.js --tiebreak-codes` lists the 26 codes.

`node pareo.js --version` prints the versions of the program, the engine and
the regulations it follows.

Exit codes are those of bbpPairings: 0 ok, 1 no valid pairing exists,
2 unexpected error, 3 invalid request or file, 4 size limit exceeded,
5 file error.

## What is inside

- `pareo.js` — the entry point.
- `js/pareo/` — the tournament model and TRF reader/writer (`torneo.js`), the
  tie-breaks (`desempates.js`) and the command line (`cli.js`).
- `js/vendor/bbppairings/` — the pairing engine.

## Credits and licences

- Pairings: **bbpPairings** by Jeremy Bierema, Apache License 2.0
  (`js/vendor/bbppairings/`), compiled to WebAssembly without changes to its
  code. Only its Dutch System is used.
- Tie-breaks: translated from **chesspairing** by Gert Nutterts, Apache
  License 2.0 (<https://github.com/gnutterts/chesspairing>), and checked against
  it.
- Pareo Integral © 2026 Ajedrez Integral.

Pareo Integral is **not yet endorsed by FIDE**.
