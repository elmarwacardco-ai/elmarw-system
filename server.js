const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query(`CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(100),
  phone VARCHAR(20),
  customer_type VARCHAR(10),
  details TEXT,
  total NUMERIC(10,2),
  paid NUMERIC(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

app.get('/', (req,res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/api/orders/new', async (req,res) => {
  const result = await pool.query("SELECT * FROM orders WHERE status='new' ORDER BY id DESC");
  res.json(result.rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`elmarw شغال على ${PORT}`));