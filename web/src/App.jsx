import React, { useState, useEffect, useRef } from 'react'
const API = '/api/index.js?resource='
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const TOKEN_KEY = 'elmarw_admin_access_token'

async function apiRead(resource, token) {
  const response = await fetch(`${API}${resource}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
  if (!Array.isArray(body)) throw new Error(`Invalid ${resource} response`)
  return body
}


function SiteChatAssistant({ products, categories, subCategories, loggedClient, onMyOrders, onRegister, onLogin }) {
  const [open, setOpen] = useState(false)
  const [draftStep, setDraftStep] = useState('')
  const [welcomeStep,setWelcomeStep]=useState('ask')
  const [chatMode,setChatMode]=useState('menu')
  const [draftSubmitting,setDraftSubmitting] = useState(false)
  const [lastDraftId,setLastDraftId] = useState('')
  const [approvalNotified,setApprovalNotified] = useState('')
  const [paymentChoice,setPaymentChoice] = useState('')
  const [paymentReceipt,setPaymentReceipt] = useState(null)
  const [paymentBusy,setPaymentBusy] = useState(false)
  const [paymentFeedback,setPaymentFeedback] = useState('')
  const [draftError,setDraftError] = useState('')
  const [draft, setDraft] = useState({ categoryId:'', subCategoryId:'', productId:'', quantity:'', jobName:'', pdf:null })
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([{ from: 'bot', text: 'أهلاً بيك في المروة للطباعة 👋 هساعدك خطوة بخطوة في الأسعار والطلبات.' }])
  const greetedCustomer=useRef('')
  useEffect(()=>{if(!open||!loggedClient)return;const identity=String(loggedClient.id||loggedClient.phone||loggedClient.name||'');if(greetedCustomer.current===identity)return;greetedCustomer.current=identity;setMessages(prev=>prev.length===1 && prev[0]?.from==='bot' ? [{from:'bot',text:'أهلاً وسهلاً يا '+(loggedClient.name||'عميل المروة')+' 🌟 نورت المروة للطباعة! تحب تعمل طلب طباعة جديد، تعرف الأسعار، ولا تتابع طلبك؟'}] : prev)},[open,loggedClient?.id,loggedClient?.name,loggedClient?.phone])
  const messageListRef = useRef(null)
  useEffect(()=>{if(open && messageListRef.current)messageListRef.current.scrollTop=messageListRef.current.scrollHeight},[messages,open,welcomeStep,chatMode,draftStep,draft.categoryId,draft.subCategoryId,draft.productId])
  const submitDraft = async () => {
    if(!draft.pdf || !loggedClient)return
    setDraftSubmitting(true);setDraftError('')
    try {
      const token=sessionStorage.getItem('elmarw_customer_token')
      if(!token)throw new Error('سجّل دخول العميل أولاً')
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة الملف'));reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.readAsDataURL(draft.pdf)})
      const response=await fetch('/api/website-chat-drafts.js',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({categoryId:draft.categoryId,subcategoryId:draft.subCategoryId,productId:draft.productId,quantity:draft.quantity,jobName:draft.jobName,fileName:draft.pdf.name,fileBase64:base64})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'تعذر إرسال المسودة')
      setLastDraftId(String(result.draft.id));setPaymentChoice('');setPaymentReceipt(null);setPaymentFeedback('')
      setMessages(prev=>[...prev,{from:'bot',text:'✅ تم إنشاء مسودة طلبك واستلام ملف التصميم بنجاح. رقم المسودة: '+result.draft.id+'\nالطلب في انتظار مراجعة موظف المروة، ولسه ما اتعتمدش كأوردر رسمي. تحب تعرف طرق الدفع المتاحة؟'}])
      setDraftStep('payment');setChatMode('menu')
    }catch(e){setDraftError(e.message)}finally{setDraftSubmitting(false)}
  }
  const saveDraftPayment=async(method,receipt=null)=>{
    if(!lastDraftId)return setPaymentFeedback('❌ رقم المسودة مش موجود');
    setPaymentBusy(true);setPaymentFeedback('⏳ جاري حفظ بيانات الدفع...');
    try{
      const token=sessionStorage.getItem('elmarw_customer_token');if(!token)throw new Error('سجل دخولك من جديد');
      let receiptBase64;
      if(receipt){receiptBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة الإيصال'));reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.readAsDataURL(receipt)})}
      const response=await fetch('/api/website-chat-drafts.js?action=payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({draftId:lastDraftId,method,receiptName:receipt?.name,receiptBase64})});
      const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'تعذر حفظ اختيار الدفع');
      setPaymentChoice(method);setPaymentFeedback('✅ تم حفظ طريقة الدفع: '+method+(receipt?'\n📎 تم رفع وحفظ صورة التحويل: '+receipt.name:'\nلم يتم إرفاق إيصال')+'\nرقم المسودة: '+lastDraftId+'\n⏳ الإيصال بانتظار مراجعة الموظف، ولم يتم تأكيد سداد أي مبلغ.');
      setMessages(prev=>[...prev,{from:'bot',text:['🧾 ملخص طلب حضرتك يا '+(loggedClient?.name||'فندم'),'اسم الشغل: '+draft.jobName,'المنتج: '+(chosenProduct?.name||'المنتج المختار'),'الكمية: '+draft.quantity+' نسخة','السعر: '+(priceTable[draft.quantity]||'—')+' جنيه','ملف التصميم: '+(draft.pdf?.name||'مرفق'),'طريقة الدفع: '+method,'الإيصال: '+(receipt?'مرفق للمراجعة':'غير مرفق'),'رقم المسودة: '+lastDraftId,'✅ تم استلام طلب حضرتك. سوف يراجعه موظف المروة ويتم الرد على طلبكم.','بعد موافقة الموظف سيظهر رقم الأوردر الرسمي في البوت عند متابعة الطلب.'].join('\n')}]);
    }catch(error){setPaymentFeedback('❌ '+error.message)}finally{setPaymentBusy(false)}
  }
  const checkWebsiteOrder=async()=>{
    if(!lastDraftId){setMessages(prev=>[...prev,{from:'bot',text:'ابدأ طلب جديد أو افتح طلباتك علشان تتابع طلب سابق.'}]);return}
    try{
      const token=sessionStorage.getItem('elmarw_customer_token');
      const response=await fetch('/api/website-chat-drafts.js?action=my-status',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({draftId:lastDraftId})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'تعذر متابعة الطلب');
      const d=result.draft;
      setMessages(prev=>[...prev,{from:'bot',text:d.status==='approved'?'🎉 تمت موافقة موظف المروة على طلبك!\nرقم الأوردر الرسمي: '+d.approved_order_id+'\nتقدر تستخدم الكود ده لمتابعة الأوردر.':'⏳ طلبك '+d.job_name+' لسه بانتظار مراجعة موظف المروة. رقم المسودة: '+d.id}]);
    }catch(e){setMessages(prev=>[...prev,{from:'bot',text:'تعذر متابعة الطلب: '+e.message}])}
  }
  useEffect(()=>{
    if(!open||!lastDraftId||approvalNotified===lastDraftId)return;
    let active=true;
    const check=async()=>{
      try{
        const token=sessionStorage.getItem('elmarw_customer_token');
        if(!token)return;
        const response=await fetch('/api/website-chat-drafts.js?action=my-status',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({draftId:lastDraftId})});
        if(!response.ok)return;
        const result=await response.json();
        if(active&&result.draft?.status==='approved'&&result.draft.approved_order_id){
          setApprovalNotified(lastDraftId);
          setMessages(prev=>[...prev,{from:'bot',text:'🎉 مبروك يا '+(loggedClient?.name||'فندم')+'! موظف المروة وافق على طلبك.\nكود الأوردر الرسمي: '+result.draft.approved_order_id+'\nاحتفظ بالكود لمتابعة طلبك.'}]);
        }
      }catch(e){console.warn('Order status check failed',e)}
    };
    check();
    const timer=setInterval(check,30000);
    return()=>{active=false;clearInterval(timer)}
  },[open,lastDraftId,approvalNotified,loggedClient?.name])
  const beginDraft = () => {
    if(!loggedClient){setWelcomeStep('ask');return}
    setDraftError('');setLastDraftId('');setApprovalNotified('')
    setDraft({ categoryId:'', subCategoryId:'', productId:'', quantity:'', jobName:'', pdf:null })
    setDraftStep(loggedClient ? 'category' : 'login')
    setMessages(prev=>[...prev,{from:'bot',text:'تمام يا '+(loggedClient.name||'فندم')+' 😊 هنجهز طلبك سوا. دي أقسام المروة المتاحة، اختار بالاسم أو الرقم:\n'+chatOptions(categories)}])
  }
  const productSpecifications=p=>String(p?.specifications||'').trim();
  const describeProduct=(p,qty)=>'📋 مواصفات '+p.name+':\\n'+productSpecifications(p)+'\\n\\n'+(qty?'الكمية المطلوبة: '+qty+' نسخة. ':'')+'لو المواصفات مناسبة اكتب «تمام» علشان نكمل للكمية.';
  const showProductSpecs=(p,inDraft,qty='')=>{
    setDraft(v=>({...v,categoryId:String(p.categoryId||''),subCategoryId:String(p.subCategoryId||''),productId:String(p.id),quantity:''}));
    if(inDraft)setDraftStep('specifications');else setChatMode('priceSpecifications');
    setMessages(prev=>[...prev,{from:'bot',text:describeProduct(p,qty)}]);
  };
  const confirmQuantity = (quantity) => {
    setDraft(v=>({...v,quantity:String(quantity)}))
    setDraftStep('confirm')
    setMessages(prev=>[...prev,{from:'bot',text:'حضرتك اخترت '+(chosenProduct?.name||'المنتج')+' بكمية '+quantity+' نسخة، والسعر '+priceTable[quantity]+' جنيه لفئة حسابك. تحب نكمل الأوردر؟'}])
  }
  const chooseDraft = (field,value,next) => {
    setDraft(prev=>({...prev,[field]:value}))
    setDraftStep(next)
    const prompts={subcategory:'حلو 👌 اختار القسم الفرعي.',product:'تمام، اختار المنتج اللي محتاجه.',quantity:'محتاج كام نسخة؟ اختار الكمية المناسبة من الأسعار المتاحة 👇',job:'تمام، قولّي اسم الشغل اللي هيتطبع.',pdf:'دلوقتي ارفع ملف التصميم PDF أو صورة JPG/PNG عالية الجودة.'};
    if(prompts[next])setMessages(prev=>[...prev,{from:'bot',text:prompts[next]}])
  }
  const chosenProduct = products.find(p=>String(p.id)===String(draft.productId))
  const priceTable = (()=>{try { const v=loggedClient?.type==='VIP'?chosenProduct?.pricesVIP:chosenProduct?.pricesB;return typeof v==='string'?JSON.parse(v):v||{} }catch{return {}}})()
  const availableQuantities = [1000,2000,3000,4000,5000,6000,7000,8000,9000,10000].filter(q=>Number(priceTable[q])>0)
  const draftButton = (label,callback) => <button className="marwa-chat-choice" type="button" key={label} onClick={callback}>{label}<span aria-hidden="true">‹</span></button>
  const showChatMenu = () => {setChatMode('menu');setDraftStep('')}
  const showPriceCategories = () => {setChatMode('priceCategories');setDraftStep('');setDraft(v=>({...v,categoryId:'',subCategoryId:'',productId:''}));setMessages(prev=>prev[prev.length-1]?.text?.startsWith('دي أقسام المروة المتاحة 👇')?prev:[...prev.slice(-15),{from:'bot',text:'دي أقسام المروة المتاحة 👇\n'+chatOptions(categories)}])}
  const showPriceSubcategories = id => {setDraft(v=>({...v,categoryId:String(id),subCategoryId:'',productId:''}));setChatMode(subCategories.some(c=>String(c.categoryId)===String(id))?'priceSubcategories':'priceProducts')}
  const showPriceProducts = id => {setDraft(v=>({...v,subCategoryId:String(id),productId:''}));setChatMode('priceProducts')}
  const showPriceProduct = id => {setDraft(v=>({...v,productId:String(id)}));setChatMode('priceDetails')}
  const chatOptions=(items)=>items.length?items.map((x,i)=>(i+1)+'. '+x.name).join('\n'):'مفيش اختيارات متاحة حاليًا.';
  const chatProducts=(categoryId,subId)=>products.filter(p=>subId?String(p.subCategoryId)===String(subId):String(p.categoryId)===String(categoryId));
  const reply = (raw) => {
    const q = raw.trim()
    if (!q) return
    const normalized = q.toLocaleLowerCase('ar')
    if(!loggedClient){setWelcomeStep('ask');setMessages(prev=>[...prev.slice(-17),{from:'user',text:q},{from:'bot',text:'أهلاً بيك! اختار أول مرة أو عميل سابق علشان نكمل معاك.'}]);setQuestion('');return}
    const normalizeName=v=>String(v||'').toLocaleLowerCase('ar').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').trim();
    if(draftStep==='specifications'||chatMode==='priceSpecifications'){
      const yes=/^(تمام|موافق|اكمل|كمل|نعم|ايوه|أيوه|اه|آه|ok|yes)$/i.test(q);
      if(yes){
        const qty=availableQuantities;
        if(draftStep==='specifications')setDraftStep('quantity');else setChatMode('priceDetails');
        setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:qty.length?'ممتاز 👌 اختار الكمية المناسبة:\\n'+qty.map(n=>n+' نسخة').join('، '):'مفيش أسعار متاحة لفئة حسابك حاليًا.'}]);setQuestion('');return;
      }
      if(/^(رجوع|تغيير|غير|لا|لأ)$/i.test(q)){setDraftStep('');setChatMode('priceCategories');setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'تمام، اختار قسم أو اكتب اسم منتج تاني.'}]);setQuestion('');return}
      setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'لو المواصفات مناسبة اكتب «تمام»، أو اكتب «تغيير» لاختيار منتج تاني.'}]);setQuestion('');return;
    }
    // Conversational shortcut: understand a product and a quantity in one sentence.
    const natural=normalizeName(q).replace(/[^\\p{L}\\p{N} ]/gu,' ').replace(/\\s+/g,' ').trim();
    const digitInput=natural.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
    const quantityMatch=digitInput.match(/\\b(1000|2000|3000|4000|5000|6000|7000|8000|9000|10000)\\b/);
    const requestedQuantity=quantityMatch?Number(quantityMatch[1]):0;
    const matchedProducts=(products||[]).filter(p=>{
      const name=normalizeName(p.name).replace(/[^\\p{L}\\p{N} ]/gu,' ').trim();
      return name.length>=3 && natural.includes(name);
    }).sort((a,b)=>String(b.name).length-String(a.name).length);
    if(matchedProducts.length && !['job','pdf','preview','payment'].includes(draftStep)){
      const p=matchedProducts[0];
      const table=(()=>{try{const v=loggedClient?.type==='VIP'?p.pricesVIP:p.pricesB;return typeof v==='string'?JSON.parse(v):v||{}}catch{return {}}})();
      const quantities=[1000,2000,3000,4000,5000,6000,7000,8000,9000,10000].filter(n=>Number(table[n])>0);
      setDraft(v=>({...v,categoryId:String(p.categoryId||''),subCategoryId:String(p.subCategoryId||''),productId:String(p.id),quantity:requestedQuantity&&quantities.includes(requestedQuantity)?String(requestedQuantity):''}));
      setQuestion('');
      if(productSpecifications(p)){
        setDraftStep('specifications');setChatMode('menu');
        setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:describeProduct(p,requestedQuantity)}]);return;
      }
      if(requestedQuantity&&quantities.includes(requestedQuantity)){
        setDraftStep('confirm');setChatMode('menu');
        setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'تمام 👌 '+p.name+'، '+requestedQuantity+' نسخة بسعر '+table[requestedQuantity]+' جنيه لفئة حسابك. تحب نكمل الطلب؟'}]);return;
      }
      setDraftStep('quantity');setChatMode('menu');
      setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:quantities.length?'تمام، لقيت '+p.name+' 👌 محتاج كام نسخة؟\\n'+quantities.map(n=>n+' نسخة').join('، '):'لقيت المنتج، بس مفيش سعر متاح لفئة حسابك حاليًا.'}]);return;
    }
    const answerChoice=(items,label)=>{
      const digits=q.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));const n=/^\d+$/.test(digits)?Number(digits):0;const found=(n>=1&&n<=items.length?items[n-1]:null)||items.find(x=>normalizeName(x.name)===normalizeName(q))||items.find(x=>normalizeName(x.name).includes(normalizeName(q))&&q.length>=2);
      if(!found){setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'مش لاقي '+label+' ده. اختار بالاسم أو الرقم من القائمة:\n'+chatOptions(items)}]);setQuestion('');return null}
      return found;
    };
    // Allow customers to change category or choose a named subcategory/product at any selection step.
    const selectionSteps=['category','subcategory','product'];
    const selectionModes=['priceCategories','priceSubcategories','priceProducts'];
    if(selectionSteps.includes(draftStep)||(!draftStep&&selectionModes.includes(chatMode))){
      const clean=v=>normalizeName(v).replace(/^(قسم|اسعار|أسعار|سعر|عن)\\s+/g,'').replace(/\\s+/g,' ');
      const query=clean(q);
      const matching=(items)=>items.find(x=>clean(x.name)===query)||items.find(x=>query.length>=3&&(clean(x.name).includes(query)||query.includes(clean(x.name))));
      const category=matching(categories);
      const subcategory=matching(subCategories);
      const product=matching(products);
      const inDraft=Boolean(draftStep);
      if(category && !(draftStep==='category'||chatMode==='priceCategories')){
        const subs=subCategories.filter(x=>String(x.categoryId)===String(category.id));
        const ps=chatProducts(category.id,'');
        setDraft(v=>({...v,categoryId:String(category.id),subCategoryId:'',productId:'',quantity:''}));
        if(inDraft)setDraftStep(subs.length?'subcategory':'product');else setChatMode(subs.length?'priceSubcategories':'priceProducts');
        setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:(subs.length?'اختار القسم الفرعي:\\n'+chatOptions(subs):'اختار المنتج:\\n'+chatOptions(ps))}]);setQuestion('');return;
      }
      if(subcategory && String(subcategory.categoryId)!==String(draft.categoryId) || subcategory && (draftStep==='subcategory'||chatMode==='priceSubcategories') && String(subcategory.categoryId)===String(draft.categoryId)){
        const ps=products.filter(p=>String(p.subCategoryId)===String(subcategory.id));
        setDraft(v=>({...v,categoryId:String(subcategory.categoryId),subCategoryId:String(subcategory.id),productId:'',quantity:''}));
        if(inDraft)setDraftStep('product');else setChatMode('priceProducts');
        setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:ps.length?'اختار المنتج:\\n'+chatOptions(ps):'مفيش منتجات في القسم ده حاليًا. اكتب اسم قسم تاني.'}]);setQuestion('');return;
      }
      if(product && !(draftStep==='product'||chatMode==='priceProducts')){
        const table=(()=>{try{const v=loggedClient?.type==='VIP'?product.pricesVIP:product.pricesB;return typeof v==='string'?JSON.parse(v):v||{}}catch{return {}}})();
        const qty=[1000,2000,3000,4000,5000,6000,7000,8000,9000,10000].filter(n=>Number(table[n])>0);
        setDraft(v=>({...v,categoryId:String(product.categoryId||''),subCategoryId:String(product.subCategoryId||''),productId:String(product.id),quantity:''}));
        if(productSpecifications(product)){
          if(inDraft)setDraftStep('specifications');else setChatMode('priceSpecifications');
          setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:describeProduct(product)}]);setQuestion('');return;
        }
      if(inDraft)setDraftStep('quantity');else setChatMode('priceDetails');
        setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:qty.length?'اختار الكمية:\\n'+qty.map(n=>n+' نسخة').join('\\n'):'مفيش أسعار متاحة للمنتج ده.'}]);setQuestion('');return;
      }
    }
    if(draftStep==='category'||chatMode==='priceCategories'){
      const c=answerChoice(categories,'القسم');if(!c)return;
      const subs=subCategories.filter(x=>String(x.categoryId)===String(c.id));
      setDraft(v=>({...v,categoryId:String(c.id),subCategoryId:'',productId:''}));
      if(draftStep==='category')setDraftStep(subs.length?'subcategory':'product');else setChatMode(subs.length?'priceSubcategories':'priceProducts');
      setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:subs.length?'تمام 👌 اختار القسم الفرعي بالاسم أو الرقم:\n'+chatOptions(subs):'تمام 👌 اختار المنتج بالاسم أو الرقم:\n'+chatOptions(chatProducts(c.id,''))}]);setQuestion('');return;
    }
    if(draftStep==='subcategory'||chatMode==='priceSubcategories'){
      const c=answerChoice(subCategories.filter(x=>String(x.categoryId)===draft.categoryId),'القسم الفرعي');if(!c)return;
      setDraft(v=>({...v,subCategoryId:String(c.id),productId:''}));
      if(draftStep==='subcategory')setDraftStep('product');else setChatMode('priceProducts');
      const ps=products.filter(p=>String(p.subCategoryId)===String(c.id));
      setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:ps.length?'اختار المنتج بالاسم أو الرقم:\n'+chatOptions(ps):'القسم ده مفيهوش منتجات متاحة حاليًا. اكتب «رجوع» علشان تختار قسم تاني.'}]);setQuestion('');return;
    }
    if(draftStep==='product'||chatMode==='priceProducts'){
      const ps=products.filter(p=>draft.subCategoryId?String(p.subCategoryId)===draft.subCategoryId:String(p.categoryId)===draft.categoryId);
      const p=answerChoice(ps,'المنتج');if(!p)return;
      setDraft(v=>({...v,productId:String(p.id)}));
      const table=(()=>{try{let x=loggedClient?.type==='VIP'?p.pricesVIP:p.pricesB;return typeof x==='string'?JSON.parse(x):x||{}}catch{return {}}})();
      const qty=[1000,2000,3000,4000,5000,6000,7000,8000,9000,10000].filter(n=>Number(table[n])>0);
      if(productSpecifications(p)){
        if(draftStep==='product')setDraftStep('specifications');else setChatMode('priceSpecifications');
        setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:describeProduct(p)}]);setQuestion('');return;
      }
      if(draftStep==='product')setDraftStep('quantity');else setChatMode('priceDetails');
      setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:qty.length?'اختار الكمية واكتب عدد النسخ:\n'+qty.map((n,i)=>(i+1)+'. '+n+' نسخة').join('\n'):'المنتج ده مفيش له أسعار متاحة لفئة حسابك حاليًا.'}]);setQuestion('');return;
    }
    if(draftStep==='quantity'||chatMode==='priceDetails'){
      const digitText=q.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
      const wordIndex={'واحد':1,'اثنين':2,'اتنين':2,'ثلاثة':3,'تلاتة':3,'اربعة':4,'أربعة':4,'خمسة':5,'ستة':6,'سبعة':7,'ثمانية':8,'تمانية':8,'تسعة':9,'عشرة':10};
      const cleaned=digitText.trim().toLocaleLowerCase('ar');
      const numeric=Number(cleaned.replace(/[^0-9]/g,''));
      const quantity=availableQuantities.includes(numeric)?numeric:(numeric>=1&&numeric<=availableQuantities.length?availableQuantities[numeric-1]:(wordIndex[cleaned]&&wordIndex[cleaned]<=availableQuantities.length?availableQuantities[wordIndex[cleaned]-1]:(/^(الف|ألف)( نسخة| نسخ)?$/.test(cleaned)?1000:0)));
      if(!availableQuantities.includes(quantity)){setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'الكمية دي مش متاحة. اكتب واحدة من الكميات: '+availableQuantities.join('، ')}]);setQuestion('');return}
      setMessages(prev=>[...prev,{from:'user',text:q}]);setQuestion('');confirmQuantity(quantity);return;
    }
    if(/^(رجوع|القائمة|الغاء|إلغاء)$/i.test(q)){setDraftStep('');setChatMode('menu');setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'تمام، تحب تعرف سعر منتج، تعمل طلب جديد، ولا تتابع طلب؟'}]);setQuestion('');return}
    if(draftStep==='job'){
      setQuestion('');
      if(q.length<2){setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'اكتب اسم الشغل كامل علشان نكمل.'}]);return}
      setDraft(v=>({...v,jobName:q}));
      setDraftStep(draft.pdf?'preview':'pdf');
      setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:draft.pdf?'تمام، راجع تفاصيل الطلب قبل الإرسال.':'تمام يا '+(loggedClient.name||'فندم')+' 👌 سجلت اسم الشغل: '+q+'. دلوقتي ارفع ملف PDF أو صورة JPG/PNG عالية الجودة.'}]);
      return;
    }
    if(draftStep==='confirm'){
      setQuestion('')
      if(/^(ايوه|أيوه|اه|آه|نعم|تمام|موافق|اكمل|كمل|yes|ok)/i.test(normalized)){setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'تمام، اكتب اسم الشغل علشان نجهز ملف الطباعة.'}]);setDraftStep('job');return}
      if(/^(لا|لأ|غير|تغيير|no)/i.test(normalized)){setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'ولا يهمك، اختار الكمية المناسبة تاني.'}]);setDraftStep('quantity');return}
      setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'تحب نكمل الطلب بالمنتج والكمية دول؟ اختار أيوه أو تغيير الكمية.'}]);return
    }
    if(/سعر|اسعار|أسعار|الاسعار|الأسعار|تكلف|بكام|ثمن|price/.test(normalized)){setMessages(prev=>[...prev,{from:'user',text:q}]);setQuestion('');showPriceCategories();return}
    if(/طلب جديد|اطبع|عايز اطلب|اعمل طلب|عاوز اطلب|اطبعلي|اوردر جديد|أوردر جديد|طلب طباعة/.test(normalized)){setMessages(prev=>[...prev,{from:'user',text:q}]);setQuestion('');beginDraft();return}
    if(/طلب|اوردر|أوردر/.test(normalized)&&/حالة|متابع|فين|وصل|قديم|طلباتي/.test(normalized)){setMessages(prev=>[...prev,{from:'user',text:q},{from:'bot',text:'حاضر يا '+(loggedClient.name||'فندم')+' 📦 اضغط «عرض طلباتي» علشان تشوف الطلبات المرتبطة بحسابك وحالة كل واحد. بيانات العملاء التانيين مش هتظهر.'}]);setQuestion('');setChatMode('menu');return}
    let answer = 'ممكن تسألني عن الأسعار أو المنتجات أو طريقة الطلب أو متابعة طلبك. ولو محتاج مساعدة خاصة، تواصل مع خدمة العملاء.'
    if (/سعر|اسعار|أسعار|الاسعار|الأسعار|تكلف|بكام|ثمن|price/.test(normalized)) {
      if(!loggedClient){setWelcomeStep('ask')}
      const tier = loggedClient?.type === 'VIP' ? 'VIP' : 'B'
      const priced = (products||[]).map(p=>{
        let table=tier==='VIP'?p.pricesVIP:p.pricesB
        try{if(typeof table==='string')table=JSON.parse(table)}catch{table={}}
        const entries=Object.entries(table||{}).filter(([qty,price])=>/^\d+$/.test(qty)&&Number(price)>0).sort((a,b)=>Number(a[0])-Number(b[0]))
        return {name:p.name,entries}
      }).filter(p=>p.name&&p.entries.length)
      const found=priced.filter(p=>normalized.includes(String(p.name).toLocaleLowerCase('ar'))).slice(0,5)
      const list=found.length?found:priced.slice(0,5)
      answer=loggedClient
        ? (list.length?'أسعار فئة '+tier+' حسب الكمية:\n'+list.map(p=>p.name+': '+p.entries.slice(0,5).map(([qty,price])=>qty+' نسخة = '+price+' ج.م').join(' | ')).join('\n')+'\nلو عايز منتج معين اكتب اسمه.':'مفيش أسعار منشورة حاليًا للمنتجات المتاحة.')
        : 'أهلاً بيك 👋 هل دي أول مرة تتعامل مع المروة؟ اختار من الزرين تحت علشان نكمل معاك.'
    } else if (/طلب|اوردر|أوردر|اطلب/.test(normalized) && /حالة|متابع|فين|وصل/.test(normalized)) {
      answer = loggedClient ? 'تقدر تراجع حالة طلباتك من صفحة «طلباتي». اضغط زر «عرض طلباتي» تحت.' : 'لمتابعة طلبك، سجل دخولك الأول وبعدها افتح «طلباتي». مش هنعرض بيانات طلب من غير تسجيل دخول.'
    } else if (/pdf|ملف|ارفع|تصميم/.test(normalized)) {
      answer = 'اختار المنتج والكمية واسم الشغل، وارفع ملف PDF أو صورة JPG/PNG عالية الجودة عند إرسال الطلب. إيصال الدفع اختياري للمراجعة.'
    } else if (/دفع|فودافون|انستا|تحويل|نقد/.test(normalized)) {
      answer = 'طرق الدفع المتاحة في بوت المروة: نقدي، فودافون كاش، إنستا باي، وتحويل بنكي.'
    } else if (/طلب|اوردر|أوردر|اطلب/.test(normalized)) {
      answer = 'ابدأ باختيار القسم ثم المنتج والكمية، واكتب اسم الشغل وارفع PDF أو صورة عالية الجودة، وبعدها راجع تفاصيل الطلب قبل الإرسال.'
    } else {
      const matches = (products || []).filter(p => p.name && normalized.length >= 3 && p.name.toLocaleLowerCase('ar').includes(normalized)).slice(0, 4)
      if (matches.length) answer = 'لقيت المنتجات دي: ' + matches.map(p => p.name).join('، ') + '. افتح قسم المنتج علشان تشوف السعر حسب الكمية.'
    }
    setMessages(prev => [...prev.slice(-17), { from: 'user', text: q }, { from: 'bot', text: answer }])
    setQuestion('')
  }
  useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}},[open])
  return <><style>{`
    .marwa-chat,.marwa-chat *{box-sizing:border-box}
    .marwa-chat{font-family:Tahoma,Arial,sans-serif!important;color:#172b4d}
    .marwa-chat-dialog{background:#f4f7fc!important}
    .marwa-chat-header{background:linear-gradient(115deg,#071c52,#124ba6)!important;min-height:76px;flex-shrink:0;padding:13px 17px!important;gap:12px;box-shadow:0 3px 15px #0b2a611a}
    .marwa-chat-title{display:flex;align-items:center;gap:11px;min-width:0}
    .marwa-chat-logo{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:#ffffff20;font-size:23px;flex-shrink:0}
    .marwa-chat-title strong{font-size:17px;display:block;line-height:1.4}
    .marwa-chat-title small{display:block;color:#c6defe;font-size:11px;margin-top:3px}
    .marwa-chat-close{font-size:13px!important;font-weight:700;border:1px solid #ffffff50!important;border-radius:11px;padding:9px 11px;white-space:nowrap;background:#ffffff14!important}
    .marwa-chat-messages{background:linear-gradient(#f4f7fc,#f9fbff);padding:17px 13px 20px!important;gap:13px!important;overscroll-behavior:contain}
    .marwa-chat-bubble{box-shadow:0 3px 10px #142d4d0c;overflow-wrap:anywhere;word-break:break-word;font-size:14px!important;line-height:1.9!important;padding:12px 15px!important;max-width:88%!important}
    .marwa-chat-bubble.bot{border:1px solid #e3eaf5;border-radius:16px 16px 5px 16px!important;background:white!important;color:#263a56}
    .marwa-chat-bubble.user{border:1px solid #c4d8ff;border-radius:16px 16px 16px 5px!important;background:#e6efff!important;color:#123e88}
    .marwa-chat-choice{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:48px;text-align:right;padding:12px 15px;margin:8px 0;background:white;border:1px solid #d8e4f6;border-right:4px solid #2463c5;border-radius:13px;cursor:pointer;color:#173a70;font-weight:700;font-size:14px;box-shadow:0 2px 8px #173b6e0b;transition:background .15s,border-color .15s}
    .marwa-chat-choice span{font-size:24px;color:#3976d2;line-height:1}
    .marwa-chat-choice:active,.marwa-chat-choice:hover{background:#edf5ff;border-color:#8db9ff}
    .marwa-chat-messages input[type=file]{max-width:100%;font-size:12px;color:#334155}
    .marwa-chat-messages p{overflow-wrap:anywhere;line-height:1.85}
    .marwa-chat-actions{background:white;border-top:1px solid #e5ecf6;padding:9px 12px!important;gap:7px!important;flex-shrink:0}
    .marwa-chat-actions>.marwa-chat-choice{flex:1 1 100%;margin:0;min-height:43px;background:#eaf2ff}
    .marwa-chat-actions>button:not(.marwa-chat-choice){background:#f5f8fe!important;border-color:#dbe7f8!important;color:#24518c;font-weight:700;min-height:34px}
    .marwa-chat-form{background:white;border-top:1px solid #e5ecf6;padding:11px 12px max(12px,env(safe-area-inset-bottom))!important;gap:9px!important;flex-shrink:0}
    .marwa-chat-form input{background:#f7faff;border:1px solid #cfdcf0!important;border-radius:13px!important;font-size:14px;min-height:45px}
    .marwa-chat-form button{background:#1454b7!important;border-radius:12px!important;font-weight:800;padding:10px 17px!important}
    .marwa-chat-form button:disabled{opacity:.5}
    @media(max-width:600px){.marwa-chat-header{min-height:69px}.marwa-chat-title strong{font-size:15px}.marwa-chat-logo{width:37px;height:37px}.marwa-chat-messages{padding:12px 11px!important}.marwa-chat-bubble{max-width:94%!important}.marwa-chat-actions{max-height:126px;overflow-y:auto}.marwa-chat-close{font-size:12px!important}}
  `}</style><div className="marwa-chat" dir="rtl" style={open?{position:'fixed',inset:0,zIndex:350,fontFamily:'inherit',background:'#0f172a',display:'flex',justifyContent:'center',alignItems:'stretch',padding:0}:{position:'fixed',bottom:18,left:18,zIndex:350,fontFamily:'inherit'}}>
    {open && <section className="marwa-chat-dialog" role="dialog" aria-label="مساعد المروة" style={{width:'100%',maxWidth:760,height:'100%',maxHeight:'100dvh',background:'white',borderRadius:0,boxShadow:'0 12px 42px #0f172a44',display:'flex',flexDirection:'column',overflow:'hidden',marginBottom:0,border:'none'}}>
      <header className="marwa-chat-header" style={{background:'#1e3a8a',color:'white',padding:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}><div className="marwa-chat-title"><span className="marwa-chat-logo">💬</span><div><strong>مساعد المروة</strong><small>خدمة العملاء • معاك خطوة بخطوة</small></div></div><button type="button" onClick={()=>setOpen(false)} aria-label="الرجوع للموقع" className="marwa-chat-close" style={{background:'transparent',border:0,color:'white',fontSize:22,cursor:'pointer'}}>← رجوع للموقع</button></header>
      <div className="marwa-chat-messages" ref={messageListRef} aria-live="polite" style={{flex:1,minHeight:0,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:10}}>
        {messages.map((m,i)=><div className={'marwa-chat-bubble '+m.from} key={i} style={{alignSelf:m.from==='user'?'flex-start':'flex-end',background:m.from==='user'?'#dbeafe':'#f1f5f9',padding:'9px 11px',borderRadius:12,maxWidth:'92%',fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{m.text}</div>)}
        {!loggedClient && welcomeStep==='ask' && <div style={{alignSelf:'stretch',padding:10,border:'1px solid #bfdbfe',borderRadius:12,background:'#eff6ff',fontSize:13}}>
          <strong>👋 أهلاً بيك! هل دي أول مرة تتعامل مع المروة؟</strong>
          <p style={{margin:'5px 0 9px'}}>اختار علشان نكمل معاك ونعرض الأسعار المناسبة.</p>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button type="button" onClick={()=>{setWelcomeStep('');setOpen(false);onRegister()}} style={{padding:'8px 10px',border:0,borderRadius:8,background:'#16a34a',color:'white',cursor:'pointer'}}>أول مرة — تسجيل جديد</button>
            <button type="button" onClick={()=>{setWelcomeStep('');setOpen(false);onLogin()}} style={{padding:'8px 10px',border:0,borderRadius:8,background:'#1e3a8a',color:'white',cursor:'pointer'}}>عميل سابق — دخول</button>
          </div>
        </div>}
      {loggedClient && !draftStep && <div style={{padding:'8px 12px',fontSize:13}}>
        
        {chatMode==='priceDetails' && <p>اكتب الكمية اللي محتاجها: {availableQuantities.map(q=>q+' نسخة = '+priceTable[q]+' جنيه').join('، ')||'مفيش أسعار متاحة'}</p>}
      </div>}
      {draftStep && <div style={{padding:'10px 12px',fontSize:13}}>
        <strong>🧾 مسودة طلب طباعة — {draftStep==='preview'?'مراجعة البيانات':'الخطوة التالية'}</strong>
        {draftStep==='login' && <p>سجّل دخول العميل أولاً علشان نستخدم فئتك السعرية ونحافظ على خصوصية طلباتك.</p>}
        {draftStep==='category' && categories.map(c=>draftButton(c.name,()=>chooseDraft('categoryId',String(c.id),'subcategory')))}
        {draftStep==='subcategory' && subCategories.filter(c=>String(c.categoryId)===draft.categoryId).map(c=>draftButton(c.name,()=>chooseDraft('subCategoryId',String(c.id),'product')))}
        {draftStep==='product' && products.filter(p=>String(p.subCategoryId)===draft.subCategoryId).map(p=>draftButton(p.name,()=>chooseDraft('productId',String(p.id),'quantity')))}
        {draftStep==='specifications' && <div><p style={{whiteSpace:'pre-wrap'}}>📋 {chosenProduct?.name}\\n{productSpecifications(chosenProduct)}</p>{draftButton('المواصفات مناسبة — كمل',()=>{setDraftStep('quantity');setMessages(prev=>[...prev,{from:'bot',text:'تمام، اختار الكمية المناسبة.'}])})}</div>}
        {draftStep==='quantity' && (availableQuantities.length?availableQuantities.map(q=>draftButton(q+' نسخة — '+priceTable[q]+' ج.م',()=>confirmQuantity(q))):<p>لا توجد أسعار متاحة للمنتج وفئة حسابك.</p>)}
        {draftStep==='confirm' && <div><p>🧾 حضرتك اخترت <b>{chosenProduct?.name}</b> — <b>{draft.quantity} نسخة</b> بسعر <b>{priceTable[draft.quantity]} جنيه</b> لفئة {loggedClient?.type==='VIP'?'VIP':'B'}. تحب نكمل الأوردر؟</p>{draftButton('✅ أيوه، كمل الأوردر',()=>{setDraftStep('job');setMessages(prev=>[...prev,{from:'user',text:'أيوه، كمل الأوردر'},{from:'bot',text:'تمام يا فندم، اكتب اسم الشغل علشان نكمل.'}])})}{draftButton('🔄 لا، غيّر الكمية',()=>{setDraftStep('quantity');setMessages(prev=>[...prev,{from:'user',text:'تغيير الكمية'},{from:'bot',text:'اختار الكمية الجديدة 👇'}])})}{draftButton('↩ تغيير المنتج',()=>{setDraftStep('product');setDraft(v=>({...v,quantity:''}))})}</div>}
        {draftStep==='job' && <form onSubmit={e=>{e.preventDefault();if(draft.jobName.trim()){setDraftStep(draft.pdf?'preview':'pdf');setDraftError('');setMessages(prev=>[...prev,{from:'bot',text:'تسلم يا '+(loggedClient?.name||'فندم')+' 🙌 ارفع ملف التصميم PDF أو صورة JPG/PNG عالية الجودة (لحد 3 ميجابايت).'}])}}}><input aria-label="اسم الشغل" placeholder="اسم الشغل (غير اسم العميل)" maxLength={120} value={draft.jobName} onChange={e=>setDraft(v=>({...v,jobName:e.target.value}))} style={{width:'100%',padding:9,boxSizing:'border-box',margin:'8px 0'}}/><button disabled={!draft.jobName.trim()} type="submit">{draft.pdf?'التالي: مراجعة الطلب':'التالي: رفع ملف التصميم'}</button></form>}
        {draftStep==='pdf' && <div><p>📎 ارفع تصميم الطباعة بصيغة PDF أو صورة JPG/PNG عالية الجودة، بحد أقصى 3 ميجابايت. الأفضل ملف أصلي واضح، والصور الضعيفة ممكن تحتاج مراجعة من الموظف.</p><input aria-label="ملف التصميم" type="file" accept=".pdf,application/pdf,.jpg,.jpeg,.png,image/jpeg,image/png" onChange={e=>{const f=e.target.files?.[0];if(!f)return;setDraftError('');if(!/\.(pdf|jpe?g|png)$/i.test(f.name)){setDraftError('❌ اختار PDF أو صورة JPG/PNG فقط.');e.target.value='';return}if(f.size>3*1024*1024){setDraftError('❌ الملف أكبر من 3 ميجابايت.');e.target.value='';return}if(!f.size){setDraftError('❌ الملف فاضي.');e.target.value='';return}setDraft(v=>({...v,pdf:f}));setDraftStep('preview');setMessages(prev=>[...prev,{from:'bot',text:'وصل الملف '+f.name+' ✅ راجع بيانات الشغل واضغط إرسال المسودة للمراجعة.'}])}}/>{draftError&&<p role="alert" style={{background:'#fee2e2',color:'#991b1b',padding:12,borderRadius:9,fontWeight:700}}>{draftError}</p>}</div>}
        {draftStep==='preview' && <div style={{background:'#fff',border:'1px solid #dbeafe',borderRadius:14,padding:13}}>
          <div style={{fontWeight:800,color:'#123c80',fontSize:16,marginBottom:10}}>🧾 راجع أوردر حضرتك قبل الإرسال</div>
          <div style={{display:'grid',gap:7,fontSize:13}}>
            {[[ 'العميل',loggedClient?.name||'عميل المروة'],['المنتج',chosenProduct?.name||'—'],['الكمية',draft.quantity+' نسخة'],['اسم الشغل',draft.jobName],['السعر المعروض',priceTable[draft.quantity]+' جنيه'],['ملف التصميم',draft.pdf?.name||'لم يتم رفع ملف']].map(([label,value])=><div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:10,padding:'8px 0',borderBottom:'1px solid #eef2f7'}}><span style={{color:'#64748b',flexShrink:0}}>{label}</span><b style={{overflowWrap:'anywhere',textAlign:'left'}}>{value}</b></div>)}
          </div>
          <p style={{fontSize:12,color:'#92400e',lineHeight:1.8}}>الطلب هيتبعت للمراجعة، ومش هيصدر سيريال رسمي إلا بعد اعتماد موظف المروة.</p>
          <button type="button" disabled={draftSubmitting} onClick={submitDraft} style={{width:'100%',background:'#15803d',color:'white',padding:'13px',border:0,borderRadius:11,cursor:'pointer',fontWeight:800}}>{draftSubmitting?'⏳ جاري رفع التصميم وحفظ الطلب...':'✅ تأكيد وإرسال الطلب للمراجعة'}</button>
          <div style={{marginTop:9}}>{draftButton('✏️ تعديل اسم الشغل',()=>setDraftStep('job'))}{draftButton('🔢 تعديل الكمية',()=>setDraftStep('quantity'))}{draftButton('📦 تغيير المنتج',()=>{setDraftStep('product');setDraft(v=>({...v,quantity:''}))})}{draftButton('📎 تغيير ملف التصميم',()=>setDraftStep('pdf'))}</div>
          {draftError&&<p role="alert" style={{color:'#b91c1c',fontWeight:700}}>{draftError}</p>}
        </div>}
        {draftStep==='payment' && <div><p>💳 مسودة رقم {lastDraftId}. اختار طريقة الدفع اللي تناسبك:</p>{['نقدي','فودافون كاش','انستا باي','تحويل بنكي'].map(method=>draftButton(method,()=>{setPaymentChoice(method);setPaymentReceipt(null);setPaymentFeedback('');if(method==='نقدي')saveDraftPayment(method)}))}{paymentChoice&&['فودافون كاش','انستا باي','تحويل بنكي'].includes(paymentChoice)&&<div style={{background:'#eff6ff',padding:12,borderRadius:10}}><p>اخترت {paymentChoice}. تقدر تسجل الطريقة دلوقتي أو ترفق إيصال التحويل (اختياري).</p><input aria-label="إيصال التحويل" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(!/\.(pdf|jpe?g|png)$/i.test(f.name)||!f.size||f.size>3*1024*1024){setPaymentFeedback('❌ اختار إيصال PDF أو JPG/PNG أقل من 3 ميجابايت');e.target.value='';return}setPaymentReceipt(f);setPaymentFeedback('📎 تم اختيار الإيصال: '+f.name+' — اضغط «حفظ طريقة الدفع والإيصال» لرفعه فعليًا.')}}/>{draftButton(paymentBusy?'جاري الحفظ...':'💾 حفظ طريقة الدفع'+(paymentReceipt?' والإيصال':''),()=>{if(!paymentBusy)saveDraftPayment(paymentChoice,paymentReceipt)})}</div>}{paymentFeedback&&<p role="status" style={{padding:10,borderRadius:8,background:paymentFeedback.startsWith('❌')?'#fee2e2':paymentFeedback.startsWith('📎')?'#eff6ff':'#ecfdf5',whiteSpace:'pre-wrap'}}>{paymentFeedback}</p>}<p style={{color:'#92400e'}}>اختيار الطريقة أو رفع إيصال لا يثبت استلام المبلغ. الموظف وحده يؤكد التحصيل.</p>{draftButton('🔎 متابعة موافقة الموظف',checkWebsiteOrder)}{draftButton('🧾 طلب جديد',beginDraft)}{draftButton('↩ الرجوع للقائمة',()=>setDraftStep(''))}</div>}
        {draftStep!=='payment'&&draftButton('إلغاء المسودة',()=>setDraftStep(''))}
      </div>}
      </div>
      <form className="marwa-chat-form" onSubmit={e=>{e.preventDefault();reply(question)}} style={{display:'flex',gap:6,padding:10,borderTop:'1px solid #e2e8f0'}}>
        <input aria-label="اكتب سؤالك" value={question} onChange={e=>setQuestion(e.target.value)} placeholder={draftStep==='job'?'اكتب اسم الشغل...':draftStep==='category'||chatMode==='priceCategories'?'اكتب اسم القسم...':draftStep==='product'||chatMode==='priceProducts'?'اكتب اسم المنتج...':draftStep==='quantity'||chatMode==='priceDetails'?'اكتب الكمية...':'اكتب ردك للبوت هنا...'} maxLength={300} style={{flex:1,minWidth:0,border:'1px solid #cbd5e1',borderRadius:9,padding:9}} />
        <button type="submit" disabled={!question.trim()} style={{background:'#1e3a8a',color:'white',border:0,borderRadius:9,padding:'8px 12px',cursor:'pointer'}}>إرسال</button>
      </form>
    </section>}
    {!open && <button type="button" aria-label="فتح مساعد المروة" onClick={()=>setOpen(true)} style={{border:0,borderRadius:30,background:'#1e3a8a',color:'white',padding:'13px 18px',fontWeight:800,boxShadow:'0 6px 20px #0f172a55',cursor:'pointer'}}>💬 اسأل المروة</button>}
  </div></>
}

export default function App() {
  const [clients, setClients] = useState([])
  const [showStickerSettings, setShowStickerSettings] = useState(false)
  const [stickerSize, setStickerSize] = useState(() => { try { const v=JSON.parse(localStorage.getItem('elmarw_sticker_size')||'{}'); return {width:v.width||4,height:v.height||2} } catch {return {width:4,height:2}} })
  const [showPasswords, setShowPasswords] = useState({register:false,login:false,admin:false})
  const [customerToken, setCustomerToken] = useState(() => sessionStorage.getItem('elmarw_customer_token') || '')
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [orders, setOrders] = useState([])
  const [employees, setEmployees] = useState([])
  const [folders, setFolders] = useState([])
  const [cart, setCart] = useState([])
  const [selectedSub, setSelectedSub] = useState(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [orderFile, setOrderFile] = useState(null)
  const [proofUploadStatus,setProofUploadStatus] = useState({})
  const [orderClientName, setOrderClientName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [adminTab, setAdminTab] = useState('dashboard')
  const [whatsappDrafts,setWhatsappDrafts]=useState([])
  const [whatsappDraftError,setWhatsappDraftError]=useState('')
  const [whatsappDraftLoading,setWhatsappDraftLoading]=useState(false)
  const [adminMenuOpen,setAdminMenuOpen]=useState(false)
  const lockWhatsappDraft=async(id)=>{setWhatsappDraftError('');try{const token=sessionStorage.getItem(TOKEN_KEY)||'';const response=await fetch('/api/whatsapp-review.js',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'lock',draftId:id})});const body=await response.json();if(!response.ok)throw new Error(body.error||'تعذر حجز المسودة');await loadWhatsappDrafts()}catch(e){setWhatsappDraftError(e.message)}}
  const loadWhatsappDrafts=async()=>{setWhatsappDraftLoading(true);setWhatsappDraftError('');try{const token=sessionStorage.getItem(TOKEN_KEY)||'';const response=await fetch('/api/whatsapp-review.js',{headers:{Authorization:'Bearer '+token}});const body=await response.json();if(!response.ok)throw new Error(body.error||'تعذر تحميل المسودات');setWhatsappDrafts(body.drafts||[])}catch(e){setWhatsappDraftError(e.message)}finally{setWhatsappDraftLoading(false)}}

  const [websiteDrafts,setWebsiteDrafts]=useState([])
  const [websiteDraftLoading,setWebsiteDraftLoading]=useState(false)
  const [websiteDraftError,setWebsiteDraftError]=useState('')
  const loadWebsiteDrafts=async()=>{
    setWebsiteDraftLoading(true);setWebsiteDraftError('')
    try{
      const token=sessionStorage.getItem(TOKEN_KEY)||''
      const response=await fetch('/api/website-chat-drafts.js',{headers:{Authorization:'Bearer '+token}})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'تعذر تحميل طلبات بوت الموقع')
      setWebsiteDrafts(result.drafts||[])
    }catch(e){setWebsiteDraftError(e.message)}finally{setWebsiteDraftLoading(false)}
  }
  const saveWebsiteDraftMethod=async(id,method)=>{
    setWebsiteDraftError('');
    try{
      const token=sessionStorage.getItem(TOKEN_KEY)||'';
      const response=await fetch('/api/website-chat-drafts.js?action=review-update',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({draftId:id,paymentMethod:method})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'تعذر حفظ طريقة الدفع');
      setWebsiteDrafts(prev=>prev.map(d=>d.id===id?{...d,payment_method:result.paymentMethod}:d));
      window.alert('تم حفظ طريقة الدفع للمسودة، ولم يتم تأكيد أي دفعة');
    }catch(e){setWebsiteDraftError(e.message);window.alert(e.message)}
  }
  const approveWebsiteDraft=async(id)=>{
    if(!window.confirm('اعتماد المسودة وتحويلها إلى أوردر رسمي؟ بعد الاعتماد تقدر تغير الحالة وتضيف الدفعات وتنقله لفولدر.'))return;
    setWebsiteDraftError('');
    try{
      const token=sessionStorage.getItem(TOKEN_KEY)||'';
      const response=await fetch('/api/website-chat-drafts.js?action=approve',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({draftId:id})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'تعذر اعتماد المسودة');
      await Promise.all([loadWebsiteDrafts(),loadAll(token)]);
      window.alert('تم اعتماد الأوردر بكود '+result.serial+' ✅\\nهتلاقيه في أوردرات جديد وتقدر تعدل حالته وتضيف دفعة وتنقله لفولدر.');
    }catch(e){setWebsiteDraftError(e.message);window.alert('فشل الاعتماد: '+e.message)}
  }
  const openWebsiteDraftFile=async(id,kind)=>{
    setWebsiteDraftError('')
    try{
      const token=sessionStorage.getItem(TOKEN_KEY)||''
      const response=await fetch('/api/website-chat-drafts.js?action=review-file',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({draftId:id,kind})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'تعذر فتح الملف')
      window.open(result.url,'_blank','noopener,noreferrer')
    }catch(e){setWebsiteDraftError(e.message)}
  }
  const [accountsSection,setAccountsSection]=useState('manager')
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('جديد')
  const [showForm, setShowForm] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showSubCategoryForm, setShowSubCategoryForm] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)
  const [productSaving,setProductSaving] = useState(false)
  const [productSaveMessage,setProductSaveMessage] = useState('')
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [showMyOrders, setShowMyOrders] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [customerPaymentMethod, setCustomerPaymentMethod] = useState('نقدي')
  const [walletAmount, setWalletAmount] = useState('0')
  const [notifications, setNotifications] = useState([])
  const [siteDesign,setSiteDesign]=useState(()=>{try{return {...{title:'المروة للطباعة',primary:'#1e3a8a',accent:'#f59e0b',banner:'',logo:'',tagline:'طباعة احترافية بجودة عالية'},...JSON.parse(localStorage.getItem('elmarwa_site_design')||'{}')}}catch{return {title:'المروة للطباعة',primary:'#1e3a8a',accent:'#f59e0b',banner:'',logo:'',tagline:'طباعة احترافية بجودة عالية'}}})
  const saveSiteDesign=()=>{try{localStorage.setItem('elmarwa_site_design',JSON.stringify(siteDesign));alert('تم الحفظ على هذا المتصفح. النشر لجميع الزوار يحتاج ربط الإعدادات بقاعدة البيانات.')}catch{alert('حجم الصور كبير. استخدم صور أصغر أو روابط صور.')}}
  const readSiteImage=(file,field)=>{if(!file)return;if(!file.type.startsWith('image/')||file.size>700000){alert('اختار صورة أقل من 700 كيلوبايت');return}const reader=new FileReader();reader.onload=()=>setSiteDesign(v=>({...v,[field]:String(reader.result)}));reader.readAsDataURL(file)}
  const [clientSearch, setClientSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [accountingDate, setAccountingDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [dailyPayments,setDailyPayments]=useState([])
  const [dailyPaymentsError,setDailyPaymentsError]=useState('')
  const [dailyPaymentsLoaded,setDailyPaymentsLoaded]=useState(false)
  const [form, setForm] = useState({ name: '', phone: '', company: '', address: '', pass: '' })
  const [employeeForm, setEmployeeForm] = useState({ id: null, name: '', phone: '', pass: '', permissions: { dashboard: true, orders: true, clients: true, categories: true, products: true, employees: false, shipping: true } })
  const [categoryForm, setCategoryForm] = useState({ name: '', id: null })
  const [subCategoryForm, setSubCategoryForm] = useState({ name: '', categoryId: '', image: '', id: null })
  const [productForm, setProductForm] = useState({ name: '', categoryId: '', subCategoryId: '', image: '', specifications: '', id: null, pricesB: {1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''}, pricesVIP: {1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''} })
  const [login, setLogin] = useState({ phone: '', pass: '' })
  const [loggedClient, setLoggedClient] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)
  useEffect(()=>{if(!showAdmin||adminTab!=='accounts'||!['manager','delivery'].includes(accountsSection))return;let active=true;const token=sessionStorage.getItem(TOKEN_KEY);if(!token)return;setDailyPaymentsLoaded(false);fetch(`${API}payments`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'تعذر تحميل التحصيل');if(active){setDailyPayments(data);setDailyPaymentsError('');setDailyPaymentsLoaded(true)}}).catch(e=>{if(active){setDailyPaymentsError(e.message);setDailyPaymentsLoaded(true)}});return()=>{active=false}},[showAdmin,adminTab,accountsSection,orders])
  const [loggedEmployee, setLoggedEmployee] = useState(null)
  const [adminLogin, setAdminLogin] = useState({ user: '', pass: '' })
  const [newFolderName, setNewFolderName] = useState('')
  const [editFolderId, setEditFolderId] = useState(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deletePass, setDeletePass] = useState('')
  const quantities = [1000,2000,3000,4000,5000,6000,7000,8000,9000,10000]
  const orderStatuses = ['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم','معلق','تم التسليم','ملغي']
  const folderStatuses = ['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم','تم التسليم']
  const paymentMethods = ['نقدي','فودافون كاش','انستا باي','تحويل بنكي','آجل']

  const [loadError, setLoadError] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)
  const [categoryBusy, setCategoryBusy] = useState(false)

  const saveCategory = async () => {
    const name = categoryForm.name.trim()
    if (!name) { alert('اكتب اسم التصنيف'); return }
    const token = sessionStorage.getItem(TOKEN_KEY)
    if (!token) { alert('لازم تسجل دخول المدير'); return }
    setCategoryBusy(true)
    try {
      const response = await fetch(`${API}categories${categoryForm.id?'/'+categoryForm.id:''}`, {
        method: categoryForm.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
      await loadAll(token)
      setShowCategoryForm(false)
      setCategoryForm({ name: '', id: null })
      alert('تم حفظ التصنيف بنجاح ✅')
    } catch (error) {
      alert('فشل حفظ التصنيف: ' + error.message)
    } finally { setCategoryBusy(false) }
  }


  const loadCatalog = async () => {
    const resources = ['categories','subCategories','products']
    const setters = [setCategories,setSubCategories,setProducts]
    const results = await Promise.allSettled(resources.map(async key => {
      const response = await fetch(`${API}${key}`)
      const data = await response.json().catch(()=>null)
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || `Failed to load ${key}`)
      return data
    }))
    results.forEach((result,index) => {
      if (result.status === 'fulfilled') setters[index](result.value)
      else console.error(`Catalog load error: ${resources[index]}`,result.reason)
    })
  }

  const loadAll = async (token = sessionStorage.getItem(TOKEN_KEY)) => {
    if (!token) return

    const resources = [
      'clients', 'categories', 'subCategories',
      'products', 'orders', 'folders', 'employees'
    ]
    const setters = [
      setClients, setCategories, setSubCategories,
      setProducts, setOrders, setFolders, setEmployees
    ]

    const results = await Promise.allSettled(
      resources.map(key => apiRead(key, token))
    )
    const errors = []
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        setters[index](result.value)
      } else {
        console.error(`Failed to load ${resources[index]}:`, result.reason)
        errors.push(resources[index])
      }
    })
    setLoadError(errors.length ? `تعذر تحميل: ${errors.join(', ')}` : '')
  }

  useEffect(() => {
    const token = sessionStorage.getItem('elmarw_customer_token')
    if (token) fetch(`${API}clients&self=1`,{headers:{Authorization:`Bearer ${token}`}}).then(async response=>{
      if (!response.ok) throw new Error('expired')
      setLoggedClient(await response.json())
    }).catch(()=>{sessionStorage.removeItem('elmarw_customer_token');setCustomerToken('');setLoggedClient(null)})
    loadCatalog()
    // لا نثق في جلسة مخزنة إلا بعد تحقق السيرفر من صلاحية المدير
    const adminToken = sessionStorage.getItem(TOKEN_KEY)
    if (adminToken) {
      apiRead('categories', adminToken).then(() => {
        setLoggedEmployee({ name: 'المدير العام', permissions: {
          dashboard: true, employees: true, categories: true,
          products: true, clients: true, orders: true, shipping: true
        } })
        setShowAdmin(true)
        loadAll(adminToken)
      }).catch(() => sessionStorage.removeItem(TOKEN_KEY))
    }
    const nt = localStorage.getItem('notifications')
    if (nt) { try { setNotifications(JSON.parse(nt)) } catch {} }
  }, [])
  useEffect(() => { if(loggedClient) localStorage.setItem('loggedClient', JSON.stringify(loggedClient)) }, [loggedClient])
  useEffect(() => { localStorage.setItem('notifications', JSON.stringify(notifications)) }, [notifications])

  const btnStyle = { padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', margin: '5px' }
  const inputStyle = { display: 'block', width: '100%', margin: '10px 0', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }

  const printSticker = (o) => {
    const width=Number(stickerSize.width), height=Number(stickerSize.height);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<2||height<1||width>15||height>10){alert('مقاس الاستيكر غير صحيح');return}
    const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const w=window.open('','_blank','width=480,height=360');
    if(!w){alert('اسمح بفتح نافذة الطباعة من المتصفح');return}
    const date=String(o.date||o.executionDate||'').split(',')[0];
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>استيكر الطلب</title><style>
      @page{size:${width}cm ${height}cm;margin:0}
      *{box-sizing:border-box}html,body{margin:0;padding:0}
      body{width:${width}cm;height:${height}cm;padding:1mm;font-family:Tahoma,Arial,sans-serif;color:#000;overflow:hidden}
      .sticker{height:100%;display:flex;flex-direction:column;justify-content:space-around;gap:.2mm}
      .serial{font-weight:900;text-align:center;font-size:9pt;direction:ltr;border-bottom:1px solid #000}
      .line{font-weight:800;font-size:7pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .label{font-weight:400}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><div class="sticker">
      <div class="serial">${escapeHtml(o.serialNumber||o.id)}</div>
      <div class="line"><span class="label">العميل: </span>${escapeHtml(o.clientName||'-')}</div>
      <div class="line"><span class="label">اسم الشغل: </span>${escapeHtml(o.workerName||'-')}</div>
      <div class="line"><span class="label">تاريخ الطلب: </span>${escapeHtml(date||'-')}</div>
      </div><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  const printFolderStickers = (folder) => {
    const list=orders.filter(o=>(folder.orderIds||[]).map(String).includes(String(o.id)));
    if(!list.length){alert('الفولدر لا يحتوي على أوردرات للطباعة');return}
    const width=Number(stickerSize.width),height=Number(stickerSize.height);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<2||height<1||width>15||height>10){alert('راجع مقاس الاستيكر من الإعدادات');return}
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const w=window.open('','_blank');
    if(!w){alert('اسمح بفتح نافذة الطباعة');return}
    const stickers=list.map(o=>`<section class="sticker"><div class="serial">${esc(o.serialNumber||o.id)}</div><div>العميل: ${esc(o.clientName||'-')}</div><div>اسم الشغل: ${esc(o.workerName||'-')}</div><div>تاريخ الطلب: ${esc(String(o.date||o.executionDate||'').slice(0,10)||'-')}</div></section>`).join('');
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>استيكرات ${esc(folder.name)}</title><style>@page{size:${width}cm ${height}cm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Tahoma,Arial,sans-serif;color:black}.sticker{width:${width}cm;height:${height}cm;padding:1mm;display:flex;flex-direction:column;justify-content:space-around;break-after:page;page-break-after:always;overflow:hidden;font-size:7pt;font-weight:bold}.sticker:last-child{break-after:auto;page-break-after:auto}.serial{text-align:center;direction:ltr;font-size:9pt;border-bottom:1px solid black} .sticker div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style></head><body>${stickers}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  const safeItems = (o) => { let it = o.items || []; if (typeof it === 'string') { try { it = JSON.parse(it) } catch { it = [] } } return Array.isArray(it)? it : [] }
  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => { if(!file) return resolve(''); const r = new FileReader(); r.onload = () => resolve(r.result || ''); r.onerror = reject; r.readAsDataURL(file) })
  const downloadOrderFile = async (o) => {
    try {
      const token=showAdmin ? sessionStorage.getItem(TOKEN_KEY) : customerToken;
      if(!token) {setShowAdmin(false);setShowAdminLogin(true);throw new Error('جلسة المدير غير موجودة. سجل دخول المدير من جديد ثم حاول التحميل')}
      const response=await fetch(`${API}orders/${o.id}/file`,{headers:{Authorization:`Bearer ${token}`}});
      const data=await response.json().catch(()=>({}));
      if(response.status===401){sessionStorage.removeItem(TOKEN_KEY);setShowAdmin(false);setShowAdminLogin(true);throw new Error('جلسة الدخول انتهت. سجل دخول المدير مرة أخرى')}
      if(!response.ok||!data.url) throw new Error(data.error||'تعذر تحميل الملف');
      window.location.assign(data.url);
    }catch(e){alert('فشل تحميل الملف: '+e.message)}
  }
  const viewAdminPaymentProof = async (o) => {
    try {
      const token=sessionStorage.getItem(TOKEN_KEY);
      if(!token){setShowAdmin(false);setShowAdminLogin(true);throw new Error('سجل دخول المدير لعرض إيصال التحويل')}
      const response=await fetch(`${API}orders/${o.id}/payment-proof`,{headers:{Authorization:`Bearer ${token}`}});
      const data=await response.json().catch(()=>({}));
      if(response.status===401){sessionStorage.removeItem(TOKEN_KEY);setShowAdmin(false);setShowAdminLogin(true);throw new Error('جلسة المدير انتهت، سجل الدخول مرة أخرى')}
      if(!response.ok||!data.url)throw new Error(data.error||'تعذر عرض صورة التحويل');
      window.open(data.url,'_blank','noopener,noreferrer');
    }catch(error){alert('فشل عرض التحويل: '+error.message)}
  }
  const orderSearchText = (o) => `${o.clientName||''} ${o.clientPhone||''}`.toLowerCase()
  const visibleDashboardOrders = orders.filter(o => o.status !== 'تم التسليم' && o.status !== 'ملغي' && (!orderSearch.trim() || orderSearchText(o).includes(orderSearch.trim().toLowerCase())))
  const myOrdersList = orders.filter(o => { if (!loggedClient) return false; const cId = String(o.clientId || ''); const lId = String(loggedClient.id || ''); const cPhone = String(o.clientPhone || '').replace(/\D/g,''); const lPhone = String(loggedClient.phone || '').replace(/\D/g,''); return (cId && lId && cId === lId) || (cPhone && lPhone && cPhone === lPhone) }).sort((a,b)=> b.id - a.id)
  const getPaymentStatus = (total, paid) => { const p = Number(paid)||0; const t = Number(total)||0; if(p<=0) return 'غير مدفوع'; if(p>=t) return 'مدفوع بالكامل'; return 'مدفوع جزئي' }
  const statusColor = (s) => { if(s==='جديد') return '#2563eb'; if(s==='قيد التنفيذ') return '#3b82f6'; if(s==='قيد الطباعة') return '#1d4ed8'; if(s==='جاهز للتسليم') return '#64748b'; if(s==='تم التسليم') return '#475569'; if(s==='معلق') return '#d97706'; if(s==='ملغي') return '#94a3b8'; return '#64748b' }
  const updateOrder = async (id, updates) => {
    const token = sessionStorage.getItem(TOKEN_KEY)
    if (!token) throw new Error('يرجى تسجيل دخول المدير')
    const response = await fetch(`${API}orders/${id}`, {method:'PUT', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify(updates)})
    const result = await response.json().catch(()=>({}))
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
    setOrders(prev=>prev.map(o=>String(o.id)===String(id)?{...o,...result}:o))
    return result
  }
  const myUnread = notifications.filter(n=> { if(!loggedClient) return false; return (String(n.clientId)===String(loggedClient.id) || String(n.clientPhone).replace(/\D/g,'')===String(loggedClient.phone).replace(/\D/g,'')) &&!n.read })
  const handleRegister = async () => { if(!form.name ||!form.phone ||!form.company ||!form.address ||!form.pass){ alert('املأ كل البيانات'); return } if(!/^01[0-9]{9}$/.test(form.phone)){ alert('الموبايل لازم 11 رقم مصري صحيح'); return } if(form.pass.length<8){ alert('كلمة المرور لازم 8 أحرف على الأقل'); return } const exists = clients.find(c=> String(c.phone).replace(/\D/g,'') === String(form.phone).replace(/\D/g,'')); if(exists){ alert('الرقم ده متسجل قبل كده ❌ - '+exists.name); return } try { const response = await fetch(`${API}clients`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({...form, type:'B', balance:0})}); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`); alert('تم التسجيل بنجاح ✅'); setShowForm(false); setForm({ name: '', phone: '', company: '', address: '', pass: '' }); await loadAll(); } catch (error) { alert('فشل تسجيل العميل: ' + error.message); } }
  const handleLogin = async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) { alert('إعدادات الدخول غير متاحة'); return }
    const phone = String(login.phone || '').trim()
    if (!/^01[0-9]{9}$/.test(phone) || !login.pass) { alert('اكتب رقم الموبايل وكلمة المرور'); return }
    try {
      const email = 'eg20' + phone + '@customers.elmarwa.invalid'
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method:'POST', headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY},
        body:JSON.stringify({email,password:login.pass})
      })
      const auth = await response.json().catch(()=>({}))
      if (!response.ok || !auth.access_token) throw new Error('رقم الموبايل أو كلمة المرور غير صحيحة')
      const profileResponse = await fetch(`${API}clients&self=1`,{headers:{Authorization:`Bearer ${auth.access_token}`}})
      const profile = await profileResponse.json().catch(()=>({}))
      if (!profileResponse.ok) throw new Error(profile.error || 'تعذر تحميل حساب العميل')
      sessionStorage.setItem('elmarw_customer_token',auth.access_token)
      setCustomerToken(auth.access_token)
      setLoggedClient(profile)
      fetch(`${API}orders`,{headers:{Authorization:`Bearer ${auth.access_token}`}}).then(r=>r.ok?r.json():[]).then(setOrders).catch(console.error)
      setShowLogin(false)
      setLogin({phone:'',pass:''})
    } catch (error) { alert('تعذر الدخول: ' + error.message) }
  }
  const handleAdminLogin = async () => {
    const email = adminLogin.user.trim()
    const password = adminLogin.pass
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      alert('إعدادات Supabase العامة غير متاحة. راجع Vercel وأعد النشر.')
      return
    }
    if (!email || !password) { alert('اكتب الإيميل وكلمة المرور'); return }
    setAdminBusy(true)
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
        body: JSON.stringify({ email, password })
      })
      const auth = await response.json()
      if (!response.ok || !auth.access_token) throw new Error('الإيميل أو كلمة المرور غير صحيحة')
      // التحقق من صلاحية المدير عبر مورد محمي، وليس كتالوج المنتجات العام
      await apiRead('folders', auth.access_token)
      sessionStorage.setItem(TOKEN_KEY, auth.access_token)
      setLoggedEmployee({ name: 'المدير العام', permissions: {
        dashboard: true, employees: true, categories: true,
        products: true, clients: true, orders: true, shipping: true
      } })
      setShowAdmin(true)
      setShowAdminLogin(false)
      setAdminLogin({ user: '', pass: '' })
      await loadAll(auth.access_token)
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY)
      alert('تعذر دخول المدير: ' + error.message)
    } finally { setAdminBusy(false) }
  }
  const addToCart = (product, qty) => {
    if(!loggedClient){ setShowLogin(true); return }
    let pB = product.pricesB; let pV = product.pricesVIP;
    try{ if(typeof pB==='string') pB=JSON.parse(pB) }catch{}
    try{ if(typeof pV==='string') pV=JSON.parse(pV) }catch{}
    const price = loggedClient.type === 'VIP'? pV?.[qty] : pB?.[qty];
    if(price===undefined || price===null || price==='') return;
    setCart(prev => [...prev, { id: Date.now(), productId: product.id, subCategoryId: product.subCategoryId, name: product.name, image: product.image||'', qty: Number(qty), price: Number(price), total: Number(price) }]);
    setShowCart(true)
  }
  const handlePlaceOrder = async () => {
    if(cart.length === 0){ alert('اختر منتج أولاً'); return }
    if(!customerToken){ alert('يرجى تسجيل الدخول مرة أخرى'); setShowLogin(true); return }
    if(!orderFile){ alert('من فضلك ارفع ملف الطلب أولاً 📎'); return }
    if (!/\.(pdf|jpe?g|zip|rar|7z)$/i.test(orderFile.name)) { alert('الملفات المقبولة: PDF أو JPG أو JPEG أو ZIP أو RAR أو 7Z'); return }
    const total = cart.reduce((s,i)=>s+i.total,0);
    if(!Number.isFinite(Number(walletAmount))||Number(walletAmount)<0||Number(walletAmount)>Math.min(total,Number(loggedClient?.balance||0))) {alert('راجع مبلغ الدفع من الرصيد');return}
    if(orderFile.size > 3*1024*1024){ alert('الحد المؤقت لحجم الملف 3 ميجابايت'); return }
    try {
    const fileData = await readFileAsDataUrl(orderFile);
    const newOrder = {
      executionDate: new Date().toISOString().slice(0,10), readyDate: '',
      clientName: loggedClient.name, clientPhone: loggedClient.phone, clientId: loggedClient.id,
      workerName: orderClientName.trim(), items: cart, total, walletAmount:Number(walletAmount||0), paidAmount:0, paymentStatus:'غير مدفوع',
      paymentMethod: customerPaymentMethod, paymentProof:'', notes: orderNotes, status:'جديد',
      date: new Date().toLocaleString('ar-EG'), fileName: orderFile.name, fileData
    };
      const res = await fetch(`${API}orders`, {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${customerToken}`}, body: JSON.stringify(newOrder)});
      if(!res.ok) { const body = await res.json().catch(()=>({})); throw new Error(body.error || `HTTP ${res.status}`) }
      setCart([]); setOrderClientName(''); setOrderNotes(''); setOrderFile(null); setCustomerPaymentMethod('نقدي'); setWalletAmount('0'); setShowCart(false);
      const profileResponse=await fetch(`${API}clients&self=1`,{headers:{Authorization:`Bearer ${customerToken}`}});if(profileResponse.ok)setLoggedClient(await profileResponse.json());
      const myResponse = await fetch(`${API}orders`,{headers:{Authorization:`Bearer ${customerToken}`}})
      if(myResponse.ok) setOrders(await myResponse.json())
      setShowMyOrders(true);
      alert('تم إرسال الطلب بنجاح ✅');
    } catch(e){ console.error('Order submission failed:',e); alert('تعذر إرسال الطلب: ' + e.message); }
  }
  const getPriceForDisplay = (product, qty) => { let pB = product.pricesB; let pV = product.pricesVIP; try{ if(typeof pB==='string') pB=JSON.parse(pB) }catch{} try{ if(typeof pV==='string') pV=JSON.parse(pV) }catch{} const price = loggedClient? (loggedClient.type === 'VIP'? pV?.[qty] : pB?.[qty]) : pB?.[qty]; if(price===undefined || price===null || price==='') return null; const numericPrice=Number(price); if(!Number.isFinite(numericPrice) || numericPrice<=0) return null; return numericPrice }
  const handleEditProduct = (p) => { let b = p.pricesB || {}; let vip = p.pricesVIP || {}; try{ if(typeof b==='string') b=JSON.parse(b) }catch{} try{ if(typeof vip==='string') vip=JSON.parse(vip) }catch{} setProductForm({ name: p.name, categoryId: p.categoryId||'', subCategoryId: p.subCategoryId||'', image: p.image||'', specifications: p.specifications||'', id: p.id, pricesB: {...{1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''},...b}, pricesVIP: {...{1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''},...vip} }); setShowProductForm(true) }
  const folderRequest = async (path, method, body) => {
    const token=sessionStorage.getItem(TOKEN_KEY)
    if (!token) {setShowAdmin(false);setShowAdminLogin(true);throw new Error('جلسة المدير غير موجودة، سجل الدخول مجددًا')}
    const response=await fetch(`${API}folders${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body!==undefined?{body:JSON.stringify(body)}:{})})
    const result=await response.json().catch(()=>({}))
    if(response.status===401){sessionStorage.removeItem(TOKEN_KEY);setShowAdmin(false);setShowAdminLogin(true);throw new Error('جلسة المدير انتهت، سجل الدخول مجددًا')}
    if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`)
    await loadAll(token)
    return result
  }
  const handleCreateFolder = async () => {
    if(!newFolderName.trim()){alert('اكتب اسم الفولدر');return}
    try {await folderRequest('','POST',{name:newFolderName.trim()});setNewFolderName('')}
    catch(e){alert('فشل إنشاء الفولدر: '+e.message)}
  }
  const handleUpdateFolderStatus = async (folder,newStatus) => {
    try {await folderRequest('/'+folder.id,'PUT',{status:newStatus})}
    catch(e){alert('فشل تحديث الفولدر: '+e.message)}
  }
  const handleAddOrderToFolder = async (folderId,orderId) => {
    const f=folders.find(x=>String(x.id)===String(folderId))
    if(!f){alert('الفولدر غير موجود، حدث الصفحة وحاول مجددًا');return}
    try {await folderRequest('/'+f.id,'PUT',{orderIds:[...new Set([...(Array.isArray(f.orderIds)?f.orderIds:[]).map(String),String(orderId)])]});setOrdersStatusFilter('قيد التنفيذ')}
    catch(e){alert('فشل إضافة الأوردر للفولدر: '+e.message)}
  }
  const handleMoveOrderToFolder = async (fromFolderId,toFolderId,orderId) => {
    if(!toFolderId||String(toFolderId)===String(fromFolderId))return
    await handleAddOrderToFolder(toFolderId,orderId)
  }
  const handleRemoveOrderFromFolder = async (folderId,orderId) => {
    const f=folders.find(x=>String(x.id)===String(folderId))
    if(!f)return
    try {await folderRequest('/'+f.id,'PUT',{orderIds:(f.orderIds||[]).filter(id=>String(id)!==String(orderId))})}
    catch(e){alert('فشل إخراج الأوردر من الفولدر: '+e.message)}
  }
  const handleDeleteFolder = async (folder) => {
    if(!sessionStorage.getItem(TOKEN_KEY)){alert('يرجى تسجيل دخول المدير');return}
    if(!window.confirm(`حذف فولدر «${folder.name}»؟ الأوردرات نفسها لن تُحذف، لكنها ستصبح بدون فولدر.`))return
    try {await folderRequest('/'+folder.id,'DELETE');setShowDeleteConfirm(null);setDeletePass('');setSelectedFolderId(null);alert('تم حذف الفولدر فقط، والأوردرات محفوظة')}
    catch(e){alert('فشل حذف الفولدر: '+e.message)}
  }

  const ProductCard = ({ product }) => (
    <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
      {product.image? <img src={product.image} alt={product.name} style={{width: '100%', height: '190px', objectFit: 'cover'}} /> : <div style={{height:'190px', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center'}}>بدون صورة</div>}
      <div style={{padding: '15px'}}>
        <h3 style={{ color: '#1e3a8a', margin: '0 0 5px 0', fontSize:'16px', fontWeight:900 }}>{product.name}</h3>
        <div style={{background: '#f8fafc', borderRadius: '10px', padding: '10px', border:'1px solid #eef2f7'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '2px solid #1e3a8a', paddingBottom: '5px', fontSize: '12px'}}><span>الكمية</span><span>السعر</span><span></span></div>
          {quantities.map(q => { const price = getPriceForDisplay(product, q); if(price===null) return null; return (<div key={q} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #eee', fontSize: '13px'}}><span>{q}</span><span style={{color: '#16a34a', fontWeight: 'bold'}}>{price}ج</span><button onClick={() => addToCart(product, q)} style={{...btnStyle, background: '#1e3a8a', color: 'white', padding: '4px 14px', fontSize: '12px', margin: 0, borderRadius:'20px'}}>طلب</button></div>) })}
        </div>
      </div>
    </div>
  )

  const OrderAdminCard = ({ o, folderId=null }) => {
    const items = safeItems(o)
    const total = Number(o.total) || 0
    const [draftStatus, setDraftStatus] = useState(o.status || 'جديد')
    const [draftPaid, setDraftPaid] = useState('')
    const [draftMethod, setDraftMethod] = useState(o.paymentMethod || 'نقدي')
    const [draftHoldReason,setDraftHoldReason]=useState(o.holdReason||'')
    const [saving, setSaving] = useState(false)
    useEffect(() => { setDraftStatus(o.status || 'جديد'); setDraftPaid(''); setDraftMethod(o.paymentMethod || 'نقدي'); setDraftHoldReason(o.holdReason||'') }, [o.id, o.status, o.paidAmount, o.paymentMethod])
    const paid = Number(o.paidAmount) || 0
    const remaining = total - paid
    const payStatus = o.paymentStatus || getPaymentStatus(total, paid)
    const saveOrderChanges = async () => {
      const np = Number(draftPaid||0)
      if(!Number.isFinite(np)||np<0||np>remaining){alert('مبلغ الدفعة أكبر من المتبقي');return}
      if(draftStatus==='معلق'&&!draftHoldReason.trim()){alert('اكتب سبب تعليق الأوردر قبل الحفظ');return}
      setSaving(true)
      try {
        if(np>0){
          const token=sessionStorage.getItem(TOKEN_KEY);
          const response=await fetch(`${API}payments/${o.id}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({amount:np,method:draftMethod})});
          const result=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(result.error||'تعذر تسجيل الدفعة');
          setDraftPaid('');
          await loadAll(token);
        }
        if(draftStatus!==o.status||draftHoldReason.trim()!==(o.holdReason||'')){
          await updateOrder(o.id,{status:draftStatus,holdReason:draftStatus==='معلق'?draftHoldReason.trim():''});
        }
        alert('تم حفظ تعديلات الأوردر بالكامل ✅')
      } catch (error) {
        alert('فشل حفظ التعديلات: ' + error.message)
      } finally {
        setSaving(false)
      }
    }
    return (
      <div className="admin-order-card" id={`order-${o.id}`} style={{background:({'جديد':'#ffffff','قيد التنفيذ':'#dcfce7','قيد الطباعة':'#fee2e2','جاهز للتسليم':'#dbeafe'}[o.status]||'#ffffff'),borderRadius:'14px',marginBottom:'10px',border:'1px solid #dbe3ef',borderRight:`6px solid ${statusColor(o.status||'جديد')}`,overflow:'hidden',boxShadow:'0 3px 10px rgba(15,23,42,.06)'}}>
        <div style={{padding:'9px 11px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',background:({'جديد':'#ffffff','قيد التنفيذ':'#bbf7d0','قيد الطباعة':'#fecaca','جاهز للتسليم':'#bae6fd'}[o.status]||'#f8fafc'),borderBottom:'1px solid #e5e7eb'}}>
          <div style={{display:'flex',alignItems:'center',gap:'7px',flexWrap:'wrap'}}>
            <b style={{fontSize:'13px'}}>👤 العميل: {o.clientName}</b>
            <span style={{fontSize:'11px',color:'#64748b'}}>📞 {o.clientPhone}</span>
            {o.workerName && <span style={{background:'#e0e7ff',color:'#3730a3',padding:'3px 8px',borderRadius:'10px',fontSize:'10px',fontWeight:900}}>👷 الشغال: {o.workerName}</span>}
            <span style={{background:'#0f172a',color:'white',padding:'2px 7px',borderRadius:'10px',fontSize:'10px',fontWeight:900}}>🔢 {o.serialNumber||o.id}</span>
            <span style={{background:statusColor(o.status),color:'white',padding:'3px 9px',borderRadius:'10px',fontSize:'10px',fontWeight:900}}>{o.status||'جديد'}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}><span style={{fontSize:'11px',color:'#475569'}}>📅 {o.date}</span><b style={{fontSize:'13px',color:'#16a34a'}}>{total}ج</b><button onClick={()=>printSticker(o)} style={{...btnStyle,background:'#111827',color:'white',padding:'4px 8px',fontSize:'10px',margin:0}}>🖨️ استيكر</button></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(200px,1.7fr) repeat(3,minmax(110px,.7fr))',gap:'7px',padding:'8px 10px'}}>
          <div style={{background:'#f8fafc',border:'1px solid #eef2f7',borderRadius:'8px',padding:'7px'}}>
            <div style={{fontSize:'10px',color:'#64748b',marginBottom:'4px'}}>المنتجات</div>
            {items.slice(0,3).map((it,i)=>{const prod=products.find(p=>String(p.id)===String(it.productId)); const img=it.image||prod?.image; return <div key={i} style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px'}}><div style={{width:'34px',height:'34px',borderRadius:'6px',overflow:'hidden',background:'#e2e8f0',flexShrink:0}}>{img&&<img src={img} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}</div><div style={{minWidth:0,flex:1}}><div style={{fontWeight:800,fontSize:'11px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.name}</div><div style={{fontSize:'9px',color:'#64748b'}}>كمية {it.qty}</div></div><b style={{fontSize:'10px',color:'#1e3a8a'}}>{it.price}ج</b></div>})}
            {items.length>3&&<div style={{fontSize:'9px',color:'#64748b'}}>+ {items.length-3} منتجات أخرى</div>}
            {o.notes&&<div style={{fontSize:'9px',color:'#b45309',marginTop:'4px'}}>📝 {o.notes}</div>}
          </div>
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',padding:'7px'}}><div style={{fontSize:'10px',color:'#64748b'}}>💰 الدفع الحالي</div><div style={{fontWeight:900,color:'#16a34a',fontSize:'12px'}}>مدفوع {paid}ج</div><div style={{fontSize:'10px',color:remaining>0?'#ef4444':'#16a34a'}}>باقي {remaining}ج</div><div style={{fontSize:'9px',marginTop:'3px'}}>{o.paymentMethod||'نقدي'} • {payStatus}</div></div>
          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'7px'}}><div style={{fontSize:'10px',color:'#64748b'}}>📅 المواعيد</div><div style={{fontSize:'10px',fontWeight:800}}>تنفيذ: {o.executionDate||'-'}</div><div style={{fontSize:'10px',fontWeight:800}}>جاهز: {o.readyDate||'-'}</div></div>
          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'8px',padding:'7px'}}><div style={{fontSize:'10px',color:'#64748b'}}>📎 ملف العميل</div><div style={{fontSize:'9px',fontWeight:800,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{o.fileName||'بدون ملف'}</div><button onClick={()=>downloadOrderFile(o)} style={{...btnStyle,background:'#2563eb',color:'white',margin:'5px 0 0',padding:'5px 8px',fontSize:'10px',width:'100%'}}>⬇️ تحميل الملف</button>{o.paymentProof&&<button type="button" onClick={()=>viewAdminPaymentProof(o)} style={{...btnStyle,background:'#dcfce7',color:'#166534',border:'1px solid #86efac',margin:'6px 0 0',padding:'6px 8px',fontSize:'10px',width:'100%'}}>📸 عرض صورة التحويل</button>}</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr 1fr',gap:'7px',padding:'8px 10px',background:'#f8fafc',borderTop:'1px solid #eef2f7'}}>
          <div><label style={{fontSize:'9px',fontWeight:900}}>🔄 الحالة الجديدة</label><select value={draftStatus} onChange={e=>setDraftStatus(e.target.value)} style={{...inputStyle,margin:'3px 0 0',padding:'7px',fontSize:'11px',border:`2px solid ${statusColor(draftStatus)}`}}>{orderStatuses.map(st=><option key={st} value={st}>{st}</option>)}</select></div>
          <div><label style={{fontSize:'9px',fontWeight:900}}>💰 إضافة دفعة جديدة (المتبقي {remaining}ج)</label><input type="number" min="0" max={remaining} placeholder="مبلغ الدفعة" value={draftPaid} onChange={e=>setDraftPaid(e.target.value)} style={{...inputStyle,margin:'3px 0 0',padding:'7px',fontSize:'11px'}}/></div>
          <div><label style={{fontSize:'9px',fontWeight:900}}>💳 طريقة الدفع</label><select value={draftMethod} onChange={e=>setDraftMethod(e.target.value)} style={{...inputStyle,margin:'3px 0 0',padding:'7px',fontSize:'11px'}}>{paymentMethods.filter(m=>m!=='آجل').map(m=><option key={m} value={m}>{m}</option>)}</select></div>
        </div>
        {draftStatus==='معلق'&&<div style={{padding:'8px 10px',background:'#fffbeb',borderTop:'1px solid #fcd34d'}}><label style={{fontSize:12,fontWeight:800,color:'#92400e'}}>⚠️ سبب تعليق الأوردر (إلزامي)</label><textarea value={draftHoldReason} onChange={e=>setDraftHoldReason(e.target.value)} maxLength={1000} rows={2} placeholder="اكتب سبب التعليق هنا..." style={{...inputStyle,width:'100%',marginTop:5}}/></div>}
        {o.status==='معلق'&&o.holdReason&&<div style={{padding:'8px 10px',background:'#fef3c7',color:'#92400e',fontSize:12}}>⏸️ سبب التعليق: {o.holdReason}</div>}
        <div style={{display:'flex',gap:'8px',alignItems:'center',padding:'9px 10px',flexWrap:'wrap',direction:'rtl',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:'7px',flex:'1 1 230px',flexWrap:'wrap'}}>
            {(()=>{const found=folders.find(f=>(f.orderIds||[]).map(String).includes(String(o.id)));return <span style={{background:found?'#dbeafe':'#f1f5f9',color:found?'#1e40af':'#475569',padding:'7px 9px',borderRadius:8,fontSize:11,fontWeight:800}}>📁 مكان الأوردر: {found?found.name:'بدون فولدر'}</span>})()}
            <select defaultValue="" onChange={e=>{if(e.target.value)handleAddOrderToFolder(e.target.value,o.id);e.target.value=''}} style={{flex:'1 1 145px',minWidth:120,maxWidth:'100%',padding:'8px',borderRadius:7,border:'1px solid #cbd5e1',fontSize:11}}><option value="">نقل إلى فولدر...</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
          </div>
          <button onClick={saveOrderChanges} disabled={saving} style={{...btnStyle,background:'#16a34a',color:'white',margin:0,padding:'9px 16px',fontSize:11,fontWeight:900,marginRight:'auto'}}>{saving?'جاري الحفظ...':'💾 حفظ التعديلات'}</button>
        </div>
      </div>
    )
  }

  if(showAdmin){
const BotDraftCard=({d})=>{const [draftMethod,setDraftMethod]=useState(d.payment_method||'نقدي');useEffect(()=>setDraftMethod(d.payment_method||'نقدي'),[d.payment_method]);return <article className="admin-order-card" style={{background:'#fff',border:'1px solid #dbe3ef',borderRight:'6px solid #2563eb',borderRadius:14,marginBottom:10,overflow:'hidden',boxShadow:'0 3px 10px rgba(15,23,42,.06)'}}>
  <div style={{background:'#dbeafe',padding:'10px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap',borderBottom:'1px solid #bfdbfe'}}>
    <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
      <b style={{fontSize:13}}>👤 الشغل: {d.job_name}</b>
      <span style={{background:'#1d4ed8',color:'white',padding:'4px 9px',borderRadius:9,fontWeight:800,fontSize:11}}>🤖 طلب بوت شات</span>
      <span style={{background:'#fef3c7',color:'#92400e',padding:'4px 9px',borderRadius:9,fontWeight:800,fontSize:11}}>جديد • بانتظار المراجعة</span>
    </div>
    <b style={{color:'#166534'}}>{d.quoted_price} ج</b>
  </div>
  <div style={{padding:'10px 12px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,190px),1fr))',gap:9,fontSize:12}}>
    <div style={{padding:11,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:9}}><div style={{color:'#64748b',fontSize:11}}>📦 المنتج والكمية</div><b>{products.find(p=>String(p.id)===String(d.product_id))?.name||'منتج غير معروف'}</b><div>{d.quantity} نسخة</div><div style={{color:'#64748b',fontSize:10,marginTop:6}}>رقم المسودة: <span dir="ltr" style={{overflowWrap:'anywhere'}}>{d.id}</span></div></div>
    <div style={{padding:11,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:9}}><div style={{color:'#64748b',fontSize:11}}>💰 الدفع الحالي</div><b style={{color:'#15803d'}}>0 ج مؤكد</b><div>المبلغ المطلوب: {d.quoted_price} ج</div><div>{d.payment_method||'لم تُحدد طريقة الدفع'} • بانتظار التحقق</div></div>
    <div style={{padding:11,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:9}}><div style={{color:'#64748b',fontSize:11}}>📅 المواعيد</div><div>تاريخ الإرسال: {new Date(d.created_at).toLocaleDateString('ar-EG')}</div><div>موعد التسليم: يحدد بعد الاعتماد</div></div>
    <div style={{padding:11,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:9}}><div style={{color:'#64748b',fontSize:11}}>📎 ملفات العميل</div><div style={{overflowWrap:'anywhere'}}>{d.pdf_filename||'ملف تصميم'}</div><button style={{...btnStyle,width:'100%',background:'#2563eb',color:'white',margin:'7px 0 0'}} onClick={()=>openWebsiteDraftFile(d.id,'artwork')}>⬇️ فتح التصميم</button>{d.payment_receipt_filename&&<button style={{...btnStyle,width:'100%',background:'#dcfce7',color:'#166534',margin:'6px 0 0'}} onClick={()=>openWebsiteDraftFile(d.id,'receipt')}>🧾 عرض إيصال التحويل</button>}</div>
  </div>
  <div style={{padding:'10px 12px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:9,background:'#f8fafc',borderTop:'1px solid #e2e8f0'}}>
    <div><label style={{fontSize:12,fontWeight:800}}>🔄 الحالة الجديدة</label><select value="pending" disabled style={{...inputStyle,margin:'5px 0 0',width:'100%',background:'#f1f5f9'}}><option value="pending">جديد — بانتظار اعتماد الموظف</option></select><small style={{color:'#64748b'}}>بعد الاعتماد يظهر الأوردر بنفس أدوات الأوردر العادي.</small></div>
    <div><label style={{fontSize:12,fontWeight:800}}>💰 إضافة دفعة جديدة (المتبقي {d.quoted_price} ج)</label><input disabled placeholder="يُفعّل بعد الاعتماد والتحقق من التحويل" style={{...inputStyle,margin:'5px 0 0',width:'100%',background:'#f1f5f9'}}/><small style={{color:'#64748b'}}>صورة التحويل لا تعني تسجيل مبلغ مدفوع.</small></div>
    <div><label style={{fontSize:12,fontWeight:800}}>💳 طريقة الدفع</label><select value={draftMethod} onChange={e=>setDraftMethod(e.target.value)} style={{...inputStyle,margin:'5px 0 0',width:'100%'}}>{['نقدي','فودافون كاش','انستا باي','تحويل بنكي'].map(m=><option key={m} value={m}>{m}</option>)}</select><button style={{...btnStyle,background:'#2563eb',color:'white',margin:'7px 0 0',width:'100%'}} onClick={()=>saveWebsiteDraftMethod(d.id,draftMethod)}>💾 حفظ طريقة الدفع</button></div>
  </div>
  <div style={{padding:'9px 12px',display:'flex',alignItems:'center',gap:8,background:'#f8fafc',borderTop:'1px solid #e2e8f0',flexWrap:'wrap'}}><span style={{fontSize:12,fontWeight:700,color:'#475569'}}>📁 مكان الأوردر: بدون فولدر</span><select disabled value="" style={{...inputStyle,maxWidth:210,margin:0,background:'#f1f5f9'}}><option value="">نقل إلى فولدر بعد الاعتماد</option></select></div>
  <div style={{padding:'10px 12px',borderTop:'1px solid #e2e8f0',background:'#f8fafc',display:'flex',gap:9,alignItems:'center',flexWrap:'wrap'}}>
    <span style={{fontSize:12,color:'#475569'}}>🔄 الحالة: جديد — مسودة غير معتمدة</span>
    <button style={{...btnStyle,background:'#16a34a',color:'white',margin:'0 0 0 auto',fontWeight:800}} onClick={()=>approveWebsiteDraft(d.id)}>✅ اعتماد الأوردر</button>
  </div>
</article>}
    const filteredClients = clients.filter(c=>!clientSearch || c.name.includes(clientSearch) || c.phone.includes(clientSearch))
    const operationOrders = orders.filter(o=>!folders.some(f=> (f.orderIds||[]).map(String).includes(String(o.id))) && ['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم'].includes(o.status))
    const selectedFolder = folders.find(f=>String(f.id)===String(selectedFolderId))
    const orderBelongsToSub = (o, subId) => safeItems(o).some(it=>Number(it.subCategoryId)===Number(subId))
    const orderSubGroups = subCategories.map(sub=>({sub, list: orders.filter(o=>orderBelongsToSub(o, sub.id)).filter(o=>ordersStatusFilter==='الكل'||o.status===ordersStatusFilter)})).filter(g=>g.list.length>0)
    const uncategorizedOrders = orders.filter(o=>{ const its=safeItems(o); return its.length===0 || its.every(it=>!it.subCategoryId) }).filter(o=>ordersStatusFilter==='الكل'||o.status===ordersStatusFilter)
    return (
      <>

      {showStickerSettings && <div style={{position:'fixed',inset:0,background:'#0009',zIndex:450,display:'flex',alignItems:'center',justifyContent:'center',padding:12}}>
        <div style={{background:'white',borderRadius:14,padding:20,width:'100%',maxWidth:360,direction:'rtl'}}>
          <h3 style={{marginTop:0}}>⚙️ إعدادات طباعة الاستيكر</h3>
          <p style={{fontSize:12,color:'#475569'}}>المقاس بالسنتيمتر. الافتراضي 4 × 2 سم.</p>
          <label>العرض (سم)<input type="number" min="2" max="15" step=".1" value={stickerSize.width} onChange={e=>setStickerSize(v=>({...v,width:e.target.value}))} style={inputStyle}/></label>
          <label>الارتفاع (سم)<input type="number" min="1" max="10" step=".1" value={stickerSize.height} onChange={e=>setStickerSize(v=>({...v,height:e.target.value}))} style={inputStyle}/></label>
          <p style={{fontSize:12}}>البيانات: السيريال – اسم العميل – اسم الشغل – تاريخ الطلب</p>
          <button onClick={()=>{const w=Number(stickerSize.width),h=Number(stickerSize.height);if(w<2||w>15||h<1||h>10||!Number.isFinite(w)||!Number.isFinite(h)){alert('العرض من 2 إلى 15 سم والارتفاع من 1 إلى 10 سم');return}localStorage.setItem('elmarw_sticker_size',JSON.stringify({width:w,height:h}));setShowStickerSettings(false)}} style={{...btnStyle,background:'#16a34a',color:'white'}}>حفظ الإعدادات</button>
          <button onClick={()=>setShowStickerSettings(false)} style={btnStyle}>إغلاق</button>
        </div>
      </div>}
      <style>{`
        @media (max-width: 700px) {
          .customer-orders-modal { width:100vw !important; max-width:100vw !important; overflow-x:hidden !important; }
          .customer-orders-modal .customer-order-layout { display:block !important; }
          .customer-orders-modal .customer-order-layout > * { width:100% !important; min-width:0 !important; }
          .customer-orders-modal table { width:100% !important; table-layout:fixed; }
          .customer-orders-modal td { overflow-wrap:anywhere; word-break:break-word; }
        }
        .admin-shell, .admin-shell * { box-sizing:border-box; }
        .admin-main { min-width:0; max-width:100%; }
        .admin-order-card { min-width:0; max-width:100%; }
        .admin-order-card > div { min-width:0; }
        .admin-order-card input, .admin-order-card select { max-width:100%; min-width:0; }
        @media (max-width: 700px) {
          .admin-shell { width:100%; max-width:100vw; overflow-x:hidden; }
          .admin-main { width:100% !important; min-width:0 !important; overflow-x:hidden; }
          .admin-order-card { width:100%; overflow:hidden; }
          .admin-order-card > div[style*="grid"] { grid-template-columns:minmax(0,1fr) !important; }
          .admin-order-card > div[style*="flex"] { flex-wrap:wrap !important; }
          .admin-order-card > div[style*="flex"] > * { max-width:100%; }
          .admin-order-card button, .admin-order-card select { white-space:normal; }
          .admin-order-card select { min-width:0 !important; width:100%; }
        }
        @media (max-width: 900px) {
          .admin-shell { flex-direction: column !important; }
          .admin-mobile-toggle { display:block !important; }
          .admin-sidebar { width: 100% !important; height: auto !important; position: relative !important; max-height:none !important; }
          .admin-sidebar.menu-collapsed .admin-menu { display:none !important; }
          .admin-sidebar.menu-collapsed .admin-exit { display:none !important; }
          .admin-main { padding: 10px !important; }
          .admin-menu { display:grid !important; grid-template-columns:repeat(2,1fr) !important; gap:4px !important; }
          .order-controls { grid-template-columns:1fr !important; }
        }
        @media (max-width: 650px) {
          .order-summary { grid-template-columns:1fr 1fr !important; }
        }
      `}</style>
      <style>{`@media (min-width: 901px){.admin-mobile-toggle{display:none!important}} @media (max-width: 900px){.admin-mobile-toggle{display:inline-flex!important;align-items:center;justify-content:center;min-width:92px}.admin-sidebar.menu-collapsed .admin-menu,.admin-sidebar.menu-collapsed .admin-exit{display:none!important}.admin-sidebar:not(.menu-collapsed) .admin-menu{display:grid!important}}`}</style>
      <div className="admin-shell" style={{ display: 'flex', minHeight: '100vh', direction: 'rtl', fontFamily: 'Tahoma', background: '#f1f5f9' }}>
        <div className={`admin-sidebar ${adminMenuOpen?'':'menu-collapsed'}`} style={{ width: '260px', background: '#0f172a', color: 'white', padding: '20px 10px', position:'sticky', top:0, height:'100vh', overflowY:'auto', boxSizing:'border-box' }}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><h3 style={{textAlign:'center',margin:'8px 0'}}>المروة ✅ - {loggedEmployee?.name}</h3><button type="button" className="admin-mobile-toggle" onClick={()=>setAdminMenuOpen(v=>!v)} style={{...btnStyle,background:'#1d4ed8',color:'white',padding:'8px 12px',margin:0}}>☰ {adminMenuOpen?'إغلاق':'القائمة'}</button></div>
          {(() => { let perms = loggedEmployee?.permissions; try{ if(typeof perms==='string') perms=JSON.parse(perms) }catch{}; const isAdmin = loggedEmployee?.name === 'المدير العام'; const can = (k) => isAdmin ||!!perms?.[k]; return (<div className="admin-menu" onClick={e=>{if(e.target.closest('button'))setAdminMenuOpen(false)}}>{can('dashboard') && <button onClick={()=> setAdminTab('dashboard')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='dashboard'?'#1e40af':'transparent', color:'white'}}>📊 تحكم</button>}{can('orders') && <button onClick={()=>{setAdminTab('orders');loadWebsiteDrafts()}} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='orders'?'#1e40af':'transparent', color:'white'}}>📦 اوردرات ({orders.length+websiteDrafts.filter(d=>d.status==='pending_review'||d.status==='in_review').length})</button>}{can('orders') && <button onClick={()=>{setAdminTab('whatsappReview');loadWhatsappDrafts()}} style={{width:'100%',textAlign:'right',padding:'12px',margin:'4px 0',borderRadius:'8px',border:'none',cursor:'pointer',background:adminTab==='whatsappReview'?'#1e40af':'transparent',color:'white'}}>💬 مراجعة واتساب</button>}{can('orders') && <button onClick={()=>{setAdminTab('websiteReview');loadWebsiteDrafts()}} style={{width:'100%',textAlign:'right',padding:12,margin:'4px 0',borderRadius:8,border:'none',cursor:'pointer',background:adminTab==='websiteReview'?'#1e40af':'transparent',color:'white'}}>🤖 مراجعة بوت الموقع</button>}{can('shipping') && <button onClick={()=> setAdminTab('operation')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='operation'?'#16a34a':'transparent', color:'white', fontWeight:'bold'}}>⚙️ التشغيل ({folders.length} فولدر)</button>}{can('orders') && <><button onClick={()=>{setAdminTab('accounts');setAccountsSection('manager')}} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='accounts'?'#0ea5e9':'transparent', color:'white', fontWeight:'bold'}}>💰 الحسابات</button></>}{can('clients') && <button onClick={()=> setAdminTab('clients')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='clients'?'#1e40af':'transparent', color:'white'}}>👥 عملاء ({clients.length})</button>}{can('categories') && <button onClick={()=> setAdminTab('categories')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='categories'?'#1e40af':'transparent', color:'white'}}>📁 تصنيفات</button>}{can('products') && <button onClick={()=> setAdminTab('products')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='products'?'#1e40af':'transparent', color:'white'}}>🏷️ منتجات ({products.length})</button>}{isAdmin && <><button onClick={()=>setAdminTab('siteDesign')} style={{width:'100%',textAlign:'right',padding:12,margin:'4px 0',border:0,borderRadius:8,color:'white',background:adminTab==='siteDesign'?'#1e40af':'transparent'}}>🎨 إعدادات الموقع الخارجي</button><button onClick={()=>{setAdminTab('orders');setShowStickerSettings(true)}} style={{width:'100%',textAlign:'right',padding:12,margin:'4px 0',border:0,borderRadius:8,color:'white',background:'transparent'}}>🏷️ إعدادات الاستيكر</button></>}{can('employees') && <button onClick={()=> setAdminTab('employees')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='employees'?'#f59e0b':'#334155', color:'white', fontWeight:'bold'}}>👷 موظفين ({employees.length})</button>}</div>)})()}
          <button className="admin-exit" onClick={() => {sessionStorage.removeItem(TOKEN_KEY); setShowAdmin(false); setLoggedEmployee(null); setClients([]); setOrders([]); setEmployees([]); setFolders([])}} style={{...btnStyle, background: '#ef4444', color: 'white', width:'100%', marginTop:'20px'}}>🚪 خروج للرئيسية</button>
        </div>
        <div className="admin-main" style={{ flex: 1, padding: '15px', minWidth:0 }}>
          {adminTab==='siteDesign' && <div style={{background:'white',borderRadius:14,padding:18,maxWidth:850}}><h2>🎨 إعدادات الموقع الخارجي</h2><p>تعديل الألوان والبنر والشعار بدون كود. الحفظ الحالي على نفس المتصفح فقط لحين ربط إعدادات الموقع بقاعدة البيانات.</p><label>اسم الموقع<input style={inputStyle} value={siteDesign.title} onChange={e=>setSiteDesign(v=>({...v,title:e.target.value}))}/></label><label>وصف البنر<input style={inputStyle} value={siteDesign.tagline} onChange={e=>setSiteDesign(v=>({...v,tagline:e.target.value}))}/></label><div style={{display:'flex',gap:18,flexWrap:'wrap'}}><label>لون الموقع <input type="color" value={siteDesign.primary} onChange={e=>setSiteDesign(v=>({...v,primary:e.target.value}))}/></label><label>لون التمييز <input type="color" value={siteDesign.accent} onChange={e=>setSiteDesign(v=>({...v,accent:e.target.value}))}/></label></div><label>صورة البنر<input type="file" accept="image/*" onChange={e=>readSiteImage(e.target.files?.[0],'banner')} style={inputStyle}/></label><label>الشعار<input type="file" accept="image/*" onChange={e=>readSiteImage(e.target.files?.[0],'logo')} style={inputStyle}/></label><label>رابط صورة البنر (بديل الرفع)<input style={inputStyle} placeholder="https://..." onChange={e=>setSiteDesign(v=>({...v,banner:e.target.value}))}/></label><div style={{background:siteDesign.primary,color:'white',padding:20,borderRadius:12,margin:'16px 0'}}>{siteDesign.logo&&<img src={siteDesign.logo} alt="الشعار" style={{maxHeight:65,maxWidth:160,objectFit:'contain'}}/>}<h2>{siteDesign.title}</h2><p>{siteDesign.tagline}</p>{siteDesign.banner&&<img src={siteDesign.banner} alt="معاينة البنر" style={{width:'100%',maxHeight:240,objectFit:'cover',borderRadius:8}}/>}<span style={{color:siteDesign.accent}}>معاينة مباشرة</span></div><button onClick={saveSiteDesign} style={{...btnStyle,background:'#15803d',color:'white'}}>حفظ التصميم</button><button onClick={()=>setSiteDesign({title:'المروة للطباعة',primary:'#1e3a8a',accent:'#f59e0b',banner:'',logo:'',tagline:'طباعة احترافية بجودة عالية'})} style={btnStyle}>استعادة الافتراضي</button></div>}
          {adminTab==='dashboard' && <div><div style={{display:'flex', justifyContent:'space-between'}}><h2>لوحة التحكم</h2><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white'}}>🌐 الرئيسية</button></div><div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'15px', marginTop:'15px'}}><div style={{background:'white', padding:'20px', borderRadius:'12px'}}>👥 عملاء: {clients.length}</div><div style={{background:'white', padding:'20px', borderRadius:'12px'}}>📦 اوردرات: {orders.length}</div><div style={{background:'white', padding:'20px', borderRadius:'12px'}}>⚙️ فولدرات: {folders.length}</div><div style={{background:'white', padding:'20px', borderRadius:'12px'}}>🏷️ منتجات: {products.length}</div></div><div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'12px', marginTop:'15px'}}>{orderStatuses.map(s=> <div key={s} style={{background:'white', padding:'12px', borderRadius:'10px', borderRight:`5px solid ${statusColor(s)}`}}>{s}: {orders.filter(o=> o.status===s).length}</div>)}</div></div>}

          {adminTab==='orders' && <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px',flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 4px'}}>📦 الأوردرات</h2><div style={{fontSize:'12px',color:'#64748b'}}>بحث بالاسم أو رقم التليفون • الطلبات غير المسلّمة فقط</div></div><button onClick={()=>setShowAdmin(false)} style={{...btnStyle,background:'#0f172a',color:'white'}}>🌐 الرئيسية</button></div>
            <div style={{background:'white',padding:'10px',borderRadius:'12px',marginTop:'10px',display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
              <input value={orderSearch} onChange={e=>setOrderSearch(e.target.value)} placeholder="🔍 اسم العميل أو رقم التليفون" style={{...inputStyle,margin:0,flex:1,minWidth:'240px'}}/>
              <button onClick={()=>setOrderSearch('')} style={{...btnStyle,margin:0,background:'#e2e8f0',color:'#334155'}}>مسح البحث</button>
              <span style={{background:'#dbeafe',color:'#1e40af',padding:'8px 12px',borderRadius:'18px',fontWeight:900,fontSize:'12px'}}>{visibleDashboardOrders.length+((ordersStatusFilter==='جديد'||ordersStatusFilter==='الكل')?websiteDrafts.filter(d=>d.status==='pending_review'||d.status==='in_review').length:0)} طلب</span>
            </div>
            <div style={{background:'white',padding:'9px',borderRadius:'12px',marginTop:'8px',display:'flex',gap:'6px',flexWrap:'wrap'}}>{orderStatuses.filter(s=>s!=='تم التسليم'&&s!=='ملغي').map(s=><button key={s} onClick={()=>setOrdersStatusFilter(s)} style={{...btnStyle,margin:0,padding:'7px 11px',fontSize:'11px',background:ordersStatusFilter===s?statusColor(s):'#e2e8f0',color:ordersStatusFilter===s?'white':'#334155'}}>{s}</button>)}</div>
{adminTab==='orders' && (ordersStatusFilter==='جديد'||ordersStatusFilter==='الكل') && <div style={{margin:'12px 0',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
  <span style={{fontSize:13,fontWeight:800,color:'#1e40af'}}>🤖 طلبات بوت الموقع بانتظار المراجعة: {websiteDrafts.filter(d=>d.status==='pending_review'||d.status==='in_review').length}</span>
  <button style={{...btnStyle,margin:0,padding:'7px 12px'}} disabled={websiteDraftLoading} onClick={loadWebsiteDrafts}>{websiteDraftLoading?'جاري التحميل...':'🔄 تحديث طلبات البوت'}</button>
  {websiteDraftError&&<span role="alert" style={{color:'#b91c1c'}}>{websiteDraftError}</span>}
</div>}
                      <div style={{marginTop:'12px'}}>
              {(()=>{
                const pendingBotDrafts=(ordersStatusFilter==='جديد'||ordersStatusFilter==='الكل')?websiteDrafts.filter(d=>(d.status==='pending_review'||d.status==='in_review')&&(!orderSearch||[d.job_name,d.id].join(' ').toLowerCase().includes(orderSearch.toLowerCase()))):[]
                const filtered = visibleDashboardOrders.filter(o=>ordersStatusFilter==='الكل'||o.status===ordersStatusFilter)
                const productGroups = products.map(p=>({product:p,list:filtered.filter(o=>safeItems(o).some(it=>String(it.productId)===String(p.id))),drafts:pendingBotDrafts.filter(d=>String(d.product_id)===String(p.id))})).filter(g=>g.list.length||g.drafts.length)
                const usedIds = new Set(productGroups.flatMap(g=>g.list.map(o=>o.id)))
                const others = filtered.filter(o=>!usedIds.has(o.id))
                return <>{productGroups.map(({product,list,drafts})=><section key={product.id} style={{marginBottom:'18px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#dbeafe',borderRight:'6px solid #2563eb',padding:'10px 13px',borderRadius:'10px 10px 0 0'}}><b style={{fontSize:'16px',color:'#1e3a8a'}}>🏷️ {product.name}</b><span style={{background:'#2563eb',color:'white',padding:'4px 10px',borderRadius:'15px',fontSize:'11px'}}>{list.length+drafts.length} أوردر</span></div><div style={{padding:'8px',background:'#f8fafc',border:'1px solid #dbeafe',borderTop:0,borderRadius:'0 0 10px 10px'}}>{drafts.map(d=><BotDraftCard key={d.id} d={d}/>)}{list.sort((a,b)=>b.id-a.id).map(o=><OrderAdminCard key={`${product.id}-${o.id}`} o={o}/>)}</div></section>)}
                {pendingBotDrafts.filter(d=>!products.some(p=>String(p.id)===String(d.product_id))).map(d=><BotDraftCard key={d.id} d={d}/>)}
                {others.length>0&&<section><div style={{background:'#e5e7eb',borderRight:'6px solid #64748b',padding:'10px 13px',borderRadius:'10px 10px 0 0'}}><b>📦 أوردرات بدون منتج معروف</b><span style={{marginRight:'10px',fontSize:'11px'}}>({others.length})</span></div><div style={{padding:'8px',background:'#f8fafc'}}>{others.sort((a,b)=>b.id-a.id).map(o=><OrderAdminCard key={o.id} o={o}/>)}</div></section>}
                {!filtered.length&&<div style={{background:'white',padding:'40px',textAlign:'center',borderRadius:'12px'}}>لا يوجد أوردرات رسمية مطابقة للبحث أو الفلتر</div>}
              </>})()}
            </div>
          </div>}
          {adminTab==='operation' && <div>
            {!selectedFolder ? <><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px'}}><h2>⚙️ قسم التشغيل - الفولدرات</h2><button onClick={()=>setShowAdmin(false)} style={{...btnStyle,background:'#0f172a',color:'white'}}>🌐 الرئيسية</button></div>
              <div style={{background:'white',padding:'12px',borderRadius:'12px',marginTop:'10px',display:'flex',gap:'8px'}}><input placeholder="اسم الفولدر الجديد" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} style={{...inputStyle,margin:0,flex:1}}/><button onClick={handleCreateFolder} style={{...btnStyle,background:'#16a34a',color:'white',margin:0}}>+ إنشاء فولدر</button></div>
              <div style={{marginTop:'14px'}}>
                {folderStatuses.map(stage=><section key={stage} style={{marginBottom:'18px'}}><h3 style={{fontSize:'15px',padding:'10px 12px',background:'#e2e8f0',borderRadius:'10px',margin:'0 0 10px'}}>📂 {stage} ({folders.filter(f=>f.status===stage).length})</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:'12px'}}>{folders.filter(f=>f.status===stage).map(folder=>{ const count=orders.filter(o=>(folder.orderIds||[]).map(String).includes(String(o.id))).length; return <div key={folder.id} onClick={()=>setSelectedFolderId(folder.id)} style={{background:'white',padding:'16px',borderRadius:'14px',borderRight:`7px solid ${statusColor(folder.status)}`,boxShadow:'0 3px 10px rgba(15,23,42,.06)',cursor:'pointer'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{fontSize:'17px'}}>📁 {folder.name}</b><span style={{background:'#dbeafe',color:'#1e40af',padding:'4px 8px',borderRadius:'12px',fontSize:'11px'}}>{count} اوردر</span></div>
                  <div style={{fontSize:'11px',color:'#64748b',marginTop:'8px'}}>📅 {folder.date}</div>
                  <div onClick={e=>e.stopPropagation()} style={{marginTop:10}}>
                    <label style={{fontSize:12,fontWeight:800,color:'#334155'}}>🔄 حالة الفولدر وكل أوردراته</label>
                    <select value={folder.status} onChange={e=>handleUpdateFolderStatus(folder,e.target.value)} style={{...inputStyle,width:'100%',marginTop:5,border:'2px solid '+statusColor(folder.status)}}>{folderStatuses.map(st=><option key={st} value={st}>{st}</option>)}</select>
                  </div>
                  <button type="button" onClick={e=>{e.stopPropagation();printFolderStickers(folder)}} style={{...btnStyle,background:'#1d4ed8',color:'white',fontSize:11,width:'100%',margin:'8px 0 0'}}>🖨️ طباعة كل الاستيكرات ({count})</button>
                  <div style={{display:'flex',gap:'5px',marginTop:'10px'}}><button onClick={e=>{e.stopPropagation();setEditFolderId(folder.id);setEditFolderName(folder.name)}} style={{...btnStyle,background:'#f59e0b',color:'white',fontSize:'10px',margin:0}}>✏️ تعديل</button><button onClick={e=>{e.stopPropagation();handleDeleteFolder(folder)}} style={{...btnStyle,background:'#ef4444',color:'white',fontSize:'10px',margin:0}}>🗑️ مسح</button></div>
                  {editFolderId===folder.id && <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:'5px',marginTop:'8px'}}><input value={editFolderName} onChange={e=>setEditFolderName(e.target.value)} style={{...inputStyle,margin:0,padding:'6px'}}/><button onClick={async()=>{try{await folderRequest('/'+folder.id,'PUT',{name:editFolderName});setEditFolderId(null)}catch(e){alert('فشل تعديل اسم الفولدر: '+e.message)}}} style={{...btnStyle,background:'#16a34a',color:'white',margin:0}}>حفظ</button></div>}
                </div>})}</div></section>)}
              </div>
              {folders.length===0 && <div style={{background:'white',padding:'30px',textAlign:'center',borderRadius:'12px',marginTop:'15px'}}>لا يوجد فولدرات - أنشئ أول فولدر</div>}
              {operationOrders.length>0 && <div style={{background:'white',padding:'14px',borderRadius:'12px',marginTop:'18px'}}><h3>📦 اوردرات بدون فولدر ({operationOrders.length})</h3>{operationOrders.map(o=><div key={o.id} style={{display:'flex',justifyContent:'space-between',gap:'8px',padding:'8px',borderBottom:'1px solid #eee',fontSize:'12px'}}><span>#{o.serialNumber||o.id} - {o.clientName} - {o.total}ج</span><select onChange={e=>{if(e.target.value)handleAddOrderToFolder(e.target.value,o.id)}}><option value="">+ أضف لفولدر</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>)}</div>}
            </> : <div>
              {(()=>{ const folder=selectedFolder; const folderOrders=folder?orders.filter(o=>(folder.orderIds||[]).map(String).includes(String(o.id))).sort((a,b)=>b.id-a.id):[]; return <><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px'}}><div><button onClick={()=>setSelectedFolderId(null)} style={{...btnStyle,background:'#64748b',color:'white'}}>⬅️ رجوع للفولدرات</button><h2 style={{display:'inline-block',marginRight:'10px'}}>📁 {folder?.name}</h2></div>{folder && <button type="button" onClick={()=>printFolderStickers(folder)} style={{...btnStyle,background:'#1d4ed8',color:'white',margin:0}}>🖨️ طباعة كل الاستيكرات ({folderOrders.length})</button>}{folder && <select value={folder.status} onChange={e=>handleUpdateFolderStatus(folder,e.target.value)} style={{padding:'9px',borderRadius:'8px',border:`2px solid ${statusColor(folder.status)}`,fontWeight:'bold'}}>{folderStatuses.map(s=><option key={s} value={s}>{s}</option>)}</select>}</div>
                {folderOrders.length===0 ? <div style={{background:'white',padding:'40px',textAlign:'center',borderRadius:'12px'}}>الفولدر فارغ</div> : <div style={{marginTop:'12px'}}>{folderOrders.map(o=><div key={o.id}><div style={{background:'#eef2ff',padding:'6px 9px',borderRadius:'8px 8px 0 0',fontSize:'10px',fontWeight:900}}>نقل الأوردر لفولدر آخر: <select onChange={e=>{if(e.target.value)handleMoveOrderToFolder(folder.id,e.target.value,o.id)}} defaultValue="" style={{marginRight:'6px',padding:'4px',borderRadius:'6px'}}><option value="">اختر الفولدر</option>{folders.filter(f=>String(f.id)!==String(folder.id)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><OrderAdminCard o={o} folderId={folder.id}/></div>)}</div>}
              </>})()}
            </div>}
          </div>}

          {adminTab==='whatsappReview' && <section dir="rtl" style={{padding:16,background:'white',borderRadius:12,marginBottom:16}}><h2>💬 مراجعة طلبات واتساب</h2><p>مسودات العملاء للمراجعة — لا يتم إصدار سيريال قبل اعتماد الطلب.</p><button style={btnStyle} onClick={loadWhatsappDrafts} disabled={whatsappDraftLoading}>{whatsappDraftLoading?'جاري التحميل...':'تحديث المسودات'}</button>{whatsappDraftError&&<p style={{color:'#b91c1c'}}>{whatsappDraftError}</p>}<div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'right',borderCollapse:'collapse'}}><thead><tr>{['العميل','اسم الشغل','الحالة','المرحلة','ملف PDF','تاريخ الإنشاء','التواصل'].map(h=><th key={h} style={{padding:10,borderBottom:'1px solid #ddd'}}>{h}</th>)}</tr></thead><tbody>{whatsappDrafts.map(d=><tr key={d.id}><td style={{padding:10}}>{d.wa_id}</td><td>{d.job_name||'—'}</td><td>{d.status}</td><td>{d.step}</td><td>{d.pdf_filename||'لم يُرفق'}</td><td>{new Date(d.created_at).toLocaleString('ar-EG')}</td><td><a href={'https://wa.me/'+encodeURIComponent(d.wa_id)} target="_blank" rel="noreferrer">فتح واتساب</a> <button onClick={()=>lockWhatsappDraft(d.id)} disabled={!['pending_review','in_review','returned'].includes(d.status)}>بدء المراجعة</button></td></tr>)}</tbody></table>{!whatsappDrafts.length&&!whatsappDraftLoading&&!whatsappDraftError&&<p>لا توجد مسودات مسجلة حاليًا.</p>}</div></section>}
          {adminTab==='accounts' && <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>{[['manager','📊 حسابات المدير'],['clients','👥 حسابات العملاء'],['orders','📦 حسابات الأوردرات'],['delivery','🚚 حسابات التسليمات']].map(([key,label])=><button key={key} onClick={()=>{setAccountsSection(key)}} style={{...btnStyle,background:accountsSection===key?'#1d4ed8':'white',color:accountsSection===key?'white':'#0f172a',flex:'1 1 140px',margin:0}}>{label}</button>)}</div>}
          {adminTab==='accounts' && accountsSection==='clients' && <div style={{background:'white',padding:14,borderRadius:12}}><h3>👥 حسابات العملاء</h3>{clients.map(c=>{const co=orders.filter(o=>String(o.clientId)===String(c.id));const due=co.reduce((n,o)=>n+Math.max(0,Number(o.total||0)-Number(o.paidAmount||0)),0);return <div key={c.id} style={{padding:12,borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><strong>{c.name}</strong><span>الرصيد: {Number(c.balance||0)} ج</span><span>مستحق على الأوردرات: {due} ج</span></div>})}</div>}
          {adminTab==='accounts' && accountsSection==='orders' && <div style={{display:'grid',gap:12}}>
            <h2>📦 حسابات الأوردرات</h2><label>تاريخ التقرير <input type="date" value={accountingDate} onChange={e=>setAccountingDate(e.target.value)} style={inputStyle}/></label>
            {(()=>{const selected=orders.filter(o=>o.status!=='ملغي'&&String(o.date||o.createdAt||'').slice(0,10)===accountingDate);
              const lines=selected.flatMap(o=>(Array.isArray(o.items)&&o.items.length?o.items:[{name:'غير محدد',qty:1,total:o.total}]).map((item,i)=>({o,item,i})));
              const total=selected.reduce((n,o)=>n+Number(o.total||0),0),paid=selected.reduce((n,o)=>n+Number(o.paidAmount||0),0);
              const payments=dailyPayments.filter(p=>selected.some(o=>String(o.id)===String(p.order_id)));
              return <><div style={{background:'white',padding:14,borderRadius:12,overflowX:'auto',maxWidth:'100%'}}><table style={{width:'100%',minWidth:750,textAlign:'right'}}><thead><tr>{['العميل','الأوردر','اسم الشغل','المنتج','الكمية','إجمالي المنتج','مدفوع الأوردر','المتبقي'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{lines.map(({o,item,i})=><tr key={String(o.id)+'-'+i}>{[o.clientName||'—',o.serialNumber||o.id,o.workerName||'—',item.name||item.productName||'—',item.qty||item.quantity||'—',Number(item.total||Number(item.price||0)*Number(item.qty||1))+' ج',i===0?Number(o.paidAmount||0)+' ج':'—',i===0?Math.max(0,Number(o.total||0)-Number(o.paidAmount||0))+' ج':'—'].map((v,j)=><td key={j} style={{padding:9,borderBottom:'1px solid #ddd'}}>{v}</td>)}</tr>)}</tbody></table>{!lines.length&&<p>لا توجد أوردرات في اليوم المحدد.</p>}</div><div style={{background:'white',padding:14,borderRadius:12}}><h3>إجمالي الأوردرات: {total} ج | المدفوع: {paid} ج | المتبقي: {Math.max(0,total-paid)} ج</h3><h3>تفصيل طرق الدفع</h3>{dailyPaymentsError?<p>{dailyPaymentsError}</p>:!dailyPaymentsLoaded?<p>جاري تحميل الدفعات...</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8}}>{['نقدي','فودافون كاش','انستا باي','تحويل بنكي','رصيد العميل'].map(m=><div key={m} style={{background:'#eff6ff',padding:12,borderRadius:8}}><b>{m}</b><div>{payments.filter(p=>p.method===m).reduce((n,p)=>n+Number(p.amount||0),0)} ج</div></div>)}</div>}<small>طرق الدفع من سجل الدفعات للأوردرات المعروضة؛ الدفعات القديمة بدون تفاصيل لا يمكن توزيعها بدقة. التقرير حسب تاريخ إنشاء الأوردر.</small></div></>})()}
          </div>}
          {adminTab==='accounts' && accountsSection==='delivery' && <div style={{display:'grid',gap:12}}>
            <h2>🚚 حسابات التسليمات</h2><label>تاريخ التقرير <input type="date" value={accountingDate} onChange={e=>setAccountingDate(e.target.value)} style={inputStyle}/></label>
            {(()=>{const delivered=orders.filter(o=>o.status==='تم التسليم'&&String(o.deliveredAt||o.deliveryDate||o.date||'').slice(0,10)===accountingDate);
              const lines=delivered.flatMap(o=>(Array.isArray(o.items)&&o.items.length?o.items:[{name:'غير محدد',qty:1,total:o.total}]).map((item,i)=>({o,item,i})));
              const total=delivered.reduce((n,o)=>n+Number(o.total||0),0),paid=delivered.reduce((n,o)=>n+Number(o.paidAmount||0),0);
              const payments=dailyPayments.filter(p=>delivered.some(o=>String(o.id)===String(p.order_id)));
              return <><div style={{background:'white',padding:14,borderRadius:12,overflowX:'auto'}}><table style={{width:'100%',minWidth:750,textAlign:'right'}}><thead><tr>{['العميل','الأوردر','اسم الشغل','المنتج','الكمية','إجمالي المنتج','مدفوع الأوردر','المتبقي'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{lines.map(({o,item,i})=><tr key={String(o.id)+'-'+i}>{[o.clientName||'—',o.serialNumber||o.id,o.workerName||'—',item.name||item.productName||'—',item.qty||item.quantity||'—',Number(item.total||Number(item.price||0)*Number(item.qty||1))+' ج',i===0?Number(o.paidAmount||0)+' ج':'—',i===0?Math.max(0,Number(o.total||0)-Number(o.paidAmount||0))+' ج':'—'].map((v,j)=><td key={j} style={{padding:9,borderBottom:'1px solid #ddd'}}>{v}</td>)}</tr>)}</tbody></table>{!lines.length&&<p>لا توجد تسليمات في اليوم المحدد.</p>}</div><div style={{background:'white',padding:14,borderRadius:12}}><h3>إجمالي التسليمات: {total} ج | المدفوع: {paid} ج | المتبقي: {Math.max(0,total-paid)} ج</h3><h3>تفصيل طرق الدفع</h3>{dailyPaymentsError?<p>{dailyPaymentsError}</p>:!dailyPaymentsLoaded?<p>جاري تحميل الدفعات...</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8}}>{['نقدي','فودافون كاش','انستا باي','تحويل بنكي','رصيد العميل'].map(m=><div key={m} style={{background:'#eff6ff',padding:12,borderRadius:8}}><b>{m}</b><div>{payments.filter(p=>p.method===m).reduce((n,p)=>n+Number(p.amount||0),0)} ج</div></div>)}</div>}<small>طرق الدفع من سجل الدفعات للأوردرات المعروضة؛ الدفعات القديمة بدون تفاصيل لا يمكن توزيعها بدقة. تاريخ التسليم يستخدم التاريخ المسجل إن وجد.</small></div></>})()}
          </div>}

          {adminTab==='clients' && <div style={{background:'white', padding:'20px', borderRadius:'16px'}}><div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px'}}><h3 style={{margin:0}}>👥 العملاء</h3><div style={{display:'flex', gap:'10px'}}><input placeholder="🔍 بحث..." value={clientSearch} onChange={e=> setClientSearch(e.target.value)} style={{padding:'10px 14px', borderRadius:'20px', border:'1px solid #e2e8f0', width:'220px'}}/><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white', margin:0, borderRadius:'20px'}}>🌐 الرئيسية</button></div></div><div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'16px'}}><div style={{background:'#f8fafc', padding:'12px', borderRadius:'10px', textAlign:'center', fontWeight:'bold'}}>اجمالي: {filteredClients.length}</div><div style={{background:'#fef3c7', padding:'12px', borderRadius:'10px', textAlign:'center', fontWeight:'bold'}}>B: {filteredClients.filter(c=> c.type==='B').length}</div><div style={{background:'#dbeafe', padding:'12px', borderRadius:'10px', textAlign:'center', fontWeight:'bold'}}>VIP: {filteredClients.filter(c=> c.type==='VIP').length}</div></div><div style={{borderRadius:'12px', overflowX:'auto', border:'1px solid #e2e8f0', maxWidth:'100%'}}><table style={{width:'100%',minWidth:760, borderCollapse:'collapse', fontSize:'13px'}}><thead><tr style={{background:'#0f172a', color:'white'}}><th style={{padding:'12px'}}>الاسم</th><th>الموبايل</th><th>الشركة</th><th>النوع</th><th>الطلبات</th><th>الرصيد</th><th>إدارة الرصيد</th></tr></thead><tbody>{filteredClients.map((c,i)=> {const cnt = orders.filter(o=> String(o.clientId)===String(c.id) || String(o.clientPhone).replace(/\D/g,'')===String(c.phone).replace(/\D/g,'')).length; return <tr key={c.id} style={{background: i%2===0?'white':'#f8fafc', borderBottom:'1px solid #eee'}}><td style={{padding:'10px', fontWeight:'bold'}}>{c.name}</td><td>{c.phone}</td><td>{c.company}</td><td><button onClick={async()=>{ const newType = c.type==='B'? 'VIP' : 'B'; if(!confirm(`تحويل ${c.name} من ${c.type} الى ${newType} ؟`)) return; await fetch(`${API}clients/${c.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type: newType})}); loadAll(); }} style={{background: c.type==='VIP'?'#1e40af':'#f59e0b', color:'white', padding:'4px 12px', borderRadius:'20px', fontSize:'11px', border:'none', cursor:'pointer', fontWeight:'bold'}}>{c.type} 🔄</button></td><td style={{textAlign:'center'}}>{cnt}</td><td>{Number(c.balance||0)} ج</td><td><button type="button" style={{...btnStyle,background:'#15803d',color:'white',fontSize:12,padding:'6px 10px'}} onClick={async()=>{const amountText=window.prompt('قيمة شحن رصيد '+c.name);if(amountText===null)return;const amount=Number(amountText);if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)/100!==amount){alert('مبلغ غير صحيح');return}const method=window.prompt('طريقة الدفع: نقدي أو فودافون كاش أو انستا باي أو تحويل بنكي','نقدي');if(method===null)return;if(!['نقدي','فودافون كاش','انستا باي','تحويل بنكي'].includes(method)){alert('طريقة دفع غير صحيحة');return}if(!window.confirm('تأكيد شحن '+amount+' ج للعميل '+c.name+' عن طريق '+method+'؟'))return;try{const token=sessionStorage.getItem(TOKEN_KEY);const response=await fetch(`${API}wallet`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({customerId:c.id,amount,method})});const result=await response.json();if(!response.ok)throw Error(result.error||'فشل إضافة الرصيد');await loadAll(token);alert('تم شحن الرصيد بنجاح')}catch(e){alert(e.message)}}}>+ إضافة رصيد</button></td></tr>})}</tbody></table></div></div>}
          {adminTab==='categories' && <div><div style={{display:'flex', justifyContent:'space-between', gap:'10px'}}><div><button onClick={()=>{setCategoryForm({id:null,name:''});setShowCategoryForm(true)}} style={{...btnStyle, background:'#f59e0b', color:'white'}}>+ رئيسي</button><button onClick={()=>{setSubCategoryForm({id:null,name:'',categoryId:'',image:''});setShowSubCategoryForm(true)}} style={{...btnStyle, background:'#8b5cf6', color:'white'}}>+ فرعي</button></div><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white'}}>🌐 الرئيسية</button></div><div style={{background:'white', padding:'15px', marginTop:'10px', borderRadius:'12px'}}>{categories.map(cat=> <div key={cat.id} style={{padding:10,borderBottom:'1px solid #eee'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><span>{cat.name} — فرعيات: {subCategories.filter(x=>String(x.categoryId)===String(cat.id)).length}</span><button style={{...btnStyle,background:'#f59e0b',color:'white'}} onClick={()=>{setCategoryForm({id:cat.id,name:cat.name});setShowCategoryForm(true)}}>✏️ تعديل</button></div>{subCategories.filter(x=>String(x.categoryId)===String(cat.id)).map(sub=><div key={sub.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',gap:8,borderTop:'1px dashed #ddd'}}><span>↳ {sub.name}</span><button style={{...btnStyle,background:'#8b5cf6',color:'white'}} onClick={()=>{setSubCategoryForm({id:sub.id,name:sub.name,categoryId:String(sub.categoryId),image:sub.image||''});setShowSubCategoryForm(true)}}>✏️ تعديل فرعي</button></div>)}</div>)}</div></div>}
          {adminTab==='products' && <div><div style={{display:'flex', justifyContent:'space-between'}}><button onClick={()=> setShowProductForm(true)} style={{...btnStyle, background:'#16a34a', color:'white'}}>+ منتج جديد</button><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white'}}>🌐 الرئيسية</button></div><div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'10px', marginTop:'10px'}}>{products.map(p=> <div key={p.id} style={{background:'white', padding:'12px', borderRadius:'8px', display:'flex', gap:'10px', alignItems:'center'}}><div style={{width:'50px', height:'50px', borderRadius:'8px', overflow:'hidden', background:'#f1f5f9'}}>{p.image? <img src={p.image} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : null}</div><div style={{flex:1}}><div style={{fontWeight:'bold'}}>{p.name}</div><button onClick={()=> handleEditProduct(p)} style={{...btnStyle, background:'#f59e0b', color:'white', fontSize:'11px', marginTop:'4px'}}>✏️ تعديل</button></div></div>)}</div></div>}
          {adminTab==='employees' && (<div><div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h2>👷 الموظفين</h2><div><button onClick={()=> { setEmployeeForm({ id: null, name: '', phone: '', pass: '', permissions: { dashboard: true, orders: true, clients: true, categories: true, products: true, employees: false, shipping: true } }); setShowEmployeeForm(true)}} style={{...btnStyle, background:'#1e40af', color:'white'}}>+ اضافة</button><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white'}}>🌐 الرئيسية</button></div></div><div style={{background:'white', padding:'15px', borderRadius:'12px', marginTop:'10px'}}>{employees.map(e=> { let pr = e.permissions; try{ if(typeof pr==='string') pr=JSON.parse(pr) }catch{}; return (<div key={e.id} style={{padding:'12px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}><div><b>{e.name}</b> - 📞 {e.phone}<br/><small style={{color:'#666'}}>صلاحيات: {pr? Object.keys(pr).filter(k=> pr[k]).join(', ') : ''}</small></div><div><button onClick={()=> { setEmployeeForm({ id: e.id, name: e.name, phone: e.phone, pass: e.pass, permissions: pr||{ dashboard: true, orders: true, clients: true, categories: true, products: true, employees: false, shipping: true } }); setShowEmployeeForm(true)}} style={{...btnStyle, background:'#f59e0b', color:'white', fontSize:'12px'}}>تعديل</button><button onClick={async()=>{ if(confirm('حذف '+e.name+' ؟')){ await fetch(`${API}employees/${e.id}`, {method:'DELETE'}); loadAll()}}} style={{...btnStyle, background:'#ef4444', color:'white', fontSize:'12px'}}>حذف</button></div></div>)})}</div></div>)}
        </div>
        {showCategoryForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:300}}><div style={{background:'white', padding:'20px', borderRadius:'12px', width:'350px'}}><h3>تصنيف رئيسي</h3><input placeholder="اسم التصنيف" value={categoryForm.name} onChange={e=> setCategoryForm({...categoryForm, name:e.target.value})} style={inputStyle}/><button onClick={saveCategory} disabled={categoryBusy} style={{...btnStyle, background:'#f59e0b', color:'white', width:'100%'}}>حفظ</button><button onClick={()=> setShowCategoryForm(false)} style={{...btnStyle, background:'#6b7280', color:'white', width:'100%'}}>الغاء</button></div></div>}
        {showSubCategoryForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:300}}><div style={{background:'white', padding:'20px', borderRadius:'12px', width:'350px'}}><h3>تصنيف فرعي</h3><select value={subCategoryForm.categoryId} onChange={e=> setSubCategoryForm({...subCategoryForm, categoryId: e.target.value})} style={inputStyle}><option value="">اختر الرئيسي</option>{categories.map(c=> <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select><input placeholder="اسم الفرعي" value={subCategoryForm.name} onChange={e=> setSubCategoryForm({...subCategoryForm, name:e.target.value})} style={inputStyle}/><button onClick={async()=> {if(!subCategoryForm.name ||!subCategoryForm.categoryId) return; const token=sessionStorage.getItem(TOKEN_KEY);const response=await fetch(`${API}subCategories/${subCategoryForm.id||''}`, {method:subCategoryForm.id?'PUT':'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify({name: subCategoryForm.name, categoryId: subCategoryForm.categoryId})});const result=await response.json().catch(()=>({}));if(!response.ok){alert(result.error||'تعذر حفظ القسم الفرعي');return;} setShowSubCategoryForm(false); setSubCategoryForm({name:'', categoryId:'', image:'', id:null}); loadAll()}} style={{...btnStyle, background:'#8b5cf6', color:'white', width:'100%'}}>حفظ</button><button onClick={()=> setShowSubCategoryForm(false)} style={{...btnStyle, background:'#6b7280', color:'white', width:'100%'}}>الغاء</button></div></div>}
        {showProductForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:300}}><div style={{background:'white', padding:'20px', borderRadius:'12px', width:'500px', maxHeight:'90vh', overflowY:'auto'}}><h3>{productForm.id? 'تعديل منتج':'منتج جديد'}</h3>{productSaveMessage&&<div role="alert" style={{padding:12,marginBottom:12,borderRadius:8,background:productSaveMessage.startsWith('✅')?'#dcfce7':'#fee2e2',color:'#7f1d1d',fontWeight:700}}>{productSaveMessage}</div>}<input placeholder="اسم المنتج" value={productForm.name} onChange={e=> setProductForm({...productForm, name:e.target.value})} style={inputStyle}/><input placeholder="رابط الصورة (اختياري)" value={productForm.image} onChange={e=> setProductForm({...productForm, image:e.target.value})} style={inputStyle}/><label style={{display:"block",fontWeight:700,marginTop:10}}>مواصفات المنتج</label><textarea rows={5} placeholder={"اكتب تفاصيل المنتج، مثل: المقاس، نوع الورق، الجرام، التشطيب، الألوان، وأي ملاحظات. كل مواصفة في سطر."} value={productForm.specifications||""} onChange={e=>setProductForm({...productForm,specifications:e.target.value})} style={{...inputStyle,minHeight:110,resize:"vertical"}}/><select value={productForm.subCategoryId} onChange={e=> setProductForm({...productForm, subCategoryId: e.target.value})} style={inputStyle}><option value="">اختر الفرعي</option>{subCategories.map(s=> <option key={s.id} value={String(s.id)}>{s.name}</option>)}</select><div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}><div><b style={{color:'#1e3a8a'}}>💰 B</b>{quantities.map(q=> <div key={q} style={{display:'flex', alignItems:'center', gap:'4px'}}><span style={{width:'40px', fontSize:'12px'}}>{q}</span><input placeholder="0" value={productForm.pricesB[q]||''} onChange={e=> setProductForm({...productForm, pricesB:{...productForm.pricesB, [q]: e.target.value}})} style={{...inputStyle, margin:'4px 0'}}/></div>)}</div><div><b style={{color:'#f59e0b'}}>⭐ VIP</b>{quantities.map(q=> <div key={q} style={{display:'flex', alignItems:'center', gap:'4px'}}><span style={{width:'40px', fontSize:'12px'}}>{q}</span><input placeholder="0" value={productForm.pricesVIP[q]||''} onChange={e=> setProductForm({...productForm, pricesVIP:{...productForm.pricesVIP, [q]: e.target.value}})} style={{...inputStyle, margin:'4px 0'}}/></div>)}</div></div><button disabled={productSaving} onClick={async()=> {
          if(productSaving)return;
          if(!productForm.name.trim()||!productForm.subCategoryId){setProductSaveMessage('❌ اكتب اسم المنتج واختار القسم الفرعي');return}
          const nb={},nv={};
          quantities.forEach(q=>{nb[q]=Number(productForm.pricesB[q])||0;nv[q]=Number(productForm.pricesVIP[q])||0});
          const payload={name:productForm.name.trim(),image:productForm.image,specifications:(productForm.specifications||'').trim(),subCategoryId:String(productForm.subCategoryId),pricesB:nb,pricesVIP:nv};
          setProductSaving(true);setProductSaveMessage('⏳ جاري إرسال المنتج للسيرفر...');
          try{
            const token=sessionStorage.getItem(TOKEN_KEY);
            if(!token)throw new Error('يرجى تسجيل دخول المدير من جديد');
            const response=await fetch(`${API}products${productForm.id?'/'+productForm.id:''}`,{method:productForm.id?'PUT':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});
            const result=await response.json().catch(()=>({}));
            if(!response.ok)throw new Error(result.error||'تعذر حفظ المنتج');
            setProductSaveMessage('✅ تم حفظ المنتج. جاري تحديث القائمة...');
            try { await loadAll() } catch(e) { console.error('Refresh products failed',e) }
            setShowProductForm(false);
            setProductForm({name:'',categoryId:'',subCategoryId:'',image:'',specifications:'',id:null,pricesB:{1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''},pricesVIP:{1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''}});
            alert('تم حفظ المنتج بنجاح');
          }catch(error){setProductSaveMessage('❌ لم يتم حفظ المنتج: '+error.message)}finally{setProductSaving(false)}
        }} style={{...btnStyle, background:'#16a34a', color:'white', width:'100%'}}>{productSaving?'جاري الحفظ...':'💾 حفظ'}</button><button onClick={()=>{setShowProductForm(false);setProductSaveMessage('')}} style={{...btnStyle, background:'#6b7280', color:'white', width:'100%'}}>الغاء</button></div></div>}
        {showEmployeeForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:500}}><div style={{background:'white', padding:'20px', borderRadius:'12px', width:'440px', maxHeight:'90vh', overflowY:'auto'}}><h3 style={{fontWeight:900, textAlign:'center'}}>{employeeForm.id? '✏️ تعديل موظف':'👷 اضافة موظف'}</h3><input placeholder="اسم الموظف" value={employeeForm.name} onChange={e=> setEmployeeForm({...employeeForm, name:e.target.value})} style={inputStyle}/><input placeholder="موبايل 11 رقم" value={employeeForm.phone} maxLength={11} onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,''); if(v.length<=11) setEmployeeForm({...employeeForm, phone:v})}} style={inputStyle}/><input placeholder="باسورد" value={employeeForm.pass} onChange={e=> setEmployeeForm({...employeeForm, pass:e.target.value})} style={inputStyle}/><div style={{background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px', margin:'10px 0'}}><div style={{fontWeight:900, marginBottom:'10px'}}>🔐 الصلاحيات:</div>{Object.entries({dashboard:'تحكم', orders:'اوردرات', shipping:'التشغيل', clients:'عملاء', categories:'تصنيفات', products:'منتجات', employees:'موظفين'}).map(([k,l])=> <label key={k} style={{display:'flex', gap:'8px', marginBottom:'8px', cursor:'pointer'}}><input type="checkbox" checked={!!employeeForm.permissions[k]} onChange={e=> setEmployeeForm({...employeeForm, permissions:{...employeeForm.permissions, [k]: e.target.checked}})} /> {l}</label>)}</div><button onClick={async()=> { if(!employeeForm.name ||!employeeForm.phone ||!employeeForm.pass){ alert('املأ البيانات'); return } const url = employeeForm.id? `${API}employees/${employeeForm.id}` : `${API}employees`; const method = employeeForm.id? 'PUT' : 'POST'; try { const token=sessionStorage.getItem(TOKEN_KEY); if(!token) throw new Error('يرجى تسجيل الدخول للإدارة مرة أخرى'); const response=await fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(employeeForm)});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||`فشل الحفظ (${response.status})`);await loadAll(token);setShowEmployeeForm(false);alert('تم حفظ بيانات الموظف بنجاح ✅');}catch(error){alert('تعذر حفظ الموظف: '+error.message)} }} style={{width:'100%', padding:'12px', background:'#1e40af', color:'white', borderRadius:'8px', border:'none', fontWeight:900, cursor:'pointer'}}>💾 حفظ</button><button onClick={()=> setShowEmployeeForm(false)} style={{width:'100%', padding:'12px', background:'#6b7280', color:'white', borderRadius:'8px', border:'none', marginTop:'8px', cursor:'pointer'}}>الغاء</button></div></div>}
      </div>
      </>
    )
  }

  return (
    <div className="elmarwa-storefront" style={{ fontFamily: 'Tahoma', direction: 'rtl', minHeight:'100vh' }}>
      <style>{`
        .elmarwa-storefront, .elmarwa-storefront * { box-sizing: border-box; }
        .customer-order-layout { width:100%; }
        .customer-order-layout td { overflow-wrap:anywhere; word-break:break-word; }
        .payment-proof-panel { overflow-wrap:anywhere; }
        @media (max-width:700px) {
          .customer-order-layout { flex-direction:column !important; }
          .customer-order-layout > div { width:100% !important; min-width:0 !important; }
          .payment-proof-panel { order:2; border-left:0 !important; border-top:1px solid #e2e8f0; }
          .customer-order-layout table td { padding:9px 7px !important; font-size:12px; }
        }

        .elmarwa-storefront { width:100%; max-width:100%; overflow-x:clip; }
        .elmarwa-storefront img { max-width:100%; }
        .elmarwa-storefront input, .elmarwa-storefront select, .elmarwa-storefront textarea { max-width:100%; min-width:0; }
        .elmarwa-storefront table { max-width:100%; }
        .elmarwa-storefront .customer-header { gap:12px; flex-wrap:wrap; align-items:center; }
        .elmarwa-storefront .customer-header-actions { gap:6px; flex-wrap:wrap; }
        .elmarwa-storefront .customer-header-actions button { white-space:normal; }
        @media (max-width: 700px) {
          .elmarwa-storefront .customer-header { padding:12px !important; justify-content:center !important; text-align:center; }
          .elmarwa-storefront .customer-header h2 { width:100%; font-size:clamp(19px,5vw,25px); }
          .elmarwa-storefront .customer-header-actions { justify-content:center; width:100%; }
          .elmarwa-storefront .customer-header-actions button { padding:10px 12px !important; margin:3px !important; font-size:13px !important; }
          .elmarwa-storefront [style*="position: fixed"] > div { max-width:calc(100vw - 24px) !important; }
          .elmarwa-storefront [style*="position: fixed"] { max-width:100vw; }
          .elmarwa-storefront .admin-menu { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
          .elmarwa-storefront .admin-sidebar { max-height:45vh; }
        }
        @media (max-width: 420px) {
          .elmarwa-storefront .customer-header-actions button { font-size:12px !important; padding:9px !important; }
          .elmarwa-storefront .admin-menu { grid-template-columns:1fr 1fr !important; }
        }
      `}</style>
      <div className="customer-header" style={{ background: siteDesign.primary, color: 'white', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <h2 style={{ margin: 0, cursor: 'pointer' }} onClick={() => setSelectedSub(null)}>{siteDesign.title}</h2>
        <div className="customer-header-actions" style={{display:'flex', alignItems:'center'}}>
          <button style={{...btnStyle, background: cart.length?'#f59e0b':'#94a3b8', color: 'white'}} onClick={() => { if(!loggedClient){ setShowLogin(true); return } if(cart.length) setShowCart(true); else alert('السلة فارغة — اختر منتجاً أولاً') }}>🛒 السلة ({cart.length})</button>
          {!loggedClient? (<><button style={{...btnStyle, background: '#16a34a', color: 'white'}} onClick={() => setShowForm(true)}>تسجيل</button><button style={{...btnStyle, background: 'white', color: '#1e3a8a'}} onClick={() => setShowLogin(true)}>دخول</button></>) : <><span style={{fontSize:'13px', marginLeft:'10px'}}>{loggedClient.name}</span><button style={{...btnStyle, background: myUnread.length>0?'#ef4444':'#f59e0b', color:'white'}} onClick={()=> { setShowMyOrders(true); setNotifications(notifications.map(n=> (String(n.clientId)===String(loggedClient.id) || String(n.clientPhone).replace(/\D/g,'')===String(loggedClient.phone).replace(/\D/g,''))? {...n, read:true}: n))}}>📦 طلباتي ({myOrdersList.length}) {myUnread.length>0? `(${myUnread.length}🔔)`:''}</button><span style={{cursor: 'pointer', marginRight:10, fontSize:'12px'}} onClick={() => {setLoggedClient(null); setCustomerToken(''); sessionStorage.removeItem('elmarw_customer_token'); localStorage.removeItem('loggedClient'); setCart([])}}> خروج</span></>}
        </div>
      </div>
      {!selectedSub && (siteDesign.banner || siteDesign.tagline) && <div style={{background:siteDesign.primary,color:'white',padding:'18px',textAlign:'center'}}>{siteDesign.banner&&<img src={siteDesign.banner} alt="بنر الموقع" style={{display:'block',width:'100%',maxHeight:310,objectFit:'cover',borderRadius:10,marginBottom:12}}/>}<h2 style={{margin:4}}>{siteDesign.title}</h2><p style={{margin:4,color:siteDesign.accent}}>{siteDesign.tagline}</p></div>}
      {myUnread.length>0 && loggedClient &&!showMyOrders && <div style={{background:'#fef9c3', border:'2px solid #f59e0b', padding:'10px 15px', margin:'10px', borderRadius:'10px', display:'flex', justifyContent:'space-between'}}><span>🔔 عندك {myUnread.length} تحديث: {myUnread[0]?.msg}</span><button onClick={()=> setShowMyOrders(true)} style={{...btnStyle, background:'#f59e0b', color:'white', fontSize:'12px'}}>عرض</button></div>}
      {loadError && <div style={{padding:'12px',background:'#fee2e2',color:'#991b1b',direction:'rtl'}}>تعذر تحميل البيانات: {loadError}</div>}
      <div style={{ padding: '20px', background: '#f5f7fa', minHeight: '80vh' }}>
        {!selectedSub && <>{categories.map(cat => { const catSubs = subCategories.filter(s => Number(s.categoryId) === Number(cat.id)); if(catSubs.length===0) return null; return (<div key={cat.id} style={{marginBottom: '24px'}}><h3 style={{ color: '#1e40af', fontSize:'20px', marginBottom:'10px' }}>{cat.name}</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>{catSubs.map(sub => (<div key={sub.id} onClick={() => setSelectedSub(sub)} style={{ background: 'white', borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', border:'1px solid #dbeafe' }}>{sub.image? <img src={sub.image} style={{width: '100%', height: '130px', objectFit: 'cover'}}/> : <div style={{height:'130px', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center'}}>بدون صورة</div>}<div style={{padding: '10px', textAlign: 'center', fontWeight: 'bold', color:'#1e3a8a'}}>{sub.name}</div></div>))}</div></div>) })}<div style={{marginTop:'18px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}><h2 style={{margin:0,color:'#0f172a'}}>🛍️ كل المنتجات</h2><span style={{background:'#dbeafe',color:'#1e40af',padding:'5px 10px',borderRadius:'15px',fontSize:'12px',fontWeight:'bold'}}>{products.length} منتج</span></div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'14px' }}>{products.map(p=><ProductCard key={p.id} product={p}/>)}</div>{products.length===0&&<div style={{background:'white',padding:'30px',borderRadius:'12px',textAlign:'center'}}>لا توجد منتجات حالياً</div>}</div></>}
        {selectedSub && (<div><button onClick={() => setSelectedSub(null)} style={{...btnStyle, background: '#6b7280', color: 'white'}}>⬅️ رجوع</button><h2>📁 {selectedSub.name}</h2><input aria-label="بحث في منتجات القسم" placeholder="🔎 ابحث عن منتج بالاسم" value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} style={{width:'100%',maxWidth:440,padding:'12px 14px',border:'1px solid #cbd5e1',borderRadius:10,marginBottom:12,boxSizing:'border-box',fontSize:15}} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop:'15px' }}>{products.filter(p => Number(p.subCategoryId) === Number(selectedSub.id) && p.name?.toLocaleLowerCase('ar').includes(catalogSearch.trim().toLocaleLowerCase('ar'))).map(p => <ProductCard key={p.id} product={p} />)}{products.filter(p => Number(p.subCategoryId) === Number(selectedSub.id) && p.name?.toLocaleLowerCase('ar').includes(catalogSearch.trim().toLocaleLowerCase('ar'))).length===0 && <div style={{background:'white', padding:'30px', borderRadius:'12px', textAlign:'center', color:'#999'}}>لا يوجد منتجات</div>}</div></div>)}
      </div>

      {!showAdmin && <SiteChatAssistant products={products} categories={categories} subCategories={subCategories} loggedClient={loggedClient} onMyOrders={()=>setShowMyOrders(true)} onRegister={()=>setShowForm(true)} onLogin={()=>setShowLogin(true)} />}
      {showMyOrders && <div style={{position:'fixed', inset:0, background:'rgba(15,23,42,0.85)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:400, padding:'10px'}}>
        <div style={{background:'white', width:'95%', maxWidth:'900px', maxHeight:'92vh', borderRadius:'16px', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 25px 50px rgba(0,0,0,0.4)'}}>
          <div style={{background:'#0f172a', color:'white', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:20}}><div style={{fontWeight:900}}>📦 طلباتي - {loggedClient?.name} | مطبعة المروة</div><button onClick={()=> setShowMyOrders(false)} style={{background:'white', color:'#0f172a', border:'none', padding:'7px 16px', fontWeight:900, cursor:'pointer', borderRadius:'20px'}}>X اغلاق</button></div>
          <div style={{padding:'12px', overflowY:'auto', flex:1, background:'#f8fafc'}}>
            {myOrdersList.length===0 && <div style={{padding:'50px', textAlign:'center', color:'#999', background:'white', borderRadius:'12px'}}>لسه معملتش اوردرات</div>}
            {myOrdersList.map(o=> {
              const items = safeItems(o); const paid = Number(o.paidAmount)||0; const total = Number(o.total)||0; const remaining = total - paid; const statusIdx = orderStatuses.indexOf(o.status)
              return (
                <div key={o.id} style={{background:({'جديد':'#ffffff','قيد التنفيذ':'#dcfce7','قيد الطباعة':'#fee2e2','جاهز للتسليم':'#dbeafe'}[o.status]||'#ffffff'), borderRadius:'12px', marginBottom:'14px', border:'1px solid #e2e8f0', overflow:'hidden'}}>
                  <div style={{height:'5px', background: statusColor(o.status)}}></div>
                  <div style={{background:'#000', color:'white', padding:'4px 10px', fontSize:'11px', fontWeight:900, display:'flex', justifyContent:'space-between'}}><span>سيريال: {o.serialNumber||o.id}</span></div>
                  <div className="customer-order-layout" style={{display:'flex',flexDirection:'row-reverse',minWidth:0}}>
                    <div className="payment-proof-panel" style={{width:'170px',flexShrink:0, background:'#f8fafc', borderLeft:'1px solid #e2e8f0', padding:'12px', textAlign:'center'}}>
                      <div style={{marginTop:'10px'}}><div style={{fontSize:'11px', fontWeight:'bold'}}>📸 اسكرين التحويل</div>{o.paymentProofPath && <button type="button" style={{marginTop:'6px',padding:'6px 10px',borderRadius:'8px',background:'#e0f2fe',color:'#075985',border:0,cursor:'pointer'}} onClick={async()=>{try{const token=sessionStorage.getItem('elmarw_customer_token');const response=await fetch(`${API}orders/${o.id}/payment-proof`,{headers:{Authorization:`Bearer ${token}`}});const result=await response.json().catch(()=>({}));if(!response.ok||!result.url)throw new Error(result.error||'تعذر فتح الصورة');window.open(result.url,'_blank','noopener,noreferrer');}catch(error){alert(error.message)}}}>👁️ عرض الاسكرين</button>}{o.paymentProof? <div style={{background:'#dcfce7', border:'1px solid #16a34a', padding:'6px', borderRadius:'8px', fontSize:'10px', marginTop:'4px', color:'#166534'}}>✅ {o.paymentProof}</div> : <div style={{fontSize:'10px', color:'#94a3b8', marginTop:'4px'}}>لم يتم الرفع</div>}<label style={{display:'block', marginTop:'6px', background:'#1e3a8a', color:'white', padding:'7px', borderRadius:'8px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>رفع اسكرين<input type="file" accept="image/*" style={{display:'none'}} onChange={async(e)=>{ const file=e.target.files[0]; e.target.value=''; if(!file) return; if(!['image/jpeg','image/png','image/webp'].includes(file.type)){alert('اختار صورة JPG أو PNG أو WEBP');return;} if(file.size>3*1024*1024){alert('الصورة لازم أقل من 3 ميجابايت');return;} setProofUploadStatus(prev=>({...prev,[o.id]:'uploading'})); try { const token=sessionStorage.getItem('elmarw_customer_token'); if(!token) throw new Error('يرجى تسجيل الدخول مرة أخرى'); const fileData=await readFileAsDataUrl(file); const response=await fetch(`${API}orders/${o.id}/payment-proof`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({fileName:file.name,mime:file.type,fileData})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'فشل رفع الصورة');setOrders(prev=>prev.map(item=>String(item.id)===String(o.id)?{...item,...result}:item));setProofUploadStatus(prev=>({...prev,[o.id]:'success'}));}catch(error){setProofUploadStatus(prev=>({...prev,[o.id]:'error'}));alert('فشل رفع الصورة: '+error.message)} }}/></label>{proofUploadStatus[o.id]&&<div role="status" style={{marginTop:8,fontSize:11,color:proofUploadStatus[o.id]==='error'?'#b91c1c':'#166534'}}>{proofUploadStatus[o.id]==='uploading'?'⏳ جاري رفع صورة التحويل...':proofUploadStatus[o.id]==='success'?'✅ تم رفع صورة التحويل وحفظها':'❌ فشل الرفع، حاول مرة أخرى'}<div style={{height:6,marginTop:5,borderRadius:5,background:'#cbd5e1',overflow:'hidden'}}><div style={{width:proofUploadStatus[o.id]==='uploading'?'55%':'100%',height:'100%',background:proofUploadStatus[o.id]==='error'?'#dc2626':'#16a34a'}}/></div></div>}</div>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px',tableLayout:'fixed'}}><tbody>
                        <tr style={{borderBottom:'1px solid #f1f5f9'}}><td style={{padding:'10px 14px', color:'#64748b', width:'100px'}}>اسم العميل</td><td style={{padding:'10px 14px', fontWeight:900}}>{o.clientName}</td></tr><tr style={{borderBottom:'1px solid #f1f5f9', background:'#eef2ff'}}><td style={{padding:'10px 14px', color:'#3730a3',fontWeight:800}}>الشغال</td><td style={{padding:'10px 14px', fontWeight:900, color:'#3730a3'}}>{o.workerName||'لم يتم تحديده'}</td></tr>
                        <tr style={{borderBottom:'1px solid #f1f5f9', background:'#f8fafc'}}><td style={{padding:'10px 14px', color:'#64748b'}}>رقم الطلب</td><td style={{padding:'10px 14px', fontWeight:900}}>#{o.serialNumber||o.id} - {o.date}</td></tr>
                        <tr style={{borderBottom:'1px solid #f1f5f9'}}><td style={{padding:'10px 14px', color:'#64748b'}}>التكلفة</td><td style={{padding:'10px 14px', fontWeight:900, color:'#16a34a', fontSize:'15px'}}>{total} ج</td></tr>
                        <tr style={{borderBottom:'1px solid #f1f5f9', background:'#eff6ff'}}><td style={{padding:'10px 14px', color:'#1e40af',fontWeight:800}}>طريقة الدفع</td><td style={{padding:'10px 14px', fontWeight:900, color:'#1e40af'}}>{o.paymentMethod||'نقدي'}</td></tr><tr style={{borderBottom:'1px solid #f1f5f9', background:'#f0fdf4'}}><td style={{padding:'10px 14px', color:'#64748b'}}>المدفوع</td><td style={{padding:'10px 14px', fontWeight:900, color:'#16a34a'}}>{paid} ج</td></tr>
                        <tr style={{background: remaining>0?'#fef2f2':'#f0fdf4'}}><td style={{padding:'10px 14px', color: remaining>0?'#ef4444':'#16a34a'}}>المتبقي</td><td style={{padding:'10px 14px', fontWeight:900, color: remaining>0?'#ef4444':'#16a34a'}}>{remaining} ج</td></tr>
                      </tbody></table>
                      <div style={{padding:'12px 14px', background:({'جديد':'#ffffff','قيد التنفيذ':'#bbf7d0','قيد الطباعة':'#fecaca','جاهز للتسليم':'#bae6fd'}[o.status]||'#f1f5f9'), display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #cbd5e1'}}><span style={{fontSize:'15px', fontWeight:900, color:'#1e3a8a'}}>حالة الطلب</span><span style={{background:({'جديد':'#f1f5f9','قيد التنفيذ':'#16a34a','قيد الطباعة':'#dc2626','جاهز للتسليم':'#0284c7'}[o.status]||statusColor(o.status)), color:o.status==='جديد'?'#0f172a':'white', padding:'7px 16px', borderRadius:'22px', fontSize:'15px', fontWeight:900}}>{o.status}</span></div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'5px',padding:'12px',background:'#f8fafc'}}>{orderStatuses.filter(s=> ['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم'].includes(s)).map((s,i)=> {const active = i <= Math.min(statusIdx,3) && o.status!=='ملغي'; return <div key={s} style={{textAlign:'center'}}><div style={{height:'9px',borderRadius:'6px',background: active?({'جديد':'#94a3b8','قيد التنفيذ':'#16a34a','قيد الطباعة':'#dc2626','جاهز للتسليم':'#38bdf8'}[s]||'#64748b'):'#cbd5e1',marginBottom:'6px'}}></div><div style={{fontSize:'12px',fontWeight:900,color: active?({'جديد':'#334155','قيد التنفيذ':'#15803d','قيد الطباعة':'#b91c1c','جاهز للتسليم':'#0284c7'}[s]||'#334155'):'#64748b'}}>{s}</div></div>})}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{padding:'12px', background:'white', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'center', position:'sticky', bottom:0, zIndex:20}}><button onClick={()=> setShowMyOrders(false)} style={{background:'#0f172a', color:'white', border:'none', padding:'10px 30px', borderRadius:'20px', fontWeight:900, cursor:'pointer'}}>اغلاق الصفحة</button></div>
        </div>
      </div>}


      {showStickerSettings && <div style={{position:'fixed',inset:0,background:'#0009',zIndex:450,display:'flex',alignItems:'center',justifyContent:'center',padding:12}}>
        <div style={{background:'white',borderRadius:14,padding:20,width:'100%',maxWidth:360,direction:'rtl'}}>
          <h3 style={{marginTop:0}}>⚙️ إعدادات طباعة الاستيكر</h3>
          <p style={{fontSize:12,color:'#475569'}}>المقاس بالسنتيمتر. الافتراضي 4 × 2 سم.</p>
          <label>العرض (سم)<input type="number" min="2" max="15" step=".1" value={stickerSize.width} onChange={e=>setStickerSize(v=>({...v,width:e.target.value}))} style={inputStyle}/></label>
          <label>الارتفاع (سم)<input type="number" min="1" max="10" step=".1" value={stickerSize.height} onChange={e=>setStickerSize(v=>({...v,height:e.target.value}))} style={inputStyle}/></label>
          <p style={{fontSize:12}}>البيانات: السيريال – اسم العميل – اسم الشغل – تاريخ الطلب</p>
          <button onClick={()=>{const w=Number(stickerSize.width),h=Number(stickerSize.height);if(w<2||w>15||h<1||h>10||!Number.isFinite(w)||!Number.isFinite(h)){alert('العرض من 2 إلى 15 سم والارتفاع من 1 إلى 10 سم');return}localStorage.setItem('elmarw_sticker_size',JSON.stringify({width:w,height:h}));setShowStickerSettings(false)}} style={{...btnStyle,background:'#16a34a',color:'white'}}>حفظ الإعدادات</button>
          <button onClick={()=>setShowStickerSettings(false)} style={btnStyle}>إغلاق</button>
        </div>
      </div>}
      {showCart && cart.length>0 && <div style={{ position: 'fixed', inset:0, background: 'rgba(15,23,42,0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding:'12px' }}><div style={{ background: 'white', padding: '18px', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}><h3 style={{marginTop:0,color:'#1e3a8a'}}>🛒 إرسال الطلب</h3>{cart.map(item => (<div key={item.id} style={{display: 'flex', alignItems:'center', gap:'8px', padding:'9px 0', borderBottom:'1px solid #eee'}}><div style={{width:'45px', height:'45px', borderRadius:'8px', overflow:'hidden', background:'#f1f5f9'}}>{item.image? <img src={item.image} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : null}</div><span style={{flex:1,fontWeight:800,fontSize:'12px'}}>{item.name} - {item.qty}</span><span style={{fontWeight:900}}>{item.total}ج <button onClick={() => setCart(cart.filter(c => c.id!== item.id))} style={{color: 'red', border: 'none', background: 'none', cursor:'pointer'}}>✕</button></span></div>))}<div style={{fontWeight:900,fontSize:'16px',padding:'10px 0'}}>الإجمالي: {cart.reduce((s,i)=>s+i.total,0)}ج</div><div style={{background:'#eff6ff',padding:'10px',borderRadius:'10px',marginBottom:'8px',color:'#1e40af',fontWeight:800}}>العميل: {loggedClient?.name}</div><div style={{background:'#ecfdf5',border:'1px solid #86efac',borderRadius:10,padding:10,marginBottom:8}}><strong>💰 رصيدك المتاح: {Number(loggedClient?.balance||0).toLocaleString('ar-EG')} ج</strong><label style={{display:'block',fontSize:12,marginTop:6}}>المبلغ اللي تحب تدفعه من رصيدك (اختياري)</label><input type="number" min="0" max={Math.min(Number(loggedClient?.balance||0),cart.reduce((s,i)=>s+i.total,0))} step="0.01" value={walletAmount} onChange={e=>setWalletAmount(e.target.value)} style={inputStyle}/><div style={{fontSize:12}}>المتبقي بعد استخدام الرصيد: {Math.max(0,cart.reduce((s,i)=>s+i.total,0)-Number(walletAmount||0)).toLocaleString('ar-EG')} ج</div></div><input placeholder="اسم الشغال (اختياري)" value={orderClientName} onChange={e => setOrderClientName(e.target.value)} style={inputStyle} /><select value={customerPaymentMethod} onChange={e=>setCustomerPaymentMethod(e.target.value)} style={inputStyle}><option value="نقدي">💵 نقدي</option><option value="فودافون كاش">📱 فودافون كاش</option></select><label style={{display:'block',background:'#f8fafc',border:'2px dashed #2563eb',padding:'12px',borderRadius:'10px',fontWeight:900,color:'#1e40af',cursor:'pointer',textAlign:'center'}}>📎 رفع ملف الطلب {orderFile? `✅ ${orderFile.name}`:'(إجباري)'}<input type="file" accept=".pdf,.jpg,.jpeg,.zip,.rar,.7z,application/pdf,image/jpeg,application/zip,application/x-rar-compressed,application/x-7z-compressed" onChange={e => setOrderFile(e.target.files[0]||null)} style={{display:'none'}} /></label>{orderFile&&<div role="status" style={{fontSize:12,color:'#166534',padding:8,background:'#dcfce7',borderRadius:8}}>✅ تم اختيار الملف: {orderFile.name} — جاهز للإرسال<div style={{height:6,background:'#16a34a',borderRadius:5,marginTop:6}}/></div>}<textarea placeholder="ملاحظات الطباعة (اختياري)" value={orderNotes} onChange={e=> setOrderNotes(e.target.value)} style={inputStyle}></textarea><button style={{...btnStyle, background: '#16a34a', color: 'white', width: '100%',margin:'5px 0'}} onClick={handlePlaceOrder}>إرسال الطلب الآن ✅</button><button style={{...btnStyle, background: '#64748b', color: 'white', width: '100%',margin:'5px 0'}} onClick={() => setShowCart(false)}>إلغاء</button></div></div>}
      {showForm && <div style={{ position: 'fixed', inset:0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}><div style={{ background: 'white', padding: '20px', borderRadius: '12px', width: 'min(400px, calc(100vw - 32px))',maxHeight:'90vh',overflowY:'auto' }}><h3>تسجيل جديد</h3><input placeholder="الاسم" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inputStyle} /><input placeholder="الموبايل 11 رقم" value={form.phone} maxLength={11} onChange={e => {const v=e.target.value.replace(/[^0-9]/g,''); if(v.length<=11) setForm({...form, phone: v})}} style={inputStyle} /><input placeholder="الشركة" value={form.company} onChange={e => setForm({...form, company: e.target.value})} style={inputStyle} /><input placeholder="العنوان" value={form.address} onChange={e => setForm({...form, address: e.target.value})} style={inputStyle} /><input placeholder="الباسورد" type={showPasswords.register ? 'text' : 'password'} value={form.pass} onChange={e => setForm({...form, pass: e.target.value})} style={inputStyle} /><button type="button" onClick={() => setShowPasswords(prev=>({...prev,register:!prev.register}))} style={{...btnStyle,background:'#e2e8f0',color:'#0f172a',margin:'4px 0 12px',padding:'8px 12px'}}>{showPasswords.register ? '🙈 إخفاء كلمة المرور' : '👁️ إظهار كلمة المرور'}</button><button style={{...btnStyle, background: '#16a34a', color: 'white', width: '100%'}} onClick={handleRegister}>تسجيل</button><button style={{...btnStyle, background: '#6b7280', color: 'white', width: '100%'}} onClick={() => setShowForm(false)}>اغلاق</button></div></div>}
      {showLogin && <div style={{ position: 'fixed', inset:0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}><div style={{ background: 'white', padding: '20px', borderRadius: '12px', width: 'min(400px, calc(100vw - 32px))',maxHeight:'90vh',overflowY:'auto', position:'relative' }}><h3 style={{textAlign:'center'}}>دخول العملاء</h3><input placeholder="موبايل" value={login.phone} onChange={e=> setLogin({...login, phone: e.target.value})} style={inputStyle} /><input placeholder="باسورد" type={showPasswords.login ? 'text' : 'password'} value={login.pass} onChange={e => setLogin({...login, pass: e.target.value})} style={inputStyle} /><button type="button" onClick={() => setShowPasswords(prev=>({...prev,login:!prev.login}))} style={{...btnStyle,background:'#e2e8f0',color:'#0f172a',margin:'4px 0 12px',padding:'8px 12px'}}>{showPasswords.login ? '🙈 إخفاء كلمة المرور' : '👁️ إظهار كلمة المرور'}</button><button style={{...btnStyle, background: '#2563eb', color: 'white', width: '100%'}} onClick={handleLogin}>دخول</button><div style={{textAlign:'center', marginTop:'10px'}}><span onClick={()=> alert('برجاء التواصل مع خدمة العملاء\n📞 01000000000')} style={{color:'#2563eb', cursor:'pointer', fontSize:'13px', textDecoration:'underline'}}>نسيت الباسورد؟ برجاء التواصل مع خدمة العملاء</span></div><button style={{...btnStyle, background: '#6b7280', color: 'white', width: '100%', marginTop:'10px'}} onClick={() => setShowLogin(false)}>اغلاق</button><div onClick={()=> {setShowAdminLogin(true); setShowLogin(false)}} style={{position:'absolute', bottom:'8px', left:'8px', width:'22px', height:'22px', background:'#f1f5f9', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:'10px'}}>🔒</div></div></div>}
      {showAdminLogin && <div style={{ position: 'fixed', inset:0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 500 }}><div style={{ background: 'white', padding: '20px', borderRadius: '12px', width: '380px' }}><h3 style={{textAlign:'center'}}>دخول المدير عبر Supabase</h3><input placeholder="البريد الإلكتروني للمدير" value={adminLogin.user} onChange={e => setAdminLogin({...adminLogin, user: e.target.value})} style={inputStyle} /><input placeholder="الباسورد" type={showPasswords.admin ? 'text' : 'password'} value={adminLogin.pass} onChange={e => setAdminLogin({...adminLogin, pass: e.target.value})} style={inputStyle} /><button type="button" onClick={() => setShowPasswords(prev=>({...prev,admin:!prev.admin}))} style={{...btnStyle,background:'#e2e8f0',color:'#0f172a',margin:'4px 0 12px',padding:'8px 12px'}}>{showPasswords.admin ? '🙈 إخفاء كلمة المرور' : '👁️ إظهار كلمة المرور'}</button><button style={{...btnStyle, background: '#0f172a', color: 'white', width: '100%'}} onClick={handleAdminLogin} disabled={adminBusy}>{adminBusy ? 'جاري التحقق...' : 'دخول'}</button><button style={{...btnStyle, background: '#6b7280', color: 'white', width: '100%'}} onClick={() => {setShowAdminLogin(false); setShowLogin(true)}}>رجوع</button></div></div>}
    </div>
  )
}
