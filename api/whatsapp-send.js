import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const key = process.env.WHATSAPP_WORKER_SECRET;
  const authorization = req.headers.authorization;
  if (!key || authorization !== 'Bearer ' + key) return res.status(401).end();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY ||
      !process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return res.status(503).json({ error: 'Worker configuration missing' });
  }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const now = new Date().toISOString();
  const { data: rows, error } = await db.from('whatsapp_outbound_messages')
    .select('inbound_message_id,wa_id,body,attempts')
    .in('status', ['pending', 'failed']).lte('next_attempt_at', now)
    .order('next_attempt_at', { ascending: true }).limit(10);
  if (error) return res.status(503).json({ error: 'Queue unavailable' });
  let sent = 0, failed = 0;
  for (const row of rows || []) {
    const leaseUntil = new Date(Date.now() + 60000).toISOString();
    const { data: claimed, error: claimError } = await db.from('whatsapp_outbound_messages')
      .update({ status: 'sending', lease_until: leaseUntil, attempts: row.attempts + 1 })
      .eq('inbound_message_id', row.inbound_message_id)
      .in('status', ['pending','failed']).lte('next_attempt_at', now)
      .select('inbound_message_id');
    if (claimError || !claimed?.length) continue;
    try {
      const response = await fetch('https://graph.facebook.com/v23.0/' +
        encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID) + '/messages', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN,
          'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: row.wa_id,
          type: 'text', text: { body: row.body } }),
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error('Meta HTTP ' + response.status);
      await db.from('whatsapp_outbound_messages').update({
        status: 'sent', sent_at: new Date().toISOString(), lease_until: null,
        last_error: null
      }).eq('inbound_message_id', row.inbound_message_id).eq('status','sending');
      sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      await db.from('whatsapp_outbound_messages').update({
        status: 'failed', lease_until: null,
        next_attempt_at: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7))).toISOString(),
        last_error: String(err?.message || 'Send failed').slice(0, 150)
      }).eq('inbound_message_id', row.inbound_message_id).eq('status','sending');
      failed++;
    }
  }
  return res.status(200).json({ processed: (rows || []).length, sent, failed });
}
