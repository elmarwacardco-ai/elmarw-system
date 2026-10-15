import React, { useCallback, useEffect, useState } from 'react'
import { clientWhatsAppUrl } from './whatsapp.js'

const API='/api/whatsapp-drafts'
const btn={border:0,borderRadius:10,padding:'9px 14px',fontWeight:800,cursor:'pointer'}
const input={border:'1px solid #dbe3ef',borderRadius:9,padding:'10px 12px',width:'100%',fontSize:13}
const notice={background:'#fff8e1',padding:10,border:'1px solid #f9d978',borderRadius:10,fontSize:12}
const asDate=s=>s?String(s).slice(0,10):''
function readData(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>resolve(reader.result)
    reader.onerror=()=>reject(new Error('تعذر قراءة الملف'))
    reader.readAsDataURL(file)
  })
}
function DraftCard({draft,busy,onAction,onPdf,onFile}) {
  const [readyDate,setReadyDate]=useState(asDate(draft.ready_date))
  const [corrected,setCorrected]=useState(null)
  useEffect(()=>setReadyDate(asDate(draft.ready_date)),[draft.ready_date])
  const openChat=clientWhatsAppUrl(draft.clientPhone)
  const approved=draft.status==='approved'
  const versions=Array.isArray(draft.file_versions)?draft.file_versions:[]
  return (
    <article style={{border:'1px solid #dbe3ef',borderRight:'5px solid #2563eb',borderRadius:14,padding:15,background:'white',marginBottom:12}}>
      <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',gap:10,marginBottom:12}}>
        <div>
          <strong style={{fontSize:15}}>📄 {draft.worker_name}</strong>
          <div style={{fontSize:12,color:'#64748b'}}>العميل: {draft.clientName} — {draft.clientPhone}</div>
        </div>
        <div style={{fontSize:12,fontWeight:800,color:draft.needsConfirmation?'#b91c1c':'#1e40af'}}>
          {approved?'✅ أوردر رسمي #'+draft.official_order_id:'📝 مسودة مراجعة'}
          {draft.needsConfirmation && <div style={{color:'#b91c1c'}}>⏰ مرّ 10 دقائق ولم يُسجَّل إرسال التأكيد</div>}
        </div>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>
        {openChat&&<a href={openChat} target="_blank" rel="noopener noreferrer"
          style={{...btn,background:'#dcfce7',color:'#166534',textDecoration:'none'}}>💬 تواصل واتساب يدويًا</a>}
        {!approved&&<button disabled={busy} style={{...btn,background:'#e0e7ff',color:'#1e3a8a'}}
          onClick={()=>onAction(draft.id,'claim')}>🔒 بدء / تجديد المراجعة</button>}
        {!approved&&<button disabled={busy} style={{...btn,background:'#e2e8f0',color:'#334155'}}
          onClick={()=>onAction(draft.id,'heartbeat')}>♻️ تمديد الحجز</button>}
      </div>
      <div style={{fontSize:12,marginBottom:10}}>
        <b>ملفات PDF (كل النسخ محفوظة):</b>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:6}}>
          {versions.map(v=><button key={v.version} disabled={busy}
            onClick={()=>onPdf(draft.id,v.version)}
            style={{...btn,background:v.path===draft.approved_file_path?'#dbeafe':'#f1f5f9',
              color:'#1d4ed8',fontSize:11}}>
            📎 نسخة {v.version}{v.path===draft.approved_file_path?' • نسخة التنفيذ':''}
          </button>)}
        </div>
      </div>
      {!approved&&<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}>
          <div><label style={{fontSize:12,fontWeight:800}}>موعد التسليم</label>
            <input type="date" style={input} value={readyDate} onChange={e=>setReadyDate(e.target.value)}/>
            <button disabled={busy||!readyDate} style={{...btn,background:'#e0e7ff',color:'#1d4ed8',marginTop:6}}
              onClick={()=>onAction(draft.id,'ready-date',{readyDate})}>حفظ الموعد</button>
          </div>
          <div><label style={{fontSize:12,fontWeight:800}}>رفع PDF مصحح (بدون حذف القديم)</label>
            <input type="file" accept="application/pdf,.pdf" style={{...input,padding:6}}
              onChange={e=>setCorrected(e.target.files?.[0]||null)}/>
            <button disabled={busy||!corrected} style={{...btn,background:'#e0e7ff',color:'#1d4ed8',marginTop:6}}
              onClick={async()=>{await onFile(draft.id,corrected);setCorrected(null)}}>رفع نسخة جديدة</button>
          </div>
        </div>
        <button disabled={busy||!draft.ready_date||!versions.length}
          style={{...btn,background:'#166534',color:'white',marginTop:12}}
          onClick={()=>onAction(draft.id,'approve')}>✅ اعتماد المسودة وإصدار سيريال رسمي</button>
      </>}
      {approved&&!draft.confirmation_sent_at&&<button disabled={busy}
        onClick={()=>onAction(draft.id,'confirmed')}
        style={{...btn,background:'#0f172a',color:'white'}}>✅ الموظف أرسل تأكيد الأوردر يدويًا</button>}
      {approved&&draft.confirmation_sent_at&&<div style={{fontSize:12,color:'#166534'}}>تم تسجيل إرسال التأكيد: {new Date(draft.confirmation_sent_at).toLocaleString('ar-EG')}</div>}
      <div style={{marginTop:10,fontSize:10,color:'#64748b'}}>رقم المسودة: {draft.id}</div>
    </article>
  )
}
export default function WhatsAppDrafts({apiFetch,clients,products,onApproved}) {
  const [drafts,setDrafts]=useState([])
  const [loadError,setLoadError]=useState('')
  const [busy,setBusy]=useState(false)
  const [clientId,setClientId]=useState('')
  const [productId,setProductId]=useState('')
  const [qty,setQty]=useState('1000')
  const [workerName,setWorkerName]=useState('')
  const [notes,setNotes]=useState('')
  const [file,setFile]=useState(null)
  const refresh=useCallback(async()=>{
    try {
      const response=await apiFetch(API)
      const result=await response.json()
      setDrafts(Array.isArray(result)?result:[])
      setLoadError('')
    }catch(err){setLoadError(err.message)}
  },[apiFetch])
  useEffect(()=>{
    refresh()
    const timer=setInterval(refresh,60*1000)
    return()=>clearInterval(timer)
  },[refresh])
  async function call(action) {
    setBusy(true)
    try {await action();await refresh()}
    catch(err){alert('تعذر إتمام العملية: '+err.message)}
    finally{setBusy(false)}
  }
  const onAction=(id,action,body)=>call(async()=>{
    await apiFetch(API+'/'+id+'/'+action,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body||{})
    })
    if(action==='approve') await onApproved()
  })
  const onFile=(id,selected)=>call(async()=>{
    if(!selected || !/\.pdf$/i.test(selected.name)||selected.size>2*1024*1024){
      throw new Error('اختار PDF أقل من 2 ميجابايت')
    }
    await apiFetch(API+'/'+id+'/pdf-version',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fileName:selected.name,fileData:await readData(selected)})
    })
  })
  const onPdf=(id,version)=>call(async()=>{
    // Open the tab inside the user gesture, before the async signed-link lookup.
    const tab=window.open('about:blank','_blank')
    try {
      const response=await apiFetch(API+'/'+id+'/file/'+version)
      const result=await response.json()
      if(!result.url)throw new Error('الرابط غير متاح')
      if(tab)tab.location.replace(result.url)
      else window.location.assign(result.url)
    } catch(err) {
      if(tab)tab.close()
      throw err
    }
  })
  const onCreate=()=>call(async()=>{
    if(!clientId||!productId||!workerName.trim()||!file)throw new Error('أكمل بيانات المسودة وارفع PDF')
    if(!/\.pdf$/i.test(file.name)||file.size>2*1024*1024)throw new Error('ملف PDF لازم يكون أقل من 2 ميجابايت')
    await apiFetch(API,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({clientId:Number(clientId),workerName:workerName.trim(),notes,
        items:[{productId:Number(productId),qty:Number(qty)}],
        fileName:file.name,fileData:await readData(file)})
    })
    setWorkerName('');setNotes('');setFile(null)
  })
  const verified=clients.filter(c=>c.authUserId&&c.phoneVerified===true)
  const overdue=drafts.filter(d=>d.needsConfirmation).length
  return (
    <div dir="rtl" style={{color:'#0f172a'}}>
      <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:10,alignItems:'center'}}>
        <h2 style={{margin:0}}>💬 مسودات واتساب – مراجعة الموظف</h2>
        <button onClick={refresh} style={{...btn,background:'#e0e7ff',color:'#1e40af'}}>🔄 تحديث</button>
      </div>
      <p style={{...notice}}>نسخة معاينة إدارية فقط. استقبال رسائل واتساب الحقيقي لسه غير متصل. لا يتم إنشاء أوردر أو سيريال قبل اعتماد المسودة، ولا يتم إرسال أي رسائل تلقائيًا.</p>
      {overdue>0&&<p role="alert" style={{...notice,background:'#fef2f2',borderColor:'#fecaca',color:'#991b1b'}}>⏰ يوجد {overdue} أوردر معتمد لم يتم تسجيل إرسال تأكيده خلال 10 دقائق.</p>}
      {loadError&&<p role="alert" style={{...notice,color:'#991b1b'}}>تعذر تحميل المسودات: {loadError}</p>}
      <div style={{background:'white',padding:15,borderRadius:14,marginBottom:16,border:'1px solid #e2e8f0'}}>
        <h3 style={{margin:'0 0 10px'}}>🧪 إنشاء مسودة تجريبية من الإدارة</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>
          <select style={input} value={clientId} onChange={e=>setClientId(e.target.value)}>
            <option value="">عميل موثّق</option>
            {verified.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={input} value={productId} onChange={e=>setProductId(e.target.value)}>
            <option value="">المنتج</option>
            {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select style={input} value={qty} onChange={e=>setQty(e.target.value)}>
            {[1000,2000,3000,4000,5000,6000,7000,8000,9000,10000].map(q=><option value={q} key={q}>{q}</option>)}
          </select>
          <input style={input} value={workerName} placeholder="اسم الشغل" onChange={e=>setWorkerName(e.target.value)}/>
          <input style={input} value={notes} placeholder="ملاحظات" onChange={e=>setNotes(e.target.value)}/>
          <input style={input} type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/>
        </div>
        {verified.length===0&&<p style={{fontSize:12,color:'#92400e'}}>لا يوجد عميل موثق متاح حاليًا؛ التسجيل العام ما زال مغلقًا لحين استكمال SMS والتحقق.</p>}
        <button disabled={busy||verified.length===0} onClick={onCreate}
          style={{...btn,background:'#1d4ed8',color:'white',marginTop:10}}>إضافة مسودة للتجربة فقط</button>
      </div>
      <h3>المسودات ({drafts.length})</h3>
      {drafts.map(d=><DraftCard key={d.id} draft={d} busy={busy} onAction={onAction}
        onPdf={onPdf} onFile={onFile}/>)}
      {!drafts.length&&!loadError&&<div style={{padding:24,textAlign:'center',background:'white',borderRadius:12}}>لا توجد مسودات واتساب محفوظة</div>}
    </div>
  )
}
