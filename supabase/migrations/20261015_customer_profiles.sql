-- Secure, additive customer registration support for Elmarwa.
-- Existing app_data, orders, employees and admin_users remain unchanged.
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text NOT NULL UNIQUE CHECK (phone ~ '^01[0-9]{9}$'),
  company text NOT NULL,
  address text NOT NULL,
  type text NOT NULL DEFAULT 'B' CHECK (type IN ('B','VIP')),
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
-- No direct client-side table access; verified identities are checked by
-- /api/customer-profile on the server before returning their own profile.
REVOKE ALL ON TABLE public.customer_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.provision_elmarwa_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m jsonb;
  customer_name text;
  customer_phone text;
  customer_company text;
  customer_address text;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  m := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  IF m->>'elmarwa_registration' IS DISTINCT FROM 'v1' THEN
    RETURN NEW;
  END IF;

  customer_name := btrim(COALESCE(m->>'name',''));
  customer_phone := btrim(COALESCE(m->>'phone',''));
  customer_company := btrim(COALESCE(m->>'company',''));
  customer_address := btrim(COALESCE(m->>'address',''));

  IF length(customer_name) NOT BETWEEN 2 AND 120
     OR customer_phone !~ '^01[0-9]{9}$'
     OR length(customer_company) NOT BETWEEN 1 AND 120
     OR length(customer_address) NOT BETWEEN 3 AND 300
     OR NEW.email IS NULL
     OR length(NEW.email) > 254
  THEN
    RAISE EXCEPTION 'Invalid customer registration details';
  END IF;

  INSERT INTO public.customer_profiles (id,email,name,phone,company,address)
  VALUES (
    NEW.id,lower(btrim(NEW.email)),customer_name,customer_phone,
    customer_company,customer_address
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_elmarwa_customer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS elmarwa_customer_email_confirmed ON auth.users;
CREATE TRIGGER elmarwa_customer_email_confirmed
AFTER INSERT OR UPDATE OF email_confirmed_at
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.provision_elmarwa_customer();
