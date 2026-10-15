import { randomUUID } from 'node:crypto';

const BUCKET = 'elmarwa-orders';
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const ACTIONS = new Map([
  ['claim','claim'], ['heartbeat','heartbeat'],
  ['ready-date','set_ready_date'], ['approve','approve'],
  ['confirmed','confirm'], ['pdf-version','attach']
]);

function response(res, code, error) { return res.status(code).json({ error }); }
function payload(req) {
  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body);
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    throw Object.assign(new Error('JSON object required'), {status: 400});
  }
  if (Buffer.byteLength(JSON.stringify(body)) > 2_950_000) {
    throw Object.assign(new Error('Request too large'), {status:413});
  }
  return body;
}
function pdfFile(input) {
  const name = String(input?.fileName || '').trim();
  if (!name || name.length > 180 || !/\.pdf$/i.test(name)) {
    throw Object.assign(new Error('PDF file name required'), {status:400});
  }
  const raw = input?.fileData;
  if (typeof raw !== 'string' || raw.length > 2_800_000 ||
      !/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(raw)) {
    throw Object.assign(new Error('PDF required, up to 2 MB'), {status:400});
  }
  const bytes = Buffer.from(raw.split(',')[1], 'base64');
  if (bytes.length < 8 || bytes.length > MAX_PDF_BYTES ||
      bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw Object.assign(new Error('Invalid PDF or larger than 2 MB'), {status:400});
  }
  return {name,bytes};
}
function cleanItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 30) {
    throw Object.assign(new Error('Choose 1–30 products'), {status:400});
  }
  return items.map(item => {
    const productId = Number(item?.productId);
    const qty = Number(item?.qty);
    if (!Number.isSafeInteger(productId) || productId < 1 ||
        !Number.isSafeInteger(qty) || qty < 1000 || qty > 10000 || qty % 1000) {
      throw Object.assign(new Error('Invalid product or quantity'), {status:400});
    }
    return {productId,qty}; // Never trust client-submitted totals, tier or price.
  });
}
function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '');
}
function report(draft) {
  if (!draft) return null;
  const approved = draft.approved_at ? Date.parse(draft.approved_at) : null;
  const needReminder = Boolean(draft.status === 'approved' &&
    !draft.confirmation_sent_at && approved &&
    Date.now() - approved >= 10 * 60 * 1000);
  return { ...draft, needsConfirmation: needReminder };
}
async function run(db, draftId, action, actor, extras = {}) {
  const {data,error} = await db.rpc('elmarwa_whatsapp_transition', {
    p_draft_id:draftId,p_action:action,p_actor:actor,p_payload:extras
  });
  if (error) {
    const err = new Error(error.message || 'Draft update failed');
    err.code = error.code;
    throw err;
  }
  return data;
}
async function authenticate(db, req) {
  const matched = String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!matched) return {error:401};
  const {data,error} = await db.auth.getUser(matched[1]);
  if (error || !data?.user) return {error:401};
  const {data:admin,error:authError} = await db.from('admin_users')
    .select('user_id').eq('user_id',data.user.id).maybeSingle();
  if (authError) throw authError;
  if (!admin) return {error:403};
  return {id:data.user.id};
}
async function snapshot(db) {
  const {data,error} = await db.from('app_data').select('data').eq('id',1).maybeSingle();
  if (error || !data?.data) throw new Error('App data not available');
  return data.data;
}
async function uploadPdf(db, file) {
  const path = 'whatsapp-drafts/' + randomUUID() + '.pdf';
  const {error} = await db.storage.from(BUCKET).upload(path,file.bytes,{
    contentType:'application/pdf',upsert:false,cacheControl:'0'
  });
  if (error) throw new Error('Unable to store private PDF');
  return path;
}
async function removePdf(db, path) {
  try { await db.storage.from(BUCKET).remove([path]); }
  catch (err) { console.error('Draft PDF cleanup failed:',err?.message); }
}

// Admin-only until staff login and verified permission profiles are shipped.
// No public WhatsApp webhook is registered by this module.
export async function handleWhatsAppDrafts(req,res,db) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Vary','Authorization');
  if (process.env.ENABLE_WHATSAPP_DRAFTS !== 'true') {
    return response(res,503,'WhatsApp draft review is not enabled');
  }
  if (!['GET','POST'].includes(req.method)) return response(res,405,'Method not allowed');
  const segments = new URL(req.url,'https://elmarwa.local').pathname
    .split('/').filter(Boolean).slice(1);
  // /api/whatsapp-drafts or /api/whatsapp-drafts/:uuid/:action
  if (segments[0] !== 'whatsapp-drafts') return response(res,404,'Unknown draft route');
  try {
    const actor = await authenticate(db,req);
    if (actor.error) return response(res,actor.error,'Administrator access required');
    if (segments.length === 1 && req.method === 'GET') {
      const {data,error} = await db.from('whatsapp_drafts')
        .select('*').order('created_at',{ascending:false}).limit(100);
      if (error) throw error;
      const state = await snapshot(db);
      const clients = Array.isArray(state.clients) ? state.clients : [];
      return res.status(200).json((data || []).map(d => ({
        ...report(d),
        clientName:clients.find(c => String(c.id)===String(d.client_id))?.name || 'عميل غير معروف',
        clientPhone:clients.find(c => String(c.id)===String(d.client_id))?.phone || ''
      })));
    }
    if (req.method === 'GET' && segments.length === 4 &&
        isUuid(segments[1]) && segments[2] === 'file' && /^[1-9]\d*$/.test(segments[3])) {
      const {data:draft,error} = await db.from('whatsapp_drafts')
        .select('file_versions').eq('id',segments[1]).maybeSingle();
      if (error) throw error;
      if (!draft) return response(res,404,'Draft not found');
      const file = (draft.file_versions || []).find(f => Number(f.version) === Number(segments[3]));
      if (!file?.path || !/^whatsapp-drafts\/[0-9a-f-]{36}\.pdf$/.test(file.path)) {
        return response(res,404,'PDF not found');
      }
      const {data:signed,error:signError} = await db.storage.from(BUCKET)
        .createSignedUrl(file.path,60,{download:true});
      if (signError || !signed?.signedUrl) return response(res,503,'Unable to open private PDF');
      return res.status(200).json({url:signed.signedUrl,fileName:file.fileName});
    }
    if (segments.length === 1 && req.method === 'POST') {
      const body = payload(req);
      const clientId = Number(body.clientId);
      const workerName = String(body.workerName || '').trim().slice(0,120);
      const notes = String(body.notes || '').trim().slice(0,1200);
      const items = cleanItems(body.items);
      const file = pdfFile(body);
      if (!Number.isSafeInteger(clientId) || clientId < 1 || !workerName) {
        return response(res,400,'Verified client and job name are required');
      }
      const state = await snapshot(db);
      const customer = (state.clients || []).find(c => Number(c.id) === clientId);
      if (!customer?.authUserId || customer.phoneVerified !== true) {
        return response(res,400,'Verified client required');
      }
      const products = state.products || [];
      if (items.some(it => !products.some(p => Number(p.id) === it.productId))) {
        return response(res,400,'Product no longer available');
      }
      const path = await uploadPdf(db,file);
      try {
        const now = new Date().toISOString();
        const {data,error} = await db.from('whatsapp_drafts').insert({
          client_id:clientId,worker_name:workerName,items,notes,
          file_versions:[{version:1,path,fileName:file.name,uploadedBy:actor.id,uploadedAt:now}],
          approved_file_path:path,
          status:'draft'
        }).select('*').single();
        if (error) throw error;
        return res.status(201).json(report(data));
      } catch (error) {
        await removePdf(db,path);
        throw error;
      }
    }
    if (req.method !== 'POST' || segments.length !== 3 ||
      !isUuid(segments[1]) || !ACTIONS.has(segments[2])) {
      return response(res,404,'Unknown draft action');
    }
    const draftId = segments[1];
    const action = ACTIONS.get(segments[2]);
    let extras = {};
    if (['set_ready_date','attach'].includes(action)) {
      extras = payload(req);
    }
    if (action === 'attach') {
      const file = pdfFile(extras);
      // Fast precheck before uploading; transaction RPC verifies ownership again.
      const {data:d,error} = await db.from('whatsapp_drafts')
        .select('lock_owner,lock_activity,status').eq('id',draftId).maybeSingle();
      if (error) throw error;
      if (!d) return response(res,404,'Draft not found');
      const active = d.lock_activity && Date.now()-Date.parse(d.lock_activity) < 15*60*1000;
      if (d.status !== 'draft' || d.lock_owner !== actor.id || !active) {
        return response(res,409,'Claim the draft before uploading corrected PDF');
      }
      const path = await uploadPdf(db,file);
      try {
        return res.status(200).json(report(await run(db,draftId,action,actor.id,{
          path,fileName:file.name
        })));
      } catch (error) {
        await removePdf(db,path);
        throw error;
      }
    }
    const updated = await run(db,draftId,action,actor.id,
      action === 'set_ready_date' ? {readyDate:String(extras.readyDate || '')} : {});
    if (action === 'approve') {
      return res.status(200).json({
        draft:report(updated.draft),
        order:updated.order || null,
        orderId:updated.orderId || updated.order?.id || null
      });
    }
    return res.status(200).json(report(updated));
  } catch(error) {
    console.error('WhatsApp drafts API:',error.code || error.message);
    if (error.code === '55P03') return response(res,409,'Draft is currently locked or claim has expired');
    if (error.code === 'P0002') return response(res,404,'Draft not found');
    if (error.code === '22023') return response(res,400,error.message);
    if (error.code === '23505') return response(res,409,'Duplicate draft or order');
    if (error.code === '42501') return response(res,403,'Administrator access required');
    if (error.code === 'PGRST202' || error.code === '42P01') {
      return response(res,503,'WhatsApp draft migration is missing');
    }
    return response(res,error.status || 500,error.status ? error.message : 'WhatsApp draft operation failed');
  }
}
