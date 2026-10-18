import { createClient } from '@supabase/supabase-js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token) return res.status(401).json({error:'Login required'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({error:'Database not configured'});
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth?.user) return res.status(401).json({error:'Invalid session'});
  const {data:admin,error:permissionError}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
  if(permissionError) return res.status(503).json({error:'Permission lookup unavailable'});
  if(!admin) return res.status(403).json({error:'Manager access required'});
  if(req.method==='POST'){
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(body?.action!=='lock'||!/^[0-9a-f-]{36}$/i.test(body?.draftId||'')) return res.status(400).json({error:'Invalid review action'});
    const reviewer=auth.user.id;
    const cutoff=new Date(Date.now()-15*60*1000).toISOString();
    // Conditional update: an active lock held by someone else must not be overwritten.
    const {data:updated,error:lockError}=await db.from('whatsapp_order_drafts')
      .update({assigned_employee_id:reviewer,review_locked_at:new Date().toISOString(),status:'in_review',updated_at:new Date().toISOString()})
      .eq('id',body.draftId)
      .in('status',['pending_review','in_review','returned'])
      .or('assigned_employee_id.is.null,assigned_employee_id.eq.'+reviewer+',review_locked_at.is.null,review_locked_at.lt.'+cutoff)
      .select('id,wa_id,status,assigned_employee_id,review_locked_at').maybeSingle();
    if(lockError)return res.status(503).json({error:'Unable to lock draft'});
    if(!updated)return res.status(409).json({error:'Draft is locked by another reviewer or not ready'});
    return res.status(200).json({draft:updated});
  }
  const {data,error}=await db.from('whatsapp_order_drafts').select('id,wa_id,status,step,job_name,quantity,pdf_filename,created_at,last_activity_at').order('created_at',{ascending:false}).limit(100);
  if(error) return res.status(503).json({error:'Draft list unavailable'});
  return res.status(200).json({drafts:data||[]});
}
