// POST /api/lock — lock or unlock app (admin only)
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error:'Unauthorized' });
  try {
    const { locked, message } = req.body;
    await kv.set('app:locked', locked);
    await kv.set('app:message', message || '');
    res.json({ ok: true, locked });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
