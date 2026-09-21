-- Los datos de la Academia que hoy están escritos a mano dentro del código.
--
-- El primero es el teléfono de consultas: el número que las familias ven al
-- pie de cada correo que les mandamos —el informe de la casa, el informe de
-- un examen, el aviso de cobro—. Vivía escrito en cuatro archivos distintos,
-- así que cambiarlo era una tanda de ediciones y un despliegue, y quien
-- coordina la Academia —que es quien atiende esas consultas— no tenía forma
-- de tocarlo.
--
-- Es clave/valor y no una columna por cosa a propósito: lo que viene después
-- (una dirección, un horario de atención) entra sin migrar la tabla.
create table if not exists public.ajustes_academia (
  clave           text primary key,
  valor           text,
  actualizado_por uuid references public.profiles(id),
  actualizado_at  timestamptz not null default now(),
  constraint ajustes_academia_valor_corto check (valor is null or length(valor) <= 300)
);

alter table public.ajustes_academia enable row level security;

-- Lo lee cualquiera con sesión: es lo que la página le enseña al alumno
-- cuando le dice a dónde escribir. Escribirlo es de quien coordina.
create policy ajustes_academia_select on public.ajustes_academia for select
  using (auth.uid() is not null);

create policy ajustes_academia_coordinacion on public.ajustes_academia for all
  using (public.soy_coordinador()) with check (public.soy_coordinador());

revoke all on public.ajustes_academia from anon;

create or replace function public.proteger_ajustes_academia()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  new.valor := nullif(btrim(coalesce(new.valor, '')), '');
  new.actualizado_at  := now();
  new.actualizado_por := auth.uid();
  if tg_op = 'UPDATE' then new.clave := old.clave; end if;
  return new;
end;
$$;

revoke execute on function public.proteger_ajustes_academia() from public;

drop trigger if exists ajustes_academia_protegido on public.ajustes_academia;
create trigger ajustes_academia_protegido
  before insert or update on public.ajustes_academia
  for each row execute function public.proteger_ajustes_academia();

-- Se siembra con el número que hoy está escrito en el código. Nacer vacía
-- dejaría los correos de mañana sin ningún número al que escribir, que es
-- justo lo contrario de lo que esto viene a arreglar.
insert into public.ajustes_academia (clave, valor)
values ('whatsapp_consultas', '+506 8309-2291')
on conflict (clave) do nothing;