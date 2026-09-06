# Worker de Inscripciones — Ajedrez Integral

## Configuración rápida

1. `cd worker && npm install`
2. `npm run db:create` → copia el database_id a wrangler.toml
3. `npm run db:init:remote` → crea la tabla en producción
4. Cambia ADMIN_KEY en wrangler.toml
5. `npm run deploy`
6. Reemplaza TU-SUBDOMINIO en inscripcion.html con tu URL del Worker

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/inscripciones` | Registra una inscripción |
| GET | `/api/inscripciones` | Lista inscripciones (requiere `Authorization: Bearer <ADMIN_KEY>`) |
