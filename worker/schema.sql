CREATE TABLE IF NOT EXISTS inscripciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido1 TEXT NOT NULL,
  apellido2 TEXT NOT NULL,
  correo TEXT NOT NULL,
  contacto TEXT NOT NULL,
  tipo_centro TEXT NOT NULL,
  centro TEXT NOT NULL,
  edad INTEGER NOT NULL,
  grado TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inscripciones_correo ON inscripciones(correo);
CREATE INDEX IF NOT EXISTS idx_inscripciones_centro ON inscripciones(centro);
