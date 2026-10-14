import React,{useState} from 'react'
const answers = [
  ['متابعة أوردر','تقدر تتابع حالة الطلب من صفحة «طلباتي» بعد تسجيل الدخول. لو عندك رقم سيريال، احتفظ بيه للتواصل مع الإدارة.'],
  ['أسعار المنتجات','افتح معرض المنتجات واختر الصنف والكمية، والسعر المعروض بيكون حسب نوع حساب العميل وتوفر الأسعار.'],
  ['مشكلة في ملف PDF','لو فيه مشكلة في ملف التنفيذ، الموظف بيتواصل معاك يدويًا عبر واتساب، وبعد التصحيح هو اللي بيعتمد ملف التنفيذ الجديد.'],
  ['طرق الدفع','طرق الدفع المتاحة في النظام: نقدي، فودافون كاش، إنستا باي، تحويل بنكي، أو آجل حسب اتفاق العميل مع الإدارة.']
]
export default function MarwaChat({orders=[]}) {
 const [open,setOpen]=useState(false)
 const [messages,setMessages]=useState([{by:'bot',text:'أهلًا بيك في مساعد المروة 👋 اختار موضوع، أو اكتب سؤالك. المساعد هنا تجريبي ومش متصل بواتساب تلقائيًا.'}])
 const [draft,setDraft]=useState('')
 const send=(value)=>{const q=value.trim();if(!q)return;const match=answers.find(([title])=>q.includes(title)||title.includes(q));let text=match?match[1]:'أقدر أساعدك في متابعة الأوردرات، الأسعار، ملفات PDF وطرق الدفع. لو سؤالك مختلف تواصل مع إدارة المروة.';if(/طلباتي|أوردراتي/.test(q)&&orders.length)text=`عندك ${orders.length} طلبات. آخر حالة مسجلة: ${orders[0]?.status||'غير معروفة'}. افتح «طلباتي» للتفاصيل.`;setMessages(old=>[...old,{by:'user',text:q},{by:'bot',text}]);setDraft('')}
 return <div dir="rtl" style={{position:'fixed',left:18,bottom:18,zIndex:9999,fontFamily:'Tahoma,Arial',maxWidth:'calc(100vw - 36px)'}}>
  {open&&<section aria-label="شات المروة" style={{width:355,maxWidth:'100%',background:'white',border:'1px solid #bfdbfe',borderRadius:17,boxShadow:'0 16px 45px #0f172a38',overflow:'hidden',marginBottom:12}}>
   <header style={{background:'#0f2d5c',color:'white',padding:14,display:'flex',justifyContent:'space-between'}}><strong>💬 شات المروة</strong><button aria-label="إغلاق الشات" onClick={()=>setOpen(false)} style={{background:'transparent',border:0,color:'white',cursor:'pointer'}}>✕</button></header>
   <div aria-live="polite" style={{height:270,overflowY:'auto',padding:12,background:'#f3f7fd'}}>{messages.map((m,i)=><p key={i} style={{background:m.by==='bot'?'white':'#dbeafe',padding:10,borderRadius:12,fontSize:13,margin:'6px 0',marginRight:m.by==='bot'?0:25,marginLeft:m.by==='bot'?25:0}}>{m.text}</p>)}</div>
   <div style={{padding:10}}><div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>{answers.map(([q])=><button key={q} onClick={()=>send(q)} style={{background:'#eff6ff',color:'#1e40af',border:'1px solid #bfdbfe',borderRadius:18,padding:'6px 9px',cursor:'pointer',fontSize:11}}>{q}</button>)}</div><form onSubmit={e=>{e.preventDefault();send(draft)}} style={{display:'flex',gap:5}}><input aria-label="رسالتك" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="اكتب سؤالك..." style={{minWidth:0,flex:1,padding:9,border:'1px solid #cbd5e1',borderRadius:9}}/><button type="submit" style={{background:'#1d4ed8',color:'white',border:0,padding:'0 12px',borderRadius:9}}>إرسال</button></form><small style={{color:'#64748b'}}>لا ترسل كلمات مرور أو ملفات شخصية في الشات التجريبي.</small></div>
  </section>}
  <button onClick={()=>setOpen(v=>!v)} style={{padding:'13px 18px',background:'#123c87',color:'white',border:0,borderRadius:30,boxShadow:'0 5px 18px #0f172a55',cursor:'pointer',fontWeight:800}}>💬 {open?'إغلاق':'شات المروة'}</button>
 </div>
}
