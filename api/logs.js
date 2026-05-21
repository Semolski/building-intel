// GET /api/logs — get recent logs (admin only)
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error:'Unauthorized' });
  try {
    const raw  = await kv.lrange('app:logs', 0, 99);
    const logs = (raw || []).map(l => typeof l === 'string' ? JSON.parse(l) : l);
    res.json({ logs });
  } catch(e) {
    res.json({ logs: [] });
  }
}
