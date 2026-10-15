# Guest-first checkout and WhatsApp handoff (Preview only)

**Status:** staging code; WhatsApp authentication is NOT live.

- Anonymous visitors may build a B-price cart and attach a PDF before sign-in.
- Cart metadata is temporarily kept in tab sessionStorage; PDF is kept in browser IndexedDB for up to 24 hours. Browser storage may be deleted, evicted, or unavailable. No PDF or auth tokens are put in sessionStorage.
- At submit, existing authenticated customer login is required. After login, the original checkout remains open and the customer must explicitly click Send; pricing and ownership are validated server-side.
- After successful checkout or sign-out, the local guest draft is deleted. There is no guest API order submission.
- Optional VITE_WHATSAPP_BOT_NUMBER enables a contact-only wa.me help link, NOT authentication. When absent the interface explains this limitation.

## Remaining before enabling WhatsApp sign-in

- Connect Meta WhatsApp Business Cloud API and verify webhook signatures and message IDs.
- Map WhatsApp user phone to one customer with verified phone ownership; reconcile existing customers and never grant VIP pricing from a phone number alone.
- Issue short-lived, single-use server-backed sign-in handoff tokens; avoid exposing Supabase access tokens in URLs or chats.
- Verify redemption, rate limits, account provisioning and replay protection on isolated Preview.
- Run real browser testing for PDF restoration and completed orders and resolve release blockers in PR #1.

Do not deploy to Production or alter Supabase customer/order data based on this frontend-only phase.
## Current approved WhatsApp contact (changeable configuration)

The business currently uses **01070250376** (E.164: **+201070250376**) as the intended Elmarwa bot contact. The owner confirmed this is the current number and it may be changed later. This is **not** an activated bot or authenticated phone number.

For the guest checkout's optional **contact-only** button, configure Vercel **Preview** environment variable `VITE_WHATSAPP_BOT_NUMBER=201070250376` (prefer branch-specific `feature/guest-checkout-whatsapp-handoff-20261015`). Redeploy Preview so Vite embeds the public contact setting. Updating the environment variable and redeploying changes the displayed contact number without changing source code. Never use this setting as a proof of phone ownership or to grant customer login.

The Vercel environment settings endpoint returned 404 during the attempt on October 15, 2026, so **this value was not added to Vercel** by the assistant and the WhatsApp contact button is not verified as enabled.
