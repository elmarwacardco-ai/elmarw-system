import test from 'node:test'
import assert from 'node:assert/strict'
import {handleCustomerRequest} from './customer.js'

function harness(){
  const state={clients:[],products:[],orders:[]}
  let mutationCount=0
  const member={id:'customer-auth-1',email:'first@example.com',email_confirmed_at:'2026-10-15T10:00:00Z',
    user_metadata:{elmarwa_name:'First',elmarwa_phone:'01012345678',
      elmarwa_company:'Cards',elmarwa_address:'Cairo'}}
  const db={
    auth:{getUser:async()=>({data:{user:member},error:null})},
    from:()=>({select:()=>({eq:()=>({
      single:async()=>({data:{data:state},error:null})
    })})}),
    rpc:async(name,args)=>{
      assert.equal(name,'elmarwa_mutate')
      assert.equal(args.p_resource,'clients')
      mutationCount++
      if(state.clients.some(c=>c.phone===args.p_payload.phone))
        return {error:{code:'23505'}}
      const created={...args.p_payload,id:state.clients.length+1}
      state.clients.push(created)
      return {data:created,error:null}
    }
  }
  const authFactory=()=>({auth:{
    signUp:async({email,password,options})=>{
      assert.equal(email,member.email)
      assert.ok(password.length>=12)
      assert.equal(options.data.elmarwa_phone,'01012345678')
      return {data:{user:member,session:null},error:null}
    },
    signInWithPassword:async({email,password})=>{
      assert.equal(email,member.email)
      assert.ok(password.length>=12)
      return {data:{user:member,session:{access_token:'client-access'}},error:null}
    }
  }})
  return {db,state,member,authFactory,getMutations:()=>mutationCount}
}
async function request(db,route,method='GET',body={},authFactory,token=''){
  const req={url:'/api/customer/'+route,method,body,headers:{authorization:token?'Bearer '+token:''}}
  const res={statusCode:200,body:null,status(v){this.statusCode=v;return this},
    json(v){this.body=v;return this},end(){return this}}
  await handleCustomerRequest(req,res,db,authFactory)
  return res
}
async function withFlag(callback){
  const old=process.env.ENABLE_CUSTOMER_EMAIL_SIGNUP
  process.env.ENABLE_CUSTOMER_EMAIL_SIGNUP='true'
  try{await callback()}finally{
    if(old===undefined)delete process.env.ENABLE_CUSTOMER_EMAIL_SIGNUP
    else process.env.ENABLE_CUSTOMER_EMAIL_SIGNUP=old
  }
}
const data={name:'First',email:'first@example.com',pass:'LongEnoughPassword123',
  phone:'01012345678',company:'Cards',address:'Cairo'}
test('unconfigured email signup stays closed',async()=>{
  const old=process.env.ENABLE_CUSTOMER_EMAIL_SIGNUP
  delete process.env.ENABLE_CUSTOMER_EMAIL_SIGNUP
  try{
    const x=harness()
    const res=await request(x.db,'register-email','POST',data,x.authFactory)
    assert.equal(res.statusCode,503)
    assert.equal(x.getMutations(),0)
  }finally{
    if(old===undefined)delete process.env.ENABLE_CUSTOMER_EMAIL_SIGNUP
    else process.env.ENABLE_CUSTOMER_EMAIL_SIGNUP=old
  }
})
test('new email registration sends confirmation but does not store customer before email verifies',async()=>{
 await withFlag(async()=>{
   const x=harness()
   const result=await request(x.db,'register-email','POST',data,x.authFactory)
   assert.equal(result.statusCode,202)
   assert.equal(result.body.email_verification_required,true)
   assert.equal(x.state.clients.length,0)
 })
})
test('confirmed email login creates profile exactly once without claiming phone verification',async()=>{
 await withFlag(async()=>{
   const x=harness()
   let result=await request(x.db,'login','POST',{email:data.email,pass:data.pass},x.authFactory)
   assert.equal(result.statusCode,200)
   assert.equal(x.state.clients.length,1)
   assert.equal(x.state.clients[0].emailVerified,true)
   assert.equal(x.state.clients[0].phoneVerified,false)
   assert.equal(x.state.clients[0].type,'B')
   assert.equal(x.getMutations(),1)
   result=await request(x.db,'login','POST',{email:data.email,pass:data.pass},x.authFactory)
   assert.equal(result.statusCode,200)
   assert.equal(x.getMutations(),1)
   const me=await request(x.db,'me','GET',{},x.authFactory,'client-access')
   assert.equal(me.statusCode,200)
   assert.equal(me.body.client.id,1)
 })
})
test('unverified email cannot log in or create a customer profile',async()=>{
 await withFlag(async()=>{
   const x=harness()
   x.member.email_confirmed_at=null
   const result=await request(x.db,'login','POST',{email:data.email,pass:data.pass},x.authFactory)
   assert.equal(result.statusCode,401)
   assert.equal(x.getMutations(),0)
 })
})
test('an existing phone cannot be claimed through someone else\'s email signup',async()=>{
 await withFlag(async()=>{
   const x=harness()
   x.state.clients.push({id:1,phone:data.phone,email:'another@example.com',authUserId:'someone-else'})
   const res=await request(x.db,'register-email','POST',data,x.authFactory)
   assert.equal(res.statusCode,409)
   assert.equal(x.getMutations(),0)
 })
})
