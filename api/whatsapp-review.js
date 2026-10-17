import { createClient } from '@supabase/supabase-js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token) return res.status(401).json({error:'Login required'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({error:'Database not configured'});
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth?.user) return res.status(401).json({error:'Invalid session'});
  const {data:admin,error:permissionError}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
  if(permissionError) return res.status(503).json({error:'Permission lookup unavailable'});
  if(!admin) return res.status(403).json({error:'Manager access required'});
  const {data,error}=await db.from('whatsapp_order_drafts').select('id,wa_id,status,step,job_name,quantity,pdf_filename,created_at,last_activity_at').order('created_at',{ascending:false}).limit(100);
  if(error) return res.status(503).json({error:'Draft list unavailable'});
  return res.status(200).json({drafts:data||[]});
}
