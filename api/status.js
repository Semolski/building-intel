// GET /api/status — returns lock state (public)
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const locked  = await kv.get('app:locked')  || false;
    const message = await kv.get('app:message') || '';
    res.json({ locked, message });
  } catch {
    res.json({ locked: false, message: '' });
  }
}
