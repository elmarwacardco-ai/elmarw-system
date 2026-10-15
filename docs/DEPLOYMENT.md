# Elmarwa staged rollout checklist

Status: **WIP — do not merge into main or deploy to production yet.**

**Database status (verified 2026-10-15):** The atomic-write SQL migration has already been applied successfully to project `elmarw` (ref `oosihqinkatldjmciutu`), with a verified private snapshot backup. The previous text saying it has not been applied is obsolete. GitHub does not deploy automatically from this fact.

## 1. Protect existing information
- The historical public `api/db.json` contained plaintext customer and employee credentials. It was removed from this PR branch, **not from Git history or main**. Protect/privatize the repository where appropriate, purge sensitive history through a coordinated process, and rotate all affected passwords.
- Back up the `public.app_data` row in Supabase before running any SQL. The migration does not delete existing data.
- Do **not** reuse passwords from the exposed file to activate customer accounts.

## 2. Prepare Supabase
- Check that `public.app_data` exists with one JSONB row `id=1` and collections `clients`, `categories`, `subcategories` or `subCategories`, `products`, `orders`, `employees`, `folders`.
- Check that `public.admin_users(user_id)` contains only authorized Supabase Auth administrator IDs.
- Already applied in connected Supabase project after a verified backup. Do not reapply without reviewing the existing migration/history. It creates `public.elmarwa_mutate` and two **private** Storage buckets: `elmarwa-orders` and `elmarwa-payment-proofs`.
- Verify the `elmarwa_mutate` function is **not executable by anon or authenticated**, only service_role. The migration also revokes direct reads of `app_data` and `admin_users` from public client roles; check for any other direct consumers before applying.
- Keep `SUPABASE_SERVICE_KEY` server-only; never put it in `VITE_` variables or commit it.

## 3. Vercel preview environment
- Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (server-only), `SUPABASE_ANON_KEY` (a public key used from the server to sign customers in) and `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` (public build values), plus `TURNSTILE_SECRET_KEY` (private). See `.env.example`.
- Verify Vercel's project root/build output still includes root-level `api/index.js` and builds `web` to `web/dist`. The actual project dashboard configuration has not been inspected.
- Leave `ENABLE_CUSTOMER_SIGNUP=false` (default) until phone ownership verification (SMS/OTP), Cloudflare Turnstile, and abuse rate limiting have been configured and tested. Signup now requests an SMS OTP using Supabase phone Auth, and account creation happens only after verifying it. The feature is disabled by default; an SMS provider, an external Turnstile widget/secret and abuse rate limits must be configured before enabling it.
- Existing legacy clients will **not** authenticate with their old plaintext passwords. They require identity-verified reactivation and new passwords.

## 4. Preview smoke tests before production
1. Verify unauthenticated `GET /api/categories`, `/api/subcategories`, `/api/products` load the public catalog without exposing VIP pricing or private users.
2. Verify unauthenticated `GET /api/clients`, `/api/orders`, and unauthorized POST operations return 401/403.
3. Sign in as a real administrator and create, edit and delete disposable test products or categories. Confirm data remains after page refresh.
4. Once customer signup is safely enabled, create a **new** test account, receive an SMS code and verify it; sign in and reload. Confirm no other customers' orders are visible.
5. Submit a test order with a PDF (max 2 MiB for now). Confirm the server calculates the correct B/VIP price and creates a private file path; check download authorization.
6. Upload a test payment PNG/JPEG (max 1 MiB) and verify only that customer or an admin can get the signed file URL.
7. Test two simultaneous data edits and confirm neither disappears.

The automatic CI runs syntax, React build and unit tests against mocked data. It is **not** a substitute for a real Supabase/Vercel preview test.

## Remaining work
- Configure and verify SMS delivery, Turnstile, registration rate limiting, existing client account recovery and password reset.
- Secure payment and employee authentication integration, production file size strategy, and final interface/design and WhatsApp bot implementation.
- Migrate historical plaintext customer/employee credentials out of JSONB data, avoid displaying passwords in admin screens, and rotate compromised credentials.
- Check Vercel deployment routing and Supabase migrations in an actual preview environment.

## Preview-only direct PDF upload workflow
- In a **preview** Vercel environment after applying SQL and verifying private Storage policies, enable BOTH `ENABLE_DIRECT_PDF_UPLOAD=true` and `VITE_ENABLE_DIRECT_PDF_UPLOAD=true` (then rebuild preview). Keep disabled in production until manual tests pass.
- A verified customer requests `POST /api/customer/upload-url` with the PDF name/size. The API issues a unique private signed upload URL tied to that customer. The browser sends the file directly to Supabase; it never forwards the whole PDF through Vercel.
- Then `POST /api/customer/orders` submits `uploadPath`. The backend confirms the file path belongs to the authenticated customer, the file exists, is recent, has an allowed MIME type and is no larger than 6 MiB; the database rejects duplicate file paths/serials under its atomic lock.
- Without the flags, the legacy in-request data-URL route is limited to 2 MiB. **For print-ready PDFs larger than 6 MiB, implement and test TUS resumable uploads** before increasing the limit.
- Signed upload URLs expire after 2 hours. Unfinished uploads may leave orphan files; plan a periodic cleanup job after production deployment.
- See [Supabase signed uploads](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl) and [Storage file info](https://supabase.com/docs/reference/javascript/file-buckets-info).

## Vercel access issue — verified 2026-10-15
- Vercel connector listed project `elmarw` (`prj_8dTls93o8r0ARzzHMfClztkITCpa`), but the deployment-list endpoint returned **403 forbidden**, stating that the connection is not authorized to access scope `waled4`.
- The Vercel deployment's branch, runtime environment variables and live API cannot yet be verified from this connection. Do not infer that a green GitHub/Vercel status means a successful customer transaction.
- Reconnect Vercel with the **waled4** scope or grant access to that scope, then inspect Preview deployments and confirm server-side Supabase settings without disclosing the values.
- Existing customer signup, order placement, admin editing, staff auth and larger PDF paths still need end-to-end preview tests before merging.


## Preview environment verification — 2026-10-15
- Supabase publishable API key was set as `SUPABASE_ANON_KEY` on **Preview only** in Vercel, without exposing the value.
- `ENABLE_CUSTOMER_SIGNUP=false` was explicitly set on **Preview only**; do not enable until SMS OTP, Turnstile and rate limits are configured and tested.
- Existing `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` variables were present for Preview; presence alone does not validate their values.
- Supabase atomic mutation create/update/delete passed for all seven collections inside one rolled-back transaction. Record counts were unchanged afterward.
- Vercel deployment URL reads still return 403 during protected deployment alias lookup. Live HTTP end-to-end tests remain unverified; this is a release blocker.
- The GitHub history credential leak and six public legacy tables without RLS remain unresolved. Do not merge this draft to production until the security and auth work is done.


## WhatsApp draft review preview (code staged, database unchanged)
- On PR #1 the new server function `api/whatsapp-drafts.js`, panel `web/src/WhatsAppDrafts.jsx`, unit tests, and migration `supabase/migrations/20261015_whatsapp_drafts.sql` are committed but **the migration has NOT been applied** to connected production Supabase.
- Use a separately backed-up isolated database/Preview before applying the draft migration. Verify RLS is enabled on `public.whatsapp_drafts`, and `anon`/`authenticated` have no direct access to the table or RPC; `service_role` only.
- Leave both `ENABLE_WHATSAPP_DRAFTS=false` (server) and `VITE_ENABLE_WHATSAPP_DRAFTS=false` (frontend) until that isolated test is complete. Never enable them on Production at this stage.
- In Preview, use an administrator account from `admin_users`. Test create, claim, conflicting second claim, expiry after 15 minutes, heartbeat, corrected PDF version retention, delivery date, duplicate approval, official order serial, and manual confirmation after 10-minute warning. Verify all files remain private, old versions downloadable by admin only, and no WhatsApp message is auto-sent.
- Real incoming WhatsApp messages/webhooks, staff login/permissions and official customer onboarding remain unimplemented. This functionality must not be presented as a live bot.
- The GitHub Actions build/tests are mocked for database mutations and **do not** constitute approval of the SQL migration or live preview workflow.

## Email confirmation preview checklist (2026-10-15)
- **Email registration must remain preview-only** until end-to-end checks and the other production security blockers are resolved. It does **not** require SMS to confirm an email, and the customer phone is marked unverified.
- Supabase Auth **Confirm email** must be enabled. Sender SMTP credentials (Gmail App Password) must stay inside Supabase SMTP settings; never commit or disclose them.
- Configure Cloudflare Turnstile **site key** (`VITE_TURNSTILE_SITE_KEY`) and private **secret** (`TURNSTILE_SECRET_KEY`) in **Preview** before enabling `ENABLE_CUSTOMER_EMAIL_SIGNUP` and `VITE_ENABLE_CUSTOMER_EMAIL_SIGNUP`. Both email and phone signup enforce server-side CAPTCHA now.
- Ensure `SUPABASE_ANON_KEY` is the public/publishable key. Keep `SUPABASE_SERVICE_KEY` private.
- Set Supabase **Authentication → URL Configuration → Redirect URLs** to the *exact* test deployment URL, e.g. `https://elmarw-bp741irhy-waled4.vercel.app/**` when that is the deployment under test; update this as deployment URLs change. Do not broadly whitelist arbitrary sites or unrestricted `*.vercel.app`.
- Email signup selects a trusted `CUSTOMER_EMAIL_REDIRECT_URL` if set, otherwise Vercel's `VERCEL_URL`. It never accepts a browser-supplied redirect host.
- Test a disposable email account: register (expect 202 and **no active client yet**), open the email, click the confirmation link, sign in, confirm exactly one client entry with `emailVerified: true` and `phoneVerified: false`, refresh the page, check order ownership. Check spam and Supabase Auth logs for delivery failures.
- **Do not mistake a READY Vercel deployment for a successful test email.** End-to-end verification and the correct Supabase URL configuration must be completed before production merge.
- `customer_profiles` SQL migration was separately applied on 2026-10-15 in project `elmarw` for an alternate pilot email flow; the secure-branch registration stores verified clients via the existing atomic `app_data` RPC after first confirmed sign-in. Reconcile these approaches before merging unrelated PR #3; never apply duplicate migrations blindly.
