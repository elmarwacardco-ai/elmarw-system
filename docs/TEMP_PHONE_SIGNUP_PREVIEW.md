# Temporary phone/password signup — isolated Preview only

The owner asked to keep building the Elmarwa order system while Meta WhatsApp Business onboarding is blocked. This branch adds **a provisional sign-up path** for a phone number absent from the customer table. It does not claim ownership of the phone number.

## Behavior
- A visitor chooses products, quantity and PDF first (guest checkout branch), then opens **حساب جديد؟ سجّل من هنا**.
- Registration collects name, 11-digit Egyptian phone, company, address, password (12–72 characters), and Cloudflare Turnstile result.
- `POST /api/customer/register-temporary` refuses any existing phone in local, `+20`, or `20` formats. Atomic `elmarwa_mutate` also refuses duplicate canonical phones during inserts.
- The server's Supabase admin Auth creates a password-backed identity with a **reserved, non-deliverable internal email** and a server-set `app_metadata.elmarwa_temp_customer` flag; it never saves a plaintext password to `app_data`.
- The customer row has `provisionalSignup:true`, `phoneVerified:false`, `emailVerified:false`, `type:'B'`. No existing customer row is linked or claimed.
- Existing customers keep using their verified sign-in paths; provisional sign-in needs the correct password, linked Auth user ID, reserved email and trusted Auth app metadata.
- Provisional session access stops if the server feature flag is turned off. Orders are owner-scoped and repriced on the backend.

## Security / release constraints
- Both `ENABLE_TEMP_PHONE_SIGNUP` and `VITE_ENABLE_TEMP_PHONE_SIGNUP` default to `false`. The API also **refuses provisional signup and login in Vercel Production**, and in Vercel Preview requires `ELMARWA_TEMP_SIGNUP_TEST_DB_REF` to match the actual *isolated* `SUPABASE_URL` host. The known live project `oosihqinkatldjmciutu` is explicitly blocked. **Never enable on production or a Preview connected to real customer data**. All Preview branches in the current Vercel project appear to share production Supabase credentials, so the branch must stay locked until isolated test data and effective rate limits are available.
- CAPTCHA is mandatory and verified server-side. Password brute-force defense depends on Auth limits; extra per-IP and per-phone rate limits and abuse observability remain TODO.
- Unverified phone account creation can impersonate a real phone owner when no legacy record exists; NEVER use it as proof of identity or for account recovery, sensitive notifications or VIP privileges.
- There is no SMS, WhatsApp or email ownership check in this path. Before official release, replace this enrollment with verified phone/WhatsApp/email and migrate/reverify all provisional identities safely.
- This feature alone does not solve broader release blockers: exposed historical plaintext credentials in Git history, unprotected legacy tables, incomplete E2E browser flows and staff account recovery.

## Verification
- `node --test api/customer-temporary.test.js` covers OFF-by-default, distinct and international-format duplicate phones, Turnstile, password and input validation, password-backed Auth identity, session ownership, denial for unknown users, and failed insert cleanup.
- Required CI runs this test in addition to all original React and API tests.
- With an **isolated** Supabase test instance, configure the two flags only for the test branch, `ELMARWA_TEMP_SIGNUP_TEST_DB_REF` to the isolated project's 20-letter ref, and the matching Turnstile site/secret keys; verify signup, login, refresh, customer separation, one actual PDF order, and database persistence. Never use real customer phone numbers or real orders during testing.


## Isolated Preview environment wiring
The test deployment must have its **own** Supabase project, its own Auth users, and disposable catalog data. Scope all variables to the test branch (not all Previews). Every URL/key in this group must come from the same isolated project:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (server only) and `SUPABASE_ANON_KEY` (public Auth key).
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public build-time values).
- `ELMARWA_TEMP_SIGNUP_TEST_DB_REF` exactly matching the test URL's project ref; never use `oosihqinkatldjmciutu`.
- `VITE_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` from a Turnstile widget restricted to the Preview's allowed hostnames.
- Finally set `ENABLE_TEMP_PHONE_SIGNUP=true` and `VITE_ENABLE_TEMP_PHONE_SIGNUP=true` **only** for the isolated branch.

Rebuild the Preview after changing build-time variables. Validate the public API catalog and unauthenticated access rules, then register only fictional customers, refresh and check the isolated database. If any of the conditions above is missing, keep both registration flags false.

## Owner-confirmed test data (2026-10-16)
The owner confirmed that the **entire existing Elmarwa system is a test**, and losing test entries is acceptable. This removes the need to provision a second database just to exercise phone registration. To opt in, on the dedicated Vercel Preview branch set `ELMARWA_TEMP_SIGNUP_TEST_DB_REF=oosihqinkatldjmciutu` and `ELMARWA_TEST_DATA_ACK=true`. The public Preview still requires the **existing mandatory server-verified Cloudflare Turnstile** and both registration feature flags; do not enable flags until site and secret keys are in place. Production remains hard-disabled. This opt-in does not make phone numbers verified, permit VIP account claims, or make credential/security issues acceptable. Existing test rows need not be cleared.
