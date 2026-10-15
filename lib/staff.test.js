import test from 'node:test'
import assert from 'node:assert/strict'
import {handleStaffRequest} from './staff.js'
function harness(){
  const state={employees:[{id:1,name:'Test Employee',phone:'01012345678',
    permissions:{orders:true,clients:false},active:false}],clients:[],orders:[]}
  let created=false
  let changedPassword=false
  const db={
    auth:{
      getUser:async token=>({data:{user:token==='admin'?{id:'boss',email:'boss@example.com',email_confirmed_at:'today'}:
          token==='worker'?{id:'worker-1',email:'worker@example.com',email_confirmed_at:'today'}:
          null},error:null}),
      admin:{
        createUser:async({email,password,email_confirm})=>{
          assert.equal(email_confirm,true)
          assert.ok(password.length>=24)
          created=true
          return {data:{user:{id:'worker-1',email}},error:null}
        },
        deleteUser:async()=>({error:null}),
        updateUserById:async(id,{password})=>{
          assert.equal(id,'worker-1')
          assert.ok(password.length>=12)
          changedPassword=true
          return {error:null}
        }
      }
    },
    from:table=>({
      select:()=>({
        eq:()=>({
          single:async()=>({data:{data:state},error:null}),
          maybeSingle:async()=>({data:table==='admin_users'?{user_id:'boss'}:null,error:null})
        })
      })
    }),
    rpc:async(name,args)=>{
      assert.equal(name,'elmarwa_mutate')
      assert.equal(args.p_resource,'employees')
      const employee=state.employees.find(e=>e.id===args.p_id)
      Object.assign(employee,args.p_payload)
      return {data:employee,error:null}
    }
  }
  return {db,state,wasCreated:()=>created,didReset:()=>changedPassword}
}
async function request(db,action,method,body,token,authFactory){
 const req={url:'/api/staff/'+action,method,body,headers:token?{authorization:'Bearer '+token}:{}}
 const res={code:200,body:null,setHeader(){return this},status(code){this.code=code;return this},json(v){this.body=v;return this}}
 await handleStaffRequest(req,res,db,authFactory)
 return res
}
test('staff endpoints unavailable unless explicitly enabled',async()=>{
 const old=process.env.ENABLE_STAFF_ACCOUNTS;delete process.env.ENABLE_STAFF_ACCOUNTS
 try{const {db}=harness();const r=await request(db,'login','POST',{},'')
 assert.equal(r.code,503)}finally{if(old===undefined)delete process.env.ENABLE_STAFF_ACCOUNTS;else process.env.ENABLE_STAFF_ACCOUNTS=old}
})
test('only admin provisions a staff identity; temporary password never persists in employee record',async()=>{
 const old=process.env.ENABLE_STAFF_ACCOUNTS;process.env.ENABLE_STAFF_ACCOUNTS='true'
 try{
 const {db,state,wasCreated}=harness()
 const notAdmin=await request(db,'activate','POST',{employeeId:1,email:'worker@example.com'},'worker')
 assert.equal(notAdmin.code,403)
 const activated=await request(db,'activate','POST',{employeeId:1,email:'worker@example.com'},'admin')
 assert.equal(activated.code,201)
 assert.equal(wasCreated(),true)
 assert.ok(activated.body.temporaryPassword.length>=24)
 assert.equal(state.employees[0].authUserId,'worker-1')
 assert.equal(state.employees[0].mustChangePassword,true)
 assert.equal('temporaryPassword' in state.employees[0],false)
 assert.equal('pass' in state.employees[0],false)
 const duplicate=await request(db,'activate','POST',{employeeId:1,email:'worker@example.com'},'admin')
 assert.equal(duplicate.code,409)
 }finally{if(old===undefined)delete process.env.ENABLE_STAFF_ACCOUNTS;else process.env.ENABLE_STAFF_ACCOUNTS=old}
})
test('login requires linked employee and first password change',async()=>{
 const old=process.env.ENABLE_STAFF_ACCOUNTS;process.env.ENABLE_STAFF_ACCOUNTS='true'
 try{
 const {db,state,didReset}=harness()
 state.employees[0]={...state.employees[0],authUserId:'worker-1',active:true,
   email:'worker@example.com',mustChangePassword:true}
 const authFactory=()=>({auth:{signInWithPassword:async()=>({
   data:{user:{id:'worker-1',email:'worker@example.com',email_confirmed_at:'today'},
     session:{access_token:'worker'}},error:null
 })}})
 const login=await request(db,'login','POST',{email:'worker@example.com',password:'FirstPassword12'},null,authFactory)
 assert.equal(login.code,200)
 assert.equal(login.body.employee.mustChangePassword,true)
 const bad=await request(db,'change-password','POST',{password:'weak'},'worker')
 assert.equal(bad.code,400)
 const updated=await request(db,'change-password','POST',{password:'NewStrongPassword12!'},'worker')
 assert.equal(updated.code,200)
 assert.equal(didReset(),true)
 assert.equal(state.employees[0].mustChangePassword,false)
 const me=await request(db,'me','GET',undefined,'worker')
 assert.equal(me.code,200)
 assert.equal(me.body.employee.name,'Test Employee')
 }finally{if(old===undefined)delete process.env.ENABLE_STAFF_ACCOUNTS;else process.env.ENABLE_STAFF_ACCOUNTS=old}
})
