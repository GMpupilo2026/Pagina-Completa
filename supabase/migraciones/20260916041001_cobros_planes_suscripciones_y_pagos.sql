-- ============================================================================
-- Cobros de la Academia: planes, suscripciones, cobros emitidos y pagos.
--
-- Decisión de fondo: el estado "pagado" y el estado "vencido" NO se guardan.
-- Se calculan. Lo único que se escribe es lo que de verdad pasó: se emitió un
-- cobro, entró un pago. Si "pagado" fuera una columna, habría que mantenerla al
-- día con un trigger y podría contradecir a la suma de los pagos — que es
-- justamente el fallo callado que ya tuvimos con el contador de invitaciones.
-- La vista cobros_vista hace la cuenta.
-- ============================================================================

-- ---------------------------------------------------------------- planes
create table if not exists public.planes_cobro (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(btrim(nombre)) between 1 and 120),
  descripcion   text check (length(descripcion) <= 500),
  monto         numeric(12,2) not null check (monto >= 0),
  moneda        text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  periodicidad  text not null default 'mensual'
                check (periodicidad in ('mensual', 'trimestral', 'semestral', 'anual')),
  activo        boolean not null default true,
  creado_por    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
comment on table public.planes_cobro is
  'Cuánto y cada cuánto se cobra (mensualidad, curso suelto, etc.). Lo maneja quien coordina o administra.';

-- ---------------------------------------------------- suscripción de un alumno
create table if not exists public.suscripciones (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  plan_id        uuid not null references public.planes_cobro(id) on delete restrict,
  inicio         date not null default current_date,
  fin            date,
  -- Día del mes en que vence. Hasta 28 para que exista en todos los meses.
  dia_cobro      smallint not null default 5 check (dia_cobro between 1 and 28),
  descuento_pct  numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  nota           text check (length(nota) <= 500),
  activa         boolean not null default true,
  creado_por     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
comment on table public.suscripciones is
  'Qué plan paga cada alumno, desde cuándo y con qué descuento. De acá salen los cobros de cada periodo.';

-- Un alumno no puede estar suscrito dos veces al mismo plan a la vez.
create unique index if not exists suscripciones_una_activa_por_plan
  on public.suscripciones (student_id, plan_id) where activa;

-- ---------------------------------------------------------------- cobros
create sequence if not exists public.cobros_consecutivo_seq;

create table if not exists public.cobros (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles(id) on delete cascade,
  suscripcion_id  uuid references public.suscripciones(id) on delete set null,
  consecutivo     text not null unique
                  default 'AI-' || to_char(now(), 'YYYY') || '-'
                          || lpad(nextval('public.cobros_consecutivo_seq')::text, 6, '0'),
  concepto        text not null check (length(btrim(concepto)) between 1 and 200),
  periodo_inicio  date not null,
  periodo_fin     date not null,
  monto           numeric(12,2) not null check (monto >= 0),
  moneda          text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  vence           date not null,
  -- Solo lo que de verdad es una decisión: emitido o anulado.
  -- "pagado" y "vencido" los calcula cobros_vista.
  estado          text not null default 'emitido' check (estado in ('emitido', 'anulado')),
  anulado_motivo  text check (length(anulado_motivo) <= 300),
  -- Campos que pide la factura electrónica de Hacienda, para no migrar después.
  -- Hoy no se emite nada: el comprobante es interno (ver CLAUDE.md).
  hacienda_clave        text,
  hacienda_consecutivo  text,
  hacienda_estado       text check (hacienda_estado in ('pendiente', 'aceptado', 'rechazado')),
  creado_por      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (periodo_fin >= periodo_inicio)
);
comment on table public.cobros is
  'Un cobro emitido a un alumno por un periodo. El consecutivo es del recibo interno; los campos hacienda_* están preparados por si algún día se emite factura electrónica.';

-- Lo que hace que generar_cobros() se pueda correr dos veces sin duplicar.
create unique index if not exists cobros_un_periodo_por_suscripcion
  on public.cobros (suscripcion_id, periodo_inicio) where suscripcion_id is not null;
create index if not exists cobros_por_alumno on public.cobros (student_id, periodo_inicio desc);
create index if not exists cobros_por_vencimiento on public.cobros (vence) where estado = 'emitido';

-- ---------------------------------------------------------------- pagos
create table if not exists public.pagos (
  id              uuid primary key default gen_random_uuid(),
  cobro_id        uuid not null references public.cobros(id) on delete cascade,
  monto           numeric(12,2) not null check (monto > 0),
  fecha           date not null default current_date,
  metodo          text not null
                  check (metodo in ('sinpe', 'transferencia', 'efectivo', 'tarjeta', 'otro')),
  referencia      text check (length(referencia) <= 120),
  nota            text check (length(nota) <= 300),
  registrado_por  uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table public.pagos is
  'Cada abono que entró contra un cobro. Se permiten pagos parciales: el saldo lo saca cobros_vista.';
create index if not exists pagos_por_cobro on public.pagos (cobro_id);

-- ------------------------------------------------- datos de facturación
-- Aparte de profiles a propósito: profiles tiene el trigger de identidad y
-- estos datos los puede corregir quien coordina sin pelearse con él.
create table if not exists public.datos_facturacion (
  student_id           uuid primary key references public.profiles(id) on delete cascade,
  cedula               text check (length(cedula) <= 30),
  nombre               text check (length(nombre) <= 200),
  correo               text check (length(correo) <= 200),
  telefono             text check (length(telefono) <= 40),
  actividad_economica  text check (length(actividad_economica) <= 20),
  actualizado_at       timestamptz not null default now()
);
comment on table public.datos_facturacion is
  'A nombre de quién se emite el comprobante de cada alumno. Preparado para la factura electrónica; hoy solo se imprime en el recibo.';

-- ------------------------------------------------- avisos ya mandados
create table if not exists public.avisos_cobro (
  id          uuid primary key default gen_random_uuid(),
  cobro_id    uuid not null references public.cobros(id) on delete cascade,
  tipo        text not null check (tipo in ('proximo', 'vencido', 'moroso')),
  correo      text not null,
  enviado_at  timestamptz not null default now()
);
comment on table public.avisos_cobro is
  'Qué aviso se le mandó a qué correo por cada cobro. El índice único es lo que impide mandar dos veces el mismo.';
create unique index if not exists avisos_cobro_una_vez
  on public.avisos_cobro (cobro_id, tipo, correo);
