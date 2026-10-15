// Persist employee profiles using only an authorized admin session.
// Staff credentials are not part of employee profiles; staff login is a separate feature.
const PERMISSIONS = ['dashboard','orders','clients','categories','products','employees','shipping']

export async function saveEmployeeRecord({ form, token, apiFetch, apiRead }) {
  if (!token) throw new Error('سجّل دخول المدير مرة أخرى')
  const name = String(form?.name || '').trim()
  const phone = String(form?.phone || '').trim()
  if (!name || name.length > 180) throw new Error('اكتب اسم موظف صحيح')
  if (!/^01\d{9}$/.test(phone)) throw new Error('موبايل الموظف لازم يكون 11 رقم ويبدأ بـ 01')
  const id = form?.id === null || form?.id === undefined ? null : Number(form.id)
  if (id !== null && (!Number.isSafeInteger(id) || id < 1)) throw new Error('رقم الموظف غير صحيح')
  const permissions = Object.fromEntries(PERMISSIONS.map(key =>
    [key, form?.permissions?.[key] === true]
  ))
  const url = id === null ? '/api/employees' : '/api/employees/' + id
  const response = await apiFetch(url, {
    method: id === null ? 'POST' : 'PUT',
    headers: {'Content-Type':'application/json', Authorization:'Bearer ' + token},
    body: JSON.stringify({name,phone,permissions})
  })
  const saved = await response.json().catch(() => null)
  if (!saved || !Number.isSafeInteger(Number(saved.id)) ||
      String(saved.name || '') !== name || String(saved.phone || '') !== phone) {
    throw new Error('تعذر التأكد من رد السيرفر على حفظ الموظف')
  }
  const persisted = await apiRead('employees', token)
  if (!Array.isArray(persisted) || !persisted.some(employee =>
    String(employee.id) === String(saved.id) &&
    employee.name === name && employee.phone === phone
  )) {
    throw new Error('تعذر تأكيد حفظ الموظف في قاعدة البيانات؛ راجع قائمة الموظفين قبل إعادة المحاولة')
  }
  return {saved, persisted}
}
