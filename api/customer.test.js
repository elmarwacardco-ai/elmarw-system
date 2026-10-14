import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCustomerRequest } from './customer.js';

const snapshot = {
  clients: [
    {id: 1, name: 'First', phone: '01000000001', type: 'B', authUserId: 'user-1'},
    {id: 2, name: 'Second', phone: '01000000002', type: 'VIP', authUserId: 'user-2'}
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
      getUser: async token => ({data:{user: token === 'good' ? {id:'user-1'} : null}}),
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
async function invoke(db, path, method='GET', body, token='good') {
  const req = {url:path,method,body,headers:{authorization:token ? 'Bearer ' + token : ''}};
  const res = {code:200,body:null,status(code){this.code=code;return this;},
    json(body){this.body=body;return this;},end(){return this;}};
  await handleCustomerRequest(req,res,db);
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
