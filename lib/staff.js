import { randomBytes } from 'node:crypto'

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/
const resError=(res,status,error)=>res.status(status).json({error})
const pick=(e)=>({
  id:e.id,name:e.name,phone:e.phone,email:e.email,
  permissions:e.permissions || {},mustChangePassword:e.mustChangePassword===true
})
function parse(req){
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body
  if(!body||Array.isArray(body)||typeof body!=='object')throw Object.assign(new Error('Invalid request'),{status:400})
  return body
}
async function snapshot(db){
  const {data,error}=await db.from('app_data').select('data').eq('id',1).single()
  if(error||!data?.data)throw Error('Employees database missing')
  return data.data
}
async function actor(db,req){
  const match=String(req.headers?.authorization||'').match(/^Bearer\s+(.+)$/i)
  if(!match)return null
  const {data,error}=await db.auth.getUser(match[1])
  if(error||!data?.user)return null
  return data.user
}
async function administrator(db,user){
  if(!user)return false
  const {data,error}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle()
  if(error)throw error
  return Boolean(data)
}
function staffUser(state,user){
  if(!user?.email||!user.email_confirmed_at)return null
  return (state.employees||[]).find(e=>e.authUserId===user.id &&
    e.email?.toLowerCase()===user.email.toLowerCase() && e.active===true) || null
}
async function mutate(db,id,payload){
  const {data,error}=await db.rpc('elmarwa_mutate',{
    p_resource:'employees',p_method:'PUT',p_id:id,p_payload:payload
  })
  if(error)throw error
  return data
}

// No public user creation. Only the existing Supabase administrator can
// provision an employee. Temporary passwords are returned ONCE and never
// stored in app_data or logged, then must be changed on first login.
export async function handleStaffRequest(req,res,db,authFactory){
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Vary','Authorization')
  if(process.env.ENABLE_STAFF_ACCOUNTS!=='true')
    return resError(res,503,'دخول الموظفين غير مفعل على هذا النشر')
  const parts=new URL(req.url,'https://elmarwa.local').pathname.split('/').filter(Boolean)
  const action=parts[2]
  try{
    if(action==='login'&&req.method==='POST'){
      const {email,password}=parse(req)
      const name=String(email||'').trim().toLowerCase()
      if(!EMAIL.test(name)||typeof password!=='string'||password.length<8)
        return resError(res,400,'البريد الإلكتروني أو كلمة المرور غير صحيحة')
      if(typeof authFactory!=='function')throw Error('Public Auth factory not configured')
      const auth=authFactory()
      const {data,error}=await auth.auth.signInWithPassword({email:name,password})
      if(error||!data?.session?.access_token||!data?.user)
        return resError(res,401,'بيانات الدخول غير صحيحة')
      const state=await snapshot(db)
      const employee=staffUser(state,data.user)
      if(!employee)return resError(res,403,'حساب الموظف غير مفعل أو تم إيقافه')
      return res.status(200).json({access_token:data.session.access_token,employee:pick(employee)})
    }
    const user=await actor(db,req)
    if(!user)return resError(res,401,'سجّل الدخول أولًا')
    if(action==='activate'&&req.method==='POST'){
      if(!(await administrator(db,user)))return resError(res,403,'صلاحية المدير مطلوبة')
      const body=parse(req)
      const id=Number(body.employeeId)
      const email=String(body.email||'').trim().toLowerCase()
      if(!Number.isSafeInteger(id)||id<1||!EMAIL.test(email)||email.length>254)
        return resError(res,400,'رقم الموظف والبريد الإلكتروني الصحيح مطلوبان')
      const data=await snapshot(db)
      const employee=(data.employees||[]).find(e=>Number(e.id)===id)
      if(!employee)return resError(res,404,'الموظف غير موجود')
      if(employee.authUserId)return resError(res,409,'حساب الموظف مُفعّل بالفعل')
      if((data.employees||[]).some(e=>Number(e.id)!==id&&e.email?.toLowerCase()===email))
        return resError(res,409,'البريد مستخدم لموظف آخر')
      const temporaryPassword=randomBytes(24).toString('base64url')
      const {data:created,error:creationError}=await db.auth.admin.createUser({
        email,password:temporaryPassword,email_confirm:true
      })
      if(creationError||!created?.user?.id){
        // Existing auth identities must never be attached to new employees.
        return resError(res,409,'تعذر تفعيل الموظف؛ استخدم بريدًا جديدًا غير مسجل')
      }
      try{
        await mutate(db,id,{email,authUserId:created.user.id,active:true,mustChangePassword:true})
      }catch(err){
        try{await db.auth.admin.deleteUser(created.user.id)}catch(cleanup){
          console.error('Staff Auth cleanup failed:',cleanup?.code||cleanup?.message)
        }
        throw err
      }
      return res.status(201).json({
        employeeId:id,email,temporaryPassword,
        notice:'اعرض كلمة المرور للموظف مرة واحدة فقط؛ يجب تغييرها عند أول دخول'
      })
    }
    const data=await snapshot(db)
    const employee=staffUser(data,user)
    if(!employee)return resError(res,403,'حساب الموظف غير مصرح له بالدخول')
    if(action==='me'&&req.method==='GET')
      return res.status(200).json({employee:pick(employee)})
    if(action==='change-password'&&req.method==='POST'){
      const {password}=parse(req)
      if(typeof password!=='string'||password.length<12||password.length>72)
        return resError(res,400,'كلمة المرور الجديدة يجب أن تكون 12 حرفًا على الأقل')
      const {error}=await db.auth.admin.updateUserById(user.id,{password})
      if(error)throw error
      await mutate(db,employee.id,{mustChangePassword:false})
      return res.status(200).json({success:true})
    }
    return resError(res,404,'مسار غير موجود')
  }catch(error){
    console.error('Staff API:',error.code||error.message)
    return resError(res,error.status||500,error.status?error.message:'تعذر معالجة دخول الموظف')
  }
}
