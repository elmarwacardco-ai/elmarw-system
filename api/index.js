
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

function getDatabase() {
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'GET, HEAD, OPTIONS');
  res.setHeader('Vary', 'Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!['GET', 'HEAD'].includes(req.method)) {
    return res.status(405).json({
      error: 'Write operations are not enabled yet'
    });
  }

  try {
    const db = getDatabase();

    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        error: 'Login required'
      });
    }

    // التحقق من هوية المستخدم
    const { data: authData, error: authError } =
      await db.auth.getUser(match[1]);

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: 'Invalid or expired session'
      });
    }

    // التحقق من صلاحيات المدير
    const { data: admin, error: adminError } = await db
      .from('admin_users')
      .select('user_id')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (adminError) {
      console.error('Admin lookup failed:', adminError.message);
      return res.status(500).json({
        error: 'Unable to verify permissions'
      });
    }

    if (!admin) {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    // تحديد القسم المطلوب
    const pathname = new URL(
      req.url,
      `https://${req.headers.host}`
    ).pathname;

    const key = pathname
      .replace(/^\/api\/?/, '')
      .split('/')[0] || 'categories';

    if (!allowedKeys.has(key)) {
      return res.status(404).json({
        error: 'Unknown resource'
      });
    }

    // قراءة البيانات من app_data
    const { data: record, error: readError } = await db
      .from('app_data')
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (readError) {
      console.error('Data read failed:', readError.message);
      return res.status(500).json({
        error: 'Database read failed'
      });
    }

    const items = record?.data?.[key] ?? [];

    if (!Array.isArray(items)) {
      return res.status(500).json({
        error: 'Invalid resource data'
      });
    }

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    return res.status(200).json(items);

  } catch (error) {
    console.error('API error:', error.message);

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}
