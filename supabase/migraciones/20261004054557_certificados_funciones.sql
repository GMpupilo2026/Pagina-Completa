-- Certificados de curso (2 de 3): las funciones.

-- Cuántas lecciones distintas de un curso marcó un alumno.
create or replace function interno.lecciones_hechas(p_alumno uuid, p_curso text)
returns integer
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select count(distinct tp.detail->>'leccion')::int
    from public.training_progress tp
   where tp.student_id = p_alumno
     and tp.activity = 'curso'
     and tp.detail->>'curso' = p_curso;
$$;

-- Dar el certificado. Solo un profesor del alumno o administración, y solo
-- con el curso completo. Devuelve el código (el mismo si ya lo tenía).
create or replace function public.emitir_certificado(p_alumno uuid, p_curso text)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_yo uuid := auth.uid();
  v_curso interno.curso_lecciones;
  v_hechas int;
  v_codigo text;
  v_alumno text;
  v_profe text;
  v_academia public.academias;
begin
  if not coalesce(public.soy_profesor_de(p_alumno) or public.soy_admin(), false) then
    raise exception 'Solo un profesor del alumno o administración puede dar un certificado.' using errcode = '42501';
  end if;
  select * into v_curso from interno.curso_lecciones where slug = p_curso;
  if not found then
    raise exception 'Ese curso no existe.' using errcode = '22023';
  end if;
  -- Ya lo tiene: el mismo código, sin un segundo certificado.
  select c.codigo into v_codigo from public.certificados c
   where c.student_id = p_alumno and c.curso = p_curso and c.anulado_at is null;
  if v_codigo is not null then return v_codigo; end if;

  v_hechas := interno.lecciones_hechas(p_alumno, p_curso);
  if v_hechas < v_curso.total then
    raise exception 'El curso no está completo: lleva % de % lecciones.', v_hechas, v_curso.total using errcode = '22023';
  end if;

  select nullif(trim(p.full_name), '') into v_alumno from public.profiles p where p.id = p_alumno;
  select nullif(trim(p.full_name), '') into v_profe from public.profiles p where p.id = v_yo;
  -- La academia del alumno; si es de varias, la que comparte con quien lo da.
  select a.* into v_academia
    from public.academias a
   where a.id in (select interno.academias_de(p_alumno))
   order by (a.id in (select interno.academias_de(v_yo))) desc, a.nombre
   limit 1;

  loop
    v_codigo := substr(md5(gen_random_uuid()::text), 1, 10);
    begin
      insert into public.certificados (codigo, student_id, curso, curso_titulo, lecciones, alumno_nombre,
                                       academia_id, academia_nombre, academia_logo_path, profesor_id, profesor_nombre)
      values (v_codigo, p_alumno, p_curso, v_curso.titulo, v_curso.total, coalesce(v_alumno, 'Alumno'),
              v_academia.id, v_academia.nombre, v_academia.logo_path, v_yo, coalesce(v_profe, 'Ajedrez Integral'));
      exit;
    exception when unique_violation then
      -- Choque de código: otro intento. Si fue el índice de «uno vigente»
      -- (dos clics a la vez), devolver el que quedó.
      select c.codigo into v_codigo from public.certificados c
       where c.student_id = p_alumno and c.curso = p_curso and c.anulado_at is null;
      if v_codigo is not null then return v_codigo; end if;
    end;
  end loop;
  return v_codigo;
end;
$$;

-- Anular uno dado por error. No se borra: deja de valer y lo dice.
create or replace function public.anular_certificado(p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_alumno uuid;
begin
  select c.student_id into v_alumno from public.certificados c
   where c.codigo = p_codigo and c.anulado_at is null;
  if v_alumno is null then
    raise exception 'No hay un certificado vigente con ese código.' using errcode = '22023';
  end if;
  if not coalesce(public.soy_profesor_de(v_alumno) or public.soy_admin(), false) then
    raise exception 'Solo un profesor del alumno o administración puede anularlo.' using errcode = '42501';
  end if;
  update public.certificados set anulado_at = now(), anulado_por = auth.uid()
   where codigo = p_codigo and anulado_at is null;
end;
$$;

-- Comprobarlo sin cuenta: con el código (10 caracteres al azar, no se
-- adivina), lo que dice el papel y nada más. Ni el id del alumno ni su correo.
create or replace function public.certificado_publico(p_codigo text)
returns table (
  alumno_nombre text, curso_titulo text, lecciones integer,
  academia_nombre text, academia_logo_path text, profesor_nombre text,
  emitido_at timestamptz, anulado boolean
)
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select c.alumno_nombre, c.curso_titulo, c.lecciones, c.academia_nombre, c.academia_logo_path,
         c.profesor_nombre, c.emitido_at, c.anulado_at is not null
    from public.certificados c
   where p_codigo ~ '^[0-9a-f]{10}$' and c.codigo = p_codigo;
$$;