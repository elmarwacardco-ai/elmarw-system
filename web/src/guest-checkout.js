// Anonymous checkout draft. Tokens and PDF bytes must never enter sessionStorage.
export const GUEST_DRAFT_KEY = 'elmarwa_guest_checkout_v1'
export const GUEST_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const DB_NAME = 'elmarwa-guest-pdf-v1'
const STORE = 'pdf'
const MAX_FILE_BYTES = 6 * 1024 * 1024
const PAYMENT_METHODS = new Set(['نقدي', 'فودافون كاش'])

export function checkoutGate({cart, pdf, client, accessToken}) {
  if (!Array.isArray(cart) || !cart.length) return 'empty'
  if (!pdf) return 'pdf-required'
  return client && typeof accessToken === 'string' && accessToken.length > 0
    ? 'ready' : 'auth-required'
}
function normalizeCart(cart) {
  if (!Array.isArray(cart) || cart.length > 100) return []
  return cart.filter(item => item &&
    Number.isSafeInteger(Number(item.productId)) && Number(item.productId)>0 &&
    Number.isSafeInteger(Number(item.qty)) && Number(item.qty)>0 &&
    Number.isFinite(Number(item.price)) && Number(item.price)>0).map(item => ({
      id: Number(item.id) || Date.now(),
      productId: Number(item.productId),
      subCategoryId: Number(item.subCategoryId)||null,
      name: String(item.name||'').slice(0,180),
      image: /^https?:\/\//i.test(String(item.image||'')) ? String(item.image).slice(0,512) : '',
      qty: Number(item.qty),
      price: Number(item.price),
      total: Number(item.price)
    }))
}
export function saveGuestDraft(storage, draft, now=Date.now()) {
  const cart=normalizeCart(draft.cart)
  if (!cart.length) { clearGuestDraft(storage); return }
  storage.setItem(GUEST_DRAFT_KEY, JSON.stringify({
    version:1, expiresAt:now + GUEST_DRAFT_TTL_MS,
    cart, workerName:String(draft.workerName||'').slice(0,120),
    notes:String(draft.notes||'').slice(0,2000),
    paymentMethod:PAYMENT_METHODS.has(draft.paymentMethod)?draft.paymentMethod:'نقدي'
  }))
}
export function loadGuestDraft(storage, now=Date.now()) {
  try {
    const raw=storage.getItem(GUEST_DRAFT_KEY)
    if (!raw) return null
    const d=JSON.parse(raw)
    if (d.version !== 1 || !Number.isFinite(d.expiresAt) || d.expiresAt<now ||
      d.expiresAt>now+GUEST_DRAFT_TTL_MS || !Array.isArray(d.cart)) {
      clearGuestDraft(storage); return null
    }
    const cart=normalizeCart(d.cart)
    return cart.length ? {
      cart,workerName:String(d.workerName||'').slice(0,120),
      notes:String(d.notes||'').slice(0,2000),
      paymentMethod:PAYMENT_METHODS.has(d.paymentMethod)?d.paymentMethod:'نقدي'
    }:null
  } catch { clearGuestDraft(storage);return null }
}
export function clearGuestDraft(storage) {
  try { storage.removeItem(GUEST_DRAFT_KEY) } catch {}
}
export function buildWhatsAppHelpUrl(number) {
  const digits=String(number||'').replace(/[^\d]/g,'')
  const formatted=/^01\d{9}$/.test(digits) ? '2'+digits : digits
  if (!/^201\d{9}$/.test(formatted)) return null
  const text='أهلاً، عايز مساعدة في تفعيل حسابي بموقع المروة لإكمال طلب الطباعة.'
  return 'https://wa.me/'+formatted+'?text='+encodeURIComponent(text)
}
function openPdfStore(indexedDb) {
  if (!indexedDb || typeof indexedDb.open!=='function') return Promise.reject(new Error('IndexedDB unavailable'))
  return new Promise((resolve,reject) => {
    const req=indexedDb.open(DB_NAME,1)
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'})}
    req.onsuccess=()=>resolve(req.result)
    req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'))
    req.onblocked=()=>reject(new Error('IndexedDB blocked'))
  })
}
async function transact(indexedDb, mode, handler) {
  const db=await openPdfStore(indexedDb)
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode)
    let value; let failure
    try {handler(tx.objectStore(STORE),next=>{value=next})}
    catch(e){failure=e;tx.abort()}
    tx.oncomplete=()=>{db.close();resolve(value)}
    tx.onabort=()=>{db.close();reject(failure||tx.error||new Error('IndexedDB transaction failed'))}
  })
}
export async function saveGuestPdf(indexedDb,file,now=Date.now()) {
  if (!file || typeof file.name!=='string' || !/\.pdf$/i.test(file.name) ||
    !Number.isSafeInteger(file.size) || file.size===0 || file.size>MAX_FILE_BYTES)
    throw new Error('Invalid PDF for local draft')
  await transact(indexedDb,'readwrite',store=>store.put({
    id:'current', pdf:file, name:file.name.slice(0,180),
    lastModified:Number(file.lastModified)||now, expiresAt:now+GUEST_DRAFT_TTL_MS
  }))
}
export async function loadGuestPdf(indexedDb,now=Date.now()) {
  const record=await transact(indexedDb,'readonly',(store,setValue)=>{
    const req=store.get('current')
    req.onsuccess=()=>setValue(req.result||null)
  })
  if (!record || !record.pdf) return null
  if (typeof record.expiresAt!=='number' || now>record.expiresAt) {
    await clearGuestPdf(indexedDb);return null
  }
  return new File([record.pdf],record.name,{type:'application/pdf',lastModified:record.lastModified})
}
export async function clearGuestPdf(indexedDb) {
  await transact(indexedDb,'readwrite',store=>store.delete('current'))
}
