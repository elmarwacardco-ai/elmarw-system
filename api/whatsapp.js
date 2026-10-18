import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}


async function sendWelcome(to) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error('WhatsApp outbound configuration missing');
    return false;
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: 'أهلًا بيك في مطابع المروة 🌟\\nنقدر نساعدك في معرفة الأسعار، تقديم طلب جديد، أو متابعة طلب سابق.' } }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      console.error('WhatsApp outbound failed', { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    console.error('WhatsApp outbound network error', { name: error?.name });
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    
    // Never log verification secrets or challenges.
    
    if (expected && mode === 'subscribe' && token === expected && typeof challenge === 'string') {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden - token mismatch');
  }
  if (req.method !== 'POST') return res.status(405).end();
  const secret = process.env.META_APP_SECRET;
  if (!secret || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: 'Webhook configuration missing' });
  }
  let raw;
  try { raw = await readRaw(req); }
  catch { return res.status(413).end(); }
  const signature = req.headers['x-hub-signature-256'];
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return res.status(401).end();
  }
  const actual = createHmac('sha256', secret).update(raw).digest();
  const supplied = Buffer.from(signature.slice(7), 'hex');
  if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) {
    return res.status(401).end();
  }
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); }
  catch { return res.status(400).end(); }
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return res.status(400).end();
  }
  const id = createHash('sha256').update(raw).digest('hex');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await db.from('whatsapp_webhook_events').insert({ id, payload });
  if (error && error.code !== '23505') {
    console.error('WhatsApp inbox insert failed', { code: error.code });
    return res.status(503).json({ error: 'Webhook persistence unavailable' });
  }
  // Store individual inbound messages idempotently. Never acknowledge an event
  // until its message rows have been persisted.
  const messages = [];
  for (const entry of payload.entry) {
    for (const change of (entry.changes || [])) {
      for (const message of (change.value?.messages || [])) {
        if (typeof message.id !== 'string' || typeof message.from !== 'string') continue;
        const kind = message.type || 'unknown';
        const media = kind === 'document' ? message.document :
          kind === 'image' ? message.image : kind === 'audio' ? message.audio :
          kind === 'video' ? message.video : null;
        messages.push({
          message_id: message.id,
          wa_id: message.from,
          message_type: kind,
          text_body: kind === 'text' ? (message.text?.body || '').slice(0, 10000) : null,
          media_id: media?.id || null,
          media_mime_type: media?.mime_type || null,
          media_filename: kind === 'document' ? (media?.filename || null) : null
        });
      }
    }
  }
  for (const message of messages) {
    const { error: messageError } = await db.from('whatsapp_inbound_messages').insert(message);
    if (messageError && messageError.code !== '23505') {
      console.error('WhatsApp message insert failed', { code: messageError.code });
      return res.status(503).json({ error: 'Inbound message persistence unavailable' });
    }
    if (!messageError) {
      // Keep one collecting draft per WhatsApp sender; do not create official orders.
      const { data:openDraft, error:lookupError } = await db.from('whatsapp_order_drafts')
        .select('id,job_name,product_id,quantity,pdf_media_id')
        .eq('wa_id', message.wa_id).eq('status','collecting')
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      if (lookupError) {
        console.error('WhatsApp draft lookup failed', { code: lookupError.code });
        return res.status(503).json({ error: 'Draft storage unavailable' });
      }
      let draftId = openDraft?.id;
      if (!draftId) {
        const {data:newDraft,error:draftError} = await db.from('whatsapp_order_drafts')
          .insert({wa_id:message.wa_id,step:'intent'}).select('id').single();
        if (draftError) {
          console.error('WhatsApp draft creation failed',{code:draftError.code});
          return res.status(503).json({error:'Draft storage unavailable'});
        }
        draftId = newDraft.id;
      }
      const patch = {last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      const jobMatch = message.text_body?.match(/^\s*اسم\s*الشغل\s*[:：-]\s*(.{1,120})\s*$/i);
      if (jobMatch) { patch.job_name = jobMatch[1].trim(); patch.step='product'; }
      if (message.message_type === 'document' && message.media_mime_type === 'application/pdf' && message.media_id) {
        patch.pdf_media_id = message.media_id;
        patch.pdf_filename = message.media_filename;
        patch.step = 'product';
      }
      const quantityMatch=message.text_body?.match(/^(?:الكمية|كمية)[:：-] ?([0-9]+)$/);
      if(quantityMatch){
        const qty=Number(quantityMatch[1]);
        if(qty>=1000 && qty<=10000 && qty%1000===0)patch.quantity=qty;
      }
      const productMatch=message.text_body?.match(/^(?:المنتج|منتج)[:：-] ?([a-zA-Z0-9_-]+)$/);
      if(productMatch){
        const {data:catalog,error:catalogError}=await db.from('app_data').select('data').eq('id',1).single();
        if(catalogError)return res.status(503).json({error:'Catalog unavailable'});
        const product=(catalog?.data?.products||[]).find(p=>String(p.id)===productMatch[1]);
        if(product)patch.product_id=String(product.id);
      }
      const merged={...openDraft,...patch};
      if(merged.job_name && merged.product_id && merged.quantity && merged.pdf_media_id){
        patch.status='pending_review';
        patch.step='review';
      }
      const {error:updateError}=await db.from('whatsapp_order_drafts').update(patch).eq('id',draftId);
      if (updateError) {
        console.error('WhatsApp draft update failed',{code:updateError.code});
        return res.status(503).json({error:'Draft storage unavailable'});
      }
      const {error:linkError}=await db.from('whatsapp_inbound_messages')
        .update({draft_id:draftId}).eq('message_id',message.message_id);
      if (linkError) {
        console.error('WhatsApp draft message link failed',{code:linkError.code});
        return res.status(503).json({error:'Draft link unavailable'});
      }
      // Reply only to newly saved inbound text messages; duplicates never trigger another send.
      if (message.message_type === 'text') {
        await sendWelcome(message.wa_id);
      }
    }
  }
  return res.status(200).json({ received: true, messages_saved: messages.length });
}
