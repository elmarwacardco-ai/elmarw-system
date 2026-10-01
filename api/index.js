const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

const DB_FILE = path.join(__dirname, 'db.json')

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const init = { clients: [], categories: [], subcategories: [], products: [], orders: [], employees: [], folders: [] }
      fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2))
      return init
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    if (!data.clients) data.clients = []
    if (!data.categories) data.categories = []
    if (!data.subcategories) data.subcategories = []
    if (!data.products) data.products = []
    if (!data.orders) data.orders = []
    if (!data.employees) data.employees = []
    if (!data.folders) data.folders = []
    return data
  } catch (e) {
    return { clients: [], categories: [], subcategories: [], products: [], orders: [], employees: [], folders: [] }
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

function getNextId(arr) {
  if (!arr || arr.length === 0) return 1
  return Math.max(...arr.map(x => Number(x.id) || 0)) + 1
}

const tables = ['clients', 'categories', 'subcategories', 'products', 'orders', 'employees', 'folders']

tables.forEach(table => {
  app.get(`/api/${table}`, (req, res) => {
    const db = loadDB()
    res.json(db[table] || [])
  })

  app.post(`/api/${table}`, (req, res) => {
    const db = loadDB()
    const newItem = {...req.body, id: getNextId(db[table]) }
    if (table === 'orders') {
      if (newItem.paidAmount === undefined) newItem.paidAmount = 0
      if (!newItem.paymentStatus) newItem.paymentStatus = 'غير مدفوع'
      if (!newItem.paymentMethod) newItem.paymentMethod = 'نقدي'
      if (!newItem.status) newItem.status = 'جديد'
      if (!newItem.paymentProof) newItem.paymentProof = ''
    }
    if (table === 'folders') {
      if (!newItem.date) newItem.date = new Date().toLocaleString('ar-EG')
      if (!newItem.status) newItem.status = 'جديد'
      if (!newItem.orderIds) newItem.orderIds = []
    }
    db[table].push(newItem)
    saveDB(db)
    res.json(newItem)
  })

  app.put(`/api/${table}/:id`, (req, res) => {
    const db = loadDB()
    const id = Number(req.params.id)
    const idx = db[table].findIndex(x => Number(x.id) === id)
    if (idx === -1) return res.status(404).json({ error: 'not found' })
    db[table][idx] = {...db[table][idx],...req.body, id: id }
    if (table === 'orders') {
      const total = Number(db[table][idx].total) || 0
      const paid = Number(db[table][idx].paidAmount) || 0
      if (paid <= 0) db[table][idx].paymentStatus = 'غير مدفوع'
      else if (paid >= total) db[table][idx].paymentStatus = 'مدفوع بالكامل'
      else db[table][idx].paymentStatus = 'مدفوع جزئي'
    }
    saveDB(db)
    res.json(db[table][idx])
  })

  app.delete(`/api/${table}/:id`, (req, res) => {
    const db = loadDB()
    const id = Number(req.params.id)
    db[table] = db[table].filter(x => Number(x.id)!== id)
    saveDB(db)
    res.json({ ok: true })
  })
})

module.exports = app;
if (require.main === module) {
  app.listen(3001, () => console.log('API REAL DB + FOLDERS READY on 3001'))
}
