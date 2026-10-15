# Elmarwa — Supabase read-only audit (2026-10-14)

## Connection and environment
- Supabase connection confirmed for **elmarw** (project `oosihqinkatldjmciutu`), region `eu-west-1`, status `ACTIVE_HEALTHY`.
- All diagnostic actions were **read-only**. No migration has been applied and no production records were changed.
- GitHub `main` is the current deployed-code baseline; this PR is a separate draft branch.

## Verified data inventory (counted with SQL, not estimated UI row counts)
- `public.app_data` has **one JSONB row**, `id=1` (roughly 1.5 KB).
- Current keys: `categories` **4**, `subCategories` **3**, `products` **2**.
- Keys `clients`, `orders`, `employees` and `folders` **do not exist**. This does NOT prove that historical records never existed elsewhere; do not automatically import a GitHub dump as the source of truth.
- Legacy relational tables `public."Customer"`, `public."Product"`, `public."Order"`, `public."Category"` contain **0 rows** each.
- `public.admin_users`: **1**, correctly matched to **1** Supabase Auth user.
- Function `public.append_main_category(p_name text)` exists, is SECURITY DEFINER, and is **not executable by anon or authenticated**. This is the only write RPC currently used by GitHub `main`.
- Function `public.elmarwa_mutate`: **absent**. Required by this PR's new CRUD APIs.
- Private Storage buckets `elmarwa-orders` and `elmarwa-payment-proofs`: **absent**.
- Migration history: no tracked Supabase migrations recorded for this project.

## Confirmed root cause of write failures
- GitHub `main/api/index.js` expressly **rejects POST** for every resource except `categories`, returning HTTP 405. It also has no PUT/PATCH/DELETE support. Hence client/order/product creation and editing from this code cannot work.
- Draft branch introduces wider authenticated CRUD via `elmarwa_mutate`. Without applying its reviewed SQL migration first, the draft API cannot save orders or products either.
- Missing JSONB keys also explain empty admin counts/views. A non-destructive migration amendment now initializes only absent keys, preserving existing `categories`, `subCategories`, `products` and any restored keys.

## Security findings — DO NOT auto-apply
- **CRITICAL:** RLS is disabled for six legacy public tables: `"User"`, `"Customer"`, `"Category"`, `"Product"`, `"Variant"`, `"Order"`. `anon` has SELECT/INSERT/UPDATE (and other) grants on them. Although the sampled legacy business tables are currently empty, they remain exposed and could leak or accept future data.
- `public.app_data` and `public.admin_users` have RLS enabled with no policies. Service-side use should remain privileged.
- Supabase Auth leaked-password protection is disabled.
- A plaintext data dump was previously present in **public Git history** (removed only from this draft branch). Rotate affected credentials and handle Git history clean-up before production rollout.
- **Do not enable RLS on legacy tables automatically**: doing so can block existing clients until correct policies and consuming applications have been reviewed.
- Read the [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) and [security advisor](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

## Safe next steps
1. Obtain a verified and restorable production backup/snapshot, and confirm the old Git dump is not needed as the only copy of customer/order history.
2. Check Vercel environment variables and which deployment branch is live (never expose `SUPABASE_SERVICE_KEY`).
3. Decide legacy-table RLS policies/permissions with the repository owner, including whether other apps still use these six tables.
4. Review and apply `supabase/migrations/20261014_elmarwa_atomic_writes.sql` in a safe database environment first. It adds absent JSONB keys, atomic RPC and private storage buckets, and restricts access to `app_data` and `admin_users`. It does **not** automatically secure the six legacy tables.
5. Test a disposable category/product, then verify create/read/update/delete through authenticated preview API and ensure the data survives a refresh.
6. Only then evaluate merging and deploying the draft PR, and test customer OTP, PDFs, and payments before public release.

Never assume green GitHub Actions or Vercel build means a live database write succeeded.
