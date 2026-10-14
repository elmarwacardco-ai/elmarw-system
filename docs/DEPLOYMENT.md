# Elmarwa staged rollout checklist

Status: **WIP — do not merge into main or deploy to production yet.**

## 1. Protect existing information
- The historical public `api/db.json` contained plaintext customer and employee credentials. It was removed from this PR branch, **not from Git history or main**. Protect/privatize the repository where appropriate, purge sensitive history through a coordinated process, and rotate all affected passwords.
- Back up the `public.app_data` row in Supabase before running any SQL. The migration does not delete existing data.
- Do **not** reuse passwords from the exposed file to activate customer accounts.

## 2. Prepare Supabase
- Check that `public.app_data` exists with one JSONB row `id=1` and collections `clients`, `categories`, `subcategories` or `subCategories`, `products`, `orders`, `employees`, `folders`.
- Check that `public.admin_users(user_id)` contains only authorized Supabase Auth administrator IDs.
- Apply `supabase/migrations/20261014_elmarwa_atomic_writes.sql` in the Supabase SQL Editor after taking a backup. It creates `public.elmarwa_mutate` and two **private** Storage buckets: `elmarwa-orders` and `elmarwa-payment-proofs`.
- Verify the `elmarwa_mutate` function is **not executable by anon or authenticated**, only service_role.
- Keep `SUPABASE_SERVICE_KEY` server-only; never put it in `VITE_` variables or commit it.

## 3. Vercel preview environment
- Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (server-only) and `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public build values). See `.env.example`.
- Verify Vercel's project root/build output still includes root-level `api/index.js` and builds `web` to `web/dist`. The actual project dashboard configuration has not been inspected.
- Leave `ENABLE_CUSTOMER_SIGNUP=false` (default) until phone ownership verification (SMS/OTP), CAPTCHA and rate limiting have been built and tested. Signup uses an internal synthetic email; it **does not** verify phone ownership.
- Existing legacy clients will **not** authenticate with their old plaintext passwords. They require identity-verified reactivation and new passwords.

## 4. Preview smoke tests before production
1. Verify unauthenticated `GET /api/categories`, `/api/subcategories`, `/api/products` load the public catalog without exposing VIP pricing or private users.
2. Verify unauthenticated `GET /api/clients`, `/api/orders`, and unauthorized POST operations return 401/403.
3. Sign in as a real administrator and create, edit and delete disposable test products or categories. Confirm data remains after page refresh.
4. Once customer signup is safely enabled, create a **new** test account; sign in and reload. Confirm no other customers' orders are visible.
5. Submit a test order with a PDF (max 2 MiB for now). Confirm the server calculates the correct B/VIP price and creates a private file path; check download authorization.
6. Upload a test payment PNG/JPEG (max 1 MiB) and verify only that customer or an admin can get the signed file URL.
7. Test two simultaneous data edits and confirm neither disappears.

The automatic CI runs syntax, React build and unit tests against mocked data. It is **not** a substitute for a real Supabase/Vercel preview test.

## Remaining work
- Safe SMS/OTP identity verification, registration rate limiting, existing client account recovery and password reset.
- Secure payment and employee authentication integration, production file size strategy, and final interface/design and WhatsApp bot implementation.
- Migrate historical plaintext customer/employee credentials out of JSONB data, avoid displaying passwords in admin screens, and rotate compromised credentials.
- Check Vercel deployment routing and Supabase migrations in an actual preview environment.
