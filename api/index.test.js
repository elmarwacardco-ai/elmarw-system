import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApiRequest } from './index.js';

function fakeDatabase() {
  const data = {
    clients: [{id: 1, name:'Test client', phone:'01000000001', pass:'legacy-secret'}],
    categories: [{id: 1, name:'Existing category'}],
    subCategories: [{id: 1, name:'Sub', categoryId: 1}],
    products: [{id: 1, name:'Cards', pricesB:{1000:50}, pricesVIP:{1000:40}}],
    orders: [], employees: [], folders: []
  };
  const db = {
    auth: {
      getUser: async token => ({
        data:{user: token === 'admin' ? {id:'admin-user'} : token === 'viewer' ? {id:'viewer-user'} : null},
        error:null
      })
    },
    from: table => ({
      select: () => ({
        eq: (_column, id) => ({
          maybeSingle: async () => table === 'app_data'
            ? {data:{data},error:null}
            : {data:table === 'admin_users' && id === 'admin-user' ? {user_id:id} : null,error:null}
        })
      })
    }),
    rpc: async (_method, args) => {
      if (_method !== 'elmarwa_mutate') throw new Error('Unexpected RPC');
      const key = args.p_resource === 'subcategories' ? 'subCategories' : args.p_resource;
      const array = data[key];
      if (!array) return {data:null,error:{message:'Unknown collection'}};
      const id = args.p_id;
      if (args.p_method === 'POST') {
        const nextId = Math.max(0,...array.map(row => Number(row.id))) + 1;
        const created = {...args.p_payload,id:nextId};
        array.push(created);
        return {data:created,error:null};
      }
      const index = array.findIndex(row => Number(row.id) === Number(id));
      if (index < 0) return {data:null,error:{code:'P0002'}};
      if (args.p_method === 'DELETE') {
        array.splice(index,1);
        return {data:{success:true},error:null};
      }
      const changed={...array[index],...args.p_payload,id:array[index].id};
      array[index]=changed;
      return {data:changed,error:null};
    }
  };
  return db;
}

async function request(db,url,method='GET',body=null,token=null) {
  const req={url,method,body,headers:token?{authorization:'Bearer '+token}:{}};
  const res={
    statusCode:200,body:null,
    setHeader(){return this},
    status(code){this.statusCode=code;return this},
    json(value){this.body=value;return this},
    end(){return this}
  };
  await handleApiRequest(req,res,()=>db);
  return {status:res.statusCode,body:res.body};
}

test('public products expose B pricing, never VIP pricing or client lists',async()=>{
  const db=fakeDatabase();
  const products=await request(db,'/api/products');
  assert.equal(products.status,200);
  assert.deepEqual(products.body[0].pricesB,{1000:50});
  assert.equal('pricesVIP' in products.body[0],false);
  const clients=await request(db,'/api/clients');
  assert.equal(clients.status,401);
  const write=await request(db,'/api/categories','POST',{name:'Unauthorized'});
  assert.equal(write.status,401);
});

test('a valid but non-admin identity is denied writes',async()=>{
  const result=await request(fakeDatabase(),'/api/products','POST',{name:'Not allowed'},'viewer');
  assert.equal(result.status,403);
});

test('admin create, read, edit and delete use persistent resource state',async()=>{
  const db=fakeDatabase();
  const created=await request(db,'/api/categories','POST',{name:'New category'},'admin');
  assert.equal(created.status,201);
  assert.equal(created.body.name,'New category');
  const id=created.body.id;
  const reloaded=await request(db,'/api/categories','GET',null,'admin');
  assert.equal(reloaded.body.some(x=>x.id===id),true);
  const changed=await request(db,`/api/categories/${id}`,'PUT',{name:'Renamed category'},'admin');
  assert.equal(changed.status,200);
  assert.equal(changed.body.name,'Renamed category');
  const deleted=await request(db,`/api/categories/${id}`,'DELETE',null,'admin');
  assert.equal(deleted.status,200);
  assert.deepEqual(deleted.body,{success:true});
  const last=await request(db,'/api/categories','GET',null,'admin');
  assert.equal(last.body.some(x=>x.id===id),false);
});

test('admin CRUD correctly uses legacy subCategories key',async()=>{
  const db=fakeDatabase();
  const created=await request(db,'/api/subcategories','POST',{name:'Art',categoryId:1},'admin');
  assert.equal(created.status,201);
  const listed=await request(db,'/api/subcategories','GET',null,'admin');
  assert.equal(listed.body.some(x=>x.name==='Art'),true);
});

test('admin responses omit legacy customer passwords',async()=>{
  const res=await request(fakeDatabase(),'/api/clients','GET',null,'admin');
  assert.equal(res.status,200);
  assert.equal(res.body[0].pass,undefined);
  assert.equal(res.body[0].phone,'01000000001');
});

test('invalid input cannot create a blank-name product',async()=>{
  const db=fakeDatabase();
  const before=await request(db,'/api/products','GET',null,'admin');
  const failed=await request(db,'/api/products','POST',{name:'   '},'admin');
  assert.equal(failed.status,400);
  const after=await request(db,'/api/products','GET',null,'admin');
  assert.equal(after.body.length,before.body.length);
});

test('disabled WhatsApp drafts answer 503 before making any database connection',async()=>{
  const was=process.env.ENABLE_WHATSAPP_DRAFTS;
  delete process.env.ENABLE_WHATSAPP_DRAFTS;
  try {
    let opened=false;
    const req={url:'/api/whatsapp-drafts',method:'GET',headers:{}};
    const res={statusCode:200,body:null,setHeader(){return this;},
      status(status){this.statusCode=status;return this;},
      json(body){this.body=body;return this;},end(){return this;}};
    await handleApiRequest(req,res,()=>{opened=true;throw Error('Database should not be connected')});
    assert.equal(res.statusCode,503);
    assert.equal(opened,false);
  } finally {
    if(was===undefined)delete process.env.ENABLE_WHATSAPP_DRAFTS;
    else process.env.ENABLE_WHATSAPP_DRAFTS=was;
  }
});
