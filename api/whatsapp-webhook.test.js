import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { handleMetaWebhook, signatureValid, config } from './whatsapp-webhook.js';

const env = {
  VERCEL_ENV:'preview', ENABLE_META_WHATSAPP_WEBHOOK:'true',
  WHATSAPP_VERIFY_TOKEN:'0123456789abcdef-verify-token',
  WHATSAPP_APP_SECRET:'1234567890abcdef-app-secret',
  WHATSAPP_PHONE_NUMBER_ID:'1401384066394436',
  WHATSAPP_WABA_ID:'2181900219416283',
  WHATSAPP_TEST_RECIPIENT:'201010453811',
  WHATSAPP_AUTO_REPLY:'false'
};
function call(method, url, body = '', headers = {}, options = {}) {
  const raw = Buffer.from(body);
  const req = Readable.from([raw]);
  Object.assign(req, {method, url, headers});
  const res = {statusCode:200, headers:{}, body:null,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(k){this.statusCode=k;return this;},
    send(b){this.body=b;return this;},
    json(b){this.body=b;return this;}
  };
  return handleMetaWebhook(req,res,{env,...options}).then(()=>res);
}
function signed(payload) {
  const bytes=JSON.stringify(payload);
  const signature='sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(bytes).digest('hex');
  return {bytes, signature};
}
const event=(id='wamid.ABCDEFG1234', phone='201010453811')=>({
  object:'whatsapp_business_account',
  entry:[{id:env.WHATSAPP_WABA_ID,changes:[{field:'messages',value:{
    metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},
    messages:[{id,from:phone,type:'text',text:{body:'مرحبا'}}]
  }}]}]
});
test('isolated Vercel function disables body parser only for webhook',()=>{
  assert.equal(config.api.bodyParser,false);
});
test('Meta GET challenge succeeds with exact verify token',async()=>{
  const url='/api/whatsapp-webhook?hub.mode=subscribe&hub.verify_token='+env.WHATSAPP_VERIFY_TOKEN+'&hub.challenge=CHALLENGE42';
  assert.equal((await call('GET',url)).body,'CHALLENGE42');
  assert.equal((await call('GET',url.replace('CHALLENGE42','CHALLENGE42').replace(env.WHATSAPP_VERIFY_TOKEN,'bad'))).statusCode,403);
});
test('POST requires Preview and explicit enable flag',async()=>{
  const {bytes,signature}=signed(event());
  const r=await call('POST','/api/whatsapp-webhook',bytes,{'x-hub-signature-256':signature},
    {env:{...env,VERCEL_ENV:'production'},dbFactory:()=>{throw Error('should not be called')}});
  assert.equal(r.statusCode,503);
});
test('rejects untrusted signatures before any database reads',async()=>{
  let touched=false;
  const {bytes}=signed(event());
  const result=await call('POST','/api/whatsapp-webhook',bytes,{'x-hub-signature-256':'sha256='+'f'.repeat(64)},
    {dbFactory:()=>{touched=true;return {};}});
  assert.equal(result.statusCode,403);
  assert.equal(touched,false);
  assert.equal(signatureValid(Buffer.from(bytes),'sha256='+'f'.repeat(64),env.WHATSAPP_APP_SECRET),false);
});
test('stores authenticated message once and handles Meta retries',async()=>{
  const seen=new Set(), records=[];
  const db={from(name){assert.equal(name,'whatsapp_inbox');return {async insert(record){
    if(seen.has(record.message_id))return {error:{code:'23505'}};
    seen.add(record.message_id);records.push(record);return {error:null};
  }}}};
  const {bytes,signature}=signed(event());
  for(let i=0;i<2;i++){
    const r=await call('POST','/api/whatsapp-webhook',bytes,{'x-hub-signature-256':signature},{dbFactory:()=>db});
    assert.equal(r.statusCode,200);
  }
  assert.equal(records.length,1);
  assert.equal(records[0].sender_phone,env.WHATSAPP_TEST_RECIPIENT);
});
test('ignores unknown recipients without querying database',async()=>{
  const {bytes,signature}=signed(event('wamid.ABCDEFG12345','201999999999'));
  const r=await call('POST','/api/whatsapp-webhook',bytes,{'x-hub-signature-256':signature},
    {dbFactory:()=>{throw Error('not expected')}});
  assert.equal(r.statusCode,200);
});
