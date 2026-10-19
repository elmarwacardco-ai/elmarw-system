-- Durable outbound reply queue. Service role access only.
create table if not exists public.whatsapp_outbound_messages (
  inbound_message_id text primary key references public.whatsapp_inbound_messages(message_id),
  wa_id text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_outbound_messages enable row level security;
create index if not exists whatsapp_outbound_due_idx on public.whatsapp_outbound_messages(next_attempt_at) where status in ('pending','failed');
