import React, { useState, useEffect, useRef } from 'react'
const API = '/api'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const TOKEN_KEY = 'elmarw_admin_access_token'
const CUSTOMER_TOKEN_KEY = 'elmarw_customer_access_token'
const CAPTCHA_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
const USE_DIRECT_PDF_UPLOAD = import.meta.env.VITE_ENABLE_DIRECT_PDF_UPLOAD === 'true'
async function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY)
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(url, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body?.error || `API request failed (HTTP ${response.status})`)
  }
  return response
}


async function customerFetch(url, options = {}) {
  const token = sessionStorage.getItem(CUSTOMER_TOKEN_KEY)
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(url, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body?.error || `HTTP ${response.status}`)
  }
  return response
}

async function restoreCustomer() {
  const token = sessionStorage.getItem(CUSTOMER_TOKEN_KEY)
  if (!token) return null
  const [profile, catalog, orders] = await Promise.all([
    customerFetch(`${API}/customer/me`).then(r => r.json()),
    customerFetch(`${API}/customer/catalog`).then(r => r.json()),
    customerFetch(`${API}/customer/orders`).then(r => r.json())
  ])
  return { client: profile.client, products: catalog, orders }
}

async function apiReadPublic(resource) {
  const response = await fetch(`${API}/${resource}`)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
  if (!Array.isArray(body)) throw new Error('Invalid public catalog response')
  return body
}

async function apiRead(resource, token) {
  const response = await apiFetch(`${API}/${resource}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
  if (!Array.isArray(body)) throw new Error(`Invalid ${resource} response`)
  return body
}

export default function App() {
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [orders, setOrders] = useState([])
  const [employees, setEmployees] = useState([])
  const [folders, setFolders] = useState([])
  const [cart, setCart] = useState([])
  const [selectedSub, setSelectedSub] = useState(null)
  const [orderFile, setOrderFile] = useState(null)
  const [orderClientName, setOrderClientName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [adminTab, setAdminTab] = useState('dashboard')
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('الكل')
  const [showForm, setShowForm] = useState(false)
  const [showVerifyForm, setShowVerifyForm] = useState(false)
  const [verificationPhone, setVerificationPhone] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef(null)
  const [showLogin, setShowLogin] = useState(false)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showSubCategoryForm, setShowSubCategoryForm] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [showMyOrders, setShowMyOrders] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [customerPaymentMethod, setCustomerPaymentMethod] = useState('نقدي')
  const [notifications, setNotifications] = useState([])
  const [clientSearch, setClientSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogCategory, setCatalogCategory] = useState('all')
  const [accountingDate, setAccountingDate] = useState(new Date().toISOString().slice(0,10))
  const [form, setForm] = useState({ name: '', phone: '', company: '', address: '', pass: '' })
  const [employeeForm, setEmployeeForm] = useState({ id: null, name: '', phone: '', pass: '', permissions: { dashboard: true, orders: true, clients: true, categories: true, products: true, employees: false, shipping: true } })
  const [categoryForm, setCategoryForm] = useState({ name: '', id: null })
  const [subCategoryForm, setSubCategoryForm] = useState({ name: '', categoryId: '', image: '', id: null })
  const [productForm, setProductForm] = useState({ name: '', categoryId: '', subCategoryId: '', image: '', id: null, pricesB: {1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''}, pricesVIP: {1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''} })
  const [login, setLogin] = useState({ phone: '', pass: '' })
  const [loggedClient, setLoggedClient] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [loggedEmployee, setLoggedEmployee] = useState(null)
  const [adminLogin, setAdminLogin] = useState({ user: '', pass: '' })
  const [newFolderName, setNewFolderName] = useState('')
  const [editFolderId, setEditFolderId] = useState(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deletePass, setDeletePass] = useState('')
  const quantities = [1000,2000,3000,4000,5000,6000,7000,8000,9000,10000]
  const orderStatuses = ['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم','تم التسليم','ملغي']
  const folderStatuses = ['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم']
  const paymentMethods = ['نقدي','فودافون كاش','انستا باي','تحويل بنكي','آجل']

  const [loadError, setLoadError] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [orderBusy, setOrderBusy] = useState(false)

  const saveCategory = async () => {
    const name = categoryForm.name.trim()
    if (!name) { alert('اكتب اسم التصنيف'); return }
    const token = sessionStorage.getItem(TOKEN_KEY)
    if (!token) { alert('لازم تسجل دخول المدير'); return }
    setCategoryBusy(true)
    try {
      const response = await apiFetch(`${API}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
      await loadAll(token)
      setShowCategoryForm(false)
      setCategoryForm({ name: '', id: null })
      alert('تم حفظ التصنيف بنجاح ✅')
    } catch (error) {
      alert('فشل حفظ التصنيف: ' + error.message)
    } finally { setCategoryBusy(false) }
  }


  const loadAll = async (token = sessionStorage.getItem(TOKEN_KEY)) => {
    if (!token) return

    const resources = [
      'clients', 'categories', 'subcategories',
      'products', 'orders', 'folders', 'employees'
    ]
    const setters = [
      setClients, setCategories, setSubCategories,
      setProducts, setOrders, setFolders, setEmployees
    ]

    const results = await Promise.allSettled(
      resources.map(key => apiRead(key, token))
    )
    const errors = []
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        setters[index](result.value)
      } else {
        console.error(`Failed to load ${resources[index]}:`, result.reason)
        errors.push(resources[index])
      }
    })
    setLoadError(errors.length ? `تعذر تحميل: ${errors.join(', ')}` : '')
  }

  useEffect(() => {
    if (!showForm || !CAPTCHA_SITE_KEY || !turnstileRef.current) return
    let active = true
    let widgetId = null
    let timer = null
    const mount = () => {
      if (!active) return
      if (!window.turnstile) {
        timer = window.setTimeout(mount, 200)
        return
      }
      if (turnstileRef.current) {
        widgetId = window.turnstile.render(turnstileRef.current, {
          sitekey: CAPTCHA_SITE_KEY,
          callback: token => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken('')
        })
      }
    }
    if (!document.querySelector('script[data-elmarwa-turnstile]')) {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.setAttribute('data-elmarwa-turnstile', '1')
      document.head.appendChild(script)
    }
    mount()
    return () => {
      active = false
      window.clearTimeout(timer)
      if (widgetId !== null && window.turnstile) {
        window.turnstile.remove(widgetId)
      }
      setCaptchaToken('')
    }
  }, [showForm])

  const loadPublicCatalog = async () => {
    const resources = ['categories','subcategories','products']
    const setters = [setCategories,setSubCategories,setProducts]
    const results = await Promise.allSettled(resources.map(apiReadPublic))
    results.forEach((result,index) => {
      if (result.status === 'fulfilled') setters[index](result.value)
      else console.error('Public catalog load failed:', result.reason)
    })
  }
  useEffect(() => {
    // Don't overwrite a restored admin/VIP catalog with anonymous B prices.
    if (sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(CUSTOMER_TOKEN_KEY)) return
    loadPublicCatalog()
  }, [])

  useEffect(() => {
    if (!sessionStorage.getItem(CUSTOMER_TOKEN_KEY)) return
    restoreCustomer().then(session => {
      if (session) {
        setLoggedClient(session.client)
        setProducts(session.products)
        setOrders(session.orders)
      }
    }).catch(error => {
      console.warn('Customer session expired:', error.message)
      sessionStorage.removeItem(CUSTOMER_TOKEN_KEY)
      setLoggedClient(null)
      loadPublicCatalog()
    })
  }, [])

  useEffect(() => {
    // لا نثق في جلسة مخزنة إلا بعد تحقق السيرفر من صلاحية المدير
    const token = sessionStorage.getItem(TOKEN_KEY)
    if (token) {
      apiRead('categories', token).then(() => {
        setLoggedEmployee({ name: 'المدير العام', permissions: {
          dashboard: true, employees: true, categories: true,
          products: true, clients: true, orders: true, shipping: true
        } })
        setShowAdmin(true)
        loadAll(token)
      }).catch(() => { sessionStorage.removeItem(TOKEN_KEY); loadPublicCatalog() })
    }
    const nt = localStorage.getItem('notifications')
    if (nt) { try { setNotifications(JSON.parse(nt)) } catch {} }
  }, [])
  // Customer identity is restored through the server-validated session, never localStorage.
  useEffect(() => { localStorage.setItem('notifications', JSON.stringify(notifications)) }, [notifications])

  const btnStyle = { padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', margin: '5px' }
  const inputStyle = { display: 'block', width: '100%', margin: '10px 0', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }

  const generateSerial = () => {
    const d = new Date();
    return `M-${d.getFullYear().toString().slice(-2)}${(d.getMonth()+1).toString().padStart(2,'0')}-${Math.floor(100000 + Math.random()*900000)}`;
  }

  const printSticker = (o) => {
    const w = window.open('', '_blank', 'width=400,height=250');
    w.document.write(`
      <html dir="rtl"><head><style>
        @page { size: 4cm 2cm; margin: 0; }
        body { width:4cm; height:2cm; margin:0; padding:2mm; font-family:Tahoma; border:1px dashed #000; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; }
       .row { display:flex; justify-content:space-between; font-size:7pt; font-weight:900; }
       .serial { font-size:10pt; text-align:center; font-weight:900; letter-spacing:1px; }
       .small { font-size:6pt; color:#333; }
      </style></head><body>
        <div class="serial">#${o.serialNumber || o.id}</div>
        <div class="row"><span>العميل:</span><span>${o.clientName}</span></div>
        <div class="row small"><span>تنفيذ:</span><span>${o.executionDate || '-'}</span><span>جاهز:</span><span>${o.readyDate || '-'}</span></div>
        <div class="row small"><span>${o.date||''}</span><span>${o.total||0}ج</span></div>
        <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500)}</script>
      </body></html>
    `);
    w.document.close();
  }

  const safeItems = (o) => { let it = o.items || []; if (typeof it === 'string') { try { it = JSON.parse(it) } catch { it = [] } } return Array.isArray(it)? it : [] }
  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => { if(!file) return resolve(''); const r = new FileReader(); r.onload = () => resolve(r.result || ''); r.onerror = reject; r.readAsDataURL(file) })
  const downloadOrderFile = async (o) => {
    try {
      if (o.filePath) {
        const isAdmin = showAdmin && Boolean(sessionStorage.getItem(TOKEN_KEY))
        const request = isAdmin ? apiFetch : customerFetch
        const response = await request(`${API}/customer/file/${o.id}`)
        const result = await response.json()
        window.open(result.url, '_blank', 'noopener,noreferrer')
        return
      }
      if (!o.fileData) throw new Error('الملف الأصلي غير محفوظ في النظام')
      const anchor = document.createElement('a')
      anchor.href = o.fileData
      anchor.download = o.fileName || `order-${o.id}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (error) {
      alert('تعذر تنزيل الملف: ' + error.message)
    }
  }
  const downloadPaymentProof = async (o) => {
    try {
      if (!o.paymentProofPath) throw new Error('لا توجد صورة محفوظة')
      const response = await (showAdmin ? apiFetch : customerFetch)(`${API}/customer/proof/${o.id}`)
      const file = await response.json()
      window.open(file.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      alert('تعذر عرض إثبات الدفع: ' + error.message)
    }
  }
  const uploadPaymentProof = async (o, file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 1024*1024) {
      alert('ارفع صورة PNG أو JPEG بحد أقصى 1 ميجابايت'); return
    }
    try {
      const fileData = await readFileAsDataUrl(file)
      const response = await customerFetch(`${API}/customer/payment-proof/${o.id}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileData,fileName:file.name})
      })
      const changed = await response.json()
      setOrders(previous => previous.map(order => String(order.id) === String(o.id) ? changed : order))
      alert('تم رفع صورة إثبات الدفع ✅')
    } catch (error) {
      alert('تعذر رفع إثبات الدفع: ' + error.message)
    }
  }
  const orderSearchText = (o) => `${o.clientName||''} ${o.clientPhone||''}`.toLowerCase()
  const visibleDashboardOrders = orders.filter(o => o.status !== 'تم التسليم' && o.status !== 'ملغي' && (!orderSearch.trim() || orderSearchText(o).includes(orderSearch.trim().toLowerCase())))
  const myOrdersList = orders.filter(o => loggedClient &&
    String(o.clientId) === String(loggedClient.id)
  ).sort((a,b) => Number(b.id)-Number(a.id))
  const getPaymentStatus = (total, paid) => { const p = Number(paid)||0; const t = Number(total)||0; if(p<=0) return 'غير مدفوع'; if(p>=t) return 'مدفوع بالكامل'; return 'مدفوع جزئي' }
  const statusColor = (s) => { if(s==='جديد') return '#2563eb'; if(s==='قيد التنفيذ') return '#3b82f6'; if(s==='قيد الطباعة') return '#1d4ed8'; if(s==='جاهز للتسليم') return '#64748b'; if(s==='تم التسليم') return '#475569'; if(s==='ملغي') return '#94a3b8'; return '#64748b' }
  const updateOrder = async (id, updates) => { const oldOrder = orders.find(o=> o.id===id); await apiFetch(`${API}/orders/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(updates)}); if(oldOrder && (updates.status || updates.paidAmount!==undefined || updates.paymentMethod)){ const newNotif = { id: Date.now(), orderId: id, clientId: oldOrder.clientId, clientPhone: oldOrder.clientPhone, msg: `طلبك #${id} ${updates.status? `بقى: ${updates.status}`:''} ${updates.paidAmount!==undefined? ` - المدفوع: ${updates.paidAmount}ج`:''}`, date: new Date().toLocaleString('ar-EG'), read: false }; setNotifications(prev=> [newNotif,...prev].slice(0,50)) } loadAll() }
  const myUnread = notifications.filter(n=> { if(!loggedClient) return false; return (String(n.clientId)===String(loggedClient.id) || String(n.clientPhone).replace(/\D/g,'')===String(loggedClient.phone).replace(/\D/g,'')) &&!n.read })
  const activateCustomer = async (session) => {
    if (!session?.access_token || !session?.client) throw new Error('الرد من السيرفر غير مكتمل')
    sessionStorage.setItem(CUSTOMER_TOKEN_KEY, session.access_token)
    setLoggedClient(session.client)
    localStorage.removeItem('loggedClient')
    setProducts(await customerFetch(`${API}/customer/catalog`).then(r=>r.json()))
    setOrders(await customerFetch(`${API}/customer/orders`).then(r=>r.json()))
  }
  const handleRegister = async () => {
    if (!CAPTCHA_SITE_KEY) {
      alert('التسجيل موقوف لحين إعداد حماية الموقع'); return
    }
    if (!captchaToken) { alert('أكمل التحقق من الأمان أولاً'); return }
    if (!form.name || !form.phone || !form.company || !form.address || !form.pass) {
      alert('املأ كل البيانات'); return
    }
    if (!/^01\d{9}$/.test(form.phone) || form.pass.length < 8) {
      alert('راجع رقم الهاتف وكلمة المرور (8 أحرف على الأقل)'); return
    }
    try {
      const response = await customerFetch(`${API}/customer/register`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({...form, captchaToken})
      })
      const result = await response.json()
      if (!result.verification_required) throw new Error('لم يتم طلب تأكيد الموبايل')
      setVerificationPhone(form.phone)
      setVerificationCode('')
      setShowForm(false)
      setShowVerifyForm(true)
    } catch (error) {
      setCaptchaToken('')
      alert('تعذر التسجيل: ' + error.message)
    }
  }
  const handleVerifyPhone = async () => {
    if (!/^\d{6,8}$/.test(verificationCode)) {
      alert('اكتب رمز SMS المكون من 6 أرقام'); return
    }
    try {
      const response = await customerFetch(`${API}/customer/verify`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({phone:verificationPhone,code:verificationCode})
      })
      await activateCustomer(await response.json())
      setShowVerifyForm(false)
      setVerificationPhone('')
      setVerificationCode('')
      setForm({name:'',phone:'',company:'',address:'',pass:''})
      alert('تم تأكيد الموبايل وتفعيل الحساب ✅')
    } catch (error) {
      alert('تعذر التحقق: ' + error.message)
    }
  }
  const handleLogin = async () => {
    if (!login.phone || !login.pass) { alert('اكتب رقم التليفون والباسورد'); return }
    try {
      const response = await customerFetch(`${API}/customer/login`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(login)
      })
      await activateCustomer(await response.json())
      setShowLogin(false)
      setLogin({phone:'',pass:''})
    } catch (error) {
      alert('تعذر الدخول: ' + error.message)
    }
  }
  const handleAdminLogin = async () => {
    const email = adminLogin.user.trim()
    const password = adminLogin.pass
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      alert('إعدادات Supabase العامة غير متاحة. راجع Vercel وأعد النشر.')
      return
    }
    if (!email || !password) { alert('اكتب الإيميل وكلمة المرور'); return }
    setAdminBusy(true)
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
        body: JSON.stringify({ email, password })
      })
      const auth = await response.json()
      if (!response.ok || !auth.access_token) throw new Error('الإيميل أو كلمة المرور غير صحيحة')
      // التحقق من عضوية admin_users يتم على السيرفر فقط
      await apiRead('categories', auth.access_token)
      sessionStorage.setItem(TOKEN_KEY, auth.access_token)
      setLoggedEmployee({ name: 'المدير العام', permissions: {
        dashboard: true, employees: true, categories: true,
        products: true, clients: true, orders: true, shipping: true
      } })
      setShowAdmin(true)
      setShowAdminLogin(false)
      setAdminLogin({ user: '', pass: '' })
      await loadAll(auth.access_token)
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY)
      alert('تعذر دخول المدير: ' + error.message)
    } finally { setAdminBusy(false) }
  }
  const addToCart = (product, qty) => {
    if(!loggedClient){ setShowLogin(true); return }
    let pB = product.pricesB; let pV = product.pricesVIP;
    try{ if(typeof pB==='string') pB=JSON.parse(pB) }catch{}
    try{ if(typeof pV==='string') pV=JSON.parse(pV) }catch{}
    const price = loggedClient.type === 'VIP'? pV?.[qty] : pB?.[qty];
    if(price===undefined || price===null || price==='') return;
    setCart(prev => [...prev, { id: Date.now(), productId: product.id, subCategoryId: product.subCategoryId, name: product.name, image: product.image||'', qty: Number(qty), price: Number(price), total: Number(price) }]);
    setShowCart(true)
  }
  const handlePlaceOrder = async () => {
    if (orderBusy) return
    if (!loggedClient || !sessionStorage.getItem(CUSTOMER_TOKEN_KEY)) {
      alert('سجل دخول العميل أولاً'); setShowLogin(true); return
    }
    if (!cart.length) { alert('اختر منتجاً أولاً'); return }
    if (!orderFile) { alert('ارفع ملف PDF الخاص بالشغل أولاً'); return }
    const maxSize = (USE_DIRECT_PDF_UPLOAD ? 6 : 2) * 1024 * 1024
    if (!orderFile.name.toLowerCase().endsWith('.pdf') || orderFile.size > maxSize || orderFile.size === 0) {
      alert(`الملف لازم يكون PDF بحد أقصى ${USE_DIRECT_PDF_UPLOAD ? 6 : 2} ميجابايت`); return
    }
    setOrderBusy(true)
    try {
      const signature = await orderFile.slice(0, 5).text()
      if (signature !== '%PDF-') throw new Error('محتوى الملف مش PDF صالح')
      let filePayload
      if (USE_DIRECT_PDF_UPLOAD) {
        const request = await customerFetch(`${API}/customer/upload-url`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({fileName:orderFile.name,fileSize:orderFile.size})
        })
        const grant = await request.json()
        if (!grant.uploadUrl || !grant.path || !SUPABASE_URL ||
            new URL(grant.uploadUrl).origin !== new URL(SUPABASE_URL).origin) {
          throw new Error('رابط الرفع غير صالح')
        }
        const formData = new FormData()
        formData.append('cacheControl','0')
        formData.append('',orderFile)
        const uploaded = await fetch(grant.uploadUrl, {
          method:'PUT', body:formData, headers:{'x-upsert':'false'}
        })
        if (!uploaded.ok) throw new Error('فشل رفع PDF إلى مساحة التخزين')
        filePayload = {uploadPath:grant.path}
      } else {
        filePayload = {fileData:await readFileAsDataUrl(orderFile)}
      }
      const response = await customerFetch(`${API}/customer/orders`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          items:cart.map(item => ({productId:item.productId,qty:item.qty})),
          workerName:orderClientName.trim(), notes:orderNotes,
          paymentMethod:customerPaymentMethod, fileName:orderFile.name,
          ...filePayload
        })
      })
      const created = await response.json()
      setOrders(previous => [...previous, created])
      setCart([]); setOrderClientName(''); setOrderNotes('')
      setOrderFile(null); setCustomerPaymentMethod('نقدي'); setShowCart(false)
      setShowMyOrders(true)
      alert('تم حفظ الطلب ✅ السيريال: ' + created.serialNumber)
    } catch (error) {
      alert('تعذر حفظ الطلب: ' + error.message)
    } finally {
      setOrderBusy(false)
    }
  }
  const getPriceForDisplay = (product, qty) => { let pB = product.pricesB; let pV = product.pricesVIP; try{ if(typeof pB==='string') pB=JSON.parse(pB) }catch{} try{ if(typeof pV==='string') pV=JSON.parse(pV) }catch{} const price = loggedClient? (loggedClient.type === 'VIP'? pV?.[qty] : pB?.[qty]) : pB?.[qty]; if(price===undefined || price===null || price==='') return null; return price }
  const handleEditProduct = (p) => { let b = p.pricesB || {}; let vip = p.pricesVIP || {}; try{ if(typeof b==='string') b=JSON.parse(b) }catch{} try{ if(typeof vip==='string') vip=JSON.parse(vip) }catch{} setProductForm({ name: p.name, categoryId: p.categoryId||'', subCategoryId: p.subCategoryId||'', image: p.image||'', id: p.id, pricesB: {...{1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''},...b}, pricesVIP: {...{1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''},...vip} }); setShowProductForm(true) }
  const handleCreateFolder = async () => { if(!newFolderName.trim()){ alert('اكتب اسم الفولدر'); return } const newF = { name: newFolderName.trim(), date: new Date().toLocaleString('ar-EG'), status: 'جديد', orderIds: [] }; await apiFetch(`${API}/folders`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(newF)}); setNewFolderName(''); loadAll() }
  const handleUpdateFolderStatus = async (folder, newStatus) => { await apiFetch(`${API}/folders/${folder.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status: newStatus})}); for(const oid of (folder.orderIds||[])){ await apiFetch(`${API}/orders/${oid}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status: newStatus})}) } loadAll() }
  const handleAddOrderToFolder = async (folderId, orderId) => { const f = folders.find(x=> x.id===folderId); if(!f) return; const newIds = [...new Set([...(f.orderIds||[]), orderId])]; await apiFetch(`${API}/folders/${folderId}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({orderIds: newIds})}); loadAll() }
  const handleMoveOrderToFolder = async (fromFolderId, toFolderId, orderId) => {
    if(!toFolderId || Number(toFolderId)===Number(fromFolderId)) return;
    const from = folders.find(f=>Number(f.id)===Number(fromFolderId));
    const to = folders.find(f=>Number(f.id)===Number(toFolderId));
    if(!to) return;
    const fromIds = (from?.orderIds||[]).filter(id=>Number(id)!==Number(orderId));
    const toIds = [...new Set([...(to.orderIds||[]), orderId])];
    const headers={'Content-Type':'application/json'};
    if(from) await apiFetch(`${API}/folders/${from.id}`, {method:'PUT', headers, body:JSON.stringify({orderIds:fromIds})});
    await apiFetch(`${API}/folders/${to.id}`, {method:'PUT', headers, body:JSON.stringify({orderIds:toIds})});
    loadAll();
  }
  const handleRemoveOrderFromFolder = async (folderId, orderId) => { const f = folders.find(x=> x.id===folderId); const newIds = (f.orderIds||[]).filter(id=> Number(id)!==Number(orderId)); await apiFetch(`${API}/folders/${folderId}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({orderIds: newIds})}); loadAll() }
  const handleDeleteFolder = async (folder) => { const enteredPass = String(deletePass).trim(); const empPass = String(loggedEmployee?.pass||'').trim(); const isAdmin = Boolean(sessionStorage.getItem(TOKEN_KEY)); if(!isAdmin){ alert('باسورد التأكيد غلط ❌'); return } await apiFetch(`${API}/folders/${folder.id}`, {method:'DELETE'}); setShowDeleteConfirm(null); setDeletePass(''); loadAll() }

  const catalogVisible = products.filter(product => {
    const q = catalogSearch.trim().toLocaleLowerCase('ar-EG')
    const sub = subCategories.find(x => String(x.id) === String(product.subCategoryId))
    return (!q || String(product.name||'').toLocaleLowerCase('ar-EG').includes(q))
      && (catalogCategory==='all' || String(product.categoryId||sub?.categoryId||'')===String(catalogCategory))
  })
  const ProductCard = ({ product }) => (
    <div className="elmarwa-product-card" style={{background:'white'}}>
      {product.image? <img className="elmarwa-product-image" src={product.image} alt={product.name} loading="lazy" style={{width:'100%',objectFit:'cover'}} /> : <div className="elmarwa-product-placeholder">🖨️ صورة المنتج</div>}
      <div style={{padding: '15px'}}>
        <h3 style={{ color: '#1e3a8a', margin: '0 0 5px 0', fontSize:'16px', fontWeight:900 }}>{product.name}</h3>
        <div style={{background: '#f8fafc', borderRadius: '10px', padding: '10px', border:'1px solid #eef2f7'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '2px solid #1e3a8a', paddingBottom: '5px', fontSize: '12px'}}><span>الكمية</span><span>السعر</span><span></span></div>
          {quantities.map(q => { const price = getPriceForDisplay(product, q); if(price===null) return null; return (<div key={q} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #eee', fontSize: '13px'}}><span>{q}</span><span style={{color: '#16a34a', fontWeight: 'bold'}}>{price}ج</span><button onClick={() => addToCart(product, q)} style={{...btnStyle, background: '#1e3a8a', color: 'white', padding: '4px 14px', fontSize: '12px', margin: 0, borderRadius:'20px'}}>طلب</button></div>) })}
        </div>
      </div>
    </div>
  )

  const OrderAdminCard = ({ o, folderId=null }) => {
    const items = safeItems(o)
    const total = Number(o.total) || 0
    const [draftStatus, setDraftStatus] = useState(o.status || 'جديد')
    const [draftPaid, setDraftPaid] = useState(String(o.paidAmount || 0))
    const [draftMethod, setDraftMethod] = useState(o.paymentMethod || 'نقدي')
    const [saving, setSaving] = useState(false)
    useEffect(() => { setDraftStatus(o.status || 'جديد'); setDraftPaid(String(o.paidAmount || 0)); setDraftMethod(o.paymentMethod || 'نقدي') }, [o.id, o.status, o.paidAmount, o.paymentMethod])
    const paid = Number(o.paidAmount) || 0
    const remaining = total - paid
    const payStatus = o.paymentStatus || getPaymentStatus(total, paid)
    const saveOrderChanges = async () => {
      const np = Math.max(0, Number(draftPaid)||0)
      setSaving(true)
      await updateOrder(o.id, {status:draftStatus, paidAmount:np, paymentStatus:getPaymentStatus(total,np), paymentMethod:draftMethod})
      setSaving(false)
      alert('تم حفظ تعديلات الأوردر بالكامل ✅')
    }
    return (
      <div id={`order-${o.id}`} style={{background:'white',borderRadius:'14px',marginBottom:'10px',border:'1px solid #dbe3ef',borderRight:`6px solid ${statusColor(o.status||'جديد')}`,overflow:'hidden',boxShadow:'0 3px 10px rgba(15,23,42,.06)'}}>
        <div style={{padding:'9px 11px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',background:'#f8fafc',borderBottom:'1px solid #e5e7eb'}}>
          <div style={{display:'flex',alignItems:'center',gap:'7px',flexWrap:'wrap'}}>
            <b style={{fontSize:'13px'}}>👤 العميل: {o.clientName}</b>
            <span style={{fontSize:'11px',color:'#64748b'}}>📞 {o.clientPhone}</span>
            {o.workerName && <span style={{background:'#e0e7ff',color:'#3730a3',padding:'3px 8px',borderRadius:'10px',fontSize:'10px',fontWeight:900}}>👷 الشغال: {o.workerName}</span>}
            <span style={{background:'#0f172a',color:'white',padding:'2px 7px',borderRadius:'10px',fontSize:'10px',fontWeight:900}}>🔢 {o.serialNumber||o.id}</span>
            <span style={{background:statusColor(o.status),color:'white',padding:'3px 9px',borderRadius:'10px',fontSize:'10px',fontWeight:900}}>{o.status||'جديد'}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}><span style={{fontSize:'11px',color:'#475569'}}>📅 {o.date}</span><b style={{fontSize:'13px',color:'#16a34a'}}>{total}ج</b><button onClick={()=>printSticker(o)} style={{...btnStyle,background:'#111827',color:'white',padding:'4px 8px',fontSize:'10px',margin:0}}>🖨️ 4×2</button></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(200px,1.7fr) repeat(3,minmax(110px,.7fr))',gap:'7px',padding:'8px 10px'}}>
          <div style={{background:'#f8fafc',border:'1px solid #eef2f7',borderRadius:'8px',padding:'7px'}}>
            <div style={{fontSize:'10px',color:'#64748b',marginBottom:'4px'}}>المنتجات</div>
            {items.slice(0,3).map((it,i)=>{const prod=products.find(p=>String(p.id)===String(it.productId)); const img=it.image||prod?.image; return <div key={i} style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px'}}><div style={{width:'34px',height:'34px',borderRadius:'6px',overflow:'hidden',background:'#e2e8f0',flexShrink:0}}>{img&&<img src={img} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}</div><div style={{minWidth:0,flex:1}}><div style={{fontWeight:800,fontSize:'11px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.name}</div><div style={{fontSize:'9px',color:'#64748b'}}>كمية {it.qty}</div></div><b style={{fontSize:'10px',color:'#1e3a8a'}}>{it.price}ج</b></div>})}
            {items.length>3&&<div style={{fontSize:'9px',color:'#64748b'}}>+ {items.length-3} منتجات أخرى</div>}
            {o.notes&&<div style={{fontSize:'9px',color:'#b45309',marginTop:'4px'}}>📝 {o.notes}</div>}
          </div>
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',padding:'7px'}}><div style={{fontSize:'10px',color:'#64748b'}}>💰 الدفع الحالي</div><div style={{fontWeight:900,color:'#16a34a',fontSize:'12px'}}>مدفوع {paid}ج</div><div style={{fontSize:'10px',color:remaining>0?'#ef4444':'#16a34a'}}>باقي {remaining}ج</div><div style={{fontSize:'9px',marginTop:'3px'}}>{o.paymentMethod||'نقدي'} • {payStatus}</div></div>
          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'7px'}}><div style={{fontSize:'10px',color:'#64748b'}}>📅 المواعيد</div><div style={{fontSize:'10px',fontWeight:800}}>تنفيذ: {o.executionDate||'-'}</div><div style={{fontSize:'10px',fontWeight:800}}>جاهز: {o.readyDate||'-'}</div></div>
          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'8px',padding:'7px'}}><div style={{fontSize:'10px',color:'#64748b'}}>📎 ملف العميل</div><div style={{fontSize:'9px',fontWeight:800,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{o.fileName||'بدون ملف'}</div><button disabled={!o.fileData} onClick={()=>downloadOrderFile(o)} style={{...btnStyle,background:o.fileData?'#2563eb':'#94a3b8',color:'white',margin:'5px 0 0',padding:'5px 8px',fontSize:'10px',width:'100%'}}>⬇️ تحميل الملف</button></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr 1fr',gap:'7px',padding:'8px 10px',background:'#f8fafc',borderTop:'1px solid #eef2f7'}}>
          <div><label style={{fontSize:'9px',fontWeight:900}}>🔄 الحالة الجديدة</label><select value={draftStatus} onChange={e=>setDraftStatus(e.target.value)} style={{...inputStyle,margin:'3px 0 0',padding:'7px',fontSize:'11px',border:`2px solid ${statusColor(draftStatus)}`}}>{orderStatuses.map(st=><option key={st} value={st}>{st}</option>)}</select></div>
          <div><label style={{fontSize:'9px',fontWeight:900}}>💰 المبلغ المدفوع</label><input type="number" value={draftPaid} onChange={e=>setDraftPaid(e.target.value)} style={{...inputStyle,margin:'3px 0 0',padding:'7px',fontSize:'11px'}}/></div>
          <div><label style={{fontSize:'9px',fontWeight:900}}>💳 طريقة الدفع</label><select value={draftMethod} onChange={e=>setDraftMethod(e.target.value)} style={{...inputStyle,margin:'3px 0 0',padding:'7px',fontSize:'11px'}}>{paymentMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
        </div>
        <div style={{display:'flex',gap:'7px',alignItems:'center',padding:'7px 10px',flexWrap:'wrap'}}>
          <button onClick={saveOrderChanges} disabled={saving} style={{...btnStyle,background:'#16a34a',color:'white',margin:0,padding:'8px 16px',fontSize:'11px',fontWeight:900}}>{saving?'جاري الحفظ...':'💾 حفظ كل تعديلات الأوردر'}</button>
          <select value="" onChange={e=>{if(e.target.value)handleAddOrderToFolder(Number(e.target.value),o.id)}} style={{flex:1,minWidth:'180px',padding:'7px 8px',borderRadius:'7px',border:'1px solid #cbd5e1',fontSize:'10px'}}><option value="">⚙️ إضافة لفولدر التشغيل...</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
          {o.paymentProof&&<span style={{fontSize:'9px',background:'#dcfce7',color:'#166534',padding:'5px 7px',borderRadius:'7px'}}>📸 تحويل مرفوع</span>}
        </div>
      </div>
    )
  }

  if(showAdmin){
    const filteredClients = clients.filter(c=>!clientSearch || c.name.includes(clientSearch) || c.phone.includes(clientSearch))
    const operationOrders = orders.filter(o=>!folders.some(f=> (f.orderIds||[]).map(Number).includes(Number(o.id))) && ['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم'].includes(o.status))
    const selectedFolder = folders.find(f=>Number(f.id)===Number(selectedFolderId))
    const orderBelongsToSub = (o, subId) => safeItems(o).some(it=>Number(it.subCategoryId)===Number(subId))
    const orderSubGroups = subCategories.map(sub=>({sub, list: orders.filter(o=>orderBelongsToSub(o, sub.id)).filter(o=>ordersStatusFilter==='الكل'||o.status===ordersStatusFilter)})).filter(g=>g.list.length>0)
    const uncategorizedOrders = orders.filter(o=>{ const its=safeItems(o); return its.length===0 || its.every(it=>!it.subCategoryId) }).filter(o=>ordersStatusFilter==='الكل'||o.status===ordersStatusFilter)
    return (
      <>
      <style>{`
        @media (max-width: 900px) {
          .admin-shell { flex-direction: column !important; }
          .admin-sidebar { width: 100% !important; height: auto !important; position: relative !important; }
          .admin-main { padding: 10px !important; }
          .admin-menu { display:grid !important; grid-template-columns:repeat(2,1fr) !important; gap:4px !important; }
          .order-controls { grid-template-columns:1fr !important; }
        }
        @media (max-width: 650px) {
          .order-summary { grid-template-columns:1fr 1fr !important; }
        }
      `}</style>
      <div className="admin-shell" style={{ display: 'flex', minHeight: '100vh', direction: 'rtl', fontFamily: 'Tahoma', background: '#f1f5f9' }}>
        <div className="admin-sidebar" style={{ width: '260px', background: '#0f172a', color: 'white', padding: '20px 10px', position:'sticky', top:0, height:'100vh', overflowY:'auto', boxSizing:'border-box' }}>
          <h3 style={{textAlign: 'center'}}>المروة ✅ - {loggedEmployee?.name}</h3>
          {(() => { let perms = loggedEmployee?.permissions; try{ if(typeof perms==='string') perms=JSON.parse(perms) }catch{}; const isAdmin = loggedEmployee?.name === 'المدير العام'; const can = (k) => isAdmin ||!!perms?.[k]; return (<div className="admin-menu">{can('dashboard') && <button onClick={()=> setAdminTab('dashboard')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='dashboard'?'#1e40af':'transparent', color:'white'}}>📊 تحكم</button>}{can('orders') && <button onClick={()=> setAdminTab('orders')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='orders'?'#1e40af':'transparent', color:'white'}}>📦 اوردرات ({orders.length})</button>}{can('shipping') && <button onClick={()=> setAdminTab('operation')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='operation'?'#16a34a':'transparent', color:'white', fontWeight:'bold'}}>⚙️ التشغيل ({folders.length} فولدر)</button>}{can('orders') && <><button onClick={()=> setAdminTab('accounts')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='accounts'?'#0ea5e9':'transparent', color:'white', fontWeight:'bold'}}>💰 الحسابات</button><button onClick={()=> setAdminTab('deliveryAccounts')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='deliveryAccounts'?'#475569':'transparent', color:'white', fontWeight:'bold'}}>🚚 حسابات التسليمات</button></>}{can('clients') && <button onClick={()=> setAdminTab('clients')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='clients'?'#1e40af':'transparent', color:'white'}}>👥 عملاء ({clients.length})</button>}{can('categories') && <button onClick={()=> setAdminTab('categories')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='categories'?'#1e40af':'transparent', color:'white'}}>📁 تصنيفات</button>}{can('products') && <button onClick={()=> setAdminTab('products')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='products'?'#1e40af':'transparent', color:'white'}}>🏷️ منتجات ({products.length})</button>}{can('employees') && <button onClick={()=> setAdminTab('employees')} style={{width:'100%', textAlign:'right', padding:'12px', margin:'4px 0', borderRadius:'8px', border:'none', cursor:'pointer', background: adminTab==='employees'?'#f59e0b':'#334155', color:'white', fontWeight:'bold'}}>👷 موظفين ({employees.length})</button>}</div>)})()}
          <button onClick={() => {sessionStorage.removeItem(TOKEN_KEY); setShowAdmin(false); setLoggedEmployee(null); setClients([]); setOrders([]); setEmployees([]); setFolders([]); setProducts([]); loadPublicCatalog()}} style={{...btnStyle, background: '#ef4444', color: 'white', width:'100%', marginTop:'20px'}}>🚪 خروج للرئيسية</button>
        </div>
        <div className="admin-main" style={{ flex: 1, padding: '15px', minWidth:0 }}>
          {adminTab==='dashboard' && (() => {
            const active = orders.filter(o => !['تم التسليم','ملغي'].includes(o.status))
            const collected = orders.reduce((sum,o) => sum + (Number(o.paidAmount)||0),0)
            const outstanding = orders.reduce((sum,o) => sum + Math.max(0,(Number(o.total)||0)-(Number(o.paidAmount)||0)),0)
            const recent = [...orders].sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,7)
            const metrics = [
              {label:'أوردرات مفتوحة',value:active.length,icon:'📦',hint:'طلبات لم يتم تسليمها بعد'},
              {label:'العملاء المسجلون',value:clients.length,icon:'👥',hint:'عدد العملاء داخل النظام'},
              {label:'المبالغ المحصلة',value:collected.toLocaleString('ar-EG')+' ج',icon:'💳',hint:'إجمالي المبالغ المدفوعة'},
              {label:'المبالغ المتبقية',value:outstanding.toLocaleString('ar-EG')+' ج',icon:'📊',hint:'إجمالي المبالغ المستحقة'}
            ]
            return <section aria-label="لوحة التحكم">
              <div className="admin-dashboard-heading">
                <div><h2>لوحة التحكم</h2><p>ملخص الأوردرات والتشغيل والحسابات</p></div>
                <button onClick={()=>setShowAdmin(false)} style={{...btnStyle,background:'#164b96',color:'#fff',margin:0}}>🌐 عرض الموقع</button>
              </div>
              <div className="dashboard-stats">
                {metrics.map(m=><div key={m.label} className="dashboard-stat">
                  <div className="dashboard-stat-label"><span>{m.label}</span><i aria-hidden="true">{m.icon}</i></div>
                  <div className="dashboard-stat-number">{m.value}</div>
                  <div className="dashboard-stat-hint">{m.hint}</div>
                </div>)}
              </div>
              <section className="dashboard-section">
                <div className="dashboard-section-title"><h3>حالة الشغل</h3><small>{orders.length} أوردر إجمالي</small></div>
                <div className="dashboard-status-grid">
                  {orderStatuses.map(st=>{
                    const count=orders.filter(o=>o.status===st).length
                    return <button key={st} className="dashboard-status" onClick={()=>{setOrdersStatusFilter(st);setAdminTab('orders')}}>
                      <small>{st}</small><strong>{count.toLocaleString('ar-EG')}</strong>
                      <div className="dashboard-status-bar"><span className="dashboard-status-fill" style={{width:`${orders.length ? count/orders.length*100 : 0}%`,background:statusColor(st)}} /></div>
                    </button>
                  })}
                </div>
              </section>
              <section className="dashboard-section">
                <div className="dashboard-section-title"><h3>آخر الأوردرات</h3><button onClick={()=>{setOrdersStatusFilter('الكل');setAdminTab('orders')}} style={{...btnStyle,padding:'8px 12px',margin:0,background:'#e8f1ff',color:'#1b4f9f',fontSize:12}}>عرض الكل ←</button></div>
                {recent.length===0 ? <div className="elmarwa-empty">مفيش أوردرات مسجلة حاليًا</div> :
                  <div className="dashboard-recent-orders"><table>
                    <thead><tr><th>السيريال</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th></tr></thead>
                    <tbody>{recent.map(o=><tr key={o.id} onClick={()=>{setOrdersStatusFilter('الكل');setOrderSearch(String(o.clientPhone||o.clientName||''));setAdminTab('orders')}} title="عرض أوردرات العميل">
                      <td style={{fontWeight:800,color:'#1b4f9f'}}>{o.serialNumber||o.id}</td><td>{o.clientName||'غير محدد'}</td>
                      <td>{(Number(o.total)||0).toLocaleString('ar-EG')} ج</td>
                      <td><span className="elmarwa-status-chip" style={{background:statusColor(o.status)+'20',color:statusColor(o.status)}}>{o.status||'جديد'}</span></td>
                      <td>{o.date||'-'}</td>
                    </tr>)}</tbody>
                  </table></div>}
              </section>
              <section className="dashboard-section">
                <div className="dashboard-section-title"><h3>إجراءات سريعة</h3></div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  {[['📦 الأوردرات','orders'],['⚙️ التشغيل','operation'],['👥 العملاء','clients'],['🏷️ المنتجات','products'],['💰 الحسابات','accounts']].map(([label,tab])=><button key={tab} onClick={()=>setAdminTab(tab)} style={{...btnStyle,background:'#eaf2ff',color:'#173d75',margin:0,padding:'10px 15px'}}>{label}</button>)}
                </div>
              </section>
            </section>
          })()}

          {adminTab==='orders' && <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px',flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 4px'}}>📦 الأوردرات</h2><div style={{fontSize:'12px',color:'#64748b'}}>بحث بالاسم أو رقم التليفون • الطلبات غير المسلّمة فقط</div></div><button onClick={()=>setShowAdmin(false)} style={{...btnStyle,background:'#0f172a',color:'white'}}>🌐 الرئيسية</button></div>
            <div style={{background:'white',padding:'10px',borderRadius:'12px',marginTop:'10px',display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
              <input value={orderSearch} onChange={e=>setOrderSearch(e.target.value)} placeholder="🔍 اسم العميل أو رقم التليفون" style={{...inputStyle,margin:0,flex:1,minWidth:'240px'}}/>
              <button onClick={()=>setOrderSearch('')} style={{...btnStyle,margin:0,background:'#e2e8f0',color:'#334155'}}>مسح البحث</button>
              <span style={{background:'#dbeafe',color:'#1e40af',padding:'8px 12px',borderRadius:'18px',fontWeight:900,fontSize:'12px'}}>{visibleDashboardOrders.length} طلب</span>
            </div>
            <div style={{background:'white',padding:'9px',borderRadius:'12px',marginTop:'8px',display:'flex',gap:'6px',flexWrap:'wrap'}}>{['الكل',...orderStatuses.filter(s=>s!=='تم التسليم'&&s!=='ملغي')].map(s=><button key={s} onClick={()=>setOrdersStatusFilter(s)} style={{...btnStyle,margin:0,padding:'7px 11px',fontSize:'11px',background:ordersStatusFilter===s?statusColor(s):'#e2e8f0',color:ordersStatusFilter===s?'white':'#334155'}}>{s}</button>)}</div>
            <div style={{marginTop:'12px'}}>
              {(()=>{
                const filtered = visibleDashboardOrders.filter(o=>ordersStatusFilter==='الكل'||o.status===ordersStatusFilter)
                const productGroups = products.map(p=>({product:p,list:filtered.filter(o=>safeItems(o).some(it=>String(it.productId)===String(p.id)))})).filter(g=>g.list.length)
                const usedIds = new Set(productGroups.flatMap(g=>g.list.map(o=>o.id)))
                const others = filtered.filter(o=>!usedIds.has(o.id))
                return <>{productGroups.map(({product,list})=><section key={product.id} style={{marginBottom:'18px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#dbeafe',borderRight:'6px solid #2563eb',padding:'10px 13px',borderRadius:'10px 10px 0 0'}}><b style={{fontSize:'16px',color:'#1e3a8a'}}>🏷️ {product.name}</b><span style={{background:'#2563eb',color:'white',padding:'4px 10px',borderRadius:'15px',fontSize:'11px'}}>{list.length} أوردر</span></div><div style={{padding:'8px',background:'#f8fafc',border:'1px solid #dbeafe',borderTop:0,borderRadius:'0 0 10px 10px'}}>{list.sort((a,b)=>b.id-a.id).map(o=><OrderAdminCard key={`${product.id}-${o.id}`} o={o}/>)}</div></section>)}
                {others.length>0&&<section><div style={{background:'#e5e7eb',borderRight:'6px solid #64748b',padding:'10px 13px',borderRadius:'10px 10px 0 0'}}><b>📦 أوردرات بدون منتج معروف</b><span style={{marginRight:'10px',fontSize:'11px'}}>({others.length})</span></div><div style={{padding:'8px',background:'#f8fafc'}}>{others.sort((a,b)=>b.id-a.id).map(o=><OrderAdminCard key={o.id} o={o}/>)}</div></section>}
                {!filtered.length&&<div style={{background:'white',padding:'40px',textAlign:'center',borderRadius:'12px'}}>لا يوجد أوردرات مطابقة للبحث أو الفلتر</div>}
              </>})()}
            </div>
          </div>}
          {adminTab==='operation' && <div>
            {!selectedFolder ? <><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px'}}><h2>⚙️ قسم التشغيل - الفولدرات</h2><button onClick={()=>setShowAdmin(false)} style={{...btnStyle,background:'#0f172a',color:'white'}}>🌐 الرئيسية</button></div>
              <div style={{background:'white',padding:'12px',borderRadius:'12px',marginTop:'10px',display:'flex',gap:'8px'}}><input placeholder="اسم الفولدر الجديد" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} style={{...inputStyle,margin:0,flex:1}}/><button onClick={handleCreateFolder} style={{...btnStyle,background:'#16a34a',color:'white',margin:0}}>+ إنشاء فولدر</button></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:'12px',marginTop:'14px'}}>
                {folders.map(folder=>{ const count=orders.filter(o=>(folder.orderIds||[]).map(Number).includes(Number(o.id))).length; return <div key={folder.id} onClick={()=>setSelectedFolderId(folder.id)} style={{background:'white',padding:'16px',borderRadius:'14px',borderRight:`7px solid ${statusColor(folder.status)}`,boxShadow:'0 3px 10px rgba(15,23,42,.06)',cursor:'pointer'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{fontSize:'17px'}}>📁 {folder.name}</b><span style={{background:'#dbeafe',color:'#1e40af',padding:'4px 8px',borderRadius:'12px',fontSize:'11px'}}>{count} اوردر</span></div>
                  <div style={{fontSize:'11px',color:'#64748b',marginTop:'8px'}}>📅 {folder.date}</div><div style={{marginTop:'8px',fontSize:'12px',fontWeight:'bold',color:statusColor(folder.status)}}>الحالة: {folder.status}</div>
                  <div style={{display:'flex',gap:'5px',marginTop:'10px'}}><button onClick={e=>{e.stopPropagation();setEditFolderId(folder.id);setEditFolderName(folder.name)}} style={{...btnStyle,background:'#f59e0b',color:'white',fontSize:'10px',margin:0}}>✏️ تعديل</button><button onClick={e=>{e.stopPropagation();setShowDeleteConfirm(folder.id)}} style={{...btnStyle,background:'#ef4444',color:'white',fontSize:'10px',margin:0}}>🗑️ مسح</button></div>
                  {editFolderId===folder.id && <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:'5px',marginTop:'8px'}}><input value={editFolderName} onChange={e=>setEditFolderName(e.target.value)} style={{...inputStyle,margin:0,padding:'6px'}}/><button onClick={async()=>{await apiFetch(`${API}/folders/${folder.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:editFolderName})});setEditFolderId(null);loadAll()}} style={{...btnStyle,background:'#16a34a',color:'white',margin:0}}>حفظ</button></div>}
                </div>})}
              </div>
              {folders.length===0 && <div style={{background:'white',padding:'30px',textAlign:'center',borderRadius:'12px',marginTop:'15px'}}>لا يوجد فولدرات - أنشئ أول فولدر</div>}
              {operationOrders.length>0 && <div style={{background:'white',padding:'14px',borderRadius:'12px',marginTop:'18px'}}><h3>📦 اوردرات بدون فولدر ({operationOrders.length})</h3>{operationOrders.map(o=><div key={o.id} style={{display:'flex',justifyContent:'space-between',gap:'8px',padding:'8px',borderBottom:'1px solid #eee',fontSize:'12px'}}><span>#{o.serialNumber||o.id} - {o.clientName} - {o.total}ج</span><select onChange={e=>{if(e.target.value)handleAddOrderToFolder(Number(e.target.value),o.id)}}><option value="">+ أضف لفولدر</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>)}</div>}
            </> : <div>
              {(()=>{ const folder=selectedFolder; const folderOrders=folder?orders.filter(o=>(folder.orderIds||[]).map(Number).includes(Number(o.id))).sort((a,b)=>b.id-a.id):[]; return <><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px'}}><div><button onClick={()=>setSelectedFolderId(null)} style={{...btnStyle,background:'#64748b',color:'white'}}>⬅️ رجوع للفولدرات</button><h2 style={{display:'inline-block',marginRight:'10px'}}>📁 {folder?.name}</h2></div>{folder && <select value={folder.status} onChange={e=>handleUpdateFolderStatus(folder,e.target.value)} style={{padding:'9px',borderRadius:'8px',border:`2px solid ${statusColor(folder.status)}`,fontWeight:'bold'}}>{folderStatuses.map(s=><option key={s} value={s}>{s}</option>)}</select>}</div>
                {folderOrders.length===0 ? <div style={{background:'white',padding:'40px',textAlign:'center',borderRadius:'12px'}}>الفولدر فارغ</div> : <div style={{marginTop:'12px'}}>{folderOrders.map(o=><div key={o.id}><div style={{background:'#eef2ff',padding:'6px 9px',borderRadius:'8px 8px 0 0',fontSize:'10px',fontWeight:900}}>نقل الأوردر لفولدر آخر: <select onChange={e=>{if(e.target.value)handleMoveOrderToFolder(folder.id,Number(e.target.value),o.id)}} defaultValue="" style={{marginRight:'6px',padding:'4px',borderRadius:'6px'}}><option value="">اختر الفولدر</option>{folders.filter(f=>Number(f.id)!==Number(folder.id)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><OrderAdminCard o={o} folderId={folder.id}/></div>)}</div>}
              </>})()}
            </div>}
          </div>}

          {adminTab==='accounts' && <div>
            {(()=>{
              const valid=orders.filter(o=>o.status!=='ملغي');
              const total=valid.reduce((s,o)=>s+(Number(o.total)||0),0); const paid=valid.reduce((s,o)=>s+(Number(o.paidAmount)||0),0); const remaining=total-paid;
              const byMethod=paymentMethods.map(m=>({method:m,total:valid.filter(o=>(o.paymentMethod||'نقدي')===m).reduce((s,o)=>s+(Number(o.total)||0),0),paid:valid.filter(o=>(o.paymentMethod||'نقدي')===m).reduce((s,o)=>s+(Number(o.paidAmount)||0),0)})).filter(x=>x.total||x.paid);
              const today=valid.filter(o=>String(o.executionDate||'')===accountingDate); const todayTotal=today.reduce((s,o)=>s+(Number(o.total)||0),0); const todayPaid=today.reduce((s,o)=>s+(Number(o.paidAmount)||0),0);
              return <><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}><div><h2>💰 الحسابات</h2><div style={{color:'#64748b',fontSize:'12px'}}>إجمالي الحسابات حسب الطلبات</div></div><button onClick={()=>setShowAdmin(false)} style={{...btnStyle,background:'#0f172a',color:'white'}}>🌐 الرئيسية</button></div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'10px',marginTop:'12px'}}>{[['الإجمالي الكلي',total,'#dbeafe','#1e40af'],['إجمالي المدفوع',paid,'#dcfce7','#166534'],['إجمالي المتبقي',remaining,'#fee2e2','#b91c1c'],['عدد الطلبات',valid.length,'#f1f5f9','#334155']].map(([t,v,b,c])=><div key={t} style={{background:b,padding:'16px',borderRadius:'12px',color:c,fontWeight:900}}>{t}<div style={{fontSize:'21px',marginTop:'6px'}}>{v}{typeof v==='number'&&t!=='عدد الطلبات'?' ج':''}</div></div>)}</div>
                <div style={{background:'white',padding:'14px',borderRadius:'12px',marginTop:'12px'}}><h3>طرق الدفع</h3>{byMethod.map(x=><div key={x.method} style={{display:'flex',justifyContent:'space-between',padding:'10px',borderBottom:'1px solid #eee'}}><b>{x.method}</b><span>إجمالي: {x.total}ج • مدفوع: {x.paid}ج • متبقي: {x.total-x.paid}ج</span></div>)}</div>
                <div style={{background:'white',padding:'14px',borderRadius:'12px',marginTop:'12px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h3>📅 حساب اليوم المجمع</h3><input type="date" value={accountingDate} onChange={e=>setAccountingDate(e.target.value)} style={{padding:'8px',borderRadius:'8px',border:'1px solid #cbd5e1'}}/></div><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px'}}><div style={{background:'#eff6ff',padding:'12px',borderRadius:'8px'}}>طلبات اليوم: <b>{today.length}</b></div><div style={{background:'#f0fdf4',padding:'12px',borderRadius:'8px'}}>إجمالي اليوم: <b>{todayTotal}ج</b></div><div style={{background:'#fef2f2',padding:'12px',borderRadius:'8px'}}>مدفوع اليوم: <b>{todayPaid}ج</b></div></div></div>
              </>
            })()}
          </div>}

          {adminTab==='deliveryAccounts' && <div>
            {(()=>{const delivered=orders.filter(o=>o.status==='تم التسليم'); const total=delivered.reduce((s,o)=>s+(Number(o.total)||0),0); const paid=delivered.reduce((s,o)=>s+(Number(o.paidAmount)||0),0); const remaining=total-paid; return <><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><h2>🚚 حسابات التسليمات</h2><div style={{fontSize:'12px',color:'#64748b'}}>الأوردرات التي حالتها تم التسليم فقط</div></div><button onClick={()=>setShowAdmin(false)} style={{...btnStyle,background:'#0f172a',color:'white'}}>🌐 الرئيسية</button></div><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginTop:'12px'}}><div style={{background:'#dbeafe',padding:'14px',borderRadius:'10px'}}>عدد التسليمات<br/><b>{delivered.length}</b></div><div style={{background:'#dbeafe',padding:'14px',borderRadius:'10px'}}>الإجمالي الكلي<br/><b>{total}ج</b></div><div style={{background:'#dcfce7',padding:'14px',borderRadius:'10px'}}>المدفوع<br/><b>{paid}ج</b></div><div style={{background:'#fee2e2',padding:'14px',borderRadius:'10px'}}>المتبقي<br/><b>{remaining}ج</b></div></div><div style={{background:'white',padding:'14px',borderRadius:'12px',marginTop:'12px'}}><h3>طرق الدفع للتسليمات</h3>{paymentMethods.map(m=>{const list=delivered.filter(o=>(o.paymentMethod||'نقدي')===m);const v=list.reduce((s,o)=>s+(Number(o.total)||0),0);if(!v)return null;return <div key={m} style={{display:'flex',justifyContent:'space-between',padding:'10px',borderBottom:'1px solid #eee'}}><b>{m}</b><span>{v}ج — مدفوع {list.reduce((s,o)=>s+(Number(o.paidAmount)||0),0)}ج</span></div>})}</div><div style={{marginTop:'12px'}}>{delivered.sort((a,b)=>b.id-a.id).map(o=><div key={o.id} style={{background:'white',padding:'10px',borderRadius:'9px',marginBottom:'6px',display:'flex',justifyContent:'space-between'}}><span><b>{o.clientName}</b> — #{o.serialNumber||o.id} — {o.workerName||'بدون شغال'}</span><span>{o.total}ج | {o.paymentMethod||'نقدي'} | مدفوع {o.paidAmount||0}ج</span></div>)}</div></>})()}
          </div>}

          {adminTab==='clients' && <div style={{background:'white', padding:'20px', borderRadius:'16px'}}><div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px'}}><h3 style={{margin:0}}>👥 العملاء</h3><div style={{display:'flex', gap:'10px'}}><input placeholder="🔍 بحث..." value={clientSearch} onChange={e=> setClientSearch(e.target.value)} style={{padding:'10px 14px', borderRadius:'20px', border:'1px solid #e2e8f0', width:'220px'}}/><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white', margin:0, borderRadius:'20px'}}>🌐 الرئيسية</button></div></div><div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'16px'}}><div style={{background:'#f8fafc', padding:'12px', borderRadius:'10px', textAlign:'center', fontWeight:'bold'}}>اجمالي: {filteredClients.length}</div><div style={{background:'#fef3c7', padding:'12px', borderRadius:'10px', textAlign:'center', fontWeight:'bold'}}>B: {filteredClients.filter(c=> c.type==='B').length}</div><div style={{background:'#dbeafe', padding:'12px', borderRadius:'10px', textAlign:'center', fontWeight:'bold'}}>VIP: {filteredClients.filter(c=> c.type==='VIP').length}</div></div><div style={{borderRadius:'12px', overflow:'hidden', border:'1px solid #e2e8f0'}}><table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}><thead><tr style={{background:'#0f172a', color:'white'}}><th style={{padding:'12px'}}>الاسم</th><th>الموبايل</th><th>الشركة</th><th>النوع</th><th>الطلبات</th><th>الرصيد</th></tr></thead><tbody>{filteredClients.map((c,i)=> {const cnt = orders.filter(o=> String(o.clientId)===String(c.id) || String(o.clientPhone).replace(/\D/g,'')===String(c.phone).replace(/\D/g,'')).length; return <tr key={c.id} style={{background: i%2===0?'white':'#f8fafc', borderBottom:'1px solid #eee'}}><td style={{padding:'10px', fontWeight:'bold'}}>{c.name}</td><td>{c.phone}</td><td>{c.company}</td><td><button onClick={async()=>{ const newType = c.type==='B'? 'VIP' : 'B'; if(!confirm(`تحويل ${c.name} من ${c.type} الى ${newType} ؟`)) return; await apiFetch(`${API}/clients/${c.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type: newType})}); loadAll(); }} style={{background: c.type==='VIP'?'#1e40af':'#f59e0b', color:'white', padding:'4px 12px', borderRadius:'20px', fontSize:'11px', border:'none', cursor:'pointer', fontWeight:'bold'}}>{c.type} 🔄</button></td><td style={{textAlign:'center'}}>{cnt}</td><td>{c.balance}ج</td></tr>})}</tbody></table></div></div>}
          {adminTab==='categories' && <div><div style={{display:'flex', justifyContent:'space-between', gap:'10px'}}><div><button onClick={()=> setShowCategoryForm(true)} style={{...btnStyle, background:'#f59e0b', color:'white'}}>+ رئيسي</button><button onClick={()=> setShowSubCategoryForm(true)} style={{...btnStyle, background:'#8b5cf6', color:'white'}}>+ فرعي</button></div><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white'}}>🌐 الرئيسية</button></div><div style={{background:'white', padding:'15px', marginTop:'10px', borderRadius:'12px'}}>{categories.map(cat=> <div key={cat.id} style={{padding:'8px', borderBottom:'1px solid #eee'}}>{cat.name} - فرعيات: {subCategories.filter(s=> Number(s.categoryId)===Number(cat.id)).length}</div>)}</div></div>}
          {adminTab==='products' && <div><div style={{display:'flex', justifyContent:'space-between'}}><button onClick={()=> setShowProductForm(true)} style={{...btnStyle, background:'#16a34a', color:'white'}}>+ منتج جديد</button><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white'}}>🌐 الرئيسية</button></div><div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'10px', marginTop:'10px'}}>{products.map(p=> <div key={p.id} style={{background:'white', padding:'12px', borderRadius:'8px', display:'flex', gap:'10px', alignItems:'center'}}><div style={{width:'50px', height:'50px', borderRadius:'8px', overflow:'hidden', background:'#f1f5f9'}}>{p.image? <img src={p.image} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : null}</div><div style={{flex:1}}><div style={{fontWeight:'bold'}}>{p.name}</div><button onClick={()=> handleEditProduct(p)} style={{...btnStyle, background:'#f59e0b', color:'white', fontSize:'11px', marginTop:'4px'}}>✏️ تعديل</button></div></div>)}</div></div>}
          {adminTab==='employees' && (<div><div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><h2>👷 الموظفين</h2><div><button onClick={()=> { setEmployeeForm({ id: null, name: '', phone: '', pass: '', permissions: { dashboard: true, orders: true, clients: true, categories: true, products: true, employees: false, shipping: true } }); setShowEmployeeForm(true)}} style={{...btnStyle, background:'#1e40af', color:'white'}}>+ اضافة</button><button onClick={()=> setShowAdmin(false)} style={{...btnStyle, background:'#0f172a', color:'white'}}>🌐 الرئيسية</button></div></div><div style={{background:'white', padding:'15px', borderRadius:'12px', marginTop:'10px'}}>{employees.map(e=> { let pr = e.permissions; try{ if(typeof pr==='string') pr=JSON.parse(pr) }catch{}; return (<div key={e.id} style={{padding:'12px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}><div><b>{e.name}</b> - 📞 {e.phone}<br/><small style={{color:'#666'}}>صلاحيات: {pr? Object.keys(pr).filter(k=> pr[k]).join(', ') : ''}</small></div><div><button onClick={()=> { setEmployeeForm({ id: e.id, name: e.name, phone: e.phone, pass: e.pass, permissions: pr||{ dashboard: true, orders: true, clients: true, categories: true, products: true, employees: false, shipping: true } }); setShowEmployeeForm(true)}} style={{...btnStyle, background:'#f59e0b', color:'white', fontSize:'12px'}}>تعديل</button><button onClick={async()=>{ if(confirm('حذف '+e.name+' ؟')){ await apiFetch(`${API}/employees/${e.id}`, {method:'DELETE'}); loadAll()}}} style={{...btnStyle, background:'#ef4444', color:'white', fontSize:'12px'}}>حذف</button></div></div>)})}</div></div>)}
        </div>
        {showCategoryForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:300}}><div style={{background:'white', padding:'20px', borderRadius:'12px', width:'350px'}}><h3>تصنيف رئيسي</h3><input placeholder="اسم التصنيف" value={categoryForm.name} onChange={e=> setCategoryForm({...categoryForm, name:e.target.value})} style={inputStyle}/><button onClick={saveCategory} disabled={categoryBusy} style={{...btnStyle, background:'#f59e0b', color:'white', width:'100%'}}>حفظ</button><button onClick={()=> setShowCategoryForm(false)} style={{...btnStyle, background:'#6b7280', color:'white', width:'100%'}}>الغاء</button></div></div>}
        {showSubCategoryForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:300}}><div style={{background:'white', padding:'20px', borderRadius:'12px', width:'350px'}}><h3>تصنيف فرعي</h3><select value={subCategoryForm.categoryId} onChange={e=> setSubCategoryForm({...subCategoryForm, categoryId: e.target.value})} style={inputStyle}><option value="">اختر الرئيسي</option>{categories.map(c=> <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select><input placeholder="اسم الفرعي" value={subCategoryForm.name} onChange={e=> setSubCategoryForm({...subCategoryForm, name:e.target.value})} style={inputStyle}/><button onClick={async()=> {if(!subCategoryForm.name ||!subCategoryForm.categoryId) return; await apiFetch(`${API}/subcategories`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name: subCategoryForm.name, categoryId: Number(subCategoryForm.categoryId)})}); setShowSubCategoryForm(false); setSubCategoryForm({name:'', categoryId:'', image:'', id:null}); loadAll()}} style={{...btnStyle, background:'#8b5cf6', color:'white', width:'100%'}}>حفظ</button><button onClick={()=> setShowSubCategoryForm(false)} style={{...btnStyle, background:'#6b7280', color:'white', width:'100%'}}>الغاء</button></div></div>}
        {showProductForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:300}}><div style={{background:'white', padding:'20px', borderRadius:'12px', width:'500px', maxHeight:'90vh', overflowY:'auto'}}><h3>{productForm.id? 'تعديل منتج':'منتج جديد'}</h3><input placeholder="اسم المنتج" value={productForm.name} onChange={e=> setProductForm({...productForm, name:e.target.value})} style={inputStyle}/><input placeholder="رابط الصورة (اختياري)" value={productForm.image} onChange={e=> setProductForm({...productForm, image:e.target.value})} style={inputStyle}/><select value={productForm.subCategoryId} onChange={e=> setProductForm({...productForm, subCategoryId: e.target.value})} style={inputStyle}><option value="">اختر الفرعي</option>{subCategories.map(s=> <option key={s.id} value={String(s.id)}>{s.name}</option>)}</select><div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}><div><b style={{color:'#1e3a8a'}}>💰 B</b>{quantities.map(q=> <div key={q} style={{display:'flex', alignItems:'center', gap:'4px'}}><span style={{width:'40px', fontSize:'12px'}}>{q}</span><input placeholder="0" value={productForm.pricesB[q]||''} onChange={e=> setProductForm({...productForm, pricesB:{...productForm.pricesB, [q]: e.target.value}})} style={{...inputStyle, margin:'4px 0'}}/></div>)}</div><div><b style={{color:'#f59e0b'}}>⭐ VIP</b>{quantities.map(q=> <div key={q} style={{display:'flex', alignItems:'center', gap:'4px'}}><span style={{width:'40px', fontSize:'12px'}}>{q}</span><input placeholder="0" value={productForm.pricesVIP[q]||''} onChange={e=> setProductForm({...productForm, pricesVIP:{...productForm.pricesVIP, [q]: e.target.value}})} style={{...inputStyle, margin:'4px 0'}}/></div>)}</div></div><button onClick={async()=> { const nb={}; const nv={}; quantities.forEach(q=>{nb[q]=Number(productForm.pricesB[q])||0; nv[q]=Number(productForm.pricesVIP[q])||0}); const payload={name: productForm.name, image: productForm.image, subCategoryId: productForm.subCategoryId? Number(productForm.subCategoryId):null, pricesB: nb, pricesVIP: nv}; if(productForm.id){ await apiFetch(`${API}/products/${productForm.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}) } else { await apiFetch(`${API}/products`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}) } setShowProductForm(false); setProductForm({ name: '', categoryId: '', subCategoryId: '', image: '', id: null, pricesB: {1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''}, pricesVIP: {1000:'',2000:'',3000:'',4000:'',5000:'',6000:'',7000:'',8000:'',9000:'',10000:''} }); loadAll()}} style={{...btnStyle, background:'#16a34a', color:'white', width:'100%'}}>💾 حفظ</button><button onClick={()=> setShowProductForm(false)} style={{...btnStyle, background:'#6b7280', color:'white', width:'100%'}}>الغاء</button></div></div>}
        {showEmployeeForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:500}}><div style={{background:'white', padding:'20px', borderRadius:'12px', width:'440px', maxHeight:'90vh', overflowY:'auto'}}><h3 style={{fontWeight:900, textAlign:'center'}}>{employeeForm.id? '✏️ تعديل موظف':'👷 اضافة موظف'}</h3><input placeholder="اسم الموظف" value={employeeForm.name} onChange={e=> setEmployeeForm({...employeeForm, name:e.target.value})} style={inputStyle}/><input placeholder="موبايل 11 رقم" value={employeeForm.phone} maxLength={11} onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,''); if(v.length<=11) setEmployeeForm({...employeeForm, phone:v})}} style={inputStyle}/><div style={{background:'#eff6ff',padding:'10px',borderRadius:'8px',fontSize:'12px',color:'#1e40af'}}>بيانات الموظف وصلاحياته فقط. تفعيل كلمة مرور الموظف سيتم من نظام Supabase Auth لاحقًا، ولا يتم حفظ كلمات المرور كنص عادي.</div><div style={{background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px', margin:'10px 0'}}><div style={{fontWeight:900, marginBottom:'10px'}}>🔐 الصلاحيات:</div>{Object.entries({dashboard:'تحكم', orders:'اوردرات', shipping:'التشغيل', clients:'عملاء', categories:'تصنيفات', products:'منتجات', employees:'موظفين'}).map(([k,l])=> <label key={k} style={{display:'flex', gap:'8px', marginBottom:'8px', cursor:'pointer'}}><input type="checkbox" checked={!!employeeForm.permissions[k]} onChange={e=> setEmployeeForm({...employeeForm, permissions:{...employeeForm.permissions, [k]: e.target.checked}})} /> {l}</label>)}</div><button onClick={async()=> { if(!employeeForm.name ||!employeeForm.phone){ alert('املأ البيانات'); return } const url = employeeForm.id? `${API}/employees/${employeeForm.id}` : `${API}/employees`; const method = employeeForm.id? 'PUT' : 'POST'; await fetch(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(employeeForm)}); setShowEmployeeForm(false); loadAll(); }} style={{width:'100%', padding:'12px', background:'#1e40af', color:'white', borderRadius:'8px', border:'none', fontWeight:900, cursor:'pointer'}}>💾 حفظ</button><button onClick={()=> setShowEmployeeForm(false)} style={{width:'100%', padding:'12px', background:'#6b7280', color:'white', borderRadius:'8px', border:'none', marginTop:'8px', cursor:'pointer'}}>الغاء</button></div></div>}
      </div>
      </>
    )
  }

  return (
    <div className="elmarwa-app" dir="rtl">
      <header className="elmarwa-header" style={{display:'flex',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <button className="elmarwa-brand" onClick={()=>{setSelectedSub(null);setCatalogCategory('all');setCatalogSearch('')}} style={{background:'none',border:'none',padding:0,textAlign:'right'}}><strong>المروة للطباعة</strong><small>معرض المنتجات وإدارة الأوردرات</small></button>
        <div className="elmarwa-header-actions">
          <button style={{...btnStyle, background: cart.length?'#f59e0b':'#94a3b8', color: 'white'}} onClick={() => { if(!loggedClient){ setShowLogin(true); return } if(cart.length) setShowCart(true); else alert('السلة فارغة — اختر منتجاً أولاً') }}>🛒 السلة ({cart.length})</button>
          {!loggedClient? (<><button style={{...btnStyle, background: '#16a34a', color: 'white'}} onClick={() => setShowForm(true)}>تسجيل</button><button style={{...btnStyle, background: 'white', color: '#1e3a8a'}} onClick={() => setShowLogin(true)}>دخول</button></>) : <><span style={{fontSize:'13px', marginLeft:'10px'}}>{loggedClient.name}</span><button style={{...btnStyle, background: myUnread.length>0?'#ef4444':'#f59e0b', color:'white'}} onClick={()=> { setShowMyOrders(true); setNotifications(notifications.map(n=> (String(n.clientId)===String(loggedClient.id) || String(n.clientPhone).replace(/\D/g,'')===String(loggedClient.phone).replace(/\D/g,''))? {...n, read:true}: n))}}>📦 طلباتي ({myOrdersList.length}) {myUnread.length>0? `(${myUnread.length}🔔)`:''}</button><span style={{cursor: 'pointer', marginRight:10, fontSize:'12px'}} onClick={() => {setLoggedClient(null); sessionStorage.removeItem(CUSTOMER_TOKEN_KEY); localStorage.removeItem('loggedClient'); setCart([]); setOrders([]); apiReadPublic('products').then(setProducts).catch(console.error)}}> خروج</span></>}
        </div>
      </header>
      {myUnread.length>0 && loggedClient &&!showMyOrders && <div style={{background:'#fef9c3', border:'2px solid #f59e0b', padding:'10px 15px', margin:'10px', borderRadius:'10px', display:'flex', justifyContent:'space-between'}}><span>🔔 عندك {myUnread.length} تحديث: {myUnread[0]?.msg}</span><button onClick={()=> setShowMyOrders(true)} style={{...btnStyle, background:'#f59e0b', color:'white', fontSize:'12px'}}>عرض</button></div>}
      {loadError && <div style={{padding:'12px',background:'#fee2e2',color:'#991b1b',direction:'rtl'}}>تعذر تحميل البيانات: {loadError}</div>}
      <main className="elmarwa-main">
        {!selectedSub && <>{categories.map(cat => { const catSubs = subCategories.filter(s => Number(s.categoryId) === Number(cat.id)); if(catSubs.length===0) return null; return (<div key={cat.id} style={{marginBottom: '24px'}}><h3 style={{ color: '#1e40af', fontSize:'20px', marginBottom:'10px' }}>{cat.name}</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>{catSubs.map(sub => (<div key={sub.id} onClick={() => setSelectedSub(sub)} style={{ background: 'white', borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', border:'1px solid #dbeafe' }}>{sub.image? <img src={sub.image} style={{width: '100%', height: '130px', objectFit: 'cover'}}/> : <div style={{height:'130px', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center'}}>بدون صورة</div>}<div style={{padding: '10px', textAlign: 'center', fontWeight: 'bold', color:'#1e3a8a'}}>{sub.name}</div></div>))}</div></div>) })}<div style={{marginTop:'18px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}><h2 style={{margin:0,color:'#0f172a'}}>🛍️ كل المنتجات</h2><span style={{background:'#dbeafe',color:'#1e40af',padding:'5px 10px',borderRadius:'15px',fontSize:'12px',fontWeight:'bold'}}>{products.length} منتج</span></div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'14px' }}>{products.map(p=><ProductCard key={p.id} product={p}/>)}</div>{products.length===0&&<div style={{background:'white',padding:'30px',borderRadius:'12px',textAlign:'center'}}>لا توجد منتجات حالياً</div>}</div></>}
        {selectedSub && (<div><button onClick={() => setSelectedSub(null)} style={{...btnStyle, background: '#6b7280', color: 'white'}}>⬅️ رجوع</button><h2>📁 {selectedSub.name}</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop:'15px' }}>{products.filter(p => Number(p.subCategoryId) === Number(selectedSub.id)).map(p => <ProductCard key={p.id} product={p} />)}{products.filter(p => Number(p.subCategoryId) === Number(selectedSub.id)).length===0 && <div style={{background:'white', padding:'30px', borderRadius:'12px', textAlign:'center', color:'#999'}}>لا يوجد منتجات</div>}</div></div>)}
      </main>

      {showMyOrders && <div style={{position:'fixed', inset:0, background:'rgba(15,23,42,0.85)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:400, padding:'10px'}}>
        <div style={{background:'white', width:'95%', maxWidth:'900px', maxHeight:'92vh', borderRadius:'16px', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 25px 50px rgba(0,0,0,0.4)'}}>
          <div style={{background:'#0f172a', color:'white', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:20}}><div style={{fontWeight:900}}>📦 طلباتي - {loggedClient?.name} | مطبعة المروة</div><button onClick={()=> setShowMyOrders(false)} style={{background:'white', color:'#0f172a', border:'none', padding:'7px 16px', fontWeight:900, cursor:'pointer', borderRadius:'20px'}}>X اغلاق</button></div>
          <div style={{padding:'12px', overflowY:'auto', flex:1, background:'#f8fafc'}}>
            {myOrdersList.length===0 && <div style={{padding:'50px', textAlign:'center', color:'#999', background:'white', borderRadius:'12px'}}>لسه معملتش اوردرات</div>}
            {myOrdersList.map(o=> {
              const items = safeItems(o); const paid = Number(o.paidAmount)||0; const total = Number(o.total)||0; const remaining = total - paid; const statusIdx = orderStatuses.indexOf(o.status)
              return (
                <div key={o.id} style={{background:'white', borderRadius:'12px', marginBottom:'14px', border:'1px solid #e2e8f0', overflow:'hidden'}}>
                  <div style={{height:'5px', background: statusColor(o.status)}}></div>
                  <div style={{background:'#000', color:'white', padding:'4px 10px', fontSize:'11px', fontWeight:900, display:'flex', justifyContent:'space-between'}}><span>سيريال: {o.serialNumber||o.id}</span>{o.filePath && <button onClick={()=>downloadOrderFile(o)} style={{background:'white',border:'none',borderRadius:'10px',cursor:'pointer'}}>📎 تحميل PDF</button>}<button onClick={()=> printSticker(o)} style={{background:'white', color:'black', border:'none', padding:'2px 8px', borderRadius:'10px', fontSize:'9px', fontWeight:'bold', cursor:'pointer'}}>🖨️ استيكر 4x2</button></div>
                  <div style={{display:'flex'}}>
                    <div style={{width:'170px', background:'#f8fafc', borderLeft:'1px solid #e2e8f0', padding:'12px', textAlign:'center'}}>
                      <div style={{width:'130px', height:'130px', background:'white', borderRadius:'10px', border:'1px solid #e2e8f0', margin:'0 auto', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center'}}>{(()=>{ const prod = products.find(p=> String(p.id)===String(items[0]?.productId)); const img = items[0]?.image || prod?.image; return img? <img src={img} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : <span style={{fontSize:'11px', color:'#999'}}>صورة العمل</span> })()}</div>
                      <div style={{marginTop:'10px'}}><div style={{fontSize:'11px', fontWeight:'bold'}}>📸 اسكرين التحويل</div>{o.paymentProof? <div style={{background:'#dcfce7', border:'1px solid #16a34a', padding:'6px', borderRadius:'8px', fontSize:'10px', marginTop:'4px', color:'#166534'}}>✅ {o.paymentProof} {o.paymentProofPath && <button onClick={()=>downloadPaymentProof(o)} style={{border:'none',color:'#1e3a8a',background:'transparent',cursor:'pointer'}}>عرض الصورة</button>}</div> : <div style={{fontSize:'10px', color:'#94a3b8', marginTop:'4px'}}>لم يتم الرفع</div>}<label style={{display:'block', marginTop:'6px', background:'#1e3a8a', color:'white', padding:'7px', borderRadius:'8px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>رفع اسكرين<input type="file" accept="image/*" style={{display:'none'}} onChange={async(e)=>{ const file=e.target.files[0]; if(!file) return; await uploadPaymentProof(o, file); }}/></label></div>
                    </div>
                    <div style={{flex:1}}>
                      <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}><tbody>
                        <tr style={{borderBottom:'1px solid #f1f5f9'}}><td style={{padding:'10px 14px', color:'#64748b', width:'100px'}}>اسم العميل</td><td style={{padding:'10px 14px', fontWeight:900}}>{o.clientName}</td></tr><tr style={{borderBottom:'1px solid #f1f5f9', background:'#eef2ff'}}><td style={{padding:'10px 14px', color:'#3730a3',fontWeight:800}}>الشغال</td><td style={{padding:'10px 14px', fontWeight:900, color:'#3730a3'}}>{o.workerName||'لم يتم تحديده'}</td></tr>
                        <tr style={{borderBottom:'1px solid #f1f5f9', background:'#f8fafc'}}><td style={{padding:'10px 14px', color:'#64748b'}}>رقم الطلب</td><td style={{padding:'10px 14px', fontWeight:900}}>#{o.serialNumber||o.id} - {o.date}</td></tr>
                        <tr style={{borderBottom:'1px solid #f1f5f9'}}><td style={{padding:'10px 14px', color:'#64748b'}}>التكلفة</td><td style={{padding:'10px 14px', fontWeight:900, color:'#16a34a', fontSize:'15px'}}>{total} ج</td></tr>
                        <tr style={{borderBottom:'1px solid #f1f5f9', background:'#eff6ff'}}><td style={{padding:'10px 14px', color:'#1e40af',fontWeight:800}}>طريقة الدفع</td><td style={{padding:'10px 14px', fontWeight:900, color:'#1e40af'}}>{o.paymentMethod||'نقدي'}</td></tr><tr style={{borderBottom:'1px solid #f1f5f9', background:'#f0fdf4'}}><td style={{padding:'10px 14px', color:'#64748b'}}>المدفوع</td><td style={{padding:'10px 14px', fontWeight:900, color:'#16a34a'}}>{paid} ج</td></tr>
                        <tr style={{background: remaining>0?'#fef2f2':'#f0fdf4'}}><td style={{padding:'10px 14px', color: remaining>0?'#ef4444':'#16a34a'}}>المتبقي</td><td style={{padding:'10px 14px', fontWeight:900, color: remaining>0?'#ef4444':'#16a34a'}}>{remaining} ج</td></tr>
                      </tbody></table>
                      <div style={{padding:'12px 14px', background:'#eff6ff', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #bfdbfe'}}><span style={{fontSize:'15px', fontWeight:900, color:'#1e3a8a'}}>حالة الطلب</span><span style={{background:statusColor(o.status), color:'white', padding:'7px 16px', borderRadius:'22px', fontSize:'15px', fontWeight:900}}>{o.status}</span></div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'5px',padding:'12px',background:'#f8fafc'}}>{orderStatuses.filter(s=> ['جديد','قيد التنفيذ','قيد الطباعة','جاهز للتسليم'].includes(s)).map((s,i)=> {const active = i <= Math.min(statusIdx,3) && o.status!=='ملغي'; return <div key={s} style={{textAlign:'center'}}><div style={{height:'9px',borderRadius:'6px',background: active? statusColor(s):'#cbd5e1',marginBottom:'6px'}}></div><div style={{fontSize:'12px',fontWeight:900,color: active?'#1e3a8a':'#64748b'}}>{s}</div></div>})}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{padding:'12px', background:'white', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'center', position:'sticky', bottom:0, zIndex:20}}><button onClick={()=> setShowMyOrders(false)} style={{background:'#0f172a', color:'white', border:'none', padding:'10px 30px', borderRadius:'20px', fontWeight:900, cursor:'pointer'}}>اغلاق الصفحة</button></div>
        </div>
      </div>}

      {showCart && cart.length>0 && <div style={{ position: 'fixed', inset:0, background: 'rgba(15,23,42,0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200, padding:'12px' }}><div style={{ background: 'white', padding: '18px', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}><h3 style={{marginTop:0,color:'#1e3a8a'}}>🛒 إرسال الطلب</h3>{cart.map(item => (<div key={item.id} style={{display: 'flex', alignItems:'center', gap:'8px', padding:'9px 0', borderBottom:'1px solid #eee'}}><div style={{width:'45px', height:'45px', borderRadius:'8px', overflow:'hidden', background:'#f1f5f9'}}>{item.image? <img src={item.image} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : null}</div><span style={{flex:1,fontWeight:800,fontSize:'12px'}}>{item.name} - {item.qty}</span><span style={{fontWeight:900}}>{item.total}ج <button onClick={() => setCart(cart.filter(c => c.id!== item.id))} style={{color: 'red', border: 'none', background: 'none', cursor:'pointer'}}>✕</button></span></div>))}<div style={{fontWeight:900,fontSize:'16px',padding:'10px 0'}}>الإجمالي: {cart.reduce((s,i)=>s+i.total,0)}ج</div><div style={{background:'#eff6ff',padding:'10px',borderRadius:'10px',marginBottom:'8px',color:'#1e40af',fontWeight:800}}>العميل: {loggedClient?.name}</div><input placeholder="اسم الشغال (اختياري)" value={orderClientName} onChange={e => setOrderClientName(e.target.value)} style={inputStyle} /><select value={customerPaymentMethod} onChange={e=>setCustomerPaymentMethod(e.target.value)} style={inputStyle}><option value="نقدي">💵 نقدي</option><option value="فودافون كاش">📱 فودافون كاش</option></select><label style={{display:'block',background:'#f8fafc',border:'2px dashed #2563eb',padding:'12px',borderRadius:'10px',fontWeight:900,color:'#1e40af',cursor:'pointer',textAlign:'center'}}>📎 رفع ملف الطلب {orderFile? `✅ ${orderFile.name}`:'(إجباري)'}<input type="file" accept="application/pdf,.pdf" onChange={e => setOrderFile(e.target.files[0])} style={{display:'none'}} /></label><textarea placeholder="ملاحظات الطباعة (اختياري)" value={orderNotes} onChange={e=> setOrderNotes(e.target.value)} style={inputStyle}></textarea><button style={{...btnStyle, background: '#16a34a', color: 'white', width: '100%',margin:'5px 0'}} onClick={handlePlaceOrder} disabled={orderBusy}>{orderBusy ? 'جاري حفظ الطلب...' : 'إرسال الطلب الآن ✅'}</button><button style={{...btnStyle, background: '#64748b', color: 'white', width: '100%',margin:'5px 0'}} onClick={() => setShowCart(false)}>إلغاء</button></div></div>}
      {showForm && <div style={{ position: 'fixed', inset:0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200 }}><div style={{ background: 'white', padding: '20px', borderRadius: '12px', width: '400px' }}><h3>تسجيل جديد</h3><input placeholder="الاسم" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inputStyle} /><input placeholder="الموبايل 11 رقم" value={form.phone} maxLength={11} onChange={e => {const v=e.target.value.replace(/[^0-9]/g,''); if(v.length<=11) setForm({...form, phone: v})}} style={inputStyle} /><input placeholder="الشركة" value={form.company} onChange={e => setForm({...form, company: e.target.value})} style={inputStyle} /><input placeholder="العنوان" value={form.address} onChange={e => setForm({...form, address: e.target.value})} style={inputStyle} /><input placeholder="الباسورد" type="password" autoComplete="new-password" value={form.pass} onChange={e => setForm({...form, pass: e.target.value})} style={inputStyle} />{CAPTCHA_SITE_KEY ? <div ref={turnstileRef} style={{minHeight:'70px',marginTop:'12px'}} /> : <div style={{color:'#b91c1c',padding:'10px'}}>التسجيل غير متاح لحين إعداد الحماية</div>}<button style={{...btnStyle, background: '#16a34a', color: 'white', width: '100%'}} onClick={handleRegister}>تسجيل</button><button style={{...btnStyle, background: '#6b7280', color: 'white', width: '100%'}} onClick={() => setShowForm(false)}>اغلاق</button></div></div>}
      {showVerifyForm && <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:220, padding:'14px'}}>
        <div style={{background:'white', borderRadius:'14px', padding:'22px', width:'100%', maxWidth:'390px'}}>
          <h3>تأكيد رقم الموبايل</h3>
          <p>اكتب رمز التحقق اللي وصلك على رقم {verificationPhone}</p>
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="رمز SMS" maxLength={8} value={verificationCode} onChange={e => setVerificationCode(e.target.value.replace(/\D/g,''))} style={inputStyle} />
          <button onClick={handleVerifyPhone} style={{...btnStyle,background:'#16a34a',color:'white',width:'100%'}}>تأكيد وتفعيل الحساب</button>
          <button onClick={()=>{setShowVerifyForm(false);setVerificationCode('');setShowForm(true)}} style={{...btnStyle,background:'#64748b',color:'white',width:'100%'}}>رجوع للتسجيل</button>
        </div>
      </div>}
      {showLogin && <div style={{ position: 'fixed', inset:0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200 }}><div style={{ background: 'white', padding: '20px', borderRadius: '12px', width: '400px', position:'relative' }}><h3 style={{textAlign:'center'}}>دخول العملاء</h3><input placeholder="موبايل" value={login.phone} onChange={e=> setLogin({...login, phone: e.target.value})} style={inputStyle} /><input placeholder="باسورد" type="password" value={login.pass} onChange={e => setLogin({...login, pass: e.target.value})} style={inputStyle} /><button style={{...btnStyle, background: '#2563eb', color: 'white', width: '100%'}} onClick={handleLogin}>دخول</button><div style={{textAlign:'center', marginTop:'10px'}}><span onClick={()=> alert('برجاء التواصل مع خدمة العملاء\n📞 01000000000')} style={{color:'#2563eb', cursor:'pointer', fontSize:'13px', textDecoration:'underline'}}>نسيت الباسورد؟ برجاء التواصل مع خدمة العملاء</span></div><button style={{...btnStyle, background: '#6b7280', color: 'white', width: '100%', marginTop:'10px'}} onClick={() => setShowLogin(false)}>اغلاق</button><div onClick={()=> {setShowAdminLogin(true); setShowLogin(false)}} style={{position:'absolute', bottom:'8px', left:'8px', width:'22px', height:'22px', background:'#f1f5f9', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:'10px'}}>🔒</div></div></div>}
      {showAdminLogin && <div style={{ position: 'fixed', inset:0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 500 }}><div style={{ background: 'white', padding: '20px', borderRadius: '12px', width: '380px' }}><h3 style={{textAlign:'center'}}>دخول المدير عبر Supabase</h3><input placeholder="البريد الإلكتروني للمدير" value={adminLogin.user} onChange={e => setAdminLogin({...adminLogin, user: e.target.value})} style={inputStyle} /><input placeholder="الباسورد" type="password" value={adminLogin.pass} onChange={e => setAdminLogin({...adminLogin, pass: e.target.value})} style={inputStyle} /><button style={{...btnStyle, background: '#0f172a', color: 'white', width: '100%'}} onClick={handleAdminLogin} disabled={adminBusy}>{adminBusy ? 'جاري التحقق...' : 'دخول'}</button><button style={{...btnStyle, background: '#6b7280', color: 'white', width: '100%'}} onClick={() => {setShowAdminLogin(false); setShowLogin(true)}}>رجوع</button></div></div>}
    </div>
  )
}
