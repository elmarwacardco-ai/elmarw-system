-- Run once in the Supabase SQL Editor before deploying this branch.
-- Atomic operations on the existing single-row JSONB data store.
CREATE OR REPLACE FUNCTION public.elmarwa_mutate(
  p_resource text, p_method text, p_id bigint DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  snapshot jsonb;
  collection jsonb;
  updated jsonb := '[]'::jsonb;
  key_name text;
  target jsonb;
  new_id bigint;
  entry jsonb;
  found boolean := false;
BEGIN
  IF p_resource NOT IN ('clients','categories','subcategories','products','orders','employees','folders') THEN
    RAISE EXCEPTION 'Unknown resource';
  END IF;
  IF p_method NOT IN ('POST','PUT','PATCH','DELETE') THEN
    RAISE EXCEPTION 'Unknown method';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  SELECT data INTO snapshot FROM public.app_data WHERE id = 1 FOR UPDATE;
  IF snapshot IS NULL OR jsonb_typeof(snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Missing app_data row 1';
  END IF;
  key_name := p_resource;
  IF p_resource = 'subcategories' AND snapshot ? 'subCategories' AND NOT snapshot ? 'subcategories' THEN
    key_name := 'subCategories';
  END IF;
  collection := COALESCE(snapshot -> key_name, '[]'::jsonb);
  IF jsonb_typeof(collection) <> 'array' THEN
    RAISE EXCEPTION 'Collection must be an array';
  END IF;
  IF p_method = 'POST' THEN
    IF p_resource = 'clients' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(collection) AS x
      WHERE x->>'phone' = p_payload->>'phone'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Phone already registered';
    END IF;
    SELECT COALESCE(MAX((x->>'id')::bigint),0)+1 INTO new_id FROM jsonb_array_elements(collection) AS x;
    target := (p_payload - 'id') || jsonb_build_object('id', new_id);
    updated := collection || jsonb_build_array(target);
  ELSE
    IF p_id IS NULL THEN RAISE EXCEPTION 'ID required'; END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(collection) LOOP
      IF entry->>'id' = p_id::text THEN
        found := true;
        target := entry;
        IF p_method <> 'DELETE' THEN
          target := entry || (p_payload - 'id');
          updated := updated || jsonb_build_array(target);
        END IF;
      ELSE
        updated := updated || jsonb_build_array(entry);
      END IF;
    END LOOP;
    IF NOT found THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Record not found';
    END IF;
  END IF;
  UPDATE public.app_data
  SET data = jsonb_set(snapshot, ARRAY[key_name], updated, true)
  WHERE id = 1;
  RETURN CASE WHEN p_method = 'DELETE' THEN jsonb_build_object('success',true) ELSE target END;
END
$$;

REVOKE ALL ON FUNCTION public.elmarwa_mutate(text,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elmarwa_mutate(text,text,bigint,jsonb) TO service_role;

-- Private PDF attachments for new orders.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('elmarwa-orders','elmarwa-orders',false,2097152,ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 2097152, allowed_mime_types = ARRAY['application/pdf'];
