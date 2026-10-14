import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCustomerRequest } from './customer.js';

const snapshot = {
  clients: [
    {id: 1, name: 'First', phone: '01000000001', type: 'B', authUserId: 'user-1', phoneVerified:true},
    {id: 2, name: 'Second', phone: '01000000002', type: 'VIP', authUserId: 'user-2', phoneVerified:true}
  ],
  products: [
    {id: 9, name: 'Cards', subCategoryId: 3, pricesB: {'1000': 55}, pricesVIP: {'1000': 49}}
  ],
  orders: [
    {id: 1, clientId: 1, total: 55, filePath:'user-1/pdf.pdf'},
    {id: 2, clientId: 2, total: 49, filePath:'user-2/private.pdf'}
  ]
};

function fakeDb(state = snapshot) {
  let saved = null;
  const db = {
    auth: {
      getUser: async token => ({data:{user: token === 'good' ? {id:'user-1',phone:'+201000000001',phone_confirmed_at:'2026-10-14T12:00:00Z'} : null}}),
      signInWithPassword: async () => ({error:{message:'invalid password'}})
    },
    from: table => {
      if (table !== 'app_data') throw new Error('Unexpected table ' + table);
      return {select:()=>({eq:()=>({single:async()=>({data:{data:state}})})})};
    },
    storage: {from: () => ({
      upload:async()=>({error:null}), remove:async()=>({error:null}),
      createSignedUrl:async()=>({data:{signedUrl:'https://signed.example/file'}})
    })},
    rpc:async(name,args) => {
      assert.equal(name,'elmarwa_mutate');
      saved = args.p_payload;
      return {data:{...saved,id:3},error:null};
    },
    getSaved:()=>saved
  };
  return db;
}
async function invoke(db, path, method='GET', body, token='good', authFactory, captchaVerifier) {
  const req = {url:path,method,body,headers:{authorization:token ? 'Bearer ' + token : ''}};
  const res = {code:200,body:null,status(code){this.code=code;return this;},
    json(body){this.body=body;return this;},end(){return this;}};
  await handleCustomerRequest(req,res,db,authFactory,captchaVerifier);
  return res;
}

test('customer endpoints reject unauthenticated read', async () => {
  const res=await invoke(fakeDb(),'/api/customer/orders','GET',undefined,'');
  assert.equal(res.code,401);
});
test('customer only receives own orders', async () => {
  const res=await invoke(fakeDb(),'/api/customer/orders');
  assert.equal(res.code,200);
  assert.deepEqual(res.body.map(o=>o.id),[1]);
});
test('pricing and customer ID always come from trusted database', async () => {
  const db=fakeDb();
  const res=await invoke(db,'/api/customer/orders','POST',{
    items:[{productId:9,qty:1000,total:0.01,price:0.01}],
    total:0.01,clientId:2,clientName:'Second',paidAmount:5000,
    fileName:'artwork.pdf',fileData:'data:application/pdf;base64,'+Buffer.from('%PDF-1.7\n%%EOF').toString('base64')
  });
  assert.equal(res.code,201);
  assert.equal(db.getSaved().clientId,1);
  assert.equal(db.getSaved().clientName,'First');
  assert.equal(db.getSaved().total,55);
  assert.equal(db.getSaved().paidAmount,0);
  assert.equal(db.getSaved().items[0].total,55);
});
test('invalid PDF is rejected before order creation', async () => {
  const db=fakeDb();
  const res=await invoke(db,'/api/customer/orders','POST',{
    items:[{productId:9,qty:1000}], fileName:'bad.pdf',
    fileData:'data:application/pdf;base64,'+Buffer.from('not a pdf').toString('base64')
  });
  assert.equal(res.code,400);
  assert.equal(db.getSaved(),null);
});
test('unverified signup stays disabled by default', async () => {
  const old=process.env.ENABLE_CUSTOMER_SIGNUP;
  delete process.env.ENABLE_CUSTOMER_SIGNUP;
  try {
    const res=await invoke(fakeDb(),'/api/customer/register','POST',{});
    assert.equal(res.code,503);
  } finally {
    if(old===undefined) delete process.env.ENABLE_CUSTOMER_SIGNUP;
    else process.env.ENABLE_CUSTOMER_SIGNUP=old;
  }
});

test('customer cannot attach proof to another customer order', async () => {
  const db=fakeDb();
  const png='data:image/png;base64,'+Buffer.from('89504e470d0a1a0a','hex').toString('base64');
  const res=await invoke(db,'/api/customer/payment-proof/2','POST',{fileData:png});
  assert.equal(res.code,404);
  assert.equal(db.getSaved(),null);
});
test('payment proof is saved only to the authenticated customer order', async () => {
  const db=fakeDb();
  const png='data:image/png;base64,'+Buffer.from('89504e470d0a1a0a','hex').toString('base64');
  const res=await invoke(db,'/api/customer/payment-proof/1','POST',{fileData:png});
  assert.equal(res.code,200);
  assert.equal(db.getSaved().paymentProof,'صورة التحويل مرفوعة');
  assert.match(db.getSaved().paymentProofPath,/^user-1\/.+\.png$/);
});

test('signup requires CAPTCHA and starts SMS confirmation without creating client record', async () => {
  const prior=process.env.ENABLE_CUSTOMER_SIGNUP;
  process.env.ENABLE_CUSTOMER_SIGNUP='true';
  const calls=[];
  const authFactory=()=>({auth:{
    signUp:async ({phone,password,options})=>{
      calls.push({phone,password,options});
      return {data:{user:{id:'pending'}},error:null};
    }
  }});
  try {
    const db=fakeDb();
    const body={
      phone:'01099999999',pass:'test-password-4567',name:'New Customer',
      company:'Prints',address:'Cairo',
      captchaToken:'abcdefghijklmnopqrstuvwxyz'
    };
    const res=await invoke(db,'/api/customer/register','POST',body,'',authFactory,async token => token === body.captchaToken);
    assert.equal(res.code,202);
    assert.equal(res.body.verification_required,true);
    assert.equal(calls[0].phone,'+201099999999');
    assert.equal(calls[0].options.data.elmarwa_name,'New Customer');
    assert.equal(db.getSaved(),null);
  } finally {
    if(prior===undefined) delete process.env.ENABLE_CUSTOMER_SIGNUP;
    else process.env.ENABLE_CUSTOMER_SIGNUP=prior;
  }
});
test('invalid OTP never creates an account', async () => {
  const prior=process.env.ENABLE_CUSTOMER_SIGNUP;
  process.env.ENABLE_CUSTOMER_SIGNUP='true';
  const authFactory=()=>({auth:{verifyOtp:async()=>({
    data:{user:{id:'user-3',phone:'+201088888888',phone_confirmed_at:null},session:{access_token:'test'}}
  })}});
  try {
    const db=fakeDb();
    const res=await invoke(db,'/api/customer/verify','POST',{phone:'01088888888',code:'123456'},'',authFactory);
    assert.equal(res.code,401);
    assert.equal(db.getSaved(),null);
  } finally {
    if(prior===undefined) delete process.env.ENABLE_CUSTOMER_SIGNUP;
    else process.env.ENABLE_CUSTOMER_SIGNUP=prior;
  }
});
test('verified customer can sign in via normal public auth client without exposing password fields', async () => {
  const authFactory=()=>({auth:{signInWithPassword:async ({phone,password})=>{
    assert.equal(phone,'+201000000001');
    assert.equal(password,'correct-pass-12');
    return {data:{user:{id:'user-1',phone,phone_confirmed_at:'2026-10-14T12:00:00Z'},session:{access_token:'abc'}},error:null};
  }}});
  const res=await invoke(fakeDb(),'/api/customer/login','POST',{phone:'01000000001',pass:'correct-pass-12'},'',authFactory);
  assert.equal(res.code,200);
  assert.equal(res.body.client.id,1);
  assert.equal(res.body.access_token,'abc');
  assert.equal(res.body.client.pass,undefined);
});
test('signed PDF link belongs only to the signed in customer',async()=>{
  const res=await invoke(fakeDb(),'/api/customer/file/2');
  assert.equal(res.code,404);
});

test('failed CAPTCHA blocks SMS signup before touching Supabase Auth', async () => {
  const old=process.env.ENABLE_CUSTOMER_SIGNUP;
  process.env.ENABLE_CUSTOMER_SIGNUP='true';
  let signups=0;
  const authFactory=()=>({auth:{signUp:async()=>{signups++;return {error:null}}}});
  try {
    const res=await invoke(fakeDb(),'/api/customer/register','POST',{
      phone:'01099999999',pass:'safePassword456',name:'Customer',company:'A',address:'Cairo',
      captchaToken:'abcdefghijklmnopqrstuvwxyz'
    },'',authFactory,async()=>false);
    assert.equal(res.code,400);
    assert.equal(signups,0);
  } finally {
    if(old===undefined) delete process.env.ENABLE_CUSTOMER_SIGNUP;
    else process.env.ENABLE_CUSTOMER_SIGNUP=old;
  }
});
