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
