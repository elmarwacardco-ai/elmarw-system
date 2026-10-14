import React from 'react'

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0
const amount = n => `${n.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج`
const dateOf = order => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(order.executionDate || ''))) return order.executionDate
  const n = Number(order.createdAt || 0)
  return n ? new Date(n).toISOString().slice(0,10) : ''
}
function saveCsv(rows) {
  const headers = ['السيريال','العميل','التاريخ','الحالة','طريقة الدفع','الإجمالي','المدفوع','المتبقي']
  const quote = value => `"${String(value ?? '').replaceAll('"','""')}"`
  const lines = [headers, ...rows.map(o=>[o.serialNumber || o.id, o.clientName || '',dateOf(o),o.status || '',o.paymentMethod || '',number(o.total),number(o.paidAmount),Math.max(0,number(o.total)-number(o.paidAmount))])]
  const blob = new Blob(['\ufeff'+lines.map(line=>line.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download='marwa-accounting-report.csv'; a.click(); URL.revokeObjectURL(url)
}
export default function AccountingReport({orders,from,to,status,payment,setFrom,setTo,setStatus,setPayment,statuses,payments}) {
  const list = orders.filter(o => {
    const d=dateOf(o)
    return (!from || (d && d>=from)) && (!to || (d && d<=to)) && (status==='الكل'||o.status===status) && (payment==='الكل'||(o.paymentMethod || 'نقدي')===payment)
  })
  // Exclude canceled orders from financial totals but show them in the filtered list.
  const included=list.filter(o=>o.status!=='ملغي')
  const total=included.reduce((s,o)=>s+number(o.total),0)
  const collected=included.reduce((s,o)=>s+number(o.paidAmount),0)
  const remaining=included.reduce((s,o)=>s+Math.max(0,number(o.total)-number(o.paidAmount)),0)
  const card=(title,value)=> <div style={{background:'white',padding:18,borderRadius:14,border:'1px solid #dbeafe',boxShadow:'0 4px 15px #0f172a08'}}><div style={{color:'#64748b',fontSize:13}}>{title}</div><strong style={{fontSize:24,color:'#0f2d5c'}}>{value}</strong></div>
  const field={padding:10,borderRadius:9,border:'1px solid #cbd5e1',background:'#fff',minWidth:145}
  return <section dir="rtl" style={{color:'#0f172a'}}>
    <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><h2 style={{marginBottom:4}}>📈 التقرير الحسابي الشامل</h2><p style={{color:'#64748b',margin:0}}>مستخلص من الأوردرات المحمّلة حاليًا — ليس دفتر قيود مصرفية</p></div><button onClick={()=>saveCsv(list)} style={{padding:'11px 18px',background:'#164bb3',border:0,borderRadius:9,color:'#fff',cursor:'pointer'}}>⬇ تصدير CSV</button></header>
    <div style={{display:'flex',flexWrap:'wrap',gap:10,background:'#edf4ff',padding:14,borderRadius:12,margin:'18px 0'}}>
      <label>من <input aria-label="من تاريخ" type="date" value={from} onChange={e=>setFrom(e.target.value)} style={field}/></label>
      <label>إلى <input aria-label="إلى تاريخ" type="date" value={to} onChange={e=>setTo(e.target.value)} style={field}/></label>
      <label>الحالة <select value={status} onChange={e=>setStatus(e.target.value)} style={field}>{['الكل',...statuses].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>الدفع <select value={payment} onChange={e=>setPayment(e.target.value)} style={field}>{['الكل',...payments].map(v=><option key={v}>{v}</option>)}</select></label>
      <button onClick={()=>{setFrom('');setTo('');setStatus('الكل');setPayment('الكل')}} style={{...field,cursor:'pointer'}}>مسح الفلاتر</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:12}}>{card('عدد الطلبات',list.length)}{card('إجمالي غير الملغي',amount(total))}{card('المبالغ المسجلة كمدفوعة',amount(collected))}{card('المتبقي',amount(remaining))}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:15,marginTop:18}}>
      <div style={{background:'white',borderRadius:12,padding:15}}><h3>الطلبات حسب الحالة</h3>{statuses.map(v=><div key={v} style={{display:'flex',justifyContent:'space-between',padding:7,borderBottom:'1px solid #eee'}}><span>{v}</span><b>{list.filter(o=>o.status===v).length}</b></div>)}</div>
      <div style={{background:'white',borderRadius:12,padding:15}}><h3>التحصيل حسب طريقة الدفع</h3>{payments.map(v=><div key={v} style={{display:'flex',justifyContent:'space-between',padding:7,borderBottom:'1px solid #eee'}}><span>{v}</span><b>{amount(included.filter(o=>(o.paymentMethod || 'نقدي')===v).reduce((s,o)=>s+number(o.paidAmount),0))}</b></div>)}</div>
    </div>
    <div style={{overflowX:'auto',background:'white',borderRadius:12,marginTop:18,padding:12}}><h3>تفاصيل الأوردرات</h3><table style={{width:'100%',borderCollapse:'collapse',minWidth:780,textAlign:'right'}}><thead><tr style={{background:'#0f2d5c',color:'white'}}>{['السيريال','العميل','التاريخ','الحالة','طريقة الدفع','الإجمالي','المدفوع','المتبقي'].map(v=><th key={v} style={{padding:10}}>{v}</th>)}</tr></thead><tbody>{list.map(o=><tr key={o.id||o.serialNumber} style={{borderBottom:'1px solid #e5e7eb'}}>{[o.serialNumber||o.id,o.clientName,dateOf(o),o.status,o.paymentMethod,amount(number(o.total)),amount(number(o.paidAmount)),amount(Math.max(0,number(o.total)-number(o.paidAmount)))].map((v,i)=><td key={i} style={{padding:9}}>{v}</td>)}</tr>)}</tbody></table>{!list.length&&<p style={{textAlign:'center',color:'#64748b'}}>لا توجد طلبات مطابقة للفلتر</p>}</div>
    <small style={{color:'#64748b',display:'block',marginTop:10}}>تنبيه: المدفوع محسوب من قيمة paidAmount المسجلة على الأوردر، وليس من تاريخ حركة الدفع. الطلبات الملغية لا تدخل في الإجماليات، وقد تحتاج تسويات مستقلة.</small>
  </section>
}
