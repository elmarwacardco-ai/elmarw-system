import { randomUUID, randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'elmarwa-orders';
const PAYMENT_BUCKET = 'elmarwa-payment-proofs';
const MAX_FILE = 2 * 1024 * 1024;
const PHONE = /^01\d{9}$/;
const toE164 = phone => '+20' + phone.slice(1);
function publicAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Public Supabase auth is not configured');
  return createClient(url, key, {auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}
const QTY = new Set([1000,2000,3000,4000,5000,6000,7000,8000,9000,10000]);

function respond(res, status, message) {
  return res.status(status).json({ error: message });
}
function parse(req) {
  const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid request');
  return value;
}
function safeClient(c) {
  return {
    id: c.id, name: c.name, phone: c.phone, company: c.company,
    address: c.address, type: c.type === 'VIP' ? 'VIP' : 'B',
    balance: Number(c.balance) || 0
  };
}
function parsePrices(p) {
  if (p && typeof p === 'object' && !Array.isArray(p)) return p;
  try { const obj = JSON.parse(p); return obj && typeof obj === 'object' ? obj : {}; }
  catch { return {}; }
}
async function readData(db) {
  const { data, error } = await db.from('app_data').select('data').eq('id', 1).single();
  if (error) throw error;
  return data.data;
}
async function mutate(db, resource, method, id, payload) {
  const { data, error } = await db.rpc('elmarwa_mutate', {
    p_resource: resource, p_method: method, p_id: id ?? null, p_payload: payload
  });
  if (error) throw error;
  return data;
}
async function login(db, phone, password, auth = publicAuthClient()) {
  const { data, error } = await auth.auth.signInWithPassword({
    phone: toE164(phone), password
  });
  if (error || !data?.session?.access_token) return null;
  const snapshot = await readData(db);
  const client = (snapshot.clients || []).find(c => c.authUserId === data.user.id && c.phoneVerified === true);
  if (!client || !data.user.phone_confirmed_at || data.user.phone !== toE164(phone)) return null;
  return { access_token: data.session.access_token, client: safeClient(client) };
}
async function identity(db, req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const { data, error } = await db.auth.getUser(match[1]);
  if (error || !data?.user) return null;
  const snapshot = await readData(db);
  const client = (snapshot.clients || []).find(c => c.authUserId === data.user.id && c.phoneVerified === true && c.phone === ('0' + String(data.user.phone || '').replace(/^\+20/, '')));
  return { user: data.user, client, snapshot };
}
function serialNumber(orders) {
  const date = new Date();
  const prefix = 'M-' + String(date.getUTCFullYear()).slice(-2) + String(date.getUTCMonth() + 1).padStart(2,'0') + '-';
  let serial;
  do { serial = prefix + String(randomInt(0, 1000000)).padStart(6,'0'); }
  while (orders.some(o => o.serialNumber === serial));
  return serial;
}
async function verifyRegistrationCaptcha(token, req) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error('Turnstile is not configured');
  if (typeof token !== 'string' || token.length < 20 || token.length > 2048) return false;
  const payload = new URLSearchParams({secret, response:token});
  const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  if (ip && /^[0-9a-f:.]+$/i.test(ip)) payload.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method:'POST', body:payload, signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true;
}
function checkPdf(input) {
  if (typeof input !== 'string' || input.length > 2_800_000) throw new Error('ملف PDF أكبر من الحد المسموح');
  const match = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match) throw new Error('مطلوب ملف PDF صحيح');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > MAX_FILE || bytes.subarray(0,5).toString() !== '%PDF-') {
    throw new Error('ملف PDF غير صالح أو أكبر من 2 ميجابايت');
  }
  return bytes;
}
function checkPaymentImage(value) {
  if (typeof value !== 'string' || value.length > 1_400_000) throw new Error('الصورة أكبر من الحد المسموح');
  const match = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('ارفع صورة PNG أو JPEG');
  const bytes = Buffer.from(match[2], 'base64');
  const png = bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
  const jpg = bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
  if (bytes.length > 1024 * 1024 || !bytes.length || (match[1] === 'image/png' ? !png : !jpg)) {
    throw new Error('صورة إثبات الدفع غير صالحة أو أكبر من 1 ميجابايت');
  }
  return {bytes,mime:match[1],extension:png?'png':'jpg'};
}
function validLines(lines, products, tier) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 30) throw new Error('السلة غير صحيحة');
  return lines.map((line, i) => {
    const product = products.find(p => String(p.id) === String(line.productId));
    const qty = Number(line.qty);
    if (!product || !QTY.has(qty)) throw new Error('منتج أو كمية غير صالحة');
    const prices = parsePrices(tier === 'VIP' ? product.pricesVIP : product.pricesB);
    const price = Number(prices[qty]);
    if (!Number.isFinite(price) || price <= 0) throw new Error('السعر غير متاح لهذه الكمية');
    return {
      id: i + 1, productId: product.id, subCategoryId: product.subCategoryId,
      name: product.name, image: product.image || '', qty, price, total: price
    };
  });
}

export async function handleCustomerRequest(req, res, db, authFactory = publicAuthClient, captchaVerifier = verifyRegistrationCaptcha) {
  const parts = new URL(req.url, 'https://elmarwa.local').pathname.split('/').filter(Boolean);
  const action = parts[2];
  const fileOrderId = parts[3];
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (action === 'register' && req.method === 'POST') {
      // Only activate in Supabase after SMS verification and CAPTCHA are configured.
      if (process.env.ENABLE_CUSTOMER_SIGNUP !== 'true') {
        return respond(res, 503, 'تسجيل العملاء متوقف مؤقتًا لحين تفعيل الحماية');
      }
      const body = parse(req);
      const phone = String(body.phone || '').trim();
      const password = String(body.pass || '');
      const name = String(body.name || '').trim();
      const company = String(body.company || '').trim();
      const address = String(body.address || '').trim();
      const captchaToken = String(body.captchaToken || '');
      if (!PHONE.test(phone) || password.length < 8 || password.length > 72 ||
          !name || name.length > 120 || !company || company.length > 120 ||
          !address || address.length > 250 || captchaToken.length < 20) {
        return respond(res, 400, 'راجع البيانات وأكمل التحقق من الأمان وكلمة المرور');
      }
      const current = await readData(db);
      if ((current.clients || []).some(c => c.phone === phone)) {
        return respond(res, 409, 'الرقم مسجل بالفعل. الحسابات القديمة تحتاج إعادة تفعيل آمنة.');
      }
      const verifiedCaptcha = await captchaVerifier(captchaToken, req);
      if (!verifiedCaptcha) return respond(res, 400, 'التحقق الأمني لم ينجح؛ حاول مرة أخرى');
      const auth = authFactory();
      const { error } = await auth.auth.signUp({
        phone: toE164(phone), password,
        options: {
          data: {elmarwa_name:name, elmarwa_company:company, elmarwa_address:address}
        }
      });
      if (error) return respond(res, 400, 'لم يتم إرسال رمز SMS. راجع إعدادات الرسائل وحاول مرة أخرى');
      return res.status(202).json({verification_required:true});
    }
    if (action === 'verify' && req.method === 'POST') {
      if (process.env.ENABLE_CUSTOMER_SIGNUP !== 'true') {
        return respond(res, 503, 'تفعيل الحسابات الجديدة متوقف مؤقتًا');
      }
      const body = parse(req);
      const phone = String(body.phone || '').trim();
      const code = String(body.code || '').trim();
      if (!PHONE.test(phone) || !/^\d{6,8}$/.test(code)) {
        return respond(res, 400, 'رقم الهاتف أو رمز SMS غير صحيح');
      }
      const auth = authFactory();
      const { data, error } = await auth.auth.verifyOtp({
        phone: toE164(phone), token: code, type: 'sms'
      });
      if (error || !data?.user?.id || !data?.session?.access_token ||
          data.user.phone !== toE164(phone) || !data.user.phone_confirmed_at) {
        return respond(res, 401, 'رمز SMS غير صحيح أو منتهي الصلاحية');
      }
      const current = await readData(db);
      const existing = (current.clients || []).find(c => c.phone === phone);
      if (existing && existing.authUserId !== data.user.id) {
        return respond(res, 409, 'هذا الرقم مرتبط بحساب قديم؛ تواصل مع الإدارة لتفعيله');
      }
      if (!existing) {
        const metadata = data.user.user_metadata || {};
        const name = String(metadata.elmarwa_name || '').trim().slice(0,120);
        const company = String(metadata.elmarwa_company || '').trim().slice(0,120);
        const address = String(metadata.elmarwa_address || '').trim().slice(0,250);
        if (!name || !company || !address) return respond(res, 400, 'بيانات التسجيل غير مكتملة');
        try {
          await mutate(db,'clients','POST',null,{
            name, phone, company, address, type:'B', balance:0,
            authUserId:data.user.id, phoneVerified:true
          });
        } catch (error) {
          if (error.code !== '23505') throw error;
          const reread = await readData(db);
          if (!(reread.clients || []).some(c => c.phone === phone && c.authUserId === data.user.id)) {
            return respond(res, 409, 'الرقم مستخدم في حساب آخر');
          }
        }
      }
      const after = await readData(db);
      const client = (after.clients || []).find(c => c.phone === phone && c.authUserId === data.user.id);
      if (!client) return respond(res, 503, 'تم التأكيد لكن تعذر تفعيل ملف العميل');
      return res.status(201).json({access_token:data.session.access_token, client:safeClient(client)});
    }
    if (action === 'login' && req.method === 'POST') {
      const body = parse(req);
      const phone = String(body.phone || '').trim();
      if (!PHONE.test(phone) || typeof body.pass !== 'string') return respond(res, 400, 'بيانات الدخول غير صحيحة');
      const session = await login(db, phone, body.pass, authFactory());
      if (!session) return respond(res, 401, 'بيانات الدخول غير صحيحة أو الحساب يحتاج تفعيل');
      return res.status(200).json(session);
    }

    const actor = await identity(db, req);
    if (!actor) return respond(res, 401, 'سجّل الدخول أولاً');
    if (['file','proof'].includes(action) && req.method === 'GET' && /^\d+$/.test(fileOrderId || '')) {
      let permitted = Boolean(actor.client);
      if (!permitted) {
        const { data, error } = await db.from('admin_users')
          .select('user_id').eq('user_id',actor.user.id).maybeSingle();
        if (error) throw error;
        permitted = Boolean(data);
      }
      if (!permitted) return respond(res, 403, 'غير مصرح');
      const order = (actor.snapshot.orders || []).find(o => String(o.id) === fileOrderId);
      if (!order || (actor.client && String(order.clientId) !== String(actor.client.id))) {
        return respond(res, 404, 'الملف غير متاح');
      }
      const path = action === 'file' ? order.filePath : order.paymentProofPath;
      const bucket = action === 'file' ? BUCKET : PAYMENT_BUCKET;
      if (!path) return respond(res, 404, 'الملف غير متاح');
      const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 60, {download: true});
      if (error) throw error;
      return res.status(200).json({ url: data.signedUrl });
    }
    if (!actor.client) return respond(res, 403, 'حساب عميل مطلوب');

    if (action === 'me' && req.method === 'GET') {
      return res.status(200).json({ client: safeClient(actor.client) });
    }
    if (action === 'catalog' && req.method === 'GET') {
      const products = (actor.snapshot.products || []).map(p => ({
        id: p.id, name: p.name, image: p.image || '',
        categoryId: p.categoryId, subCategoryId: p.subCategoryId,
        pricesB: parsePrices(p.pricesB),
        ...(actor.client.type === 'VIP' ? { pricesVIP: parsePrices(p.pricesVIP) } : {})
      }));
      return res.status(200).json(products);
    }
    if (action === 'orders' && req.method === 'GET') {
      const orders = (actor.snapshot.orders || []).filter(o => String(o.clientId) === String(actor.client.id));
      return res.status(200).json(orders);
    }
    if (action === 'payment-proof' && req.method === 'POST' && /^\d+$/.test(fileOrderId || '')) {
      const order = (actor.snapshot.orders || []).find(o =>
        String(o.id) === fileOrderId && String(o.clientId) === String(actor.client.id)
      );
      if (!order) return respond(res, 404, 'الطلب غير موجود');
      const image = checkPaymentImage(parse(req).fileData);
      const path = actor.user.id + '/' + randomUUID() + '.' + image.extension;
      const { error: uploadError } = await db.storage.from(PAYMENT_BUCKET).upload(path, image.bytes, {
        contentType: image.mime, upsert: false, cacheControl: '0'
      });
      if (uploadError) return respond(res, 503, 'تعذر رفع إثبات الدفع');
      try {
        const updated = await mutate(db, 'orders','PUT',Number(fileOrderId), {
          paymentProof: 'صورة التحويل مرفوعة',
          paymentProofPath: path
        });
        return res.status(200).json(updated);
      } catch (error) {
        await db.storage.from(PAYMENT_BUCKET).remove([path]).catch(() => null);
        throw error;
      }
    }
    if (action === 'orders' && req.method === 'POST') {
      const body = parse(req);
      const bytes = checkPdf(body.fileData);
      const lines = validLines(body.items, actor.snapshot.products || [], actor.client.type);
      const filename = String(body.fileName || 'order.pdf').slice(0,180);
      if (!filename.toLowerCase().endsWith('.pdf')) return respond(res,400,'اسم الملف لازم ينتهي بـ PDF');
      const workerName = String(body.workerName || '').trim().slice(0,120);
      const notes = String(body.notes || '').trim().slice(0,2000);
      const method = ['نقدي','فودافون كاش','انستا باي','تحويل بنكي','آجل'].includes(body.paymentMethod)
        ? body.paymentMethod : 'نقدي';
      const path = actor.user.id + '/' + randomUUID() + '.pdf';
      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, bytes, {
        contentType: 'application/pdf', upsert: false, cacheControl: '0'
      });
      if (uploadError) return respond(res,503,'تعذر حفظ PDF على مساحة التخزين الخاصة');
      let saved;
      try {
        const now = new Date();
        saved = await mutate(db,'orders','POST',null,{
          serialNumber: serialNumber(actor.snapshot.orders || []),
          executionDate: now.toISOString().slice(0,10), readyDate: '',
          clientName: actor.client.name, clientPhone: actor.client.phone,
          clientId: actor.client.id, workerName, items: lines,
          total: lines.reduce((total,line)=>total + line.total,0),
          paidAmount: 0, paymentStatus: 'غير مدفوع', paymentMethod: method,
          paymentProof: '', notes, status: 'جديد',
          date: now.toISOString(), fileName: filename, filePath: path
        });
      } catch (error) {
        await db.storage.from(BUCKET).remove([path]).catch(() => null);
        throw error;
      }
      return res.status(201).json(saved);
    }
    return respond(res, 404, 'Unknown customer endpoint');
  } catch (error) {
    console.error('Customer API:', error.code || error.message);
    if (error.code === 'PGRST202') return respond(res, 503, 'مطلوب تطبيق ملف SQL على Supabase');
    if (error.code === '23505') return respond(res, 409, 'البيانات مسجلة بالفعل');
    if ([
      'ملف PDF أكبر من الحد المسموح',
      'مطلوب ملف PDF صحيح',
      'ملف PDF غير صالح أو أكبر من 2 ميجابايت',
      'السلة غير صحيحة',
      'منتج أو كمية غير صالحة',
      'السعر غير متاح لهذه الكمية',
      'الصورة أكبر من الحد المسموح',
      'ارفع صورة PNG أو JPEG',
      'صورة إثبات الدفع غير صالحة أو أكبر من 1 ميجابايت'
    ].includes(error.message)) return respond(res, 400, error.message);
    if (error.message === 'Invalid request') return respond(res, 400, 'Invalid JSON request');
    return respond(res, 500, 'تعذر إتمام العملية');
  }
}
