import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCustomerRequest} from './customer.js';

const phone='01087654321';
const password='temporary-safe-pass-2026';
const internalEmail='elmarwa-temporary-'+phone+'@example.com';

function harness() {
  const state={clients:[],products:[],orders:[]};
  const calls={created:0,deleted:0,signin:0,mutations:0,verified:0};
  const user={id:'temporary-user-1',email:internalEmail,
    app_metadata:{elmarwa_temp_customer:true},phone_confirmed_at:null,email_confirmed_at:'2026-10-16T10:00:00Z'};
  const db={
    from:table=>{
      assert.equal(table,'app_data');
      return {select:()=>({eq:()=>({single:async()=>({data:{data:state},error:null})})})};
    },
    auth:{
      admin:{
        createUser:async({email,password:provided,email_confirm,app_metadata})=>{
          calls.created++;
          assert.equal(email,internalEmail);
          assert.equal(provided,password);
          assert.equal(email_confirm,true);
          assert.equal(app_metadata.elmarwa_temp_customer,true);
          return {data:{user},error:null};
        },
        deleteUser:async id=>{assert.equal(id,user.id);calls.deleted++;return {error:null};}
      },
      getUser:async token=>({data:{user:token==='temporary-token'?user:null},error:null})
    },
    rpc:async(name,args)=>{
      assert.equal(name,'elmarwa_mutate');
      assert.equal(args.p_resource,'clients');
      calls.mutations++;
      if(state.clients.some(c=>c.phone===args.p_payload.phone))return {error:{code:'23505'}};
      const created={...args.p_payload,id:state.clients.length+1};
      state.clients.push(created);
      return {data:created,error:null};
    }
  };
  const authFactory=()=>({auth:{signInWithPassword:async({email,phone:triedPhone,password:provided})=>{
    if (triedPhone) return {error:{message:'No confirmed phone identity'}};
    calls.signin++;
    assert.equal(email,internalEmail);
    if(provided!==password)return {error:{message:'incorrect'}};
    return {data:{user,session:{access_token:'temporary-token'}},error:null};
  }}});
  const captchaVerifier=async value=>{calls.verified++;return value==='valid-preview-captcha-token';};
  return {state,calls,user,db,authFactory,captchaVerifier};
}
function request(h,path,method='GET',body={},token=''){
  const req={url:'/api/customer/'+path,method,body,headers:{authorization:token?'Bearer '+token:''}};
  const res={statusCode:200,body:null,status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return this;},end(){return this;}};
  return handleCustomerRequest(req,res,h.db,h.authFactory,h.captchaVerifier).then(()=>res);
}
const registration={
  name:'New Preview Customer',phone,pass:password,company:'Test printing',
  address:'Test address',captchaToken:'valid-preview-captcha-token'
};
async function withFlag(enabled,cb) {
  const old=process.env.ENABLE_TEMP_PHONE_SIGNUP;
  if(enabled)process.env.ENABLE_TEMP_PHONE_SIGNUP='true';
  else delete process.env.ENABLE_TEMP_PHONE_SIGNUP;
  try {await cb();}finally{
    if(old===undefined)delete process.env.ENABLE_TEMP_PHONE_SIGNUP;
    else process.env.ENABLE_TEMP_PHONE_SIGNUP=old;
  }
}
test('temporary registration and login are disabled by default',async()=>{
  await withFlag(false,async()=>{
    const h=harness();
    const signup=await request(h,'register-temporary','POST',registration);
    assert.equal(signup.statusCode,503);
    assert.equal(h.calls.created,0);
    h.state.clients.push({id:1,phone,authUserId:h.user.id,
      provisionalSignup:true,phoneVerified:false});
    const login=await request(h,'login','POST',{phone,pass:password});
    assert.equal(login.statusCode,401);
    assert.equal(h.calls.signin,0);
    const me=await request(h,'me','GET',{},'temporary-token');
    assert.equal(me.statusCode,403);
  });
});
test('valid registration inserts a B-tier client without a verified phone, email or stored password',async()=>{
  await withFlag(true,async()=>{
    const h=harness();
    const signup=await request(h,'register-temporary','POST',registration);
    assert.equal(signup.statusCode,201);
    assert.equal(signup.body.temporary_account_created,true);
    assert.equal(signup.body.phone_verification_required_later,true);
    assert.equal(h.state.clients.length,1);
    const c=h.state.clients[0];
    assert.equal(c.phone,phone);
    assert.equal(c.type,'B');
    assert.equal(c.phoneVerified,false);
    assert.equal(c.emailVerified,false);
    assert.equal(c.provisionalSignup,true);
    assert.equal(c.pass,undefined);
    assert.equal(c.email,undefined);
    const login=await request(h,'login','POST',{phone,pass:password});
    assert.equal(login.statusCode,200);
    assert.equal(login.body.client.phoneVerified,false);
    assert.equal(login.body.client.provisionalSignup,true);
    assert.equal(login.body.client.pass,undefined);
    const me=await request(h,'me','GET',{},'temporary-token');
    assert.equal(me.statusCode,200);
    const orders=await request(h,'orders','GET',{},'temporary-token');
    assert.equal(orders.statusCode,200);
    assert.deepEqual(orders.body,[]);
  });
});
test('duplicate phone is rejected without creating any Auth user',async()=>{
  await withFlag(true,async()=>{
    const h=harness();
    h.state.clients.push({id:3,phone,authUserId:'existing',phoneVerified:true});
    const response=await request(h,'register-temporary','POST',registration);
    assert.equal(response.statusCode,409);
    assert.equal(h.calls.created,0);
  });
});
test('existing international-format phone is rejected too',async()=>{
  await withFlag(true,async()=>{
    const h=harness();
    h.state.clients.push({id:3,phone:'+20'+phone.slice(1),
      authUserId:'existing',phoneVerified:true});
    const response=await request(h,'register-temporary','POST',registration);
    assert.equal(response.statusCode,409);
    assert.equal(h.calls.created,0);
  });
});
test('invalid CAPTCHA never creates an account',async()=>{
  await withFlag(true,async()=>{
    const h=harness();
    const response=await request(h,'register-temporary','POST',
      {...registration,captchaToken:'invalid-but-long-enough-token'});
    assert.equal(response.statusCode,400);
    assert.equal(h.calls.created,0);
  });
});
test('strong password, valid phone and identity metadata are required',async()=>{
  await withFlag(true,async()=>{
    const h=harness();
    for(const body of [
      {...registration,phone:'010'},
      {...registration,pass:'12345678'},
      {...registration,name:''},
      {...registration,captchaToken:''}
    ]){
      const response=await request(h,'register-temporary','POST',body);
      assert.equal(response.statusCode,400);
    }
    assert.equal(h.calls.created,0);
  });
});
test('wrong password cannot log in or get private orders',async()=>{
  await withFlag(true,async()=>{
    const h=harness();
    await request(h,'register-temporary','POST',registration);
    const login=await request(h,'login','POST',{phone,pass:'wrong-password'});
    assert.equal(login.statusCode,401);
    const orders=await request(h,'orders','GET',{},'bad-token');
    assert.equal(orders.statusCode,401);
  });
});
test('missing trusted Auth app_metadata cannot unlock a temporary account',async()=>{
  await withFlag(true,async()=>{
    const h=harness();
    await request(h,'register-temporary','POST',registration);
    h.user.app_metadata={};
    const login=await request(h,'login','POST',{phone,pass:password});
    assert.equal(login.statusCode,401);
    const me=await request(h,'me','GET',{},'temporary-token');
    assert.equal(me.statusCode,403);
  });
});
test('database write error removes provisional Auth user to permit retry',async()=>{
  await withFlag(true,async()=>{
    const h=harness();
    h.db.rpc=async()=>({error:{code:'23505',message:'duplicate'}});
    const response=await request(h,'register-temporary','POST',registration);
    assert.equal(response.statusCode,409);
    assert.equal(h.calls.created,1);
    assert.equal(h.calls.deleted,1);
  });
});
