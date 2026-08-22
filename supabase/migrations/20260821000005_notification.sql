-- =========================================================================
-- Fase 1 · Migración 5/6
-- Service 4: Notification & Status Broadcast.
-- =========================================================================

create type notification.canal as enum ('webhook', 'email', 'sms', 'push');
create type notification.estado_evento as enum ('pendiente', 'enviado', 'fallido');

create table notification.suscripciones (
  id uuid primary key default gen_random_uuid(),
  organismo text not null check (organismo in ('Cruz Roja', 'Bomberos', 'Defensa Civil', 'UNGRD')),
  ciudad text references core.ciudades (nombre),
  canal notification.canal not null,
  destino text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table notification.suscripciones is
  'Destinos de notificación por organismo. ciudad = null significa suscripción '
  'nacional (recibe eventos agregados de las 4 ciudades).';

create index suscripciones_ciudad_idx on notification.suscripciones (ciudad);

create table notification.eventos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid references intake.solicitudes (id),
  tipo_evento text not null,
  payload jsonb not null default '{}'::jsonb,
  estado notification.estado_evento not null default 'pendiente',
  intentos int not null default 0,
  enviado_en timestamptz,
  created_at timestamptz not null default now()
);

comment on table notification.eventos is 'Bitácora de eventos de notificación (webhooks/broadcast) por solicitud.';

create index eventos_solicitud_idx on notification.eventos (solicitud_id);
create index eventos_estado_idx on notification.eventos (estado);
