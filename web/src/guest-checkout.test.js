import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saveGuestDraft,loadGuestDraft,clearGuestDraft,checkoutGate,
  buildWhatsAppHelpUrl,repriceCheckoutCart,GUEST_DRAFT_KEY,GUEST_DRAFT_TTL_MS,saveGuestPdf
} from './guest-checkout.js'
const storage=()=>{const values=new Map();return {
  setItem:(key,value)=>values.set(key,value),
  getItem:key=>values.get(key)||null,
  removeItem:key=>values.delete(key)
}}
const cart=[{id:1,productId:12,subCategoryId:2,name:'كروت',image:'data:image/png;base64,secret',qty:1000,price:250,total:250}]
test('guest can shop but cannot submit an order without an authenticated token',()=>{
  assert.equal(checkoutGate({cart,pdf:{name:'file.pdf'},client:null,accessToken:null}),'auth-required')
  assert.equal(checkoutGate({cart,pdf:{name:'file.pdf'},client:{id:1},accessToken:''}),'auth-required')
  assert.equal(checkoutGate({cart,pdf:{name:'file.pdf'},client:{id:1},accessToken:'token'}),'ready')
  assert.equal(checkoutGate({cart:[],pdf:{name:'file.pdf'}}),'empty')
  assert.equal(checkoutGate({cart,pdf:null}),'pdf-required')
})
test('guest cart survives reload without saving tokens, PDF, or base64 images',()=>{
  const store=storage()
  saveGuestDraft(store,{cart,workerName:'شغل أحمد',notes:'ملاحظات',paymentMethod:'نقدي',file:'PRIVATE PDF',accessToken:'SECRET TOKEN'},1000)
  const saved=store.getItem(GUEST_DRAFT_KEY)
  assert.ok(!saved.includes('PRIVATE PDF'))
  assert.ok(!saved.includes('SECRET TOKEN'))
  assert.ok(!saved.includes('base64'))
  assert.equal(loadGuestDraft(store,1005).cart[0].productId,12)
  assert.equal(loadGuestDraft(store,1005).workerName,'شغل أحمد')
})
test('expired or invalid drafts are cleared',()=>{
  const store=storage()
  saveGuestDraft(store,{cart},1000)
  assert.equal(loadGuestDraft(store,1000+GUEST_DRAFT_TTL_MS+1),null)
  assert.equal(store.getItem(GUEST_DRAFT_KEY),null)
  store.setItem(GUEST_DRAFT_KEY,'invalid-json')
  assert.equal(loadGuestDraft(store),null)
  clearGuestDraft(store)
})
test('only a configured Egyptian WhatsApp number yields a help URL',()=>{
  assert.equal(buildWhatsAppHelpUrl(''),null)
  assert.equal(buildWhatsAppHelpUrl('0201abc'),null)
  assert.match(buildWhatsAppHelpUrl('01012345678'),/^https:\/\/wa\.me\/201012345678\?text=/)
})
test('invalid PDFs are rejected before opening IndexedDB',async()=>{
  await assert.rejects(saveGuestPdf(null,{name:'wrong.txt',size:10}),/Invalid PDF/)
  await assert.rejects(saveGuestPdf(null,{name:'oversize.pdf',size:7*1024*1024}),/Invalid PDF/)
})

test('VIP tier is re-priced after authentication; unavailable prices are flagged',()=>{
  const products=[{id:12,pricesB:{1000:250},pricesVIP:{1000:180}}]
  const b=repriceCheckoutCart(cart,products,{type:'B'})
  const vip=repriceCheckoutCart(cart,products,{type:'VIP'})
  assert.equal(b[0].total,250)
  assert.equal(vip[0].total,180)
  assert.equal(vip[0].unavailable,false)
  const unpriced=repriceCheckoutCart(cart,[{id:12,pricesB:{},pricesVIP:{}}],{type:'VIP'})
  assert.equal(unpriced[0].unavailable,true)
  assert.equal(unpriced[0].total,0)
})
