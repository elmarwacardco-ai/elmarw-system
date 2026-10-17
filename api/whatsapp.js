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
  return res.status(200).json({ received: true });
}
