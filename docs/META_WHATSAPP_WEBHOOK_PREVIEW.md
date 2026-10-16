# Meta Cloud API Webhook — PREVIEW only

Endpoint: /api/whatsapp-webhook (dedicated function with raw body verification).
Meta App ID 4440788872854176, WABA 2181900219416283, test Phone Number ID 1401384066394436. No customer authentication, VIP pricing, drafts or real orders are performed by this inbox endpoint.

Meta setup: WhatsApp > Configuration, set HTTPS Callback URL to the exact Preview host + /api/whatsapp-webhook, paste the same WHATSAPP_VERIFY_TOKEN configured privately in Vercel, Verify & Save, subscribe to messages. The WABA must be subscribed to the app (POST /{WABA_ID}/subscribed_apps with a valid system user access token). GET verifies hub.challenge; POST requires X-Hub-Signature-256 HMAC SHA256 of the original bytes using WHATSAPP_APP_SECRET.

Vercel vars on feature/meta-whatsapp-webhook-20261016 Preview:
WHATSAPP_VERIFY_TOKEN (random >=16 chars);
WHATSAPP_APP_SECRET (Meta App Settings > Basic, secret — never commit);
WHATSAPP_PHONE_NUMBER_ID=1401384066394436;
WHATSAPP_WABA_ID=2181900219416283;
WHATSAPP_TEST_RECIPIENT=201010453811;
ENABLE_META_WHATSAPP_WEBHOOK=true ONLY AFTER secret is installed and migration applied.
WHATSAPP_AUTO_REPLY=false by default. Optional, after deliberate opt-in: WHATSAPP_ACCESS_TOKEN (system-user token, never in GitHub/this chat), WHATSAPP_GRAPH_API_VERSION (review supported Meta version), WHATSAPP_AUTO_REPLY=true. Only an exact 'مرحبا', 'ابدأ', 'hi', 'hello', or 'start' gets a single trial response. No automated order confirmations, no PDF correction messages.

Apply supabase/migrations/20261016_meta_whatsapp_inbox.sql only after review to trial database. Table whatsapp_inbox holds message metadata and limited text, deduplicated by Meta message ID. Non-test numbers, unknown WABAs and message-status events are ignored. Do not identify existing clients solely by inbound WhatsApp phone; no VIP prices exposed. Documents' media IDs are recorded, but PDFs are NOT downloaded into private Storage and are NOT submitted for employee approval. Do not claim the full WhatsApp order bot is live until the file/session/customer verification and draft flow are separately integrated and tested.
