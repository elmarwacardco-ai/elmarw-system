import { createClient } from '@supabase/supabase-js';
import { handleCustomerRequest } from './customer.js';
import { handleWhatsAppDrafts } from '../lib/whatsapp-drafts.js';
import { handleStaffRequest } from '../lib/staff.js';

const RESOURCES = new Set(['clients', 'categories', 'subcategories', 'products', 'orders', 'employees', 'folders']);
const PUBLIC_RESOURCES = new Set(['categories', 'subcategories', 'products']);
const MAX_JSON_BYTES = 3_000_000;

// These fields are managed by the server, never trusted from the browser.
const EDITABLE = {
  clients: ['name','phone','company','address','type','balance'],
  categories: ['name'],
  subcategories: ['name','categoryId','image'],
  products: ['name','categoryId','subCategoryId','image','pricesB','pricesVIP'],
  orders: ['serialNumber','executionDate','readyDate','clientName','clientPhone','clientId','workerName','items','total','paidAmount','paymentStatus','paymentMethod','paymentProof','notes','status','date','fileName','fileData'],
  employees: ['name','phone','permissions'],
  folders: ['name','date','status','orderIds']
};

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function publicStaffAuthClient() {
  const url=process.env.SUPABASE_URL
  const key=process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if(!url||!key)throw Error('Public Auth configuration missing')
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}
function errorResponse(res, status, message) { return res.status(status).json({ error: message }); }
function toResource(value) {
  const key = String(value || '');
  return key === 'subCategories' ? 'subcategories' : key;
}
function storedKey(data, key) {
  if (key === 'subcategories') {
    if (Object.prototype.hasOwnProperty.call(data, 'subcategories')) return 'subcategories';
    if (Object.prototype.hasOwnProperty.call(data, 'subCategories')) return 'subCategories';
  }
  return key;
}
function parseBody(req) {
  const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid JSON object');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) throw new Error('Request is too large');
  return value;
}
function cleanInput(key, input, method) {
  const allowed = EDITABLE[key];
  const payload = {};
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, field)) payload[field] = input[field];
  }
  if (method === 'POST' && key !== 'orders' && key !== 'folders' && !String(payload.name || '').trim()) {
    throw new Error('Name is required');
  }
  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 180) throw new Error('Invalid name');
    payload.name = payload.name.trim();
  }
  if (payload.phone !== undefined && !/^01\d{9}$/.test(String(payload.phone))) throw new Error('Invalid phone');
  if (payload.type !== undefined && !['B','VIP'].includes(payload.type)) throw new Error('Invalid client type');
  if (payload.balance !== undefined && (!Number.isFinite(Number(payload.balance)) || Number(payload.balance) < 0)) throw new Error('Invalid balance');
  for (const field of ['pricesB','pricesVIP']) {
    if (payload[field] !== undefined && (!payload[field] || typeof payload[field] !== 'object' || Array.isArray(payload[field]))) throw new Error('Invalid price table');
  }
  if (payload.orderIds !== undefined && (!Array.isArray(payload.orderIds) || payload.orderIds.length > 20000)) throw new Error('Invalid folder order IDs');
  if (payload.items !== undefined && (!Array.isArray(payload.items) || payload.items.length > 100)) throw new Error('Invalid order items');
  if (payload.fileData !== undefined && (typeof payload.fileData !== 'string' || payload.fileData.length > 2_800_000)) throw new Error('Order file is too large');
  return payload;
}
async function readSnapshot(db) {
  const { data: record, error } = await db.from('app_data').select('data').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!record || !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) throw new Error('app_data row 1 is missing');
  return record.data;
}
async function getIdentity(db, req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const { data, error } = await db.auth.getUser(match[1]);
  if (error || !data?.user) return { invalid: true };
  const { data: admin, error: lookupError } = await db.from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (lookupError) throw lookupError;
  if (admin) return { id: data.user.id, isAdmin: true, employee: null };
  // Staff identities must be provisioned by an administrator in Supabase
  // Auth and linked explicitly to an active employee record.
  const snapshot = await readSnapshot(db);
  const employee = (snapshot.employees || []).find(e =>
    e.active === true && e.authUserId === data.user.id &&
    data.user.email_confirmed_at && data.user.email &&
    String(e.email || '').toLowerCase() === data.user.email.toLowerCase()
  ) || null;
  return { id: data.user.id, isAdmin: false, employee };
}
function staffAllowed(identity, resource, method) {
  const employee = identity?.employee;
  if (!employee || employee.mustChangePassword === true) return false;
  let perms = employee.permissions;
  if (typeof perms === 'string') {
    try { perms = JSON.parse(perms); } catch { return false; }
  }
  if (!perms || typeof perms !== 'object' || Array.isArray(perms)) return false;
  // Staff never manage other staff accounts or credentials.
  if (resource === 'employees') return false;
  if (resource === 'clients') return perms.clients === true;
  if (resource === 'categories' || resource === 'subcategories') return perms.categories === true;
  if (resource === 'products') return perms.products === true;
  if (resource === 'orders' || resource === 'folders') {
    const orders = perms.orders === true;
    const shipping = perms.shipping === true;
    if (orders) return true;
    // Shipping-only staff may read order status, not change prices or payments.
    return shipping && (method === 'GET' || method === 'HEAD');
  }
  return false;
}
export function publicView(key, values) {
  if (key === 'products') return values.map(product => ({
    id: product.id, name: product.name, image: product.image || '',
    categoryId: product.categoryId, subCategoryId: product.subCategoryId,
    pricesB: product.pricesB || {}
  }));
  if (key === 'categories' || key === 'subcategories') return values.map(item => ({
    id: item.id, name: item.name, categoryId: item.categoryId,
    image: item.image || ''
  }));
  return [];
}
function withoutLegacyPassword(record) {
  if (!record || typeof record !== 'object') return record;
  const { pass, password, ...safe } = record;
  return safe;
}
export function adminView(resource, items) {
  return ['clients','employees'].includes(resource)
    ? items.map(withoutLegacyPassword)
    : items;
}
function updatedRecord(resource, previous, input) {
  return { ...previous, ...input, id: previous.id };
}

// Database RPC locks the JSONB row so concurrent writes cannot erase each other.
// Apply supabase/migrations/20261014_elmarwa_atomic_writes.sql before deploying.
async function mutate(db, resource, method, recordId, payload) {
  const { data, error } = await db.rpc('elmarwa_mutate', {
    p_resource: resource, p_method: method, p_id: recordId ? Number(recordId) : null,
    p_payload: payload
  });
  if (error) {
    if (error.code === 'P0002') return { notFound: true };
    if (error.code === '23505') return { conflict: true };
    throw error;
  }
  return { record: data, deleted: method === 'DELETE' };
}
function route(url) {
  const segments = new URL(url, 'https://elmarwa.local').pathname.split('/').filter(Boolean);
  return { resource: toResource(segments[1]), id: segments[2] };
}

export async function handleApiRequest(req, res, makeDatabase = database) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('Allow', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(req.method)) return errorResponse(res, 405, 'Method not allowed');

  try {
    const { resource, id } = route(req.url);
    if (resource === 'customer') return handleCustomerRequest(req, res, makeDatabase());
    if (resource === 'staff') return handleStaffRequest(req, res, makeDatabase(), publicStaffAuthClient);
    // Disabled features must not contact Supabase or instantiate privileged clients.
    // This also gives the preview a stable 503 rather than a masked 500.
    if (resource === 'whatsapp-drafts' && process.env.ENABLE_WHATSAPP_DRAFTS !== 'true') {
      return errorResponse(res, 503, 'WhatsApp draft review is not enabled');
    }
    if (resource === 'whatsapp-drafts') return handleWhatsAppDrafts(req, res, makeDatabase());
    if (!RESOURCES.has(resource) || (id && !/^\d+$/.test(id))) return errorResponse(res, 404, 'Unknown resource');
    if (['POST','PUT','PATCH','DELETE'].includes(req.method) && ((req.method === 'POST' && id) || (req.method !== 'POST' && !id))) {
      return errorResponse(res, 405, 'Invalid operation');
    }
    const db = makeDatabase();
    const identity = await getIdentity(db, req);
    if (identity?.invalid) return errorResponse(res, 401, 'Invalid or expired session');

    // Public visitors see only the B-price catalog. Active staff may access
    // explicitly granted workstreams after their first password change.
    const privateAccess = identity?.isAdmin || staffAllowed(identity, resource, req.method);
    if (!privateAccess && (!PUBLIC_RESOURCES.has(resource) || !['GET','HEAD'].includes(req.method))) {
      return errorResponse(res, identity ? 403 : 401, 'Permission required');
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const snapshot = await readSnapshot(db);
      const items = snapshot[storedKey(snapshot, resource)] ?? [];
      if (!Array.isArray(items)) return errorResponse(res, 500, 'Invalid resource data');
      const result = privateAccess ? adminView(resource, items) : publicView(resource, items);
      const selected = id ? result.find(item => String(item.id) === id) : result;
      if (id && !selected) return errorResponse(res, 404, 'Record not found');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).json(selected);
    }

    let input = {};
    if (req.method !== 'DELETE') {
      try { input = cleanInput(resource, parseBody(req), req.method); }
      catch (error) { return errorResponse(res, 400, error.message); }
    }
    if (resource === 'clients' && input.phone && req.method === 'POST') {
      const snapshot = await readSnapshot(db);
      if ((snapshot.clients || []).some(c => c.phone === input.phone)) return errorResponse(res, 409, 'Phone already registered');
    }
    const outcome = await mutate(db, resource, req.method, id, input);
    if (outcome.notFound) return errorResponse(res, 404, 'Record not found');
    if (outcome.conflict) return errorResponse(res, 409, 'Concurrent update; retry');
    return res.status(req.method === 'POST' ? 201 : 200).json(outcome.deleted ? { success: true } : (['clients','employees'].includes(resource) ? withoutLegacyPassword(outcome.record) : outcome.record));
  } catch (error) {
    console.error('API error:', error.code || error.message);
    if (error.code === 'PGRST202') return errorResponse(res, 503, 'Missing elmarwa_mutate migration');
    return errorResponse(res, 500, 'Database operation failed');
  }
}

// Vercel invokes the unchanged default export; tests inject a fake database.
export default function handler(req, res) { return handleApiRequest(req, res); }
