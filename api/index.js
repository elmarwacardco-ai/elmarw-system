
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
  res.setHeader('Vary', 'Authorization');
  res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
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

    // Public customer signup: use Supabase Auth, never store plaintext passwords.
    if (key === 'clients' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const name = String(body?.name || '').trim();
      const phone = String(body?.phone || '').trim();
      const company = String(body?.company || '').trim();
      const address = String(body?.address || '').trim();
      const password = String(body?.pass || '');
      if (!name || !/^01[0-9]{9}$/.test(phone) || !company || !address || password.length < 8 || password.length > 128) {
        return res.status(400).json({error:'أكمل البيانات واستخدم كلمة مرور من 8 أحرف على الأقل'});
      }
      const db = getDatabase();
      const {data: existing, error: lookupError} = await db.from('customer_profiles').select('id').eq('phone',phone).maybeSingle();
      if (lookupError) return res.status(500).json({error:'تعذر التحقق من رقم العميل'});
      if (existing) return res.status(409).json({error:'رقم الموبايل مسجل بالفعل'});
      const email = 'eg20' + phone + '@customers.elmarwa.invalid';
      const {data: created, error: authError} = await db.auth.admin.createUser({email,password,email_confirm:true});
      if (authError || !created?.user) return res.status(400).json({error:'تعذر إنشاء الحساب؛ تحقق من بيانات التسجيل'});
      const {error: profileError} = await db.from('customer_profiles').insert({id:created.user.id,email,name,phone,company,address,type:'B',balance:0});
      if (profileError) {
        await db.auth.admin.deleteUser(created.user.id);
        return res.status(500).json({error:'تعذر حفظ بيانات العميل'});
      }
      return res.status(201).json({success:true});
    }
    // Customer login and profile retrieval require a valid Auth token.
    if (key === 'clients' && req.method === 'GET' && new URL(req.url,`https://${req.headers.host}`).searchParams.get('self') === '1') {
      const db = getDatabase();
      const match = String(req.headers.authorization || '').match(/^Bearer\\s+(.+)$/i);
      if (!match) return res.status(401).json({error:'Login required'});
      const {data: auth, error: authError} = await db.auth.getUser(match[1]);
      if (authError || !auth?.user) return res.status(401).json({error:'Invalid session'});
      const {data: profile, error: profileError} = await db.from('customer_profiles').select('id,name,phone,company,address,type,balance').eq('id',auth.user.id).maybeSingle();
      if (profileError || !profile) return res.status(404).json({error:'Customer not found'});
      return res.status(200).json(profile);
    }
    // السماح بإضافة التصنيفات الرئيسية فقط
    if (req.method === 'POST' && key !== 'categories') {
      return res.status(405).json({
        error: 'Write operations are not enabled for this resource'
      });
    }

    const db = getDatabase();

    const match = String(
      req.headers.authorization || ''
    ).match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        error: 'Login required'
      });
    }

    // التحقق من جلسة المستخدم
    const { data: authData, error: authError } =
      await db.auth.getUser(match[1]);

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: 'Invalid or expired session'
      });
    }

    // التأكد من صلاحيات المدير
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

    // حفظ تصنيف رئيسي
    if (req.method === 'POST') {
      const body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;

      const name = typeof body?.name === 'string'
        ? body.name.trim()
        : '';

      if (!name || name.length > 120) {
        return res.status(400).json({
          error: 'Category name must be 1 to 120 characters'
        });
      }

      const { data: created, error: createError } =
        await db.rpc('append_main_category', {
          p_name: name
        });

      if (createError) {
        console.error(
          'Category insert failed:',
          createError.message
        );

        return res.status(500).json({
          error: 'Could not save category; check database function'
        });
      }

      return res.status(201).json(created);
    }

    if (key === 'clients') {
      const {data: profiles, error: profilesError} = await db.from('customer_profiles').select('id,name,phone,company,address,type,balance');
      if (profilesError) return res.status(500).json({error:'Customer read failed'});
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).json(profiles || []);
    }

    // تحميل البيانات
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
