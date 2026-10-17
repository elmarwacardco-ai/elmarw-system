-- WhatsApp draft and inbound message storage. Apply through Supabase migrations.
create table if not exists public.whatsapp_order_drafts (
 id uuid primary key default gen_random_uuid(),
 wa_id text not null,
 client_id text,
 status text not null default 'collecting' check (status in ('collecting','pending_review','in_review','returned','approved','expired')),
 step text not null default 'intent',
 job_name text,
 category_id text,
 subcategory_id text,
 product_id text,
 quantity integer,
 pdf_media_id text,
 pdf_filename text,
 payment_media_id text,
 assigned_employee_id text,
 review_locked_at timestamptz,
 approved_order_id text,
 last_activity_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists whatsapp_order_drafts_wa_status_idx on public.whatsapp_order_drafts(wa_id,status,created_at desc);
create table if not exists public.whatsapp_inbound_messages (
 message_id text primary key,
 wa_id text not null,
 message_type text not null,
 text_body text,
 media_id text,
 media_mime_type text,
 media_filename text,
 draft_id uuid references public.whatsapp_order_drafts(id),
 received_at timestamptz not null default now()
);
create index if not exists whatsapp_inbound_messages_wa_idx on public.whatsapp_inbound_messages(wa_id,received_at desc);
alter table public.whatsapp_order_drafts enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;
revoke all on public.whatsapp_order_drafts from anon,authenticated;
revoke all on public.whatsapp_inbound_messages from anon,authenticated;
