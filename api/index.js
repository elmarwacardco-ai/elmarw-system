import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

const resources = new Set([
  'clients', 'categories', 'subcategories', 'products',
  'orders', 'employees', 'folders'
]);
const publicResources = new Set(['categories', 'subcategories', 'products']);
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Database configuration missing');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function jsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function phoneFormat(phone) {
  const value = String(phone || '').trim().replace(/\s+/g, '');
  return /^01[0125]\d{8}$/.test(value) ? value : null;
}
function e164(phone) { return '+2' + phone; }
function publicClient(c) {
  if (!c) return null;
  const { pass, password, ...safe } = c;
  return safe;
}
function publicProduct(p, allowVip = false) {
  const { pricesVIP, ...safe } = p;
  return allowVip ? { ...safe, pricesVIP } : safe;
}
async function snapshot(db) {
  const { data, error } = await db.from('app_data')
    .select('data').eq('id', 1).maybeSingle();
  if (error || !data || typeof data.data !== 'object') {
    throw new Error('App data not available');
  }
  return data.data;
}
function collection(data, key) {
  const value = data[key === 'subcategories' ? 'subCategories' : key] || [];
  if (!Array.isArray(value)) throw new Error('Invalid collection data');
  return value;
}
async function authenticate(db, req, data) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return { user: null, admin: false, client: null };
  const { data: result, error } = await db.auth.getUser(match[1]);
  if (error || !result?.user) return { user: null, admin: false, client: null };
  const user = result.user;
  const { data: row, error: adminError } = await db.from('admin_users')
    .select('user_id').eq('user_id', user.id).maybeSingle();
  if (adminError) throw new Error('Permission lookup failed');
  const client = collection(data, 'clients')
    .find(c => c.authUserId === user.id) || null;
  return { user, admin: Boolean(row), client };
}
async function mutate(db, resource, method, payload = {}, id = null) {
  const { data, error } = await db.rpc('elmarwa_mutate', {
    p_resource: resource, p_method: method, p_id: id, p_payload: payload
  });
  if (error) {
    const err = new Error(error.message || 'Data could not be saved');
    err.code = error.code;
    throw err;
  }
  return data;
}
function errorReply(res, error) {
  if (error?.code === '23505') return res.status(409).json({ error: error.message });
  if (error?.code === 'P0002') return res.status(404).json({ error: 'Record not found' });
  console.error('Elmarwa API:', error?.message);
  return res.status(500).json({ error: 'Unable to complete request' });
}
function newSerial() {
  const now = new Date();
  const part = String(now.getUTCFullYear()).slice(-2)
    + String(now.getUTCMonth() + 1).padStart(2, '0');
  return 'M-' + part + '-' + String(randomInt(0, 1000000)).padStart(6, '0');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('Allow', [...methods].join(', '));
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!methods.has(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const segments = new URL(req.url, 'https://' + req.headers.host)
    .pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const resource = (segments[0] || '').toLowerCase();
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  if (!['catalog', 'auth', 'me', 'my-orders', ...resources].includes(resource)) {
    return res.status(404).json({ error: 'Unknown resource' });
  }
  const body = ['POST', 'PUT', 'PATCH'].includes(method) ? jsonBody(req) : {};
  if (['POST', 'PUT', 'PATCH'].includes(method) && !body) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  let db;
  try { db = database(); } catch (error) { return errorReply(res, error); }

  // Public customer signup: Supabase Auth holds the password, never app_data.
  if (resource === 'auth' && segments[1] === 'register' && method === 'POST') {
    const phone = phoneFormat(body.phone);
    const name = String(body.name || '').trim();
    const company = String(body.company || '').trim();
    const address = String(body.address || '').trim();
    const password = String(body.pass || '');
    if (!phone || name.length < 2 || name.length > 120 ||
        !company || company.length > 120 || !address || address.length > 300 ||
        password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'راجع بيانات التسجيل؛ كلمة المرور 8 حروف على الأقل' });
    }
    try {
      const current = await snapshot(db);
      if (collection(current, 'clients').some(c => c.phone === phone)) {
        return res.status(409).json({ error: 'رقم الهاتف مسجل بالفعل' });
      }
      const { data: created, error: authError } = await db.auth.admin.createUser({
        phone: e164(phone), password, phone_confirm: true
      });
      if (authError || !created?.user) {
        return res.status(409).json({ error: 'تعذر إنشاء الحساب؛ راجع الهاتف أو تواصل مع الإدارة' });
      }
      try {
        const saved = await mutate(db, 'clients', 'POST', {
          authUserId: created.user.id, name, phone, company, address,
          type: 'B', balance: 0
        });
        return res.status(201).json({ client: publicClient(saved) });
      } catch (error) {
        await db.auth.admin.deleteUser(created.user.id).catch(() => {});
        return errorReply(res, error);
      }
    } catch (error) { return errorReply(res, error); }
  }

  if (resource === 'auth' && segments[1] === 'login' && method === 'POST') {
    const phone = phoneFormat(body.phone);
    if (!phone || typeof body.pass !== 'string') {
      return res.status(400).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }
    try {
      const { data: login, error } = await db.auth.signInWithPassword({
        phone: e164(phone), password: body.pass
      });
      if (error || !login?.session) {
        return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
      }
      const data = await snapshot(db);
      const client = collection(data, 'clients')
        .find(c => c.authUserId === login.user?.id);
      if (!client) return res.status(403).json({ error: 'الحساب غير مفعل داخل النظام' });
      return res.status(200).json({
        client: publicClient(client),
        access_token: login.session.access_token,
        refresh_token: login.session.refresh_token,
        expires_at: login.session.expires_at
      });
    } catch (error) { return errorReply(res, error); }
  }
  if (resource === 'auth') return res.status(404).json({ error: 'Unknown auth route' });

  try {
    const data = await snapshot(db);
    const auth = await authenticate(db, req, data);

    if (resource === 'catalog' && method === 'GET') {
      const result = {
        categories: collection(data, 'categories'),
        subCategories: collection(data, 'subcategories'),
        products: collection(data, 'products')
          .map(p => publicProduct(p, auth.admin || auth.client?.type === 'VIP'))
      };
      return req.method === 'HEAD' ? res.status(200).end() : res.status(200).json(result);
    }

    if (resource === 'me' && method === 'GET') {
      if (!auth.client) return res.status(401).json({ error: 'Login required' });
      return res.status(200).json(publicClient(auth.client));
    }

    if (resource === 'my-orders' && method === 'GET') {
      if (!auth.client) return res.status(401).json({ error: 'Login required' });
      const my = collection(data, 'orders')
        .filter(o => String(o.clientId) === String(auth.client.id))
        .map(({ fileData, ...safe }) => safe);
      return res.status(200).json(my);
    }

    if (resource === 'orders' && method === 'POST' && auth.client && !auth.admin) {
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 30) {
        return res.status(400).json({ error: 'اختر منتجاً واحداً على الأقل' });
      }
      const filename = String(body.fileName || '');
      const fileData = String(body.fileData || '');
      if (!/\.pdf$/i.test(filename) || filename.length > 180 ||
          !/^data:application\/pdf;base64,/.test(fileData)) {
        return res.status(400).json({ error: 'ملف PDF مطلوب' });
      }
      const bytes = Buffer.from(fileData.split(',')[1], 'base64');
      if (!bytes.length || bytes.length > 2 * 1024 * 1024 ||
          bytes.subarray(0, 5).toString() !== '%PDF-') {
        return res.status(413).json({ error: 'PDF غير صالح أو أكبر من 2 ميجابايت' });
      }
      const products = collection(data, 'products');
      const items = [];
      let total = 0;
      for (const item of body.items) {
        const prod = products.find(p => String(p.id) === String(item.productId));
        const qty = Number(item.qty);
        if (!prod || !Number.isInteger(qty) || qty < 1000 || qty > 10000 || qty % 1000) {
          return res.status(400).json({ error: 'منتج أو كمية غير صالحة' });
        }
        let priceMap = auth.client.type === 'VIP' ? prod.pricesVIP : prod.pricesB;
        if (typeof priceMap === 'string') {
          try { priceMap = JSON.parse(priceMap); } catch { priceMap = {}; }
        }
        const price = Number(priceMap?.[qty]);
        if (!Number.isFinite(price) || price <= 0) {
          return res.status(400).json({ error: 'المنتج ليس له سعر للكمية المطلوبة' });
        }
        total += price;
        items.push({
          productId: prod.id, subCategoryId: prod.subCategoryId,
          name: prod.name, image: prod.image || '', qty, price, total: price
        });
      }
      const workerName = String(body.workerName || '').trim().slice(0, 120);
      const notes = String(body.notes || '').trim().slice(0, 1000);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const order = await mutate(db, 'orders', 'POST', {
            serialNumber: newSerial(),
            executionDate: new Date().toISOString().slice(0, 10),
            readyDate: '', clientName: auth.client.name,
            clientPhone: auth.client.phone, clientId: auth.client.id,
            workerName, items, total, paidAmount: 0,
            paymentStatus: 'غير مدفوع',
            paymentMethod: ['نقدي', 'فودافون كاش'].includes(body.paymentMethod)
              ? body.paymentMethod : 'نقدي',
            paymentProof: '', notes, status: 'جديد',
            date: new Date().toLocaleString('ar-EG'),
            fileName: filename, fileData
          });
          const { fileData: ignored, ...safeOrder } = order;
          return res.status(201).json(safeOrder);
        } catch (error) {
          if (error.code !== '23505' || attempt === 2) return errorReply(res, error);
        }
      }
    }

    if (!resources.has(resource)) return res.status(405).json({ error: 'Method not allowed' });
    if (!auth.user) return res.status(401).json({ error: 'Login required' });

    if (method === 'GET' && publicResources.has(resource) && !auth.admin) {
      const entries = collection(data, resource);
      return res.status(200).json(resource === 'products'
        ? entries.map(p => publicProduct(p, auth.client?.type === 'VIP')) : entries);
    }
    if (!auth.admin) return res.status(403).json({ error: 'Admin access required' });

    if (method === 'GET') {
      const entries = collection(data, resource);
      const safe = resource === 'clients' ? entries.map(publicClient) : entries;
      return req.method === 'HEAD' ? res.status(200).end() : res.status(200).json(safe);
    }

    const id = segments[1] === undefined ? null : Number(segments[1]);
    if (method !== 'POST' && (!Number.isSafeInteger(id) || id <= 0)) {
      return res.status(400).json({ error: 'Valid ID required' });
    }
    if (method === 'POST' && segments.length > 1) {
      return res.status(400).json({ error: 'Unexpected ID' });
    }
    if (method === 'POST' && resource === 'categories') {
      const name = String(body.name || '').trim();
      if (!name || name.length > 120) {
        return res.status(400).json({ error: 'اكتب اسم قسم صحيح' });
      }
      const { data: created, error } = await db.rpc('append_main_category', { p_name: name });
      if (error) return errorReply(res, error);
      return res.status(201).json(created);
    }
    const payload = method === 'DELETE' ? {} : { ...body };
    delete payload.id;
    delete payload.authUserId;
    delete payload.pass;
    delete payload.password;
    if (method === 'POST' && resource === 'clients') {
      return res.status(400).json({ error: 'استخدم تسجيل العملاء لإنشاء حساب جديد' });
    }
    const saved = await mutate(db, resource, method, payload, id);
    return res.status(method === 'POST' ? 201 : 200).json(saved);
  } catch (error) { return errorReply(res, error); }
}
