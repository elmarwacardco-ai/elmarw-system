import { createClient } from '@supabase/supabase-js';

const KEYS = new Set(['clients','categories','subCategories','products','orders','employees','folders']);
const PUBLIC = new Set(['categories','subCategories','products']);
const canonical = name => name === 'subcategories' ? 'subCategories' : name;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET','HEAD','POST','PUT','DELETE'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const segments = new URL(req.url, `https://${req.headers.host}`).pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const key = canonical(segments[0] || 'categories');
  const id = segments[1];
  if (!KEYS.has(key) || segments.length > 2) return res.status(404).json({error:'Unknown resource'});
  if ((req.method === 'PUT' || req.method === 'DELETE') && !id) return res.status(400).json({error:'Missing ID'});
  try {
    const url = process.env.SUPABASE_URL;
    const secret = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !secret) return res.status(503).json({error:'Supabase server configuration missing'});
    const db = createClient(url, secret, {auth:{persistSession:false,autoRefreshToken:false}});
    const auth = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    let admin = false;
    if (auth) {
      const {data, error} = await db.auth.getUser(auth[1]);
      if (!error && data?.user) {
        const result = await db.from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle();
        if (result.error) throw result.error;
        admin = !!result.data;
      }
    }
    if (!admin && !(req.method === 'GET' && PUBLIC.has(key))) {
      return res.status(auth ? 403 : 401).json({error:'Admin authentication required'});
    }
    const {data: record,error: readError} = await db.from('app_data').select('data').eq('id',1).maybeSingle();
    if (readError) throw readError;
    if (!record) return res.status(503).json({error:'app_data row 1 is missing; restore the database first'});
    const all = record.data && typeof record.data === 'object' ? record.data : {};
    const list = all[key] ?? (key === 'subCategories' ? all.subcategories : undefined) ?? [];
    if (!Array.isArray(list)) return res.status(500).json({error:'Invalid stored data'});
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (req.method === 'HEAD') return res.status(200).end();
      if (admin) return res.status(200).json(list);
      const filtered = list.map(item => {
        if (key !== 'products') return {id:item.id,name:item.name,categoryId:item.categoryId,subCategoryId:item.subCategoryId,image:item.image};
        return {id:item.id,name:item.name,categoryId:item.categoryId,subCategoryId:item.subCategoryId,image:item.image,pricesB:item.pricesB};
      });
      return res.status(200).json(filtered);
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (req.method !== 'DELETE' && (!body || typeof body !== 'object' || Array.isArray(body))) return res.status(400).json({error:'Invalid JSON payload'});
    if (JSON.stringify(body || {}).length > 3_000_000) return res.status(413).json({error:'File too large; use Supabase Storage for attachments'});
    const {data: result,error: mutationError} = await db.rpc('marwa_mutate_resource',{
      p_resource:key,p_action:req.method,p_id:id || null,p_payload:req.method==='DELETE'?{}:body
    });
    if (mutationError) {
      console.error('Database mutation failed',mutationError.message);
      return res.status(500).json({error:'Database mutation failed; install sql/marwa_mutate_resource.sql'});
    }
    return res.status(req.method === 'POST'?201:200).json(result);
  } catch(error) {
    console.error('API request failed', error?.message);
    return res.status(500).json({error:'API request failed; check Vercel logs'});
  }
}
