
import { createClient } from '@supabase/supabase-js';

const allowedKeys = new Set([
  'clients',
  'categories',
  'subCategories',
  'products',
  'orders',
  'employees',
  'folders'
]);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'GET, HEAD');

  if (!['GET', 'HEAD'].includes(req.method)) {
    return res.status(405).json({
      error: 'Write operations are not enabled yet'
    });
  }

  // حماية بيانات السيستم لحين تجهيز تسجيل الدخول
  return res.status(403).json({
    error: 'Authentication is required'
  });
}

// تجهيز اتصال Supabase للاستخدام بعد إضافة الحماية
export function getDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Supabase configuration is missing');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
