import test from 'node:test'
import assert from 'node:assert/strict'
import { requireAdminSession } from './admin-session.js'

test('administrator role proof calls private clients endpoint, never public catalog',async()=>{
  const calls=[]
  const ok=await requireAdminSession(async(resource,token)=>{
    calls.push({resource,token})
    return []
  },'test-admin-token')
  assert.equal(ok,true)
  assert.deepEqual(calls,[{resource:'clients',token:'test-admin-token'}])
})
test('signed-in customer token must not create a fake admin dashboard',async()=>{
  const calls=[]
  await assert.rejects(
    requireAdminSession(async(resource)=>{
      calls.push(resource)
      throw new Error('Admin access required')
    },'customer-token'),
    /Admin access required/
  )
  assert.deepEqual(calls,['clients'])
})
test('token required and malformed permission responses are rejected',async()=>{
  await assert.rejects(requireAdminSession(async()=>[],''),/session missing/)
  await assert.rejects(requireAdminSession(async()=>({}), 'token'),/permission check failed/)
})
