# Migraciones escritas que todavía NO están en la base

`supabase/migraciones/` guarda solo lo aplicado, tal cual se aplicó (es el
punto de restauración: ver `RESTAURAR.md`). Lo que está acá ya lo usa el sitio
pero falta aplicarlo:

- `practica_limite_de_intentos.sql`: `practice_sessions.max_intentos` y el
  trigger que hace cumplir el límite. Sin ella, elegir un límite de intentos
  al lanzar la práctica da error (sin límite funciona como siempre).
- `clase_dos_alumnos_juegan.sql`: `game_state.rival_id`, la política y el
  trigger. Sin ella, poner a un alumno «Contra: …» da error.

Al aplicar una: se mueve a `supabase/migraciones/` con la versión que le dio
la base (`<versión>_<nombre>.sql`), se vuelve a armar
`supabase/esquema/inventario-academia.txt` y se corre
`node herramientas/verificar-punto-restauracion.js`.
