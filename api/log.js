// POST /api/log — log a user access (no auth required)
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { role, lat, lng, accuracy, timestamp, device } = req.body;
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const entry = JSON.stringify({ role, lat, lng, accuracy, timestamp, device, ip, id: Date.now() });
    await kv.lpush('app:logs', entry);
    await kv.ltrim('app:logs', 0, 499); // keep last 500
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false });
  }
}
