import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Only this dedicated Vercel function needs raw request bytes for Meta HMAC.
export const config = { api: { bodyParser: false } };
const MAX_BYTES = 256 * 1024;

function dbFromEnv(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('Supabase server configuration missing');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
export function signatureValid(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || typeof secret !== 'string' || secret.length < 12 ||
      typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const actual = Buffer.from(signature.slice(7), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function receiveRaw(req) {
  let count = 0;
  const chunks = [];
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    count += part.length;
    if (count > MAX_BYTES) throw Object.assign(new Error('Webhook too large'), { status: 413 });
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}
function incomingMessages(payload, env) {
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return [];
  const rows = [];
  for (const entry of payload.entry.slice(0, 20)) {
    if (String(entry?.id || '') !== env.WHATSAPP_WABA_ID) continue;
    for (const change of (Array.isArray(entry.changes) ? entry.changes : []).slice(0, 20)) {
      if (change?.field !== 'messages' ||
          String(change.value?.metadata?.phone_number_id || '') !== env.WHATSAPP_PHONE_NUMBER_ID) continue;
      for (const message of (Array.isArray(change.value.messages) ? change.value.messages : []).slice(0, 30)) {
        const id = String(message?.id || '');
        const phone = String(message?.from || '');
        // Test mode is single-recipient only. Never infer a client identity from WhatsApp 'from'.
        if (!/^wamid\.[A-Za-z0-9+/_=:-]{6,240}$/.test(id) ||
            phone !== env.WHATSAPP_TEST_RECIPIENT) continue;
        const kind = String(message.type || 'unknown').slice(0, 30);
        const file = kind === 'document' ? message.document : null;
        rows.push({
          message_id: id, sender_phone: phone, phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID,
          message_type: kind,
          text_body: kind === 'text' ? String(message.text?.body || '').slice(0, 2000) : '',
          media_id: file?.id ? String(file.id).slice(0, 180) : null,
          file_name: file?.filename ? String(file.filename).slice(0, 180) : null
        });
      }
    }
  }
  return rows;
}
async function trialReply(phone, env, sendFn) {
  if (env.WHATSAPP_AUTO_REPLY !== 'true') return;
  if (!env.WHATSAPP_ACCESS_TOKEN ||
      !/^v[0-9]{1,2}\.[0-9]{1,2}$/.test(env.WHATSAPP_GRAPH_API_VERSION || '')) return;
  const reply = await sendFn('https://graph.facebook.com/' + env.WHATSAPP_GRAPH_API_VERSION +
    '/' + env.WHATSAPP_PHONE_NUMBER_ID + '/messages', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.WHATSAPP_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text',
      text: { body: 'أهلاً بيك في المروة! البوت التجريبي استلم رسالتك. الأوردر الرسمي لا يصدر إلا بعد مراجعة الموظف.' } }),
    signal: AbortSignal.timeout(7000)
  });
  if (!reply.ok) throw new Error('Meta test reply returned ' + reply.status);
}
export async function handleMetaWebhook(req, res, options = {}) {
  const env = options.env || process.env;
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url || '/api/whatsapp-webhook', 'https://elmarwa.local');
  if (req.method === 'GET') {
    const verify = env.WHATSAPP_VERIFY_TOKEN;
    if (typeof verify !== 'string' || verify.length < 16) return res.status(503).send('Verification not configured');
    const challenge = url.searchParams.get('hub.challenge');
    const match = url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === verify &&
      typeof challenge === 'string' && challenge.length > 0 && challenge.length <= 256;
    if (!match) return res.status(403).send('Forbidden');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(challenge);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (env.VERCEL_ENV !== 'preview' || env.ENABLE_META_WHATSAPP_WEBHOOK !== 'true') {
    return res.status(503).json({ error: 'Meta WhatsApp test webhook disabled' });
  }
  if (!env.WHATSAPP_APP_SECRET || env.WHATSAPP_APP_SECRET.length < 12 ||
      !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_WABA_ID || !env.WHATSAPP_TEST_RECIPIENT) {
    return res.status(503).json({ error: 'Meta WhatsApp webhook configuration incomplete' });
  }
  try {
    const bytes = await receiveRaw(req);
    if (!signatureValid(bytes, req.headers?.['x-hub-signature-256'], env.WHATSAPP_APP_SECRET)) {
      return res.status(403).json({ error: 'Invalid Meta signature' });
    }
    let payload;
    try { payload = JSON.parse(bytes.toString('utf8')); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    const rows = incomingMessages(payload, env);
    if (!rows.length) return res.status(200).json({ received: true });
    const db = (options.dbFactory || dbFromEnv)(env);
    for (const row of rows) {
      const { error } = await db.from('whatsapp_inbox').insert(row);
      if (error?.code === '23505') continue; // duplicate Meta delivery
      if (error) throw error;
      if (row.message_type === 'text' &&
          /^(ابدأ|مرحبا|start|hi|hello)$/i.test(row.text_body.trim())) {
        try { await trialReply(row.sender_phone, env, options.sendFn || fetch); }
        catch (sendError) { console.error('Meta trial reply failed:', sendError.message); }
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Meta webhook:', error?.code || error?.message);
    return res.status(error?.status || 503).json({ error: 'Webhook processing unavailable' });
  }
}
export default function handler(req, res) { return handleMetaWebhook(req, res); }
