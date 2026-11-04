import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Vary','Authorization');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({error:'Database unavailable'});
  const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return res.status(401).json({error:'سجل دخولك أولاً'});
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth?.user)return res.status(401).json({error:'جلسة الدخول غير صالحة'});
  if(req.method==='GET'){
    const {data:admin,error:adminError}=await db.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
    if(adminError||!admin)return res.status(403).json({error:'غير مصرح بعرض المسودات'});
    const {data:rows,error:rowsError}=await db.from('website_chat_drafts').select('id,customer_id,category_id,subcategory_id,product_id,quantity,job_name,quoted_price,pdf_filename,status,created_at').order('created_at',{ascending:false}).limit(100);
    if(rowsError)return res.status(503).json({error:'تعذر تحميل مسودات الموقع'});
    return res.status(200).json({drafts:rows||[]});
  }
  const {data:profile,error:profileError}=await db.from('customer_profiles').select('id,type').eq('id',auth.user.id).maybeSingle();
  if(profileError||!profile)return res.status(403).json({error:'حساب العميل غير موجود'});
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const productId=String(b.productId||''),categoryId=String(b.categoryId||''),subcategoryId=String(b.subcategoryId||'');
  const quantity=Number(b.quantity),jobName=String(b.jobName||'').trim(),fileName=String(b.fileName||'');
  if(!productId||!categoryId||!subcategoryId||!Number.isInteger(quantity)||!jobName||jobName.length>120||!/^.{1,150}\.pdf$/i.test(fileName))return res.status(400).json({error:'بيانات المسودة غير مكتملة'});
  const encoded=String(b.pdfBase64||'');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length>4*1024*1024)return res.status(413).json({error:'ملف PDF يجب ألا يتجاوز 3 ميجابايت'});
  const pdf=Buffer.from(encoded,'base64');
  if(pdf.length<8||pdf.length>3*1024*1024||pdf.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'الملف ليس PDF صالحًا'});
  const {data:catalog,error:catalogError}=await db.from('app_data').select('data').eq('id',1).maybeSingle();
  if(catalogError||!catalog?.data)return res.status(503).json({error:'كتالوج المنتجات غير متاح'});
  const products=Array.isArray(catalog.data.products)?catalog.data.products:[];
  const p=products.find(x=>String(x.id)===productId&&String(x.categoryId)===categoryId&&String(x.subCategoryId)===subcategoryId);
  if(!p)return res.status(400).json({error:'المنتج غير متاح'});
  let prices=String(profile.type).toUpperCase()==='VIP'?p.pricesVIP:p.pricesB;
  try{if(typeof prices==='string')prices=JSON.parse(prices)}catch{return res.status(400).json({error:'تعذر قراءة السعر'})}
  const price=Number(prices?.[quantity]);
  if(!Number.isFinite(price)||price<=0)return res.status(400).json({error:'الكمية غير متاحة لفئة حسابك'});
  const id=crypto.randomUUID();
  const path=auth.user.id+'/'+id+'.pdf';
  const {error:uploadError}=await db.storage.from('website-chat-pdfs').upload(path,pdf,{contentType:'application/pdf',upsert:false});
  if(uploadError)return res.status(503).json({error:'تعذر رفع ملف PDF'});
  const {data:row,error:insertError}=await db.from('website_chat_drafts').insert({id,customer_id:auth.user.id,category_id:categoryId,subcategory_id:subcategoryId,product_id:productId,quantity,job_name:jobName,quoted_price:price,pdf_path:path,pdf_filename:fileName,status:'pending_review'}).select('id,status,created_at').single();
  if(insertError){await db.storage.from('website-chat-pdfs').remove([path]);return res.status(503).json({error:'تعذر حفظ المسودة'})}
  return res.status(201).json({draft:row});
}
