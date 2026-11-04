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
  const extension=fileName.split('.').pop()?.toLowerCase();
  const mimeByExtension={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
  const mime=mimeByExtension[extension];
  if(!productId||!categoryId||!subcategoryId||!Number.isInteger(quantity)||!jobName||jobName.length>120||fileName.length>150||!mime)return res.status(400).json({error:'بيانات المسودة غير مكتملة'});
  const encoded=String(b.fileBase64||b.pdfBase64||'');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length>4*1024*1024)return res.status(413).json({error:'الملف يجب ألا يتجاوز 3 ميجابايت'});
  const file=Buffer.from(encoded,'base64');
  const validSignature=extension==='pdf'?file.subarray(0,5).toString()==='%PDF-':mime==='image/png'?file.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):file.subarray(0,3).equals(Buffer.from([255,216,255]));
  if(file.length<8||file.length>3*1024*1024||!validSignature)return res.status(400).json({error:'الملف غير صالح. ارفع PDF أو JPG أو PNG سليم'});
  const {data:catalog,error:catalogError}=await db.from('app_data').select('data').eq('id',1).maybeSingle();
  if(catalogError||!catalog?.data)return res.status(503).json({error:'كتالوج المنتجات غير متاح'});
  const products=Array.isArray(catalog.data.products)?catalog.data.products:[];
  const subcategories=Array.isArray(catalog.data.subCategories)?catalog.data.subCategories:[];
  const sub=subcategories.find(x=>String(x.id)===subcategoryId&&String(x.categoryId)===categoryId);
  const p=products.find(x=>String(x.id)===productId&&String(x.subCategoryId)===subcategoryId);
  if(!sub)return res.status(400).json({error:'القسم الفرعي غير صحيح'});
  if(!p)return res.status(400).json({error:'المنتج غير متاح'});
  let prices=String(profile.type).toUpperCase()==='VIP'?p.pricesVIP:p.pricesB;
  try{if(typeof prices==='string')prices=JSON.parse(prices)}catch{return res.status(400).json({error:'تعذر قراءة السعر'})}
  const price=Number(prices?.[quantity]);
  if(!Number.isFinite(price)||price<=0)return res.status(400).json({error:'الكمية غير متاحة لفئة حسابك'});
  const id=crypto.randomUUID();
  const path=auth.user.id+'/'+id+'.'+extension;
  const {error:uploadError}=await db.storage.from('website-chat-pdfs').upload(path,file,{contentType:mime,upsert:false});
  if(uploadError)return res.status(503).json({error:'تعذر رفع ملف التصميم'});
  const {data:row,error:insertError}=await db.from('website_chat_drafts').insert({id,customer_id:auth.user.id,category_id:categoryId,subcategory_id:subcategoryId,product_id:productId,quantity,job_name:jobName,quoted_price:price,pdf_path:path,pdf_filename:fileName,status:'pending_review'}).select('id,status,created_at').single();
  if(insertError){await db.storage.from('website-chat-pdfs').remove([path]);return res.status(503).json({error:'تعذر حفظ المسودة'})}
  return res.status(201).json({draft:row});
}
