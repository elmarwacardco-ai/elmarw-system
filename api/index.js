
import { createClient } from '@supabase/supabase-js';

const allowedKeys = new Set([
  'clients',
  'categories',
  'subCategories',
  'products',
  'orders',
  'employees',
  'folders',
  'payments',
  'wallet'
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
  res.setHeader('Allow', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const requestUrl = new URL(req.url, `https://${req.headers.host}`);
    const routedPath = requestUrl.searchParams.get('resource');
    const pathname = routedPath ? '/api/' + routedPath.replace(/^\/+/, '') : requestUrl.pathname;
    const key = pathname.replace(/^\/api\/?/, '').split('/')[0] || 'categories';

    if (!allowedKeys.has(key)) {
      return res.status(404).json({
        error: 'Unknown resource'
      });
    }

    if (key === 'payments' && ['GET','POST'].includes(req.method)) {
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
      if(!token) return res.status(401).json({error:'Login required'});
      const {data:auth,error:authError}=await db.auth.getUser(token);
      if(authError||!auth?.user) return res.status(401).json({error:'Invalid session'});
      const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      if(!admin) return res.status(403).json({error:'صلاحية الحسابات للمدير فقط'});
      const orderId=pathname.split('/')[3];
      if(req.method==='GET'&&!orderId){
        const {data:rows,error}=await db.from('order_payments').select('id,order_id,amount,method,created_at').order('created_at',{ascending:false}).limit(5000);
        if(error)return res.status(500).json({error:'تعذر تحميل حركات التحصيل'});
        return res.status(200).json(rows||[]);
      }
      if(!/^[0-9a-f-]{36}$/i.test(orderId||'')) return res.status(400).json({error:'رقم الأوردر غير صحيح'});
      if(req.method==='GET'){
        const {data:rows,error}=await db.from('order_payments').select('id,amount,method,created_at').eq('order_id',orderId).order('created_at',{ascending:false});
        if(error) return res.status(500).json({error:'تعذر قراءة الدفعات'});
        return res.status(200).json(rows||[]);
      }
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      const amount=Number(body?.amount),method=String(body?.method||'');
      if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)/100!==amount||!['نقدي','فودافون كاش','انستا باي','تحويل بنكي'].includes(method)) return res.status(400).json({error:'راجع قيمة الدفعة وطريقتها'});
      const {data:paid,error}=await db.rpc('marwa_record_payment',{p_order:orderId,p_amount:amount,p_method:method,p_actor:auth.user.id});
      if(error) return res.status(400).json({error:'تعذر تسجيل الدفعة؛ تأكد من المبلغ المتبقي'});
      return res.status(201).json({paidAmount:paid});
    }
    if(key==='wallet'&&req.method==='POST'){
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
      const {data:auth,error:authError}=await db.auth.getUser(token||'');
      if(authError||!auth?.user)return res.status(401).json({error:'يلزم تسجيل الدخول'});
      const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      if(!admin)return res.status(403).json({error:'إضافة الرصيد للمدير فقط'});
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      const amount=Number(body?.amount),method=String(body?.method||'');
      if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)/100!==amount||!['نقدي','فودافون كاش','انستا باي','تحويل بنكي'].includes(method))return res.status(400).json({error:'راجع مبلغ الشحن وطريقة الدفع'});
      const {data,error}=await db.rpc('marwa_topup_wallet',{p_customer:body.customerId,p_amount:amount,p_method:method,p_actor:auth.user.id,p_reference:String(body.reference||'')});
      if(error)return res.status(400).json({error:'تعذر شحن الرصيد'});
      return res.status(201).json({balance:data});
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
      const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
      if (!match) return res.status(401).json({error:'Login required'});
      const {data: auth, error: authError} = await db.auth.getUser(match[1]);
      if (authError || !auth?.user) return res.status(401).json({error:'Invalid session'});
      const {data: profile, error: profileError} = await db.from('customer_profiles').select('id,name,phone,company,address,type,balance').eq('id',auth.user.id).maybeSingle();
      if (profileError || !profile) return res.status(404).json({error:'Customer not found'});
      return res.status(200).json(profile);
    }
    // Public storefront catalog; never expose customer, employee or order records.
    if (req.method === 'GET' && ['categories','subCategories','products'].includes(key)) {
      const db = getDatabase();
      const {data:record,error:readError} = await db.from('app_data').select('data').eq('id',1).maybeSingle();
      if (readError) return res.status(500).json({error:'Catalog unavailable'});
      const items = record?.data?.[key] ?? [];
      if (!Array.isArray(items)) return res.status(500).json({error:'Invalid catalog'});
      return res.status(200).json(items);
    }
    // Manager-only folder management for production workflow.
    if (key === 'folders' && ['POST','PUT','DELETE'].includes(req.method)) {
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({error:'يرجى تسجيل دخول المدير'});
      const {data:auth,error:authError}=await db.auth.getUser(token);
      if (authError||!auth?.user) return res.status(401).json({error:'جلسة المدير غير صالحة'});
      const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      if (!admin) return res.status(403).json({error:'غير مسموح بإدارة الفولدرات'});
      const {data:record,error:readError}=await db.from('app_data').select('data').eq('id',1).maybeSingle();
      if (readError||!record) return res.status(500).json({error:'تعذر قراءة الفولدرات'});
      const all=record.data||{};
      const folders=Array.isArray(all.folders)?all.folders:[];
      const id=pathname.split('/')[3];
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      let next, result;
      if (req.method==='POST') {
        const name=String(body?.name||'').trim();
        if (!name||name.length>120) return res.status(400).json({error:'اسم الفولدر غير صحيح'});
        result={id:crypto.randomUUID(),name,date:new Date().toISOString(),status:'جديد',orderIds:[]};
        next=[...folders,result];
      } else {
        const current=folders.find(f=>String(f.id)===String(id));
        if (!current) return res.status(404).json({error:'الفولدر غير موجود'});
        if (req.method==='DELETE') {next=folders.filter(f=>String(f.id)!==String(id));result={deleted:true};}
        else {
          const changes={};
          if (body?.orderIds!==undefined) {
            if (!Array.isArray(body.orderIds)||body.orderIds.length>2000) return res.status(400).json({error:'قائمة الأوردرات غير صحيحة'});
            const ids=[...new Set(body.orderIds.map(String))];
            const {data:existing,error:idsError}=await db.from('customer_orders').select('id').in('id',ids.length?ids:['00000000-0000-0000-0000-000000000000']);
            if (idsError||existing.length!==ids.length) return res.status(400).json({error:'أحد الأوردرات غير موجود'});
            changes.orderIds=ids;
          }
          if (body?.status!==undefined) {
            if (!['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم','تم التسليم'].includes(body.status)) return res.status(400).json({error:'حالة فولدر غير صحيحة'});
            changes.status=body.status;
          }
          if (body?.name!==undefined) {
            const name=String(body.name).trim();
            if (!name||name.length>120) return res.status(400).json({error:'اسم غير صحيح'});
            changes.name=name;
          }
          result={...current,...changes};
          next=folders.map(f=>String(f.id)===String(id)?result:f);
          if (changes.orderIds) next=next.map(f=>String(f.id)===String(id)?f:{...f,orderIds:(f.orderIds||[]).filter(oid=>!changes.orderIds.includes(String(oid)))});
        }
      }
      if (req.method==='PUT' && body?.status==='تم التسليم') {
        for(const orderId of result.orderIds||[]){
          const {data:order,error:orderError}=await db.from('customer_orders').select('details').eq('id',orderId).maybeSingle();
          if(orderError||!order) return res.status(400).json({error:'تعذر التحقق من حساب أحد الأوردرات'});
          if(Number(order.details.paidAmount||0)<Number(order.details.total||0)) return res.status(400).json({error:'لا يمكن تسليم الفولدر: يوجد أوردر لم يسدد بالكامل'});
        }
      }
      // Assigning a new order to a folder advances it into execution.
      if (req.method==='PUT' && body?.orderIds!==undefined) {
        const previousIds=new Set((folders.find(f=>String(f.id)===String(id))?.orderIds||[]).map(String));
        for (const orderId of result.orderIds||[]) {
          if (previousIds.has(String(orderId))) continue;
          const {data:order,error:orderError}=await db.from('customer_orders').select('details').eq('id',orderId).maybeSingle();
          if (orderError||!order) return res.status(500).json({error:'تعذر قراءة الأوردر قبل إضافته للفولدر'});
          if (order.details?.status==='جديد') {
            const {error:statusError}=await db.from('customer_orders').update({details:{...order.details,status:'قيد التنفيذ'}}).eq('id',orderId);
            if (statusError) return res.status(500).json({error:'تعذر نقل الأوردر إلى قيد التنفيذ'});
          }
        }
      }
      const {error:writeError}=await db.from('app_data').update({data:{...all,folders:next}}).eq('id',1);
      if (writeError) return res.status(500).json({error:'فشل حفظ الفولدر'});
      if (req.method==='PUT'&&body?.status!==undefined) {
        for (const orderId of result.orderIds||[]) {
          const {data:order}=await db.from('customer_orders').select('details').eq('id',orderId).maybeSingle();
          if (order) { const {error:statusError}=await db.from('customer_orders').update({details:{...order.details,status:result.status}}).eq('id',orderId); if (statusError) return res.status(500).json({error:'تم حفظ الفولدر لكن فشل تحديث حالة أحد الأوردرات'}); }
        }
      }
      return res.status(req.method==='POST'?201:200).json(result);
    }
    // Upload real payment screenshot, not just its filename.
    if (key === 'orders' && req.method === 'POST' && pathname.endsWith('/payment-proof')) {
      const id=pathname.split('/')[3];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')) return res.status(400).json({error:'رقم الطلب غير صحيح'});
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({error:'يرجى تسجيل الدخول'});
      const {data:auth,error:authError}=await db.auth.getUser(token);
      if (authError||!auth?.user) return res.status(401).json({error:'جلسة الدخول انتهت'});
      const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      const {data:order,error:orderError}=await db.from('customer_orders').select('customer_id,details').eq('id',id).maybeSingle();
      if (orderError||!order) return res.status(404).json({error:'الأوردر غير موجود'});
      if (!admin&&order.customer_id!==auth.user.id) return res.status(403).json({error:'غير مسموح برفع ملف لهذا الأوردر'});
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      const mime=String(body?.mime||'');
      const encoded=String(body?.fileData||'');
      if (!['image/jpeg','image/png','image/webp'].includes(mime)||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(encoded)) return res.status(400).json({error:'ارفع صورة JPG أو PNG أو WEBP'});
      const bytes=Buffer.from(encoded.slice(encoded.indexOf(',')+1),'base64');
      if (!bytes.length||bytes.length>3*1024*1024) return res.status(413).json({error:'حجم الصورة لازم أقل من 3 ميجابايت'});
      const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
      const path=order.customer_id+'/payment-proofs/'+id+'-'+crypto.randomUUID()+'.'+ext;
      const {error:uploadError}=await db.storage.from('customer-order-files').upload(path,bytes,{contentType:mime,upsert:false});
      if (uploadError) return res.status(500).json({error:'فشل رفع الصورة إلى التخزين'});
      const details={...order.details,paymentProof:String(body.fileName||'صورة تحويل').slice(0,180),paymentProofPath:path};
      const {error:saveError}=await db.from('customer_orders').update({details}).eq('id',id);
      if (saveError) {await db.storage.from('customer-order-files').remove([path]);return res.status(500).json({error:'فشل حفظ مرفق التحويل'});}
      return res.status(200).json({paymentProof:details.paymentProof,paymentProofPath:path});
    }
    if (key === 'orders' && req.method === 'GET' && pathname.endsWith('/payment-proof')) {
      const id=pathname.split('/')[3];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')) return res.status(400).json({error:'رقم الطلب غير صحيح'});
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({error:'يرجى تسجيل الدخول'});
      const {data:auth,error:authError}=await db.auth.getUser(token);
      if (authError||!auth?.user) return res.status(401).json({error:'جلسة غير صالحة'});
      const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      const {data:order}=await db.from('customer_orders').select('customer_id,details').eq('id',id).maybeSingle();
      if (!order) return res.status(404).json({error:'الأوردر غير موجود'});
      if (!admin&&order.customer_id!==auth.user.id) return res.status(403).json({error:'غير مسموح'});
      if (!order.details?.paymentProofPath) return res.status(404).json({error:'لا يوجد مرفق'});
      const {data:signed,error:signError}=await db.storage.from('customer-order-files').createSignedUrl(order.details.paymentProofPath,60);
      if (signError||!signed?.signedUrl) return res.status(500).json({error:'تعذر فتح الصورة'});
      return res.status(200).json({url:signed.signedUrl});
    }
    if (key === 'orders' && req.method === 'GET' && pathname.endsWith('/file')) {
      const id=pathname.split('/')[3];
      if (!/^[0-9a-f-]{36}$/i.test(id||'')) return res.status(400).json({error:'رقم الطلب غير صالح'});
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({error:'يرجى تسجيل الدخول'});
      const {data:auth,error:authError}=await db.auth.getUser(token);
      if (authError||!auth?.user) return res.status(401).json({error:'جلسة الدخول انتهت'});
      const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      const {data:order,error:orderError}=await db.from('customer_orders').select('customer_id,file_path,details').eq('id',id).maybeSingle();
      if (orderError||!order) return res.status(404).json({error:'الأوردر غير موجود'});
      if (!admin && order.customer_id!==auth.user.id) return res.status(403).json({error:'غير مسموح بتحميل هذا الملف'});
      if (!order.file_path) return res.status(404).json({error:'ملف الطلب غير محفوظ'});
      const {data:signed,error:signError}=await db.storage.from('customer-order-files').createSignedUrl(order.file_path,120,{download:order.details?.fileName||'order-file'});
      if (signError||!signed?.signedUrl) return res.status(500).json({error:'تعذر إنشاء رابط تحميل الملف'});
      return res.status(200).json({url:signed.signedUrl});
    }
    // Read-only wallet balance and history, scoped to authenticated customer or manager.
    if (key === 'clients' && req.method === 'GET' && pathname.endsWith('/wallet')) {
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\\s+(.+)$/i)?.[1];
      if(!token) return res.status(401).json({error:'Login required'});
      const {data:auth,error:authError}=await db.auth.getUser(token);
      if(authError||!auth?.user) return res.status(401).json({error:'Invalid session'});
      const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      const requested=pathname.split('/')[3];
      const customerId=admin && /^[0-9a-f-]{36}$/i.test(requested||'') ? requested : auth.user.id;
      const {data:profile,error:profileError}=await db.from('customer_profiles').select('id,name,balance').eq('id',customerId).maybeSingle();
      if(profileError||!profile) return res.status(404).json({error:'العميل غير موجود'});
      const {data:entries,error:entriesError}=await db.from('customer_wallet_ledger').select('id,amount,kind,method,reference,order_id,created_at').eq('customer_id',customerId).order('created_at',{ascending:false}).limit(100);
      if(entriesError) return res.status(500).json({error:'تعذر تحميل حركات الرصيد'});
      return res.status(200).json({balance:Number(profile.balance||0),entries:entries||[]});
    }
    if (key === 'orders' && req.method === 'PUT') {
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({error:'يرجى تسجيل دخول المدير'});
      const {data:auth,error:authError}=await db.auth.getUser(token);
      if (authError||!auth?.user) return res.status(401).json({error:'جلسة المدير غير صالحة'});
      const {data:admin,error:adminError}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      if (adminError||!admin) return res.status(403).json({error:'غير مسموح بتعديل الطلب'});
      const id=pathname.split('/')[3];
      if (!/^[0-9a-f-]{36}$/i.test(id||'')) return res.status(400).json({error:'رقم الطلب غير صالح'});
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      const statuses=['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم','معلق','تم التسليم','ملغي'];
      const methods=['نقدي','فودافون كاش','انستا باي','تحويل بنكي','آجل'];
      const {data:record,error:readError}=await db.from('customer_orders').select('details').eq('id',id).maybeSingle();
      if (readError||!record) return res.status(404).json({error:'الطلب غير موجود'});
      const details={...record.details};
      if (body?.status!==undefined) {
        if (!statuses.includes(body.status)) return res.status(400).json({error:'حالة غير صالحة'});
        details.status=body.status;
      }
      if (body?.status==='تم التسليم' && Number(details.paidAmount||0)<Number(details.total||0)) return res.status(400).json({error:'لا يمكن تسليم الأوردر قبل سداد المبلغ بالكامل'});
      if (body?.status==='معلق' && !String(body?.holdReason??details.holdReason??'').trim()) return res.status(400).json({error:'اكتب سبب تعليق الأوردر'});
      if (body?.holdReason!==undefined) details.holdReason=String(body.holdReason||'').trim().slice(0,1000);
      if (body?.status!==undefined && body.status!=='معلق') details.holdReason='';
      if (body?.paidAmount!==undefined) return res.status(400).json({error:'سجل دفعة جديدة من قسم الحسابات بدلاً من تعديل إجمالي المدفوع'});
      if (false) {
        const amount=Number(body.paidAmount);
        if (!Number.isFinite(amount)||amount<0||amount>Number(details.total||0)) return res.status(400).json({error:'المبلغ المدفوع غير صحيح'});
        details.paidAmount=amount;
      }
      if (body?.paymentMethod!==undefined) {
        if (!methods.includes(body.paymentMethod)) return res.status(400).json({error:'طريقة دفع غير صالحة'});
        details.paymentMethod=body.paymentMethod;
      }
      details.paymentStatus=Number(details.paidAmount||0)>=Number(details.total||0)?'مدفوع بالكامل':Number(details.paidAmount||0)>0?'مدفوع جزئي':'غير مدفوع';
      const {data:updated,error:updateError}=await db.from('customer_orders').update({details}).eq('id',id).select('id,details').single();
      if (updateError||!updated) return res.status(500).json({error:'فشل حفظ تعديلات الأوردر'});
      return res.status(200).json({...updated.details,id:updated.id});
    }
    if (key === 'orders' && req.method === 'POST') {
      const db = getDatabase();
      const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({error:'يرجى تسجيل الدخول مرة أخرى'});
      const {data:auth,error:authError} = await db.auth.getUser(token);
      if (authError || !auth?.user) return res.status(401).json({error:'جلسة العميل انتهت'});
      const {data:profile} = await db.from('customer_profiles').select('id,name,phone,type,balance').eq('id',auth.user.id).maybeSingle();
      if (!profile) return res.status(403).json({error:'حساب العميل غير موجود'});
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const items = body?.items;
      if (!Array.isArray(items) || !items.length || items.length > 30 || !items.every(x => Number.isInteger(Number(x.qty)) && Number(x.qty)>0 && x.productId != null)) return res.status(400).json({error:'بيانات المنتجات غير صحيحة'});
      const fileName = String(body.fileName||'').slice(0,180);
      const fileData = String(body.fileData||'');
      if (!/\.(pdf|jpe?g|zip|rar|7z)$/i.test(fileName) || !/^data:[^;]{1,100};base64,[A-Za-z0-9+/=]+$/.test(fileData)) return res.status(400).json({error:'ملف الطلب غير صالح'});
      const bytes = Buffer.from(fileData.slice(fileData.indexOf(',')+1),'base64');
      if (!bytes.length || bytes.length > 3*1024*1024) return res.status(413).json({error:'الحد المؤقت لحجم الملف 3 ميجابايت'});
      const {data:catalog,error:catalogError} = await db.from('app_data').select('data').eq('id',1).maybeSingle();
      if (catalogError) return res.status(500).json({error:'تعذر التحقق من الأسعار'});
      const products = catalog?.data?.products || [];
      let total = 0;
      const safeItems = [];
      for (const item of items) {
        const product = products.find(p=>String(p.id)===String(item.productId));
        if (!product) return res.status(400).json({error:'منتج غير موجود'});
        let prices = profile.type==='VIP' ? product.pricesVIP : product.pricesB;
        if (typeof prices==='string') {try{prices=JSON.parse(prices)}catch{return res.status(400).json({error:'سعر المنتج غير صالح'})}}
        const price = Number(prices?.[String(item.qty)]);
        if (!Number.isFinite(price) || price < 0 || prices?.[String(item.qty)] == null || prices?.[String(item.qty)] === '') return res.status(400).json({error:'سعر أو كمية غير صالحة'});
        total += price;
        safeItems.push({productId:product.id,subCategoryId:product.subCategoryId,name:product.name,qty:Number(item.qty),price,total:price});
      }
      const walletAmount=Number(body.walletAmount||0);
      if(!Number.isFinite(walletAmount)||walletAmount<0||walletAmount!==Math.round(walletAmount*100)/100||walletAmount>total||walletAmount>Number(profile.balance||0)) return res.status(400).json({error:'مبلغ الخصم من الرصيد غير صحيح'});
      const serial = 'M-' + new Date().toISOString().slice(2,7).replace('-','') + '-' + crypto.randomUUID().slice(0,8).toUpperCase();
      const path = auth.user.id + '/' + crypto.randomUUID() + '-' + fileName.replace(/[^a-zA-Z0-9._-]/g,'_');
      const {error:uploadError} = await db.storage.from('customer-order-files').upload(path,bytes,{contentType:'application/octet-stream',upsert:false});
      if (uploadError) return res.status(500).json({error:'تعذر رفع ملف الطلب'});
      const details = {serialNumber:serial,clientId:profile.id,clientName:profile.name,clientPhone:profile.phone,items:safeItems,total,paidAmount:0,paymentStatus:'غير مدفوع',paymentMethod:['نقدي','فودافون كاش'].includes(body.paymentMethod)?body.paymentMethod:'نقدي',notes:String(body.notes||'').slice(0,2000),workerName:String(body.workerName||'').slice(0,120),status:'جديد',fileName,executionDate:new Date().toISOString().slice(0,10),readyDate:''};
      const {data:created,error:saveError} = await db.from('customer_orders').insert({customer_id:profile.id,serial_number:serial,details,file_path:path}).select('id,serial_number').single();
      if (saveError) {await db.storage.from('customer-order-files').remove([path]); return res.status(500).json({error:'تعذر حفظ الطلب'});}
      if(walletAmount>0){
        const {error:debitError}=await db.rpc('marwa_wallet_apply_order',{p_customer:profile.id,p_order:created.id,p_amount:walletAmount});
        if(debitError){
          await db.from('customer_orders').delete().eq('id',created.id);
          await db.storage.from('customer-order-files').remove([path]);
          return res.status(409).json({error:'تعذر خصم الرصيد؛ راجع الرصيد وحاول مرة أخرى'});
        }
      }
      return res.status(201).json({id:created.id,serialNumber:created.serial_number,walletPaid:walletAmount});
    }
    if (key === 'orders' && req.method === 'GET') {
      const db=getDatabase();
      const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return res.status(401).json({error:'Login required'});
      const {data:auth,error:authError}=await db.auth.getUser(token);
      if (authError||!auth?.user) return res.status(401).json({error:'Invalid session'});
      const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
      const query=db.from('customer_orders').select('id,details,created_at').order('created_at',{ascending:false});
      const {data:rows,error:readError}=await (admin?query:query.eq('customer_id',auth.user.id));
      if (readError) return res.status(500).json({error:'تعذر تحميل الطلبات'});
      return res.status(200).json((rows||[]).map(r=>({...r.details,id:r.id,date:r.created_at})));
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
