import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (expected && req.query?.['hub.mode'] === 'subscribe' &&
        req.query?.['hub.verify_token'] === expected &&
        typeof req.query?.['hub.challenge'] === 'string') {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const secret = process.env.META_APP_SECRET;
    const signature = req.headers['x-hub-signature-256'];
    if (!secret) return res.status(503).json({ error: 'META_APP_SECRET missing' });
    if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return res.status(401).end();
    const raw = await readRaw(req);
    const digest = createHmac('sha256', secret).update(raw).digest();
    if (!timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), digest)) return res.status(401).end();
    const payload = JSON.parse(raw.toString('utf8'));
    if (payload.object !== 'whatsapp_business_account') return res.status(200).json({ ok: true });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Database configuration missing' });
    }
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const phoneId = String(change.value?.metadata?.phone_number_id || '');
        for (const msg of change.value?.messages || []) {
          if (!msg.id || !msg.from || !phoneId) continue;
          const row = {
            message_id: msg.id,
            sender_phone: msg.from,
            phone_number_id: phoneId,
            message_type: msg.type || 'unknown',
            text_body: msg.text?.body || '',
            media_id: msg.document?.id || msg.image?.id || null,
            file_name: msg.document?.filename || null
          };
          const { error } = await db.from('whatsapp_inbox').insert(row);
          if (error?.code === '23505') continue; // Meta retries: already stored
          if (error) throw error;
          const token = process.env.WHATSAPP_ACCESS_TOKEN;
          if (!token || msg.type !== 'text') continue;
          const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneId)}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp', to: msg.from, type: 'text',
              text: { body: 'أهلًا بيك في المروة للطباعة 👋\nوصلتنا رسالتك. جاري تجهيز خدمة الطلبات.' }
            })
          });
          if (!response.ok) {
            console.error('WhatsApp reply failed', response.status, (await response.text()).slice(0, 400));
          }
        }
      }
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('WhatsApp webhook error', err?.message || err);
    return res.status(503).json({ error: 'Webhook processing failed' });
  }
}
