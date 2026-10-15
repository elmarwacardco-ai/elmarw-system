-- Preview-only migration for Elmarwa WhatsApp order review.
-- Do NOT apply automatically to a live database. This remains pending review.
-- Message/webhook integration and staff authentication are NOT enabled here.
CREATE TABLE IF NOT EXISTS public.whatsapp_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_message_id text UNIQUE,
  client_id bigint NOT NULL,
  worker_name text NOT NULL,
  items jsonb NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  file_versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_file_path text,
  ready_date date,
  lock_owner uuid,
  lock_activity timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  official_order_id bigint UNIQUE,
  confirmation_sent_at timestamptz,
  confirmation_sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_draft_items_array CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 30),
  CONSTRAINT whatsapp_draft_files_array CHECK (jsonb_typeof(file_versions) = 'array')
);
ALTER TABLE public.whatsapp_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.whatsapp_drafts TO service_role;
CREATE INDEX IF NOT EXISTS whatsapp_drafts_created_idx
  ON public.whatsapp_drafts (created_at DESC);

-- A single database transaction holds the draft row lock AND official order
-- JSONB row lock, so repeat approve requests cannot create a second order.
CREATE OR REPLACE FUNCTION public.elmarwa_whatsapp_transition(
  p_draft_id uuid,
  p_action text,
  p_actor uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  d public.whatsapp_drafts%ROWTYPE;
  source jsonb;
  clients jsonb;
  products jsonb;
  orders jsonb;
  customer jsonb;
  line jsonb;
  product_row jsonb;
  price_table jsonb;
  price numeric;
  count integer;
  qty integer;
  normalized_items jsonb := '[]'::jsonb;
  total numeric := 0;
  output_order jsonb;
  next_order_id bigint;
  serial text;
  file_meta jsonb;
  chosen text;
  chosen_name text;
  idx integer;
  item jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = p_actor
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Admin access required';
  END IF;
  IF p_action NOT IN ('claim','heartbeat','set_ready_date','attach','approve','confirm') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid draft action';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid payload';
  END IF;
  SELECT * INTO d FROM public.whatsapp_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Draft not found';
  END IF;

  IF p_action = 'confirm' THEN
    IF d.status <> 'approved' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Order not approved';
    END IF;
    IF d.confirmation_sent_at IS NULL THEN
      UPDATE public.whatsapp_drafts SET
        confirmation_sent_at = now(), confirmation_sent_by = p_actor,
        updated_at = now()
      WHERE id = p_draft_id RETURNING * INTO d;
    END IF;
    RETURN to_jsonb(d);
  END IF;

  IF d.status = 'approved' AND p_action = 'approve' THEN
    RETURN jsonb_build_object('draft', to_jsonb(d), 'orderId', d.official_order_id);
  END IF;
  IF d.status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Draft is not editable';
  END IF;
  IF p_action = 'claim' THEN
    IF d.lock_owner IS NOT NULL AND d.lock_owner <> p_actor
       AND d.lock_activity > now() - interval '15 minutes' THEN
      RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'Draft claimed by another reviewer';
    END IF;
    UPDATE public.whatsapp_drafts SET lock_owner = p_actor, lock_activity = now(), updated_at = now()
    WHERE id = p_draft_id RETURNING * INTO d;
    RETURN to_jsonb(d);
  END IF;
  IF d.lock_owner IS DISTINCT FROM p_actor OR d.lock_activity IS NULL
     OR d.lock_activity <= now() - interval '15 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'Claim draft again before editing';
  END IF;
  IF p_action = 'heartbeat' THEN
    UPDATE public.whatsapp_drafts SET lock_activity=now(), updated_at=now()
    WHERE id=p_draft_id RETURNING * INTO d;
    RETURN to_jsonb(d);
  END IF;
  IF p_action = 'set_ready_date' THEN
    IF (p_payload->>'readyDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR (p_payload->>'readyDate')::date < current_date THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid ready date';
    END IF;
    UPDATE public.whatsapp_drafts
    SET ready_date = (p_payload->>'readyDate')::date,
        lock_activity=now(),updated_at=now()
    WHERE id = p_draft_id RETURNING * INTO d;
    RETURN to_jsonb(d);
  END IF;
  IF p_action = 'attach' THEN
    chosen := p_payload->>'path';
    chosen_name := p_payload->>'fileName';
    IF chosen IS NULL OR chosen !~ '^whatsapp-drafts/[0-9a-f-]{36}[.]pdf$'
      OR chosen_name IS NULL OR chosen_name !~* '[.]pdf$'
      OR length(chosen_name) > 180
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(d.file_versions) v WHERE v->>'path' = chosen)
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid or duplicate PDF path';
    END IF;
    file_meta := jsonb_build_object('version',jsonb_array_length(d.file_versions)+1,
      'path',chosen,'fileName',chosen_name,'uploadedBy',p_actor,'uploadedAt',now());
    UPDATE public.whatsapp_drafts
    SET file_versions = file_versions || jsonb_build_array(file_meta),
        approved_file_path = chosen, lock_activity=now(), updated_at=now()
    WHERE id=p_draft_id RETURNING * INTO d;
    RETURN to_jsonb(d);
  END IF;

  -- Approval validates all prices using the current server-side product table.
  IF d.ready_date IS NULL OR jsonb_array_length(d.file_versions) = 0
     OR d.approved_file_path IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ready date and PDF required';
  END IF;
  SELECT data INTO source FROM public.app_data WHERE id=1 FOR UPDATE;
  IF source IS NULL THEN
    RAISE EXCEPTION 'App data missing';
  END IF;
  clients := source->'clients';
  products := source->'products';
  orders := source->'orders';
  SELECT value INTO customer FROM jsonb_array_elements(clients) t(value)
  WHERE t.value->>'id' = d.client_id::text LIMIT 1;
  IF customer IS NULL OR COALESCE(customer->>'authUserId','') = '' OR
     COALESCE(customer->>'phoneVerified','false') <> 'true' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Verified customer required';
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(d.items) LOOP
    IF (line->>'productId') !~ '^[0-9]+$' OR
       (line->>'qty') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid product or quantity';
    END IF;
    qty := (line->>'qty')::integer;
    IF qty NOT IN (1000,2000,3000,4000,5000,6000,7000,8000,9000,10000) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid quantity';
    END IF;
    SELECT value INTO product_row FROM jsonb_array_elements(products) t(value)
      WHERE t.value->>'id' = line->>'productId' LIMIT 1;
    IF product_row IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Product no longer exists';
    END IF;
    price_table := CASE WHEN customer->>'type'='VIP'
      THEN product_row->'pricesVIP' ELSE product_row->'pricesB' END;
    IF jsonb_typeof(price_table) = 'string' THEN
      price_table := (price_table #>> '{}')::jsonb;
    END IF;
    IF (price_table->>qty::text) IS NULL
       OR (price_table->>qty::text) !~ '^[0-9]+([.][0-9]+)?$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Price not available';
    END IF;
    price := (price_table->>qty::text)::numeric;
    IF price <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Price not available';
    END IF;
    total := total + price;
    normalized_items := normalized_items || jsonb_build_array(
      jsonb_build_object('productId',product_row->'id',
      'subCategoryId',product_row->'subCategoryId',
      'name',product_row->>'name','image',COALESCE(product_row->>'image',''),
      'qty',qty,'price',price,'total',price)
    );
    product_row := NULL;
  END LOOP;
  SELECT COALESCE(MAX((value->>'id')::bigint),0)+1 INTO next_order_id
  FROM jsonb_array_elements(orders) t(value);
  FOR idx IN 1..30 LOOP
    serial := 'M-' || to_char(clock_timestamp(), 'YYMM') || '-' ||
      lpad((floor(random()*1000000)::integer)::text,6,'0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(orders) t(value)
      WHERE value->>'serialNumber'=serial
    );
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(orders) t(value)
      WHERE value->>'serialNumber'=serial) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Serial collision';
  END IF;
  SELECT value INTO file_meta FROM jsonb_array_elements(d.file_versions) t(value)
  WHERE value->>'path' = d.approved_file_path LIMIT 1;
  IF file_meta IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Approved PDF does not exist';
  END IF;
  output_order := jsonb_build_object(
    'id',next_order_id,'serialNumber',serial,
    'executionDate',current_date,'readyDate',d.ready_date,
    'clientName',customer->>'name','clientPhone',customer->>'phone',
    'clientId',d.client_id,'workerName',d.worker_name,'items',normalized_items,
    'total',total,'paidAmount',0,'paymentStatus','غير مدفوع',
    'paymentMethod','نقدي','paymentProof','', 'notes',d.notes,
    'status','جديد','date',now(),'fileName',file_meta->>'fileName',
    'filePath',d.approved_file_path,'source','whatsapp','whatsappDraftId',d.id
  );
  UPDATE public.app_data SET data = jsonb_set(source,'{orders}',
    orders || jsonb_build_array(output_order),true) WHERE id=1;
  UPDATE public.whatsapp_drafts SET
    status='approved', approved_at=now(), approved_by=p_actor,
    official_order_id=next_order_id, lock_owner=NULL,
    lock_activity=NULL,updated_at=now()
  WHERE id=p_draft_id RETURNING * INTO d;
  RETURN jsonb_build_object('draft',to_jsonb(d),'order',output_order);
END
$function$;

REVOKE ALL ON FUNCTION public.elmarwa_whatsapp_transition(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elmarwa_whatsapp_transition(uuid,text,uuid,jsonb) TO service_role;
-- Confirm that the new table and function are protected before enabling
-- ENABLE_WHATSAPP_DRAFTS=true on Preview. Do not enable in production yet.
