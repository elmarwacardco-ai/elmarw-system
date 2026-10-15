import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWhatsAppDrafts } from '../lib/whatsapp-drafts.js';

const actor='10000000-0000-4000-8000-000000000001';
const draftId='20000000-0000-4000-8000-000000000001';
const pdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.7\n%%EOF').toString('base64');
function fixture({role=true,verified=true,failInsert=false}={}) {
  const state={drafts:[],uploads:[],removed:[],rpc:[]};
  const db={
    auth:{getUser:async t=>({data:{user:t==='good'?{id:actor}:null},error:null})},
    from(name) {
      if(name==='admin_users')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:role?{user_id:actor}:null,error:null})})})};
      if(name==='app_data')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{data:{
        clients:[{id:1,name:'Client',phone:'01012345678',authUserId:'uuid',phoneVerified:verified}],
        products:[{id:2,name:'Cards',pricesB:{1000:50}}]
      }},error:null})})})};
      if(name==='whatsapp_drafts')return {
        select:()=>({order:()=>({limit:async()=>({data:state.drafts,error:null})}),
          eq:()=>({maybeSingle:async()=>({data:state.drafts[0]||null,error:null})})}),
        insert:entry=>({select:()=>({single:async()=>{
          if(failInsert)return {data:null,error:{message:'DB unavailable'}};
          const draft={...entry,id:draftId,created_at:new Date().toISOString()};
          state.drafts.push(draft);return {data:draft,error:null};
        }})})
      };
      throw Error('unexpected table '+name);
    },
    storage:{from:()=>({
      upload:async path=>{state.uploads.push(path);return {error:null}},
      remove:async paths=>{state.removed.push(...paths);return {error:null}}
    })},
    rpc:async(name,args)=>{
      assert.equal(name,'elmarwa_whatsapp_transition');
      state.rpc.push(args);
      return {data:args.p_action==='approve'?{
        draft:{status:'approved',official_order_id:42},
        order:{id:42,serialNumber:'M-2610-000042'}
      }:{id:draftId,status:'draft',lock_owner:actor},error:null};
    }
  };
  return {db,state};
}
async function request(db,method='GET',path='/api/whatsapp-drafts',body=null,token='good') {
  const req={method,url:path,body,headers:token?{authorization:'Bearer '+token}:{}};
  const res={statusCode:200,body:null,setHeader(){return this;},
    status(code){this.statusCode=code;return this;},
    json(data){this.body=data;return this;},end(){return this;}};
  await handleWhatsAppDrafts(req,res,db);
  return res;
}
async function enabled(fn) {
  const prev=process.env.ENABLE_WHATSAPP_DRAFTS;
  process.env.ENABLE_WHATSAPP_DRAFTS='true';
  try {return await fn()} finally {
    if(prev===undefined)delete process.env.ENABLE_WHATSAPP_DRAFTS;
    else process.env.ENABLE_WHATSAPP_DRAFTS=prev;
  }
}
test('drafts disabled by default',async()=>{
  const prev=process.env.ENABLE_WHATSAPP_DRAFTS;
  delete process.env.ENABLE_WHATSAPP_DRAFTS;
  try {assert.equal((await request(fixture().db)).statusCode,503)}
  finally {if(prev===undefined)delete process.env.ENABLE_WHATSAPP_DRAFTS;
    else process.env.ENABLE_WHATSAPP_DRAFTS=prev}
});
test('only authenticated administrators may access drafts',()=>enabled(async()=>{
  assert.equal((await request(fixture().db,'GET','/api/whatsapp-drafts',null,'')).statusCode,401);
  assert.equal((await request(fixture({role:false}).db)).statusCode,403);
  assert.equal((await request(fixture().db)).statusCode,200);
}));
test('rejects unverified client and invalid PDF before storage',()=>enabled(async()=>{
  const body={clientId:1,workerName:'Job',items:[{productId:2,qty:1000}],
    fileName:'art.pdf',fileData:pdf};
  const a=fixture({verified:false});
  assert.equal((await request(a.db,'POST','/api/whatsapp-drafts',body)).statusCode,400);
  assert.equal(a.state.uploads.length,0);
  const b=fixture();
  assert.equal((await request(b.db,'POST','/api/whatsapp-drafts',{...body,fileData:'invalid'})).statusCode,400);
  assert.equal(b.state.uploads.length,0);
}));
test('sanitizes product prices; cleans up PDF after failed insert',()=>enabled(async()=>{
  const body={clientId:1,workerName:'Job',
    items:[{productId:2,qty:1000,price:0.01}],fileName:'art.pdf',fileData:pdf};
  const a=fixture();
  const response=await request(a.db,'POST','/api/whatsapp-drafts',body);
  assert.equal(response.statusCode,201);
  assert.equal(a.state.drafts[0].items[0].price,undefined);
  assert.equal(a.state.uploads.length,1);
  const b=fixture({failInsert:true});
  assert.equal((await request(b.db,'POST','/api/whatsapp-drafts',body)).statusCode,500);
  assert.deepEqual(b.state.removed,b.state.uploads);
}));
test('claim and approval use database RPC with server verified actor',()=>enabled(async()=>{
  const a=fixture();
  const claim=await request(a.db,'POST','/api/whatsapp-drafts/'+draftId+'/claim',{p_actor:'attacker'});
  assert.equal(claim.statusCode,200);
  assert.equal(a.state.rpc[0].p_actor,actor);
  const approval=await request(a.db,'POST','/api/whatsapp-drafts/'+draftId+'/approve');
  assert.equal(approval.statusCode,200);
  assert.equal(approval.body.order.id,42);
  assert.equal(a.state.rpc[1].p_action,'approve');
}));
test('unknown actions and malformed IDs are rejected',()=>enabled(async()=>{
  const a=fixture();
  assert.equal((await request(a.db,'POST','/api/whatsapp-drafts/bad/claim')).statusCode,404);
  assert.equal((await request(a.db,'POST','/api/whatsapp-drafts/'+draftId+'/delete')).statusCode,404);
  assert.equal(a.state.rpc.length,0);
}));
