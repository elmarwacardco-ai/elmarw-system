import test from 'node:test'
import assert from 'node:assert/strict'
import {saveEmployeeRecord} from './employee-save.js'

const form={id:null,name:'  موظف تجريبي ',phone:'01012345678',pass:'never-send-this',
  permissions:{dashboard:true,orders:true,clients:false,categories:true,employees:false}}
function makeBackend() {
  const state=[]
  const requests=[]
  const apiFetch=async(url,options)=>{
    const payload=JSON.parse(options.body)
    requests.push({url,method:options.method,headers:options.headers,payload})
    if (options.headers.Authorization!=='Bearer manager-token') throw Error('Unauthorized')
    if (options.method==='POST') {
      const row={...payload,id:state.length+1}
      state.push(row)
      return {json:async()=>row}
    }
    const id=Number(url.split('/').pop())
    const row=state.find(item=>item.id===id)
    if (!row)throw Error('Not found')
    Object.assign(row,payload)
    return {json:async()=>row}
  }
  const apiRead=async(resource,token)=>{
    assert.equal(resource,'employees')
    assert.equal(token,'manager-token')
    return structuredClone(state)
  }
  return {state,requests,apiFetch,apiRead}
}

test('employee creation uses admin token, strips old password and verifies persistence',async()=>{
  const db=makeBackend()
  const result=await saveEmployeeRecord({form,token:'manager-token',...db})
  assert.equal(db.state.length,1)
  assert.equal(result.saved.name,'موظف تجريبي')
  assert.equal(result.persisted[0].phone,'01012345678')
  assert.equal(db.requests[0].url,'/api/employees')
  assert.equal(db.requests[0].method,'POST')
  assert.equal(db.requests[0].headers.Authorization,'Bearer manager-token')
  assert.equal('pass' in db.requests[0].payload,false)
  assert.equal('password' in db.requests[0].payload,false)
  assert.equal(db.requests[0].payload.permissions.clients,false)
})
test('employee edit uses PUT and still refreshes saved data',async()=>{
  const db=makeBackend()
  await saveEmployeeRecord({form,token:'manager-token',...db})
  const changed=await saveEmployeeRecord({form:{...form,id:1,name:'الموظف بعد التعديل'},token:'manager-token',...db})
  assert.equal(changed.persisted.length,1)
  assert.equal(changed.persisted[0].name,'الموظف بعد التعديل')
  assert.equal(db.requests[1].url,'/api/employees/1')
  assert.equal(db.requests[1].method,'PUT')
})
test('invalid name, phone, or missing manager token never sends a write',async()=>{
  const db=makeBackend()
  await assert.rejects(saveEmployeeRecord({form,token:'',...db}),/المدير/)
  await assert.rejects(saveEmployeeRecord({form:{...form,name:' '},token:'manager-token',...db}),/اسم/)
  await assert.rejects(saveEmployeeRecord({form:{...form,phone:'0123'},token:'manager-token',...db}),/11 رقم/)
  assert.equal(db.requests.length,0)
})
test('server authorization or failed response never appears as successful save',async()=>{
  const db=makeBackend()
  await assert.rejects(saveEmployeeRecord({form,token:'invalid',...db}),/Unauthorized/)
  const failed={...db,apiFetch:async()=>{throw Error('HTTP 401')}}
  await assert.rejects(saveEmployeeRecord({form,token:'manager-token',...failed}),/HTTP 401/)
})
test('save without a persisted database record reports uncertainty instead of closing the form',async()=>{
  const db=makeBackend()
  const failed={...db,apiRead:async()=>[]}
  await assert.rejects(saveEmployeeRecord({form,token:'manager-token',...failed}),/تعذر تأكيد حفظ الموظف/)
  assert.equal(db.state.length,1)
})
