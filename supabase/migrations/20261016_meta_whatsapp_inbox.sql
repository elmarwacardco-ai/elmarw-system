-- Trial-only Meta WhatsApp inbound receipts. Do not create orders or link unverified phone identities.
CREATE TABLE IF NOT EXISTS public.whatsapp_inbox (
  message_id text PRIMARY KEY,
  sender_phone text NOT NULL,
  phone_number_id text NOT NULL,
  message_type text NOT NULL,
  text_body text NOT NULL DEFAULT '',
  media_id text,
  file_name text,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_inbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.whatsapp_inbox TO service_role;
CREATE INDEX IF NOT EXISTS whatsapp_inbox_received_at_idx
  ON public.whatsapp_inbox (received_at DESC);
