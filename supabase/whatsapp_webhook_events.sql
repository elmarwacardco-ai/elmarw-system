-- Apply in Supabase SQL Editor before enabling this webhook in Production.
-- Stores verified raw webhook events for later idempotent processing.
create table if not exists public.whatsapp_webhook_events (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);
alter table public.whatsapp_webhook_events enable row level security;
-- No anon/authenticated policies: access only through trusted service role.
create index if not exists whatsapp_webhook_events_pending_idx
  on public.whatsapp_webhook_events (received_at) where processed_at is null;
