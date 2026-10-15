// Live, read-only contract checks against one pinned, existing Vercel Preview.
// No credentials, mutation requests, secrets, or customer records are used.
import test from 'node:test';
import assert from 'node:assert/strict';

const base=process.env.ELMARWA_SMOKE_URL || '';
if (!base) throw new Error('Set ELMARWA_SMOKE_URL to a Preview deployment before running');
const origin=new URL(base);
if (origin.protocol!=='https:' || !origin.hostname.endsWith('.vercel.app')
    || origin.pathname!=='/' || origin.search || origin.hash) {
  throw new Error('Only root HTTPS Vercel preview URLs are supported');
}
async function get(path) {
  const url=new URL(path,origin);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(url,{method:'GET',redirect:'manual',signal:controller.signal,
      headers:{Accept:'application/json'}});
    const type=response.headers.get('content-type')||'';
    const body=type.includes('json')?await response.json():null;
    return {status:response.status,body,type,location:response.headers.get('location')};
  } finally {clearTimeout(timer)}
}
test('public categories load from deployed API as a JSON array',async()=>{
  const r=await get('/api/categories');
  assert.equal(r.status,200,'GET categories returned HTTP '+r.status);
  assert.ok(Array.isArray(r.body),'Expected categories JSON array');
  console.log('Live catalog: '+r.body.length+' public categories');
});
test('public products are available without exposing VIP prices',async()=>{
  const r=await get('/api/products');
  assert.equal(r.status,200,'GET products returned HTTP '+r.status);
  assert.ok(Array.isArray(r.body),'Expected products JSON array');
  for(const product of r.body){
    assert.equal(Object.hasOwn(product,'pricesVIP'),false,'VIP prices leaked in public catalog');
    assert.equal(Object.hasOwn(product,'pass'),false,'Legacy password leaked in public catalog');
  }
  console.log('Live catalog: '+r.body.length+' public products');
});
for(const path of ['/api/clients','/api/orders','/api/employees','/api/folders']){
  test(path+' rejects an unauthenticated GET',async()=>{
    const r=await get(path);
    assert.equal(r.status,401,'Private '+path+' returned HTTP '+r.status);
    assert.ok(r.body && typeof r.body.error==='string');
  });
}
test('customer orders do not leak without sign-in',async()=>{
  const r=await get('/api/customer/orders');
  assert.equal(r.status,401,'GET customer orders returned '+r.status);
});
test('unlaunched WhatsApp draft API stays disabled in Preview',async()=>{
  const r=await get('/api/whatsapp-drafts');
  assert.equal(r.status,503,'WhatsApp drafts returned '+r.status+': '+String(r.body?.error||'no JSON error').slice(0,120));
});

test('deployed website serves RTL Arabic React entry and its JS asset',async()=>{
  const home=await fetch(origin,{redirect:'manual',signal:AbortSignal.timeout(12000)})
  assert.equal(home.status,200,'Website returned HTTP '+home.status)
  assert.match(home.headers.get('content-type')||'',/text\/html/)
  const html=await home.text()
  assert.match(html,/<html[^>]+lang=["']ar["']/)
  assert.match(html,/<div id=["']root["']><\/div>/)
  const match=html.match(/<script[^>]+src=["'](\/assets\/[^"']+\.js)["']/)
  assert.ok(match,'Bundled React JavaScript asset is not linked')
  const bundle=await fetch(new URL(match[1],origin),{signal:AbortSignal.timeout(12000)})
  assert.equal(bundle.status,200,'React bundle returned HTTP '+bundle.status)
  assert.match(bundle.headers.get('content-type')||'',/javascript/)
})
test('anonymous request cannot create categories via production-style API',async()=>{
  const response=await fetch(new URL('/api/categories',origin),{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:'__SHOULD_NEVER_CREATE__'}),
    signal:AbortSignal.timeout(12000)
  })
  assert.equal(response.status,401,'Unauthenticated category write returned '+response.status)
})
