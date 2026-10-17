import { createHmac, timingSafeEqual } from 'node:crypto';

// Meta webhook handshake and signature validation.
// Incoming events are intentionally NOT acknowledged until durable processing is implemented.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (expected && mode === 'subscribe' && token === expected && typeof challenge === 'string') {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Verification failed');
  }
  if (req.method !== 'POST') return res.status(405).end();
  const secret = process.env.META_APP_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook not configured' });
  const signature = req.headers['x-hub-signature-256'];
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return res.status(401).end();
  }
  // Vercel may parse JSON before handler invocation. Use rawBody only when available;
  // never verify a reserialized JSON object because it changes the signed bytes.
  const raw = req.rawBody;
  if (!raw || !(Buffer.isBuffer(raw) || typeof raw === 'string')) {
    return res.status(503).json({ error: 'Raw request body unavailable' });
  }
  const digest = createHmac('sha256', secret).update(raw).digest('hex');
  if (!timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), Buffer.from(digest, 'hex'))) {
    return res.status(401).end();
  }
  // Deliberately retryable until durable event ingestion + idempotency are deployed.
  return res.status(503).json({ error: 'Message ingestion not enabled yet' });
}
