-- ===== Aviso de abandono: los datos para entrenar el modelo =====
--
-- Arma una fila por alumno y por «corte» (cada lunes): cómo venía las cuatro
-- semanas ANTES del corte y si se calló las tres semanas DESPUÉS. El modelo
-- aprende a adivinar lo segundo mirando solo lo primero, que es lo que va a
-- tener a mano el día que avise.
--
-- Sale ANÓNIMO a propósito: ni id, ni nombre, ni correo, ni fechas. `alumno`
-- es un número que se sortea de nuevo en cada exportación (sirve solo para no
-- mezclar a la misma persona entre entrenar y probar) y `corte` cuenta semanas
-- desde la primera. Aun así son datos de alumnos, muchos menores de edad: el
-- archivo va a herramientas/ia/datos/ (ignorado por git) o fuera del
-- repositorio, nunca a un commit.
--
-- Antes del 11/9/2026 la base solo guardaba la asistencia a clase (los
-- ejercicios y las páginas vistas empiezan ahí): en los primeros cortes
-- «se calló» quiere decir «no vino a clase». El cuaderno lo tiene en cuenta.
--
-- Quedan afuera las cuentas temporales (se cierran solas en una fecha: callarse
-- ahí no es abandonar), quien no hizo nada en las cuatro semanas antes del
-- corte (no se puede abandonar lo que no se empezó) y quien venía a clase con
-- un profe que después dejó de darla (abajo, al final).
--
-- Cómo se corre: en el editor SQL de Supabase, «Download CSV», y guardarlo como
-- herramientas/ia/datos/abandono.csv. El cuaderno abandono.ipynb lo lee de ahí.

with
sal as (select gen_random_uuid()::text s),   -- el sorteo de `alumno`, distinto cada vez
act as (                       -- todo lo que cuenta como «estuvo»…
  select student_id, joined_at t, 'clase' tipo from class_attendance
  union all select student_id, joined_at, 'pagina' from platform_activity_log
  union all select student_id, created_at, 'ejercicio' from training_progress
),
dias as (                      -- …juntado por día de Costa Rica: así cada
  select student_id,           -- corte mira unas pocas filas y no miles
         (t at time zone 'America/Costa_Rica')::date dia,
         count(*) filter (where tipo = 'clase') clases,
         count(*) filter (where tipo = 'ejercicio') ejercicios
  from act group by 1, 2
),
cortes as (                    -- cada lunes con 4 semanas antes y 3 después
  select c::date corte, row_number() over (order by c) n
  from generate_series(
    date_trunc('week', (select min(dia) from dias)) + interval '4 weeks',
    (now() at time zone 'America/Costa_Rica')::date - 21,
    interval '1 week') c
),
alumnos as (
  select p.id, p.elo,
         exists (select 1 from interno.profesores_de(p.id)) con_profe
  from profiles p
  where p.role = 'alumno'
    and not exists (select 1 from cuentas_temporales ct where ct.persona_id = p.id)
),
sus_profes as (
  select a.id, pr.profe from alumnos a cross join lateral interno.profesores_de(a.id) pr(profe)
),
dias_con_clase as (            -- los días que cada profe dio clase
  select distinct created_by profe, (started_at at time zone 'America/Costa_Rica')::date dia
  from class_sessions where not coalesce(para_ausentes, false)
),
filas as (
  select a.id, c.corte, c.n, a.elo, a.con_profe,
    -- lo de antes del corte
    count(d.dia) filter (where d.dia >= c.corte - 28 and d.dia < c.corte) dias_activos_28,
    count(d.dia) filter (where d.dia >= c.corte - 7 and d.dia < c.corte) dias_activos_7,
    c.corte - max(d.dia) filter (where d.dia < c.corte) dias_sin_venir,
    c.corte - min(d.dia) filter (where d.dia < c.corte) dias_desde_la_primera,
    coalesce(sum(d.ejercicios) filter (where d.dia >= c.corte - 28 and d.dia < c.corte), 0) ejercicios_28,
    coalesce(sum(d.ejercicios) filter (where d.dia >= c.corte - 7 and d.dia < c.corte), 0) ejercicios_7,
    coalesce(sum(d.clases) filter (where d.dia >= c.corte - 28 and d.dia < c.corte), 0) clases_28,
    -- lo de después: ¿se calló las tres semanas siguientes?
    count(d.dia) filter (where d.dia >= c.corte and d.dia < c.corte + 21) = 0 se_callo
  from alumnos a
  cross join cortes c
  left join dias d on d.student_id = a.id and d.dia < c.corte + 21
  group by a.id, c.corte, c.n, a.elo, a.con_profe
)
select
  dense_rank() over (order by md5(f.id::text || (select s from sal))) alumno,
  f.n corte,
  f.dias_activos_28, f.dias_activos_7, f.dias_sin_venir, f.dias_desde_la_primera,
  f.ejercicios_28, f.ejercicios_7, f.clases_28,
  (select coalesce(round(avg(ca.minutos_tarde)), 0) from class_attendance ca
     where ca.student_id = f.id
       and (ca.joined_at at time zone 'America/Costa_Rica')::date >= f.corte - 28
       and (ca.joined_at at time zone 'America/Costa_Rica')::date < f.corte) minutos_tarde_prom,
  (select count(*) from tareas ta where ta.alumno_id = f.id
     and (ta.created_at at time zone 'America/Costa_Rica')::date >= f.corte - 28
     and (ta.created_at at time zone 'America/Costa_Rica')::date < f.corte) tareas_28,
  (select count(*) from cobros co             -- vencidos y sin pagar del todo al corte
     where co.student_id = f.id and co.estado <> 'anulado' and co.vence < f.corte
       and co.monto > (select coalesce(sum(pg.monto), 0) from pagos pg
                         where pg.cobro_id = co.id and pg.fecha < f.corte)) cobros_atrasados,
  f.elo, f.con_profe,
  f.se_callo
from filas f
where f.dias_activos_28 > 0
  -- Si venía a clase, solo cuenta si su profe siguió dando clases: cuando
  -- un grupo entero para (terminó el curso, vacaciones), callarse no es
  -- abandonar. Pasó en octubre de 2026 con dos grupos completos.
  and (f.clases_28 = 0 or exists (
        select 1 from sus_profes sp join dias_con_clase dc on dc.profe = sp.profe
        where sp.id = f.id and dc.dia >= f.corte and dc.dia < f.corte + 21))
order by alumno, corte;
