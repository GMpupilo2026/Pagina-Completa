-- Campo "usuario" autogenerado (PrimerNombre_PrimerApellido_LetraDelSegundoApellido,
-- ej. "Oscar_Angulo_C"). Lo rellena smart-function en cada inserción; se guarda ya
-- sin tildes (ver quitar_tildes más abajo) para que sirva tal cual como usuario/handle.
alter table public.inscripciones add column if not exists usuario text;

-- Función auxiliar para quitar tildes/diéresis de texto en español. Se usa tanto
-- para construir "usuario" como en la vista de exportación de más abajo.
create or replace function public.quitar_tildes(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    input,
    'ÁÉÍÓÚÑÜáéíóúñü',
    'AEIOUNUaeiounu'
  );
$$;

revoke all on function public.quitar_tildes(text) from public;
grant execute on function public.quitar_tildes(text) to postgres, service_role;

-- Vista de solo lectura para exportar las respuestas del formulario a CSV sin
-- tildes (el nombre y apellidos reales, con sus tildes correctas, se siguen
-- guardando tal cual en public.inscripciones — esta vista es solo para exportar).
create or replace view public.inscripciones_export
with (security_invoker = true)
as
select
  id,
  cedula,
  public.quitar_tildes(nombre) as nombre,
  public.quitar_tildes(apellido1) as apellido1,
  public.quitar_tildes(apellido2) as apellido2,
  usuario,
  fecha_nacimiento,
  edad,
  genero,
  contacto,
  correo,
  public.quitar_tildes(tipo_centro) as tipo_centro,
  public.quitar_tildes(provincia) as provincia,
  public.quitar_tildes(canton) as canton,
  public.quitar_tildes(centro) as centro,
  public.quitar_tildes(direccion_regional) as direccion_regional,
  grado,
  creado_en,
  circuito,
  public.quitar_tildes(zona) as zona,
  public.quitar_tildes(modalidad) as modalidad,
  acepto_datos
from public.inscripciones;
