-- Permite al profesor mostrar en la clase en vivo una lección de cualquier
-- curso (como si la estuviera dando ahí mismo), sincronizada igual que el
-- resto de game_state. null en los dos = no se está mostrando ninguna.
-- El contenido en sí NO se guarda acá (sería duplicarlo): cada cliente
-- (profesor y alumnos) lo pide directo a cursos/protegido/<curso>.html
-- cuando ve que cambiaron estas columnas.
alter table public.game_state
  add column shown_curso text,
  add column shown_leccion integer check (shown_leccion is null or shown_leccion >= 1);
