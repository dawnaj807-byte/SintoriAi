// api/chats.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // BLOKADA CACHOWANIA: Wymusza pobranie aktualnych czatów z Upstash za każdym razem!
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Zmienne zaciągane automatycznie (brak haseł w kodzie)
  const KV_URL = (
    process.env.KV_REST_API_URL || 
    process.env.UPSTASH_REDIS_REST_URL || 
    process.env.STORAGE_REST_API_URL || 
    ""
  ).trim().replace(/\/+$/, '');

  const KV_TOKEN = (
    process.env.KV_REST_API_TOKEN || 
    process.env.UPSTASH_REDIS_REST_TOKEN || 
    process.env.STORAGE_REST_API_TOKEN || 
    ""
  ).trim();

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: "Brak zmiennych Upstash/KV w środowisku Vercel." });
  }

  async function runRedis(commandArray) {
    const response = await fetch(KV_URL, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${KV_TOKEN}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(commandArray)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') try { body = JSON.parse(body); } catch(e) {}

    // POBIERANIE CZATÓW
    if (req.method === 'GET') {
      const { user_id } = req.query;
      if (!user_id) return res.status(400).json({ error: "Brak user_id" });

      const safeKey = "chats_" + String(user_id).trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
      const raw = await runRedis(["GET", safeKey]);
      
      let chats = [];
      if (raw) try { chats = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
      
      return res.status(200).json(Array.isArray(chats) ? chats : []);
    }

    // ZAPISYWANIE CZATU
    if (req.method === 'POST') {
      const { user_id, chat } = body || {};
      if (!user_id || !chat || !chat.id) return res.status(400).json({ error: "Brak danych" });

      const safeKey = "chats_" + String(user_id).trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
      const raw = await runRedis(["GET", safeKey]);
      
      let chats = [];
      if (raw) try { chats = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
      if (!Array.isArray(chats)) chats = [];

      const idx = chats.findIndex(c => c.id === chat.id);
      const updatedChat = { ...chat, updated_at: new Date().toISOString() };

      if (idx >= 0) chats[idx] = updatedChat;
      else chats.unshift(updatedChat);

      chats.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      await runRedis(["SET", safeKey, JSON.stringify(chats)]);
      
      return res.status(200).json({ success: true, chat: updatedChat });
    }

    // USUWANIE CZATU
    if (req.method === 'DELETE') {
      const { user_id, chat_id } = req.query;
      if (!user_id || !chat_id) return res.status(400).json({ error: "Brak danych" });

      const safeKey = "chats_" + String(user_id).trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
      const raw = await runRedis(["GET", safeKey]);
      
      let chats = [];
      if (raw) try { chats = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}

      const filtered = chats.filter(c => c.id !== chat_id);
      await runRedis(["SET", safeKey, JSON.stringify(filtered)]);
      
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Błąd bazy danych" });
  }
}