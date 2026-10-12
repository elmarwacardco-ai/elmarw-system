import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    // /api/categories -> categories
    const path = url.pathname.replace('/api/','').replace('/api','').split('/')[0] || 'categories';
    const key = path.split('?')[0]; // clients, categories, products, etc

    if (req.method === 'GET') {
      const data = await kv.get(key) || [];
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body;
      const list = await kv.get(key) || [];
      const newItem = {
        id: Date.now().toString(),
        _id: Date.now().toString(),
       ...body,
        createdAt: new Date().toISOString()
      };
      list.push(newItem);
      await kv.set(key, list);
      return res.status(200).json(newItem);
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id') || req.query?.id;
      let list = await kv.get(key) || [];
      list = list.filter(i => (i.id||i._id)!= id);
      await kv.set(key, list);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PUT') {
      const body = req.body;
      let list = await kv.get(key) || [];
      list = list.map(i => (i.id||i._id) == (body.id||body._id)? {...i,...body} : i);
      await kv.set(key, list);
      return res.status(200).json({ success: true });
    }

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
